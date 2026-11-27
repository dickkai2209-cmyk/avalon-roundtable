// A player who steps out of a live game must get back into the same room
// with the same seat, and an expired token must not mint an empty account.
const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3620 + (process.pid % 80);
const CDP = 9700 + (process.pid % 200);
const URL = 'http://127.0.0.1:' + PORT;
const DATA = '/tmp/av-rejoin-' + process.pid;
const OUT = '/opt/cursor/artifacts';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
async function until(f, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await f()) return; await sleep(30); }
  throw new Error('timeout');
}

let srv;
function startServer() {
  srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', HOST_AWAY_MS: '600000', KEEPALIVE: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', (d) => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });
}
function stopServer() {
  if (!srv) return Promise.resolve();
  const proc = srv;
  srv = null;
  proc.kill('SIGTERM');
  return new Promise((res) => {
    const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (e) {} res(); }, 5000);
    proc.on('exit', () => { clearTimeout(t); res(); });
  });
}
function sock() {
  const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c = { s, st: null };
  s.on('state', (st) => { c.st = st; });
  c.emit = (e, d) => new Promise((r) => s.emit(e, d, r));
  c.act = (t, d) => c.emit('act', { type: t, data: d });
  return c;
}
async function connect(hello) {
  const c = sock();
  await new Promise((r) => c.s.on('connect', r));
  c.hello = await c.emit('hello', hello);
  if (c.hello && c.hello.room) await until(() => c.st && c.st.code === c.hello.room);
  return c;
}
async function guest(key, name, extra) {
  const profile = { name, avatar: (extra && extra.avatar) || 'fox', bg: '#fff6ea', fx: 'spot', pendant: (extra && extra.pendant) || 'none', ...(extra && extra.skins ? { skins: extra.skins } : {}) };
  const res = await fetch(URL + '/api/auth/guest', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guestKey: key, userId: extra && extra.userId, profile }),
  });
  const j = await res.json();
  if (!j.user) throw new Error('guest ' + JSON.stringify(j));
  j.guestKey = key;
  return j;
}
function readDb() { return JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8')); }

(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  await startServer();
  const stopAll = () => { try { srv && srv.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', stopAll);

  const html = await fetch(URL + '/').then((r) => r.text());
  assert(html.includes('/app.js?v=84') && html.includes('/style.css?v=84'), 'cache bumped past main (app 84, css 84)');

  const key = 'rejoin-guest-key-01';
  const made = await guest(key, '回歸', { avatar: 'panda', pendant: 'bow' });
  const put = await fetch(URL + '/api/me', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + made.token },
    body: JSON.stringify({ skins: { merlin: 'noir' } }),
  }).then((r) => r.json());
  assert(put.user && put.user.skins && put.user.skins.merlin === 'noir', 'skins save on the original account');
  await sleep(300);
  await stopServer();
  const seeded = readDb();
  seeded.stats[made.user.id] = { played: 7, won: 4, mvp: 1, roles: { merlin: { played: 2, won: 1 } } };
  fs.writeFileSync(path.join(DATA, 'db.json'), JSON.stringify(seeded));
  await startServer();

  const usersBefore = readDb().users.length;
  const byId = await guest(made.user.id, '空帳號', { avatar: 'fox', pendant: 'none' });
  assert(byId.user.id === made.user.id, 'guest key that is the user id restores that account');
  assert(byId.user.name === '回歸' && byId.user.avatar === 'panda' && byId.user.pendant === 'bow', 'name, avatar and pendant are not replaced');
  assert(byId.user.skins && byId.user.skins.merlin === 'noir', 'skins survive a tokenless guest login');
  assert(byId.stats && byId.stats.played === 7 && byId.stats.won === 4, 'stats are the original account, not a 0-game user');
  const freshKey = 'rejoin-brand-new-key-99';
  const hijack = await guest(freshKey, '陌生人', { avatar: 'cat', pendant: 'crown', userId: made.user.id });
  assert(hijack.user.id === made.user.id && hijack.user.name === '回歸' && hijack.stats.played === 7, 'a new guest key plus the stored user id does not create a second account');
  const stray = await guest('rejoin-empty-stray-22', '空帳');
  assert(stray.user.id !== made.user.id, 'a lone unused guest key can still open a new account');
  const reclaim = await guest('rejoin-empty-stray-22', '再空', { userId: made.user.id });
  assert(reclaim.user.id === made.user.id && reclaim.user.name === '回歸' && reclaim.stats.played === 7, 'an existing stray guest key plus the stored user id still returns the original account');
  const regName = 'rj' + Math.random().toString(36).slice(2, 6);
  const reg = await fetch(URL + '/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + byId.token },
    body: JSON.stringify({ username: regName, password: '2468', guestKey: key }),
  }).then((r) => r.json());
  assert(reg.user && reg.user.id === made.user.id && reg.user.username === regName && !reg.user.guest, 'register still upgrades the same guest');
  const login = await fetch(URL + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: regName, password: '2468' }),
  }).then((r) => r.json());
  assert(login.user && login.user.id === made.user.id && login.token, 'login still returns the same account');

  const names = ['甲', '乙', '丙', '丁', '戊'];
  const people = [made];
  for (let i = 1; i < 5; i++) people.push(await guest('rejoin-seat-' + i + '-key', names[i], { avatar: 'fox' }));
  const ident = () => ({ token: 'not-a-session', guestKey: freshKey, userId: made.user.id, name: '回歸' });
  const bots = [];
  for (let i = 0; i < 5; i++) {
    const hello = i === 0 ? ident() : { token: people[i].token, guestKey: people[i].guestKey, name: names[i] };
    bots.push(await connect(hello));
  }
  assert(bots[0].hello.user.id === made.user.id, 'socket hello with a bad token still binds the original user');
  const code = (await bots[0].emit('create')).room;
  await bots[0].act('capacity', { n: 5 });
  for (let i = 1; i < 5; i++) {
    await bots[i].emit('join', { code });
    assert((await bots[i].act('sit', { seat: i + 1 })).ok, 'sit ' + (i + 1));
  }
  assert((await bots[0].act('start')).ok, 'game started');
  await until(() => bots.every((b) => b.st && b.st.game && b.st.game.me && b.st.game.phase === 'team'));
  const hero = bots[2];
  const before = { role: hero.st.game.me.role, seat: hero.st.mySeat, knows: JSON.stringify(hero.st.game.me.knows), id: hero.st.meId };
  const heroHello = { token: 'expired', guestKey: people[2].user.id, userId: people[2].user.id, name: '丙' };

  const left = await hero.emit('leave');
  assert(left.stillSeated === true && left.room === code, 'mid-game leave keeps the seat and tells the client which room');
  hero.st = null;
  const blocked = await hero.emit('create');
  assert(blocked.error && /你正在另一局遊戲中/.test(blocked.error) && blocked.room === code && blocked.stillSeated, 'create is blocked but names the room to return to');
  const elsewhere = await bots[0].emit('create');
  assert(elsewhere.error && elsewhere.room === code, 'a seated host cannot open a second room either');
  const wrong = await hero.emit('join', { code: 'ZZZZ' });
  assert(wrong.error && /找不到|你正在另一局/.test(wrong.error), 'a missing room does not clear the reserved seat');
  const outsider = await guest('rejoin-outsider-key', '外人');
  const outC = await connect({ token: outsider.token, guestKey: outsider.guestKey, name: '外人' });
  const outRoom = (await outC.emit('create')).room;
  const denied = await hero.emit('join', { code: outRoom });
  assert(denied.error && /你正在另一局遊戲中/.test(denied.error) && denied.room === code && denied.stillSeated, 'joining another room is blocked and still points home');
  const backHello = await hero.emit('hello', heroHello);
  assert(backHello.room === code && backHello.seated === true && backHello.spectating === false, 'hello puts the reserved player back in the room, not as a spectator');
  assert(backHello.user.id === people[2].user.id, 'hello keeps the same user id');
  await until(() => hero.st && hero.st.game && hero.st.game.me && hero.st.mySeat === before.seat && hero.st.spectating === false);
  assert(hero.st.game.me.role === before.role && JSON.stringify(hero.st.game.me.knows) === before.knows, 'hello restores the private role without a separate join');

  hero.st = null;
  const left2 = await hero.emit('leave');
  assert(left2.stillSeated && left2.room === code, 'leaving again still reserves the seat');
  const rejoined = await hero.emit('join', { code });
  assert(rejoined.room === code && rejoined.spectating === false && rejoined.seated === true, 'joining the same code reclaims the seat');
  await until(() => hero.st && hero.st.spectating === false && hero.st.mySeat === before.seat && hero.st.game && hero.st.game.me && hero.st.game.me.role === before.role);
  assert(hero.st.meId === before.id, 'the seat id is unchanged');

  const stranger = await connect({ token: outsider.token, guestKey: outsider.guestKey, name: '外人' });
  await stranger.emit('join', { code: outRoom });
  const watched = await stranger.emit('join', { code });
  await until(() => stranger.st && stranger.st.code === code && stranger.st.game);
  assert(watched.spectating === true && stranger.st.spectating === true && stranger.st.mySeat == null && !stranger.st.game.me, 'a never-seated joiner still spectates');

  const leaver = bots[4];
  const releasedSeat = leaver.st.mySeat;
  const abandoned = await leaver.emit('leave', { abandon: true });
  assert(abandoned.abandoned === true, 'abandon is an explicit give-up');
  const freed = await leaver.emit('create');
  assert(freed.room && freed.room !== code, 'after abandoning, create is no longer blocked');
  await until(() => bots[0].st.game.seats.find((s) => s.seat === releasedSeat && s.claimable));
  const again = await connect({ token: people[4].token, guestKey: people[4].guestKey, name: '戊' });
  const spec = await again.emit('join', { code });
  await until(() => again.st && again.st.code === code && again.st.game);
  assert(spec.spectating === true && again.st.spectating === true && !again.st.game.me, 'abandoning does not silently restore the role on rejoin');

  // Home / return path in the real client: hello opens the room, 返回房間 comes back, abandon unlocks create.
  const pageUser = people[1];
  let chrome;
  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-rejoin-' + process.pid, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  const stopChrome = () => { try { chrome && chrome.kill('SIGKILL'); } catch (e) {} };
  function getText(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
    });
  }
  let tab;
  for (let i = 0; i < 40 && !tab; i++) {
    try { tab = JSON.parse(await getText('http://127.0.0.1:' + CDP + '/json/list')).find((t) => t.type === 'page'); } catch (e) { await sleep(120); }
  }
  if (!tab) { stopChrome(); throw new Error('no chrome'); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 15000);
    pending.set(i, (v) => { clearTimeout(t); res(v); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evalj = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  const profile = JSON.stringify({ name: '乙', avatar: 'fox', bg: '#fff6ea', fx: 'spot', pendant: 'none' });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('cc.token', ${JSON.stringify(pageUser.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(pageUser.user.id)}); localStorage.setItem('cc.guest', ${JSON.stringify(pageUser.guestKey)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)});` });
  await send('Page.navigate', { url: URL + '/' });
  const sawRoom = await evalj(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { if (document.querySelector('.myrole-fab')) { clearInterval(t); r(1);} else if (Date.now()-t0>12000) { clearInterval(t); r(0);} }, 50); })`);
  if (!sawRoom) throw new Error('room did not open ' + await evalj(`(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,240)`));
  const opened = await evalj(`({ spec: !!document.querySelector('[data-spec="live"]'), create: !!document.querySelector('[data-a="create"]'), fab: !!document.querySelector('.myrole-fab') })`);
  assert(opened.fab && !opened.spec && !opened.create, 'hello after load opens the reserved seat, not home and not spectate');
  await evalj(`document.querySelector('[data-a="menu"]').click()`);
  await until(async () => evalj(`!!document.querySelector('.room-menu [data-x="home"]')`));
  await evalj(`document.querySelector('.room-menu [data-x="home"]').click()`);
  await until(async () => evalj(`!!document.querySelector('[data-a="toroom"]')`));
  const home = await evalj(`({ text: document.body.innerText, back: document.querySelector('[data-a="toroom"]').textContent, abandon: !!document.querySelector('[data-a="abandonseat"]'), create: !!document.querySelector('[data-a="create"]') })`);
  assert(home.back === '返回房間' && /你的座位仍然保留/.test(home.text) && home.abandon && !home.create, 'home shows 返回房間 instead of only blocking a new room');
  await evalj(`document.querySelector('[data-a="toroom"]').click()`);
  await until(async () => evalj(`!!document.querySelector('.myrole-fab')`));
  assert(await evalj(`!document.querySelector('[data-spec="live"]')`), '返回房間 restores the table, not a spectator view');
  await evalj(`document.querySelector('[data-a="menu"]').click()`);
  await until(async () => evalj(`!!document.querySelector('.room-menu [data-x="home"]')`));
  await evalj(`document.querySelector('.room-menu [data-x="home"]').click()`);
  await until(async () => evalj(`!!document.querySelector('[data-a="abandonseat"]')`));
  await evalj(`document.querySelector('[data-a="abandonseat"]').click()`);
  await until(async () => evalj(`!!document.querySelector('#ab-yes')`));
  await evalj(`document.querySelector('#ab-yes').click()`);
  await until(async () => evalj(`!!document.querySelector('[data-a="create"]')`));
  assert(await evalj(`!document.querySelector('[data-a="toroom"]')`), 'abandoning clears the reserved-room card so they are not stuck');
  try { ws.close(); } catch (e) {}
  stopChrome();

  const role = before.role;
  const seat = before.seat;
  bots.forEach((b) => { try { b.s.close(); } catch (e) {} });
  try { outC.s.close(); } catch (e) {}
  try { stranger.s.close(); } catch (e) {}
  try { again.s.close(); } catch (e) {}
  try { leaver.s.close(); } catch (e) {}
  await sleep(400);
  await stopServer();
  const snap = readDb();
  const saved = snap.rooms[code];
  assert(saved && saved.game && saved.game.seats.some((s) => s && s.pid === people[2].user.id), 'the live room was saved with the seated pid');
  saved.members = {};
  saved.seats = saved.seats.map(() => null);
  saved.watchers = { [people[2].user.id]: { name: '觀戰', avatar: 'cat' } };
  fs.writeFileSync(path.join(DATA, 'db.json'), JSON.stringify(snap));
  await startServer();
  const restored = await connect({ token: 'nope', guestKey: people[2].user.id, name: '丙' });
  assert(restored.hello.room === code && restored.hello.seated === true && restored.hello.spectating === false, 'reload still knows the seated player');
  await until(() => restored.st && restored.st.game && restored.st.game.me && restored.st.mySeat === seat && restored.st.spectating === false);
  assert(restored.st.game.me.role === role, 'the restored seat keeps the role and is not a spectator');
  assert(restored.hello.user.id === people[2].user.id && restored.hello.user.name === '丙', 'reload does not mint a new identity');
  const dbAfter = readDb();
  assert(!dbAfter.users.some((u) => u.guest_key === freshKey), 'the stray guest key was not stored as a new player');
  assert(dbAfter.users.filter((u) => u.id === made.user.id).length === 1, 'the original account is still a single row');
  assert(dbAfter.stats[made.user.id].played === 7, 'stats are still on the original account after restart');
  assert(usersBefore >= 1, 'the database had the original user before the extra logins');
  restored.s.close();
  await stopServer();
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log('REJOIN TESTS PASSED');
})().catch(async (e) => {
  console.error('FAILED', e);
  try { await stopServer(); } catch (err) {}
  process.exit(1);
});
