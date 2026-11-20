'use strict';
// Occupied-seat avatars must survive a room re-render whose HTML did not change.
// render() used to detach every .av-wrap and then skip the DOM morph when the
// markup string was identical, so the saved faces were never put back.
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 37220 + (process.pid % 400);
const CDP_PORT = 46220 + (process.pid % 400);
const ROOT = path.join(__dirname, '..');
const DATA = '/tmp/av-face-' + process.pid;
const SHOTS = process.env.SHOT_DIR || '/tmp/av-face-shots-' + process.pid;
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const kids = [];
const track = (p) => { kids.push(p); return p; };
function killAll() { for (const p of kids) { if (!p || !p.pid) continue; try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { try { p.kill('SIGKILL'); } catch (e2) {} } } }
process.on('exit', killAll);
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
function get(url) { return new Promise((resolve, reject) => { const req = http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }); req.on('error', reject); req.setTimeout(2500, () => { req.destroy(); reject(new Error('timeout')); }); }); }
class Dev {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.ws.addEventListener('message', ev => { const msg = JSON.parse(ev.data); if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); }
  ready() { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('cdp')), 5000); this.ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true }); }); }
  send(method, params = {}, timeout = 20000) { const id = ++this.id; return new Promise((resolve, reject) => { const t = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, timeout); this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900)); return r.result && r.result.value; }
}
const FACES = `(() => [...document.querySelectorAll('.rt .st')].map(st => {
  const img = st.querySelector('.av-wrap .av img');
  const nm = st.querySelector('.nm');
  const ir = img ? img.getBoundingClientRect() : null;
  const nr = nm ? nm.getBoundingClientRect() : null;
  return {
    seat: st.dataset.seat || '',
    id: st.dataset.id || '',
    empty: st.classList.contains('empty'),
    name: nm ? nm.textContent : '',
    wrap: st.querySelectorAll('.av-wrap').length,
    img: st.querySelectorAll('.av-wrap .av img').length,
    src: img ? img.getAttribute('src') : '',
    face: img ? (img.dataset.face || '') : '',
    emptyIcon: !!st.querySelector('.av-empty'),
    w: img ? img.naturalWidth : 0,
    gap: (ir && nr) ? Math.round((nr.top - ir.bottom) * 10) / 10 : null,
    dx: (ir && nr) ? Math.round((nr.left + nr.width / 2 - (ir.left + ir.width / 2)) * 10) / 10 : null
  };
}))()`;
let log = '';
(async () => {
  const srv = track(spawn(process.execPath, ['server.js'], { cwd: ROOT, detached: true, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }));
  srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  const t0 = Date.now(); while (!/on :/.test(log)) { if (Date.now() - t0 > 8000) throw new Error('server ' + log.slice(-400)); await sleep(40); }
  const dir = '/tmp/chrome-face-' + process.pid; fs.mkdirSync(dir, { recursive: true });
  track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
  let page; for (let i = 0; i < 40 && !page; i++) { try { page = JSON.parse(await get('http://127.0.0.1:' + CDP_PORT + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!page) throw new Error('no chrome');
  const cdp = new Dev(page.webSocketDebuggerUrl); await cdp.ready(); await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const APP = 'http://127.0.0.1:' + PORT + '/';
  const wait = async (expr, ms = 8000) => { const ok = await cdp.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { let v=0; try { v=(${expr}); } catch(e){} if (v) { clearInterval(t); r(1);} else if (Date.now()-t0>${ms}) { clearInterval(t); r(0);} }, 40); })`); if (!ok) throw new Error('wait ' + expr.slice(0, 180)); };
  const faces = () => cdp.eval(FACES);
  const nums = () => cdp.eval(`(() => [...document.querySelectorAll('.rt > .no')].map(n => { const r=n.getBoundingClientRect(); return { seat:n.dataset.seat, x:Math.round((r.left+r.width/2)*10)/10, y:Math.round((r.top+r.height/2)*10)/10, inside:!!n.closest('.st') }; }))()`);
  function check(seats, label, nOcc) {
    const occ = seats.filter(s => s.id && !s.empty);
    const empty = seats.filter(s => s.empty);
    assert(seats.length === 10, label + ' has 10 seats, got ' + seats.length);
    assert(occ.length === nOcc, label + ' occupied ' + occ.length + ' ' + occ.map(s => s.seat + ':' + s.name).join(','));
    assert(empty.length === 10 - nOcc, label + ' empty ' + empty.length);
    for (const s of occ) {
      assert(s.wrap === 1 && s.img === 1, label + ' ' + s.name + ' seat ' + s.seat + ' wrap=' + s.wrap + ' img=' + s.img);
      assert(s.name && s.src.indexOf('/img/av/') === 0, label + ' name/src ' + s.name + ' ' + s.src);
      assert(s.face === s.id, label + ' kept the same avatar img ' + s.name + ' face=' + s.face);
      assert(s.w > 0, label + ' avatar image still loaded ' + s.name);
      assert(s.gap != null && s.gap >= -1 && s.gap <= 8 && Math.abs(s.dx) <= 8, label + ' name tight under avatar ' + s.name + ' gap=' + s.gap + ' dx=' + s.dx);
    }
    for (const s of empty) assert(s.wrap === 0 && s.img === 0 && s.emptyIcon && s.name === '空位', label + ' empty seat ' + s.seat + ' still a dashed placeholder');
  }
  await cdp.send('Page.navigate', { url: APP }); await wait(`document.querySelector('#app')`);
  await cdp.eval(`localStorage.setItem('cc.profile', JSON.stringify({name:'騎士',avatar:'lion',bg:'#ffe08a',fx:'none',pendant:'none'}))`);
  await cdp.send('Page.navigate', { url: APP }); await wait(`document.querySelector('[data-a="create"]')`);
  await cdp.eval(`document.querySelector('[data-a="create"]').click()`);
  await wait(`document.querySelector('.rt .st')`);
  await cdp.eval(`document.querySelector('[data-a="cfg"]').click()`);
  await wait(`document.querySelector('[data-a="cap"][data-n="10"]')`);
  await cdp.eval(`document.querySelector('[data-a="cap"][data-n="10"]').click()`);
  await wait(`document.querySelectorAll('.rt .st').length===10`);
  await cdp.eval(`{ const b=document.querySelector('[data-a="cfgclose"]'); if (b) b.click(); }`);
  await sleep(200);
  const code = (await cdp.eval(`(document.querySelector('.top-code')||{}).textContent||''`)).trim();
  assert(/^[A-Z0-9]{4}$/.test(code), 'room code ' + code);
  const cast = [
    ['iFo', 'panda', 2],
    ['Will', 'cat', 5],
    ['Dickson', 'shiba', 6],
    ['Wson', 'otter', 8],
    ['阿福', 'bunny', 10],
  ];
  const bots = [];
  for (const [name, avatar] of cast) {
    const s = io(APP, { transports: ['websocket'], forceNew: true });
    const pid = 'face' + avatar + Math.random().toString(36).slice(2, 7);
    const emit = (ev, data) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(ev + ' ' + name)), 8000); s.emit(ev, data, (r) => { clearTimeout(t); res(r || {}); }); });
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('connect ' + name)), 8000); s.on('connect', () => { clearTimeout(t); res(); }); });
    const hello = await emit('hello', { pid, name, avatar, bg: '#ffffff', fx: 'none', pendant: 'none' });
    assert(!hello.error, 'hello ' + name + ' ' + (hello.error || ''));
    const joined = await emit('join', { code });
    assert(joined.room === code, name + ' joined');
    bots.push({ s, emit, name, avatar });
  }
  for (let i = 0; i < cast.length; i++) {
    const sat = await bots[i].emit('act', { type: 'sit', data: { seat: cast[i][2] } });
    assert(sat.ok, cast[i][0] + ' sits ' + cast[i][2] + ' ' + JSON.stringify(sat));
  }
  await wait(`[...document.querySelectorAll('.rt .st[data-id] .av-wrap .av img')].filter(i => i.naturalWidth > 0).length === 6 && document.querySelectorAll('.rt .st.empty').length === 4`);
  await cdp.eval(`document.querySelectorAll('.rt .st[data-id] .av-wrap .av img').forEach(img => { img.dataset.face = img.closest('.st').dataset.id; })`);
  const numsBefore = await nums();
  const htmlBefore = await cdp.eval(`document.querySelector('#app')._html`);
  await cdp.eval(`window.__av.render()`);
  const htmlMid = await cdp.eval(`document.querySelector('#app')._html`);
  const mid = await faces();
  check(mid, 'after a render that can still change markup', 6);
  await cdp.eval(`window.__av.render()`);
  const htmlAfter = await cdp.eval(`document.querySelector('#app')._html`);
  assert(htmlBefore !== htmlMid, 'first manual render still had markup to patch');
  assert(htmlMid === htmlAfter, 'second render is an unchanged lobby snapshot');
  const after = await faces();
  const numsAfter = await nums();
  assert(numsBefore.length === 10 && numsAfter.every(n => { const w = numsBefore.find(x => x.seat === n.seat); return w && !n.inside && Math.hypot(n.x - w.x, n.y - w.y) <= 1.5; }), 'seat numbers stayed on the physical slots across the re-render');
  const one = numsAfter.find(n => n.seat === '1');
  const six = numsAfter.find(n => n.seat === '6');
  assert(one && six && one.y < six.y && Math.abs(one.x - six.x) < 40, 'seat 1 stays at the top and seat 6 at the bottom');
  check(after, 'after an unchanged re-render', 6);
  for (const width of [375, 390]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(120);
    await cdp.eval(`{ const r=document.scrollingElement; if(r) r.scrollTop=0; const m=document.querySelector('main'); if(m) m.scrollTop=0; }`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(SHOTS, 'lobby-avatars-after-noop-' + width + '.png');
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('shot', file);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const will = bots[1];
  const ready = await will.emit('act', { type: 'ready', data: { ready: true } });
  assert(ready.ok, 'Will readies');
  await wait(`[...document.querySelectorAll('.rt .st')].some(st => (st.querySelector('.nm')||{}).textContent==='Will' && st.querySelector('.mk') && st.querySelector('.mk').textContent.includes('✅'))`);
  check(await faces(), 'after a ready update', 6);
  await cdp.eval(`window.__av.render()`);
  check(await faces(), 'unchanged render after ready', 6);
  const mover = bots[4];
  const moved = await mover.emit('act', { type: 'sit', data: { seat: 4 } });
  assert(moved.ok, '阿福 moves 10 → 4');
  await wait(`[...document.querySelectorAll('.rt .st')].some(st => st.dataset.seat==='4' && (st.querySelector('.nm')||{}).textContent==='阿福' && st.querySelector('.av-wrap .av img'))`);
  const movedFaces = await faces();
  check(movedFaces, 'after a seat move', 6);
  const afu = movedFaces.find(s => s.name === '阿福');
  assert(afu && afu.seat === '4' && afu.face === afu.id, 'moved player keeps the already-loaded avatar img');
  const stood = await bots[3].emit('act', { type: 'stand', data: {} });
  assert(stood.ok, 'Wson stands');
  await wait(`![...document.querySelectorAll('.rt .nm')].some(n => n.textContent==='Wson') && document.querySelectorAll('.rt .st[data-id]').length===5`);
  check(await faces(), 'after a player leaves', 5);
  const back = await bots[3].emit('act', { type: 'sit', data: { seat: 9 } });
  assert(back.ok, 'Wson sits 9');
  await wait(`[...document.querySelectorAll('.rt .st')].some(st => st.dataset.seat==='9' && (st.querySelector('.nm')||{}).textContent==='Wson' && st.querySelector('.av-wrap .av img') && st.querySelector('.av-wrap .av img').naturalWidth>0)`);
  const returned = await faces();
  const keep = returned.filter(s => s.name !== 'Wson' && s.id);
  assert(keep.length === 5 && keep.every(s => s.face === s.id && s.wrap === 1), 'players who stayed keep their avatar nodes when someone sits');
  assert(returned.filter(s => s.empty).length === 4, 'four empty seats after Wson sits');
  const wson = returned.find(s => s.name === 'Wson');
  assert(wson && wson.seat === '9' && wson.wrap === 1 && wson.img === 1 && wson.w > 0, 'returning player has an avatar');
  await cdp.eval(`window.__av.render()`);
  const finalFaces = await faces();
  const stayed = finalFaces.filter(s => s.id && s.name !== 'Wson');
  assert(stayed.length === 5 && stayed.every(s => s.wrap === 1 && s.img === 1 && s.face === s.id && s.w > 0 && s.gap >= -1 && s.gap <= 8), 'unchanged render keeps the avatars of players who were already seated');
  const wson2 = finalFaces.find(s => s.name === 'Wson');
  assert(wson2 && wson2.seat === '9' && wson2.wrap === 1 && wson2.img === 1 && wson2.w > 0 && wson2.gap >= -1 && wson2.gap <= 8, 'unchanged render keeps the avatar of a player who just sat');
  assert(finalFaces.filter(s => s.empty).length === 4 && finalFaces.filter(s => s.empty).every(s => s.wrap === 0 && s.emptyIcon && s.name === '空位'), 'empty seats stay dashed placeholders after the unchanged render');
  for (const b of bots) b.s.close();
  try { cdp.ws.close(); } catch (e) {}
  killAll();
  console.log('SEAT AVATARS PASSED');
  console.log('SHOTS', SHOTS);
  process.exit(0);
})().catch(e => { console.error('FAILED', e); console.error(log.slice(-1500)); killAll(); process.exit(1); });
