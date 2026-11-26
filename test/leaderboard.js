// Global win-rate board: persisted completed-game stats, top 100, no private fields.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3411;
const EMPTY_PORT = 3412;
const APP = 'http://127.0.0.1:' + PORT + '/';
const EMPTY = 'http://127.0.0.1:' + EMPTY_PORT + '/';
const CDP = 9361;
const DATA = '/tmp/lb-' + Date.now();
const EMPTY_DATA = DATA + '-empty';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}
function cmp(a, b) {
  const cross = BigInt(b.won) * BigInt(a.played) - BigInt(a.won) * BigInt(b.played);
  if (cross !== 0n) return cross > 0n ? 1 : -1;
  const am = Number(a.mvp) || 0;
  const bm = Number(b.mvp) || 0;
  if (am !== bm) return bm - am;
  if (a.played !== b.played) return b.played - a.played;
  if (a.won !== b.won) return b.won - a.won;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
const FORBIDDEN = ['email', 'google_sub', 'google', 'guest_key', 'guestKey', 'username', 'password', 'password_hash', 'token', 'veto', 'vetoCards', 'veto_cards', 'roles', 'role', 'side', 'skins', 'avoid', 'fx', 'id'];
function walk(v, where) {
  if (Array.isArray(v)) return v.forEach((x, i) => walk(x, where + '[' + i + ']'));
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (FORBIDDEN.includes(k)) throw new Error('private field ' + k + ' at ' + where);
      walk(v[k], where + '.' + k);
    }
  }
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(EMPTY_DATA, { recursive: true });
  process.env.DATA_DIR = DATA;
  process.env.DATABASE_URL = '';
  delete require.cache[require.resolve('../db')];
  const db = require('../db');
  await db.init();
  assert((await db.leaderboard()).length === 0, 'no completed matches yields an empty board');

  let seq = 0;
  async function play(user, kind, asMvp) {
    seq += 1;
    const winner = kind === 'abort' ? 'none' : (kind === 'win' ? 'good' : 'evil');
    const award = kind !== 'abort' && (asMvp == null ? kind === 'win' : !!asMvp);
    await db.saveGame({
      gid: 'lbg' + seq,
      room: 'LBX',
      startedAt: Date.now() - 2000,
      endedAt: Date.now(),
      n: 5,
      winner,
      reason: kind,
      players: [{ id: 's', name: user.name, avatar: user.avatar || 'fox', role: 'servant', side: 'good', pendant: user.pendant || 'none' }],
      pids: [user.id],
      mvpPid: award ? user.id : null,
    });
  }
  async function record(user, wins, losses = 0) {
    for (let i = 0; i < wins; i++) await play(user, 'win');
    for (let i = 0; i < losses; i++) await play(user, 'loss');
  }

  const alpha = await db.createGuest({ guestKey: 'rank-real-key-alpha', name: '示例甲', avatar: 'panda', bg: '#ffe08a', pendant: 'crown', skins: { secretAvoid: 'avoid-role-assassin-secret' } });
  const beta = await db.createGuest({ guestKey: 'rank-real-key-beta', name: '示例乙', avatar: 'fox', pendant: 'bow' });
  const again = await db.createGuest({ guestKey: 'rank-real-key-beta', name: '示例乙' });
  assert(again.id === beta.id, 'reconnect with the same guest key stays one identity');
  const gamma = await db.createGuest({ guestKey: 'rank-real-key-gamma', name: '示例丙', avatar: 'cat' });
  const google = await db.createGuest({ guestKey: 'rank-real-key-google', name: '谷歌甲', avatar: 'shiba' });
  await db.linkGoogle(google.id, 'rank-google-sub-secret', 'rank-secret-mailbox@example.com');
  const finished = await db.createGuest({ guestKey: 'rank-real-key-finished', name: '有完成' });
  const tieA = await db.createGuest({ guestKey: 'rank-real-key-tie-a', name: '平手甲' });
  const tieB = await db.createGuest({ guestKey: 'rank-real-key-tie-b', name: '平手乙' });
  const exactHi = await db.createGuest({ guestKey: 'rank-real-key-exact-hi', name: '精確甲' });
  const exactLo = await db.createGuest({ guestKey: 'rank-real-key-exact-lo', name: '精確乙' });
  const anchored = await db.createGuest({ guestKey: 'xdemo12345678', name: '真玩家', avatar: 'otter' });
  const mvpRich = await db.createGuest({ guestKey: 'rank-real-key-mvp-rich', name: '冠軍多', avatar: 'lion' });
  const mvpPoor = await db.createGuest({ guestKey: 'rank-real-key-mvp-poor', name: '冠軍少', avatar: 'bunny' });
  const rateKing = await db.createGuest({ guestKey: 'rank-real-key-rate-king', name: '勝率王', avatar: 'wolf' });
  const mvpWhale = await db.createGuest({ guestKey: 'rank-real-key-mvp-whale', name: 'MVP鯨魚', avatar: 'koala' });
  const zero = await db.createGuest({ guestKey: 'rank-real-key-zero', name: '零場' });
  const aborted = await db.createGuest({ guestKey: 'rank-real-key-abort', name: '中止局' });
  const watcher = await db.createGuest({ guestKey: 'rank-real-key-watch', name: '只觀戰' });
  const clientA = await db.createGuest({ guestKey: 'rank-client-a-key-1', name: '客戶甲' });
  const clientB = await db.createGuest({ guestKey: 'rank-client-b-key-1', name: '客戶乙' });
  const tokA = await db.createSession(clientA.id);
  const tokB = await db.createSession(clientB.id);

  await record(alpha, 3, 0);
  await record(beta, 2, 0);
  await record(gamma, 1, 0);
  await record(google, 1, 0);
  await play(finished, 'abort');
  await record(finished, 1, 0);
  await record(tieA, 4, 4);
  await record(tieB, 4, 4);
  await record(exactHi, 1, 2);
  await record(exactLo, 13, 27);
  await record(anchored, 2, 8);
  await play(mvpRich, 'win', true);
  await play(mvpRich, 'win', true);
  await play(mvpPoor, 'win', true);
  await play(mvpPoor, 'win', false);
  for (let i = 0; i < 9; i++) await play(rateKing, 'win', false);
  await play(rateKing, 'loss', false);
  await play(mvpWhale, 'win', true);
  for (let i = 0; i < 4; i++) await play(mvpWhale, 'loss', true);
  await play(aborted, 'abort');

  const fixtures = [];
  for (const pre of ['sim', 'tf', 'lb', 'rs', 'smk', 'rvb', 'uibot', 'demo']) {
    const u = await db.createGuest({ guestKey: pre + 'botkey01', name: '機械' + pre });
    await record(u, 10, 0);
    fixtures.push(u);
  }
  const acct = await db.createGuest({ guestKey: 'acctabcd1234xx', name: '機械帳號' });
  const memUser = (await db.getUser(acct.id));
  memUser.username = 'uabc12z';
  await record(acct, 10, 0);
  fixtures.push(acct);

  const fillers = [];
  for (let i = 0; i < 100; i++) {
    const u = await db.createGuest({ guestKey: 'rankfill' + String(i).padStart(3, '0') + 'key', name: '補' + String(i).padStart(3, '0') });
    await record(u, 1, 9);
    fillers.push(u);
  }
  const file = path.join(DATA, 'db.json');
  db.flush();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.stats[zero.id] = { played: 0, won: 0, mvp: 4, roles: { merlin: { played: 2, won: 1 } } };
  fs.writeFileSync(file, JSON.stringify(saved));

  const alphaStats = saved.stats[alpha.id];
  assert(alphaStats.played === 3 && alphaStats.won === 3 && alphaStats.mvp === 3 && alphaStats.roles.servant.played === 3, 'completed wins still update MVP and role progress');
  assert(!saved.stats[aborted.id], 'aborted game does not create completed-match stats');
  assert(!saved.stats[watcher.id], 'spectator-only identity has no completed-match stats');
  assert(saved.stats[finished.id].played === 1 && saved.stats[finished.id].won === 1, 'a later completed game counts and the abort does not');

  delete require.cache[require.resolve('../db')];
  process.env.DATA_DIR = DATA;
  const db2 = require('../db');
  await db2.init();
  const direct = await db2.leaderboard(500);
  assert(direct.length === 100, 'board caps at 100 even if more are eligible');
  const names = direct.map(p => p.name);
  for (const u of fixtures) assert(!names.includes(u.name), 'fixture excluded: ' + u.name);
  assert(!names.includes('零場') && !names.includes('中止局') && !names.includes('只觀戰'), 'zero, aborted, and spectator-only players are off the board');
  assert(names.includes('真玩家'), 'a key that merely contains demo is not a fixture');
  assert(names.filter(n => n === '示例乙').length === 1, 'reconnect does not duplicate a row');
  const hi = names.indexOf('精確甲');
  const lo = names.indexOf('精確乙');
  assert(hi >= 0 && lo > hi, 'exact 1/3 ranks above 13/40 even though both round to 33% and 13/40 has more games');
  assert(Math.round(100 / 3) === 33 && Math.round(1300 / 40) === 33, 'the exact-rate pair displays the same rounded percent');
  const one = direct.find(p => p.name === '示例丙');
  assert(one && one.won === 1 && one.played === 1, 'a single win stays visible as 1/1');
  const shown = direct.find(p => p.name === '示例甲');
  assert(shown.avatar === 'panda' && shown.pendant === 'crown' && shown.bg === '#ffe08a' && !shown.photoUrl, 'public avatar and current pendant are included');
  assert(shown.pubId && shown.pubId !== alpha.id, 'public id is not the internal user id');
  assert(shown.mvp === 3 && Number.isInteger(shown.mvp), 'public row includes the earned MVP count');
  assert(direct.every(p => Number.isInteger(p.mvp) && p.mvp >= 0 && !('id' in p)), 'every public row has an integer MVP count and no internal id');
  const rich = direct.find(p => p.name === '冠軍多');
  const poor = direct.find(p => p.name === '冠軍少');
  assert(rich && poor && rich.won === 2 && poor.won === 2 && rich.played === 2 && poor.played === 2 && rich.mvp === 2 && poor.mvp === 1, 'same exact rate rows carry different MVP counts');
  assert(names.indexOf('冠軍多') < names.indexOf('冠軍少'), 'same exact win rate ranks more MVP first');
  const king = direct.find(p => p.name === '勝率王');
  const whale = direct.find(p => p.name === 'MVP鯨魚');
  assert(king && whale && king.won === 9 && king.played === 10 && king.mvp === 0 && whale.mvp === 5 && whale.won === 1 && whale.played === 5, 'a higher exact rate can have fewer MVP');
  assert(names.indexOf('勝率王') < names.indexOf('MVP鯨魚'), 'a higher exact win rate still ranks above more MVP');
  assert(Math.round(king.won * 100 / king.played) === 90 && Math.round(one.won * 100 / one.played) === 100, 'displayed percents stay rounded, including a 1/1 100%');

  const eligible = [
    alpha, beta, gamma, google, finished, tieA, tieB, exactHi, exactLo, anchored, mvpRich, mvpPoor, rateKing, mvpWhale, ...fillers,
  ].map(u => {
    const st = saved.stats[u.id];
    return { id: u.id, name: u.name, played: st.played, won: st.won, mvp: st.mvp || 0 };
  });
  eligible.sort(cmp);
  const expectNames = eligible.slice(0, 100).map(p => p.name);
  assert(JSON.stringify(names) === JSON.stringify(expectNames), 'order is exact rate, then MVP, then games, then wins, then id');
  assert(eligible[100] && !names.includes(eligible[100].name), 'player 101 is omitted');
  const tieOrder = [tieA, tieB].sort((a, b) => a.id < b.id ? -1 : 1).map(u => u.name);
  assert(names.indexOf(tieOrder[0]) < names.indexOf(tieOrder[1]), 'equal rate, MVP, and games break ties by stable id');
  walk(direct, 'direct');
  const blob = JSON.stringify(direct);
  for (const secret of ['rank-secret-mailbox@example.com', 'rank-google-sub-secret', 'avoid-role-assassin-secret', 'rank-real-key-alpha', alpha.id, 'servant']) {
    assert(!blob.includes(secret), 'response hides ' + secret);
  }
  const rowKeys = Object.keys(direct[0]).sort();
  assert(JSON.stringify(rowKeys) === JSON.stringify(['avatar', 'bg', 'mvp', 'name', 'pendant', 'photoUrl', 'played', 'pubId', 'rank', 'won']), 'rows expose the public MVP count and no private fields');

  const boot = (port, dir) => {
    const srv = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(port), DATA_DIR: dir, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0', GM_EMAIL: 'nobody-gm@example.invalid', GM_USER_ID: '' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('server ' + port)), 8000);
      srv.stdout.on('data', d => { if (String(d).includes('on :' + port)) { clearTimeout(t); res(srv); } });
    });
  };
  let srv, emptySrv, chrome;
  try {
    srv = await boot(PORT, DATA);
    emptySrv = await boot(EMPTY_PORT, EMPTY_DATA);
    const [openA, openB, anon, limited] = await Promise.all([
      fetch(APP + 'api/leaderboard', { headers: { Authorization: 'Bearer ' + tokA } }).then(r => r.json()),
      fetch(APP + 'api/leaderboard', { headers: { Authorization: 'Bearer ' + tokB } }).then(r => r.json()),
      fetch(APP + 'api/leaderboard').then(r => r.json()),
      fetch(APP + 'api/leaderboard?limit=500').then(r => r.json()),
    ]);
    assert(openA.limit === 100 && openA.players.length === 100, 'authenticated client gets the global cap');
    assert(JSON.stringify(openA) === JSON.stringify(openB) && JSON.stringify(openA) === JSON.stringify(anon), 'two clients and an anonymous read see the same persisted board');
    assert(limited.players.length === 100, 'a larger limit query cannot exceed 100');
    walk(anon, 'http');
    const emptyBody = await fetch(EMPTY + 'api/leaderboard').then(r => r.json());
    assert(emptyBody.players.length === 0 && emptyBody.limit === 100, 'a server with no completed games returns an empty list');

    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert(src.includes('function checkAch') && src.includes('10次MVP') && src.includes("laurel"), 'achievement and MVP reward logic stays in the client');

    chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-lb-' + Date.now(), 'about:blank'], { stdio: 'ignore' });
    class Page {
      constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map();
        this.ws.addEventListener('message', ev => { const msg = JSON.parse(ev.data); if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); }
      ready() { return new Promise(r => this.ws.addEventListener('open', r, { once: true })); }
      send(method, params = {}, timeout = 20000) {
        const id = ++this.id;
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, timeout);
          this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject });
          this.ws.send(JSON.stringify({ id, method, params }));
        });
      }
      async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails).slice(0, 700));
        return r.result && r.result.value;
      }
    }
    let tab;
    for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
    assert(tab && tab.webSocketDebuggerUrl, 'mobile browser is available');
    const cdp = new Page(tab.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

    await cdp.send('Page.navigate', { url: EMPTY });
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-v="board"]')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    const menu0 = await cdp.eval(`(() => ({ items: [...document.querySelectorAll('.menu .item')].map(el => el.innerText.replace(/\\s+/g, ' ').trim()), ach: [...document.querySelectorAll('.menu .item')].some(el => el.innerText.includes('成就')) }))()`);
    assert(menu0.items.some(t => t.includes('排行榜')) && !menu0.ach, 'home menu shows 排行榜 and not 成就');
    await cdp.eval(`document.querySelector('[data-v="board"]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.lb-empty')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    const emptyUi = await cdp.eval(`(() => ({ text: document.querySelector('#app').innerText, rows: document.querySelectorAll('.lb li').length }))()`);
    assert(emptyUi.text.includes('暫時未有完成對局可以排名') && emptyUi.rows === 0, 'empty board explains itself and lists nobody');

    await cdp.send('Page.navigate', { url: APP });
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-v="board"]')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    const loading = await cdp.eval(`(() => { const orig = window.fetch; window.__origFetch = orig; window.fetch = (url, opt) => String(url).includes('/api/leaderboard') ? new Promise(res => setTimeout(() => res(orig(url, opt)), 600)) : orig(url, opt); document.querySelector('[data-v="board"]').click(); return document.querySelector('#app').innerText; })()`);
    assert(loading.includes('載入中'), 'opening the board shows a loading state');
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.lb li')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    await cdp.eval(`window.__origFetch && (window.fetch = (url, opt) => String(url).includes('/api/leaderboard') ? Promise.resolve({ ok: false, status: 500, json: async () => ({ error: '暫時無法載入排行榜' }) }) : window.__origFetch(url, opt))`);
    await cdp.eval(`document.querySelector('#backBtn').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-v="board"]')) { clearInterval(t); r(1); } }, 30); setTimeout(() => r(0), 4000); })`);
    await cdp.eval(`document.querySelector('[data-v="board"]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-a="reloadboard"]')) { clearInterval(t); r(1); } }, 30); setTimeout(() => r(0), 4000); })`);
    const errUi = await cdp.eval(`document.querySelector('#app').innerText`);
    assert(errUi.includes('排行榜載入失敗') && errUi.includes('重試'), 'a failed load shows an error and retry');
    await cdp.eval(`window.fetch = window.__origFetch`);
    await cdp.eval(`document.querySelector('[data-a="reloadboard"]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.lb li')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);

    const ui = await cdp.eval(`(() => {
      const rows = [...document.querySelectorAll('.lb li')].map(li => ({ rank: li.dataset.rank, label: li.getAttribute('aria-label'), text: li.innerText.replace(/\\s+/g, ' ').trim(), av: (li.querySelector('.av img') || {}).src || '', pd: (li.querySelector('.pov') || {}).src || '' }));
      const note = document.querySelector('#lb-note').innerText;
      const app = document.querySelector('#app');
      return { rows: rows.slice(0, 8), n: rows.length, note, title: document.querySelector('#topTitle').textContent, scroll: app.scrollHeight, body: document.body.innerText.includes('機械sim') };
    })()`);
    assert(ui.title === '排行榜' && ui.n === 100, 'mobile board lists 100 rows under the 排行榜 title');
    assert(/全球/.test(ui.note) && /100/.test(ui.note) && /精確/.test(ui.note) && /1 勝/.test(ui.note) && /MVP 次數較多優先/.test(ui.note), 'the note explains global exact-rate ordering, then MVP');
    assert(!ui.body, 'fixture names are not rendered');
    const top = ui.rows[0];
    assert(top.text.includes('示例甲') && top.text.includes('100%') && top.text.includes('3勝/3場') && top.text.includes('MVP 3') && top.text.indexOf('MVP 3') < top.text.indexOf('100%') && top.av.includes('/img/av/panda.webp') && top.pd.includes('/img/pd/crown.webp'), 'first row shows rank, avatar, pendant, nickname, MVP left of the percent, and record');
    assert(top.label.includes('MVP 3 次') && top.label.includes('100%'), 'the row label names the MVP count and the rounded rate');
    const gammaRow = await cdp.eval(`(() => { const li = [...document.querySelectorAll('.lb li')].find(el => el.innerText.includes('示例丙')); return li ? li.innerText.replace(/\\s+/g, ' ') : ''; })()`);
    assert(gammaRow.includes('100%') && gammaRow.includes('1勝/1場') && gammaRow.includes('MVP 1') && gammaRow.indexOf('MVP 1') < gammaRow.indexOf('100%'), 'one win out of one game is shown as 100% with MVP on its left');
    const pair = await cdp.eval(`(() => {
      const rows = [...document.querySelectorAll('.lb li')];
      const rich = rows.find(el => el.innerText.includes('冠軍多'));
      const poor = rows.find(el => el.innerText.includes('冠軍少'));
      const text = el => el ? el.innerText.replace(/\\s+/g, ' ').trim() : '';
      return { rich: text(rich), poor: text(poor), richBefore: !!(rich && poor && (rich.compareDocumentPosition(poor) & Node.DOCUMENT_POSITION_FOLLOWING)) };
    })()`);
    assert(pair.richBefore && pair.rich.includes('MVP 2') && pair.rich.includes('100%') && pair.rich.includes('2勝/2場') && pair.poor.includes('MVP 1') && pair.poor.includes('100%') && pair.poor.includes('2勝/2場'), 'rendered rows with the same exact rate put more MVP first');
    assert(pair.rich.indexOf('MVP 2') < pair.rich.indexOf('100%') && pair.poor.indexOf('MVP 1') < pair.poor.indexOf('100%'), 'each tie-break row shows MVP immediately left of 100%');
    const scrolled = await cdp.eval(`(() => { const before = document.querySelector('.lb li').getBoundingClientRect().top; window.scrollTo(0, 900); const after = document.querySelector('.lb li').getBoundingClientRect().top; return { y: window.scrollY, moved: before - after, tall: document.documentElement.scrollHeight > 812 }; })()`);
    assert(scrolled.tall && scrolled.y > 100 && scrolled.moved > 100, 'the board scrolls vertically on a phone');
    const SAFE = { 375: { top: 50, bottom: 34 }, 390: { top: 47, bottom: 34 } };
    const fitExpr = `(() => {
      const bad = [];
      const rows = [...document.querySelectorAll('.lb li')];
      for (const li of rows) {
        const mvp = li.querySelector('.lb-mvp');
        const pct = li.querySelector('.lb-rec b');
        const wl = li.querySelector('.lb-wl');
        const av = li.querySelector('.av');
        const nm = li.querySelector('.nm');
        const rank = li.querySelector('.lb-rank');
        if (!mvp || !pct || !wl || !av || !nm || !rank) { bad.push({ name: nm ? nm.textContent : '', missing: true }); continue; }
        const mr = mvp.getBoundingClientRect();
        const pr = pct.getBoundingClientRect();
        const wr = wl.getBoundingClientRect();
        const ar = av.getBoundingClientRect();
        const nr = nm.getBoundingClientRect();
        const rr = rank.getBoundingClientRect();
        const rec = li.querySelector('.lb-rec').getBoundingClientRect();
        const card = li.closest('.card').getBoundingClientRect();
        const same = Math.abs((mr.top + mr.height / 2) - (pr.top + pr.height / 2)) <= 3;
        const left = mr.right <= pr.left + 0.5 && (pr.left - mr.right) <= 14;
        const below = wr.top >= pr.bottom - 1;
        const face = rec.left >= ar.right - 0.5;
        const clearName = rec.left >= nr.right - 1;
        const clearRank = rec.left >= rr.right - 0.5;
        const inside = rec.right <= card.right + 1.5 && rr.left >= card.left - 1;
        if (!(same && left && below && face && clearName && clearRank && inside && mr.width > 0 && pr.width > 0)) {
          bad.push({ name: nm.textContent, same, left, below, face, clearName, clearRank, inside, gap: Math.round((pr.left - mr.right) * 10) / 10 });
          if (bad.length >= 4) break;
        }
      }
      return { bad, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    })()`;
    async function setPhone(w, h) {
      const safe = SAFE[w];
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safe.top, left: 0, bottom: safe.bottom, right: 0 } }).catch(() => {});
      await cdp.eval(`(() => {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;left:-999px;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
        document.body.appendChild(el);
        const t = parseFloat(getComputedStyle(el).paddingTop) || 0;
        const b = parseFloat(getComputedStyle(el).paddingBottom) || 0;
        el.remove();
        let s = document.getElementById('safe-test');
        if (t >= ${safe.top} - 0.5 && b >= ${safe.bottom} - 0.5) { if (s) s.textContent = ''; return 'env'; }
        if (!s) { s = document.createElement('style'); s.id = 'safe-test'; document.head.appendChild(s); }
        s.textContent = '.topbar{padding-top:${safe.top}px !important}body{padding-bottom:${safe.bottom}px !important}main{padding-bottom:calc(16px + ${safe.bottom}px) !important}';
        return 'inject';
      })()`);
      await cdp.eval(`window.scrollTo(0, 0)`);
      await sleep(60);
    }
    fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
    await setPhone(375, 812);
    const fit375 = await cdp.eval(fitExpr);
    assert(!fit375.overflow && fit375.bad.length === 0, '375 board keeps MVP left of the percent without covering the face ' + JSON.stringify(fit375));
    const shot375 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/opt/cursor/artifacts/leaderboard-375.png', Buffer.from(shot375.data, 'base64'));
    await setPhone(390, 844);
    const fit390 = await cdp.eval(fitExpr);
    assert(!fit390.overflow && fit390.bad.length === 0, '390 board keeps MVP left of the percent without covering the face ' + JSON.stringify(fit390));
    const shot390 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/opt/cursor/artifacts/leaderboard-390.png', Buffer.from(shot390.data, 'base64'));
  } finally {
    try { chrome && chrome.kill('SIGKILL'); } catch {}
    try { srv && srv.kill('SIGKILL'); } catch {}
    try { emptySrv && emptySrv.kill('SIGKILL'); } catch {}
  }
  console.log('LEADERBOARD TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });
