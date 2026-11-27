// Optimistic lobby sit: the avatar occupies the tapped seat before the server
// ack, and a stale state must not put it back.
'use strict';
const { spawn } = require('child_process');
const { io } = require('socket.io-client');
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 41220 + (process.pid % 700);
const CDP_PORT = 51220 + (process.pid % 700);
const ROOT = path.join(__dirname, '..');
const DATA = '/tmp/av-opsit-' + process.pid;
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

const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
assert(html.includes('style.css?v=85') && html.includes('app.js?v=86'), 'app cache is 86 and css stays 85');
assert(!html.includes('app.js?v=85') && !html.includes('style.css?v=86'), 'live app 85 is not reused and css was not bumped');
assert(html.includes('og:image" content="https://avalon-roundtable-10t9.onrender.com/img/icon-192.png?v=73"') && html.includes('twitter:card" content="summary"'), 'share card stays summary with icon 73');
assert(appSrc.includes('const PD_V = 8'), 'pendant cache key stays 8');
assert(appSrc.includes('function applyOptimisticSit') && !appSrc.includes('function previewSit'), 'sit uses optimistic state instead of a transform preview');
assert(/case 'sit':[\s\S]{0,700}applyOptimisticSit\(/.test(appSrc), 'the sit click applies the optimistic seats before the ack');

(async () => {
  const srv = track(spawn(process.execPath, ['server.js'], { cwd: ROOT, detached: true, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }));
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  const t0 = Date.now(); while (!/on :/.test(log)) { if (Date.now() - t0 > 8000) throw new Error('server ' + log.slice(-400)); await sleep(40); }
  const APP = 'http://127.0.0.1:' + PORT + '/';
  const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return; await sleep(40); } throw new Error('timeout'); };
  function bot(name) {
    const s = io(APP, { transports: ['websocket'], forceNew: true });
    const c = { s, st: null, name };
    s.on('state', st => { if (st && !st.__d) c.st = st; });
    c.emit = (ev, data) => new Promise(r => s.emit(ev, data, r));
    c.act = (type, data) => c.emit('act', { type, data });
    c.ready = new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(name)), 8000); s.on('connect', async () => { clearTimeout(t); const h = await c.emit('hello', { pid: 'ops' + name + Math.random().toString(36).slice(2, 8), name, avatar: 'panda', bg: '#ffffff', fx: 'none', pendant: 'none' }); if (!h || h.error) rej(new Error((h && h.error) || name)); else res(h); }); });
    return c;
  }
  const host = bot('房主');
  const other = bot('佔座');
  await host.ready; await other.ready;
  const made = await host.emit('create');
  await until(() => host.st && host.st.capacity);
  assert((await host.act('capacity', { n: 5 })).ok, 'host shrinks to 5');
  await until(() => host.st.capacity === 5 && host.st.mySeat === 1);
  const code = made.room;

  const dir = '/tmp/chrome-opsit-' + process.pid; fs.mkdirSync(dir, { recursive: true });
  track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
  let page; for (let i = 0; i < 40 && !page; i++) { try { page = JSON.parse(await get('http://127.0.0.1:' + CDP_PORT + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!page) throw new Error('no chrome');
  const cdp = new Dev(page.webSocketDebuggerUrl); await cdp.ready(); await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const wait = async (expr, ms = 8000) => { const ok = await cdp.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { let v=0; try { v=(${expr}); } catch(e){} if (v) { clearInterval(t); r(1);} else if (Date.now()-t0>${ms}) { clearInterval(t); r(0);} }, 40); })`); if (!ok) throw new Error('wait ' + expr.slice(0, 140)); };
  await cdp.send('Page.navigate', { url: APP }); await wait(`document.querySelector('#app')`);
  await cdp.eval(`localStorage.setItem('cc.profile', JSON.stringify({name:'測客',avatar:'cat',bg:'#ffffff',fx:'spot',pendant:'none'})); localStorage.removeItem('cc.token'); localStorage.removeItem('cc.pid');`);
  await cdp.send('Page.navigate', { url: APP + '?room=' + code });
  await wait(`window.__av && window.__av.S && window.__av.S.code === '${code}' && window.__av.S.mySeat == null && document.querySelector('.rt .st.empty[data-seat="2"]')`);
  await cdp.eval(`(() => {
    const s = window.__av.socket;
    const orig = s.emit.bind(s);
    window.__holdSit = [];
    window.__sitHeld = true;
    s.emit = function (...args) {
      if (window.__sitHeld && args[0] === 'act' && args[1] && args[1].type === 'sit') { window.__holdSit.push(args); return s; }
      return orig(...args);
    };
    window.__releaseSit = () => { const args = window.__holdSit.shift(); if (!args) return 0; orig(...args); return 1; };
  })()`);
  const snap = (seat) => cdp.eval(`(() => {
    const S = window.__av.S;
    const node = document.querySelector('.rt .st[data-seat="${seat}"]');
    const me = S && S.meId;
    const mine = [...document.querySelectorAll('.rt .st')].filter(n => n.dataset.id === me);
    const av = node && node.querySelector('.av');
    const nr = node && node.getBoundingClientRect();
    const ar = av && av.getBoundingClientRect();
    const btn = document.querySelector('[data-a="ready"]');
    return {
      id: node && node.dataset.id, empty: !!(node && node.classList.contains('empty')), hasAv: !!av,
      me, mine: mine.map(n => n.dataset.seat), mySeat: S && S.mySeat, pend: window.__av.sitPend, gen: window.__av.sitGen,
      seated: S && S.seated, spectating: !!(S && S.spectating),
      ready: !!(S && (S.seats || []).find(s => s && s.id === me && s.ready)),
      enter: !!(node && node.classList.contains('enter')), enterN: document.querySelectorAll('.rt .st.enter').length,
      inline: node ? ((node.style.transform || '') + (node.style.transition || '')) : '',
      head: (document.querySelector('.rhead') || {}).textContent || '',
      dist: (nr && ar) ? Math.round(Math.hypot((ar.left + ar.width / 2) - (nr.left + nr.width / 2), (ar.top + ar.height / 2) - (nr.top + nr.height / 2))) : null,
      name: node && node.querySelector('.nm') && node.querySelector('.nm').textContent,
      held: window.__holdSit.length, btn: btn ? btn.textContent : '',
      lady: !!(S && S.settings && S.settings.lady)
    };
  })()`);
  const onSeat = (info, seat, msg) => {
    assert(info && info.mySeat === seat && info.id === info.me && info.hasAv && !info.empty, msg + ' ' + JSON.stringify(info));
    assert(info.mine.length === 1 && info.mine[0] === String(seat), msg + ' single seat ' + JSON.stringify(info));
    assert(!info.inline, msg + ' no transform is faking the seat ' + JSON.stringify(info));
    assert(!info.enter && info.enterN === 0 && info.head.includes(seat + '號座') && !info.spectating, msg + ' header ' + JSON.stringify(info));
  };

  await cdp.eval(`document.querySelector('.rt .st.empty[data-seat="2"]').click()`);
  const first = await snap(2);
  onSeat(first, 2, 'first sit is on the seat before ack');
  assert(first.pend === 2 && first.held === 1 && first.seated === 2 && first.name && first.name !== '空位', 'first sit updates seat, count, and name before ack ' + JSON.stringify(first));
  const meName = first.name;
  const lady = !host.st.settings.lady;
  assert((await host.act('settings', { lady })).ok, 'host toggles a setting');
  await until(async () => { const s = await snap(2); return s.lady === lady && s.pend === 2 && s.held === 1 && s.mySeat === 2; });
  const afterDiff = await snap(2);
  onSeat(afterDiff, 2, 'a diff without seats does not clear the pending sit');
  assert((await other.emit('join', { code })).room === code, 'other joined');
  assert((await other.act('sit', { seat: 4 })).ok, 'other sits 4');
  await until(() => other.st && other.st.mySeat === 4);
  await until(async () => {
    const name = await cdp.eval(`(() => { const n = document.querySelector('.rt .st[data-seat="4"] .nm'); return n && n.textContent; })()`);
    const s = await snap(2);
    return name === '佔座' && s.pend === 2 && s.mySeat === 2 && s.id === s.me && s.seated === 3;
  });
  const stale = await snap(2);
  onSeat(stale, 2, 'a stale seats diff does not snap the first sit back');
  assert(await cdp.eval(`window.__releaseSit()`) === 1, 'release first sit');
  await until(async () => { const s = await snap(2); return s.pend === 0 && s.held === 0 && s.mySeat === 2; });
  await until(() => host.st.seats && host.st.seats[1] && host.st.seats[1].name === meName);
  assert(host.st.seats[1].name === meName && !host.st.seats[1].ready, 'server agrees the first sit landed on 2');

  await cdp.eval(`document.querySelector('[data-a="ready"]').click()`);
  await until(async () => (await snap(2)).ready && (await snap(2)).btn.includes('已準備'));
  await cdp.eval(`document.querySelector('.rt .st.empty[data-seat="3"]').click()`);
  const moved = await snap(3);
  onSeat(moved, 3, 'move occupies the target before ack');
  assert(moved.pend === 3 && moved.held === 1 && !moved.ready && !moved.btn.includes('已準備'), 'moving clears ready immediately ' + JSON.stringify(moved));
  const old = await snap(2);
  assert(old.empty && !old.hasAv && old.id !== old.me, 'the previous seat is empty before ack ' + JSON.stringify(old));
  await cdp.eval(`new Promise(r => setTimeout(r, 220))`);
  const stayed = await snap(3);
  onSeat(stayed, 3, 'the seat transition does not slide the avatar back while pending');
  await cdp.eval(`(() => {
    window.__snap = false;
    const id = window.__av.S.meId;
    const obs = new MutationObserver(() => {
      const n = document.querySelector('.rt .st[data-seat="3"]');
      const mine = [...document.querySelectorAll('.rt .st')].find(x => x.dataset.id === id);
      if (!n || n.dataset.id !== id || !mine || mine.dataset.seat !== '3') window.__snap = true;
    });
    obs.observe(document.querySelector('#app'), { subtree: true, childList: true, attributes: true });
    window.__snapStop = () => { obs.disconnect(); return window.__snap; };
  })()`);
  assert((await other.act('ready', { ready: true })).ok, 'other readies and broadcasts seats');
  await until(() => other.st.seats && other.st.seats[3] && other.st.seats[3].ready);
  await sleep(180);
  const heldMove = await snap(3);
  onSeat(heldMove, 3, 'stale state while a move is pending keeps the new seat');
  assert(heldMove.pend === 3 && !heldMove.ready, 'pending move is still the newer seat ' + JSON.stringify(heldMove));
  assert((await cdp.eval(`window.__snapStop()`)) === false, 'the avatar never snapped back to the old seat');
  assert(await cdp.eval(`window.__releaseSit()`) === 1, 'release the move');
  await until(async () => { const s = await snap(3); return s.pend === 0 && s.mySeat === 3; });
  await until(() => host.st.seats[2] && host.st.seats[2].name === meName && host.st.seats[2].ready === false && host.st.seats[1] && host.st.seats[1].empty);
  assert(true, 'server move landed on 3 with ready cleared');

  const genBefore = await cdp.eval(`window.__av.sitGen`);
  await cdp.eval(`document.querySelector('.rt .st.empty[data-seat="2"]').click(); document.querySelector('.rt .st.empty[data-seat="5"]').click();`);
  const newer = await snap(5);
  onSeat(newer, 5, 'the newer click is shown immediately');
  assert(newer.pend === 5 && newer.held === 2 && newer.gen > genBefore, 'sitGen advanced and both acks are still held ' + JSON.stringify(newer));
  assert(await cdp.eval(`window.__releaseSit()`) === 1, 'release the older sit');
  await sleep(250);
  const afterOld = await snap(5);
  onSeat(afterOld, 5, 'the older ack does not revert the newer seat');
  assert(afterOld.pend === 5 && afterOld.held === 1, 'the newer sit is still pending ' + JSON.stringify(afterOld));
  assert(await cdp.eval(`window.__releaseSit()`) === 1, 'release the newer sit');
  await until(async () => { const s = await snap(5); return s.pend === 0 && s.mySeat === 5 && s.held === 0; });
  await until(() => host.st.seats[4] && host.st.seats[4].name === meName);
  assert(true, 'server kept the newer seat');

  await cdp.eval(`document.querySelector('.rt .st.empty[data-seat="2"]').click()`);
  const pendingFail = await snap(2);
  onSeat(pendingFail, 2, 'failed sit still paints before the rejection');
  assert((await other.act('sit', { seat: 2 })).ok, 'other takes seat 2 first');
  await until(() => other.st.mySeat === 2);
  assert(await cdp.eval(`window.__releaseSit()`) === 1, 'release the losing sit');
  await until(async () => {
    const s = await snap(5);
    const toast = await cdp.eval(`document.querySelector('#toast').textContent || ''`);
    return s.pend === 0 && s.mySeat === 5 && s.id === s.me && /已經有人/.test(toast);
  });
  await until(async () => (await cdp.eval(`document.querySelector('.rt .st[data-seat="2"] .nm') && document.querySelector('.rt .st[data-seat="2"] .nm').textContent`)) === '佔座');
  const reverted = await snap(5);
  onSeat(reverted, 5, 'a rejected sit restores the previous seat');
  assert(reverted.pend === 0, 'pending sit is cleared after the error');

  const fillA = bot('補甲');
  const fillB = bot('補乙');
  await fillA.ready; await fillB.ready;
  assert((await fillA.emit('join', { code })).room === code && (await fillB.emit('join', { code })).room === code, 'fillers joined');
  assert((await fillA.act('sit', { seat: 3 })).ok && (await fillB.act('sit', { seat: 4 })).ok, 'the table is full');
  await until(() => host.st.seated === 5);
  assert((await host.act('start')).ok, 'game starts');
  await until(async () => (await cdp.eval(`window.__av.S && window.__av.S.game && window.__av.S.game.phase`)) === 'team');
  await cdp.eval(`window.__sitHeld = false`);
  const blocked = await cdp.eval(`(() => {
    const before = window.__av.S.mySeat;
    const b = document.createElement('button');
    b.dataset.a = 'sit'; b.dataset.seat = '3';
    document.body.appendChild(b);
    b.click();
    const mine = document.querySelector('.rt .st[data-id="' + window.__av.S.meId + '"]');
    return { before, my: window.__av.S.mySeat, pend: window.__av.sitPend, seat: mine && mine.dataset.seat };
  })()`);
  assert(blocked.before === blocked.my && blocked.pend === 0 && blocked.seat === String(blocked.before), 'mid-game sit does not move locally ' + JSON.stringify(blocked));
  await wait(`/遊戲進行中/.test(document.querySelector('#toast').textContent || '')`);
  const still = await cdp.eval(`window.__av.S.mySeat`);
  assert(still === blocked.before, 'mid-game already-seated sit stays rejected');
  await until(() => host.st.game && host.st.game.phase === 'team' && host.st.seats[still - 1] && host.st.seats[still - 1].name === meName);
  assert(true, 'server still has the seated player on the same chair');

  try { cdp.ws.close(); } catch (e) {}
  host.s.close(); other.s.close(); fillA.s.close(); fillB.s.close();
  killAll();
  console.log('OPTIMISTIC SIT PASSED');
  process.exit(0);
})().catch(e => { console.error('FAILED', e); killAll(); process.exit(1); });
