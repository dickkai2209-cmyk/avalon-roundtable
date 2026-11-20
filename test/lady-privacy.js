// Mid-game Lady of the Lake alignment stays off the public log and off every
// payload except the inspector's own. Spectators are included. After the game
// ends, the existing reveal may show it again.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3471;
const CDP = 9491;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/lady-privacy-' + Date.now();
const OUT = '/opt/cursor/artifacts';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function get(url) {
  return new Promise((resolve, reject) => http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject));
}
function bot(key, name) {
  const s = io(APP, { transports: ['websocket'], forceNew: true, query: { diff: '1' } });
  const c = { s, st: null, name, raws: [] };
  s.on('state', st => {
    c.raws.push(st);
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
function ladyLogs(st) {
  if (!st) return null;
  if (st.game && st.game.ladyLog) return st.game.ladyLog;
  if (st.__g && st.__g.ladyLog) return st.__g.ladyLog;
  return null;
}
function latestLady(c) {
  for (let i = c.raws.length - 1; i >= 0; i--) {
    const log = ladyLogs(c.raws[i]);
    if (log && log.length) return log;
  }
  return null;
}
function pull(person, query) {
  const s = io(APP, { transports: ['websocket'], forceNew: true, query: query || {} });
  return new Promise((res, rej) => {
    const t = setTimeout(() => { s.close(); rej(new Error('pull ' + person.name)); }, 8000);
    s.on('state', v => { clearTimeout(t); s.close(); res(v); });
    s.on('connect', () => s.emit('hello', { guestKey: person.guestKey, name: person.name }));
  });
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', GM_EMAIL: '', GM_USER_ID: '', FORCE_LEADER: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let chrome;
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });
  const names = ['Dickson', 'iFo', '丙', '丁', '戊', '己', '庚', '辛'];
  const people = [];
  for (let i = 0; i < 8; i++) {
    const guestKey = 'lp' + i + Date.now().toString(36) + 'k' + i;
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#ffffff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i] });
  }
  const watchKey = 'lpw' + Date.now().toString(36) + 'watch';
  const watcher = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey: watchKey, profile: { name: '觀眾', avatar: 'cat', bg: '#ffffff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
  const specPerson = { ...watcher, guestKey: watchKey, name: '觀眾' };
  const bots = people.map(p => bot(p.guestKey, p.name));
  const spec = bot(watchKey, '觀眾');
  await Promise.all([...bots, spec].map(b => b.ready));
  const made = await bots[0].emit('create', {});
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  const code = made.room;
  await bots[0].act('settings', { lady: true, excalibur: false, lancelot: false, veto: false, mic: false });
  for (let i = 1; i < 8; i++) {
    await bots[i].emit('join', { code });
    if (!(await bots[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit ' + i);
  }
  await spec.emit('join', { code });
  if (!(await bots[0].act('start')).ok) throw new Error('start');
  for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.me); i++) await sleep(40);
  const gme = () => bots[0].st.game;
  async function until(pred, label) {
    for (let i = 0; i < 100; i++) { if (pred()) return; await sleep(40); }
    throw new Error('timeout ' + label + ' ' + (gme() && gme().phase));
  }
  async function mission(success) {
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
      if (!(await b.act('quest', { success })).ok) throw new Error('quest');
    }
    await until(() => gme().phase !== 'quest', 'after quest');
  }
  await mission(true);
  await mission(true);
  await until(() => gme().phase === 'lady', 'lady');
  assert(gme().ladyId === bots[0].st.meId, 'Dickson holds 湖中仙女');
  const holder = bots[0];
  const merlin = bots.find(b => b.st.game.me.role === 'merlin');
  const evilIds = new Set((merlin.st.game.me.knows || []).map(k => k.id));
  const target = gme().seats.find(s => evilIds.has(s.id) && s.id !== holder.st.meId);
  if (!target) throw new Error('no evil target');
  const targetName = target.name;
  const other = bots.find(b => b !== holder);
  const otherPerson = people[bots.indexOf(other)];

  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-lady-priv-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
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
    const safe = SAFE[w];
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safe.top, left: 0, bottom: safe.bottom, right: 0 } });
    await sleep(60);
  }
  async function shot(name) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
  }
  async function asUser(person, ready) {
    const profile = JSON.stringify({ name: person.name, avatar: person.name === '觀眾' ? 'cat' : 'fox', bg: '#ffffff', fx: 'spot', pendant: 'none' });
    await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.guest', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); sessionStorage.clear(); location.replace(${JSON.stringify(APP + '?t=' + Date.now())})`);
    for (let i = 0; i < 60; i++) { if (await evalj(`!!document.querySelector(${JSON.stringify(ready)})`).catch(() => false)) return; await sleep(120); }
    throw new Error('no ' + ready + ' for ' + person.name + ' ' + await evalj(`(document.body.innerText || '').replace(/\\s+/g,' ').slice(0,160)`).catch(() => ''));
  }
  async function quiet() {
    for (let i = 0; i < 6; i++) {
      const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`);
      if (!open) return;
      await evalj(`(() => { const b = document.querySelector('#ok'); if (b) b.click(); })()`);
      await sleep(80);
    }
  }
  async function scrollChain() {
    await evalj(`(() => {
      const el = document.querySelector('.lady-chain');
      const main = document.querySelector('main');
      if (main && getComputedStyle(main).position === 'fixed') {
        const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
        main.scrollTop = Math.max(0, top - 16);
      } else {
        window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 70));
      }
    })()`);
    await sleep(80);
  }
  async function chainBox() {
    return evalj(`(() => {
      const el = document.querySelector('.lady-chain');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const fab = document.querySelector('.myrole-fab');
      const fb = fab ? fab.getBoundingClientRect() : null;
      const overlap = !!(fb && r.left < fb.right - 1 && r.right > fb.left + 1 && r.top < fb.bottom - 1 && r.bottom > fb.top + 1);
      const main = document.querySelector('main');
      const doc = document.documentElement;
      return {
        text: el.innerText.replace(/\\s+/g, ' ').trim(),
        html: el.innerHTML,
        top: r.top, bottom: r.bottom, ih: innerHeight,
        overlap, badges: el.querySelectorAll('.badge').length,
        appBadges: document.querySelectorAll('#app .badge.good, #app .badge.evil').length,
        sw: Math.max(doc.scrollWidth, main ? main.scrollWidth : 0), cw: doc.clientWidth,
        spec: !!document.querySelector('.specbar'),
        recap: !!document.querySelector('.lady-recap, .vrec'),
        camp: /藍方隊員|紅方隊員/.test((document.querySelector('#app') || document.body).innerText)
      };
    })()`);
  }
  function assertChainHidden(info, who) {
    assert(info && info.text.includes('湖中仙女') && info.text.includes('Dickson') && info.text.includes(targetName) && info.text.includes('→'), who + ' chain names the pass (' + (info && info.text) + ')');
    assert(!/[好壞]/.test(info.text) && !/badge/.test(info.html), who + ' public row hides alignment (' + info.text + ')');
    assert(info.badges === 0 && info.appBadges === 0, who + ' has no 好/壞 badge');
  }
  function assertPublicChain(info, who) {
    assertChainHidden(info, who);
    assert(info.top >= -1 && info.bottom <= info.ih + 1 && !info.overlap, who + ' log is on screen and clear of chips ' + JSON.stringify({ top: info.top, bottom: info.bottom, ih: info.ih, overlap: info.overlap }));
    assert(info.sw <= info.cw + 1, who + ' does not overflow');
    assert(!info.recap && !info.camp, who + ' mid-game does not mount the post-game recap or camp colors');
  }
  function assertHidden(view, who) {
    const g = view && view.game;
    assert(g && g.phase !== 'end' && !g.review, who + ' is still mid-game');
    assert(!g.questVotes, who + ' payload has no quest ballots');
    for (const l of g.ladyLog || []) {
      assert(!('side' in l) && l.side == null, who + ' lady entry has no side ' + JSON.stringify(l));
      assert(!('alignment' in l), who + ' lady entry has no alignment');
    }
    assert((g.ladyLog || []).some(l => l.holder === holder.st.meId && l.target === target.id), who + ' can still see who was inspected');
    for (const s of g.seats || []) assert(!s.role && s.side == null, who + ' seats hide roles');
    assert(!view.lastEvent || view.lastEvent.side == null, who + ' event hides the side');
    const pub = JSON.parse(JSON.stringify(g));
    delete pub.me;
    assert(!/"side"/.test(JSON.stringify(pub)), who + ' public game JSON has no side');
    assert(!/好|壞/.test(JSON.stringify(g.ladyLog)), who + ' lady log has no 好/壞');
  }

  try {
    await setSize(375, 812);
    await asUser(people[0], '.rt');
    await quiet();
    if (!(await holder.act('lady', { id: target.id })).ok) throw new Error('lady');
    await until(() => (holder.st.game.ladyLog || []).some(l => l.side) && bots.every(b => (b.st.game.ladyLog || []).length === 1) && (spec.st.game.ladyLog || []).length === 1, 'logged');
    for (let i = 0; i < 40 && !(await evalj(`!!document.querySelector('.rc.lady-reveal, #flip')`).catch(() => false)); i++) await sleep(80);
    await evalj(`document.querySelector('#flip').click()`);
    await sleep(220);
    const card = await evalj(`(() => {
      const rc = document.querySelector('.rc.lady-reveal');
      const rn = rc && rc.querySelector('.rn');
      return { text: rn && rn.textContent, color: rn && getComputedStyle(rn).color, border: rc && getComputedStyle(rc).borderTopColor, cls: rc && rc.className };
    })()`);
    assert(card.text === '壞人陣營' && card.cls.includes('evil'), 'the private card still says 壞人陣營');
    assert(card.color === 'rgb(255, 255, 255)' && card.border === 'rgb(255, 48, 72)', 'evil private card stays crimson (' + card.color + ' ' + card.border + ')');
    const behind = await chainBox();
    assertChainHidden(behind, 'inspector behind the card');
    await shot('lady-seen-375.png');
    await setSize(390, 844);
    await shot('lady-seen-390.png');
    await quiet();
    await setSize(375, 812);
    await scrollChain();
    assertPublicChain(await chainBox(), 'inspector public 375');
    await shot('lady-inspector-log-375.png');
    await setSize(390, 844);
    await scrollChain();
    assertPublicChain(await chainBox(), 'inspector public 390');
    await shot('lady-inspector-log-390.png');

    assert(holder.st.game.ladyLog.some(l => l.side === 'evil' && l.target === target.id && l.holder === holder.st.meId), 'the inspector still receives the evil result');
    for (const b of bots.filter(b => b !== holder)) assertHidden(b.st, b.name);
    assertHidden(spec.st, 'spectator');
    assert(spec.st.spectating === true && spec.st.game.me == null, 'spectator has no private seat');
    for (const b of bots.concat(spec)) {
      const raw = latestLady(b);
      assert(raw && raw.length === 1, b.name + ' diff carried the pass');
      if (b === holder) assert(raw[0].side === 'evil', 'inspector diff keeps their side');
      else assert(raw.every(l => !('side' in l)), b.name + ' diff omits side ' + JSON.stringify(raw));
    }
    for (const person of [otherPerson, specPerson]) {
      for (const query of [{}, { diff: '1' }]) {
        const view = await pull(person, query);
        assert(!view.__d, person.name + ' fresh view is a full snapshot');
        assertHidden(view, person.name + (query.diff ? ' diff-connect' : ' connect'));
      }
    }
    const own = await pull(people[0], {});
    assert(own.game.ladyLog.some(l => l.side === 'evil' && l.holder === own.meId), 'a fresh inspector snapshot still has their own result');
    const ownPub = JSON.parse(JSON.stringify(own.game));
    delete ownPub.me;
    ownPub.ladyLog = ownPub.ladyLog.map(l => { const row = { ...l }; if (l.holder === own.meId) delete row.side; return row; });
    assert(!/"side"/.test(JSON.stringify(ownPub)), 'inspector snapshot has no side except their own check');

    await setSize(375, 812);
    await asUser(otherPerson, '.lady-chain');
    await quiet();
    await evalj(`document.querySelector('main').scrollTop = 0; window.scrollTo(0,0)`);
    await sleep(60);
    const table = await evalj(`(() => {
      const rt = document.querySelector('.rt');
      const r = rt.getBoundingClientRect();
      return { top: r.top, h: r.height, badges: document.querySelectorAll('#app .badge.good, #app .badge.evil').length, faces: document.querySelectorAll('.rt .av').length };
    })()`);
    assert(table.faces === 8 && table.badges === 0 && table.top >= 0 && table.h > 120, 'other player table shows faces and no alignment badge');
    await shot('lady-public-table-375.png');
    await scrollChain();
    assertPublicChain(await chainBox(), 'other 375');
    await shot('lady-public-log-375.png');
    await setSize(390, 844);
    await evalj(`document.querySelector('main').scrollTop = 0; window.scrollTo(0,0)`);
    await sleep(40);
    await shot('lady-public-table-390.png');
    await scrollChain();
    assertPublicChain(await chainBox(), 'other 390');
    await shot('lady-public-log-390.png');

    await setSize(375, 812);
    await asUser(specPerson, '.lady-chain');
    await quiet();
    await scrollChain();
    const specChain = await chainBox();
    assert(specChain.spec, 'spectator banner is showing');
    assertPublicChain(specChain, 'spectator 375');
    await shot('lady-spectator-log-375.png');
    await setSize(390, 844);
    await scrollChain();
    assertPublicChain(await chainBox(), 'spectator 390');
    await shot('lady-spectator-log-390.png');

    await setSize(375, 812);
    await asUser(people[0], '.lady-chain');
    await quiet();
    await evalj(`document.querySelector('[data-a="role"]').click()`);
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('#flip')`)); i++) await sleep(50);
    await evalj(`document.querySelector('#flip').click()`);
    for (let i = 0; i < 30 && !(await evalj(`!![...document.querySelectorAll('.matepanel')].some(p => p.innerText.includes('湖中仙女查驗結果') && !p.closest('.hidden'))`)); i++) await sleep(50);
    async function showPrivate() {
      await evalj(`(() => {
        const p = [...document.querySelectorAll('.matepanel')].find(el => el.innerText.includes('湖中仙女查驗結果'));
        const sheet = document.querySelector('.sheet');
        const pr = p.getBoundingClientRect(); const sr = sheet.getBoundingClientRect();
        sheet.scrollTop += pr.top - sr.top - 16;
      })()`);
      await sleep(80);
      return evalj(`(() => {
        const p = [...document.querySelectorAll('.matepanel')].find(el => el.innerText.includes('湖中仙女查驗結果'));
        const r = p.getBoundingClientRect();
        const chain = document.querySelector('.lady-chain');
        return { text: p.innerText.replace(/\\s+/g,' ').trim(), top: r.top, bottom: r.bottom, ih: innerHeight, chain: chain.innerText.replace(/\\s+/g,' ').trim(), badges: chain.querySelectorAll('.badge').length };
      })()`);
    }
    let priv = await showPrivate();
    assert(priv.text.includes(targetName) && priv.text.includes('壞人'), 'reopened private result names the evil check (' + priv.text + ')');
    assert(!/[好壞]/.test(priv.chain) && priv.badges === 0, 'reopening does not put the badge back on the public row');
    assert(priv.top >= -1 && priv.bottom <= priv.ih + 1, 'private result is on screen ' + JSON.stringify(priv));
    await shot('lady-private-375.png');
    await setSize(390, 844);
    priv = await showPrivate();
    assert(priv.text.includes('壞人') && priv.bottom <= priv.ih + 1, 'private result fits 390');
    await shot('lady-private-390.png');
    await quiet();

    await mission(true);
    await until(() => gme().phase === 'assassin', 'assassin');
    const assassin = bots.find(b => b.st.game.me.role === 'assassin');
    const victim = gme().seats.find(s => s.id !== assassin.st.meId);
    if (!(await assassin.act('assassinate', { id: victim.id })).ok) throw new Error('assassinate');
    await until(() => bots.every(b => b.st.game.phase === 'end') && spec.st.game.phase === 'end', 'end');
    for (const b of bots.concat(spec)) {
      assert(b.st.game.ladyLog.some(l => l.side === 'evil' && l.target === target.id), b.name + ' learns the alignment only after the game ends');
    }
    await setSize(375, 812);
    await asUser(otherPerson, '.lady-chain');
    const revealed = await evalj(`new Promise(r => { const t = setInterval(() => {
      const chain = document.querySelector('.lady-chain');
      const recap = document.querySelector('.lady-recap');
      if (chain && /[好壞]/.test(chain.innerText) && recap && recap.innerText.includes('當過湖仙的不能再被查驗')) {
        clearInterval(t);
        r({ chain: chain.innerText.replace(/\\s+/g,' ').trim(), recap: recap.innerText.replace(/\\s+/g,' ').trim() });
      }
    }, 40); setTimeout(() => r(null), 8000); })`);
    assert(revealed && /壞/.test(revealed.chain), 'end-game public chain may show the result (' + (revealed && revealed.chain) + ')');
    assert(revealed.recap.includes('沒用的') && revealed.recap.includes('開局持有') && /號驗/.test(revealed.recap), 'end-game recap is the avatar chain (' + (revealed && revealed.recap) + ')');
    assert(!/[好壞]/.test(revealed.recap) && !revealed.recap.includes('陣營'), 'recap chain does not put alignment on the faces');
    const grid = await evalj(`(() => { const g = document.querySelector('.vrec'); return g ? g.innerText.replace(/\\s+/g,' ').trim() : ''; })()`);
    assert(grid.includes('藍方隊員') && grid.includes('紅方隊員') && grid.includes('通過') && grid.includes('第 1 個任務'), 'end-game vote grid uses camp colors (' + grid.slice(0, 120) + ')');
    console.log('LADY PRIVACY TEST PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
    bots.concat(spec).forEach(b => { try { b.s.close(); } catch {} });
  }
})().catch(e => { console.error(e); process.exit(1); });
