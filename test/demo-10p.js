// Local disposable 10-player 示範局. Drives the real browser UI; other seats are
// socket bots on the same server. Does not use DATABASE_URL.
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = Number(process.env.PORT || 3223);
const CDP = Number(process.env.CDP || 9371);
const APP = `http://127.0.0.1:${PORT}/`;
const DATA = process.env.DATA_DIR || ('/tmp/demo10-' + Date.now());
const OUT = process.env.OUT || '/opt/cursor/artifacts';
const FAST = process.env.FAST === '1';
const sleep = (ms) => new Promise(r => setTimeout(r, FAST ? Math.min(ms, 280) : ms));
const ANIMALS = ['fox','panda','duck','squirrel','hedgehog','bunny','bear','redpanda','otter','hamster','shiba'];

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}
async function until(fn, ms = 20000, label = 'wait') {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return true; await sleep(80); }
  throw new Error('timeout: ' + label);
}

class Page {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map();
    this.ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Page.javascriptDialogOpening') {
        console.log('dialog', (m.params && m.params.message || '').slice(0, 80));
        setTimeout(() => this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}), FAST ? 200 : 1200);
      }
      if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
      }
    });
  }
  ready() { return new Promise(r => this.ws.addEventListener('open', r, { once: true })); }
  send(method, params = {}, timeout = 20000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error('cdp ' + method)); }, timeout);
      this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression, timeout = 8000) {
    try {
      const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error((d.exception && d.exception.description) || d.text || 'eval');
      }
      return r.result && r.result.value;
    } catch (e) {
      console.error('EVAL FAIL', String(expression).slice(0, 180), e.message);
      throw e;
    }
  }
  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }
}

function bot(url, guestKey, name) {
  const s = io(url, { transports: ['websocket'], forceNew: true });
  const c = { s, st: null, name, guestKey };
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
  c.ready = new Promise((res, rej) => {
    s.on('connect', async () => {
      const h = await c.emit('hello', { guestKey, name });
      if (!h || h.error) rej(new Error(h && h.error || 'hello'));
      else res(h);
    });
  });
  return c;
}

