// Current-branch examples from one local 5-player 示範局.
// No production database, no granted MVPs, no external share.
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3466;
const CDP = 9477;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/examples156-' + Date.now();
const OUT = '/opt/cursor/artifacts';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ANIMALS = ['fox', 'panda', 'duck', 'squirrel', 'hedgehog'];

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}

class Page {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map();
    this.ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
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
  async eval(expression, timeout = 15000) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text || 'eval');
    return r.result && r.result.value;
  }
  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('shot', path.basename(file));
  }
}

function bot(url, guestKey, name) {
  const s = io(url, { transports: ['websocket'], forceNew: true, query: { diff: '1' } });
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
    const h = await c.emit('hello', { guestKey, name });
    if (!h || h.error) rej(new Error(h && h.error || 'hello')); else res(h);
  }));
  return c;
}

function startRec(file) {
  let info = '';
  for (let i = 0; i < 15 && !info.includes('Width'); i++) {
    try {
      const geo = execFileSync('xdotool', ['search', '--onlyvisible', '--class', 'google-chrome'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      info = execFileSync('xwininfo', ['-id', geo[geo.length - 1]], { encoding: 'utf8' });
    } catch { info = ''; }
  }
  if (!info.includes('Width')) throw new Error('chrome window not on the display');
  const g = (k) => Number((info.match(new RegExp(k + ':\\s+(-?\\d+)')) || [])[1]);
  const X = Math.max(0, g('Absolute upper-left X')), Y = Math.max(0, g('Absolute upper-left Y'));
  const W = Math.max(2, g('Width') - (g('Width') % 2)), H = Math.max(2, g('Height') - (g('Height') % 2));
  console.log('record', path.basename(file), X, Y, W, H);
  const proc = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '0', '-video_size', W + 'x' + H, '-framerate', '12', '-i', (process.env.DISPLAY || ':1') + '+' + X + ',' + Y, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'veryfast', '-movflags', '+faststart', file], { stdio: 'ignore' });
  return proc;
}
async function stopRec(proc) {
  if (!proc || proc.exitCode != null || proc.killed) return;
  proc.kill('SIGINT');
  await Promise.race([new Promise(r => proc.on('exit', r)), sleep(8000).then(() => { try { proc.kill('SIGKILL'); } catch {} })]);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(DATA, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', GM_EMAIL: '', GM_USER_ID: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const chrome = spawn('google-chrome', [
    '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    '--disable-session-crashed-bubble', '--ozone-platform=x11',
    '--user-data-dir=/tmp/chrome-ex156-' + Date.now(),
    '--remote-debugging-port=' + CDP,
    '--window-position=700,16', '--window-size=420,900', '--app=' + APP,
  ], { stdio: 'ignore', env: { ...process.env, DISPLAY: process.env.DISPLAY || ':1' } });
  const stop = () => { try { chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });

  const names = ['示範局', '示範2', '示範3', '示範4', '示範5'];
  const people = [];
  for (let i = 0; i < 5; i++) {
    const guestKey = 'ex156' + i + Date.now().toString(36);
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: ANIMALS[i], bg: '#ffffff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
    if (!j.token) throw new Error('guest ' + names[i]);
    people.push({ ...j, guestKey, name: names[i], avatar: ANIMALS[i] });
  }
  const bots = people.map(p => bot(APP, p.guestKey, p.name));
  await Promise.all(bots.map(b => b.ready));
  const made = await bots[0].emit('create', {});
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  await bots[0].act('capacity', { n: 5 });
  const code = made.room;
  for (let i = 1; i < 5; i++) {
    await bots[i].emit('join', { code });
    const sat = await bots[i].act('sit', { seat: i + 1 });
    if (!sat.ok) throw new Error('sit ' + JSON.stringify(sat));
  }
  const started = await bots[0].act('start');
  if (!started.ok) throw new Error('start ' + JSON.stringify(started));
  for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.me); i++) await sleep(40);
  const gme = () => bots[0].st.game;
  async function untilPhase(pred, label) {
    for (let i = 0; i < 80; i++) { if (pred()) return; await sleep(40); }
    throw new Error('timeout ' + label + ' phase=' + (gme() && gme().phase));
  }
  async function propose(approve) {
    const g = gme();
    const team = g.seats.slice(0, g.teamSizes[g.round]).map(s => s.id);
    const leader = bots.find(b => b.st.meId === g.leaderId);
    const pr = await leader.act('propose', { team });
    if (!pr.ok) throw new Error('propose ' + JSON.stringify(pr));
    await untilPhase(() => gme().phase === 'vote', 'vote');
    for (const b of bots) {
      const r = await b.act('vote', { approve });
      if (!r.ok && !(r.error && /已經/.test(r.error))) throw new Error('vote ' + b.name + ' ' + JSON.stringify(r));
    }
  }
  async function quest() {
    await untilPhase(() => gme().phase === 'quest', 'quest');
    const team = gme().team.slice();
    for (const b of bots) {
      if (!team.includes(b.st.meId)) continue;
      const r = await b.act('quest', { success: true });
      if (!r.ok) throw new Error('quest ' + JSON.stringify(r));
    }
    await untilPhase(() => gme().phase !== 'quest', 'after quest');
  }

  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
  const page = new Page(tab.webSocketDebuggerUrl);
  await page.ready();
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT }).catch(e => console.log('download behavior', e.message));
  await page.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

  async function become(person) {
    const profile = JSON.stringify({ name: person.name, avatar: person.avatar, bg: '#ffffff', fx: 'spot', pendant: 'none' });
    await page.eval(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + '?e=' + Date.now())})`);
    for (let i = 0; i < 50; i++) {
      const ok = await page.eval(`!!document.querySelector('.rt, [data-a="role"], #flip')`).catch(() => false);
      if (ok) return;
      await sleep(150);
    }
    throw new Error('did not arrive as ' + person.name);
  }
  async function realClick(sel) {
    const box = await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: (el.innerText || '').slice(0, 20) }; })()`);
    if (!box) throw new Error('missing ' + sel);
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    return box;
  }
  async function waitSel(sel, label) {
    for (let i = 0; i < 40; i++) { if (await page.eval(`!!document.querySelector(${JSON.stringify(sel)})`).catch(() => false)) return; await sleep(150); }
    throw new Error('timeout ' + label);
  }

  const merlin = bots.find(b => b.st.game.me.role === 'merlin');
  const merlinPerson = people[bots.indexOf(merlin)];
  await become(merlinPerson);
  await waitSel('#flip', 'role card');
  const back = await page.eval(`(() => { const f = document.querySelector('#flip'); return { on: f.classList.contains('on'), holo: !!document.querySelector('.rcard.holo'), ring: !!document.querySelector('.kring') }; })()`);
  if (back.on) throw new Error('card was already face up');
  if (back.holo || back.ring) throw new Error('card back already has a locked effect or the example circle');

  let ff = startRec(path.join(OUT, 'role-reveal.mp4'));
  await sleep(2600);
  await realClick('#flip');
  await sleep(2200);
  const revealed = await page.eval(`(() => {
    const kn = document.querySelector('#kn');
    return { on: document.querySelector('#flip').classList.contains('on'), holo: !!document.querySelector('.rcard.holo'), ring: !!document.querySelector('.kring'), heading: !!(kn && kn.innerText.includes('你開局睇到')), name: (document.querySelector('.rname') || {}).textContent || '', info: (document.querySelector('.rinfo') || {}).textContent || '', mates: [...document.querySelectorAll('#kn .mate b')].map(el => el.textContent) };
  })()`);
  console.log('reveal', JSON.stringify(revealed));
  if (!revealed.on || revealed.holo || revealed.ring || revealed.heading || revealed.name !== '梅林' || revealed.info.length < 8) throw new Error('role reveal is not the plain simplified card');
  if (revealed.mates.length !== (merlin.st.game.me.knows || []).length) throw new Error('mate count mismatch');
  await page.eval(`(() => { const sheet = document.querySelector('.sheet'); const kn = document.querySelector('#kn'); if (sheet && kn) sheet.scrollTop = kn.offsetTop - 8; })()`);
  await sleep(3200);
  await stopRec(ff);
  await realClick('#ok');
  await sleep(400);

  await page.eval(`document.querySelector('#teamhist').scrollIntoView({ block: 'center' })`);
  await sleep(300);
  ff = startRec(path.join(OUT, 'team-history-live.mp4'));
  await sleep(1600);
  await propose(false);
  await waitSel('.vcards', 'reject votes');
  await sleep(2800);
  let hist = await page.eval(`document.querySelector('#teamhist').innerText.replace(/\\s+/g,' ')`);
  console.log('after reject modal', hist);
  await realClick('.modal #ok');
  await sleep(500);
  await page.eval(`document.querySelector('#teamhist').scrollIntoView({ block: 'center' })`);
  hist = await page.eval(`document.querySelector('#teamhist').innerText.replace(/\\s+/g,' ')`);
  console.log('reject row', hist);
  if (!hist.includes('否決') || hist.includes('成功')) throw new Error('rejected row missing');
  await sleep(2600);
  await propose(true);
  await waitSel('.vcards', 'approve votes');
  await sleep(2800);
  await realClick('.modal #ok');
  await sleep(500);
  await page.eval(`document.querySelector('#teamhist').scrollIntoView({ block: 'center' })`);
  hist = await page.eval(`document.querySelector('#teamhist').innerText.replace(/\\s+/g,' ')`);
  console.log('approve row', hist);
  if (!hist.includes('否決') || !hist.includes('通過') || hist.includes('成功')) throw new Error('approved row missing before the quest');
  await sleep(2600);
  await quest();
  await waitSel('.qr-res', 'quest result');
  await sleep(2600);
  await realClick('.modal #ok');
  await sleep(500);
  await page.eval(`document.querySelector('#teamhist').scrollIntoView({ block: 'center' })`);
  hist = await page.eval(`document.querySelector('#teamhist').innerText.replace(/\\s+/g,' ')`);
  console.log('mission result', hist);
  if (!hist.includes('成功') || !hist.includes('否決') || !hist.includes('通過')) throw new Error('aggregate result missing');
  await sleep(2800);
  await stopRec(ff);

  await propose(true);
  await quest();
  await propose(true);
  await quest();
  await untilPhase(() => gme().phase === 'assassin', 'assassin');
  const assassin = bots.find(b => b.st.game.me.role === 'assassin');
  const target = gme().seats.find(s => s.id !== merlin.st.meId && s.id !== assassin.st.meId);
  const hit = await assassin.act('assassinate', { id: target.id });
  if (!hit.ok) throw new Error('assassinate ' + JSON.stringify(hit));
  await untilPhase(() => gme().phase === 'end' && gme().mvp, 'ended');
  for (let i = 0; i < 16; i++) {
    const kind = await page.eval(`(() => { const m = document.querySelector('#modal'); if (!m || m.classList.contains('hidden')) return 'none'; return m.querySelector('.banner') ? 'end' : 'other'; })()`);
    if (kind === 'end') break;
    if (kind === 'other') await realClick('#modal #ok');
    await sleep(400);
  }
  if ((await page.eval(`(() => { const m = document.querySelector('#modal'); return !m || m.classList.contains('hidden') || !m.querySelector('.banner'); })()`))) throw new Error('end modal was not the visible result');
  await sleep(800);
  await page.shot(path.join(OUT, 'mvp-end.png'));
  await realClick('#modal #ok');
  await sleep(500);
  for (let i = 0; i < 10 && await page.eval(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`); i++) {
    await realClick('#modal #ok').catch(() => {});
    await sleep(300);
  }
  await page.eval(`(() => { const h = [...document.querySelectorAll('#detail h3')].find(el => el.textContent.trim() === 'MVP'); const main = document.querySelector('main'); if (!h || !main) return; main.scrollTop = h.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 8; })()`);
  await sleep(400);
  const detail = await page.eval(`(() => { const card = [...document.querySelectorAll('#detail .card')].find(el => el.querySelector('h3') && el.querySelector('h3').textContent.trim() === 'MVP'); return card ? card.innerText.replace(/\\s+/g,' ') : ''; })()`);
  console.log('detail', detail);
  if (!detail.includes('MVP') || !/\d+ 分/.test(detail)) throw new Error('MVP breakdown missing');
  await page.shot(path.join(OUT, 'mvp-detail.png'));

  const mvpId = gme().mvp;
  const mvpBot = bots.find(b => b.st.meId === mvpId);
  const mvpPerson = people[bots.indexOf(mvpBot)];
  console.log('mvp', mvpPerson.name, 'score', gme().scores[mvpId].total, 'items', JSON.stringify(gme().scores[mvpId].items));
  const statsBefore = await fetch(APP + 'api/stats', { headers: { authorization: 'Bearer ' + mvpPerson.token } }).then(r => r.json());
  if (statsBefore.mvp !== 1 || statsBefore.played !== 1) throw new Error('persisted stats before reconnect ' + JSON.stringify(statsBefore));

  await become(mvpPerson);
  await waitSel('.rt, [data-a="go"]', 'mvp home or room');
  if (await page.eval(`!!document.querySelector('.modal #ok')`).catch(() => false)) await realClick('.modal #ok');
  if (!(await page.eval(`!!document.querySelector('[data-a="go"][data-v="stats"]')`))) await realClick('#backBtn');
  await waitSel('[data-a="go"][data-v="history"]', 'home menu');
  await realClick('[data-a="go"][data-v="history"]');
  await waitSel('.hitem', 'history');
  const histRow = await page.eval(`document.querySelector('.hitem').innerText.replace(/\\s+/g,' ')`);
  console.log('history', histRow);
  if (!histRow.includes('MVP')) throw new Error('history row has no persisted MVP badge');
  await page.shot(path.join(OUT, 'mvp-history.png'));
  await realClick('#backBtn');
  await waitSel('[data-a="go"][data-v="stats"]', 'home again');
  await realClick('[data-a="go"][data-v="stats"]');
  await waitSel('.kpi', 'stats');
  const statsText = await page.eval(`document.body.innerText.replace(/\\s+/g,' ')`);
  if (!statsText.includes('MVP 1 次')) throw new Error('stats page is not MVP 1: ' + statsText.slice(0, 180));
  await page.shot(path.join(OUT, 'mvp-stats.png'));

  await page.eval('location.reload()');
  await sleep(800);
  for (let i = 0; i < 40; i++) { if (await page.eval(`!!document.querySelector('.rt, [data-a="go"]')`).catch(() => false)) break; await sleep(150); }
  if (!(await page.eval(`!!document.querySelector('[data-a="go"][data-v="stats"]')`))) {
    if (await page.eval(`!!document.querySelector('#backBtn:not(.hidden)')`).catch(() => false)) await realClick('#backBtn');
    await waitSel('[data-a="go"][data-v="stats"]', 'home after reconnect');
  }
  await realClick('[data-a="go"][data-v="stats"]');
  await waitSel('.kpi', 'stats after reconnect');
  const again = await page.eval(`document.body.innerText.replace(/\\s+/g,' ')`);
  if (!again.includes('MVP 1 次') || again.includes('MVP 2 次')) throw new Error('reconnect changed the MVP count: ' + again.slice(0, 180));
  await page.shot(path.join(OUT, 'mvp-stats-reconnect.png'));
  const statsAfter = await fetch(APP + 'api/stats', { headers: { authorization: 'Bearer ' + mvpPerson.token } }).then(r => r.json());
  if (statsAfter.mvp !== 1 || statsAfter.played !== 1) throw new Error('API stats changed on reconnect ' + JSON.stringify(statsAfter));

  await realClick('#backBtn');
  await waitSel('[data-a="go"][data-v="history"]', 'home for poster');
  await realClick('[data-a="go"][data-v="history"]');
  await waitSel('.hitem', 'history for poster');
  await realClick('.hitem');
  await waitSel('[data-a="poster"]', 'saved detail');
  await page.eval(`document.querySelector('[data-a="poster"]').scrollIntoView({ block: 'center' })`);
  const beforeFiles = new Set(fs.readdirSync(OUT));
  ff = startRec(path.join(OUT, 'share-poster-flow.mp4'));
  await sleep(1200);
  await realClick('[data-a="poster"]');
  await waitSel('.modal img', 'poster image');
  await sleep(2800);
  await page.eval(`document.querySelector('#dl').scrollIntoView({ block: 'center' })`);
  await sleep(800);
  await realClick('#dl');
  await sleep(1800);
  await stopRec(ff);
  let poster = null;
  for (let i = 0; i < 20 && !poster; i++) {
    poster = fs.readdirSync(OUT).find(f => !beforeFiles.has(f) && f.endsWith('.png') && f.startsWith('mongkok-avalon-'));
    if (!poster) await sleep(200);
  }
  if (!poster) throw new Error('the app did not export a poster file');
  const bytes = fs.readFileSync(path.join(OUT, poster));
  if (bytes.slice(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.length < 20000) throw new Error('exported poster is not a real png');
  console.log('poster', poster, bytes.length);
  console.log('EXAMPLES READY', JSON.stringify({ mvp: mvpPerson.name, room: code, poster }));
  stop();
  bots.forEach(b => { try { b.s.close(); } catch {} });
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
