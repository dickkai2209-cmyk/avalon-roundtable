// Entrance effects live on their own profile tab and replay once a minute.
// The seat stays still: only the fx layer plays.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 34880 + (process.pid % 500);
const CDP = 45880 + (process.pid % 500);
const ROOT = path.join(__dirname, '..');
const DATA = '/tmp/av-fx-' + process.pid;
const OUT = process.env.OUT || '/tmp/av-fx-shots-' + process.pid;
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const kids = [];
const track = (p) => { kids.push(p); return p; };
function killAll() { for (const p of kids) { if (!p || !p.pid) continue; try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { try { p.kill('SIGKILL'); } catch (e2) {} } } }
process.on('exit', killAll);

const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
assert(html.includes('style.css?v=86') && html.includes('app.js?v=85'), 'style cache is 86 and app cache stays 85');
assert(!html.includes('style.css?v=85'), 'previous style cache 85 is not reused');
assert(!html.includes('style.css?v=67') && !html.includes('app.js?v=75'), 'live cache versions are not reused');
assert(appSrc.includes("['none','無',0]") && appSrc.includes("['spot','聚光燈',0]") && appSrc.includes("['gold','金光',0]") && appSrc.includes("['snow','聖誕飄雪',0]") && appSrc.includes("['spark','星火',1]") && appSrc.includes("['petals','花瓣',3]") && appSrc.includes("['howl','狼人咆哮',4]") && appSrc.includes("['fire','火焰圈',6]") && appSrc.includes("['lightning','閃電',10]"), 'unlock ladder is unchanged');
assert(appSrc.includes("['signs','旺角燈牌',0]") && appSrc.includes("['ding','叮叮電車',2]") && appSrc.includes("['harbour','維港煙花',5]") && appSrc.includes("['ferry','渡海小輪',8]") && appSrc.includes("['hop','兔兔跳跳',0]") && appSrc.includes("['waddle','小鴨巡遊',3]") && appSrc.includes("['ham','倉鼠滾滾',7]"), 'new effects use the play-count ladder');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
assert(serverSrc.includes('signs: 0') && serverSrc.includes('ding: 2') && serverSrc.includes('harbour: 5') && serverSrc.includes('ferry: 8') && serverSrc.includes('hop: 0') && serverSrc.includes('waddle: 3') && serverSrc.includes('ham: 7'), 'server play-count ladder matches');
assert(appSrc.includes('const FX_EVERY = 60000') && !appSrc.includes('const FX_EVERY = 30000'), 'replay cadence is one minute');
const applyFn = appSrc.slice(appSrc.indexOf('function applyEntrance'), appSrc.indexOf('function playSeat'));
assert(applyFn.includes("el.classList.add('fx-' + fx)") && !/classList\.add\(\s*'enter'/.test(applyFn), 'playing an effect does not add the bounce class');
const previewFn = appSrc.slice(appSrc.indexOf('const replayEntrancePreview'), appSrc.indexOf('const markSel'));
assert(previewFn.includes("classList.remove('enter')") && !/classList\.add\(\s*'enter'/.test(previewFn), 'picker preview does not bounce the avatar');
assert(appSrc.includes('data-t="fx"') && appSrc.includes('>入場特效</button>'), 'third tab is 入場特效');
const bodyFn = appSrc.slice(appSrc.indexOf('const bodyHtml'), appSrc.indexOf('const draw'));
const fxBranch = bodyFn.slice(bodyFn.indexOf("tab === 'fx'"), bodyFn.indexOf("tab === 'pendant'"));
assert(fxBranch.includes('data-fx') && fxBranch.includes('pe-fx'), 'fx picker is built on the fx tab');
const avatarBranch = bodyFn.slice(bodyFn.indexOf('photoOn'));
assert(!avatarBranch.includes('data-fx') && !avatarBranch.includes('pe-fx') && !avatarBranch.includes('pe-fxlab'), 'avatar pane no longer embeds the fx list');
assert(!bodyFn.includes('pe-fxlab'), 'the old embedded heading is gone');
assert(cssSrc.includes('.fx-signs') && cssSrc.includes('.fx-ding') && cssSrc.includes('.fx-harbour') && cssSrc.includes('.fx-ferry') && cssSrc.includes('.fx-hop') && cssSrc.includes('.fx-waddle') && cssSrc.includes('.fx-ham'), 'seven new effect styles exist');
assert(cssSrc.includes('/img/fx/howl.webp') && cssSrc.includes('width:54px;height:50px') && cssSrc.includes('howlwolf') && !cssSrc.includes('M4 40c6-2') && !cssSrc.includes("fill='%236b5348'") && !/\.fx-howl\{[^}]*animation:howlwave/.test(cssSrc), '狼人咆哮 is a painted werewolf, not the sticker silhouette');
const fxCss = cssSrc.slice(cssSrc.indexOf('/* Entrance art sits above the avatar'));
assert(/prefers-reduced-motion[\s\S]{0,700}\.fx-signs/.test(fxCss) && fxCss.includes('.fx-hop') && fxCss.includes('.fx-harbour'), 'reduced motion stills the new effects');
assert(appSrc.includes('prefers-reduced-motion') && cssSrc.includes('.rt .st.enter') && /prefers-reduced-motion[\s\S]{0,400}\.rt \.st\.enter/.test(cssSrc), 'reduced motion suppresses the seat entrance');
assert(/\.pe-tabs\{[^}]*nowrap/.test(cssSrc), 'tab row is kept on one line');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.setTimeout(2500, () => { req.destroy(); reject(new Error('timeout')); });
  });
}
class Dev {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map();
    this.ws.addEventListener('message', ev => { const msg = JSON.parse(ev.data); if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); }
  ready() { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('cdp')), 5000); this.ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true }); }); }
  send(method, params = {}, timeout = 20000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, timeout);
      this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression, timeout = 20000) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails).slice(0, 900));
    return r.result && r.result.value;
  }
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(OUT, name + '.png');
    fs.writeFileSync(p, Buffer.from(data, 'base64'));
    return p;
  }
}
function bot(name, fx) {
  const s = io('http://127.0.0.1:' + PORT + '/', { transports: ['websocket'], forceNew: true });
  const c = { s, st: null, name, fx };
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
    const h = await c.emit('hello', { guestKey: ('fx' + name + process.pid + 'guest').slice(0, 80), name, avatar: 'cat', bg: '#ffffff', fx, pendant: 'none' });
    if (!h || h.error) rej(new Error((h && h.error) || 'hello')); else res(h);
  }));
  return c;
}
const FAKE = `window.__fxTimers = { q: [], now: 0, seq: 0,
  after(fn, ms) { const item = { fn, at: this.now + ms, id: ++this.seq }; this.q.push(item); return item.id; },
  clear(id) { this.q = this.q.filter(x => x.id !== id); },
  advance(ms) {
    const dest = this.now + ms;
    for (let g = 0; g < 80; g++) {
      const due = this.q.filter(x => x.at <= dest).sort((a,b) => a.at - b.at || a.id - b.id);
      if (!due.length) break;
      const item = due[0];
      this.q = this.q.filter(x => x !== item);
      this.now = item.at;
      item.fn();
    }
    this.now = dest;
    return this.now;
  } };
try { localStorage.setItem('cc.profile', JSON.stringify({ name:'雪人', avatar:'fox', bg:'#ffffff', fx:'snow', pendant:'none' })); } catch (e) {}`;

