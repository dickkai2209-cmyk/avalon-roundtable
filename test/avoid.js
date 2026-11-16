// Pregame 迴避卡: confirm does not debit; start debits once only when the choice holds.
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const { resolveAvoidance } = require('../rules');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(f, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await f()) return; await sleep(30); }
  throw new Error('timeout');
}
const sameBag = (a, b) => {
  const s = (xs) => xs.slice().sort().join(',');
  return s(a) === s(b);
};

function unit() {
  const roles = ['merlin', 'percival', 'servant', 'morgana', 'assassin'];
  const none = resolveAvoidance([null, null, null, null, null], roles);
  assert(none.assign.join() === roles.join() && none.result.every(r => r.status === 'none'), 'no choice leaves the deal untouched');

  const lucky = resolveAvoidance(['merlin', null, null, null, null], ['percival', 'merlin', 'servant', 'morgana', 'assassin']);
  assert(lucky.result[0].status === 'applied' && lucky.assign[0] !== 'merlin' && sameBag(lucky.assign, ['percival', 'merlin', 'servant', 'morgana', 'assassin']), 'a held choice keeps that role off the player');

  const forced = resolveAvoidance(['merlin', null, null, null, null], ['merlin', 'percival', 'servant', 'morgana', 'assassin']);
  assert(forced.result[0].status === 'applied' && forced.assign[0] !== 'merlin' && sameBag(forced.assign, roles), 'a drawn avoided role is swapped away');

  const inactive = resolveAvoidance(['oberon', null, null, null, null], roles);
  assert(inactive.result[0].status === 'inactive' && inactive.assign.join() === roles.join(), 'a role outside the deal is inactive and does not move cards');

  const all = resolveAvoidance(['merlin', 'merlin', 'merlin', 'merlin', 'merlin'], roles);
  const holders = all.assign.map((r, i) => r === 'merlin' ? i : -1).filter(i => i >= 0);
  assert(holders.length === 1 && all.result[holders[0]].status === 'conflict', 'the one player who must keep Merlin is a conflict');
  assert(all.result.filter(r => r.status === 'applied').length === 4 && sameBag(all.assign, roles), 'everyone else is protected');

  const dead = resolveAvoidance(['assassin', 'assassin'], ['assassin', 'servant']);
  assert(dead.assign.join() === 'assassin,servant' && dead.result[0].status === 'conflict' && dead.result[1].status === 'applied', 'a unique role with no legal swap stays put');
}

async function boot(port, extra = {}) {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: require('path').join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATABASE_URL: '', PURGE_TEST_DATA: '0', ...extra },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });
  return srv;
}

function client(url, name, pid) {
  pid = pid || ('av' + name + Math.random().toString(36).slice(2, 8));
  const c = { pid, name, st: null, s: null };
  const bind = (s) => {
    c.s = s;
    s.on('state', st => { c.st = st; });
    c.emit = (e, d) => new Promise(r => s.emit(e, d, r));
    c.act = (t, d) => c.emit('act', { type: t, data: d });
  };
  bind(io(url, { transports: ['websocket'], forceNew: true }));
  c.ready = new Promise(r => c.s.on('connect', r)).then(() => c.emit('hello', { pid, name }));
  c.reconnect = async () => {
    c.s.close();
    const s = io(url, { transports: ['websocket'], forceNew: true });
    bind(s);
    await new Promise(r => s.on('connect', r));
    await c.emit('hello', { pid, name });
  };
  return c;
}

async function fill(url, n, tag) {
  const cs = [];
  for (let i = 0; i < n; i++) cs.push(client(url, tag + i));
  for (const c of cs) await c.ready;
  const { room } = await cs[0].emit('create');
  await until(() => cs[0].st && cs[0].st.capacity);
  if (n !== 8) await cs[0].act('capacity', { n });
  for (let i = 1; i < n; i++) {
    await cs[i].emit('join', { code: room });
    assert((await cs[i].act('sit', { seat: i + 1 })).ok, tag + ' seat ' + (i + 1));
  }
  await until(() => cs[0].st.seated === n && cs[0].st.capacity === n);
  return { cs, room };
}