async function makeGuest(name, avatar) {
  const guestKey = 'demo' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const r = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name, avatar, bg: '#ffffff', fx: 'spot', pendant: 'none' } }) });
  const j = await r.json();
  if (!j.token) throw new Error('guest ' + name + ' ' + JSON.stringify(j));
  return { guestKey, token: j.token, userId: j.user.id, name, avatar };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(DATA, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', GM_EMAIL: '', GM_USER_ID: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });
  console.log('demo server', APP, 'data', DATA);

  const host = await makeGuest('示範局', 'fox');
  const others = [];
  for (let i = 2; i <= 10; i++) others.push(await makeGuest('示範' + i, ANIMALS[i % ANIMALS.length]));
  const watcher = await makeGuest('示範觀戰', 'cat');
  const all = [host, ...others];

  const chrome = spawn('google-chrome', [
    '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble',
    '--ozone-platform=x11',
    '--user-data-dir=/tmp/demo-chrome-10p-' + process.pid,
    '--remote-debugging-port=' + CDP,
    '--window-position=700,16', '--window-size=420,900',
    '--app=' + APP,
  ], { stdio: 'ignore', env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' } });

  let pageInfo;
  for (let i = 0; i < 40 && !pageInfo; i++) {
    try { pageInfo = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(150); }
  }
  if (!pageInfo) throw new Error('no chrome page');
  const page = new Page(pageInfo.webSocketDebuggerUrl);
  const stopAll = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stopAll);
  await page.ready();
  await page.send('Runtime.enable');
  await page.send('Page.enable');

  const bots = all.map(p => bot(APP, p.guestKey, p.name));
  const spec = bot(APP, watcher.guestKey, watcher.name);
  await Promise.all([...bots, spec].map(b => b.ready));
  const byPid = new Map(all.map((p, i) => [bots[i], p]));

  async function dom(expr) { return page.eval('(() => { try { return (' + expr + '); } catch (e) { return { __err: String(e) }; } })()'); }
  async function click(sel) {
    const ok = await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
    if (!ok) throw new Error('no element ' + sel);
  }
  async function waitDom(expr, ms, label) {
    await until(async () => !!(await page.eval('(() => { try { return !!(' + expr + '); } catch(e) { return false; } })()')), ms, label);
  }

  async function become(person) {
    const profile = JSON.stringify({ name: person.name, avatar: person.avatar, bg: '#ffffff', fx: 'spot', pendant: 'none' });
    await page.eval(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.userId)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); true`);
    await page.send('Page.navigate', { url: APP });
    await sleep(700);
    await until(async () => {
      try { return !!(await page.eval(`!!document.querySelector('.rt .st, [data-a="create"]')`, 2500)); }
      catch { return false; }
    }, 12000, 'arrive as ' + person.name);
    await sleep(300);
  }

  function meBot() {
    // The visible browser's user is whichever token we last became.
    return bots.find(b => byPid.get(b).userId === current.userId);
  }
  let current = host;

  async function modalState() {
    return page.eval(`(() => {
      const modal = document.querySelector('#modal');
      const hidden = !modal || modal.classList.contains('hidden');
      const flip = document.querySelector('#flip');
      const tl = document.querySelector('#tl');
      const h = document.querySelector('#sheet h2, .rv-h, .qr-h, .banner h2');
      return { hidden, flip: !!flip, opened: !!(flip && flip.classList.contains('on')), ok: !!document.querySelector('#sheet #ok'), tally: !!(tl && tl.classList.contains('on')), title: h ? h.textContent : '', spec: !!(document.querySelector('.specbar')) };
    })()`);
  }
  async function assertClear(tag) {
    const r = await page.eval(`(() => {
      const main = document.querySelector('main');
      const fab = document.querySelector('.myrole-fab');
      const bar = document.querySelector('.bottombar');
      const blocker = fab || bar;
      if (!main || !blocker) return { ok: true, why: 'no bar' };
      const mr = main.getBoundingClientRect();
      const br = blocker.getBoundingClientRect();
      const hits = [];
      for (const el of main.querySelectorAll('.track, .rt, .rolestrip, [data-a="propose"], [data-a="vote"], [data-a="quest"], [data-a="lady"], [data-a="assassinate"], .qpick')) {
        const box = el.getBoundingClientRect();
        const top = Math.max(box.top, mr.top), bot = Math.min(box.bottom, mr.bottom);
        if (bot - top < 8) continue;
        const cover = !(bot <= br.top + 1 || top >= br.bottom - 1 || box.right <= br.left + 1 || box.left >= br.right - 1);
        if (cover) hits.push((el.className || el.getAttribute('data-a') || 'el').toString().slice(0, 48));
      }
      const bandOk = fab ? mr.bottom <= br.top + 1 : true;
      return { ok: hits.length === 0 && bandOk, hits, gap: Math.round(fab ? br.top - mr.bottom : br.top - (document.querySelector('.cfgcard') ? document.querySelector('.cfgcard').getBoundingClientRect().bottom : 0)), pos: getComputedStyle(main).position };
    })()`);
    console.log('clear', tag, JSON.stringify(r));
    if (!r.ok) throw new Error('bottom bar covers content at ' + tag + ' ' + JSON.stringify(r));
  }

  async function drainModals(viewMs) {
    for (let i = 0; i < 6; i++) {
      const m = await modalState();
      if (m.hidden) return;
      if (m.flip && !m.opened) { await click('#flip'); await sleep(viewMs); continue; }
      if (m.ok) {
        if (!m.tally && /投票|任務/.test(m.title)) {
          await until(async () => (await modalState()).tally || (await modalState()).hidden, 12000, 'tally').catch(() => {});
        }
        await sleep(viewMs);
        const still = await modalState();
        if (!still.hidden && still.ok) await click('#ok');
        await sleep(350);
        continue;
      }
      return;
    }
  }

  // ---- segment A: host overview ----
  let ff = null;
  function startRec(file) {
    let info = '';
    for (let i = 0; i < 15 && !info.includes('Width'); i++) {
      try {
        const geo = execFileSync('xdotool', ['search', '--onlyvisible', '--class', 'google-chrome'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
        const id = geo[geo.length - 1];
        info = execFileSync('xwininfo', ['-id', id], { encoding: 'utf8' });
      } catch { info = ''; }
    }
    if (!info.includes('Width')) throw new Error('chrome window not on the display');
    const g = (k) => Number((info.match(new RegExp(k + ':\\s+(-?\\d+)')) || [])[1]);
    const X = Math.max(0, g('Absolute upper-left X')), Y = Math.max(0, g('Absolute upper-left Y'));
    const W = Math.max(2, g('Width') - (g('Width') % 2)), H = Math.max(2, g('Height') - (g('Height') % 2));
    console.log('record', file, X, Y, W, H);
    const proc = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '0', '-video_size', W + 'x' + H, '-framerate', '12', '-i', (process.env.DISPLAY || ':1') + '+' + X + ',' + Y, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'veryfast', '-movflags', '+faststart', file], { stdio: 'ignore' });
    proc.on('exit', (code) => console.log('ffmpeg exit', path.basename(file), code));
    return proc;
  }
  async function stopRec(proc) {
    if (!proc || proc.exitCode != null || proc.killed) return;
    proc.kill('SIGINT');
    await Promise.race([
      new Promise(r => proc.on('exit', r)),
      sleep(8000).then(() => { try { proc.kill('SIGKILL'); } catch {} }),
    ]);
  }

  if (process.env.RECORD === 'host' || process.env.RECORD === 'all') ff = startRec(path.join(OUT, 'demo-host-10p.mp4'));
  await sleep(600);

  await become(host);
  await sleep(900); // home
  await click('[data-a="create"]');
  await waitDom(`document.querySelector('.rt')`, 10000, 'room');
  await sleep(700);
  await click('[data-a="cfg"]');
  await waitDom(`document.querySelector('[data-a="cap"][data-n="10"]')`, 5000, 'cfg');
  await click('[data-a="cap"][data-n="10"]');
  await sleep(1600); // show 10人, 湖中仙女 on, 王者之劍/蘭斯洛特/回避 off
  await click('[data-a="cfgclose"]');
  await sleep(400);

  await bots[0].emit('hello', { guestKey: host.guestKey, name: host.name });
  await until(() => bots[0].st && bots[0].st.code && bots[0].st.capacity === 10, 8000, 'host bot in 示範局');
  const code = bots[0].st.code;
  console.log('示範局 room', code);
  for (const b of bots.slice(1)) {
    const j = await b.emit('join', { code });
    if (!j || j.error) throw new Error('join ' + b.name + ' ' + JSON.stringify(j));
    await sleep(180);
  }
  for (let i = 1; i < bots.length; i++) {
    const seat = i + 1;
    const s = await bots[i].act('sit', { seat });
    if (!s || !s.ok) throw new Error('sit ' + seat + ' ' + JSON.stringify(s));
    await sleep(220);
  }
  const wj = await spec.emit('join', { code });
  if (!wj || wj.error) throw new Error('spectator ' + JSON.stringify(wj));
  await until(() => bots[0].st && bots[0].st.seated === 10, 8000, '10 seated');
  await sleep(500);
  await page.eval(`window.scrollTo(0, document.documentElement.scrollHeight)`);
  await sleep(300);
  const lobbyGap = await page.eval(`(() => { const bar = document.querySelector('.bottombar').getBoundingClientRect(); const card = document.querySelector('.cfgcard').getBoundingClientRect(); return { card: card.bottom, bar: bar.top, gap: bar.top - card.bottom }; })()`);
  console.log('lobby clearance', JSON.stringify(lobbyGap));
  if (lobbyGap.gap < 8) throw new Error('lobby card is under the action bar ' + JSON.stringify(lobbyGap));
  await page.eval(`window.scrollTo(0, 0)`);
  await sleep(400);

  await click('.emote-btn');
  await sleep(500);
  await click('#emopop button');
  await sleep(1200);

  // Spectator privacy, mid-lobby is not enough; show after the deal is hidden.
  await click('[data-a="start"]');
  await waitDom(`document.querySelector('#flip')`, 12000, 'deal');
  await sleep(600);
  await click('#flip');
  await sleep(2200);
  await click('#ok');
  await sleep(500);

  await become(watcher);
  await waitDom(`document.querySelector('.specbar')`, 10000, 'spectator');
  const specInfo = await page.eval(`(() => ({ bar: (document.querySelector('.specbar')||{}).textContent, role: !!document.querySelector('[data-a="role"]'), fab: !!document.querySelector('.myrole-fab'), vote: !!document.querySelector('[data-a="vote"]') }))()`);
  console.log('spectator', specInfo);
  if (!/觀戰/.test(specInfo.bar || '') || specInfo.role || specInfo.fab) throw new Error('spectator saw private controls ' + JSON.stringify(specInfo));
  await sleep(2500);
  await become(host);
  await waitDom(`document.querySelector('.rt') && !document.querySelector('.specbar')`, 10000, 'back to host');
  await drainModals(400);
  await assertClear('in-game');

  const hostBot = bots[0];
  async function phase() { return hostBot.st && hostBot.st.game && hostBot.st.game.phase; }
  async function playRest() {
    for (let step = 0; step < 40; step++) {
      const g0 = hostBot.st && hostBot.st.game;
      if (g0 && g0.phase === 'end') return g0;
      await drainModals(700);
      const g = hostBot.st.game;
      if (!g) throw new Error('no game');
      console.log('phase', g.phase, 'round', g.round);
      if (g.phase === 'end') return g;
      const browserId = hostBot.st.meId;
      if (g.phase === 'team') {
        const need = g.teamSizes[g.round];
        const evil = bots.filter(b => b.st.game.me.side === 'evil').map(b => b.st.meId);
        const rest = g.seats.map(s => s.id).filter(id => !evil.includes(id));
        const team = (g.round === 2 || g.round === 3) ? [evil[0], ...rest].slice(0, need) : g.seats.map(s => s.id).slice(0, need);
        if (g.leaderId === browserId) {
          await sleep(400);
          for (const id of team) { await click(`.rt .st[data-id="${id}"]`); await sleep(200); }
          await click('[data-a="propose"]');
        } else {
          const leader = bots.find(b => b.st.meId === g.leaderId);
          const r = await leader.act('propose', { team });
          if (!r || !r.ok) throw new Error('propose ' + JSON.stringify(r));
        }
        await until(() => hostBot.st.game.phase === 'vote', 8000, 'vote');
      } else if (g.phase === 'vote') {
        for (const b of bots) {
          if (b === hostBot) continue;
          if (b.st.game.me && b.st.game.me.voted) continue;
          await b.act('vote', { approve: true });
          await sleep(120);
        }
        await sleep(300);
        if (!(hostBot.st.game.me && hostBot.st.game.me.voted)) await click('[data-a="vote"][data-v="1"]');
        await until(() => hostBot.st.game.phase !== 'vote', 8000, 'voted');
        await sleep(200);
      } else if (g.phase === 'quest') {
        const members = g.team.map(id => bots.find(b => b.st.meId === id));
        const round = g.round;
        const two = round === 3;
        let failsLeft = two ? 1 : (round === 2 ? 1 : 0); // mission 3 (index 2) fails; mission 4 one fail still succeeds
        for (const b of members) {
          if (!b) continue;
          const evil = b.st.game.me.side === 'evil';
          const fail = evil && failsLeft > 0;
          if (fail) failsLeft--;
          if (b === hostBot) {
            await sleep(400);
            await click(`[data-a="quest"][data-v="${fail ? 0 : 1}"]`);
          } else {
            await b.act('quest', { success: !fail });
            await sleep(100);
          }
        }
        await until(() => hostBot.st.game.phase !== 'quest', 8000, 'quest done');
      } else if (g.phase === 'lady') {
        const holder = bots.find(b => b.st.meId === g.ladyId);
        console.log('lady as', holder && holder.name, 'host?', holder === hostBot);
        const target = g.seats.find(s => s.id !== g.ladyId && !(g.ladyUsed || []).includes(s.id));
        if (holder !== hostBot) {
          await become(byPid.get(holder));
          current = byPid.get(holder);
          await drainModals(300);
        }
        await sleep(400);
        await click(`.rt .st[data-id="${target.id}"]`);
        await sleep(300);
        await click('[data-a="lady"]');
        await until(() => hostBot.st.game.phase !== 'lady', 8000, 'lady');
        await sleep(400);
        await drainModals(1400);
        if (current !== host) { await become(host); current = host; await drainModals(300); }
      } else if (g.phase === 'assassin') {
        const assassin = bots.find(b => b.st.game.me.role === 'assassin');
        const merlin = bots.find(b => b.st.game.me.role === 'merlin');
        const wrong = bots.find(b => b.st.game.me.side === 'good' && b !== merlin);
        if (assassin !== hostBot) { await become(byPid.get(assassin)); current = byPid.get(assassin); await drainModals(300); }
        await sleep(500);
        await click(`.rt .st[data-id="${wrong.st.meId}"]`);
        await sleep(300);
        await click('[data-a="assassinate"]');
        await until(() => hostBot.st.game.phase === 'end', 8000, 'end');
        if (current !== host) { await become(host); current = host; }
      } else {
        await sleep(300);
      }
    }
    throw new Error('game did not finish, phase ' + (hostBot.st.game && hostBot.st.game.phase));
  }

  let end;
  try {
  end = await playRest();
  console.log('winner', end.winner, end.reason, 'twoFail', end.twoFailRound, 'lady', (end.ladyLog || []).length, 'mvp', end.mvp, 'quests', (end.quests || []).map(q => q && (q.success ? 'S' + q.fails : 'F' + q.fails)));
  if (end.winner !== 'good') throw new Error('expected good win, got ' + end.winner + ' ' + end.reason);
  if (end.twoFailRound !== 3) throw new Error('two-fail round ' + end.twoFailRound);
  if (!(end.ladyLog && end.ladyLog.length >= 1)) throw new Error('lady did not act');
  const q4 = end.quests && end.quests[3];
  if (!q4 || !q4.success || q4.fails < 1) throw new Error('mission 4 should succeed with a fail still showing two-fail ' + JSON.stringify(q4));
  await until(async () => {
    const m = await modalState();
    if (m.hidden) return true;
    if (await page.eval(`!!document.querySelector('#sh')`)) return true;
    if (m.ok) { await click('#ok'); await sleep(400); }
    return false;
  }, 12000, 'reach result sheet');
  await waitDom(`document.querySelector('#sh, .banner h2')`, 8000, 'result');
  await sleep(2200);
  if (!(await page.eval(`!!document.querySelector('#sh')`))) {
    const opened = await page.eval(`!!document.querySelector('[data-a="sharecard"]')`);
    if (opened) await click('[data-a="sharecard"]');
  } else {
    await page.eval(`(() => { const s = document.querySelector('.sheet'); if (s) s.scrollTop = 0; })()`);
    await sleep(1200);
    await click('#sh');
  }
  await waitDom(`document.querySelector('#sheet h2') && document.querySelector('#sheet h2').textContent.includes('分享')`, 6000, 'share sheet');
  await sleep(2200);
  if (await page.eval(`!!document.querySelector('#cc')`)) { await click('#cc'); await sleep(400); }
  if (await page.eval(`!!document.querySelector('#ok')`)) { await click('#ok'); await sleep(700); }
  await waitDom(`[...document.querySelectorAll('h3')].some(el => el.textContent.includes('MVP'))`, 8000, 'mvp heading');
  const mvpShown = await page.eval(`(() => {
    const h = [...document.querySelectorAll('h3')].find(el => el.textContent.includes('MVP'));
    if (!h) return { ok: false, why: 'missing' };
    h.scrollIntoView({ block: 'center', inline: 'nearest' });
    const scroller = document.scrollingElement;
    const r0 = h.getBoundingClientRect();
    if (r0.top < 40 || r0.bottom > innerHeight - 12) scroller.scrollTop = Math.max(0, scroller.scrollTop + r0.top - 120);
    const r = h.getBoundingClientRect();
    return { ok: r.top >= 40 && r.bottom <= innerHeight - 12 && r.height > 8, top: Math.round(r.top), bottom: Math.round(r.bottom), ih: innerHeight, y: Math.round(scroller.scrollTop), text: h.textContent };
  })()`);
  console.log('mvp', JSON.stringify(mvpShown));
  if (!mvpShown.ok) throw new Error('MVP heading is not in view ' + JSON.stringify(mvpShown));
  await sleep(2400);
  await stopRec(ff);
  ff = null;

  if (process.env.SKIP_ROLES === '1') { console.log('DEMO DONE'); return; }
  // ---- segment B: each role's real knowledge ----
  // Fresh game so identities are still hidden. Same players, back to lobby and start.
  await hostBot.act('lobby');
  await until(() => hostBot.st && !hostBot.st.game, 8000, 'lobby again');
  await become(host); current = host;
  await sleep(400);
  await click('[data-a="start"]');
  await until(() => hostBot.st.game && hostBot.st.game.me, 8000, 'second deal');
  await drainModals(200);

  const shots = [];
  const roleClips = [];
  const wanted = ['merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'oberon'];
  const seen = new Set();
  const recordRoles = process.env.RECORD === 'roles' || process.env.RECORD === 'all';
  for (const b of bots) {
    const role = b.st.game.me.role;
    if (!wanted.includes(role) || seen.has(role)) continue;
    seen.add(role);
    const person = byPid.get(b);
    await become(person); current = person;
    await sleep(400);
    await drainModals(200);
    if (!(await page.eval(`!!document.querySelector('#flip')`))) {
      await click('[data-a="role"]');
      await waitDom(`document.querySelector('#flip')`, 6000, 'role ' + role);
    }
    if (!(await page.eval(`document.querySelector('#flip').classList.contains('on')`))) await click('#flip');
    await sleep(400);
    const know = await page.eval(`(() => {
      const kn = document.querySelector('#kn');
      const sheet = document.querySelector('.sheet');
      const name = (document.querySelector('.rname, .kcen b') || {}).textContent || '';
      if (kn && sheet) {
        const top = kn.getBoundingClientRect().top - sheet.getBoundingClientRect().top + sheet.scrollTop - 8;
        sheet.scrollTop = Math.max(0, top);
      }
      const ring = document.querySelector('.kring, .matepanel');
      const sr = sheet ? sheet.getBoundingClientRect() : null;
      const rr = ring ? ring.getBoundingClientRect() : null;
      const visible = !!(rr && sr && rr.top < sr.bottom - 24 && rr.bottom > sr.top + 24);
      return { name, visible, text: kn ? kn.innerText.slice(0, 80) : '' };
    })()`);
    console.log('role view', role, JSON.stringify(know));
    if (!know.visible) throw new Error('knowledge view is not on screen for ' + role);
    let clip = null;
    if (recordRoles) clip = startRec(path.join(OUT, 'roleclip-' + role + '.mp4'));
    await sleep(recordRoles ? 5200 : 700);
    const shot = path.join(OUT, 'role-' + role + '.png');
    await page.shot(shot);
    shots.push({ role, file: shot, name: person.name });
    if (clip) { await stopRec(clip); roleClips.push(path.join(OUT, 'roleclip-' + role + '.mp4')); }
    if (await page.eval(`!!document.querySelector('#ok')`)) await click('#ok');
    await sleep(250);
  }
  if (seen.size !== wanted.length) throw new Error('missing roles ' + [...wanted.filter(r => !seen.has(r))]);
  if (recordRoles) {
    const list = path.join(OUT, 'roleclips.txt');
    fs.writeFileSync(list, roleClips.map(f => "file '" + f + "'").join('\n') + '\n');
    execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(OUT, 'demo-roles-10p.mp4')], { stdio: 'inherit' });
  }

  // comparison grid
  const labeled = shots.map(s => {
    const out = s.file.replace('.png', '-l.png');
    execFileSync('ffmpeg', ['-y', '-i', s.file, '-vf', `scale=340:760:force_original_aspect_ratio=decrease,pad=340:760:(ow-iw)/2:(oh-ih)/2:0x10141e,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text=${s.role}:x=16:y=18:fontsize=28:fontcolor=white:box=1:boxcolor=0x00000099`, out], { stdio: 'inherit' });
    return out;
  });
  const grid = path.join(OUT, 'demo-roles-grid.png');
  execFileSync('ffmpeg', ['-y', ...labeled.flatMap(f => ['-i', f]), '-filter_complex', 'tile=4x2:padding=8:color=0x10141e', grid], { stdio: 'ignore' });
  console.log('grid', grid);
  for (const f of ['demo-host-10p.mp4', 'demo-roles-10p.mp4']) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p)) continue;
    const sz = fs.statSync(p).size;
    console.log(f, (sz / 1e6).toFixed(1) + 'MB');
  }
  console.log('DEMO DONE');
  } finally {
    await stopRec(ff);
    try { chrome.kill('SIGKILL'); } catch {}
    bots.forEach(b => { try { b.s.close(); } catch {} });
    try { spec.s.close(); } catch {}
    try { srv.kill('SIGKILL'); } catch {}
  }
})().catch(e => { console.error(e); process.exit(1); });
