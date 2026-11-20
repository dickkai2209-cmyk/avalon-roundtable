// Post-game ranks use the server scores. Saving the same game twice does not award MVP again.
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3463;
const CDP = 9487;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/settle-' + Date.now();
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
  const names = ['示範局'].concat(Array.from({ length: 9 }, (_, i) => '示範' + (i + 2)));
  const people = [];
  for (let i = 0; i < 10; i++) {
    const guestKey = 'st' + i + Date.now().toString(36);
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#fff', fx: 'spot', pendant: i === 0 ? 'crown' : 'none' } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i] });
  }
  const bots = people.map(p => bot(p.guestKey, p.name));
  await Promise.all(bots.map(b => b.ready));
  const made = await bots[0].emit('create', {});
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  await bots[0].act('capacity', { n: 10 });
  const code = made.room;
  for (let i = 1; i < 10; i++) {
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
      if (!(gme().team || []).includes(b.st.meId)) continue;
      if (!(await b.act('quest', { success: true })).ok) throw new Error('quest');
    }
    await until(() => gme().phase !== 'quest', 'after');
  }
  await mission();
  await mission();
  if (gme().phase === 'lady') {
    const holder = bots.find(b => b.st.meId === gme().ladyId);
    const target = gme().seats.find(s => s.id !== gme().ladyId);
    if (!(await holder.act('lady', { id: target.id })).ok) throw new Error('lady');
    await until(() => gme().phase === 'team', 'after lady');
  }
  await mission();
  await until(() => gme().phase === 'assassin', 'assassin');
  const merlin = bots.find(b => b.st.game.me.role === 'merlin');
  const assassin = bots.find(b => b.st.game.me.role === 'assassin');
  const viewer = bots.find(b => b !== assassin);

  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-settle-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 20000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT }).catch(() => {});
  // 375×812 uses the taller 12/13 mini inset; 390×844 uses iPhone 12/13/14.
  const SAFE = { 375: { top: 50, bottom: 34 }, 390: { top: 47, bottom: 34 } };
  let viewW = 375;
  async function setSize(w, h) {
    viewW = w;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    const safe = SAFE[w] || { top: 0, bottom: 0 };
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safe.top, left: 0, bottom: safe.bottom, right: 0 } }).catch(() => {});
    await forceSafe();
  }
  async function forceSafe() {
    const safe = SAFE[viewW] || { top: 0, bottom: 0 };
    let mode = '';
    for (let i = 0; i < 8 && !mode; i++) {
      try {
        mode = await evalj(`(() => {
          const el = document.createElement('div');
          el.style.cssText = 'position:absolute;left:-999px;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
          document.body.appendChild(el);
          const cs = getComputedStyle(el);
          const t = parseFloat(cs.paddingTop) || 0;
          const b = parseFloat(cs.paddingBottom) || 0;
          el.remove();
          let s = document.getElementById('safe-test');
          if (t >= ${safe.top} - 0.5 && b >= ${safe.bottom} - 0.5) { if (s) s.textContent = ''; return 'env'; }
          if (!s) { s = document.createElement('style'); s.id = 'safe-test'; document.head.appendChild(s); }
          s.textContent = ${JSON.stringify('.topbar{padding-top:' + safe.top + 'px !important}body{padding-bottom:' + safe.bottom + 'px !important}.settle-foot{padding-bottom:' + safe.bottom + 'px !important}main{padding-bottom:calc(16px + ' + safe.bottom + 'px) !important}')};
          return 'inject';
        })()`);
      } catch { await sleep(40); }
    }
    return mode;
  }
  async function asUser(person) {
    const profile = JSON.stringify({ name: person.name, avatar: 'fox', bg: '#fff', fx: 'spot', pendant: 'none' });
    for (let attempt = 0; attempt < 3; attempt++) {
      for (let i = 0; i < 30; i++) { if (await evalj(`!!document.querySelector('[data-a="create"], .rt')`).catch(() => false)) break; await sleep(80); }
      await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + '?s=' + person.user.id + attempt)})`);
      for (let i = 0; i < 40; i++) { if (await evalj(`!!document.querySelector('.rt')`).catch(() => false)) { await forceSafe(); return; } await sleep(120); }
    }
    throw new Error('no table');
  }
  async function shot(name) { const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); }
  async function detailFit(expectN) {
    const safe = SAFE[viewW] || { top: 0, bottom: 0 };
    await forceSafe();
    await sleep(30);
    return evalj(`(() => {
      document.querySelectorAll('.settle-page details[open]').forEach(d => { d.open = false; });
      const el = document.querySelector('.endsum');
      const bar = document.querySelector('.topbar');
      if (!el || !bar) return { visible: false, missing: true };
      const y = el.getBoundingClientRect().top + window.scrollY - bar.getBoundingClientRect().height;
      window.scrollTo(0, Math.max(0, y));
      const barB = bar.getBoundingClientRect().bottom;
      const limit = window.innerHeight - ${safe.bottom};
      const rows = [...document.querySelectorAll('.settle-page .settle-row')];
      const boxes = rows.map(r => {
        const b = r.getBoundingClientRect();
        return { rank: r.dataset.rank, top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), role: (r.querySelector('.who em') || {}).textContent || '', pts: (r.querySelector('.pts') || {}).textContent || '' };
      });
      const last = boxes[boxes.length - 1];
      const hero = document.querySelector('.endsum-hero').getBoundingClientRect();
      const me = document.querySelector('.endsum-me');
      const mvp = document.querySelector('.endsum-mvp');
      const visible = boxes.length === ${expectN} && hero.top >= barB - 2 && !!last && last.bottom <= limit + 1 && boxes.every(b => b.top >= barB - 1 && b.h > 0 && b.bottom <= limit + 1 && b.role && b.pts);
      return {
        visible, n: boxes.length,
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        ih: window.innerHeight, bar: Math.round(barB), limit: Math.round(limit),
        heroTop: Math.round(hero.top), heroH: Math.round(hero.height),
        meH: me ? Math.round(me.getBoundingClientRect().height) : 0,
        mvpH: mvp ? Math.round(mvp.getBoundingClientRect().height) : 0,
        rows: boxes, lastBottom: last ? last.bottom : null,
        hasMe: !!me, hasMvp: !!mvp,
        title: (document.querySelector('.endsum-hero h2') || {}).textContent || ''
      };
    })()`);
  }
  function assertFit(fit, label, n) {
    const safe = SAFE[viewW] || { top: 0, bottom: 0 };
    assert(fit && fit.visible && fit.n === n, label + ' shows all ' + n + ' collapsed names ' + JSON.stringify(fit));
    assert(fit.sw <= fit.cw + 1, label + ' does not overflow');
    assert(fit.bar >= safe.top + 52 - 2, label + ' keeps the top safe area ' + JSON.stringify({ bar: fit.bar, safe }));
    assert(fit.hasMe && fit.hasMvp && fit.heroH >= 70, label + ' keeps the victory header, personal card and MVP row');
  }

  try {
    await setSize(375, 812);
    await asUser(people[bots.indexOf(viewer)]);
    if (!(await assassin.act('assassinate', { id: merlin.st.meId })).ok) throw new Error('kill');
    await until(() => gme().phase === 'end' && gme().mvp, 'ended');
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('.settle')`).catch(() => false)); i++) await sleep(100);
    const board = await fetch(APP + 'api/leaderboard').then(r => r.json());
    assert(board && Array.isArray(board.players) && board.players.every(p => p.played != null && p.won != null && p.items == null && p.scores == null), 'home board is still wins and games, not this match\'s score lines');
    const info = await evalj(`(() => {
      const box = document.querySelector('#modal .settle');
      const rows = [...box.querySelectorAll('.settle-row')];
      const breaks = rows.map(row => {
        const ul = row.querySelector('.settle-break');
        const lines = [...ul.querySelectorAll('li:not(.sum)')].map(li => (li.dataset.label || '') + ' +' + (li.dataset.pts || ''));
        return { id: row.dataset.id, rank: row.dataset.rank, sum: ul.dataset.sum, total: ul.dataset.total, pts: row.querySelector('.pts').textContent, lines };
      });
      return {
        n: rows.length,
        cls: box.className,
        title: box.querySelector('h2').textContent,
        reason: box.querySelector('.settle-head p').textContent,
        you: box.querySelector('.settle-you').textContent,
        mvp: box.querySelector('.settle-mvp') ? box.querySelector('.settle-mvp').innerText.replace(/\\s+/g,' ') : '',
        me: box.querySelectorAll('.me').length,
        ranks: breaks.map(x => x.rank).join(','),
        rows: breaks,
        cards: box.querySelectorAll('img[src*="q_"]').length,
        fake: /亞軍|🥈|金牌|稱號/.test(box.innerText),
        foot: [...box.querySelectorAll('.settle-foot button')].map(b => b.textContent).join('|')
      };
    })()`);
    const serverScores = gme().scores;
    assert(info.n === 10, 'lists all 10 players');
    assert(info.ranks === '1,2,3,4,5,6,7,8,9,10', 'ranks are 1 through 10 (' + info.ranks + ')');
    const norm = (s) => String(s).replace(/\s+/g, '');
    const mismatch = info.rows.find(row => {
      const s = serverScores[row.id];
      if (!s) return true;
      const summed = s.items.reduce((a, it) => a + it[1], 0);
      return String(s.rank) !== row.rank || String(s.total) !== row.total || String(summed) !== row.sum || row.pts !== row.total || row.lines.length !== s.items.length || s.items.some((it, i) => row.lines[i] !== it[0] + ' +' + it[1]);
    });
    assert(!mismatch, 'every breakdown is the server score and adds up ' + (mismatch ? JSON.stringify({ mismatch, server: serverScores[mismatch.id] }) : ''));
    assert(info.me === 1, 'only the viewer has 我');
    assert(info.mvp.includes('MVP') && info.mvp.includes(gme().seats.find(s => s.id === gme().mvp).name), 'MVP summary names the server MVP');
    assert(info.title === '紅方勝利' && info.cls.includes('evil') && /刺中梅林/.test(info.reason), 'header is the winning side and the real reason (' + info.title + ' / ' + info.reason + ')');
    assert(/\d+號/.test(info.you) && /勝利|落敗/.test(info.you), 'viewer line has seat, role and result (' + info.you + ')');
    assert(info.cards === 0, 'settlement does not show quest cards');
    assert(!info.fake, 'settlement does not invent titles');
    assert(info.foot === '生成海報|知道了', 'footer buttons stay available');
    await shot('settle-rank-375.png');
    await evalj(`(() => {
      const row = document.querySelector('#modal .settle-row[data-rank="1"]');
      row.querySelector('summary').click();
      row.scrollIntoView({ block: 'center' });
    })()`);
    await sleep(80);
    await shot('settle-score-375.png');
    await evalj(`document.querySelector('#modal').classList.add('hidden')`);
    await setSize(375, 812);
    const room375 = await detailFit(10);
    assertFit(room375, 'in-room red 375', 10);
    await shot('settle-room-red-375.png');
    await setSize(390, 844);
    const room390 = await detailFit(10);
    assertFit(room390, 'in-room red 390', 10);
    await shot('settle-room-red-390.png');
    await setSize(375, 812);
    await evalj(`document.querySelector('#modal').classList.remove('hidden')`);
    async function fitAt(w, h) {
      await setSize(w, h);
      await sleep(60);
      return evalj(`(() => {
        window.scrollTo(0, 0);
        const box = document.querySelector('#modal .settle');
        const sc = box.querySelector('.settle-scroll');
        const foot = box.querySelector('.settle-foot');
        const last = box.querySelector('.settle-row[data-rank="10"]');
        const details = last.querySelector('details');
        if (details && !details.open) details.querySelector('summary').click();
        sc.scrollTop = sc.scrollHeight;
        const lr = last.getBoundingClientRect();
        const fr = foot.getBoundingClientRect();
        const sr = sc.getBoundingClientRect();
        return {
          visible: lr.top >= sr.top - 1 && lr.bottom <= Math.min(fr.top, sr.bottom) + 1 && fr.bottom <= window.innerHeight + 1 && fr.top < window.innerHeight,
          sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
          last: Math.round(lr.top) + '-' + Math.round(lr.bottom), foot: Math.round(fr.top) + '-' + Math.round(fr.bottom)
        };
      })()`);
    }
    const fit390 = await fitAt(390, 844);
    assert(fit390.visible, 'rank 10 stays above the footer at 390 ' + JSON.stringify(fit390));
    assert(fit390.sw <= fit390.cw + 1, '390 does not overflow');
    await shot('settle-rank10-390.png');
    const fit375 = await fitAt(375, 812);
    assert(fit375.visible, 'rank 10 stays above the footer at 375 ' + JSON.stringify(fit375));
    assert(fit375.sw <= fit375.cw + 1, '375 does not overflow');
    await shot('settle-rank10-375.png');

    const beforeFiles = new Set(fs.readdirSync(OUT));
    await evalj(`document.querySelector('#settle-poster').click()`);
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('#dl')`).catch(() => false)); i++) await sleep(100);
    await evalj(`document.querySelector('#dl').click()`);
    let poster = null;
    for (let i = 0; i < 25 && !poster; i++) {
      poster = fs.readdirSync(OUT).find(f => !beforeFiles.has(f) && f.startsWith('mongkok-avalon-') && f.endsWith('.png'));
      if (!poster) await sleep(200);
    }
    if (!poster) {
      const b64 = await evalj(`(async () => { const img = document.querySelector('.modal img'); const buf = await fetch(img.src).then(r => r.arrayBuffer()); const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); })()`);
      poster = 'mongkok-avalon-' + gme().gid.slice(0, 8) + '.png';
      fs.writeFileSync(path.join(OUT, poster), Buffer.from(b64, 'base64'));
    }
    const bytes = fs.readFileSync(path.join(OUT, poster));
    assert(bytes.slice(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes.length > 20000, 'poster file is a real png');
    fs.copyFileSync(path.join(OUT, poster), path.join(OUT, 'settle-poster.png'));
    console.log('poster', poster, bytes.length);

    await evalj(`document.querySelector('#backBtn') && document.querySelector('#modal').classList.add('hidden')`);
    await evalj(`(() => { const b = document.querySelector('#backBtn'); if (b && !b.classList.contains('hidden')) b.click(); })()`);
    for (let i = 0; i < 20 && !(await evalj(`!!document.querySelector('[data-a="go"][data-v="history"]')`).catch(() => false)); i++) {
      await evalj(`(() => { const b = document.querySelector('#backBtn'); if (b && !b.classList.contains('hidden')) b.click(); })()`);
      await sleep(80);
    }
    await evalj(`document.querySelector('[data-a="go"][data-v="history"]').click()`);
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('.hitem')`)); i++) await sleep(80);
    await evalj(`document.querySelector('.hitem').click()`);
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('.settle-page .settle-row')`)); i++) await sleep(80);
    const again = await evalj(`[...document.querySelectorAll('.settle-page .settle-row')].map(r => r.dataset.rank).join(',')`);
    assert(again === '1,2,3,4,5,6,7,8,9,10', 'reopening the saved game keeps the ranking');
    await setSize(375, 812);
    const hist375 = await detailFit(10);
    assertFit(hist375, 'history red 375', 10);
    await shot('settle-detail-red-375.png');
    await setSize(390, 844);
    const hist390 = await detailFit(10);
    assertFit(hist390, 'history red 390', 10);
    await shot('settle-detail-red-390.png');
    await setSize(375, 812);
    const detailText = await evalj(`document.querySelector('#app').innerText`);
    assert(detailText.includes('覆盤重點') && detailText.includes('組隊 / 投票全記錄'), 'detail keeps review and the full vote record');
    assert(detailText.includes('分享戰績') && detailText.includes('生成海報') && detailText.includes('積分詳情'), 'summary keeps share, poster and score entry');
    assert(!/亞瑟陣營|莫德雷德陣營|微信|曬到微信|高難角色|深藏不露|金牌擋刀|任務骨幹/.test(detailText), 'detail does not rename roles into fake honors or add WeChat');
    assert(detailText.includes('紅方勝利'), 'red win detail says 紅方勝利');
    await evalj(`document.querySelector('[data-a="scores"]').click()`);
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('#modal .settle-row')`)); i++) await sleep(80);
    await shot('settle-sheet-red-collapsed-375.png');
    await evalj(`(() => { const row = document.querySelector('#modal .settle-row[data-rank="1"]'); if (row && !row.querySelector('details').open) row.querySelector('summary').click(); row.scrollIntoView({ block: 'center' }); })()`);
    await sleep(40);
    await shot('settle-sheet-red-expanded-375.png');
    await evalj(`document.querySelector('#settle-ok').click()`);
    await evalj(`(() => {
      const page = document.querySelector('.settle-page');
      page.scrollIntoView({ block: 'start' });
      const row = page.querySelector('.settle-row[data-rank="1"]');
      if (row && !row.querySelector('details').open) row.querySelector('summary').click();
    })()`);
    await sleep(80);
    await shot('settle-record.png');
    const breakRead = await evalj(`(() => {
      const li = document.querySelector('.settle-page .settle-break li');
      if (!li) return null;
      const cs = getComputedStyle(li);
      const box = li.closest('.settle-break').getBoundingClientRect();
      return { font: parseFloat(cs.fontSize), h: Math.round(box.height), text: li.textContent };
    })()`);
    assert(breakRead && breakRead.font >= 13 && breakRead.h >= 36 && breakRead.text.length > 1, 'expanded breakdown stays readable ' + JSON.stringify(breakRead));
    await shot('settle-detail-expanded-375.png');

    const gid = gme().gid;
    const mvpBefore = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
    const saved = mvpBefore.games.find(g => g.gid === gid);
    const mvpCount = mvpBefore.stats[saved.mvpPid].mvp;
    execFileSync(process.execPath, ['-e', `
      const db = require(${JSON.stringify(path.join(__dirname, '..', 'db.js'))});
      (async () => {
        await db.init();
        const g = await db.getGame(process.env.GID);
        const before = (await db.getStats(g.mvpPid)).mvp;
        await db.saveGame(g);
        const after = (await db.getStats(g.mvpPid)).mvp;
        if (before !== after) { console.error('dup', before, after); process.exit(2); }
      })().catch(e => { console.error(e); process.exit(1); });
    `], { env: { ...process.env, DATA_DIR: DATA, DATABASE_URL: '', GID: gid }, encoding: 'utf8' });
    assert(mvpCount === 1, 'the saved MVP count is one');

    const red = gme();
    const mvpPerson = people[bots.findIndex(b => b.st.meId === red.mvp)];
    const loserTop = red.seats.map(s => ({ id: s.id, side: s.side, rank: red.scores[s.id].rank })).filter(s => s.side !== red.winner).sort((a, b) => a.rank - b.rank)[0];
    const loserPerson = people[bots.findIndex(b => b.st.meId === loserTop.id)];
    const plainPerson = people[bots.findIndex(b => b.st.meId !== red.mvp && b.st.meId !== loserTop.id)];
    async function openSheetShot(person, collapsedName, expandedName) {
      await setSize(375, 812);
      await asUser(person);
      for (let i = 0; i < 40 && !(await evalj(`!!document.querySelector('.endsum')`).catch(() => false)); i++) await sleep(100);
      await evalj(`document.querySelector('#modal') && document.querySelector('#modal').classList.add('hidden')`);
      await setSize(375, 812);
      const fit375 = await detailFit(10);
      assertFit(fit375, person.name + ' 375', 10);
      await shot(collapsedName.replace('sheet', 'summary'));
      await setSize(390, 844);
      const fit390 = await detailFit(10);
      assertFit(fit390, person.name + ' 390', 10);
      await shot(collapsedName.replace('sheet', 'summary').replace('375', '390'));
      await setSize(375, 812);
      const summary = await evalj(`document.querySelector('.endsum').innerText`);
      await evalj(`document.querySelector('[data-a="scores"]').click()`);
      for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('#modal .settle-row')`)); i++) await sleep(80);
      const seen = await evalj(`(() => {
        const box = document.querySelector('#modal .settle');
        const rows = [...box.querySelectorAll('.settle-row')];
        return { n: rows.length, ranks: rows.map(r => r.dataset.rank).join(','), text: box.innerText, foot: [...box.querySelectorAll('.settle-foot button')].map(b => b.textContent).join('|') };
      })()`);
      assert(seen.n === 10 && seen.ranks === '1,2,3,4,5,6,7,8,9,10', person.name + ' sees every score (' + seen.ranks + ')');
      assert(seen.foot === '生成海報|知道了', 'score sheet footer stays');
      assert(!/亞軍|金牌|稱號|微信/.test(seen.text), 'sheet does not invent honors');
      await shot(collapsedName);
      await evalj(`(() => { document.querySelectorAll('#modal .settle-row details').forEach(d => { if (!d.open) d.querySelector('summary').click(); }); document.querySelector('#modal .settle-row[data-rank="1"]').scrollIntoView({ block: 'start' }); })()`);
      await sleep(40);
      await shot(expandedName);
      return summary;
    }
    const mvpSummary = await openSheetShot(mvpPerson, 'settle-sheet-mvp-collapsed-375.png', 'settle-sheet-mvp-expanded-375.png');
    assert(mvpSummary.includes('本局 MVP') && mvpSummary.includes(mvpPerson.name), 'MVP viewer summary names this game MVP');
    const plainSummary = await openSheetShot(plainPerson, 'settle-sheet-nonmvp-collapsed-375.png', 'settle-sheet-nonmvp-expanded-375.png');
    assert(plainSummary.includes(plainPerson.name), 'non-MVP summary is that viewer');
    if (loserPerson.user.id !== plainPerson.user.id) {
      const loseSummary = await openSheetShot(loserPerson, 'settle-sheet-losemvp-collapsed-375.png', 'settle-sheet-losemvp-expanded-375.png');
      assert(loseSummary.includes('你是敗方 MVP') && loseSummary.includes('雖敗猶榮'), 'losing-side top score shows 雖敗猶榮');
    }
    if (mvpPerson.user.id !== loserPerson.user.id) assert(!mvpSummary.includes('你是敗方 MVP'), 'winning MVP is not labelled 敗方 MVP');

    if (!(await bots[0].act('start')).ok) throw new Error('restart');
    await until(() => gme().phase === 'team' && gme().gid !== gid, 'second game');
    await mission();
    await mission();
    if (gme().phase === 'lady') {
      const holder = bots.find(b => b.st.meId === gme().ladyId);
      const target = gme().seats.find(s => s.id !== gme().ladyId);
      if (!(await holder.act('lady', { id: target.id })).ok) throw new Error('lady2');
      await until(() => gme().phase === 'team', 'after lady2');
    }
    await mission();
    await until(() => gme().phase === 'assassin', 'assassin2');
    const assassin2 = bots.find(b => b.st.game.me.role === 'assassin');
    const victim = bots.find(b => b !== assassin2 && b.st.game.me.role !== 'merlin');
    if (!(await assassin2.act('assassinate', { id: victim.st.meId })).ok) throw new Error('miss');
    await until(() => gme().phase === 'end' && gme().winner === 'good' && gme().mvp, 'blue end');
    const blueMvp = people[bots.findIndex(b => b.st.meId === gme().mvp)];
    const blueOther = people[bots.findIndex(b => b.st.meId !== gme().mvp)];
    const blueMvpText = await openSheetShot(blueMvp, 'settle-sheet-blue-mvp-collapsed-375.png', 'settle-sheet-blue-mvp-expanded-375.png');
    assert(blueMvpText.includes('藍方勝利'), 'blue win says 藍方勝利');
    assert(!/亞瑟陣營|莫德雷德陣營/.test(blueMvpText), 'blue summary does not say 亞瑟陣營');
    await openSheetShot(blueOther, 'settle-sheet-blue-nonmvp-collapsed-375.png', 'settle-sheet-blue-nonmvp-expanded-375.png');
    await evalj(`document.querySelector('#settle-ok').click()`);
    await setSize(390, 844);
    const blue390 = await detailFit(10);
    assertFit(blue390, 'blue detail 390', 10);
    await shot('settle-detail-blue-390.png');
    await setSize(375, 812);
    const blue375 = await detailFit(10);
    assertFit(blue375, 'blue detail 375', 10);
    await shot('settle-detail-blue-375.png');
    await evalj(`document.querySelector('[data-a="scores"]').click()`);
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('#modal .settle-row[data-rank="10"]')`)); i++) await sleep(80);
    const fitBlue = await fitAt(390, 844);
    assert(fitBlue.visible && fitBlue.sw <= fitBlue.cw + 1, 'blue win rank 10 stays above the footer at 390 ' + JSON.stringify(fitBlue));
    await shot('settle-rank10-blue-390.png');
    const fitBlue375 = await fitAt(375, 812);
    assert(fitBlue375.visible && fitBlue375.sw <= fitBlue375.cw + 1, 'blue win rank 10 stays above the footer at 375 ' + JSON.stringify(fitBlue375));
    await shot('settle-rank10-blue-375.png');

    await bots[0].emit('leave', {});
    const made6 = await bots[0].emit('create', {});
    if (!made6 || !made6.room) throw new Error('create6 ' + JSON.stringify(made6));
    for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code === made6.room && !bots[0].st.game); i++) await sleep(40);
    if (!(await bots[0].act('capacity', { n: 6 })).ok) throw new Error('cap6');
    for (let i = 1; i < 6; i++) {
      await bots[i].emit('join', { code: made6.room });
      if (!(await bots[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit6');
    }
    if (!(await bots[0].act('start')).ok) throw new Error('start6');
    for (let i = 0; i < 40 && !(gme() && gme().me && gme().n === 6 && gme().phase === 'team'); i++) await sleep(40);
    async function mission6() {
      const g = gme();
      const team = g.seats.slice(0, g.teamSizes[g.round]).map(s => s.id);
      const leader = bots.slice(0, 6).find(b => b.st.meId === g.leaderId);
      if (!(await leader.act('propose', { team })).ok) throw new Error('propose6');
      await until(() => gme().phase === 'vote', 'vote6');
      for (const b of bots.slice(0, 6)) {
        const r = await b.act('vote', { approve: true });
        if (!r.ok && !(r.error && /已經/.test(r.error))) throw new Error('vote6 ' + (r && r.error));
      }
      await until(() => gme().phase === 'quest', 'quest6');
      for (const b of bots.slice(0, 6)) {
        if (!(gme().team || []).includes(b.st.meId)) continue;
        if (!(await b.act('quest', { success: true })).ok) throw new Error('quest6');
      }
      await until(() => gme().phase !== 'quest', 'after6');
    }
    await mission6();
    await mission6();
    await mission6();
    await until(() => gme().phase === 'assassin' && gme().n === 6, 'assassin6');
    const assassin6 = bots.find(b => b.st.game && b.st.game.n === 6 && b.st.game.me && b.st.game.me.role === 'assassin');
    const victim6 = bots.find(b => b.st.game && b.st.game.n === 6 && b.st.game.me && b.st.game.me.role !== 'assassin' && b.st.game.me.role !== 'merlin');
    if (!(await assassin6.act('assassinate', { id: victim6.st.meId })).ok) throw new Error('miss6');
    await until(() => gme().phase === 'end' && gme().n === 6 && gme().winner === 'good', 'end6');
    await setSize(375, 812);
    await asUser(people[0]);
    for (let i = 0; i < 40 && !(await evalj(`document.querySelectorAll('.settle-page .settle-row').length === 6`).catch(() => false)); i++) await sleep(100);
    await evalj(`document.querySelector('#modal') && document.querySelector('#modal').classList.add('hidden')`);
    const small375 = await detailFit(6);
    assertFit(small375, '6p 375', 6);
    assert(small375.rows.every(r => r.h >= 24 && r.h <= 48), '6p rows stay compact ' + JSON.stringify(small375.rows));
    await shot('settle-room-6p-375.png');
    await setSize(390, 844);
    const small390 = await detailFit(6);
    assertFit(small390, '6p 390', 6);
    await shot('settle-room-6p-390.png');
    await evalj(`(() => { const row = document.querySelector('.settle-page .settle-row[data-rank="1"]'); if (row && !row.querySelector('details').open) row.querySelector('summary').click(); row.scrollIntoView({ block: 'center' }); })()`);
    await sleep(40);
    await shot('settle-room-6p-expanded-390.png');
    console.log('SETTLE TESTS PASSED', info.title, info.mvp);
  } finally {
    try { ws.close(); } catch {}
    stop();
    bots.forEach(b => { try { b.s.close(); } catch {} });
  }
})().catch(e => { console.error(e); process.exit(1); });