(async () => {
  unit();
  const PORT = 3261;
  const URL = 'http://127.0.0.1:' + PORT;
  const srv = await boot(PORT, { DATA_DIR: '/tmp/avoid-' + Date.now() });
  try {
    const { cs, room } = await fill(URL, 5, 'v');
    const spec = client(URL, 'spec');
    await spec.ready;
    await spec.emit('join', { code: room });
    await until(() => spec.st && spec.st.code === room);
    const host = cs[0];
    const before = host.st.myVetoCards;
    assert(before === 1, 'a new player starts with 1 card');
    assert((await host.act('avoid', { role: 'merlin' })).ok, 'confirming a role does not require the game to be running');
    await until(() => host.st.myAvoid === 'merlin');
    assert(host.st.myVetoCards === 1, 'confirming does not debit');
    assert(!spec.st.myAvoid && !cs[1].st.myAvoid, 'the choice is not visible to a spectator or another player');
    assert(!JSON.stringify(spec.st.seats).includes('"avoid"') && !JSON.stringify(cs[1].st.game || {}).includes('myAvoid'), 'seat payloads do not carry the private choice');
    const other = cs[2];
    assert((await other.act('avoid', { role: 'percival' })).ok, 'second player can choose');
    assert((await other.act('avoid', { role: '' })).ok, 'cancel clears the choice');
    await until(() => other.st.myAvoid == null);
    assert(other.st.myVetoCards === 1, 'cancel does not debit');
    await host.reconnect();
    await until(() => host.st && host.st.myAvoid === 'merlin' && host.st.myVetoCards === 1);
    assert(true, 'reconnect keeps the uncharged choice');
    assert((await host.act('start')).ok, 'host starts');
    await until(() => host.st.game && host.st.game.me);
    const me = host.st.game.me;
    assert(me.role !== 'merlin' && host.st.myAvoidResult && host.st.myAvoidResult.status === 'applied', 'valid avoidance is applied (' + me.role + ')');
    assert(host.st.myVetoCards === 0 && host.st.myAvoid == null, 'one card is debited at start and the choice is spent');
    assert(!spec.st.myAvoidResult && !cs[1].st.myAvoidResult, 'the outcome stays on the choosing player');
    const again = await host.act('start');
    assert(again.error, 'a second start is rejected');
    await sleep(200);
    assert(host.st.myVetoCards === 0, 'a duplicate start does not debit again');
    await host.reconnect();
    await until(() => host.st && host.st.game && host.st.myVetoCards === 0);
    assert(true, 'reconnect after start does not debit again');
    cs.forEach(c => c.s.close()); spec.s.close();

    const inactive = await fill(URL, 5, 'in');
    assert((await inactive.cs[0].act('avoid', { role: 'oberon' })).ok, 'a role outside this preset can be stored');
    const held = inactive.cs[0].st.myVetoCards;
    assert((await inactive.cs[0].act('start')).ok, 'inactive game starts');
    await until(() => inactive.cs[0].st.myAvoidResult && inactive.cs[0].st.myAvoidResult.status === 'inactive');
    assert(inactive.cs[0].st.myVetoCards === held, 'an inactive choice is not charged');
    inactive.cs.forEach(c => c.s.close());

    const clash = await fill(URL, 5, 'cf');
    for (const c of clash.cs) assert((await c.act('avoid', { role: 'merlin' })).ok, 'everyone avoids Merlin');
    assert((await clash.cs[0].act('start')).ok, 'conflict game starts');
    await until(() => clash.cs.every(c => c.st.game && c.st.game.me && c.st.myAvoidResult));
    const merlin = clash.cs.filter(c => c.st.game.me.role === 'merlin');
    assert(merlin.length === 1 && merlin[0].st.myAvoidResult.status === 'conflict' && merlin[0].st.myVetoCards === 1, 'the player who still drew Merlin is not charged');
    const safe = clash.cs.filter(c => c.st.game.me.role !== 'merlin');
    assert(safe.length === 4 && safe.every(c => c.st.myAvoidResult.status === 'applied' && c.st.myVetoCards === 0), 'the other four holds are charged once');
    clash.cs.forEach(c => c.s.close());

    const poor = await fill(URL, 5, 'po');
    await poor.cs[0].act('settings', { veto: true });
    assert((await poor.cs[0].act('start')).ok, 'veto game starts');
    await until(() => poor.cs[0].st.game && poor.cs[0].st.game.phase === 'team');
    const g = poor.cs[0].st.game;
    const leader = poor.cs.find(c => c.st.meId === g.leaderId);
    const member = poor.cs.find(c => c.st.meId !== g.leaderId);
    const team = [g.leaderId, member.st.meId];
    assert((await leader.act('propose', { team })).ok, 'team proposed');
    await until(() => member.st.game.phase === 'vote');
    assert((await member.act('veto')).ok, 'member spends their only veto card');
    await until(() => member.st.myVetoCards === 0);
    assert((await poor.cs[0].act('abort')).ok, 'back to the lobby');
    await until(() => !member.st.game);
    const denied = await member.act('avoid', { role: 'merlin' });
    assert(denied.error && /沒有迴避卡/.test(denied.error), 'no cards means the choice is refused');
    assert(member.st.myAvoid == null && member.st.myVetoCards === 0, 'a refused choice is not stored and not charged');
    poor.cs.forEach(c => c.s.close());
  } finally {
    srv.kill('SIGKILL');
  }

  const fs = require('fs');
  const path = require('path');
  const DATA = '/tmp/avoid-gm-' + Date.now();
  fs.mkdirSync(DATA, { recursive: true });
  process.env.DATA_DIR = DATA;
  process.env.DATABASE_URL = '';
  delete require.cache[require.resolve('../db')];
  const db = require('../db');
  await db.init();
  const gmUser = await db.createGuest({ guestKey: 'gmavoidkey123456', name: 'GM測' });
  db.flush();
  const gport = 3262;
  const gsrv = await boot(gport, { DATA_DIR: DATA, GM_USER_ID: gmUser.id });
  try {
    const GURL = 'http://127.0.0.1:' + gport;
    const gm = client(GURL, 'gm', 'gmavoidkey123456');
    await gm.ready;
    const others = [];
    for (let i = 0; i < 4; i++) { const c = client(GURL, 'g' + i); await c.ready; others.push(c); }
    const { room } = await gm.emit('create');
    await until(() => gm.st && gm.st.myVetoCards === 999);
    assert(gm.st.myVetoCards === 999, 'GM inventory shows unlimited');
    await gm.act('capacity', { n: 5 });
    for (let i = 0; i < 4; i++) { await others[i].emit('join', { code: room }); await others[i].act('sit', { seat: i + 2 }); }
    await until(() => gm.st.seated === 5);
    assert((await gm.act('avoid', { role: 'merlin' })).ok, 'GM can confirm');
    assert(gm.st.myVetoCards === 999, 'opening the choice does not decrement GM');
    assert((await gm.act('start')).ok, 'GM game starts');
    await until(() => gm.st.game && gm.st.game.me);
    assert(gm.st.game.me.role !== 'merlin' && gm.st.myAvoidResult.status === 'applied', 'GM avoidance is applied');
    assert(gm.st.myVetoCards === 999, 'GM inventory stays unlimited after a successful avoidance');
    const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
    const row = saved.users.find(u => u.id === gmUser.id);
    assert(row && row.veto_cards === 1, 'GM stored card count is not decremented');
    gm.s.close(); others.forEach(c => c.s.close());
  } finally {
    gsrv.kill('SIGKILL');
  }
  console.log('AVOID TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });
