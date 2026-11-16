// Room QR, return home, and force-end live in the existing top-right menu.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3464;
const CDP = 9488;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/room-menu-' + Date.now();
const OUT = '/opt/cursor/artifacts';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function get(url) {
  return new Promise((resolve, reject) => http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject));
}
function bot(key, name) {
  const s = io(APP, { transports: ['websocket'], forceNew: true, query: { diff: '1' } });
  const c = { s, st: null, name };
  s.on('state', st => {
    if (st && st.__d) {
      if (!c.st || c.st.code !== st.code) return s.emit('resync');
      const m = { ...c.st };
      for (const k in st) if (k !== '__d' && k !== '__r' && k !== '__g') m[k] = st[k];
      (st.__r || []).forEach(k => delete m[k]);
      if (st.__g) { const g = { ...(m.game || {}) }; for (const k in st.__g) if (k !== '__r') g[k] = st.__g[k]; (st.__g.__r || []).forEach(k => delete g[k]); m.game = g; }
      st = m;
    }
    c.st = st;
  });
  c.emit = (ev, d) => new Promise(r => s.emit(ev, d, r));
  c.act = (type, data) => c.emit('act', { type, data });
  c.ready = new Promise((res, rej) => s.on('connect', async () => {
    const h = await c.emit('hello', { guestKey: key, name });
    if (!h || h.error) rej(new Error(h && h.error || 'hello')); else res(h);
  }));
  return c;
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', GM_EMAIL: '', GM_USER_ID: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let chrome;
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });
  const names = ['房主', '乙', '丙', '丁', '戊'];
  const people = [];
  for (let i = 0; i < 5; i++) {
    const guestKey = 'rm' + i + Date.now().toString(36);
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#fff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i] });
  }
  const bots = people.map(p => bot(p.guestKey, p.name));
  await Promise.all(bots.map(b => b.ready));
  const made = await bots[0].emit('create', {});
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  await bots[0].act('capacity', { n: 5 });
  const code = made.room;
  for (let i = 1; i < 5; i++) {
    await bots[i].emit('join', { code });
    if (!(await bots[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit');
  }

  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-menu-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
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
  async function asUser(person) {
    const profile = JSON.stringify({ name: person.name, avatar: 'fox', bg: '#fff', fx: 'spot', pendant: 'none' });
    for (let attempt = 0; attempt < 3; attempt++) {
      for (let i = 0; i < 30; i++) { if (await evalj(`!!document.querySelector('[data-a="create"], .rt')`).catch(() => false)) break; await sleep(80); }
      const marker = '?m=' + person.user.id + attempt;
      await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + marker)})`);
      for (let i = 0; i < 40; i++) {
        const ready = await evalj(`location.href.includes(${JSON.stringify(marker)}) && !!document.querySelector('.rt') && !!document.querySelector('.top-more')`).catch(() => false);
        if (ready) return;
        await sleep(120);
      }
    }
    throw new Error('no room');
  }
  async function quiet() {
    for (let i = 0; i < 6; i++) {
      const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`);
      if (!open) return;
      await evalj(`(() => { const b = document.querySelector('#room-menu-close') || document.querySelector('#act-cancel') || document.querySelector('#modal #ok') || document.querySelector('#modal .btn'); if (b) b.click(); })()`);
      await sleep(100);
    }
  }
  async function shot(name) { const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); }
  const openMenu = async () => {
    await evalj(`document.querySelector('.top-more').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('.room-menu')`)); i++) await sleep(40);
    await sleep(80);
  };
  const menuLabels = () => evalj(`[...document.querySelectorAll('.room-menu .mrow b')].map(b => b.textContent).join('|')`);
  const inlineGone = () => evalj(`[...document.querySelectorAll('#app button')].some(b => /房間二維碼|返回主頁|強制結束/.test(b.textContent))`);
  const key = (k) => evalj(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }))`);

  try {
    await setSize(375, 812);
    await asUser(people[0]);
    await quiet();
    assert(await evalj(`document.querySelectorAll('.top-more').length === 1 && document.querySelectorAll('.top-inv').length === 1`), 'the existing top-right invite and menu stay');
    const phaseBefore = bots[0].st.game && bots[0].st.game.phase;
    await openMenu();
    let labels = await menuLabels();
    assert(labels.includes('查看規則') && labels.includes('解散房間') && !labels.includes('強制結束本局') && !labels.includes('房間二維碼'), 'lobby menu has no in-game trio (' + labels + ')');
    assert(phaseBefore === (bots[0].st.game && bots[0].st.game.phase) && !(await evalj(`!!document.querySelector('.qr')`)), 'opening the menu does nothing');
    await key('Escape');
    await sleep(60);
    assert(!(await evalj(`!!document.querySelector('.room-menu')`)), 'Escape closes the menu');

    if (!(await bots[0].act('start')).ok) throw new Error('start');
    for (let i = 0; i < 40 && !(bots[1].st.game && bots[1].st.game.me); i++) await sleep(40);
    const livePhase = () => bots[1].st.game && bots[1].st.game.phase;

    await setSize(390, 844);
    await asUser(people[1]);
    await quiet();
    assert(!(await inlineGone()), 'the three controls are gone from the game page');
    const before = livePhase();
    await openMenu();
    labels = await menuLabels();
    assert(labels.includes('房間二維碼') && labels.includes('返回主頁') && !labels.includes('強制結束本局'), 'a non-host sees QR and home, not force-end (' + labels + ')');
    assert(livePhase() === before && !(await evalj(`!!document.querySelector('img.qr, #actconf')`)), 'opening the menu still does not navigate or end the game');
    const fit = await evalj(`(() => {
      const sheet = document.querySelector('.sheet');
      const close = document.querySelector('#room-menu-close');
      const sr = sheet.getBoundingClientRect();
      const cr = close.getBoundingClientRect();
      const active = document.activeElement && document.activeElement.classList.contains('mrow');
      const box = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)].join(',');
      return { sheet: sr.left >= -1 && sr.right <= innerWidth + 1 && sr.top >= -1 && sr.bottom <= innerHeight + 1, close: cr.top >= 0 && cr.bottom <= innerHeight + 1 && cr.height > 20, active, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sr: box(sr), cr: box(cr), ih: innerHeight };
    })()`);
    assert(fit.sheet && fit.close && fit.active, 'menu fits and focuses a row at 390 ' + JSON.stringify(fit));
    assert(fit.sw <= fit.cw + 1, '390 menu does not overflow');
    await shot('room-menu-390.png');
    await evalj(`document.querySelector('#modal').click()`);
    await sleep(60);
    assert(!(await evalj(`!!document.querySelector('.room-menu')`)) && livePhase() === before, 'clicking outside closes the menu without an action');

    await setSize(375, 812);
    await openMenu();
    const fit375 = await evalj(`(() => {
      const close = document.querySelector('#room-menu-close').getBoundingClientRect();
      return { close: close.bottom <= innerHeight + 1 && close.top >= 0, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    })()`);
    assert(fit375.close && fit375.sw <= fit375.cw + 1, 'menu fits at 375 ' + JSON.stringify(fit375));
    await evalj(`document.querySelector('.room-menu [data-x="qr"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('img.qr')`)); i++) await sleep(40);
    const qr = await evalj(`(() => { const img = document.querySelector('img.qr'); return { src: img && img.getAttribute('src') || '', text: document.querySelector('#sheet').innerText }; })()`);
    assert(qr.src.includes('/api/qr') && qr.text.includes(code), 'QR entry still shows this room code');
    await evalj(`document.querySelector('#modal').click()`);
    await sleep(40);
    await openMenu();
    await evalj(`document.querySelector('.room-menu [data-x="home"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('[data-a="toroom"]')`)); i++) await sleep(40);
    assert(await evalj(`!!document.querySelector('[data-a="toroom"]') && !document.querySelector('.room-menu')`), 'return home keeps the room rejoin card');
    assert(livePhase() === before, 'return home does not leave the match');
    await evalj(`document.querySelector('[data-a="toroom"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('.rt')`)); i++) await sleep(40);
    assert(await evalj(`!!document.querySelector('.top-more')`), 'rejoin returns to the room menu');

    const denied = await bots[1].act('abort');
    assert(denied && denied.error && !denied.ok && livePhase() === before, 'the server rejects force-end from a non-host');

    await asUser(people[0]);
    await quiet();
    await evalj(`window.confirm = () => { throw new Error('native confirm'); }; true`);
    await openMenu();
    labels = await menuLabels();
    assert(labels.includes('強制結束本局') && labels.includes('房間二維碼') && labels.includes('返回主頁'), 'the host menu has all three (' + labels + ')');
    assert(await evalj(`document.querySelector('.room-menu [data-x="abort"]').classList.contains('danger')`), 'force-end is marked destructive');
    await shot('room-menu-host-375.png');
    await evalj(`document.querySelector('.room-menu [data-x="abort"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('#abort-title')`)); i++) await sleep(40);
    assert(await evalj(`document.querySelector('#abort-title').textContent.includes('強制結束') && document.querySelector('#act-ok').textContent === '確認結束'`), 'force-end asks in the app');
    assert(livePhase() === before, 'the confirm sheet has not ended the game');
    await shot('abort-confirm-375.png');
    await evalj(`document.querySelector('#act-cancel').click()`);
    await sleep(80);
    assert(!(await evalj(`!!document.querySelector('#actconf')`)) && livePhase() === before, 'cancel leaves the game running');
    await openMenu();
    await evalj(`document.querySelector('.room-menu [data-x="abort"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('#act-cancel')`)); i++) await sleep(40);
    await key('Escape');
    await sleep(60);
    assert(!(await evalj(`!!document.querySelector('#actconf')`)) && livePhase() === before, 'Escape on the confirm does not end the game');
    await openMenu();
    await evalj(`document.querySelector('.room-menu [data-x="abort"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('#act-ok')`)); i++) await sleep(40);
    await evalj(`document.querySelector('#modal').click()`);
    await sleep(60);
    assert(!(await evalj(`!!document.querySelector('#actconf')`)) && livePhase() === before, 'backdrop does not end the game');
    await openMenu();
    await evalj(`document.querySelector('.room-menu [data-x="abort"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('#act-ok')`)); i++) await sleep(40);
    await evalj(`document.querySelector('#act-ok').click()`);
    for (let i = 0; i < 40 && bots[1].st.game; i++) await sleep(40);
    assert(!bots[1].st.game, 'confirming force-end clears the match');
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('[data-a="start"]')`)); i++) await sleep(50);
    assert(await evalj(`!!document.querySelector('[data-a="start"]')`) && !(await inlineGone()), 'the room returns to the lobby without the inline button');
    console.log('ROOM MENU TESTS PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
    bots.forEach(b => { try { b.s.close(); } catch {} });
  }
})().catch(e => { console.error(e); process.exit(1); });