(async () => {
  const srv = track(spawn(process.execPath, ['server.js'], {
    cwd: ROOT, detached: true,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', GM_EMAIL: '', GM_USER_ID: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
  let log = '';
  srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  const t0 = Date.now();
  while (!/on :/.test(log)) { if (Date.now() - t0 > 8000) throw new Error('server ' + log.slice(-400)); await sleep(40); }
  const dir = '/tmp/chrome-fx-' + process.pid;
  fs.mkdirSync(dir, { recursive: true });
  track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
  let page;
  for (let i = 0; i < 40 && !page; i++) { try { page = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!page) throw new Error('no chrome');
  const cdp = new Dev(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE });
  const APP = 'http://127.0.0.1:' + PORT + '/';
  const setSize = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  const wait = async (expr, ms = 8000) => {
    const ok = await cdp.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { let v=0; try { v=(${expr}); } catch(e){} if (v) { clearInterval(t); r(1);} else if (Date.now()-t0>${ms}) { clearInterval(t); r(0);} }, 30); })`);
    if (!ok) throw new Error('wait ' + expr.slice(0, 180));
  };
  const seats = () => cdp.eval(`(() => [...document.querySelectorAll('.rt .st')].map(st => ({ id: st.dataset.id || '', name: (st.querySelector('.nm')||{}).textContent || '', empty: st.classList.contains('empty'), enter: st.classList.contains('enter'), fx: [...st.classList].filter(c => c.startsWith('fx-')).join(' '), game: !!document.querySelector('.track') })))()`);
  const clock = () => cdp.eval(`window.__fxTimers.now`);
  const advance = (ms) => cdp.eval(`window.__fxTimers.advance(${ms})`);
  const byName = (rows, name) => rows.find(s => s.name === name);

  await setSize(375, 812);
  await cdp.send('Page.navigate', { url: APP });
  await wait(`document.querySelector('[data-a="profile"]') && document.querySelector('#conn.on')`);
  await cdp.eval(`document.querySelector('[data-a="profile"]').click()`);
  await wait(`document.querySelector('.pe-tabs')`);
  const tabs = await cdp.eval(`(() => {
    const buttons = [...document.querySelectorAll('.pe-tabs button')];
    const row = document.querySelector('.pe-tabs').getBoundingClientRect();
    const sheet = document.querySelector('.sheet').getBoundingClientRect();
    const rects = buttons.map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, top: r.top, left: r.left, right: r.right, w: r.width, h: r.height, sw: b.scrollWidth, cw: b.clientWidth, sel: b.classList.contains('sel'), fxCount: document.querySelectorAll('.pe-body [data-fx]').length, lab: !!document.querySelector('.pe-fxlab') }; });
    return { rects, row: { left: row.left, right: row.right, top: row.top }, sheet: { left: sheet.left, right: sheet.right }, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, ih: innerWidth };
  })()`);
  assert(tabs.rects.map(r => r.t).join(',') === '頭像,掛件,入場特效', 'three tabs in order ' + JSON.stringify(tabs.rects.map(r => r.t)));
  const tops = tabs.rects.map(r => r.top);
  assert(Math.max(...tops) - Math.min(...tops) < 1, 'tabs stay on one row');
  assert(tabs.rects.every(r => r.sw <= r.cw + 1 && r.h < 48), 'tab labels do not wrap or clip ' + JSON.stringify(tabs.rects));
  assert(tabs.row.left >= tabs.sheet.left - 1 && tabs.row.right <= tabs.sheet.right + 1 && tabs.row.right <= tabs.ih + 1, 'tab row stays inside the sheet ' + JSON.stringify({ row: tabs.row, sheet: tabs.sheet, ih: tabs.ih }));
  assert(tabs.sw <= tabs.cw + 1, 'editor does not overflow horizontally');
  assert(tabs.rects[0].sel && tabs.rects[0].fxCount === 0 && !tabs.rects[0].lab, 'avatar tab has no fx list');
  await cdp.eval(`document.querySelector('.pe-tabs [data-t="pendant"]').click()`);
  const pend = await cdp.eval(`({ fx: document.querySelectorAll('.pe-body [data-fx]').length, pd: document.querySelectorAll('.pe-body [data-pd]').length, lab: !!document.querySelector('.pe-fxlab'), sel: document.querySelector('.pe-tabs [data-t="pendant"]').classList.contains('sel') })`);
  assert(pend.sel && pend.pd > 0 && pend.fx === 0 && !pend.lab, 'pendant tab has frames and no fx list ' + JSON.stringify(pend));
  await cdp.eval(`document.querySelector('.pe-tabs [data-t="fx"]').click()`);
  await wait(`document.querySelector('[data-fx="none"]')`);
  const fxTab = await cdp.eval(`(() => {
    const buttons = [...document.querySelectorAll('.pe-body [data-fx]')].map(b => ({ k: b.dataset.fx, t: b.textContent, off: b.classList.contains('off'), sel: b.classList.contains('sel') }));
    const wrap = document.querySelector('.pe-av .av-wrap');
    const tabs = [...document.querySelectorAll('.pe-tabs button')].map(b => ({ t: b.textContent, sel: b.classList.contains('sel') }));
    return { buttons, cls: wrap.className, tabs, grid: !!document.querySelector('.pe-body .pe-grid'), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  })()`);
  assert(fxTab.tabs.find(t => t.t === '入場特效').sel, 'fx tab is selected');
  assert(fxTab.buttons.map(b => b.k).join(',') === 'none,spot,gold,snow,spark,petals,howl,fire,lightning,signs,ding,harbour,ferry,hop,waddle,ham,silver', 'fx list keeps the old ladder and adds seven effects before 銀白追光');
  assert(fxTab.buttons.find(b => b.k === 'silver').off && fxTab.buttons.find(b => b.k === 'silver').t.includes('支持'), '銀白追光 stays a support unlock');
  assert(fxTab.buttons.filter(b => !b.off).map(b => b.k).join(',') === 'none,spot,gold,snow,signs,hop', 'free effects stay unlocked, including 旺角燈牌 and 兔兔跳跳');
  assert(fxTab.buttons.find(b => b.k === 'spark').off && fxTab.buttons.find(b => b.k === 'spark').t.includes('1場'), '星火 still needs 1 game');
  assert(fxTab.buttons.find(b => b.k === 'lightning').t.includes('10場'), '閃電 still needs 10 games');
  assert(fxTab.buttons.find(b => b.k === 'signs').t.includes('旺角燈牌') && fxTab.buttons.find(b => b.k === 'ding').t.includes('叮叮電車') && fxTab.buttons.find(b => b.k === 'ding').t.includes('2場'), 'Hong Kong names and the tram unlock');
  assert(fxTab.buttons.find(b => b.k === 'harbour').t.includes('維港煙花') && fxTab.buttons.find(b => b.k === 'harbour').t.includes('5場') && fxTab.buttons.find(b => b.k === 'ferry').t.includes('渡海小輪') && fxTab.buttons.find(b => b.k === 'ferry').t.includes('8場'), 'harbour and ferry stay on the play ladder');
  assert(fxTab.buttons.find(b => b.k === 'hop').t.includes('兔兔跳跳') && fxTab.buttons.find(b => b.k === 'waddle').t.includes('小鴨巡遊') && fxTab.buttons.find(b => b.k === 'waddle').t.includes('3場') && fxTab.buttons.find(b => b.k === 'ham').t.includes('倉鼠滾滾') && fxTab.buttons.find(b => b.k === 'ham').t.includes('7場'), 'animal names and mid-ladder unlocks');
  assert(/fx-snow/.test(fxTab.cls), 'opening the tab previews the selected effect');
  assert(!fxTab.grid && fxTab.sw <= fxTab.cw + 1, 'fx list does not widen the page');
  const artDir = '/opt/cursor/artifacts';
  fs.mkdirSync(artDir, { recursive: true });
  const saveShot = async (name) => {
    const p = await cdp.shot(name);
    fs.copyFileSync(p, path.join(artDir, name + '.png'));
    return p;
  };
  await saveShot('editor-fx-tab-375');
  await setSize(390, 844);
  await sleep(80);
  await saveShot('editor-fx-tab-390');
  await setSize(375, 812);
  await cdp.eval(`document.querySelector('[data-fx="harbour"]').click()`);
  await sleep(220);
  const harbourPrev = await cdp.eval(`(() => { const wrap = document.querySelector('.pe-av .av-wrap'); const cs = getComputedStyle(wrap); const b = getComputedStyle(wrap, '::before'); return { cls: wrap.className, anim: cs.animationName, transform: cs.transform, burst: b.animationName }; })()`);
  assert(/fx-harbour/.test(harbourPrev.cls) && !/\benter\b/.test(harbourPrev.cls) && harbourPrev.anim !== 'enter' && harbourPrev.transform === 'none' && harbourPrev.burst !== 'none', 'picker plays 維港煙花 without bouncing the avatar ' + JSON.stringify(harbourPrev));
  await saveShot('picker-hk-harbour-375');
  await cdp.eval(`document.querySelector('[data-fx="hop"]').click()`);
  await sleep(220);
  const hopPrev = await cdp.eval(`(() => { const wrap = document.querySelector('.pe-av .av-wrap'); const cs = getComputedStyle(wrap); const b = getComputedStyle(wrap, '::before'); return { cls: wrap.className, anim: cs.animationName, transform: cs.transform, hop: b.animationName }; })()`);
  assert(/fx-hop/.test(hopPrev.cls) && !/\benter\b/.test(hopPrev.cls) && hopPrev.anim !== 'enter' && hopPrev.transform === 'none' && hopPrev.hop !== 'none', 'picker plays 兔兔跳跳 without bouncing the avatar ' + JSON.stringify(hopPrev));
  await saveShot('picker-animal-hop-375');
  const shotHowl = async (name) => {
    await cdp.eval(`document.querySelector('[data-fx="howl"]').click()`);
    await sleep(420);
    const howlPrev = await cdp.eval(`(() => {
      const wrap = document.querySelector('.pe-av .av-wrap');
      const cs = getComputedStyle(wrap);
      const b = getComputedStyle(wrap, '::before');
      const av = wrap.querySelector('.av').getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      const wolfBottom = wr.top + (parseFloat(b.top) || 0) + (parseFloat(b.height) || 0);
      return { cls: wrap.className, anim: cs.animationName, transform: cs.transform, wolf: b.animationName, w: parseFloat(b.width), h: parseFloat(b.height), gap: av.top - wolfBottom, audio: !!document.querySelector('audio,video') };
    })()`);
    assert(/fx-howl/.test(howlPrev.cls) && !/\benter\b/.test(howlPrev.cls) && howlPrev.anim === 'none' && howlPrev.transform === 'none' && howlPrev.wolf === 'howlwolf' && howlPrev.w >= 50 && howlPrev.h >= 40 && howlPrev.gap > -2 && !howlPrev.audio, 'picker plays a large silent werewolf above the still avatar ' + JSON.stringify(howlPrev));
    await saveShot(name);
  };
  await shotHowl('picker-howl-375');
  await setSize(390, 844);
  await sleep(60);
  await shotHowl('picker-howl-390');
  await setSize(375, 812);
  await cdp.eval(`document.querySelector('#modal').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await cdp.eval(`(() => { const b = document.createElement('button'); b.dataset.a = 'ptab'; b.dataset.t = 'fx'; b.id = 'deeplink'; document.body.appendChild(b); b.click(); })()`);
  await wait(`document.querySelector('.pe-tabs [data-t="fx"].sel') && document.querySelector('[data-fx="howl"]')`);
  assert(true, 'deep link opens the fx tab the same way as pendant');
  await cdp.eval(`document.getElementById('deeplink').dataset.t = 'pendant'; document.getElementById('deeplink').click()`);
  await wait(`document.querySelector('.pe-tabs [data-t="pendant"].sel') && document.querySelector('.pe-body [data-pd]')`);
  const stillPendant = await cdp.eval(`document.querySelectorAll('.pe-body [data-fx]').length`);
  assert(stillPendant === 0, '頭像掛件 deep link still opens pendant without the fx list');
  await cdp.eval(`document.querySelector('#modal').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);

  const ladder = await cdp.eval(`(async () => {
    const hdr = { Authorization: 'Bearer ' + localStorage.getItem('cc.token'), 'Content-Type': 'application/json' };
    const put = async (fx) => {
      const r = await fetch('/api/me', { method: 'PUT', headers: hdr, body: JSON.stringify({ fx, name: '雪人' }) });
      const j = await r.json();
      return j.user && j.user.fx;
    };
    const ding = await put('ding');
    const signs = await put('signs');
    const hop = await put('hop');
    const back = await put('snow');
    return { ding, signs, hop, back };
  })()`);
  assert(ladder.ding === 'spot' && ladder.signs === 'signs' && ladder.hop === 'hop' && ladder.back === 'snow', 'server locks 叮叮電車 and keeps the free effects ' + JSON.stringify(ladder));

  await cdp.eval(`document.querySelector('[data-a="create"]').click()`);
  await wait(`document.querySelector('.rt .st.fx-snow')`);
  const born = await seats();
  const host0 = byName(born, '雪人');
  assert(host0 && !host0.enter && host0.fx === 'fx-snow', 'first sit plays the effect on a still seat ' + JSON.stringify(born));
  const still0 = await cdp.eval(`(() => { const st = document.querySelector('.rt .st.fx-snow'); const cs = getComputedStyle(st); return { anim: cs.animationName, transform: cs.transform }; })()`);
  assert(still0.anim === 'none' && still0.transform === 'none', 'the seat element does not scale or bounce ' + JSON.stringify(still0));
  await sleep(160);
  const before = await cdp.eval(`(() => { const anims = document.getAnimations(); const a = anims.find(x => x.animationName === 'xmasstar'); const enter = anims.find(x => x.animationName === 'enter'); return { t: a ? a.currentTime : -1, enter: enter ? 1 : 0 }; })()`);
  await sleep(240);
  const face = await cdp.eval(`(() => { const st = document.querySelector('.rt .st.fx-snow'); const av = st.querySelector('.av').getBoundingClientRect(); const nm = st.querySelector('.nm').getBoundingClientRect(); const img = st.querySelector('.av img').getBoundingClientRect(); return { avt: av.top, nmt: nm.top, nmw: nm.width, nmb: nm.bottom, imgw: img.width, ih: innerHeight, iw: innerWidth, sw: document.documentElement.scrollWidth }; })()`);
  assert(face.imgw > 28 && face.nmw > 10 && face.nmt >= face.avt + 20 && face.nmb < face.ih - 1 && face.sw <= face.iw + 1, 'effect leaves the face and name readable ' + JSON.stringify(face));
  await saveShot('seat-fx-lobby-375');
  const watcher = bot('旁觀', 'none');
  await watcher.ready;
  const earlyCode = await cdp.eval(`document.querySelector('.top-code').textContent.trim()`);
  await watcher.emit('join', { code: earlyCode });
  assert((await watcher.act('sit', { seat: 8 })).ok, 'a none player can sit during the effect');
  await wait(`[...document.querySelectorAll('.rt .nm')].some(n => n.textContent === '旁觀')`);
  const after = await cdp.eval(`(() => { const el = [...document.querySelectorAll('.rt .st')].find(s => (s.querySelector('.nm')||{}).textContent === '雪人'); const anims = document.getAnimations(); const a = anims.find(x => x.animationName === 'xmasstar'); const enter = anims.find(x => x.animationName === 'enter'); return { t: a ? a.currentTime : -1, enter: enter ? 1 : 0, name: el ? el.querySelector('.nm').textContent : '', cls: el ? el.className : '' }; })()`);
  assert(after.name === '雪人' && before.enter === 0 && after.enter === 0 && !/\benter\b/.test(after.cls) && before.t > 50 && (after.t < 0 || after.t > before.t), 'a re-render does not restart the effect or bounce the seat (' + before.t + ' -> ' + after.t + ' ' + after.cls + ')');

  const flashFx = async (cls, file) => {
    await cdp.eval(`(() => {
      const st = [...document.querySelectorAll('.rt .st')].find(s => (s.querySelector('.nm')||{}).textContent === '雪人');
      [...st.classList].filter(c => c.startsWith('fx-') || c === 'enter').forEach(c => st.classList.remove(c));
      void st.offsetWidth;
      st.classList.add('${cls}');
    })()`);
    await sleep(240);
    const pose = await cdp.eval(`(() => {
      const st = document.querySelector('.rt .st.${cls}');
      const cs = getComputedStyle(st);
      const before = getComputedStyle(st, '::before');
      const avEl = st.querySelector('.av').getBoundingClientRect();
      const av = st.querySelector('.av img').getBoundingClientRect();
      const nm = st.querySelector('.nm').getBoundingClientRect();
      const wolfBottom = st.getBoundingClientRect().top + (parseFloat(before.top) || 0) + (parseFloat(before.height) || 0);
      return { enter: st.classList.contains('enter'), anim: cs.animationName, transform: cs.transform, layer: before.animationName, img: av.width, nm: nm.width, nmt: nm.top, avb: av.bottom, gap: avEl.top - wolfBottom };
    })()`);
    assert(!pose.enter && pose.anim === 'none' && pose.transform === 'none' && pose.layer !== 'none' && pose.img > 24 && pose.nm > 8 && pose.nmt >= pose.avb - 8 && pose.gap > -2, cls + ' plays on a still seat ' + JSON.stringify(pose));
    await saveShot(file);
    await cdp.eval(`(() => {
      const st = document.querySelector('.rt .st.${cls}');
      st.classList.remove('${cls}');
      st.classList.add('fx-snow');
    })()`);
  };
  await flashFx('fx-ding', 'lobby-hk-ding-375');
  await flashFx('fx-hop', 'lobby-animal-hop-375');
  await flashFx('fx-howl', 'lobby-howl-375');
  await setSize(390, 844);
  await sleep(40);
  await flashFx('fx-howl', 'lobby-howl-390');
  await setSize(375, 812);

  let now = await advance(30000);
  let rows = await seats();
  assert(now === 30000 && byName(rows, '雪人') && !byName(rows, '雪人').fx && !byName(rows, '雪人').enter, '30s does not replay ' + JSON.stringify(rows));
  const at60 = await advance(30000);
  assert(at60 === 60000, 'fake clock reached 60s');
  await setSize(390, 844);
  await sleep(480);
  const face390 = await cdp.eval(`(() => { const st = document.querySelector('.rt .st.fx-snow'); const cs = getComputedStyle(st); const av = st.querySelector('.av').getBoundingClientRect(); const nm = st.querySelector('.nm').getBoundingClientRect(); return { enter: st.classList.contains('enter'), fx: st.classList.contains('fx-snow'), anim: cs.animationName, transform: cs.transform, w: innerWidth, avw: av.width, nmt: nm.top, avb: av.bottom, sw: document.documentElement.scrollWidth }; })()`);
  assert(!face390.enter && face390.fx && face390.anim === 'none' && face390.transform === 'none' && face390.w === 390 && face390.avw > 28 && face390.nmt >= face390.avb - 8 && face390.sw <= 391, '60s replay is on screen at 390 without bouncing the seat ' + JSON.stringify(face390));
  await saveShot('seat-fx-lobby-390');
  await setSize(375, 812);

  now = await advance(2800);
  rows = await seats();
  assert(now === 62800 && byName(rows, '雪人') && !byName(rows, '雪人').fx && !byName(rows, '雪人').enter, 'effect ends before the next interval ' + JSON.stringify(rows));
  const quiet = await cdp.eval(`[...document.querySelectorAll('.rt .st')].filter(s => s.classList.contains('enter') || [...s.classList].some(c => c.startsWith('fx-'))).length`);
  assert(quiet === 0, 'nothing keeps playing between intervals');

  const noneBot = bot('無效', 'none');
  const goldBot = bot('金光', 'gold');
  await noneBot.ready;
  const code = await cdp.eval(`document.querySelector('.top-code').textContent.trim()`);
  await noneBot.emit('join', { code });
  assert((await noneBot.act('sit', { seat: 2 })).ok, 'none player sits');
  await wait(`[...document.querySelectorAll('.rt .nm')].some(n => n.textContent === '無效')`);
  rows = await seats();
  const noneSeat = byName(rows, '無效');
  assert(noneSeat && !noneSeat.enter && !noneSeat.fx, 'none plays nothing on sit ' + JSON.stringify(noneSeat));
  await goldBot.ready;
  await goldBot.emit('join', { code });
  assert((await goldBot.act('sit', { seat: 3 })).ok, 'gold player sits');
  await wait(`document.querySelector('.rt .st.fx-gold')`);
  rows = await seats();
  assert(!byName(rows, '金光').enter && byName(rows, '金光').fx === 'fx-gold', 'a later sitter plays on their own clock');
  assert(!byName(rows, '雪人').fx && !byName(rows, '無效').fx && !byName(rows, '雪人').enter && !byName(rows, '無效').enter, 'other seats do not flash when someone sits');
  now = await advance(57200);
  rows = await seats();
  assert(now === 120000 && !byName(rows, '雪人').enter && byName(rows, '雪人').fx === 'fx-snow', 'host replays on the 60s mark ' + now);
  assert(!byName(rows, '金光').fx && !byName(rows, '無效').fx, 'gold and none stay quiet on the host tick ' + JSON.stringify(rows));

  now = await advance(2800);
  rows = await seats();
  assert(now === 122800 && !byName(rows, '雪人').fx && !byName(rows, '金光').enter && byName(rows, '金光').fx === 'fx-gold', 'gold replays on a later clock ' + JSON.stringify(rows));
  await advance(2800);
  rows = await seats();
  assert(!rows.some(s => s.enter || s.fx), 'seats are quiet before the game starts');

  const extra = [bot('丙', 'none'), bot('丁', 'none')];
  await Promise.all(extra.map(b => b.ready));
  await cdp.eval(`document.querySelector('[data-a="cfg"]').click()`);
  await wait(`document.querySelector('[data-a="cap"][data-n="5"]')`);
  await cdp.eval(`document.querySelector('[data-a="cap"][data-n="5"]').click()`);
  await wait(`document.querySelectorAll('.rt .st').length === 5`);
  await cdp.eval(`(() => { const b = document.querySelector('[data-a="cfgclose"]'); if (b) b.click(); })()`);
  assert(true, 'host shrinks to 5');
  for (const [i, b] of extra.entries()) {
    await b.emit('join', { code });
    assert((await b.act('sit', { seat: 4 + i })).ok, b.name + ' sits');
  }
  await wait(`[...document.querySelectorAll('.rt .st')].filter(s => !s.classList.contains('empty')).length === 5`);
  await cdp.eval(`document.querySelector('[data-a="start"]').click()`);
  assert(true, 'host starts the game');
  await wait(`document.querySelector('.track')`);
  await cdp.eval(`document.querySelector('#modal').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  rows = await seats();
  assert(rows.every(s => s.game) && !rows.some(s => s.enter || s.fx), 'starting the game does not retrigger ' + JSON.stringify(rows));
  now = await advance(54400);
  rows = await seats();
  assert(now === 180000 && byName(rows, '雪人').game && !byName(rows, '雪人').enter && byName(rows, '雪人').fx === 'fx-snow', 'in-game seat replays on its 60s clock');
  assert(!byName(rows, '金光').fx && !byName(rows, '無效').fx && !byName(rows, '金光').enter, 'in-game neighbours stay on their own clocks');
  await cdp.eval(`(() => { const b = document.querySelector('#sheet #ok'); if (b) b.click(); })()`);
  await wait(`document.querySelector('#modal').classList.contains('hidden')`);
  await sleep(380);
  const gameShot = await cdp.shot('seat-fx-game-375');
  fs.copyFileSync(gameShot, path.join(artDir, 'seat-fx-game-375.png'));
  const covered = await cdp.eval(`(() => { const st = document.querySelector('.rt .st.fx-snow'); const av = st.querySelector('.av img').getBoundingClientRect(); const nm = st.querySelector('.nm').getBoundingClientRect(); return { img: av.width, nm: nm.width, gap: nm.top - av.bottom, bottom: nm.bottom, ih: innerHeight }; })()`);
  assert(covered.img > 24 && covered.nm > 8 && covered.bottom < covered.ih, 'in-game effect does not cover the name ' + JSON.stringify(covered));

  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.send('Page.navigate', { url: APP });
  await wait(`document.querySelector('.rt .st .av') || document.querySelector('[data-a="profile"]')`, 12000);
  await wait(`document.querySelector('.rt .st .nm')`, 12000);
  await sleep(200);
  const reduced = await seats();
  assert(reduced.some(s => s.name === '雪人') && reduced.every(s => !s.enter && !s.fx), 'reduced motion does not play on appear ' + JSON.stringify(reduced));
  await advance(180000);
  const reducedLater = await seats();
  assert(reducedLater.every(s => !s.enter && !s.fx), 'reduced motion does not loop ' + JSON.stringify(reducedLater));
  const anim = await cdp.eval(`(() => { const st = document.querySelector('.rt .st'); if (!st) return { missing: 1 }; st.classList.add('enter', 'fx-snow'); const a = getComputedStyle(st).animationName; const b = getComputedStyle(st, '::before').animationName; st.classList.remove('fx-snow'); st.classList.add('fx-harbour'); const h = getComputedStyle(st, '::before').animationName; return { a, b, h }; })()`);
  assert(anim.a === 'none' && anim.b === 'none' && anim.h === 'none', 'reduced motion CSS does not run the entrance ' + JSON.stringify(anim));

  console.log('ENTRANCE FX TESTS PASSED');
  killAll();
  process.exit(0);
})().catch(e => { console.error(e); killAll(); process.exit(1); });
