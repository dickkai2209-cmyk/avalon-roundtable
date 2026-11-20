// GM-only 搶房主. The server authenticates the verified Google GM.
// A client flag, another Google account, a guest, or the current host cannot seize.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3477;
const CDP = 9497;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/seize-host-' + Date.now();
const OUT = '/opt/cursor/artifacts';
const GM_EMAIL = 'dickkai2209@gmail.com';
const DENY = '你沒有搶房主的權限';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await sleep(30); }
  throw new Error('timeout');
}
function get(url) {
  return new Promise((resolve, reject) => http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject));
}
function hidden(st) {
  const g = st && st.game;
  return JSON.stringify({
    phase: g && g.phase, round: g && g.round, leaderId: g && g.leaderId,
    team: g && g.team, voted: g && g.voted, rejects: g && g.rejects, quests: g && g.quests,
    winner: g && g.winner, reason: g && g.reason,
    me: g && g.me ? { role: g.me.role, side: g.me.side, knows: g.me.knows, myVote: g.me.myVote, voted: g.me.voted } : null,
    seats: ((g && g.seats) || []).map(s => ({ id: s.id, name: s.name, role: s.role || null, side: s.side || null })),
    room: (st.seats || []).map(s => (s && !s.empty ? s.id : null)),
    mySeat: st.mySeat,
  });
}
function leaked(st) {
  return /dickkai2209|google_sub|gmail|"gm"\s*:/i.test(JSON.stringify(st));
}
function bot(token, guestKey, name, extra) {
  const s = io(APP, { transports: ['websocket'], forceNew: true });
  const c = { s, st: null, name, token, guestKey };
  s.on('state', st => { c.st = st; });
  c.emit = (ev, d) => new Promise(r => s.emit(ev, d, r));
  c.act = (type, data) => c.emit('act', { type, data });
  c.ready = new Promise((res, rej) => s.on('connect', async () => {
    const h = await c.emit('hello', { token, guestKey, name, ...(extra || {}) });
    c.hello = h;
    if (!h || h.error) rej(new Error((h && h.error) || 'hello')); else res(h);
  }));
  return c;
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  process.env.DATA_DIR = DATA;
  process.env.DATABASE_URL = '';
  delete require.cache[require.resolve('../db')];
  const db = require('../db');
  await db.init();
  const hostU = await db.createGuest({ guestKey: 'seize-host-key-01', name: '房主', avatar: 'fox' });
  const p2 = await db.createGuest({ guestKey: 'seize-seat-key-02', name: '乙', avatar: 'panda' });
  const p3 = await db.createGuest({ guestKey: 'seize-seat-key-03', name: '丙', avatar: 'otter' });
  const p4 = await db.createGuest({ guestKey: 'seize-seat-key-04', name: '丁', avatar: 'shiba' });
  const otherU = await db.createGuest({ guestKey: 'seize-google-key-05', name: '谷歌乙', avatar: 'cat' });
  const gmU = await db.createGuest({ guestKey: 'seize-gm-key-0006', name: '阿廣', avatar: 'lion' });
  const spoofU = await db.createGuest({ guestKey: 'seize-spoof-key-07', name: '冒充', avatar: 'wolf' });
  const watchU = await db.createGuest({ guestKey: 'seize-watch-key-08', name: '觀眾', avatar: 'fox' });
  await db.linkGoogle(gmU.id, 'seize-gm-google-sub', GM_EMAIL);
  await db.linkGoogle(otherU.id, 'seize-other-google-sub', 'other-player@example.com');
  const tokens = {};
  for (const u of [hostU, p2, p3, p4, otherU, gmU, spoofU, watchU]) tokens[u.id] = await db.createSession(u.id);
  db.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
  const spoofRow = saved.users.find(u => u.id === spoofU.id);
  spoofRow.email = GM_EMAIL;
  delete spoofRow.google_sub;
  fs.writeFileSync(path.join(DATA, 'db.json'), JSON.stringify(saved));

  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0',
      GM_EMAIL, GM_USER_ID: '', HOST_AWAY_MS: '600000',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let chrome;
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });

  const gmMe = await fetch(APP + 'api/me', { headers: { Authorization: 'Bearer ' + tokens[gmU.id] } }).then(r => r.json());
  const otherMe = await fetch(APP + 'api/me', { headers: { Authorization: 'Bearer ' + tokens[otherU.id] } }).then(r => r.json());
  const spoofMe = await fetch(APP + 'api/me', { headers: { Authorization: 'Bearer ' + tokens[spoofU.id] } }).then(r => r.json());
  const hostMe = await fetch(APP + 'api/me', { headers: { Authorization: 'Bearer ' + tokens[hostU.id] } }).then(r => r.json());
  assert(gmMe.user && gmMe.user.gm === true && gmMe.user.email === GM_EMAIL, 'verified GM email is the only GM');
  assert(otherMe.user.gm === false && otherMe.user.google === true, 'another Google account is not GM');
  assert(spoofMe.user.gm === false && spoofMe.user.email === GM_EMAIL && spoofMe.user.google === false, 'the GM email without Google verification is not GM');
  assert(hostMe.user.gm === false && hostMe.user.guest === true, 'a guest is not GM');

  const host = bot(tokens[hostU.id], hostU.guest_key, '房主');
  const b2 = bot(tokens[p2.id], p2.guest_key, '乙');
  const b3 = bot(tokens[p3.id], p3.guest_key, '丙');
  const b4 = bot(tokens[p4.id], p4.guest_key, '丁');
  const other = bot(tokens[otherU.id], otherU.guest_key, '谷歌乙', { gm: true, email: GM_EMAIL });
  const gm = bot(tokens[gmU.id], gmU.guest_key, '阿廣', { gm: false });
  const spoof = bot(tokens[spoofU.id], spoofU.guest_key, '冒充', { gm: true, email: GM_EMAIL });
  const watcher = bot(tokens[watchU.id], watchU.guest_key, '觀眾', { gm: true });
  await Promise.all([host, b2, b3, b4, other, gm, spoof, watcher].map(b => b.ready));
  assert(gm.hello.user.gm === true, 'hello reports GM only from the server account');
  assert(other.hello.user.gm === false && spoof.hello.user.gm === false && watcher.hello.user.gm === false, 'a hello gm flag does not grant GM');

  const stranger = bot('', 'seize-stranger-key', '路人', { gm: true, email: GM_EMAIL });
  await stranger.ready;
  assert(stranger.hello.user.gm === false, 'an unauthenticated gm flag does not become GM');

  try {
    const solo = await gm.emit('create', {});
    await until(() => gm.st && gm.st.code === solo.room && gm.st.isHost);
    const seq = gm.st.lastEvent ? gm.st.lastEvent.seq : 0;
    const already = await gm.act('seize', { gm: true });
    assert(already.ok === true && !already.error, 'seize while already host succeeds as a no-op');
    await sleep(60);
    assert(gm.st.isHost && gm.st.hostId === gm.st.meId && (gm.st.lastEvent ? gm.st.lastEvent.seq : 0) === seq, 'already-host seize does not move host or announce');
    await gm.emit('leave');
    const outside = await gm.act('seize', { gm: true, email: GM_EMAIL });
    assert(outside.error && /不在房間/.test(outside.error), 'seize outside a room is rejected');

    const made = await host.emit('create', {});
    await until(() => host.st && host.st.code === made.room);
    assert((await host.act('capacity', { n: 5 })).ok, 'host sets 5 seats');
    const code = made.room;
    const seated = [b2, b3, b4, other];
    for (let i = 0; i < seated.length; i++) {
      await seated[i].emit('join', { code });
      assert((await seated[i].act('sit', { seat: i + 2 })).ok, 'seat ' + (i + 2));
    }
    for (const spec of [gm, spoof, watcher, stranger]) {
      const j = await spec.emit('join', { code });
      assert(j && j.spectating, spec.name + ' joins as a spectator');
    }
    await until(() => host.st.seated === 5 && gm.st && gm.st.code === code && gm.st.spectating && !gm.st.isHost);
    const seatIds = () => host.st.seats.map(s => (s && !s.empty ? s.id : null)).join(',');
    const seatsBefore = seatIds();
    const hostPub = host.st.meId;

    async function denied(who, label) {
      const before = host.st.hostId;
      const r = await who.act('seize', { gm: true, email: GM_EMAIL, host: true });
      assert(r && r.error === DENY && !r.ok, label + ' cannot seize');
      await sleep(40);
      assert(host.st.hostId === before && host.st.isHost && !gm.st.isHost, label + ' left the host in place');
    }
    await denied(host, 'the current host');
    await denied(other, 'another Google user');
    await denied(watcher, 'a guest spectator');
    await denied(spoof, 'an email spoof without Google verification');
    await denied(stranger, 'an unauthenticated gm flag');
    assert(!leaked(watcher.st) && !leaked(other.st), 'room state does not publish the GM email');

    const lobbySeats = seatsBefore;
    const seized = await gm.act('seize', {});
    assert(seized.ok === true && !seized.error, 'verified GM seizes host in the lobby');
    await until(() => gm.st.isHost && !host.st.isHost && host.st.hostId === gm.st.meId);
    assert(gm.st.spectating && gm.st.mySeat == null, 'a spectator GM stays unseated');
    assert(seatIds() === lobbySeats && host.st.mySeat === 1, 'lobby seats stay put');
    assert(gm.st.lastEvent && gm.st.lastEvent.type === 'host' && gm.st.lastEvent.name === '阿廣' && gm.st.lastEvent.id === gm.st.meId, 'announcement names the new host');
    assert(!/GM|gm|搶房主/.test(JSON.stringify(gm.st.lastEvent)), 'the announcement does not reveal a GM title');
    assert((await host.act('capacity', { n: 6 })).error && /房主/.test((await host.act('capacity', { n: 6 })).error || (await host.act('start')).error), 'previous host loses lobby privileges');
    const cap = await host.act('capacity', { n: 6 });
    assert(cap.error && /房主/.test(cap.error), 'previous host cannot change the room');
    assert((await gm.act('capacity', { n: 6 })).ok && (await gm.act('capacity', { n: 5 })).ok, 'GM host can change capacity and put it back');
    await until(() => host.st.capacity === 5 && host.st.seated === 5);
    assert(seatIds() === lobbySeats, 'capacity round-trip keeps the same players');
    assert((await gm.act('transfer', { id: hostPub })).ok, 'GM hands the lobby back so the live game can start under the old host');
    await until(() => host.st.isHost && !gm.st.isHost);

    assert((await host.act('start')).ok, 'original host starts');
    await until(() => host.st.game && host.st.game.me && gm.st.game && gm.st.game.phase === 'team');
    const leader = [host, b2, b3, b4, other].find(b => b.st.game.leaderId === b.st.meId);
    const team = [host, b2].map(b => b.st.meId);
    assert((await leader.act('propose', { team })).ok, 'leader proposes');
    await until(() => host.st.game.phase === 'vote');
    assert((await host.act('vote', { approve: true })).ok && (await b2.act('vote', { approve: false })).ok, 'two ballots are in');
    await until(() => host.st.game.voted && host.st.game.voted.length === 2);
    await denied(other, 'a seated Google user mid-game');
    await denied(host, 'the host mid-game');
    const mid = [host, b2, b3, b4, other, gm, spoof, watcher].map(b => hidden(b.st));
    assert(gm.st.game.seats.every(s => s.role == null && s.side == null) && !gm.st.game.me, 'spectator sees no hidden roles before seize');
    const live = await gm.act('seize', { gm: true });
    assert(live.ok === true, 'verified GM seizes host mid-game');
    await until(() => gm.st.isHost && !host.st.isHost);
    const midAfter = [host, b2, b3, b4, other, gm, spoof, watcher].map(b => hidden(b.st));
    assert(JSON.stringify(mid) === JSON.stringify(midAfter), 'mid-game roles, ballots, and seats are unchanged');
    assert(gm.st.spectating && gm.st.game.seats.every(s => s.role == null && s.side == null), 'spectator still receives no hidden roles');
    assert(!leaked(watcher.st), 'mid-game state does not publish GM identity');
    const oldDisc = await host.act('discover', { on: true });
    const gmDisc = await gm.act('discover', { on: true });
    assert(oldDisc.error && /房主/.test(oldDisc.error), 'previous host cannot run host actions mid-game');
    assert(gmDisc.error && /遊戲進行中/.test(gmDisc.error), 'GM is now the host and is stopped by the in-game rule, not by a permission error');
    assert((await host.act('endearly')).error && /房主/.test((await host.act('endearly')).error), 'previous host cannot force-end');
    assert((await gm.act('transfer', { id: hostPub })).error, 'ordinary transfer stays blocked during a live game');
    assert((await gm.act('endearly')).ok, 'GM host can force-end');
    await until(() => host.st.game && host.st.game.phase === 'end' && gm.st.game.phase === 'end');
    assert(host.st.game.seats.every(s => s.role) && host.st.game.reason === '提前結束', 'force-end reaches the public end state');

    assert((await gm.act('transfer', { id: hostPub })).ok, 'at end, host can be handed back');
    await until(() => host.st.isHost && !gm.st.isHost && host.st.game.phase === 'end');
    const ended = [host, b2, b3, other, gm, watcher].map(b => hidden(b.st));
    await denied(spoof, 'a spoofed flag at end');
    await denied(watcher, 'a spectator at end');
    const endSeize = await gm.act('seize', {});
    assert(endSeize.ok === true, 'verified GM seizes host at end-game');
    await until(() => gm.st.isHost && !host.st.isHost && gm.st.game.phase === 'end');
    const endedAfter = [host, b2, b3, other, gm, watcher].map(b => hidden(b.st));
    assert(JSON.stringify(ended) === JSON.stringify(endedAfter), 'end-game roles and result are unchanged');
    const again = await gm.act('seize', { gm: true });
    assert(again.ok === true && gm.st.isHost && gm.st.hostId === gm.st.meId, 'a second seize while GM is host is a no-op');
    assert((await host.act('lobby')).error && /房主/.test((await host.act('lobby')).error), 'previous host cannot start the next game');
    assert((await gm.act('lobby')).ok, 'GM host can open the next game');
    await until(() => host.st && !host.st.game && gm.st && !gm.st.game && gm.st.isHost);
    assert(seatIds() === lobbySeats, 'next-round lobby keeps the same seats');
    assert((await gm.act('transfer', { id: hostPub })).ok, 'hand host back for the on-screen check');
    await until(() => host.st.isHost && !gm.st.isHost && !host.st.game);

    chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-seize-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
    let tab;
    for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let idn = 0; const pending = new Map();
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
    await new Promise(r => ws.addEventListener('open', r));
    const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 20000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
    const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
    await send('Runtime.enable'); await send('Page.enable');
    async function setSize(w, h) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }); }
    async function asUser(u, guestKey) {
      const profile = JSON.stringify({ name: u.name, avatar: 'fox', bg: '#fff', fx: 'spot', pendant: 'none' });
      const marker = '?m=' + u.id;
      await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(tokens[u.id])}); localStorage.setItem('cc.pid', ${JSON.stringify(u.id)}); localStorage.setItem('cc.guest', ${JSON.stringify(guestKey)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + marker)})`);
      for (let i = 0; i < 50; i++) {
        const ready = await evalj(`location.href.includes(${JSON.stringify(marker)}) && !!document.querySelector('.rt') && !!document.querySelector('.top-more')`).catch(() => false);
        if (ready) return;
        await sleep(120);
      }
      throw new Error('no room for ' + u.name);
    }
    async function quiet() {
      for (let i = 0; i < 6; i++) {
        const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`);
        if (!open) return;
        await evalj(`(() => { const b = document.querySelector('#room-menu-close') || document.querySelector('#seize-cancel') || document.querySelector('#modal .btn'); if (b) b.click(); })()`);
        await sleep(80);
      }
    }
    async function shot(name) { const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); }
    const openMenu = async () => {
      await evalj(`document.querySelector('.top-more').click()`);
      for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('.room-menu')`)); i++) await sleep(40);
      await sleep(60);
    };
    const labels = () => evalj(`[...document.querySelectorAll('.room-menu .mrow b')].map(b => b.textContent).join('|')`);
    const fitSheet = () => evalj(`(() => {
      const sheet = document.querySelector('.sheet');
      const btn = document.querySelector('#seize-ok') || document.querySelector('#room-menu-close') || document.querySelector('#seize-cancel');
      const sr = sheet.getBoundingClientRect();
      const br = btn ? btn.getBoundingClientRect() : sr;
      const faces = [...document.querySelectorAll('.rt .st')];
      return {
        sheet: sr.left >= -1 && sr.right <= innerWidth + 1 && sr.bottom <= innerHeight + 1 && sr.top >= -1,
        btn: br.top >= 0 && br.bottom <= innerHeight + 1 && br.height >= 36,
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        faces: faces.length, iw: innerWidth, ih: innerHeight,
      };
    })()`);

    await setSize(375, 812);
    await asUser(gmU, gmU.guest_key);
    await quiet();
    await evalj(`window.confirm = () => { throw new Error('native confirm'); }; window.alert = () => { throw new Error('native alert'); }; true`);
    const closed = await evalj(`(() => {
      const seize = [...document.querySelectorAll('#app button')].filter(b => /搶房主/.test(b.textContent));
      return { seize: seize.length, faces: document.querySelectorAll('.rt .st').length };
    })()`);
    assert(closed.seize === 0 && closed.faces >= 5, '搶房主 is not painted over the table ' + JSON.stringify(closed));
    await openMenu();
    let text = await labels();
    assert(text.includes('搶房主') && !text.includes('轉讓房主'), 'GM menu shows 搶房主 while they are not host (' + text + ')');
    assert(!(await evalj(`/GM/.test(document.querySelector('.room-menu').innerText)`)), 'the menu does not label the player as GM');
    let box = await fitSheet();
    assert(box.sheet && box.btn && box.sw <= box.cw + 1, 'menu fits at 375 ' + JSON.stringify(box));
    await shot('seize-menu-gm-375.png');
    await setSize(390, 844);
    await sleep(80);
    box = await fitSheet();
    assert(box.sheet && box.sw <= box.cw + 1 && box.iw === 390, 'menu fits at 390 ' + JSON.stringify(box));
    await shot('seize-menu-gm-390.png');
    await evalj(`document.querySelector('.room-menu [data-x="seize"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('#seize-title')`)); i++) await sleep(40);
    assert(await evalj(`document.querySelector('#seize-title').textContent === '搶房主？' && document.querySelector('#seize-ok').textContent === '搶房主' && document.querySelector('#seize-cancel').textContent === '取消' && !document.querySelector('#seize-title').textContent.includes('GM')`), 'confirm is an in-app card');
    assert(host.st.isHost && !gm.st.isHost, 'opening the card does not seize');
    box = await fitSheet();
    assert(box.sheet && box.btn && box.sw <= box.cw + 1, 'confirm fits at 390 ' + JSON.stringify(box));
    await shot('seize-confirm-390.png');
    await setSize(375, 812);
    await sleep(50);
    box = await fitSheet();
    assert(box.sheet && box.btn && box.sw <= box.cw + 1 && box.iw === 375, 'confirm fits at 375 ' + JSON.stringify(box));
    await shot('seize-confirm-375.png');
    await evalj(`document.querySelector('#seize-cancel').click()`);
    await sleep(80);
    assert(!(await evalj(`!!document.querySelector('#seize-title')`)) && host.st.isHost, 'cancel leaves the host in place');
    await openMenu();
    await evalj(`document.querySelector('.room-menu [data-x="seize"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('#seize-cancel')`)); i++) await sleep(40);
    await evalj(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
    await sleep(80);
    assert(!(await evalj(`!!document.querySelector('#seize-title')`)) && host.st.isHost, 'Escape does not seize');

    await setSize(375, 812);
    await asUser(hostU, hostU.guest_key);
    await quiet();
    await openMenu();
    text = await labels();
    assert(!text.includes('搶房主') && text.includes('轉讓房主'), 'the current host does not see 搶房主 (' + text + ')');
    box = await fitSheet();
    assert(box.sheet && box.sw <= box.cw + 1, 'non-GM menu fits at 375 ' + JSON.stringify(box));
    await shot('seize-menu-nongm-375.png');
    await setSize(390, 844);
    await sleep(40);
    await shot('seize-menu-nongm-390.png');
    assert(!(await evalj(`document.body.innerText.includes('搶房主')`)), 'non-GM page has no seize control');
    await evalj(`document.querySelector('#room-menu-close').click()`);

    await setSize(390, 844);
    await asUser(otherU, otherU.guest_key);
    await quiet();
    await openMenu();
    text = await labels();
    assert(!text.includes('搶房主'), 'another Google user does not see 搶房主 (' + text + ')');
    await evalj(`document.querySelector('#room-menu-close').click()`);

    await setSize(375, 812);
    await asUser(gmU, gmU.guest_key);
    await quiet();
    await evalj(`window.confirm = () => { throw new Error('native confirm'); }; true`);
    await openMenu();
    await evalj(`document.querySelector('.room-menu [data-x="seize"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('#seize-ok')`)); i++) await sleep(40);
    await evalj(`document.querySelector('#seize-ok').click()`);
    await until(() => gm.st.isHost && !host.st.isHost);
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('[data-a="start"]') && !!document.querySelector('[data-a="releaselist"]')`)); i++) await sleep(50);
    assert(await evalj(`!!document.querySelector('[data-a="start"]') && !!document.querySelector('[data-a="releaselist"]') && ![...document.querySelectorAll('#app button')].some(b => /搶房主/.test(b.textContent))`), 'GM now has start and release, and the seize control is gone');
    await shot('seize-after-gm-375.png');
    await setSize(390, 844);
    await sleep(80);
    await shot('seize-after-gm-390.png');
    await openMenu();
    text = await labels();
    assert(!text.includes('搶房主') && (text.includes('轉讓房主') || text.includes('解散房間')), 'host GM no longer sees 搶房主 (' + text + ')');
    await evalj(`document.querySelector('#room-menu-close').click()`);

    await setSize(375, 812);
    await asUser(hostU, hostU.guest_key);
    await quiet();
    const oldView = await evalj(`(() => ({
      start: !!document.querySelector('[data-a="start"]'),
      release: !!document.querySelector('[data-a="releaselist"]'),
      ready: [...document.querySelectorAll('button')].some(b => /準備/.test(b.textContent)),
      seize: document.body.innerText.includes('搶房主'),
      next: !!document.querySelector('[data-a="lobby"]'),
    }))()`);
    assert(!oldView.start && !oldView.release && !oldView.seize && oldView.ready && !oldView.next, 'previous host lost host controls ' + JSON.stringify(oldView));
    await shot('seize-after-old-375.png');
    await setSize(390, 844);
    await sleep(80);
    await shot('seize-after-old-390.png');
    assert((await host.act('start')).error && gm.st.isHost, 'previous host still cannot start after the on-screen seize');
    console.log('SEIZE HOST TESTS PASSED');
    try { ws.close(); } catch {}
  } finally {
    stop();
    [host, b2, b3, b4, other, gm, spoof, watcher, stranger].forEach(b => { try { b && b.s.close(); } catch {} });
  }
})().catch(e => { console.error(e); process.exit(1); });
