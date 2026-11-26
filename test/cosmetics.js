// New pendant frames and animal icons: registration, unlocks, picker, and the face hole.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3227;
const APP = 'http://127.0.0.1:' + PORT + '/';
const CDP = 9368;
const OUT = process.env.OUT || '/tmp/cosmetics-shots';
const DATA = '/tmp/av-cosmetics-' + Date.now();
fs.mkdirSync(OUT, { recursive: true });
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const FRAMES = [
  ['foxqiu', '狐祈千秋', 'games', 9],
  ['foxheart', '狐祈同心', 'games', 15],
  ['starmoon', '星樓望月', 'games', 11],
  ['starplain', '星垂平野', 'wins', 4],
  ['whiteling', '瑞獸白靈', 'wins', 7],
  ['darkling', '瑞獸玄靈', 'wins', 8],
  ['skydragon', '龍吟九霄', 'games', 18],
  ['foxdance', '狐舞月華', 'wins', 9],
  ['frostmirror', '朔雪之映', 'free', 0],
  ['icesword', '逆光之劍', 'free', 0],
  ['fairylake', '妖精之湖', 'wins', 12],
  ['odineye', '奧丁之眼', 'wins', 14],
];
const ANIMALS = [
  ['puffer', '河豚'], ['alien', '外星人'], ['wolfking', '狼王'], ['frog', '青蛙'],
  ['dragonet', '小龍'], ['tiger', '老虎'], ['hero', '超人'],
];
const ICE = ['frostmirror', 'icesword'];

