'use strict';
const { spawn } = require('child_process');
const http = require('http');
function getText(url) { return new Promise((resolve, reject) => { const req = http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }); req.on('error', reject); req.setTimeout(2500, () => { req.destroy(); reject(new Error('timeout')); }); }); }
function put(raw) { return new Promise((resolve, reject) => { const m = String(raw).match(/^http:\/\/([^:/]+):(\d+)(\/.*)$/); if (!m) return reject(new Error('bad url')); const req = http.request({ hostname: m[1], port: m[2], path: m[3], method: 'PUT' }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }); req.on('error', reject); req.end(); }); }
class Dev {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.ws.addEventListener('message', ev => { const msg = JSON.parse(ev.data); if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); }
  ready() { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('cdp')), 5000); this.ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true }); }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { const t = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, 20000); this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result && r.result.value; }
}
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const PORT = 39100 + (process.pid % 700);
const ROOT = path.join(__dirname, '..');
const DATA = '/tmp/av-near-' + process.pid;
fs.mkdirSync(DATA, { recursive: true });
const URL = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function untilState(c, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { if (c.st && c.st.meId) return; await sleep(20); } throw new Error('no state'); }
const kids = [];
const track = (p) => { kids.push(p); return p; };
function killAll() { for (const p of kids) { if (!p || !p.pid) continue; try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { try { p.kill('SIGKILL'); } catch (e2) {} } } }
process.on('exit', killAll);
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
async function mk(name, avatar = 'fox') {
  const pid = 'near' + name + Math.random().toString(36).slice(2, 8);
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { s, st: null, pid };
  s.on('state', st => { c.st = st; });
  c.emit = (e, d) => new Promise(r => s.emit(e, d, r));
  c.act = (t, d) => c.emit('act', { type: t, data: d });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('connect')), 8000); s.on('connect', () => { clearTimeout(t); res(); }); });
  await c.emit('hello', { pid, name, avatar });
  return c;
}
(async () => {
  const srv = track(spawn(process.execPath, ['server.js'], { cwd: ROOT, detached: true, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0', DISCOVER_TTL_MS: '8000' }, stdio: ['ignore', 'pipe', 'pipe'] }));
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  const t0 = Date.now(); while (!/on :/.test(log)) { if (Date.now() - t0 > 8000) throw new Error(log.slice(-300)); await sleep(40); }
  const origin = { lat: 22.3, lng: 114.17 };
  const north = (km) => ({ lat: +(origin.lat + km / 111.32).toFixed(6), lng: origin.lng });
  const a = await mk('近'), b = await mk('中'), c = await mk('遠'), guest = await mk('客');
  const ra = (await a.emit('create')).room, rb = (await b.emit('create')).room, rc = (await c.emit('create')).room;
  assert((await guest.emit('nearby', {})).error, 'no coordinates refused');
  assert((await guest.emit('nearby', origin)).rooms.length === 0, 'private rooms stay unlisted');
  const joiner = await mk('客2'); await joiner.emit('join', { code: ra });
  assert((await joiner.act('discover', { on: true, lat: north(0.4).lat, lng: north(0.4).lng })).error, 'non-host cannot publish');
  assert((await a.act('discover', { on: true, lat: 120, lng: 10 })).error, 'bad latitude rejected');
  assert((await a.act('discover', { on: true, lat: north(0.4).lat, lng: north(0.4).lng })).ok, 'near opt in');
  assert((await b.act('discover', { on: true, lat: north(2.4).lat, lng: north(2.4).lng })).ok, 'mid opt in');
  assert((await c.act('discover', { on: true, lat: north(8).lat, lng: north(8).lng })).ok, 'far opt in');
  const found = await guest.emit('nearby', origin);
  const codes = found.rooms.map(r => r.code);
  assert(codes[0] === ra && codes[1] === rb && !codes.includes(rc), 'radius order ' + codes.join(','));
  const blob = JSON.stringify(found);
  assert(!blob.includes(String(north(0.4).lat)) && !blob.includes('email') && !blob.includes('latitude'), 'no exact coordinates or email');
  const pubKeys = ['capacity', 'code', 'distance', 'hostAvatar', 'hostBg', 'hostName', 'hostPhoto', 'name', 'playing', 'seated'];
  assert(found.rooms.every(r => JSON.stringify(Object.keys(r).sort()) === JSON.stringify(pubKeys)), 'public fields only');
  const card = found.rooms.find(r => r.code === ra);
  assert(card.capacity === 8 && card.seated === 1 && card.playing === false && card.capacity !== card.seated && card.hostName === '近' && card.hostAvatar === 'fox' && card.hostPhoto === '/img/av/fox.webp', 'default room shows 8人局, one seated, and the fox host');
  assert((await a.act('discover', { on: false })).ok, 'opt out');
  assert(!(await guest.emit('nearby', origin)).rooms.some(r => r.code === ra), 'opt-out excluded');
  const h = await mk('主'); const room = (await h.emit('create')).room;
  await h.act('capacity', { n: 5 });
  await h.act('discover', { on: true, lat: north(0.4).lat, lng: north(0.4).lng });
  for (let i = 0; i < 4; i++) { const p = await mk('員' + i); await p.emit('join', { code: room }); await p.act('sit', { seat: i + 2 }); }
  const look = await mk('查');
  assert((await look.emit('nearby', origin)).rooms.some(r => r.code === room), 'waiting room listed');
  assert((await h.act('start')).ok, 'start');
  const liveWait = Date.now();
  while (Date.now() - liveWait < 4000 && !(h.st && h.st.game && h.st.game.phase === 'team')) await sleep(40);
  const liveNear = (await look.emit('nearby', origin)).rooms.find(r => r.code === room);
  assert(liveNear && liveNear.playing === true && liveNear.seated === 5 && liveNear.capacity === 5, 'started game stays listed for spectators');
  assert(!/merlin|assassin|morgana|role|side|ladyLog|questVotes/.test(JSON.stringify(liveNear)), 'nearby listing has no hidden game fields');
  const watcher = await mk('觀戰');
  const watched = await watcher.emit('join', { code: room });
  assert(watched && watched.spectating === true && watched.room === room, 'nearby code joins an in-progress game as a spectator');
  await untilState(watcher);
  assert(watcher.st.spectating === true && watcher.st.mySeat == null && watcher.st.game && watcher.st.game.me == null, 'spectator receives the public table and no seat');
  assert(watcher.st.game.seats.every(s => s.role == null && s.side == null) && watcher.st.game.seats.filter(s => s.id).length === 5, 'joining does not take a seat or reveal roles');
  assert(h.st.game.me && h.st.game.me.role && h.st.game.seats.length === 5, 'the seated host is unchanged');
  const still = (await look.emit('nearby', origin)).rooms.find(r => r.code === room);
  assert(still && still.seated === 5 && still.playing === true, 'a spectator does not change the listed occupancy');
  assert((await b.act('discover', { on: true, lat: north(2.4).lat, lng: north(2.4).lng })).ok, 'mid fresh');
  const listed = (await look.emit('nearby', origin)).rooms.find(r => r.code === rb);
  const j1 = await mk('併1'), j2 = await mk('併2');
  const both = await Promise.all([j1.emit('join', { code: listed.code }), j2.emit('join', { code: listed.code })]);
  assert(both.every(r => r && r.room === rb), 'parallel join uses the room code');
  assert((await guest.emit('join', { code: 'ZZZZ' })).error, 'bad code still fails');
  const owner = await mk('熊貓主', 'panda');
  const face = (await owner.emit('create')).room;
  assert((await owner.act('capacity', { n: 10 })).ok, 'configured 10');
  assert((await owner.act('discover', { on: true, lat: north(0.3).lat, lng: north(0.3).lng })).ok, 'panda opt in');
  const mate = await mk('水獺', 'otter');
  await mate.emit('join', { code: face });
  assert((await mate.act('sit', { seat: 2 })).ok, 'second player sits');
  const seen = await (await mk('看')).emit('nearby', origin);
  const panda = seen.rooms.find(r => r.code === face);
  assert(panda && panda.capacity === 10 && panda.seated === 2 && panda.hostName === '熊貓主' && panda.hostAvatar === 'panda' && panda.hostPhoto === '/img/av/panda.webp', 'card shows 10人局, 2/10, and the panda host');
  assert(!JSON.stringify(panda).includes('email') && !panda.hostPhoto.includes('data:') && !panda.hostPhoto.includes('..'), 'avatar url stays on the public image path');
  const extra = await mk('第三人');
  await extra.emit('join', { code: face });
  await extra.act('sit', { seat: 3 });
  const busier = (await (await mk('再看')).emit('nearby', origin)).rooms.find(r => r.code === face);
  assert(busier.seated === 3 && busier.capacity === 10 && busier.hostAvatar === 'panda' && busier.hostName === '熊貓主', 'a new seat changes occupancy without changing the host');
  await untilState(mate);
  assert((await owner.act('transfer', { id: mate.st.meId })).ok, 'host transfers');
  const next = (await (await mk('新主')).emit('nearby', origin)).rooms.find(r => r.code === face);
  assert(next && next.hostName === '水獺' && next.hostAvatar === 'otter' && next.hostPhoto === '/img/av/otter.webp' && next.capacity === 10 && next.seated === 3, 'host change refreshes the owner and keeps the room size');
  const photoHost = await mk('相片', 'photo');
  const photoRoom = (await photoHost.emit('create')).room;
  await untilState(photoHost);
  assert((await photoHost.act('discover', { on: true, lat: north(0.2).lat, lng: north(0.2).lng })).ok, 'photo host opt in');
  const shot = (await (await mk('看相')).emit('nearby', origin)).rooms.find(r => r.code === photoRoom);
  assert(shot && shot.hostAvatar === 'photo' && shot.hostPhoto === '/api/avatar/' + photoHost.st.meId + '?v=0' && shot.hostName === '相片', 'custom photo uses the public avatar url');
  let limited = false; const spam = await mk('頻');
  for (let i = 0; i < 9; i++) { const r = await spam.emit('nearby', origin); if (r.error) limited = true; }
  assert(limited, 'search rate limit');
  await domCard(origin);
  async function domCard(origin) {
    const port = 53400 + (process.pid % 200);
    const dir = '/tmp/chrome-near-' + process.pid;
    fs.mkdirSync(dir, { recursive: true });
    track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
    let tab; for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await getText('http://127.0.0.1:' + port + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
    if (!tab) throw new Error('no chrome');
    const dev = new Dev(tab.webSocketDebuggerUrl); await dev.ready(); await dev.send('Runtime.enable'); await dev.send('Page.enable');
    await dev.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await dev.send('Browser.grantPermissions', { origin: URL, permissions: ['geolocation'] });
    await dev.send('Emulation.setGeolocationOverride', { latitude: origin.lat, longitude: origin.lng, accuracy: 40 });
    const pid = 'neardom' + Math.random().toString(36).slice(2, 8);
    await dev.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('cc.pid', ${JSON.stringify(pid)}); localStorage.removeItem('cc.token'); localStorage.setItem('cc.profile', ${JSON.stringify(JSON.stringify({ name: '搜', avatar: 'fox', bg: '#fff', fx: 'none', pendant: 'none' }))});` });
    await dev.send('Page.navigate', { url: URL + '/' });
    await dev.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('[data-a="join"]')) { clearInterval(t); r(1);} }, 40); })`);
    await dev.eval(`document.querySelector('[data-a="join"]').click()`);
    await dev.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('#near')) { clearInterval(t); r(1);} }, 30); })`);
    await dev.eval(`document.querySelector('#near').click()`);
    const card = await dev.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const item=[...document.querySelectorAll('.near-item')].find(el => el.innerText.includes('${face}') && el.innerText.includes('10人局 · 3/10人')); if (item) { const img=item.querySelector('img'); const rct=item.getBoundingClientRect(); clearInterval(t); r({ text: item.innerText.replace(/\\s+/g,' '), src: img && img.getAttribute('src'), w: rct.width, overflow: document.documentElement.scrollWidth > 375 + 1 }); } else if (Date.now()-t0>8000) { clearInterval(t); r({ text: (document.querySelector('#nearbox')||{}).innerText || '' }); } }, 40); })`);
    assert(card.src === '/img/av/otter.webp' && card.text.includes('水獺') && card.text.includes('10人局 · 3/10人') && card.w <= 375 && !card.overflow && !card.text.includes('email'), 'mobile card shows the host avatar, 10人局, and 3/10人 ' + JSON.stringify(card));
    try { dev.ws.close(); } catch (e) {}
  }
  [a, b, c, guest, joiner, h, look, j1, j2, spam].forEach(p => { try { p.s.close(); } catch (e) {} });
  killAll();
  console.log('NEARBY TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('FAILED', e); killAll(); process.exit(1); });
