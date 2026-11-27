// The host's 釋出座位 opener is a compact control at the bottom-right of the
// table card. A long bottom-seat name must stay clear of it on 375 and 390,
// in the lobby and mid-game. After the game ends it must not cover the
// settlement or the next-game dock.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3473;
const CDP = 9493;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/release-place-' + Date.now();
const OUT = '/opt/cursor/artifacts';
const LONG = '王家底部長名字呀';
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
  const names = ['甲房主', '乙', '丙', '丁', LONG, '己', '庚', '辛'];
  const people = [];
  for (let i = 0; i < 8; i++) {
    const guestKey = 'rp' + i + Date.now().toString(36);
    const pendant = i === 4 ? 'foxqiu' : 'none';
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#fff', fx: 'spot', pendant } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i], pendant });
  }
  const bots = people.map(p => bot(p.guestKey, p.name));
  await Promise.all(bots.map(b => b.ready));
  const made = await bots[0].emit('create', {});
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  assert(bots[0].st && bots[0].st.capacity === 8, 'room opens at 8 seats');
  for (let i = 1; i < 8; i++) {
    await bots[i].emit('join', { code: made.room });
    if (!(await bots[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit ' + (i + 1));
  }
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.seated === 8); i++) await sleep(40);

  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-release-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 15000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  const SAFE = { 375: { top: 50, bottom: 34 }, 390: { top: 47, bottom: 34 } };
  async function setSize(w, h) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    const safe = SAFE[w] || { top: 0, bottom: 0 };
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safe.top, left: 0, bottom: safe.bottom, right: 0 } });
  }
  async function asUser(person) {
    const profile = JSON.stringify({ name: person.name, avatar: 'fox', bg: '#fff', fx: 'spot', pendant: person.pendant || 'none' });
    for (let attempt = 0; attempt < 3; attempt++) {
      await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.guest', ${JSON.stringify(person.guestKey)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + '?g=' + Date.now())})`);
      for (let i = 0; i < 40; i++) { if (await evalj(`!!document.querySelector('.rt') && !!document.querySelector('[data-a="releaselist"]')`).catch(() => false)) return; await sleep(120); }
    }
    throw new Error('no room ' + await evalj(`document.body.innerText.replace(/\\s+/g,' ').slice(0,160)`).catch(() => ''));
  }
  async function quiet() {
    for (let i = 0; i < 8; i++) {
      const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`);
      if (!open) return;
      await evalj(`(() => { const b = document.querySelector('#modal #ok') || document.querySelector('#settle-x') || document.querySelector('#modal .btn'); if (b) b.click(); })()`);
      await sleep(120);
    }
  }
  async function shot(name) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
  }
  const overlap = (a, b) => a && b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
  const gap = (a, b) => {
    const dx = Math.max(a.l - b.r, b.l - a.r);
    const dy = Math.max(a.t - b.b, b.t - a.b);
    if (dx < 0 && dy < 0) return Math.max(dx, dy);
    if (dx < 0) return dy;
    if (dy < 0) return dx;
    return Math.hypot(dx, dy);
  };
  async function frameTable() {
    await evalj(`(() => {
      const btn = document.querySelector('[data-a="releaselist"]');
      const card = btn && btn.closest('.card');
      if (!card) return;
      const main = document.querySelector('main');
      const head = document.querySelector('.topbar');
      const headB = head ? head.getBoundingClientRect().bottom : 0;
      const fab = document.querySelector('.myrole-fab');
      const bar = document.querySelector('.bottombar');
      const limit = Math.min(
        fab ? fab.getBoundingClientRect().top : innerHeight,
        bar ? bar.getBoundingClientRect().top : innerHeight,
        innerHeight
      ) - 12;
      const scroller = main && getComputedStyle(main).position === 'fixed' ? main : document.scrollingElement;
      const delta = card.getBoundingClientRect().top - headB - 8;
      scroller.scrollTop += delta;
      const btnB = () => document.querySelector('[data-a="releaselist"]').getBoundingClientRect().bottom;
      for (let i = 0; i < 6 && btnB() > limit; i++) scroller.scrollTop += Math.ceil(btnB() - limit);
    })()`);
  }
  async function measure() {
    return evalj(`(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const btn = document.querySelector('[data-a="releaselist"]');
      const card = btn ? btn.closest('.card') : document.querySelector('.rt').closest('.card');
      const rt = card.querySelector('.rt');
      const seats = [...rt.querySelectorAll('.st')].map(s => {
        const face = s.querySelector('.av') || s.querySelector('.av-empty');
        const fr = face.getBoundingClientRect();
        const nm = s.querySelector('.nm');
        const nr = nm ? nm.getBoundingClientRect() : null;
        const pov = s.querySelector('.pov');
        const pr = pov ? pov.getBoundingClientRect() : null;
        return {
          seat: s.dataset.seat,
          name: nm ? nm.textContent : '',
          wide: nr ? nr.width : 0,
          cy: fr.top + fr.height / 2,
          nameBox: nr ? { l: nr.left, t: nr.top, r: nr.right, b: nr.bottom, w: nr.width, h: nr.height } : null,
          face: { l: fr.left, t: fr.top, r: fr.right, b: fr.bottom },
          pov: pr && pr.width > 1 ? { l: pr.left, t: pr.top, r: pr.right, b: pr.bottom } : null,
        };
      });
      const nums = [...rt.querySelectorAll(':scope > .no')].map(el => {
        const r = el.getBoundingClientRect();
        return { seat: el.dataset.seat, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
      });
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:-999px;padding-bottom:env(safe-area-inset-bottom)';
      document.body.appendChild(probe);
      const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      const fab = document.querySelector('.myrole-fab');
      const bar = document.querySelector('.bottombar');
      const dock = document.querySelector('.end-next');
      const legend = card.querySelector('.markleg');
      let hit = null;
      if (btn) {
        const bottom = seats.slice().sort((a, c) => c.cy - a.cy)[0];
        if (bottom && bottom.nameBox) {
          const x = (bottom.nameBox.l + bottom.nameBox.r) / 2;
          const y = (bottom.nameBox.t + bottom.nameBox.b) / 2;
          const node = document.elementFromPoint(x, y);
          hit = node ? (node.closest && node.closest('[data-a="releaselist"]') ? 'release' : (node.closest && node.closest('.nm') ? 'name' : node.className)) : 'none';
        }
      }
      const cs = btn ? getComputedStyle(btn) : null;
      return {
        iw: innerWidth, ih: innerHeight, inset,
        btn: btn ? box(btn) : null,
        text: btn ? btn.textContent.trim() : '',
        action: btn ? btn.getAttribute('data-a') : '',
        display: cs ? cs.display : '',
        card: box(card),
        seats, nums, hit,
        fab: fab ? box(fab) : null,
        bar: bar ? box(bar) : null,
        dock: dock ? box(dock) : null,
        legend: legend ? box(legend) : null,
        ended: !!(document.querySelector('.end-next') || document.querySelector('.endsum')),
      };
    })()`);
  }
  function assertPlace(tag, m) {
    const b = m.btn;
    assert(b && m.text === '釋出座位' && m.action === 'releaselist', tag + ' shows the release opener');
    assert(m.display !== 'block' || b.w < m.card.w * 0.6, tag + ' opener is not a stretched block');
    assert(b.w <= m.card.w * 0.55 && b.w >= 72 && b.w <= 160, tag + ' opener is compact (' + b.w.toFixed(0) + '×' + b.h.toFixed(0) + ')');
    assert(b.h >= 40 && b.h <= 52, tag + ' opener stays easy to tap (' + b.h.toFixed(0) + ')');
    assert(b.l >= m.card.l + m.card.w * 0.45, tag + ' opener sits in the right half');
    assert(m.card.r - b.r <= 22 && b.r <= m.card.r + 1, tag + ' opener is at the card’s right edge (' + (m.card.r - b.r).toFixed(1) + ')');
    assert(m.card.b - b.b <= 26 && m.card.b - b.b >= 4, tag + ' opener sits at the bottom of the card (' + (m.card.b - b.b).toFixed(1) + ')');
    assert(b.b <= m.ih - m.inset + 1, tag + ' opener clears the home indicator');
    if (m.bar) assert(b.b <= m.bar.t - 4, tag + ' opener stays above the lobby bar (' + b.b.toFixed(0) + '/' + m.bar.t.toFixed(0) + ')');
    if (m.fab) assert(!overlap(b, m.fab) && gap(b, m.fab) >= 8, tag + ' opener stays clear of the identity chip');
    const bottom = m.seats.slice().sort((a, c) => c.cy - a.cy)[0];
    assert(bottom && bottom.seat === '5', tag + ' the lowest seat is seat 5 (' + (bottom && bottom.seat) + ')');
    assert(bottom.name === LONG, tag + ' bottom seat keeps the long name');
    assert(bottom.wide >= 70, tag + ' long name uses the wide label (' + bottom.wide.toFixed(0) + ')');
    assert(bottom.nameBox && !overlap(bottom.nameBox, b) && gap(bottom.nameBox, b) >= 12, tag + ' long bottom name stays clear (' + gap(bottom.nameBox, b).toFixed(1) + 'px)');
    const num = m.nums.find(n => n.seat === bottom.seat);
    assert(num && !overlap(num, b) && gap(num, b) >= 8, tag + ' bottom seat number stays clear (' + (num && gap(num, b).toFixed(1)) + ')');
    assert(m.hit !== 'release', tag + ' the name is not covered by the opener (' + m.hit + ')');
    if (m.legend) {
      assert(!overlap(bottom.nameBox, m.legend) && gap(bottom.nameBox, m.legend) >= 12, tag + ' long bottom name stays clear of the status legend (' + gap(bottom.nameBox, m.legend).toFixed(1) + 'px)');
      for (const s of m.seats) {
        if (s.nameBox) assert(!overlap(s.nameBox, m.legend) && gap(s.nameBox, m.legend) >= 8, tag + ' seat ' + s.seat + ' name stays clear of the legend (' + gap(s.nameBox, m.legend).toFixed(1) + ')');
        if (s.pov) assert(!overlap(s.pov, m.legend), tag + ' seat ' + s.seat + ' charm stays clear of the legend');
      }
    }
    for (const s of m.seats) {
      assert(!overlap(s.face, b) && gap(s.face, b) >= 8, tag + ' seat ' + s.seat + ' face stays clear');
      if (s.nameBox) assert(!overlap(s.nameBox, b) && gap(s.nameBox, b) >= 8, tag + ' seat ' + s.seat + ' name stays clear (' + gap(s.nameBox, b).toFixed(1) + ')');
      if (s.pov) assert(!overlap(s.pov, b), tag + ' seat ' + s.seat + ' charm stays clear of the opener');
    }
    console.log('ok -', tag, 'gap', gap(bottom.nameBox, b).toFixed(1) + 'px', 'btn', b.w.toFixed(0) + '×' + b.h.toFixed(0));
  }

  try {
    await setSize(375, 812);
    await asUser(people[0]);
    await quiet();
    await frameTable();
    let m = await measure();
    assertPlace('lobby 375', m);
    await shot('release-lobby-375.png');
    await setSize(390, 844);
    await frameTable();
    m = await measure();
    assertPlace('lobby 390', m);
    await shot('release-lobby-390.png');

    await evalj(`document.querySelector('[data-a="releaselist"]').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('#rel-list-title')`)); i++) await sleep(50);
    assert(await evalj(`!!document.querySelector('#rel-list-title') && document.querySelector('#rel-list-title').textContent.includes('釋出座位')`), 'the compact control still opens the release list');
    await evalj(`document.querySelector('#rel-list-x').click()`);
    for (let i = 0; i < 20 && !(await evalj(`document.querySelector('#modal').classList.contains('hidden')`)); i++) await sleep(40);

    if (!(await bots[0].act('start')).ok) throw new Error('start');
    for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.phase); i++) await sleep(40);
    await setSize(375, 812);
    await asUser(people[0]);
    await quiet();
    await frameTable();
    m = await measure();
    assertPlace('mid-game 375', m);
    await shot('release-midgame-375.png');

    if ((await bots[0].act('endearly')).error) throw new Error('endearly');
    for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.phase === 'end'); i++) await sleep(50);
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('.end-next')`)); i++) await sleep(100);
    await quiet();
    await evalj(`(() => {
      const dock = document.querySelector('.end-next');
      const main = document.querySelector('main');
      const scroller = main && getComputedStyle(main).position === 'fixed' ? main : document.scrollingElement;
      const names = [...document.querySelectorAll('.rt .st .nm, .rt .lbl')];
      if (!dock || !scroller) return;
      const limit = dock.getBoundingClientRect().top - 10;
      for (let i = 0; i < 10; i++) {
        let low = 0;
        for (const n of names) low = Math.max(low, n.getBoundingClientRect().bottom);
        if (low <= limit) break;
        scroller.scrollTop += Math.ceil(low - limit);
      }
    })()`);
    const ended = await measure();
    assert(!ended.btn, 'after the game ends the release opener is gone');
    assert(ended.dock, 'the next-game dock is on screen');
    assert(await evalj(`!!document.querySelector('.endsum')`), 'settlement summary stays on the page');
    assert(ended.dock.b <= ended.ih + 1 && ended.dock.b >= ended.ih - ended.inset - 80, 'the dock sits on the bottom safe area');
    const covered = await evalj(`(() => {
      const dock = document.querySelector('.end-next').getBoundingClientRect();
      const nodes = [...document.querySelectorAll('button, .release-row')];
      return nodes.some(el => {
        if (!/釋出座位/.test(el.textContent || '')) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        return r.left < dock.right - 1 && r.right > dock.left + 1 && r.top < dock.bottom - 1 && r.bottom > dock.top + 1;
      });
    })()`);
    assert(!covered, 'nothing labeled 釋出座位 covers the next-game dock');
    await shot('release-ended-375.png');
    console.log('RELEASE PLACE TESTS PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
    bots.forEach(b => { try { b.s.close(); } catch {} });
  }
})().catch(e => { console.error(e); process.exit(1); });
