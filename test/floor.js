'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const { speakOrder, SPEAK_MS } = require('../rules');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const kids = [];
const track = (p) => { kids.push(p); return p; };
function killAll() { for (const p of kids) { if (!p || !p.pid) continue; try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { try { p.kill('SIGKILL'); } catch (e2) {} } } }
process.on('exit', killAll);
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
function boot(port, env) {
  const data = '/tmp/av-floor-' + port + '-' + process.pid;
  fs.mkdirSync(data, { recursive: true });
  const srv = track(spawn(process.execPath, ['server.js'], { cwd: ROOT, detached: true, env: { ...process.env, PORT: String(port), DATA_DIR: data, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0', FORCE_LEADER: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] }));
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  return (async () => {
    const t0 = Date.now();
    while (!/on :/.test(log)) { if (Date.now() - t0 > 8000) throw new Error(log.slice(-400) || 'server'); await sleep(40); }
    return { url: 'http://127.0.0.1:' + port, srv };
  })();
}
async function mk(url, name) {
  const pid = 'fl' + name + Math.random().toString(36).slice(2, 8);
  const s = io(url, { transports: ['websocket'], forceNew: true });
  const c = { s, st: null, voice: [] };
  s.on('state', st => { c.st = st; });
  s.on('voice:state', m => c.voice.push(m));
  c.emit = (e, d) => new Promise(r => s.emit(e, d, r));
  c.act = (t, d) => c.emit('act', { type: t, data: d });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('connect')), 8000); s.on('connect', () => { clearTimeout(t); res(); }); });
  await c.emit('hello', { pid, name, avatar: 'fox' });
  c.pid = pid;
  return c;
}
async function until(fn, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return; await sleep(20); }
  throw new Error('timeout');
}
function get(url) { return new Promise((resolve, reject) => { const req = http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }); req.on('error', reject); req.setTimeout(2500, () => { req.destroy(); reject(new Error('timeout')); }); }); }
function put(raw) { return new Promise((resolve, reject) => { const m = String(raw).match(/^http:\/\/([^:/]+):(\d+)(\/.*)$/); if (!m) return reject(new Error('bad url')); const req = http.request({ hostname: m[1], port: m[2], path: m[3], method: 'PUT' }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }); req.on('error', reject); req.end(); }); }
class Dev {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.ws.addEventListener('message', ev => { const msg = JSON.parse(ev.data); if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); }
  ready() { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('cdp')), 5000); this.ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true }); }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { const t = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, 20000); this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result && r.result.value; }
}
async function domTalk(url, q) {
  const port = 53100 + (process.pid % 200);
  const dir = '/tmp/chrome-floor-' + process.pid;
  fs.mkdirSync(dir, { recursive: true });
  track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
  let tab; for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + port + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
  const dev = new Dev(tab.webSocketDebuggerUrl); await dev.ready(); await dev.send('Runtime.enable'); await dev.send('Page.enable');
  await dev.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const pid = 'flwatch' + Math.random().toString(36).slice(2, 8);
  await dev.send('Page.navigate', { url });
  await dev.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('#app')) { clearInterval(t); r(1);} }, 30); })`);
  await dev.eval(`localStorage.setItem('cc.pid', ${JSON.stringify(pid)}); localStorage.removeItem('cc.token'); localStorage.setItem('cc.profile', JSON.stringify({name:'旁觀',avatar:'fox',bg:'#fff',fx:'none',pendant:'none'}))`);
  await dev.send('Page.navigate', { url });
  await dev.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('[data-a="join"]')) { clearInterval(t); r(1);} }, 40); })`);
  assert((await dev.eval(`document.querySelectorAll('.seat-presence, .seat-mic, .is-speak').length`)) === 0, 'home screen has no mic or presence decoration');
  await dev.eval(`document.querySelector('[data-a="join"]').click()`);
  await dev.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('#cd')) { clearInterval(t); r(1);} }, 30); })`);
  await dev.eval(`document.querySelector('#cd').value=${JSON.stringify(q.room)}; document.querySelector('#ok').click()`);
  const seen = await dev.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const seat=document.querySelector('.is-speak'); if (seat && document.querySelectorAll('.seat-presence').length===10 && document.querySelector('.floor-time')) { clearInterval(t); r({ seat: seat.dataset.seat, pres: document.querySelectorAll('.seat-presence.on').length, off: document.querySelectorAll('.seat-presence.off').length, text: document.querySelector('.floor-time').textContent, anim: getComputedStyle(seat.querySelector('.av')).animationName }); } else if (Date.now()-t0>8000) { clearInterval(t); r(null); } }, 40); })`);
  assert(seen && seen.seat === String(q.host.st.floor.seat) && seen.pres + seen.off === 10 && seen.anim === 'none', 'speaker glow and presence follow the server turn ' + JSON.stringify(seen));
  const quiet = await dev.eval(`new Promise(r => { let n=0; const rt=document.querySelector('.rt'); const obs=new MutationObserver(recs => { recs.forEach(rec => { if (!rec.target.closest || !rec.target.closest('.floor-time')) n++; }); }); obs.observe(rt, { childList:true, subtree:true, attributes:true, characterData:true }); setTimeout(() => { obs.disconnect(); r(n); }, 700); })`);
  assert(quiet === 0, 'the countdown does not rebuild the table (' + quiet + ')');
  assert((await q.host.act('settings', { mic: false })).ok, 'host turns mic off for the watcher');
  const gone = await dev.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { if (!document.querySelector('.seat-presence, .seat-mic, .is-speak, .floorbar')) { clearInterval(t); r(1);} else if (Date.now()-t0>5000) { clearInterval(t); r(0);} }, 40); })`);
  assert(gone === 1, 'mic mode off removes presence, glow, and the speaking bar');
  try { dev.ws.close(); } catch (e) {}
}
async function table(url) {
  const host = await mk(url, '主');
  const room = (await host.emit('create')).room;
  assert((await host.act('capacity', { n: 10 })).ok, 'capacity 10');
  assert((await host.act('settings', { mic: true })).ok, 'mic mode on');
  await until(() => host.st && host.st.floor == null && host.st.settings && host.st.settings.mic === true);
  assert(host.st.floor == null, 'lobby has no speaking countdown');
  const cs = [host];
  for (let i = 2; i <= 10; i++) {
    const p = await mk(url, '座' + i);
    assert((await p.emit('join', { code: room })).room === room, 'join ' + i);
    assert((await p.act('sit', { seat: i })).ok, 'sit ' + i);
    cs.push(p);
  }
  assert((await host.act('start')).ok, 'start');
  await until(() => host.st && host.st.game && host.st.floor && host.st.floor.speaker);
  return { host, cs, room };
}

(async () => {
  assert(SPEAK_MS === 90000, 'default turn is 90 seconds');
  const full = speakOrder(10, 0, Array(10).fill(true)).map(i => i + 1);
  assert(JSON.stringify(full) === JSON.stringify([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 'leader seat 1 speaks last, starting at their right (seat 10) ' + full.join(','));
  const hole = speakOrder(10, 0, [true, true, true, true, true, true, true, true, true, false]).map(i => i + 1);
  assert(JSON.stringify(hole) === JSON.stringify([9, 8, 7, 6, 5, 4, 3, 2, 1]), 'empty seat on the leader right is skipped ' + hole.join(','));
  const from3 = speakOrder(10, 2, Array(10).fill(true)).map(i => i + 1);
  assert(from3[0] === 2 && from3[from3.length - 1] === 3 && from3.length === 10, 'seat 3 also starts at their own right and speaks last ' + from3.join(','));

  const main = await boot(41200 + (process.pid % 200), {});
  const game = await table(main.url);
  const floor = game.host.st.floor;
  const leader = game.host.st.game.leaderId;
  assert(game.host.st.game.seats[0].id === leader, 'forced leader is physical seat 1');
  assert(JSON.stringify(floor.seats) === JSON.stringify([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 'live order is 10 then 9 down to the leader');
  assert(floor.order.length === 10 && new Set(floor.order).size === 10, 'each seated player once');
  assert(floor.ms === 90000 && floor.deadline - Date.now() > 85000 && floor.deadline - Date.now() <= 90000, 'deadline is about 90 seconds');
  assert(floor.index === 0 && floor.speaker === floor.order[0] && floor.seat === 10, 'first speaker is seat 10');
  const late = await mk(main.url, '旁');
  assert((await late.emit('join', { code: game.room })).room === game.room, 'late join');
  await until(() => late.st && late.st.floor && late.st.floor.token === floor.token);
  assert(late.st.floor.speaker === floor.speaker && late.st.floor.deadline === floor.deadline, 'late join sees the same turn');
  const other = game.cs.find(c => c.st.meId !== floor.speaker);
  assert((await other.emit('voice:mic', { on: true })).error, 'non-current player cannot publish');
  assert((await other.emit('voice:signal', { to: floor.speaker, kind: 'offer', sdp: 'v=0\r\n' + 'x'.repeat(20) })).error, 'non-current offer is rejected');
  assert((await other.emit('voice:listen', {})).ok, 'listening does not need a microphone');
  assert(!other.voice.some(v => v && v.on), 'rejecting a turn does not unmute anyone');
  const speaker = game.cs.find(c => c.st.meId === floor.speaker);
  const token = floor.token;
  const ended = await Promise.all([speaker.act('floor', { op: 'end', token }), speaker.act('floor', { op: 'end', token })]);
  assert(ended.filter(r => r && r.ok).length >= 1, 'early end accepted');
  await until(() => game.host.st.floor && game.host.st.floor.index === 1);
  assert(game.host.st.floor.speaker === floor.order[1] && game.host.st.floor.seat === 9, 'early end advances once to seat 9');
  assert(game.host.st.floor.deadline - Date.now() > 85000, 'the next speaker gets a fresh 90 seconds');
  const next = game.cs.find(c => c.st.meId === game.host.st.floor.speaker);
  const stuck = game.host.st.floor.index;
  assert((await next.act('floor', { op: 'end', token }) ).ok, 'stale token is ignored');
  await sleep(80);
  assert(game.host.st.floor.index === stuck, 'a repeated end does not skip another player');
  const guest = game.cs.find(c => c !== game.host);
  assert((await guest.act('floor', { op: 'restart' })).error, 'non-host cannot restart');
  const before = game.host.st.floor.id;
  assert((await game.host.act('floor', { op: 'restart' })).ok, 'host restart');
  await until(() => game.host.st.floor && game.host.st.floor.id !== before && game.host.st.floor.index === 0);
  assert(game.host.st.floor.seat === 10 && JSON.stringify(game.host.st.floor.seats) === JSON.stringify(floor.seats), 'restart keeps the same right-hand order');
  await domTalk(main.url, game);
  assert((await game.host.act('settings', { mic: false })).ok, 'host disables mic mode');
  await until(() => game.host.st.floor == null && game.host.st.settings.mic === false);
  assert((await speaker.emit('voice:mic', { on: true })).error, 'mode off rejects transmit');
  assert((await game.host.act('settings', { mic: true })).ok, 'host enables mic again');
  await until(() => game.host.st.floor && game.host.st.floor.index === 0 && game.host.st.floor.seat === 10);
  assert(!game.cs.some(c => c.voice.some(v => v && v.on)), 'a new turn does not unmute anyone');
  const team = game.host.st.game.seats.slice(0, 3).map(s => s.id);
  assert((await game.host.act('propose', { team })).ok, 'proposal');
  await until(() => game.host.st.game.phase === 'vote' && game.host.st.floor == null);
  assert(game.host.st.floor == null, 'voting clears the speaking turn');
  game.cs.forEach(c => c.s.close()); late.s.close();

  const quick = await boot(41400 + (process.pid % 200), { SPEAK_MS: '2000', PRESENCE_GRACE_MS: '350' });
  const q = await table(quick.url);
  assert(q.host.st.floor.ms === 2000, 'test server uses its speaking budget');
  const firstDeadline = q.host.st.floor.deadline;
  await until(() => q.host.st.floor && q.host.st.floor.index === 1, 4000);
  assert(q.host.st.floor.seat === 9 && q.host.st.floor.deadline !== firstDeadline, 'expiry advances to the next seat');
  assert(JSON.stringify(q.host.st.floor.seats) === JSON.stringify([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 'expiry does not rebuild the order');
  const cur = q.cs.find(c => c.st.meId === q.host.st.floor.speaker);
  const deadline = q.host.st.floor.deadline;
  const index = q.host.st.floor.index;
  cur.s.disconnect();
  await sleep(120);
  assert(q.host.st.floor.speaker === cur.st.meId && q.host.st.floor.deadline === deadline && q.host.st.seats.find(s => s.id === cur.st.meId).online === true, 'reconnect grace keeps the speaker and the deadline');
  cur.s.connect();
  await new Promise(r => cur.s.once('connect', r));
  await cur.emit('hello', { pid: cur.pid, name: '回', avatar: 'fox' });
  await sleep(80);
  assert(q.host.st.floor.index === index && q.host.st.floor.deadline === deadline, 'reconnecting does not restart the budget or the order');
  cur.s.disconnect();
  await sleep(700);
  await until(() => q.host.st.floor && q.host.st.floor.index === index + 1, 2000);
  assert(q.host.st.seats.find(s => s.id === cur.st.meId).online === false, 'after the grace the seat is offline');
  const skipped = q.host.st.floor.speaker;
  cur.s.connect();
  await new Promise(r => cur.s.once('connect', r));
  await cur.emit('hello', { pid: cur.pid, name: '回', avatar: 'fox' });
  await sleep(120);
  assert(q.host.st.floor.index === index + 1 && q.host.st.floor.speaker === skipped, 'coming back does not reclaim the skipped turn');
  q.cs.forEach(c => { try { c.s.close(); } catch (e) {} });
  killAll();
  console.log('FLOOR TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('FAILED', e); killAll(); process.exit(1); });
