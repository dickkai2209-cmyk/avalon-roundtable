// Global board: persisted completed-game stats, top 100, MVP count then win rate, no private fields.
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
  const am = Number(a.mvp) || 0;
  const bm = Number(b.mvp) || 0;
  if (am !== bm) return bm - am;
  const cross = BigInt(b.won) * BigInt(a.played) - BigInt(a.won) * BigInt(b.played);
  if (cross !== 0n) return cross > 0n ? 1 : -1;
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
  assert(lo >= 0 && hi > lo, '13 MVP ranks above 1 MVP even though 1/3 is a higher exact rate than 13/40');
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
  const kingStats = saved.stats[rateKing.id];
  const whale = direct.find(p => p.name === 'MVP鯨魚');
  assert(kingStats && whale && kingStats.won === 9 && kingStats.played === 10 && (kingStats.mvp || 0) === 0 && whale.mvp === 5 && whale.won === 1 && whale.played === 5, 'a higher exact rate can have fewer MVP');
  assert(names.includes('MVP鯨魚') && !names.includes('勝率王'), '5 MVP stays on the board and 0 MVP at 90% does not outrank every earned MVP');
  assert(names.indexOf('MVP鯨魚') < names.indexOf('示例甲'), '5 MVP at 20% ranks above 3 MVP at 100%');
  assert(names.indexOf('示例乙') < names.indexOf('真玩家'), 'equal MVP keeps the higher exact win rate first');
  assert(Math.round(kingStats.won * 100 / kingStats.played) === 90 && Math.round(one.won * 100 / one.played) === 100, 'displayed percents stay rounded, including a 1/1 100%');

  const eligible = [
    alpha, beta, gamma, google, finished, tieA, tieB, exactHi, exactLo, anchored, mvpRich, mvpPoor, rateKing, mvpWhale, ...fillers,
  ].map(u => {
    const st = saved.stats[u.id];
    return { id: u.id, name: u.name, played: st.played, won: st.won, mvp: st.mvp || 0 };
  });
  eligible.sort(cmp);
  const expectNames = eligible.slice(0, 100).map(p => p.name);
  assert(JSON.stringify(names) === JSON.stringify(expectNames), 'order is MVP, then exact rate, then games, then wins, then id');
  assert(db2.cmpBoard({ id: 'm', played: 5, won: 1, mvp: 5 }, { id: 'r', played: 10, won: 9, mvp: 0 }) < 0, 'cmpBoard ranks more MVP ahead of a higher win rate');
  assert(db2.cmpBoard({ id: 'a', played: 2, won: 2, mvp: 2 }, { id: 'b', played: 10, won: 2, mvp: 2 }) < 0, 'cmpBoard keeps the win-rate cross-multiply when MVP is tied');
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

  const outside = eligible[100];
  const tokAlpha = await db2.createSession(alpha.id);
  const tokZero = await db2.createSession(zero.id);
  const tokOut = await db2.createSession(outside.id);
  const tokFx = await db2.createSession(fixtures[0].id);
  db2.flush();
  const photoUser = await db2.getUser(alpha.id);
  const prevAvatar = photoUser.avatar;
  photoUser.avatar = 'photo';
  fs.mkdirSync(path.join(DATA, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(DATA, 'photos', alpha.id + '.webp'), Buffer.from('RIFFxxxxWEBPVP8 '));
  const photoView = await db2.leaderboardView(100, photoUser);
  const pv = photoUser.updated_at ? new Date(photoUser.updated_at).getTime() : 0;
  assert(photoView.me && photoView.me.photoUrl === '/api/avatar/' + photoUser.pub_id + '?v=' + pv, 'me uses the same public photo URL as a board row');
  assert(!String(photoView.me.photoUrl).includes(photoUser.id), 'me photo URL does not contain the internal id');
  photoUser.avatar = prevAvatar;
  const alphaRank = eligible.findIndex(p => p.id === alpha.id) + 1;
  assert(alphaRank > 0 && alphaRank <= 100, 'the sample viewer is inside the top 100');

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
    const [openA, openB, anon, limited, asAlpha, asZero, asOut, asFx] = await Promise.all([
      fetch(APP + 'api/leaderboard', { headers: { Authorization: 'Bearer ' + tokA } }).then(r => r.json()),
      fetch(APP + 'api/leaderboard', { headers: { Authorization: 'Bearer ' + tokB } }).then(r => r.json()),
      fetch(APP + 'api/leaderboard').then(r => r.json()),
      fetch(APP + 'api/leaderboard?limit=500').then(r => r.json()),
      fetch(APP + 'api/leaderboard', { headers: { Authorization: 'Bearer ' + tokAlpha } }).then(r => r.json()),
      fetch(APP + 'api/leaderboard', { headers: { Authorization: 'Bearer ' + tokZero } }).then(r => r.json()),
      fetch(APP + 'api/leaderboard', { headers: { Authorization: 'Bearer ' + tokOut } }).then(r => r.json()),
      fetch(APP + 'api/leaderboard', { headers: { Authorization: 'Bearer ' + tokFx } }).then(r => r.json()),
    ]);
    assert(openA.limit === 100 && openA.players.length === 100, 'authenticated client gets the global cap');
    assert(JSON.stringify(openA.players) === JSON.stringify(openB.players) && JSON.stringify(openA.players) === JSON.stringify(anon.players) && JSON.stringify(openA.players) === JSON.stringify(asAlpha.players), 'every caller sees the same public list');
    assert(!Object.prototype.hasOwnProperty.call(anon, 'me') && !Object.prototype.hasOwnProperty.call(limited, 'me'), 'an anonymous read does not invent a me card');
    assert(limited.players.length === 100, 'a larger limit query cannot exceed 100');
    assert(openA.me && openA.me.name === '客戶甲' && openA.me.rank == null && openA.me.played === 0 && openA.me.won === 0 && openA.me.mvp === 0, 'a signed-in player with no completed games is unranked with zeroed stats');
    assert(openB.me && openB.me.name === '客戶乙' && openB.me.pubId !== openA.me.pubId, 'me belongs to the authenticated viewer');
    const alphaRow = asAlpha.players.find(p => p.pubId === asAlpha.me.pubId);
    assert(asAlpha.me && asAlpha.me.name === '示例甲' && asAlpha.me.rank === alphaRank && alphaRow && alphaRow.rank === asAlpha.me.rank, 'a rank inside the top 100 matches that list row');
    assert(JSON.stringify(alphaRow) === JSON.stringify(asAlpha.me), 'the pinned viewer stays on the public list with the same public fields');
    assert(asAlpha.me.played === 3 && asAlpha.me.won === 3 && asAlpha.me.mvp === 3 && asAlpha.me.avatar === 'panda' && asAlpha.me.pendant === 'crown' && asAlpha.me.photoUrl == null, 'me carries the public avatar and the win, game, and MVP counts');
    assert(asZero.me && asZero.me.name === '零場' && asZero.me.rank == null && asZero.me.played === 0 && asZero.me.won === 0, '0 completed games stay unranked even when an MVP count is stored');
    assert(!asZero.players.some(p => p.name === '零場'), 'the unranked viewer is absent from the public list');
    assert(asOut.me && asOut.me.name === outside.name && asOut.me.rank === 101 && asOut.me.played === outside.played && asOut.me.won === outside.won && asOut.me.mvp === outside.mvp, 'a rank past 100 is the true rank across every eligible player');
    assert(!asOut.players.some(p => p.pubId === asOut.me.pubId) && asOut.players.length === 100, 'rank 101 is not sliced into the top 100');
    assert(asFx.me && asFx.me.rank == null && asFx.me.played === 10 && !asFx.players.some(p => p.name === fixtures[0].name), 'a fixture is excluded from the rank the same way as the public list');
    for (const body of [anon, openA, openB, asAlpha, asZero, asOut, asFx, limited]) walk(body, 'http');
    const meKeys = Object.keys(asAlpha.me).sort();
    assert(JSON.stringify(meKeys) === JSON.stringify(rowKeys), 'me exposes the same public fields as a board row');
    const httpBlob = JSON.stringify({ anon, openA, asAlpha, asZero, asOut, asFx });
    for (const secret of ['rank-secret-mailbox@example.com', 'rank-google-sub-secret', 'avoid-role-assassin-secret', 'rank-real-key-alpha', alpha.id, 'servant', tokAlpha, tokZero]) {
      assert(!httpBlob.includes(secret), 'leaderboard response hides ' + secret);
    }
    walk(anon, 'http');
    const emptyBody = await fetch(EMPTY + 'api/leaderboard').then(r => r.json());
    assert(emptyBody.players.length === 0 && emptyBody.limit === 100 && !Object.prototype.hasOwnProperty.call(emptyBody, 'me'), 'a server with no completed games returns an empty list and no me');

    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert(src.includes('function checkAch') && src.includes('10次MVP') && src.includes("laurel"), 'achievement and MVP reward logic stays in the client');
    assert(!src.includes('BOARD_NOTE') && !src.includes('lb-note') && !src.includes('aria-describedby'), 'the rules note is gone from the client');

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
    const emptyUi = await cdp.eval(`(() => {
      const pin = document.querySelector('.lb-me');
      return { text: document.querySelector('#app').innerText, rows: document.querySelectorAll('.lb li').length, note: !!document.querySelector('#lb-note') || !!document.querySelector('[aria-describedby]'), pin: pin ? pin.innerText.replace(/\\s+/g, ' ').trim() : '', state: pin ? pin.dataset.state : '' };
    })()`);
    assert(emptyUi.text.includes('暫時未有完成對局可以排名') && emptyUi.rows === 0, 'empty board explains itself and lists nobody');
    assert(!emptyUi.note && emptyUi.state === 'unranked' && emptyUi.pin.includes('你的排名') && emptyUi.pin.includes('未上榜') && !emptyUi.text.includes('全球所有玩家'), 'an empty board still pins the viewer and drops the rules note');

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
      const pin = document.querySelector('.lb-me');
      const list = document.querySelector('.lb');
      const app = document.querySelector('#app');
      return {
        rows: rows.slice(0, 8), n: rows.length,
        note: !!document.querySelector('#lb-note') || !!document.querySelector('.lb-note') || !!document.querySelector('[aria-describedby]'),
        rules: /全球所有玩家|唔係只計呢間房|固定身份編號|四捨五入/.test(document.body.innerText),
        pin: pin ? { state: pin.dataset.state, text: pin.innerText.replace(/\\s+/g, ' ').trim(), above: !!(list && (pin.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)) } : null,
        title: document.querySelector('#topTitle').textContent, scroll: app.scrollHeight, body: document.body.innerText.includes('機械sim'),
      };
    })()`);
    assert(ui.title === '排行榜' && ui.n === 100, 'mobile board lists 100 rows under the 排行榜 title');
    assert(!ui.note && !ui.rules, 'the rules note and its description link are gone');
    assert(ui.pin && ui.pin.above && ui.pin.state === 'unranked' && ui.pin.text.includes('你的排名') && ui.pin.text.includes('未上榜') && ui.pin.text.includes('0%') && ui.pin.text.includes('MVP 次數 0') && ui.pin.text.includes('0勝/0場') && !ui.pin.text.includes('示例甲'), '0 games pins 未上榜 with zeroed stats and does not borrow another player');
    assert(!ui.body, 'fixture names are not rendered');
    const top = ui.rows[0];
    assert(top.text.includes('精確乙') && top.text.includes('33%') && top.text.includes('13勝/40場') && top.text.includes('MVP 13') && top.text.indexOf('MVP 13') < top.text.indexOf('33%'), 'first row is the most MVP, with the win rate still visible');
    const alphaUi = ui.rows.find(r => r.text.includes('示例甲'));
    const whaleUi = ui.rows.find(r => r.text.includes('MVP鯨魚'));
    assert(alphaUi && whaleUi && ui.rows.indexOf(whaleUi) < ui.rows.indexOf(alphaUi), 'the phone list puts 5 MVP above 3 MVP at 100%');
    assert(alphaUi.text.includes('MVP 3') && alphaUi.text.includes('100%') && alphaUi.text.indexOf('MVP 3') < alphaUi.text.indexOf('100%') && alphaUi.av.includes('/img/av/panda.webp') && alphaUi.pd.includes('/img/pd/crown.webp'), 'a higher win rate still shows its percent, avatar, and pendant under a lower MVP count');
    assert(top.label.includes('MVP 13 次') && top.label.includes('33%'), 'the first row label names the MVP count and the rounded rate');
    assert(alphaUi.label.includes('MVP 3 次') && alphaUi.label.includes('100%'), 'a lower row label still names its MVP count and win rate');
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
        const mvpPx = parseFloat(getComputedStyle(mvp).fontSize);
        const pctPx = parseFloat(getComputedStyle(pct).fontSize);
        const mvpLarger = mvpPx > pctPx && pr.width > 0;
        if (!(same && left && below && face && clearName && clearRank && inside && mr.width > 0 && pr.width > 0 && mvpLarger)) {
          bad.push({ name: nm.textContent, same, left, below, face, clearName, clearRank, inside, mvpLarger, mvpPx, pctPx, gap: Math.round((pr.left - mr.right) * 10) / 10 });
          if (bad.length >= 4) break;
        }
      }
      return { bad, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    })()`;
    const pinFitExpr = `(() => {
      const pin = document.querySelector('.lb-me');
      if (!pin) return { missing: true };
      const card = pin.closest('.card').getBoundingClientRect();
      const box = pin.getBoundingClientRect();
      const inside = box.left >= card.left - 1 && box.right <= card.right + 1 && box.width > 0;
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      if (pin.querySelector('.lb-me-out')) return { inside, overflow, signedOut: true };
      const rank = pin.querySelector('.lb-me-rank').getBoundingClientRect();
      const av = pin.querySelector('.av').getBoundingClientRect();
      const nm = pin.querySelector('.nm').getBoundingClientRect();
      const mvpEl = pin.querySelector('.lb-me-mvp');
      const mvp = mvpEl.getBoundingClientRect();
      const rateEl = pin.querySelector('.lb-me-rate');
      const rate = rateEl.getBoundingClientRect();
      const label = pin.querySelector('.lb-me-k').getBoundingClientRect();
      const subs = [...pin.querySelectorAll('.lb-me-sub')].map(el => el.getBoundingClientRect());
      const mvpPx = parseFloat(getComputedStyle(mvpEl.querySelector('b')).fontSize);
      const ratePx = parseFloat(getComputedStyle(rateEl).fontSize);
      return {
        inside, overflow,
        clearRank: av.left >= rank.right - 1,
        clearName: mvp.left >= nm.right - 1,
        rateInside: mvp.right <= box.right - 4 && rate.right <= box.right - 4 && rate.width > 0,
        labelAbove: label.bottom <= Math.min(rank.top, av.top) + 2,
        under: subs.length === 2 && subs[0].top >= nm.bottom - 1 && subs[1].top >= subs[0].bottom - 1,
        mvpLarger: mvpPx > ratePx,
        gap: Math.round((av.left - rank.right) * 10) / 10,
      };
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
    async function openBoard(token) {
      await cdp.eval(`localStorage.setItem('cc.token', ${JSON.stringify(token)})`);
      await cdp.send('Page.navigate', { url: APP });
      await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-v="board"]')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
      await cdp.eval(`document.querySelector('[data-v="board"]').click()`);
      await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.lb-me') && document.querySelector('.lb li')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
      await cdp.eval(`window.scrollTo(0, 0)`);
    }
    async function shot(name) {
      const png = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('/opt/cursor/artifacts/' + name + '.png', Buffer.from(png.data, 'base64'));
    }
    fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
    await setPhone(375, 812);
    const fit375 = await cdp.eval(fitExpr);
    const pin375 = await cdp.eval(pinFitExpr);
    assert(!fit375.overflow && fit375.bad.length === 0, '375 board keeps MVP left of the percent without covering the face ' + JSON.stringify(fit375));
    assert(pin375.inside && !pin375.overflow && pin375.clearRank && pin375.clearName && pin375.rateInside && pin375.labelAbove && pin375.under && pin375.mvpLarger, '375 pin card keeps the rank, face, name, MVP count, and win rate apart ' + JSON.stringify(pin375));
    await shot('pin-me-unranked-375');
    await setPhone(390, 844);
    const fit390 = await cdp.eval(fitExpr);
    const pin390 = await cdp.eval(pinFitExpr);
    assert(!fit390.overflow && fit390.bad.length === 0, '390 board keeps MVP left of the percent without covering the face ' + JSON.stringify(fit390));
    assert(pin390.inside && !pin390.overflow && pin390.clearRank && pin390.clearName && pin390.rateInside && pin390.labelAbove && pin390.under && pin390.mvpLarger, '390 pin card keeps the rank, face, name, MVP count, and win rate apart ' + JSON.stringify(pin390));
    await shot('pin-me-unranked-390');

    await openBoard(tokAlpha);
    const ranked = await cdp.eval(`(() => {
      const pin = document.querySelector('.lb-me');
      const row = [...document.querySelectorAll('.lb li')].find(li => (li.querySelector('.nm') || {}).textContent === '示例甲');
      return {
        title: document.querySelector('#topTitle').textContent,
        state: pin.dataset.state,
        rank: pin.dataset.rank,
        text: pin.innerText.replace(/\\s+/g, ' ').trim(),
        label: pin.getAttribute('aria-label') || '',
        av: (pin.querySelector('.av img') || {}).src || '',
        pd: (pin.querySelector('.pov') || {}).src || '',
        rowRank: row ? row.dataset.rank : '',
        rowStill: !!row,
        note: !!document.querySelector('#lb-note') || !!document.querySelector('[aria-describedby]'),
        rules: /全球所有玩家|固定身份編號/.test(document.body.innerText),
      };
    })()`);
    assert(ranked.title === '排行榜' && ranked.state === 'ranked' && ranked.rank === String(alphaRank) && ranked.rowRank === ranked.rank && ranked.rowStill, 'the signed-in rank is pinned and the matching list row stays ' + JSON.stringify(ranked));
    assert(ranked.text.includes('你的排名') && ranked.text.includes('示例甲') && ranked.text.includes('100%') && ranked.text.includes('MVP 次數 3') && ranked.text.includes('3勝/3場'), 'the pin shows the rounded win rate, MVP count, and record');
    assert(ranked.av.includes('/img/av/panda.webp') && ranked.pd.includes('/img/pd/crown.webp'), 'the pin uses the viewer avatar and pendant');
    assert(ranked.label.includes('第 ' + alphaRank + ' 名') && ranked.label.includes('100%') && !ranked.note && !ranked.rules, 'the pin names the true rank without the rules note');
    assert(!ranked.text.includes('好人勝利場') && !ranked.text.includes('狼人勝利場') && !ranked.text.includes('16.5'), 'the pin does not copy werewolf score lines');
    await setPhone(375, 812);
    const rankedFit375 = await cdp.eval(pinFitExpr);
    const rankedList375 = await cdp.eval(fitExpr);
    assert(rankedFit375.inside && !rankedFit375.overflow && rankedFit375.clearRank && rankedFit375.clearName && rankedFit375.rateInside && rankedFit375.labelAbove && rankedFit375.under && rankedFit375.mvpLarger, '375 ranked pin stays inside the card ' + JSON.stringify(rankedFit375));
    assert(!rankedList375.overflow && rankedList375.bad.length === 0, '375 list still fits under the pin ' + JSON.stringify(rankedList375));
    await shot('pin-me-ranked-375');
    await setPhone(390, 844);
    const rankedFit390 = await cdp.eval(pinFitExpr);
    assert(rankedFit390.inside && !rankedFit390.overflow && rankedFit390.clearRank && rankedFit390.clearName && rankedFit390.rateInside && rankedFit390.labelAbove && rankedFit390.under && rankedFit390.mvpLarger, '390 ranked pin stays inside the card ' + JSON.stringify(rankedFit390));
    await shot('pin-me-ranked-390');

    await openBoard(tokOut);
    const below = await cdp.eval(`(() => {
      const pin = document.querySelector('.lb-me');
      const names = [...document.querySelectorAll('.lb li .nm')].map(el => el.textContent);
      const ranks = [...document.querySelectorAll('.lb li')].map(li => Number(li.dataset.rank));
      return { state: pin.dataset.state, rank: pin.dataset.rank, name: (pin.querySelector('.nm') || {}).textContent || '', inList: names.includes(${JSON.stringify(outside.name)}), max: Math.max(...ranks), n: ranks.length };
    })()`);
    assert(below.state === 'ranked' && below.rank === '101' && below.name === outside.name && !below.inList && below.max === 100 && below.n === 100, 'a viewer outside the top 100 still sees the true global rank ' + JSON.stringify(below));

    await cdp.eval(`(() => {
      const orig = window.fetch.bind(window);
      window.fetch = (url, opt) => String(url).includes('/api/leaderboard')
        ? orig(url, opt).then(async r => { const j = await r.json(); delete j.me; return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } }); })
        : orig(url, opt);
    })()`);
    await cdp.eval(`document.querySelector('#backBtn').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-v="board"]')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    await cdp.eval(`document.querySelector('[data-v="board"]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.lb-me-out')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    const signedOut = await cdp.eval(`(() => {
      const pin = document.querySelector('.lb-me');
      const first = (document.querySelector('.lb .nm') || {}).textContent || '';
      return {
        state: pin.dataset.state,
        text: pin.innerText.replace(/\\s+/g, ' ').trim(),
        rank: !!pin.querySelector('.lb-me-rank'),
        note: !!document.querySelector('#lb-note') || !!document.querySelector('.lb-note') || !!document.querySelector('[aria-describedby]'),
        rules: /全球所有玩家|固定身份編號/.test(document.body.innerText),
        stole: !!(first && pin.innerText.includes(first)),
        rows: document.querySelectorAll('.lb li').length,
      };
    })()`);
    assert(signedOut.state === 'signedout' && signedOut.text === '你的排名 登入後即可查看你的排名' && !signedOut.rank && !signedOut.stole && signedOut.rows === 100, 'a signed-out board does not invent a rank from the list ' + JSON.stringify(signedOut));
    assert(!signedOut.note && !signedOut.rules, 'the signed-out board still has no rules note');
  } finally {
    try { chrome && chrome.kill('SIGKILL'); } catch {}
    try { srv && srv.kill('SIGKILL'); } catch {}
    try { emptySrv && emptySrv.kill('SIGKILL'); } catch {}
  }
  console.log('LEADERBOARD TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });
