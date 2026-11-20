// Waiting copy and the extra identity card are gone. The floating button still opens the private role.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3462;
const CDP = 9485;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/layout-' + Date.now();
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
  const names = ['甲','乙','丙','丁','戊'];
  const people = [];
  for (let i = 0; i < 5; i++) {
    const guestKey = 'gl' + i + Date.now().toString(36);
    const pendant = i === 2 ? 'bow' : 'none';
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#fff', fx: 'spot', pendant } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i], pendant });
  }
  const watchKey = 'glw' + Date.now().toString(36);
  const watcher = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey: watchKey, profile: { name: '觀戰', avatar: 'cat', bg: '#fff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
  const bots = people.map(p => bot(p.guestKey, p.name));
  const spec = bot(watchKey, '觀戰');
  await Promise.all([...bots, spec].map(b => b.ready));
  const made = await bots[0].emit('create', {});
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  await bots[0].act('capacity', { n: 5 });
  const code = made.room;
  for (let i = 1; i < 5; i++) {
    await bots[i].emit('join', { code });
    if (!(await bots[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit');
  }
  await spec.emit('join', { code });
  const crowd = bots.concat(spec);

  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-layout-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 15000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  const SAFE = { 375: { top: 50, bottom: 34 }, 390: { top: 47, bottom: 34 } };
  async function setSize(w, h) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    const safe = SAFE[w] || { top: 0, bottom: 0 };
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safe.top, left: 0, bottom: safe.bottom, right: 0 } });
  }
  async function assertFab(tag, safeBottom) {
    const m = await evalj(`(() => {
      const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const parse = (css) => { const m = String(css).match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/); return m ? [1, 2, 3].map(i => Number(m[i])) : null; };
      const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); };
      const blend = (fg, op, bg) => fg.map((c, i) => Math.round(c * op + bg[i] * (1 - op)));
      const page = parse(getComputedStyle(document.body).backgroundColor);
      const fab = document.querySelector('.myrole-fab');
      const cs = getComputedStyle(fab);
      const bg = parse(cs.backgroundColor);
      const op = parseFloat(cs.opacity) || 1;
      const label = fab.querySelector('span:last-child');
      const lc = parse(getComputedStyle(label).color);
      const fill = blend(bg, op, page);
      const r = fab.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const main = document.querySelector('main').getBoundingClientRect();
      const faces = [...document.querySelectorAll('.av')].filter(el => {
        const b = el.getBoundingClientRect();
        const top = Math.max(b.top, main.top), bot = Math.min(b.bottom, main.bottom);
        const left = Math.max(b.left, main.left), right = Math.min(b.right, main.right);
        if (bot - top < 4 || right - left < 4) return false;
        return !(bot <= r.top + 1 || top >= r.bottom - 1 || right <= r.left + 1 || left >= r.right - 1);
      }).length;
      const veto = document.createElement('button');
      veto.className = 'veto-fab dim';
      veto.innerHTML = '<span>回避卡</span>';
      document.body.appendChild(veto);
      const vcs = getComputedStyle(veto);
      const vfill = blend(parse(vcs.backgroundColor), parseFloat(vcs.opacity) || 1, page);
      const vink = parse(getComputedStyle(veto.querySelector('span')).color);
      const vbg = parse(vcs.backgroundColor);
      veto.remove();
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:-999px;padding-bottom:env(safe-area-inset-bottom)';
      document.body.appendChild(probe);
      const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      return {
        fillRatio: ratio(fill, page), textRatio: ratio(lc, bg),
        vetoFill: ratio(vfill, page), vetoText: ratio(vink, vbg),
        rect: { l: r.left, t: r.top, r: r.right, b: r.bottom },
        hit: !!(hit && fab.contains(hit)), faces,
        mainBottom: main.bottom, ih: innerHeight, iw: innerWidth,
        text: label.textContent, aria: fab.getAttribute('aria-label'),
        thumb: getComputedStyle(fab.querySelector('.mini-back')).backgroundImage,
        inset, pos: cs.position
      };
    })()`);
    assert(m.fillRatio >= 3, tag + ' identity button chrome contrasts with the page (' + m.fillRatio.toFixed(2) + ')');
    assert(m.textRatio >= 4.5, tag + ' identity label contrasts with the button (' + m.textRatio.toFixed(2) + ')');
    assert(m.vetoFill >= 3 && m.vetoText >= 4.5, tag + ' avoid button keeps the same contrast (' + m.vetoFill.toFixed(2) + '/' + m.vetoText.toFixed(2) + ')');
    assert(m.text === '我的身份' && m.aria === '我的身份' && /cardback/.test(m.thumb), tag + ' button keeps the card back and does not leak the role');
    assert(m.pos === 'fixed' && m.hit, tag + ' identity button is visible and not clipped');
    assert(m.rect.l > m.iw / 2 && m.rect.r <= m.iw - 8, tag + ' identity button stays in the bottom right');
    assert(m.rect.t >= 0 && m.rect.b <= m.ih - safeBottom + 1, tag + ' identity button clears the home indicator (' + m.rect.b.toFixed(0) + '/' + m.ih + ')');
    assert(m.faces === 0, tag + ' identity button does not cover a face');
    assert(m.mainBottom >= m.ih - safeBottom - 1 && m.mainBottom <= m.ih - safeBottom + 2, tag + ' scrollport ends at the home indicator (' + m.mainBottom.toFixed(0) + '/' + m.ih + ')');
    assert(m.mainBottom > m.rect.t + 8, tag + ' scrollport is not cut off above the identity chip');
    assert(m.inset + 0.5 >= safeBottom, tag + ' safe-area inset is applied (' + m.inset + ')');
  }
  const overlap = (a, b) => a && b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
  const inside = (a, b, pad = 1) => a.t >= b.t - pad && a.b <= b.b + pad && a.l >= b.l - pad && a.r <= b.r + pad;
  async function ringGeom(withVeto) {
    await evalj(`(() => { const m = document.querySelector('main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); })()`);
    return evalj(`(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const main = document.querySelector('main');
      const rt = document.querySelector('.rt');
      const card = rt.closest('.card');
      let veto = document.querySelector('.veto-fab');
      let injected = false;
      if (${withVeto ? 'true' : 'false'} && !veto) {
        veto = document.createElement('button');
        veto.className = 'veto-fab dim';
        veto.innerHTML = '<img alt="" width="22" height="30"><span>回避卡</span><b>1</b>';
        document.body.appendChild(veto);
        injected = true;
      }
      const vetoBox = veto ? box(veto) : null;
      if (injected) veto.remove();
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:-999px;padding-bottom:env(safe-area-inset-bottom)';
      document.body.appendChild(probe);
      const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      const seats = [...document.querySelectorAll('.rt .st')].map(s => {
        const parts = [];
        s.querySelectorAll('.av,.av-empty,.nm,.pov,.mark.crown,.mark.wreath,.mark.sword,.hostpill,.mepill,.lbl').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return;
          let hit = null;
          if (el.matches('.av,.av-empty')) {
            const x = r.left + r.width / 2;
            const y = r.bottom - Math.min(3, r.height / 3);
            const node = document.elementFromPoint(x, y);
            hit = !!(node && s.contains(node));
          }
          parts.push({ k: String(el.className).slice(0, 48), l: r.left, t: r.top, r: r.right, b: r.bottom, hit });
        });
        const face = s.querySelector('.av') || s.querySelector('.av-empty');
        const fr = face.getBoundingClientRect();
        return { seat: s.dataset.seat, name: (s.querySelector('.nm') || {}).textContent || '', cy: fr.top + fr.height / 2, parts };
      });
      const fab = document.querySelector('.myrole-fab');
      const bar = document.querySelector('.bottombar');
      return {
        ih: innerHeight, iw: innerWidth, inset, scroll: main.scrollTop,
        main: box(main), mainPos: getComputedStyle(main).position,
        card: box(card), rt: box(rt),
        fab: fab ? box(fab) : null, veto: vetoBox, bar: bar ? box(bar) : null,
        seats
      };
    })()`);
  }
  async function assertRing(tag, opts) {
    const g = await ringGeom(!!opts.chips);
    const blockers = [g.fab, g.veto, g.bar].filter(Boolean);
    const clip = opts.bar ? { l: -1, t: -1, r: g.iw + 1, b: g.bar.t } : g.main;
    assert(g.seats.length === opts.n, tag + ' shows ' + opts.n + ' seats (' + g.seats.length + ')');
    assert(g.scroll === 0, tag + ' starts at the top of the table');
    if (opts.chips) {
      assert(g.mainPos === 'fixed' && g.fab, tag + ' identity chip is on screen');
      assert(g.main.b >= g.ih - g.inset - 1 && g.main.b <= g.ih - g.inset + 2, tag + ' no white band above the home indicator (' + g.main.b.toFixed(0) + ')');
      assert(g.veto && g.veto.l < g.iw / 2 && g.fab.l > g.iw / 2, tag + ' chips stay on their corners');
    }
    if (opts.bar) assert(g.bar && g.bar.b >= g.ih - 2, tag + ' lobby bar sits on the viewport bottom');
    let low = null;
    for (const s of g.seats) {
      assert(s.parts.some(p => p.k.includes('nm') || p.k === 'nm'), tag + ' seat ' + s.seat + ' has a name');
      const lowSeat = s.cy > g.rt.t + g.rt.h * 0.62;
      for (const p of s.parts) {
        const pendant = String(p.k).includes('pov');
        if (!pendant || lowSeat) assert(inside(p, g.card, 1.5), tag + ' seat ' + s.seat + ' ' + p.k + ' stays inside the table card (' + p.b.toFixed(1) + '/' + g.card.b.toFixed(1) + ' l' + p.l.toFixed(1) + ' r' + p.r.toFixed(1) + ')');
        assert(inside(p, clip, 1.5), tag + ' seat ' + s.seat + ' ' + p.k + ' is not clipped (' + p.b.toFixed(1) + '/' + clip.b.toFixed(1) + ')');
        assert(p.b <= g.ih - g.inset + 1, tag + ' seat ' + s.seat + ' ' + p.k + ' clears the home indicator');
        for (const b of blockers) assert(!overlap(p, b), tag + ' seat ' + s.seat + ' ' + p.k + ' is not under a chip or bar');
        if (p.hit === false) assert(false, tag + ' seat ' + s.seat + ' ' + p.k + ' is painted over or clipped');
        if (!low || p.b > low.b) low = { seat: s.seat, k: p.k, b: p.b };
      }
    }
    const bottom = g.seats.filter(s => s.cy > g.rt.t + g.rt.h * 0.62);
    assert(bottom.length >= 1, tag + ' has a bottom seat to check');
    assert(low && low.b < clip.b - 2, tag + ' the lowest mark (' + (low && low.seat) + ' ' + (low && low.k) + ') is fully above the clip (' + (low && low.b.toFixed(1)) + '/' + clip.b.toFixed(1) + ')');
    if (opts.pendant) assert(g.seats.some(s => s.parts.some(p => String(p.k).includes('pov'))), tag + ' a pendant is on the table');
  }
  async function asUser(person) {
    const profile = JSON.stringify({ name: person.name, avatar: person.name === '觀戰' ? 'cat' : 'fox', bg: '#fff', fx: 'spot', pendant: person.pendant || 'none' });
    for (let attempt = 0; attempt < 3; attempt++) {
      for (let i = 0; i < 30; i++) { if (await evalj(`!!document.querySelector('[data-a="create"], .rt')`).catch(() => false)) break; await sleep(100); }
      await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + '?g=' + Date.now())})`);
      for (let i = 0; i < 40; i++) { if (await evalj(`!!document.querySelector('.rt')`).catch(() => false)) return; await sleep(120); }
    }
    throw new Error('no room ' + await evalj(`document.body.innerText.replace(/\\s+/g,' ').slice(0,120)`).catch(() => ''));
  }
  async function quiet() {
    for (let i = 0; i < 6; i++) {
      const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`);
      if (!open) return;
      await evalj(`(() => { const b = document.querySelector('#modal #ok') || document.querySelector('#modal .btn'); if (b) b.click(); })()`);
      await sleep(120);
    }
  }
  async function shot(name) { const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); }
  const pageText = () => evalj(`document.body.innerText`);

  try {
    async function waitSeats(n) {
      const ok = await evalj(`new Promise(r => { const t = setInterval(() => { if (document.querySelectorAll('.rt .st').length === ${n}) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 4000); })`);
      assert(ok, 'table shows ' + n + ' seats');
    }
    await setSize(375, 812);
    await asUser(people[0]);
    await quiet();
    await assertRing('lobby 375/5', { n: 5, bar: true, pendant: true });
    await shot('lobby-seats-5-375.png');
    await setSize(390, 844);
    await assertRing('lobby 390/5', { n: 5, bar: true, pendant: true });
    await shot('lobby-seats-5-390.png');
    assert((await bots[0].act('capacity', { n: 10 })).ok !== false, 'host can open 10 seats');
    await waitSeats(10);
    await setSize(375, 812);
    await assertRing('lobby 375/10', { n: 10, bar: true });
    await shot('lobby-seats-10-375.png');
    await setSize(390, 844);
    await assertRing('lobby 390/10', { n: 10, bar: true });
    await shot('lobby-seats-10-390.png');
    assert((await bots[0].act('capacity', { n: 5 })).ok !== false, 'host returns the room to 5 seats');
    await waitSeats(5);
    if (!(await bots[0].act('start')).ok) throw new Error('start');
    for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.me); i++) await sleep(40);
    await setSize(375, 812);
    await asUser(people[0]);
    await quiet();
    await assertRing('game 375/5', { n: 5, chips: true, pendant: true });
    await shot('midgame-seats-5-375.png');
    await setSize(390, 844);
    await assertRing('game 390/5', { n: 5, chips: true, pendant: true });
    await shot('midgame-seats-5-390.png');
    await setSize(375, 812);

    const leader = bots.find(b => b.st.meId === b.st.game.leaderId);
    const other = bots.find(b => b !== leader);
    await setSize(375, 812);
    await asUser(people[bots.indexOf(other)]);
    await quiet();
    let text = await pageText();
    assert(!text.includes('等待隊長組隊') && !text.includes('正在挑選') && !text.includes('大家可以討論'), 'the passive waiting card is gone');
    assert(!text.includes('我的身份卡') && !text.includes('點擊翻開查看'), 'the inline identity card is gone');
    assert(await evalj(`document.querySelectorAll('.rolestrip').length === 0 && document.querySelectorAll('[data-a="role"]').length === 1 && document.querySelector('[data-a="role"]').classList.contains('myrole-fab')`), 'the floating button is the only role entry');
    const flow = await evalj(`(() => {
      const table = document.querySelector('.rt').closest('.card');
      const hist = document.querySelector('#teamhist');
      const gap = hist.getBoundingClientRect().top - table.getBoundingClientRect().bottom;
      return { next: table.nextElementSibling && table.nextElementSibling.id, gap, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    })()`);
    assert(flow.next === 'teamhist' && flow.gap <= 12, 'team history follows the table (' + flow.gap + 'px)');
    assert(flow.sw <= flow.cw + 1, '375 does not overflow');
    await evalj(`document.querySelector('main').scrollTop = 0`);
    await assertFab('375', 34);
    await shot('myrole-fab-375.png');
    await evalj(`document.querySelector('.myrole-fab').click()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('#flip')`)); i++) await sleep(50);
    assert(await evalj(`!!document.querySelector('#flip')`), 'the floating button opens the private role');
    await quiet();
    await setSize(390, 844);
    await evalj(`document.querySelector('main').scrollTop = 0`);
    await assertFab('390', 34);
    await shot('myrole-fab-390.png');
    await setSize(375, 812);
    await evalj(`document.querySelector('#teamhist').scrollIntoView({ block: 'start' })`);
    await shot('layout-wait-375.png');

    await asUser(people[bots.indexOf(leader)]);
    await quiet();
    text = await pageText();
    assert(text.includes('你是隊長') && !!await evalj(`!!document.querySelector('[data-a="propose"]')`), 'the leader still has team controls');
    assert(!text.includes('我的身份卡'), 'the leader also has no duplicate identity card');
    await evalj(`document.querySelector('[data-a="propose"]').scrollIntoView({ block: 'center' })`);
    await shot('layout-leader-375.png');

    const g = leader.st.game;
    const team = g.seats.slice(0, g.teamSizes[g.round]).map(s => s.id);
    if (!(await leader.act('propose', { team })).ok) throw new Error('propose');
    for (let i = 0; i < 40 && !(other.st.game && other.st.game.phase === 'vote'); i++) await sleep(40);
    await asUser(people[bots.indexOf(other)]);
    await quiet();
    const remind = await evalj(`(() => { const el = document.querySelector('.vote-remind'); return el ? el.innerText : ''; })()`);
    assert(remind.includes('輪到你投票'), 'the vote reminder still appears');
    assert(await evalj(`!!document.querySelector('[data-a="vote"]')`), 'vote buttons remain');
    await shot('layout-vote-375.png');

    await asUser(watcher);
    await sleep(200);
    assert(await evalj(`!document.querySelector('[data-a="role"]') && !document.querySelector('.myrole-fab') && !document.querySelector('#flip')`), 'a spectator cannot open a private role');
    assert((await pageText()).includes('唔會看到隱藏身分'), 'spectators are told the role stays hidden');

    const names10 = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
    const p10 = [];
    for (let i = 0; i < 10; i++) {
      const guestKey = 'g10' + i + Date.now().toString(36);
      const pendant = i === 5 ? 'bow' : 'none';
      const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names10[i], avatar: 'fox', bg: '#fff', fx: 'spot', pendant } }) }).then(r => r.json());
      p10.push({ ...j, guestKey, name: names10[i], pendant });
    }
    const b10 = p10.map(p => bot(p.guestKey, p.name));
    crowd.push(...b10);
    await Promise.all(b10.map(b => b.ready));
    const made10 = await b10[0].emit('create', {});
    for (let i = 0; i < 30 && !(b10[0].st && b10[0].st.code); i++) await sleep(40);
    await b10[0].act('capacity', { n: 10 });
    for (let i = 1; i < 10; i++) {
      await b10[i].emit('join', { code: made10.room });
      if (!(await b10[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit10 ' + (i + 1));
    }
    if (!(await b10[0].act('start')).ok) throw new Error('start10');
    for (let i = 0; i < 40 && !(b10[0].st.game && b10[0].st.game.me); i++) await sleep(40);
    await setSize(375, 812);
    await asUser(p10[0]);
    await quiet();
    await assertRing('game 375/10', { n: 10, chips: true, pendant: true });
    await shot('midgame-seats-10-375.png');
    await setSize(390, 844);
    await assertRing('game 390/10', { n: 10, chips: true, pendant: true });
    await shot('midgame-seats-10-390.png');
    console.log('GAME LAYOUT TESTS PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
    crowd.forEach(b => { try { b.s.close(); } catch {} });
  }
})().catch(e => { console.error(e); process.exit(1); });
