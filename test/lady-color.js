// The private evil lake result is a crimson card. Good stays blue, and others never receive the side.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3459;
const CDP = 9481;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/lady-color-' + Date.now();
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
  const names = ['甲','乙','丙','丁','戊','己','庚','辛'];
  const people = [];
  for (let i = 0; i < 8; i++) {
    const guestKey = 'lc' + i + Date.now().toString(36);
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#ffffff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i] });
  }
  const bots = people.map(p => bot(p.guestKey, p.name));
  await Promise.all(bots.map(b => b.ready));
  const made = await bots[0].emit('create', {});
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  await bots[0].act('capacity', { n: 8 });
  const code = made.room;
  for (let i = 1; i < 8; i++) {
    await bots[i].emit('join', { code });
    if (!(await bots[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit');
  }
  if (!(await bots[0].act('start')).ok) throw new Error('start');
  for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.me); i++) await sleep(40);
  const gme = () => bots[0].st.game;
  async function until(pred, label) {
    for (let i = 0; i < 80; i++) { if (pred()) return; await sleep(40); }
    throw new Error('timeout ' + label + ' ' + (gme() && gme().phase));
  }
  async function mission() {
    const g = gme();
    const team = g.seats.slice(0, g.teamSizes[g.round]).map(s => s.id);
    const leader = bots.find(b => b.st.meId === g.leaderId);
    if (!(await leader.act('propose', { team })).ok) throw new Error('propose');
    await until(() => gme().phase === 'vote', 'vote');
    for (const b of bots) {
      const r = await b.act('vote', { approve: true });
      if (!r.ok && !(r.error && /已經/.test(r.error))) throw new Error('vote');
    }
    await until(() => gme().phase === 'quest', 'quest');
    for (const b of bots) {
      if (!gme().team.includes(b.st.meId)) continue;
      if (!(await b.act('quest', { success: true })).ok) throw new Error('quest');
    }
    await until(() => gme().phase !== 'quest', 'after quest');
  }
  await mission();
  await mission();
  await until(() => gme().phase === 'lady', 'lady');
  const merlin = bots.find(b => b.st.game.me.role === 'merlin');
  const evilIds = new Set((merlin.st.game.me.knows || []).map(k => k.id));
  const ladyId = gme().ladyId;
  const target = [...evilIds].find(id => id !== ladyId);
  if (!target) throw new Error('no evil target');
  const holder = bots.find(b => b.st.meId === ladyId);
  const person = people[bots.indexOf(holder)];

  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-lady-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 15000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const profile = JSON.stringify({ name: person.name, avatar: 'fox', bg: '#ffffff', fx: 'spot', pendant: 'none' });
  await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP)})`);
  for (let i = 0; i < 50; i++) { if (await evalj(`!!document.querySelector('.rt')`).catch(() => false)) break; await sleep(120); }
  if (!(await holder.act('lady', { id: target })).ok) throw new Error('lady');
  for (let i = 0; i < 40; i++) { if (await evalj(`!!document.querySelector('#flip')`).catch(() => false)) break; await sleep(100); }
  await evalj(`document.querySelector('#flip').click()`);
  for (let i = 0; i < 20; i++) { if (await evalj(`document.querySelector('#flip').classList.contains('on')`)) break; await sleep(80); }
  await sleep(200);
  const look = await evalj(`(() => {
    const rn = document.querySelector('.rc.evil.lady-reveal .rn');
    const art = document.querySelector('.rc.evil.lady-reveal .art');
    const rc = document.querySelector('.rc.evil.lady-reveal');
    const color = getComputedStyle(rn).color;
    const align = getComputedStyle(rn).textAlign;
    const border = getComputedStyle(rc).borderTopColor;
    const bg = getComputedStyle(rc).backgroundImage;
    const filter = getComputedStyle(art).filter;
    const artBg = getComputedStyle(art).backgroundImage;
    rc.classList.remove('evil'); rc.classList.add('good'); rn.textContent = '好人陣營';
    const good = getComputedStyle(rn).color;
    const goodBorder = getComputedStyle(rc).borderTopColor;
    const goodBg = getComputedStyle(rc).backgroundImage;
    rc.classList.remove('good'); rc.classList.add('evil'); rn.textContent = '壞人陣營';
    return { text: rn.textContent, color, good, border, bg, filter, artBg, align, goodBorder, goodBg };
  })()`);
  assert(look.text === '壞人陣營', 'the private card says 壞人陣營');
  assert(look.color === 'rgb(255, 255, 255)', 'evil label is light on the crimson card (' + look.color + ')');
  assert(look.border === 'rgb(255, 48, 72)', 'evil card border is crimson (' + look.border + ')');
  assert(/228, 37, 60|e4253c/i.test(look.bg), 'evil card surface is a red gradient');
  assert(look.good === 'rgb(255, 255, 255)' && look.goodBorder === 'rgb(127, 176, 255)' && look.goodBg === 'none', 'good card keeps its own blue frame');
  assert(look.filter === 'none' && /lady/.test(look.artBg), 'the illustration stays the lake picture');
  assert(look.align === 'center', 'alignment is unchanged');
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'lady-evil-result.png'), Buffer.from(data, 'base64'));
  const others = bots.filter(b => b !== holder);
  assert(others.every(b => (b.st.game.ladyLog || []).every(l => l.side == null)), 'other players are not told the side');
  assert(holder.st.game.ladyLog.some(l => l.side === 'evil' && l.target === target), 'the holder still receives the evil result');
  console.log('LADY COLOR TEST PASSED', look.border);
  try { ws.close(); } catch {}
  stop();
  bots.forEach(b => { try { b.s.close(); } catch {} });
})().catch(e => { console.error(e); process.exit(1); });