function webpInfo(buf) {
  assert(buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP', 'webp container');
  assert(buf.toString('ascii', 12, 16) === 'VP8X', 'webp extended header');
  const flags = buf[20];
  return {
    alpha: !!(flags & 0x10),
    w: 1 + buf.readUIntLE(24, 3),
    h: 1 + buf.readUIntLE(27, 3),
  };
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}
async function put(token, body) {
  const r = await fetch(APP + 'api/me', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.user;
}

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

assert(html.includes('style.css?v=56') && html.includes('app.js?v=64'), 'cache bust moves past the versions on main');
assert(!html.includes('style.css?v=55') && !html.includes('app.js?v=63'), 'live cache versions are not reused');
assert(appSrc.includes('const PD_V = 5'), 'pendant image cache key bumped');
assert(cssSrc.includes('iceSweep') && cssSrc.includes('prefers-reduced-motion') && cssSrc.includes('pd-ice'), 'ice motion honors reduced motion');
assert(appSrc.includes('mvpTotal() >= 10') && serverSrc.includes("f.pendant === 'laurel' && st.mvp < 10"), 'laurel still needs 10 earned MVP');
assert(serverSrc.includes('if (db.isGM(user)) return null'), 'GM bypass stays after the laurel check');

for (const [k, n, type, need] of FRAMES) {
  assert(appSrc.includes(`['${k}', '${n}', '${type}', ${need}`), 'client registers ' + n);
  assert(serverSrc.includes(`${k}: ['${type}', ${need}]`), 'server rule for ' + n);
  for (const suffix of ['', '_b']) {
    const file = path.join(root, 'public/img/pd', k + suffix + '.webp');
    const info = webpInfo(fs.readFileSync(file));
    assert(info.alpha && info.w === 320 && info.h === 320, k + suffix + ' is a 320 alpha frame');
  }
}
assert(FRAMES.filter(x => x[2] === 'free').map(x => x[0]).join() === ICE.join(), 'only the two ice frames are free');
assert(FRAMES.filter(x => x[2] !== 'free').every(x => x[2] === 'games' || x[2] === 'wins'), 'the other ten use the play/win ladder');
for (const [k, n] of ANIMALS) {
  assert(appSrc.includes(`['${k}','${n}']`), 'picker lists ' + n);
  assert(serverSrc.includes("'" + k + "'"), 'server accepts ' + k);
  const info = webpInfo(fs.readFileSync(path.join(root, 'public/img/av', k + '.webp')));
  assert(info.alpha && info.w === 192 && info.h === 192, n + ' is a 192 alpha icon');
}
assert(!appSrc.includes('炭治郎') && !appSrc.includes('善逸') && !appSrc.includes('ちいかわ'), 'no official character names');

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

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  process.env.DATA_DIR = DATA;
  process.env.DATABASE_URL = '';
  delete require.cache[require.resolve('../db')];
  const db = require('../db');
  await db.init();
  const stamp = Date.now().toString(36);
  const fresh = await db.createGuest({ guestKey: 'simcosfresh' + stamp, name: '冰鏡' });
  const played = await db.createGuest({ guestKey: 'simcosplay' + stamp, name: '小虎' });
  const won = await db.createGuest({ guestKey: 'simcoswon' + stamp, name: '四勝' });
  const mvp = await db.createGuest({ guestKey: 'simcosmvp' + stamp, name: '十冠' });
  const gm = await db.createGuest({ guestKey: 'simcosgm' + stamp, name: '主持' });
  const tokens = {};
  for (const u of [fresh, played, won, mvp, gm]) tokens[u.id] = await db.createSession(u.id);
  db.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
  saved.stats = saved.stats || {};
  saved.stats[fresh.id] = { played: 0, won: 0, mvp: 0, roles: {} };
  saved.stats[played.id] = { played: 9, won: 0, mvp: 0, roles: {} };
  saved.stats[won.id] = { played: 9, won: 4, mvp: 0, roles: {} };
  saved.stats[mvp.id] = { played: 12, won: 10, mvp: 10, roles: {} };
  saved.stats[gm.id] = { played: 30, won: 20, mvp: 0, roles: {} };
  fs.writeFileSync(path.join(DATA, 'db.json'), JSON.stringify(saved));

  const srv = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', GM_USER_ID: gm.id, GM_EMAIL: 'nobody-gm@example.invalid' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server')), 8000); srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } }); });

  const chromeDir = '/tmp/chrome-cosmetics-' + Date.now();
  const chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=' + chromeDir, 'about:blank'], { stdio: 'ignore' });
  try {
    const ice = await put(tokens[fresh.id], { pendant: 'frostmirror' });
    assert(ice.pendant === 'frostmirror', 'a new player can wear the free ice frame');
    const sword = await put(tokens[fresh.id], { pendant: 'icesword' });
    assert(sword.pendant === 'icesword', '逆光之劍 is free too');
    const locked = await put(tokens[fresh.id], { pendant: 'foxqiu' });
    assert(locked.pendant === 'none', '狐祈千秋 stays locked at 0 games');
    const lockedWin = await put(tokens[fresh.id], { pendant: 'starplain' });
    assert(lockedWin.pendant === 'none', '星垂平野 stays locked at 0 wins');
    const noLaurel = await put(tokens[fresh.id], { pendant: 'laurel' });
    assert(noLaurel.pendant === 'none', 'laurel still refuses 0 MVP');
    for (const [k] of ANIMALS) {
      const u = await put(tokens[fresh.id], { avatar: k });
      assert(u.avatar === k, 'server keeps the ' + k + ' icon');
    }
    const bad = await put(tokens[fresh.id], { avatar: 'tanjiro' });
    assert(bad.avatar === 'fox', 'unknown icons fall back to fox');

    const playedFox = await put(tokens[played.id], { pendant: 'foxqiu', avatar: 'tiger' });
    assert(playedFox.pendant === 'foxqiu' && playedFox.avatar === 'tiger', '9 games unlocks 狐祈千秋');
    const playedPlain = await put(tokens[played.id], { pendant: 'starplain' });
    assert(playedPlain.pendant === 'none', '9 games and 0 wins still lock a win frame');
    const playedDragon = await put(tokens[played.id], { pendant: 'skydragon' });
    assert(playedDragon.pendant === 'none', '龍吟九霄 still needs 18 games');

    const wonPlain = await put(tokens[won.id], { pendant: 'starplain' });
    assert(wonPlain.pendant === 'starplain', '4 wins unlocks 星垂平野');
    const wonWhite = await put(tokens[won.id], { pendant: 'whiteling' });
    assert(wonWhite.pendant === 'none', '4 wins do not unlock a 7-win frame');
    const wonLaurel = await put(tokens[won.id], { pendant: 'laurel' });
    assert(wonLaurel.pendant === 'none', 'wins do not unlock the MVP laurel');
    const wonEye = await put(tokens[won.id], { pendant: 'odineye' });
    assert(wonEye.pendant === 'none', '奧丁之眼 stays locked below 14 wins');

    const earned = await put(tokens[mvp.id], { pendant: 'laurel' });
    assert(earned.pendant === 'laurel', '10 real MVPs still unlock laurel');
    const gmLaurel = await put(tokens[gm.id], { pendant: 'laurel', skins: { _shiny: true } });
    assert(gmLaurel.gm === true && gmLaurel.pendant === 'none' && gmLaurel.skins._shiny === false, 'GM with 0 MVP cannot wear laurel or shiny');
    const gmIce = await put(tokens[gm.id], { pendant: 'frostmirror' });
    assert(gmIce.pendant === 'frostmirror', 'GM can wear a free ice frame');
    const gmFrame = await put(tokens[gm.id], { pendant: 'foxqiu' });
    assert(gmFrame.pendant === 'foxqiu', 'GM bypass still covers non-MVP frames');

    const photo = fs.readFileSync(path.join(root, 'public/img/av/fox.webp')).toString('base64');
    const faced = await put(tokens[fresh.id], { photo: 'data:image/webp;base64,' + photo, pendant: 'frostmirror' });
    assert(faced.avatar === 'photo' && faced.pendant === 'frostmirror', 'a photo can sit inside the free ice frame');
    await put(tokens[played.id], { pendant: 'foxqiu', avatar: 'tiger' });

    let page;
    for (let i = 0; i < 40 && !page; i++) { try { page = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(150); } }
    if (!page) throw new Error('no chrome');
    const cdp = new Page(page.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    const size = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    const boot = async (token, profile) => {
      await cdp.send('Page.navigate', { url: APP });
      await cdp.eval('new Promise(r => { const t = setInterval(() => { if (document.body) { clearInterval(t); r(1); } }, 20); setTimeout(() => r(0), 4000); })');
      await cdp.eval(`localStorage.setItem('cc.token', ${JSON.stringify(token)}); localStorage.setItem('cc.profile', ${JSON.stringify(JSON.stringify(profile))});`);
      await cdp.send('Page.navigate', { url: APP });
      const ready = await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-a="profile"]') && document.querySelector('[data-a="create"]')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
      assert(ready, 'home screen is ready');
    };
    const openProfile = async (tab) => {
      await cdp.eval(`document.querySelector('[data-a="profile"]').click()`);
      const ok = await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.pe-grid')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
      assert(ok, 'profile editor opened');
      if (tab) {
        await cdp.eval(`document.querySelector('[data-t="${tab}"]').click()`);
        await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-${tab === 'pendant' ? 'pd' : 'e'}]')) { clearInterval(t); r(1); } }, 30); setTimeout(() => r(0), 4000); })`);
      }
    };

    await size(375, 812);
    await boot(tokens[fresh.id], { name: '冰鏡', avatar: 'photo', bg: '#ffffff', fx: 'none', pendant: 'frostmirror' });
    const holes = await cdp.eval(`(async () => {
      const keys = ${JSON.stringify(FRAMES.map(x => x[0]))};
      const out = {};
      for (const k of keys) {
        for (const back of [false, true]) {
          const img = new Image();
          img.src = '/img/pd/' + k + (back ? '_b' : '') + '.webp?v=5';
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const x = c.getContext('2d');
          x.drawImage(img, 0, 0);
          const data = x.getImageData(0, 0, c.width, c.height).data;
          const rad = c.width * 0.29;
          const cx = c.width / 2, cy = c.height / 2;
          let n = 0;
          for (let y = 0; y < c.height; y++) for (let px = 0; px < c.width; px++) {
            const dx = px - cx, dy = y - cy;
            if (dx * dx + dy * dy > rad * rad) continue;
            if (data[(y * c.width + px) * 4 + 3] > 12) n++;
          }
          out[k + (back ? '_b' : '')] = n;
        }
      }
      return out;
    })()`);
    for (const [k, n] of Object.entries(holes)) assert(n === 0, k + ' center stays transparent (' + n + ')');

    await openProfile('avatar');
    const animals = await cdp.eval(`(() => {
      const buttons = [...document.querySelectorAll('[data-e]')].map(b => ({ k: b.dataset.e, n: b.querySelector('.lb').textContent, src: (b.querySelector('img') || {}).src || '' }));
      return { buttons, text: document.body.innerText };
    })()`);
    for (const [k, n] of ANIMALS) {
      const hit = animals.buttons.find(b => b.k === k);
      assert(hit && hit.n === n && hit.src.includes('/img/av/' + k + '.webp'), 'picker shows ' + n);
    }
    const animalBtn = await cdp.eval(`document.querySelector('[data-e="puffer"]').scrollIntoView({ block: 'center' }); 1`);
    assert(animalBtn, 'scrolled to the new animals');
    await sleep(80);
    await cdp.shot('picker-animals-375');
    await size(390, 844);
    await sleep(80);
    await cdp.shot('picker-animals-390');

    await size(375, 812);
    await cdp.eval(`document.querySelector('[data-t="pendant"]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-pd="frostmirror"]')) { clearInterval(t); r(1); } }, 30); setTimeout(() => r(0), 4000); })`);
    const pendants = await cdp.eval(`(() => [...document.querySelectorAll('[data-pd]')].map(b => ({ k: b.dataset.pd, n: (b.querySelector('b') || {}).textContent || '', off: b.classList.contains('off'), ice: !!(b.querySelector('.pdv.pd-ice')), back: !!b.querySelector('.pov.back') })))()`);
    for (const [k, n] of FRAMES) {
      const hit = pendants.find(b => b.k === k);
      assert(hit && hit.n === n && hit.back, 'picker shows frame ' + n);
      assert(ICE.includes(k) ? !hit.off && hit.ice : hit.off, (ICE.includes(k) ? 'free ' : 'locked ') + n);
    }
    await cdp.eval(`document.querySelector('[data-pd="frostmirror"]').scrollIntoView({ block: 'center' });`);
    await sleep(80);
    await cdp.shot('picker-frames-375');
    await size(390, 844);
    await sleep(120);
    await cdp.shot('picker-frames-390');
    const iceMotion = await cdp.eval(`(() => {
      const el = document.querySelector('[data-pd="frostmirror"] .pdv');
      const sweep = getComputedStyle(el, '::after');
      const glow = getComputedStyle(el.querySelector('.pov.ice'));
      return { sweep: sweep.animationName, glow: glow.animationName, dur: sweep.animationDuration };
    })()`);
    assert(iceMotion.sweep === 'iceSweep' && iceMotion.glow === 'iceGlow', 'ice picker preview is moving (' + JSON.stringify(iceMotion) + ')');

    await cdp.eval(`const m = document.querySelector('.modal'); if (m) { m.classList.add('hidden'); const sheet = document.querySelector('#sheet'); if (sheet) sheet.innerHTML = ''; }`);
    await size(375, 812);
    const connected = await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('#conn.on')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    assert(connected, 'socket is connected before creating a room');
    await cdp.eval(`document.querySelector('[data-a="create"]').click()`);
    const seated = await cdp.eval(`new Promise(r => { const t = setInterval(() => { const img = document.querySelector('.rt .st .av img'); if (img && img.src.includes('/api/avatar') && document.querySelector('.rt .st .pov.back')) { clearInterval(t); r({ ok: 1, src: img.src }); } }, 40); setTimeout(() => { const img = document.querySelector('.rt .st .av img'); r({ ok: 0, src: img ? img.src : '', text: (document.querySelector('#app') || document.body).innerText.slice(0, 400) }); }, 12000); })`, 20000);
    assert(seated && seated.ok, 'photo face is seated inside the ice frame ' + JSON.stringify(seated));
    const seat = await cdp.eval(`(() => {
      const st = document.querySelector('.rt .st');
      const face = st.querySelector('.av').getBoundingClientRect();
      const pov = st.querySelector('.pov:not(.back)').getBoundingClientRect();
      const back = st.querySelector('.pov.back').getBoundingClientRect();
      const wrap = st.querySelector('.av-wrap');
      const sweep = getComputedStyle(wrap, '::after');
      return {
        ice: wrap.classList.contains('pd-ice'),
        src: st.querySelector('.av img').src,
        sweep: sweep.animationName,
        fcx: face.left + face.width / 2, fcy: face.top + face.height / 2,
        pcx: pov.left + pov.width / 2, pcy: pov.top + pov.height / 2,
        bcx: back.left + back.width / 2, bcy: back.top + back.height / 2,
        fw: face.width, pw: pov.width, bw: back.width,
        text: st.innerText,
      };
    })()`);
    assert(seat.ice && seat.src.includes('/api/avatar') && seat.sweep === 'iceSweep', 'worn ice frame loops around the photo');
    assert(Math.abs(seat.fcx - seat.pcx) < 2 && Math.abs(seat.fcy - seat.pcy) < 2, 'front ring is centered on the face');
    assert(Math.abs(seat.fcx - seat.bcx) < 2 && Math.abs(seat.fcy - seat.bcy) < 2, 'back ring is centered on the face');
    assert(seat.pw > seat.fw * 1.4 && seat.bw > seat.fw * 1.4, 'the donut is larger than the face');
    assert(seat.text.includes('冰鏡'), 'seat keeps the player name');
    await cdp.eval(`Promise.all([...document.images].filter(i => i.src.includes('/img/pd/') || i.src.includes('/api/avatar')).map(i => i.decode().catch(() => 0)))`);
    await sleep(100);
    await cdp.shot('seat-ice-photo-375');
    await cdp.shot('seat-ice-motion-a');
    await sleep(1300);
    await cdp.shot('seat-ice-motion-b');
    await size(390, 844);
    await sleep(100);
    await cdp.shot('seat-ice-photo-390');

    await size(375, 812);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await sleep(50);
    const reduced = await cdp.eval(`(() => {
      const wrap = document.querySelector('.rt .st .av-wrap');
      const sweep = getComputedStyle(wrap, '::after');
      const glow = getComputedStyle(wrap.querySelector('.pov.ice'));
      return { sweep: sweep.animationName, glow: glow.animationName, opacity: sweep.opacity };
    })()`);
    assert(reduced.sweep === 'none' && reduced.glow === 'none' && Number(reduced.opacity) === 0, 'reduced motion stops the ice sweep (' + JSON.stringify(reduced) + ')');
    await cdp.shot('seat-ice-reduced-375');
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });

    await size(375, 812);
    await boot(tokens[played.id], { name: '小虎', avatar: 'tiger', bg: '#ffe08a', fx: 'none', pendant: 'foxqiu' });
    await openProfile('pendant');
    const unlocked = await cdp.eval(`(() => {
      const q = (k) => document.querySelector('[data-pd="' + k + '"]');
      return { foxqiu: q('foxqiu').classList.contains('off'), plain: q('starplain').classList.contains('off'), ice: q('icesword').classList.contains('off') };
    })()`);
    assert(!unlocked.foxqiu && unlocked.plain && !unlocked.ice, 'picker locks and unlocks follow the same ladder');
    await cdp.eval(`document.querySelector('.modal').classList.add('hidden');`);
    await cdp.eval(`document.querySelector('[data-a="create"]').click()`);
    const tigerSeat = await cdp.eval(`new Promise(r => { const t = setInterval(() => { const img = document.querySelector('.rt .st .av img'); if (img && img.src.includes('/img/av/tiger.webp') && document.querySelector('.rt .st .pov.back')) { clearInterval(t); r(img.src); } }, 40); setTimeout(() => r(''), 20000); })`);
    assert(String(tigerSeat).includes('/img/av/tiger.webp'), 'seated player wears the tiger icon');
    const other = await cdp.eval(`(() => {
      const st = document.querySelector('.rt .st');
      return { pd: (st.querySelector('.pov:not(.back)') || {}).src || '', back: !!(st.querySelector('.pov.back')), text: st.innerText, ice: st.querySelector('.av-wrap').classList.contains('pd-ice') };
    })()`);
    assert(other.pd.includes('/img/pd/foxqiu.webp') && other.back && !other.ice && other.text.includes('小虎'), '狐祈千秋 frames the tiger without the ice motion');
    await cdp.eval(`Promise.all([...document.images].map(i => i.decode().catch(() => 0)))`);
    await sleep(80);
    await cdp.shot('seat-foxqiu-tiger-375');
    await size(390, 844);
    await sleep(80);
    await cdp.shot('seat-foxqiu-tiger-390');

    const art = '/opt/cursor/artifacts';
    fs.mkdirSync(art, { recursive: true });
    for (const name of fs.readdirSync(OUT)) fs.copyFileSync(path.join(OUT, name), path.join(art, name));
    console.log('COSMETICS TESTS PASSED');
  } finally {
    srv.kill('SIGTERM');
    chrome.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exit(1); });
