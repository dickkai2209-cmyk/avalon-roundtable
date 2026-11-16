// Live status marks follow the real leader, lady, sword, team and submitted vote.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3458;
const CDP = 9479;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/marks-' + Date.now();
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
  const pendants = ['crown','bow','santa','holly','wolf','pumpkin','devil','flower'];
  const people = [];
  for (let i = 0; i < 8; i++) {
    const guestKey = 'mk' + i + Date.now().toString(36);
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#fff4e8', fx: 'spot', pendant: pendants[i] === 'flower' ? 'bow' : pendants[i] } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i] });
  }
  const photo = fs.readFileSync(path.join(__dirname, '../public/img/av/panda.webp')).toString('base64');
  const put = await fetch(APP + 'api/me', { method: 'PUT', headers: { authorization: 'Bearer ' + people[0].token, 'content-type': 'application/json' }, body: JSON.stringify({ photo: 'data:image/webp;base64,' + photo, pendant: 'crown' }) }).then(r => r.json());
  if (!put.user || put.user.avatar !== 'photo') throw new Error('photo ' + JSON.stringify(put).slice(0, 180));
  const watcherKey = 'mkwatch' + Date.now().toString(36);
  const watcher = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey: watcherKey, profile: { name: '觀戰', avatar: 'cat', bg: '#ffffff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
  const bots = people.map(p => bot(p.guestKey, p.name));
  const spec = bot(watcherKey, '觀戰');
  await Promise.all([...bots, spec].map(b => b.ready));
  const made = await bots[0].emit('create', {});
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  await bots[0].act('capacity', { n: 8 });
  await bots[0].act('settings', { lady: true, excalibur: true });
  const code = made.room;
  for (let i = 1; i < 8; i++) {
    await bots[i].emit('join', { code });
    if (!(await bots[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit');
  }
  await spec.emit('join', { code });
  if (!(await bots[0].act('start')).ok) throw new Error('start');
  for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.me); i++) await sleep(40);
  const gme = () => bots[0].st.game;
  async function until(pred, label) {
    for (let i = 0; i < 80; i++) { if (pred()) return; await sleep(40); }
    throw new Error('timeout ' + label + ' ' + (gme() && gme().phase));
  }
  async function propose(approve, limit) {
    const g = gme();
    const team = g.seats.slice(0, g.teamSizes[g.round]).map(s => s.id);
    const leader = bots.find(b => b.st.meId === g.leaderId);
    if (!(await leader.act('propose', { team })).ok) throw new Error('propose');
    await until(() => gme().phase === 'vote', 'vote');
    let n = 0;
    for (const b of bots) {
      if (limit != null && n >= limit) break;
      const r = await b.act('vote', { approve });
      if (!r.ok && !(r.error && /已經/.test(r.error))) throw new Error('vote ' + JSON.stringify(r));
      n++;
    }
  }

  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-marks-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 15000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  async function setSize(w, h) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }); }
  async function asUser(person) {
    const profile = JSON.stringify({ name: person.name || person.user.name, avatar: 'fox', bg: '#fff4e8', fx: 'spot', pendant: 'crown' });
    await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + '?m=' + Date.now())})`);
    for (let i = 0; i < 50; i++) { if (await evalj(`!!document.querySelector('.rt .st .av, [data-a="create"]')`).catch(() => false) && await evalj(`!!document.querySelector('.markleg, .specbar')`).catch(() => false)) return; await sleep(120); }
    throw new Error('no table for ' + (person.name || ''));
  }
  async function quiet() {
    for (let i = 0; i < 8; i++) {
      const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`);
      if (!open) break;
      await evalj(`(() => { const b = document.querySelector('#modal #ok') || document.querySelector('#modal .btn'); if (b) b.click(); const x = document.querySelector('.vote-remind-x'); if (x) x.click(); })()`);
      await sleep(180);
    }
    await evalj(`(() => { const el = document.querySelector('.rt'); const main = document.querySelector('main'); if (!el || !main) return; const card = el.closest('.card') || el; main.scrollTop = Math.max(0, card.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 4); })()`);
    await sleep(80);
  }
  async function shot(name) { await quiet(); const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); }
  const nums = () => evalj(`JSON.stringify([...document.querySelectorAll('.rt > .no')].map(n => { const r = n.getBoundingClientRect(); return [n.dataset.seat, Math.round(r.left), Math.round(r.top), !!n.closest('.st')]; }))`);
  const view = () => evalj(`(() => {
    const leg = document.querySelector('.markleg');
    const seats = [...document.querySelectorAll('.rt .st[data-sid]')].map(s => {
      const av = s.querySelector('.av').getBoundingClientRect();
      const box = (sel) => { const el = s.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, title: el.getAttribute('title') || '' }; };
      return { lead: s.classList.contains('is-lead'), lady: s.classList.contains('is-lady'), sword: s.classList.contains('is-sword'), team: s.classList.contains('team'), cast: s.classList.contains('is-cast'), photo: !!s.querySelector('.av img[src*="/api/avatar"]'), pendant: !!s.querySelector('.pov'), crown: box('.mark.crown'), wreath: box('.mark.wreath'), blade: box('.mark.sword'), ring: !!s.querySelector(':scope > .mark.ring'), tick: box('.mark.cast'), text: (s.querySelector('.mfront') || s).innerText, cx: av.left + av.width / 2, cy: av.top + av.height / 2, atop: av.top };
    });
    return { leg: leg ? leg.innerText.replace(/\\s+/g,'') : '', sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, seats, badge: !!document.querySelector('.sbadge') };
  })()`);
  const covers = (box, x, y) => box && x >= box.l && x <= box.r && y >= box.t && y <= box.b;

  try {
    for (let i = 0; i < 40 && !(await evalj(`!!document.querySelector('[data-a="create"]')`).catch(() => false)); i++) await sleep(100);
    await setSize(375, 812);
    await asUser(people[0]);
    let v = await view();
    assert(v.leg.includes('隊長') && v.leg.includes('湖中仙女') && v.leg.includes('王者之劍') && v.leg.includes('隊員') && v.leg.includes('已投票'), 'legend uses the five labels');
    assert(v.seats.filter(s => s.lead).length === 1 && v.seats.find(s => s.lead).crown && v.seats.find(s => s.lead).crown.title === '隊長', 'the leader wears the crown');
    assert(v.seats.filter(s => s.lady).length === 1 && v.seats.find(s => s.lady).wreath.title === '湖中仙女', 'the lady holder wears the wreath');
    assert(v.seats.every(s => !s.sword && !s.cast && !s.ring), 'sword, vote and team marks are absent before a proposal');
    assert(!v.badge, 'the old flag badges are gone');
    assert(v.seats.some(s => s.photo && s.pendant), 'a photo avatar keeps its pendant');
    const lead = v.seats.find(s => s.lead);
    assert(!covers(lead.crown, lead.cx, lead.cy) && lead.crown.b <= lead.atop + 10, 'the crown sits above the face');
    const lady = v.seats.find(s => s.lady);
    assert(!covers(lady.wreath, lady.cx, lady.cy), 'the wreath does not cover the face');
    const before = await nums();

    await propose(false, 3);
    await sleep(250);
    v = await view();
    const cast = v.seats.filter(s => s.cast);
    assert(cast.length === 3 && cast.every(s => s.tick && s.tick.title === '已投票' && !/贊成|反對/.test(s.text)), 'a submitted vote is only a white check');
    assert(v.seats.filter(s => s.team && s.ring).length === gme().team.length, 'selected members have the blue ring');
    assert(v.sw <= v.cw + 1, '375 does not overflow');
    const combo = v.seats.find(s => s.lead && s.team && s.cast) || v.seats.find(s => s.team && s.cast && s.lady) || v.seats.find(s => s.team && s.cast);
    assert(combo && !covers(combo.tick, combo.cx, combo.cy), 'the check stays off the middle of the face');
    await shot('marks-vote-375.png');
    await setSize(390, 844);
    await sleep(80);
    v = await view();
    assert(v.sw <= v.cw + 1, '390 does not overflow');
    await shot('marks-vote-390.png');
    await setSize(375, 812);

    await asUser(watcher);
    const specView = await view();
    assert(specView.seats.filter(s => s.cast).length === 3 && specView.seats.every(s => !/贊成|反對/.test(s.text)), 'a spectator sees who voted and not the choice');
    await asUser(people[0]);

    for (const b of bots) {
      const r = await b.act('vote', { approve: false });
      if (!r.ok && !(r.error && /已經/.test(r.error))) throw new Error(JSON.stringify(r));
    }
    await until(() => gme().phase === 'team', 'back to team');
    await sleep(200);
    v = await view();
    assert(v.seats.every(s => !s.cast && !s.ring), 'checks and team rings clear when the proposal fails');
    assert(v.seats.filter(s => s.lead).length === 1 && v.seats.find(s => s.lead).crown, 'the crown moves to the next leader');
    assert(await nums() === before, 'the number ring does not move');

    await propose(true);
    await until(() => gme().phase === 'sword', 'sword');
    const holder = gme().team.find(id => id !== gme().leaderId);
    const granter = bots.find(b => b.st.meId === gme().leaderId);
    if (!(await granter.act('sword', { id: holder })).ok) throw new Error('grant');
    await until(() => gme().phase === 'quest' && gme().sword === holder, 'quest');
    await sleep(200);
    v = await view();
    const armed = v.seats.find(s => s.sword);
    assert(armed && armed.blade.title === '王者之劍' && armed.team && !covers(armed.blade, armed.cx, armed.cy), 'the sword holder is marked without covering the face');
    assert(v.seats.every(s => !s.cast), 'vote checks are gone once the quest starts');
    assert(v.seats.filter(s => s.lady).length === 1, 'the wreath stays with the current lady');
    await shot('marks-quest-375.png');
    await setSize(390, 844);
    await shot('marks-quest-390.png');
    await setSize(375, 812);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await sleep(50);
    const motion = await evalj(`(() => { const g = document.querySelector('.mark.crown .glint'); const h = document.querySelector('.mark.crown .halo'); const gs = getComputedStyle(g), hs = getComputedStyle(h); return { g: gs.animationName, h: hs.animationName, op: hs.opacity }; })()`);
    assert(motion.g === 'none' && motion.h === 'none' && Number(motion.op) > 0.5, 'reduced motion keeps a static crown glow (' + JSON.stringify(motion) + ')');
    await shot('marks-reduced-375.png');
    console.log('STATUS MARK TESTS PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
    bots.concat(spec).forEach(b => { try { b.s.close(); } catch {} });
  }
})().catch(e => { console.error(e); process.exit(1); });
