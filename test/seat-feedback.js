'use strict';
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 38100 + (process.pid % 800);
const CDP_PORT = 49100 + (process.pid % 800);
const ROOT = path.join(__dirname, '..');
const DATA = '/tmp/av-seat-' + process.pid;
fs.mkdirSync(DATA, { recursive: true });
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
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 700)); return r.result && r.result.value; }
}
(async () => {
  const srv = track(spawn(process.execPath, ['server.js'], { cwd: ROOT, detached: true, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }));
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  const t0 = Date.now(); while (!/on :/.test(log)) { if (Date.now() - t0 > 8000) throw new Error('server'); await sleep(40); }
  const dir = '/tmp/chrome-seat-' + process.pid; fs.mkdirSync(dir, { recursive: true });
  track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
  let page; for (let i = 0; i < 40 && !page; i++) { try { page = JSON.parse(await get('http://127.0.0.1:' + CDP_PORT + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!page) throw new Error('no chrome');
  const cdp = new Dev(page.webSocketDebuggerUrl); await cdp.ready(); await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const APP = 'http://127.0.0.1:' + PORT + '/';
  const wait = async (expr, ms = 8000) => { const ok = await cdp.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { let v=0; try { v=(${expr}); } catch(e){} if (v) { clearInterval(t); r(1);} else if (Date.now()-t0>${ms}) { clearInterval(t); r(0);} }, 40); })`); if (!ok) throw new Error('wait'); };
  await cdp.send('Page.navigate', { url: APP }); await wait(`document.querySelector('#app')`);
  await cdp.eval(`localStorage.setItem('cc.profile', JSON.stringify({name:'測主',avatar:'fox',bg:'#ffffff',fx:'spot',pendant:'none'}))`);
  await cdp.send('Page.navigate', { url: APP }); await wait(`document.querySelector('[data-a="create"]')`);
  await cdp.eval(`document.querySelector('[data-a="create"]').click()`);
  await wait(`document.querySelector('.rt .st')`);
  const none = await cdp.eval(`document.querySelectorAll('.seat-mic').length`);
  assert(none === 0, 'room mic mode off renders no mic icons');
  await cdp.eval(`document.querySelector('[data-a="cfg"]').click()`);
  await wait(`document.querySelector('[data-a="cap"][data-n="10"]')`);
  await cdp.eval(`document.querySelector('[data-a="cap"][data-n="10"]').click()`);
  await wait(`document.querySelectorAll('.rt .st').length===10`);
  await cdp.eval(`{ const b=document.querySelector('[data-a="cfgclose"]'); if (b) b.click(); }`);
  await sleep(200);
  const numsBefore = await cdp.eval(`(() => [...document.querySelectorAll('.rt > .no')].map(n => { const r=n.getBoundingClientRect(); return { seat:n.dataset.seat, x:r.left+r.width/2, y:r.top+r.height/2, inside:!!n.closest('.st') }; }))()`);
  const measure = (seat) => cdp.eval(`new Promise(res => {
    const empty = document.querySelector('.rt .st.empty[data-seat="${seat}"]');
    if (!empty) return res({ error:'no empty' });
    const tgt = empty.querySelector('.av-empty').getBoundingClientRect();
    const target = { x: tgt.left+tgt.width/2, y: tgt.top+tgt.height/2 };
    const imgsBefore = new Set([...document.querySelectorAll('.rt img')]);
    const tClick = performance.now(); let headAt=null, settled=null, pendAt=null, nearAt=null;
    empty.click(); if (document.querySelector('.rt .st.pend')) pendAt = performance.now();
    const movedNow = [...document.querySelectorAll('.rt .st .av')].some(n => { const r = n.getBoundingClientRect(); return Math.hypot((r.left+r.width/2)-target.x, (r.top+r.height/2)-target.y) < 8; });
    if (movedNow) nearAt = performance.now();
    const step = () => {
      const now = performance.now();
      const head = (document.querySelector('.rhead')||{}).textContent || '';
      if (head.includes('${seat}號座') && headAt==null) headAt = now;
      const node = document.querySelector('.rt .st[data-seat="${seat}"]');
      const av = node && (node.querySelector('.av') || node.querySelector('.av-empty'));
      let dist = null; if (av) { const r = av.getBoundingClientRect(); dist = Math.hypot((r.left+r.width/2)-target.x, (r.top+r.height/2)-target.y); }
      if (nearAt==null) {
        const moved = [...document.querySelectorAll('.rt .st .av')].some(n => { const r = n.getBoundingClientRect(); return Math.hypot((r.left+r.width/2)-target.x, (r.top+r.height/2)-target.y) < 8; });
        if (moved) nearAt = now;
      }
      const inline = node && (node.style.transform || node.style.transition);
      if (headAt!=null && dist!=null && dist<8 && !inline && settled==null) settled = now;
      if (now-tClick>2500 || (settled && now-settled>30)) {
        const imgs = [...document.querySelectorAll('.rt img')];
        return res({ clickToHead: headAt==null?null:Math.round(headAt-tClick), headToSettled: (headAt&&settled)?Math.round(settled-headAt):null, clickToAvatar: nearAt==null?null:Math.round(nearAt-tClick), clickToPend: pendAt==null?null:Math.round(pendAt-tClick), newImgs: imgs.filter(im => !imgsBefore.has(im)).length, icons: document.querySelectorAll('.seat-mic').length });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })`);
  for (const seat of [9, 6]) {
    const m = await measure(seat);
    assert(m.clickToHead != null && m.clickToHead < 80, 'header ' + m.clickToHead);
    assert(m.clickToAvatar != null && m.clickToAvatar < 20, 'pending avatar is on the seat before the round trip ' + m.clickToAvatar);
    assert(m.headToSettled != null && m.headToSettled < 40, 'confirmed seat settles in ' + m.headToSettled + 'ms');
    assert(m.newImgs === 0, 'image reused');
    assert(m.icons === 0, 'move does not add mic icons while mode is off');
    console.log('ok -', seat, JSON.stringify(m));
  }
  const numsAfter = await cdp.eval(`(() => [...document.querySelectorAll('.rt > .no')].map(n => { const r=n.getBoundingClientRect(); return { seat:n.dataset.seat, x:r.left+r.width/2, y:r.top+r.height/2, inside:!!n.closest('.st') }; }))()`);
  assert(numsBefore.length === 10 && numsAfter.every(n => { const w = numsBefore.find(x => x.seat === n.seat); return w && !n.inside && Math.hypot(n.x-w.x, n.y-w.y) <= 1.5; }), 'numbers stayed on their physical seats');
  const rival = io(APP, { transports: ['websocket'], forceNew: true });
  const rid = 'seatb' + Math.random().toString(36).slice(2, 8);
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('rival')), 8000); rival.on('connect', () => { clearTimeout(t); res(); }); });
  const ack = (ev, data) => new Promise(r => rival.emit(ev, data, r));
  await ack('hello', { pid: rid, name: '佔座', avatar: 'panda' });
  const code = await cdp.eval(`document.querySelector('.top-code').textContent`);
  assert((await ack('join', { code })).room === code, 'rival joined');
  const rivalSit = ack('act', { type: 'sit', data: { seat: 4 } });
  const chromeSit = cdp.eval(`new Promise(res => {
    const empty = document.querySelector('.rt .st.empty[data-seat="4"]');
    if (!empty) return res({ missing: 1 });
    empty.click();
    const t0 = Date.now();
    const step = () => {
      const mine = [...document.querySelectorAll('.rt .st')].find(n => n.querySelector('.mepill'));
      const pend = document.querySelector('.rt .st.pend, .rt .st.sit-preview');
      const head = (document.querySelector('.rhead')||{}).textContent || '';
      if (!window.__av.sitPend && mine && (head.includes('4號座') || head.includes('6號座') || head.includes('7號座'))) return res({ seat: mine.dataset.seat, head });
      if (Date.now() - t0 > 4000) return res({ timeout: 1, seat: mine && mine.dataset.seat, head });
      setTimeout(step, 20);
    };
    setTimeout(step, 30);
  })`);
  const [rivalRes, chromeRes] = await Promise.all([rivalSit, chromeSit]);
  const winners = (rivalRes && rivalRes.ok ? 1 : 0) + (chromeRes && chromeRes.seat === '4' ? 1 : 0);
  assert(winners === 1 && !chromeRes.timeout, 'only one player keeps seat 4 ' + JSON.stringify({ rivalRes, chromeRes }));
  const burst = await cdp.eval(`new Promise(res => {
    const a = document.querySelector('.rt .st.empty[data-seat="8"]');
    const b = document.querySelector('.rt .st.empty[data-seat="7"]');
    a.click(); b.click();
    const t0 = Date.now();
    const step = () => {
      const mine = [...document.querySelectorAll('.rt .st')].find(n => n.querySelector('.mepill'));
      const head = (document.querySelector('.rhead')||{}).textContent || '';
      if (mine && mine.dataset.seat === '7' && head.includes('7號座') && !window.__av.sitPend) return res(1);
      if (Date.now() - t0 > 4000) return res(0);
      setTimeout(step, 30);
    };
    setTimeout(step, 40);
  })`);
  assert(burst === 1, 'the later tap wins and the earlier one does not stick');
  rival.close();
  try { cdp.ws.close(); } catch (e) {}
  killAll();
  console.log('SEAT FEEDBACK PASSED');
  process.exit(0);
})().catch(e => { console.error('FAILED', e); killAll(); process.exit(1); });
