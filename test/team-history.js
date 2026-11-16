// In-game 組隊記錄 uses resolved server votes only.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const RECORD = process.env.RECORD === '1';
const PORT = 3441;
const CDP = 9451;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/teamhist-' + Date.now();
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
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
      if (st.__g) {
        const g = { ...(m.game || {}) };
        for (const k in st.__g) if (k !== '__r') g[k] = st.__g[k];
        (st.__g.__r || []).forEach(k => delete g[k]);
        m.game = g;
      }
      st = m;
    }
    c.st = st;
  });
  c.emit = (ev, d) => new Promise(r => s.emit(ev, d, r));
  c.act = (type, data) => c.emit('act', { type, data });
  c.ready = new Promise((res, rej) => s.on('connect', async () => {
    const h = await c.emit('hello', { guestKey: key, name });
    if (!h || h.error) rej(new Error(h && h.error || 'hello'));
    else res(h);
  }));
  return c;
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0', GM_EMAIL: '', GM_USER_ID: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let chrome;
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });

  const names = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const people = [];
  for (let i = 0; i < 10; i++) {
    const guestKey = 'th' + i + 'k' + Date.now().toString(36) + i;
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#ffffff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i] });
  }
  const watcherKey = 'thwatch' + Date.now().toString(36);
  const watcher = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey: watcherKey, profile: { name: '觀戰', avatar: 'cat', bg: '#ffffff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
  const bots = people.map(p => bot(p.guestKey, p.name));
  const specBot = bot(watcherKey, '觀戰');
  await Promise.all([...bots, specBot].map(b => b.ready));
  const made = await bots[0].emit('create', {});
  if (!made.room) throw new Error('create');
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  await bots[0].act('capacity', { n: 10 });
  const code = made.room;
  for (let i = 1; i < 10; i++) {
    await bots[i].emit('join', { code });
    const sat = await bots[i].act('sit', { seat: i + 1 });
    if (!sat.ok) throw new Error('sit ' + JSON.stringify(sat));
  }
  await specBot.emit('join', { code });
  const started = await bots[0].act('start');
  if (!started.ok) throw new Error('start ' + JSON.stringify(started));
  for (let i = 0; i < 40 && !(bots[0].st.game); i++) await sleep(40);
  const gme = () => bots[0].st.game;
  async function until(pred, label) {
    for (let i = 0; i < 60; i++) { if (pred()) return; await sleep(40); }
    throw new Error('timeout ' + label + ' phase=' + (gme() && gme().phase));
  }
  async function propose(approve, holdId, withEvil) {
    const g = gme();
    const need = g.teamSizes[g.round];
    let ids = g.seats.map(s => s.id);
    if (withEvil) {
      const evil = bots.filter(b => b.st.game.me.side === 'evil').map(b => b.st.meId);
      ids = evil.slice(0, 1).concat(ids.filter(id => !evil.includes(id)));
    }
    const team = ids.slice(0, need);
    const leader = bots.find(b => b.st.meId === g.leaderId);
    const pr = await leader.act('propose', { team });
    if (!pr.ok) throw new Error('propose ' + JSON.stringify(pr));
    await until(() => gme().phase === 'vote', 'vote');
    for (const b of bots) {
      if (holdId && b.st.meId === holdId) continue;
      const r = await b.act('vote', { approve });
      if (!r.ok && !(r.error && /已經/.test(r.error))) throw new Error('vote ' + b.name + ' ' + JSON.stringify(r));
    }
  }
  async function quest(wantFails) {
    await until(() => gme().phase === 'quest', 'quest');
    const team = gme().team.slice();
    let left = wantFails;
    for (const b of bots) {
      if (!team.includes(b.st.meId)) continue;
      const evil = b.st.game.me.side === 'evil';
      const fail = evil && left > 0;
      if (fail) left--;
      const r = await b.act('quest', { success: !fail });
      if (!r.ok) throw new Error('quest ' + JSON.stringify(r));
    }
    await until(() => gme().phase !== 'quest', 'after quest');
  }
  async function lady() {
    if (gme().phase !== 'lady') return;
    const g = gme();
    const holder = bots.find(b => b.st.meId === g.ladyId);
    const target = g.seats.find(s => s.id !== g.ladyId && !(g.ladyUsed || []).includes(s.id));
    const r = await holder.act('lady', { id: target.id });
    if (!r.ok) throw new Error('lady ' + JSON.stringify(r));
    await until(() => gme().phase !== 'lady', 'after lady');
  }

  await propose(false);
  await until(() => gme().phase === 'team' && gme().rounds[0].length === 1, 'rejected');
  const hold = bots[9].st.meId;
  await propose(true, hold);
  await until(() => gme().phase === 'vote' && gme().voted.length === 9, 'partial');

  chrome = spawn('google-chrome', RECORD
    ? ['--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--ozone-platform=x11', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-thist-' + Date.now(), '--window-position=40,40', '--window-size=420,900', '--app=' + APP]
    : ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-thist-' + Date.now(), '--window-size=420,900', APP],
  { stdio: 'ignore', env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' } });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise(res => { const i = ++idn; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  async function setWidth(w) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 812, deviceScaleFactor: 2, mobile: true });
  }
  async function asUser(person) {
    const profile = JSON.stringify({ name: person.name || '甲', avatar: 'fox', bg: '#ffffff', fx: 'spot', pendant: 'none' });
    await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + '?t=' + Date.now())})`);
    for (let i = 0; i < 40; i++) {
      const ok = await evalj(`!!document.querySelector('#teamhist, [data-a="create"]')`).catch(() => false);
      if (ok && await evalj(`!!document.querySelector('#teamhist')`).catch(() => false)) return;
      await sleep(150);
    }
    throw new Error('no history for ' + (person.name || ''));
  }
  async function hist() {
    return evalj(`(() => {
      const el = document.querySelector('#teamhist');
      const text = el.innerText.replace(/\\s+/g, ' ');
      const row = el.querySelector('.th-row');
      const nums = row ? [...row.querySelectorAll('.th-seat b')].map(b => b.textContent).join(',') : '';
      const main = document.querySelector('main');
      return { text, nums, n: el.querySelectorAll('.th-row').length, tries: [...el.querySelectorAll('.th-try')].map(x => x.textContent), mem: row ? row.querySelectorAll('.th-seat.mem').length : 0, crowns: el.querySelectorAll('.th-seat.ld').length, sw: el.scrollWidth, cw: el.clientWidth, doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, y: main ? main.scrollTop : 0 };
    })()`);
  }

  try {
    for (let i = 0; i < 40; i++) { if (await evalj(`!!document.querySelector('[data-a="create"]')`).catch(() => false)) break; await sleep(100); }
    await sleep(200);
    await setWidth(375);
    await asUser(people[0]);
    let h = await hist();
    assert(h.text.includes('組隊記錄') && h.text.includes('第1個任務') && h.text.includes('第1次') && h.text.includes('否決'), 'rejected proposal stays in the history');
    assert(!h.text.includes('第2次'), 'an unfinished vote is not listed');
    assert(!/成功|失敗/.test(h.text), 'quest result waits until the quest is over');
    assert(h.nums === '1,2,3,4,5,6,7,8,9,10', 'seats stay in physical order');
    assert(h.mem === 3 && h.crowns === 1, 'team dots and one leader crown');
    assert(!/梅林|刺客|莫甘娜|莫德雷德|奧伯倫|派西維爾|忠臣/.test(h.text), 'history does not name roles');
    assert(h.sw <= h.cw + 1 && h.doc, '375 does not overflow');

    let ff = null;
    if (RECORD) {
      const { spawn: sp, execFileSync } = require('child_process');
      for (let i = 0; i < 4; i++) {
        const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!(m && !m.classList.contains('hidden')); })()`);
        if (!open) break;
        await evalj(`(() => { const b = document.querySelector('#ok, #flip'); if (b) b.click(); })()`);
        await sleep(250);
      }
      await evalj(`(() => { const t = document.querySelector('#toast'); if (t) t.classList.add('hidden'); document.querySelector('#teamhist').scrollIntoView({ block: 'center' }); })()`);
      await sleep(600);
      let info = '';
      for (let i = 0; i < 15 && !info.includes('Width'); i++) {
        try {
          const ids = execFileSync('xdotool', ['search', '--onlyvisible', '--class', 'google-chrome'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
          info = execFileSync('xwininfo', ['-id', ids[ids.length - 1]], { encoding: 'utf8' });
        } catch { info = ''; await sleep(100); }
      }
      const num = (k) => Number((info.match(new RegExp(k + ':\\s+(-?\\d+)')) || [])[1]);
      const X = Math.max(0, num('Absolute upper-left X')), Y = Math.max(0, num('Absolute upper-left Y'));
      const W = Math.max(2, num('Width') - (num('Width') % 2)), H = Math.max(2, num('Height') - (num('Height') % 2));
      ff = sp('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '0', '-video_size', W + 'x' + H, '-framerate', '12', '-i', (process.env.DISPLAY || ':1') + '+' + X + ',' + Y, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'veryfast', '-movflags', '+faststart', '/opt/cursor/artifacts/team-history-update.mp4'], { stdio: 'ignore' });
      await sleep(2200);
    }
    const fin = await bots.find(b => b.st.meId === hold).act('vote', { approve: true });
    if (!fin.ok) throw new Error('last vote ' + JSON.stringify(fin));
    await until(() => gme().phase === 'quest', 'quest open');
    for (let i = 0; i < 30; i++) { h = await hist(); if (h.text.includes('第2次') && h.text.includes('通過')) break; await sleep(80); }
    assert(h.text.includes('第2次') && h.text.includes('通過') && h.text.includes('第1次'), 'the approved proposal is appended and the rejection remains');
    if (RECORD) await sleep(1800);
    assert(!/成功|失敗/.test(h.text), 'passing the team is not the quest result');

    await evalj(`(() => { const m = document.querySelector('main'); const el = document.querySelector('#teamhist'); el.scrollIntoView({ block: 'start' }); m.scrollTop = m.scrollTop; return m.scrollTop; })()`);
    const y0 = await evalj(`document.querySelector('main').scrollTop`);
    await quest(0);
    await until(() => gme().quests[0] && gme().quests[0].success, 'm1 success');
    await sleep(200);
    const y1 = await evalj(`document.querySelector('main').scrollTop`);
    h = await hist();
    assert(y1 > 80 && y1 <= y0 + 1, 'scroll is not sent back to the top when the quest result arrives (' + y0 + '→' + y1 + ')');
    assert(/第1個任務[\s\S]*成功/.test(h.text) && !h.text.includes('張失敗'), 'mission 1 heading is only the aggregate success');
    if (ff) {
      await sleep(2200);
      ff.kill('SIGINT');
      await new Promise(r => ff.on('exit', r));
      ff = null;
    }

    await pumpLady();
    await propose(true);
    await quest(0);
    await until(() => gme().quests[1], 'm2');
    await pumpLady();
    await propose(true, null, true);
    await quest(1);
    await until(() => gme().quests[2] && gme().quests[2].success === false, 'm3 fail');
    h = await hist();
    assert(h.text.includes('失敗 · 1張失敗'), 'a failed quest shows only the fail count');
    await pumpLady();
    await propose(true, null, true);
    await quest(1);
    await until(() => gme().quests[3] && gme().quests[3].success === true, 'm4 two-fail success');
    h = await hist();
    assert(h.text.includes('第4個任務') && h.text.includes('需2張失敗') && h.text.includes('成功'), 'mission 4 shows the two-fail rule and success');
    assert(h.text.indexOf('第4個任務') < h.text.indexOf('第3個任務'), 'latest mission is first');
    assert(!h.text.includes('q_fail') && !h.text.includes('任務失敗牌'), 'individual quest cards are not in the history');

    await setWidth(390);
    h = await hist();
    assert(h.sw <= h.cw + 1 && h.doc, '390 does not overflow');
    await setWidth(375);
    for (let i = 0; i < 6; i++) {
      const open = await evalj(`(() => { const m = document.querySelector('#modal'); return m && !m.classList.contains('hidden'); })()`);
      if (!open) break;
      await evalj(`(() => { const b = document.querySelector('#ok, #flip'); if (b) b.click(); })()`);
      await sleep(200);
    }
    await evalj(`(() => { const t = document.querySelector('#toast'); if (t) t.classList.add('hidden'); document.querySelector('#teamhist').scrollIntoView({ block: 'start' }); })()`);
    await sleep(200);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
    fs.writeFileSync('/opt/cursor/artifacts/team-history-375.png', Buffer.from(shot.data, 'base64'));

    const beforeReload = h.text;
    await evalj(`location.reload()`);
    for (let i = 0; i < 40; i++) { if (await evalj(`!!document.querySelector('#teamhist')`).catch(() => false)) break; await sleep(150); }
    h = await hist();
    assert(h.text.includes('第4個任務') && h.text.includes('第1次') && h.text.includes('否決'), 'reconnect shows the same public history');

    await asUser({ token: watcher.token, user: watcher.user, name: '觀戰' });
    const specBar = await evalj(`(document.querySelector('.specbar') || {}).textContent || ''`);
    h = await hist();
    assert(/觀戰/.test(specBar), 'spectator is spectating');
    assert(h.text.includes('第4個任務') && h.text.includes('通過') && h.text.includes('否決'), 'spectator sees resolved proposals');
    assert(!/梅林|刺客|我的票|贊成「/.test(h.text), 'spectator history has no roles or private ballot');
    const last = await evalj(`(() => { const m = document.querySelector('main'); const fab = document.querySelector('.myrole-fab'); const row = document.querySelector('#teamhist .th-row:last-child'); if (!row) return { ok: false }; m.scrollTop = m.scrollHeight; const rb = row.getBoundingClientRect().bottom; const limit = fab ? fab.getBoundingClientRect().top : m.getBoundingClientRect().bottom; return { ok: rb <= limit + 1, rb, limit }; })()`);
    assert(last.ok, 'the last record clears the fixed bottom controls');
    console.log('TEAM HISTORY TESTS PASSED', beforeReload.slice(0, 40));
  } finally {
    try { ws && ws.close(); } catch {}
    stop();
    bots.forEach(b => { try { b.s.close(); } catch {} });
    try { specBot.s.close(); } catch {}
  }

  async function pumpLady() {
    for (let i = 0; i < 4 && gme().phase === 'lady'; i++) {
      const g = gme();
      const holder = bots.find(b => b.st.meId === g.ladyId);
      const target = g.seats.find(s => s.id !== g.ladyId && !(g.ladyUsed || []).includes(s.id));
      const r = await holder.act('lady', { id: target.id });
      if (!r.ok) throw new Error('lady ' + JSON.stringify(r));
      await until(() => gme().phase !== 'lady', 'lady done');
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
