// Seated players resume after a dropped session. Host can release a seat.
const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3488;
const CDP = 9491;
const URL = 'http://127.0.0.1:' + PORT;
const DATA = '/tmp/av-seat-' + Date.now();
const OUT = '/opt/cursor/artifacts';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
async function until(f, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await f()) return; await sleep(30); }
  throw new Error('timeout');
}
function applyState(c, st) {
  if (st && st.__d) {
    if (!c.st || c.st.code !== st.code) return;
    const m = { ...c.st };
    for (const k in st) if (k !== '__d' && k !== '__r' && k !== '__g') m[k] = st[k];
    (st.__r || []).forEach(k => delete m[k]);
    if (st.__g) {
      const g = { ...(m.game || {}) };
      for (const k in st.__g) if (k !== '__r') g[k] = st.__g[k];
      (st.__g.__r || []).forEach(k => delete g[k]);
      m.game = g;
    }
    st = m;
  }
  c.st = st;
}
function sock() {
  const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false, query: { diff: '1' } });
  const c = { s, st: null };
  s.on('state', (st) => applyState(c, st));
  c.emit = (e, d) => new Promise(r => s.emit(e, d, r));
  c.act = (t, d) => c.emit('act', { type: t, data: d });
  return c;
}
async function connect(hello) {
  const c = sock();
  await new Promise(r => c.s.on('connect', r));
  c.hello = await c.emit('hello', hello);
  if (c.hello && c.hello.room) await until(() => c.st);
  return c;
}
async function guest(key, name, extra) {
  const res = await fetch(URL + '/api/auth/guest', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guestKey: key, profile: { name, avatar: (extra && extra.avatar) || 'fox', bg: '#fff6ea', fx: 'spot', pendant: (extra && extra.pendant) || 'none' } }),
  });
  const j = await res.json();
  if (!j.user) throw new Error('guest ' + JSON.stringify(j));
  return j;
}
function noRole(st) {
  return st && st.game && !st.game.me && (st.game.seats || []).every(s => s.role == null && s.side == null) && !JSON.stringify(st.game).includes('"role"');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', HOST_AWAY_MS: '600000' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let chrome;
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });

  // ---------- lobby resume + release ----------
  const hostG = await guest('seat-host-key-01', '房主', { pendant: 'crown' });
  const pG = await guest('seat-player-key-02', '回歸', { avatar: 'panda', pendant: 'bow' });
  const qG = await guest('seat-other-key-03', '乙');
  const host = await connect({ token: hostG.token, guestKey: hostG.user.id, name: '房主' });
  const made = await host.emit('create');
  const code = made.room;
  await host.act('capacity', { n: 5 });
  let player = await connect({ token: pG.token, guestKey: pG.user.id, name: '回歸', avatar: 'panda' });
  await player.emit('join', { code });
  assert((await player.act('sit', { seat: 3 })).ok, 'player sits 3');
  assert((await player.act('ready', { ready: true })).ok, 'player ready');
  await until(() => player.st && player.st.mySeat === 3 && player.st.seats.find(s => s.seat === 3 && s.ready));
  const seatBefore = player.st.seats.find(s => s.seat === 3);
  player.s.close();

  // The live client stores the user id where the guest key was, then loses the session token.
  const lost = await connect({ guestKey: pG.user.id, name: '回歸' });
  assert(lost.hello.user && lost.hello.user.id === pG.user.id, 'user id still resolves after the token is gone');
  await lost.emit('join', { code });
  await until(() => lost.st && lost.st.code === code && lost.st.mySeat === 3);
  assert(lost.st.spectating === false && lost.st.mySeat === 3, 'lobby reconnect is the same seat, not a spectator');
  const seatAfter = lost.st.seats.find(s => s.seat === 3);
  assert(seatAfter.name === seatBefore.name && seatAfter.avatar === 'panda' && seatAfter.ready === true, 'name, avatar and ready survive the reconnect');
  const minted = await guest(pG.user.id, '回歸');
  assert(minted.user.id === pG.user.id, 'guest login with the stored user id does not create a second player');
  lost.s.close();
  player = await connect({ token: minted.token, guestKey: pG.user.id, name: '回歸' });
  await until(() => player.st && player.st.mySeat === 3 && player.st.spectating === false);
  assert(true, 'a fresh session token for the same user resumes the lobby seat');

  const other = await connect({ token: qG.token, guestKey: qG.user.id, name: '乙' });
  await other.emit('join', { code });
  await other.act('sit', { seat: 2 });
  await until(() => other.st && other.st.mySeat === 2);
  const denied = await other.act('release', { id: player.st.meId });
  assert(denied.error && /房主/.test(denied.error), 'a non-host cannot release a seat');
  assert(player.st.mySeat === 3, 'rejected release leaves the seat occupied');

  const released = await host.act('release', { id: player.st.meId });
  assert(released.ok, 'host releases a lobby seat');
  await until(() => player.st && player.st.mySeat == null && player.st.seats.find(s => s.seat === 3 && s.empty));
  assert(player.st.spectating === true && player.st.code === code, 'released player stays in the room without a seat');
  assert((await player.act('sit', { seat: 3 })).ok, 'the empty seat can be sat again');
  await until(() => player.st.mySeat === 3 && player.st.spectating === false);

  const self = await host.act('release', { id: host.st.meId });
  assert(self.ok, 'host can release their own lobby seat');
  await until(() => other.st && other.st.isHost && host.st && host.st.mySeat == null);
  assert(other.st.hostId === other.st.meId, 'the room still has a host');
  assert((await host.act('sit', { seat: 1 })).ok, 'the former host can sit an empty seat');

  // ---------- mid-game resume, spectator, release ----------
  const names = ['甲', '乙', '丙', '丁', '戊'];
  const people = [];
  for (let i = 0; i < 5; i++) people.push(await guest('seat-game-' + i + '-key', names[i], { avatar: i === 2 ? 'panda' : 'fox' }));
  const bots = [];
  for (let i = 0; i < 5; i++) {
    const b = await connect({ token: people[i].token, guestKey: people[i].user.id, name: names[i] });
    bots.push(b);
  }
  const room = (await bots[0].emit('create')).room;
  await bots[0].act('capacity', { n: 5 });
  for (let i = 1; i < 5; i++) {
    await bots[i].emit('join', { code: room });
    assert((await bots[i].act('sit', { seat: i + 1 })).ok, 'game sit ' + (i + 1));
  }
  assert((await bots[0].act('start')).ok, 'game started');
  await until(() => bots.every(b => b.st && b.st.game && b.st.game.me && b.st.game.phase === 'team'));
  const g0 = bots[0].st.game;
  const leader = bots.find(b => b.st.meId === g0.leaderId);
  const team = g0.seats.slice(0, g0.teamSizes[0]).map(s => s.id);
  assert((await leader.act('propose', { team })).ok, 'leader proposes');
  await until(() => bots[0].st.game.phase === 'vote');
  const victim = bots[2];
  const before = {
    role: victim.st.game.me.role,
    knows: JSON.stringify(victim.st.game.me.knows),
    seat: victim.st.mySeat,
    id: victim.st.meId,
  };
  assert((await victim.act('vote', { approve: false })).ok, 'victim votes');
  await until(() => victim.st.game.me.voted === true);
  victim.s.close();
  const back = await connect({ guestKey: people[2].user.id, name: '丙' });
  await back.emit('join', { code: room });
  await until(() => back.st && back.st.game && back.st.game.me && back.st.game.phase === 'vote');
  assert(back.st.spectating === false && back.st.mySeat === before.seat, 'mid-game reconnect keeps the seat and is not a spectator');
  assert(back.st.game.me.role === before.role && JSON.stringify(back.st.game.me.knows) === before.knows, 'private role and knowledge are unchanged');
  assert(back.st.game.me.voted === true && back.st.game.me.myVote === false, 'the vote is still theirs');
  assert(back.st.game.seats.every(s => s.role == null), 'reconnect does not put roles on the public seats');

  const strangerG = await guest('seat-never-sat-key', '新人', { avatar: 'cat' });
  const stranger = await connect({ token: strangerG.token, guestKey: strangerG.user.id, name: '新人' });
  const joined = await stranger.emit('join', { code: room });
  await until(() => stranger.st && stranger.st.game);
  assert(joined.spectating === true && stranger.st.spectating === true && stranger.st.mySeat == null, 'a never-seated mid-game joiner is a spectator');
  assert(noRole(stranger.st), 'a spectator does not receive hidden roles');

  const otherBot = bots[1];
  assert((await otherBot.act('release', { id: before.id })).error, 'only the host can release during a game');
  assert((await bots[0].act('release', { id: before.id })).ok, 'host releases the mid-game seat');
  await until(() => bots[0].st.game.seats.find(s => s.id === before.id && s.claimable));
  const pub = bots[0].st.game.seats.find(s => s.id === before.id);
  assert(pub.role == null && pub.side == null && pub.claimable === true, 'released seat keeps no public role');
  await until(() => back.st.spectating === true && !back.st.game.me);
  assert(!back.st.game.me, 'the released player no longer has a private role');
  const again = await connect({ token: people[2].token, guestKey: people[2].user.id, name: '丙' });
  await again.emit('join', { code: room });
  await until(() => again.st && again.st.game);
  assert(again.st.spectating === true && !again.st.game.me, 'after release, coming back does not silently reclaim the role');
  assert(noRole(stranger.st) && stranger.st.game.seats.every(s => s.role == null), 'spectators still see no roles after release');

  assert((await stranger.act('sit', { seat: before.seat })).ok, 'a spectator takes the released seat');
  await until(() => stranger.st.game && stranger.st.game.me && stranger.st.game.me.role === before.role);
  assert(stranger.st.spectating === false && stranger.st.mySeat === before.seat, 'the claimant is seated in that seat');
  assert(stranger.st.meId === before.id, 'the seat keeps its game id');
  assert(stranger.st.game.me.voted === true && stranger.st.game.me.myVote === false, 'the claimant inherits the vote');
  assert(JSON.stringify(stranger.st.game.me.knows) === before.knows, 'the claimant inherits that role\'s private knowledge');
  assert(bots[0].st.game.seats.every(s => s.role == null) && bots[1].st.game.seats.every(s => s.role == null), 'other players still do not see the role');
  const late = await guest('seat-late-claim-key', '後來');
  const lateC = await connect({ token: late.token, guestKey: late.user.id, name: '後來' });
  await lateC.emit('join', { code: room });
  await until(() => lateC.st && lateC.st.game);
  assert((await lateC.act('sit', { seat: before.seat })).error, 'a taken seat cannot be claimed twice');
  assert(noRole(lateC.st), 'the late joiner still has no hidden roles');

  // ---------- host release UI ----------
  function get(url) {
    return new Promise((resolve, reject) => http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject));
  }
  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-seat-' + Date.now(), '--window-size=420,900', URL + '/'], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 15000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  const setSize = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  async function asUser(person) {
    const profile = JSON.stringify({ name: person.name, avatar: 'fox', bg: '#fff6ea', fx: 'spot', pendant: 'none' });
    for (let attempt = 0; attempt < 3; attempt++) {
      await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.guest', ${JSON.stringify(person.guestKey || person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(URL + '/?g=' + Date.now())})`);
      for (let i = 0; i < 40; i++) { if (await evalj(`!!document.querySelector('.rt')`).catch(() => false)) return; await sleep(120); }
    }
    throw new Error('no room');
  }
  const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); };
  async function quiet() {
    for (let i = 0; i < 8; i++) {
      const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`);
      if (!open) return;
      await evalj(`(() => { const b = document.querySelector('#modal #ok'); if (b) b.click(); })()`);
      await sleep(150);
    }
  }
  const boxes = (sel) => evalj(`(() => [...document.querySelectorAll(${JSON.stringify(sel)})].map(e => { const r = e.getBoundingClientRect(); return { l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height }; }))()`);
  const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;

  try {
    await setSize(375, 812);
    const uiHost = { token: people[0].token, user: people[0].user, name: '甲', guestKey: 'seat-game-0-key' };
    await asUser(uiHost);
    await sleep(500);
    await quiet();
    await evalj(`window.confirm = () => { window.__usedConfirm = true; return false; }; window.__usedConfirm = false;`);
    assert(await evalj(`!!document.querySelector('[data-a="releaselist"]')`), 'the host sees 釋出座位 on the table');
    const faces = await boxes('.rt .av');
    const btn = (await boxes('[data-a="releaselist"]'))[0];
    assert(btn && faces.length && faces.every(f => !hit(btn, f)), 'the release control does not cover a face');
    await evalj(`document.querySelector('[data-a="releaselist"]').scrollIntoView({ block: 'center' }); document.querySelector('[data-a="releaselist"]').click()`);
    await until(async () => evalj(`!!document.querySelector('#rel-list-title')`));
    const targetName = names[3];
    await evalj(`(() => { const b = [...document.querySelectorAll('.pick-i')].find(x => x.textContent.includes(${JSON.stringify(targetName)})); if (!b) throw new Error('no player'); b.click(); })()`);
    await until(async () => evalj(`!!document.querySelector('#rel-title')`));
    const dialog = await evalj(`(() => { const el = document.querySelector('#actconf'); const sheet = document.querySelector('.sheet'); const cs = getComputedStyle(sheet); const r = el.getBoundingClientRect(); return { text: el.innerText, pad: cs.paddingBottom, bottom: r.bottom, h: innerHeight, w: document.documentElement.clientWidth }; })()`);
    assert(dialog.text.includes('釋出座位') && dialog.text.includes(targetName), 'confirmation names the seat and asks to release it');
    assert(!dialog.text.includes('梅林') && !dialog.text.includes('刺客') && !dialog.text.includes('莫甘娜'), 'the confirm card does not reveal a role');
    assert(await evalj(`window.__usedConfirm !== true`), 'release does not use window.confirm');
    assert(dialog.w === 375 && dialog.bottom <= dialog.h + 1, 'the confirm card fits a 375-wide screen');
    const safe = await evalj(`(() => { for (const ss of document.styleSheets) { let rules; try { rules = [...ss.cssRules]; } catch { continue; } if (rules.some(r => /actconf/.test(r.selectorText || '') && /safe-area-inset-bottom/.test(r.cssText))) return true; } return false; })()`);
    assert(safe && parseFloat(dialog.pad) >= 28, 'the confirm sheet keeps a safe-area inset');
    await shot('release-375.png');
    await setSize(390, 844);
    await sleep(80);
    const wide = await evalj(`document.documentElement.clientWidth`);
    assert(wide === 390, 'resized to 390');
    await shot('release-390.png');
    await evalj(`document.querySelector('#rel-cancel').click()`);
    await until(async () => evalj(`document.querySelector('#modal').classList.contains('hidden')`));
    assert(bots[3].st.mySeat === 4, 'cancel does not release the seat');

    await asUser({ token: people[1].token, user: people[1].user, name: '乙', guestKey: 'seat-game-1-key' });
    assert(await evalj(`!document.querySelector('[data-a="releaselist"]')`), 'a non-host has no release control');
    console.log('SEAT RESUME TESTS PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
  }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
