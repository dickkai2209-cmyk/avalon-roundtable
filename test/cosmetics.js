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
const ROLES = [
  ['merlin', '梅林'], ['percival', '派西維爾'], ['servant', '忠臣'], ['assassin', '刺客'],
  ['mordred', '莫德雷特'], ['oberon', '奧柏倫'], ['morgana', '莫甘娜'],
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

assert(html.includes('style.css?v=75') && html.includes('app.js?v=82'), 'cache bust moves past the versions on main');
assert(!html.includes('style.css?v=67') && !html.includes('app.js?v=75') && !html.includes('style.css?v=66') && !html.includes('app.js?v=74') && !html.includes('style.css?v=65') && !html.includes('app.js?v=73') && !html.includes('style.css?v=64') && !html.includes('app.js?v=72') && !html.includes('style.css?v=63') && !html.includes('app.js?v=71') && !html.includes('style.css?v=62') && !html.includes('app.js?v=70') && !html.includes('style.css?v=61') && !html.includes('app.js?v=69'), 'live cache versions are not reused');
assert(appSrc.includes('const PD_V = 8'), 'pendant image cache key bumped');
assert(cssSrc.includes('iceSweep') && cssSrc.includes('pdSheen') && cssSrc.includes('pdPalSway') && cssSrc.includes('prefers-reduced-motion') && cssSrc.includes('pd-ice') && cssSrc.includes('.pd-pal'), 'frame motion and charms honor reduced motion');
assert(cssSrc.includes('transparent 0 42%, #000 44%, #000 49%, transparent 52%'), 'sheen mask sits on the slimmer ring');
assert(cssSrc.includes('.pdv.pd-round>.pdcirc{border:0}'), 'round frames have no pale border between the photo and the ring');
const palCss = cssSrc.slice(cssSrc.indexOf('.pd-pal{'), cssSrc.indexOf('.pd-pal svg'));
assert(!palCss.includes('width:28%') && palCss.includes('width:52%') && palCss.includes('drop-shadow'), 'charms are a large moderate size with a separating halo');
const palBlock = appSrc.slice(appSrc.indexOf('const PD_PAL'), appSrc.indexOf('function pdFxCls'));
const PALS = {
  foxqiu: 'fox', foxheart: 'heart', starmoon: 'moon', starplain: 'stars',
  whiteling: 'white', darkling: 'dark', skydragon: 'dragon', foxdance: 'dance',
  frostmirror: 'snow', icesword: 'sword', fairylake: 'fairy', odineye: 'eye',
};
assert(Object.keys(PALS).length === FRAMES.length && new Set(Object.values(PALS)).size === FRAMES.length, 'every round frame has its own charm');
for (const [k, v] of Object.entries(PALS)) assert(palBlock.includes(`${k}: '${v}'`), 'charm for ' + k);
const svgBlock = appSrc.slice(appSrc.indexOf('const PD_PAL_SVG'), appSrc.indexOf('function pdPalHtml'));
const drawings = [...svgBlock.matchAll(/`([^`]*)`/g)].map(m => m[1]);
assert(drawings.length === 12 && new Set(drawings).size === 12, 'twelve unique charm drawings');
for (const v of Object.values(PALS)) assert(svgBlock.includes('\n  ' + v + ':'), 'svg for ' + v);
for (const drawing of drawings) assert(/stroke-width="(?:[3-9]|[1-9]\d)/.test(drawing), 'charm silhouette is bold');
assert(!svgBlock.includes('class="fur"'), 'fox frames no longer share one fox drawing');
assert(appSrc.includes('mvpTotal() >= 10') && serverSrc.includes("f.pendant === 'laurel' && st.mvp < 10"), 'laurel still needs 10 earned MVP');
assert(serverSrc.includes('if (db.isGM(user)) return null'), 'GM bypass stays after the laurel check');
assert(serverSrc.includes('function sanitizeProfile') && serverSrc.includes('hasSupportFrame'), 'server unlock honors a persisted support frame');
assert(appSrc.slice(appSrc.indexOf('const supportFrameIds'), appSrc.indexOf('const pdNeed')).includes('account.supportFrames') && appSrc.includes('supportFrameIds().includes(k)'), 'client unlock honors a persisted support frame');

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
const serverAnimals = serverSrc.slice(serverSrc.indexOf('const ANIMALS = ['), serverSrc.indexOf('];', serverSrc.indexOf('const ANIMALS = [')));
for (const [k, n] of ANIMALS.concat(ROLES)) {
  assert(appSrc.includes(`['${k}','${n}']`), 'picker lists ' + n);
  assert(serverAnimals.includes("'" + k + "'"), 'server accepts ' + k);
  const info = webpInfo(fs.readFileSync(path.join(root, 'public/img/av', k + '.webp')));
  assert(info.alpha && info.w === 192 && info.h === 192, n + ' is a 192 alpha icon');
}
assert(appSrc.includes('.concat(ROLE_AV)'), 'role faces stay on the same avatar allow-list as the animals');
assert(!appSrc.includes("'merlin':'") && !/🧙|👑|🗡️/.test(appSrc.slice(appSrc.indexOf('const EMOJI_MAP'), appSrc.indexOf('const BGS'))), 'role faces do not invent emoji shortcuts');
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
  const rich = await db.createGuest({ guestKey: 'simcosrich' + stamp, name: '龍友' });
  const tokens = {};
  for (const u of [fresh, played, won, mvp, gm, rich]) tokens[u.id] = await db.createSession(u.id);
  db.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
  saved.stats = saved.stats || {};
  saved.stats[fresh.id] = { played: 0, won: 0, mvp: 0, roles: {} };
  saved.stats[played.id] = { played: 9, won: 0, mvp: 0, roles: {} };
  saved.stats[won.id] = { played: 9, won: 4, mvp: 0, roles: {} };
  saved.stats[mvp.id] = { played: 12, won: 10, mvp: 10, roles: {} };
  saved.stats[gm.id] = { played: 30, won: 20, mvp: 0, roles: {} };
  saved.stats[rich.id] = { played: 40, won: 20, mvp: 0, roles: {} };
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
    for (const [k] of ANIMALS.concat(ROLES)) {
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
          img.src = '/img/pd/' + k + (back ? '_b' : '') + '.webp?v=8';
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
    const roleGroup = await cdp.eval(`(() => {
      const heads = [...document.querySelectorAll('.pe-h')].map(el => el.textContent.trim());
      const roleGrid = document.querySelector('.pe-roles');
      const roles = roleGrid ? [...roleGrid.querySelectorAll('[data-e]')].map(b => ({ k: b.dataset.e, n: (b.querySelector('.lb') || {}).textContent || '', src: (b.querySelector('img') || {}).src || '', off: b.classList.contains('off') })) : [];
      const animal = [...document.querySelectorAll('.pe-grid')].find(g => !g.classList.contains('pe-roles'));
      const beasts = animal ? [...animal.querySelectorAll('[data-e]')].map(b => b.dataset.e) : [];
      const roleAfter = !!(animal && roleGrid && (animal.compareDocumentPosition(roleGrid) & Node.DOCUMENT_POSITION_FOLLOWING));
      return { heads, roles, beasts, upload: !!(animal && animal.querySelector('[data-upload]')), roleAfter };
    })()`);
    assert(roleGroup.heads.join() === '動物,角色' && roleGroup.roleAfter, '角色 group sits at the bottom, after the animals ' + JSON.stringify(roleGroup.heads));
    assert(roleGroup.roles.map(r => r.k).join() === ROLES.map(r => r[0]).join(), '角色 group order');
    for (const [k, n] of ROLES) {
      const hit = roleGroup.roles.find(b => b.k === k);
      assert(hit && hit.n === n && hit.src.includes('/img/av/' + k + '.webp') && !hit.off, '角色 group shows free ' + n);
      assert(!roleGroup.beasts.includes(k), n + ' is not lost in the animal list');
    }
    assert(roleGroup.upload && roleGroup.beasts.includes('fox') && roleGroup.beasts.includes('hero'), 'photo upload and the animal faces stay');
    const animalBtn = await cdp.eval(`document.querySelector('[data-e="puffer"]').scrollIntoView({ block: 'center' }); 1`);
    assert(animalBtn, 'scrolled to the new animals');
    await cdp.eval(`Promise.all([...document.querySelectorAll('.pe-grid img, .pe-av img')].map(i => i.decode().catch(() => 0)))`);
    await sleep(120);
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
    const foxLock = await cdp.eval(`(() => {
      const b = document.querySelector('[data-pd="foxqiu"]');
      const lk = b.querySelector(':scope > .lk');
      const br = b.getBoundingClientRect();
      const lr = lk.getBoundingClientRect();
      const pov = getComputedStyle(b.querySelector('.pov'));
      const pd = b.querySelector('.pdv').getBoundingClientRect();
      return {
        off: b.classList.contains('off'),
        need: (b.querySelector('i') || {}).textContent || '',
        filter: pov.filter,
        opacity: pov.opacity,
        topGap: Math.round(lr.top - br.top),
        rightGap: Math.round(br.right - lr.right),
        aboveArt: lr.top < pd.top,
      };
    })()`);
    assert(foxLock.off && foxLock.need === '玩 9 場解鎖', 'a 0-game account still shows the 狐祈千秋 requirement ' + JSON.stringify(foxLock));
    assert(String(foxLock.filter).includes('grayscale') && Number(foxLock.opacity) < 0.7, 'locked 狐祈千秋 art is greyed ' + JSON.stringify(foxLock));
    assert(foxLock.topGap >= 0 && foxLock.topGap <= 8 && foxLock.rightGap >= 0 && foxLock.rightGap <= 8, 'the 狐祈千秋 lock sits in the card corner ' + JSON.stringify(foxLock));
    await cdp.eval(`document.querySelector('[data-pd="foxqiu"]').scrollIntoView({ block: 'start' });`);
    await cdp.eval(`Promise.all([...document.querySelectorAll('.sheet img')].map(i => i.decode().catch(() => 0)))`);
    await sleep(150);
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
    const palPick = await cdp.eval(`(() => {
      const pal = (k) => { const n = document.querySelector('[data-pd="' + k + '"] .pd-pal'); return n ? n.dataset.pal : ''; };
      const keys = ${JSON.stringify(Object.keys(PALS))};
      const out = {};
      for (const k of keys) out[k] = pal(k);
      return out;
    })()`);
    for (const [k, v] of Object.entries(PALS)) assert(palPick[k] === v, 'picker charm for ' + k + ' is ' + v + ' (' + palPick[k] + ')');
    assert(new Set(Object.values(palPick)).size === 12, 'picker charms are all different');
    const pickerClear = await cdp.eval(`(() => {
      const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const cards = [...document.querySelectorAll('[data-pd]')].filter(b => b.querySelector('.pd-pal'));
      const names = cards.map(b => ({ k: b.dataset.pd, r: b.querySelector('b').getBoundingClientRect(), text: b.querySelector('b').textContent }));
      const bad = [];
      for (const card of cards) {
        const pal = card.querySelector('.pd-pal').getBoundingClientRect();
        const face = card.querySelector('.pdcirc').getBoundingClientRect();
        const cx = face.left + face.width / 2, cy = face.top + face.height / 2, rad = face.width / 2 - 1;
        const qx = Math.max(pal.left, Math.min(cx, pal.right));
        const qy = Math.max(pal.top, Math.min(cy, pal.bottom));
        if ((qx - cx) ** 2 + (qy - cy) ** 2 < rad * rad) bad.push(card.dataset.pd + ' face');
        for (const n of names) if (overlap(pal, n.r)) bad.push(card.dataset.pd + ' covers ' + n.text);
      }
      return bad.slice(0, 8);
    })()`);
    assert(!pickerClear.length, 'picker charms stay off faces and frame names ' + JSON.stringify(pickerClear));

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
      return { foxqiu: q('foxqiu').classList.contains('off'), foxNeed: (q('foxqiu').querySelector('i') || {}).textContent || '', plain: q('starplain').classList.contains('off'), plainNeed: (q('starplain').querySelector('i') || {}).textContent || '', ice: q('icesword').classList.contains('off') };
    })()`);
    assert(!unlocked.foxqiu && unlocked.foxNeed === '' && unlocked.plain && unlocked.plainNeed.includes('勝 4 場') && !unlocked.ice, 'picker locks and unlocks follow the same ladder ' + JSON.stringify(unlocked));
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
    await size(375, 812);
    const merlinSeat = await cdp.eval(`(async () => {
      const st = document.querySelector('.rt .st');
      st.querySelector('.av-wrap').outerHTML = window.__av.av({ pendant: 'icesword', avatar: 'merlin', bg: '#bcd6ff', name: '梅林' }, 58);
      const img = st.querySelector('.av img');
      await img.decode().catch(() => 0);
      const palEl = st.querySelector('.pd-pal');
      palEl.style.animation = 'none';
      palEl.style.transform = 'none';
      const face = st.querySelector('.av').getBoundingClientRect();
      const pal = palEl.getBoundingClientRect();
      const noEl = document.querySelector('.rt > .no[data-seat="' + st.dataset.seat + '"]');
      const no = noEl.getBoundingClientRect();
      const nm = st.querySelector('.nm').getBoundingClientRect();
      const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const cx = face.left + face.width / 2, cy = face.top + face.height / 2, rad = face.width / 2 - 1;
      const qx = Math.max(pal.left, Math.min(cx, pal.right));
      const qy = Math.max(pal.top, Math.min(cy, pal.bottom));
      return {
        src: img.src, pal: palEl.dataset.pal, noText: noEl.textContent,
        topLeft: pal.left < cx && pal.top < cy,
        onFace: (qx - cx) ** 2 + (qy - cy) ** 2 < rad * rad,
        onNo: overlap(pal, no), onName: overlap(pal, nm),
        noW: no.width, noH: no.height,
      };
    })()`);
    assert(String(merlinSeat.src).includes('/img/av/merlin.webp') && merlinSeat.pal === 'sword', 'merlin seat wears the painted sword charm ' + JSON.stringify(merlinSeat));
    assert(merlinSeat.topLeft && !merlinSeat.onFace && !merlinSeat.onNo && !merlinSeat.onName && merlinSeat.noText && merlinSeat.noW > 4, 'merlin charm stays top-left and the seat number stays visible ' + JSON.stringify(merlinSeat));

    await size(375, 812);
    const clearFrames = await cdp.eval(`(async () => {
      const keys = ${JSON.stringify(FRAMES.map(x => x[0]))};
      const pals = ${JSON.stringify(PALS)};
      const names = ['Dickson', '龍吟九霄呀哈'];
      const out = [];
      const st = document.querySelector('.rt .st');
      for (const k of keys) {
        for (const name of names) {
          st.querySelector('.av-wrap').outerHTML = window.__av.av({ pendant: k, avatar: 'fox', bg: '#fff7ea', name: 'x' }, 58);
          const nm = st.querySelector('.nm');
          nm.textContent = name;
          const wrap = st.querySelector('.av-wrap');
          const imgs = [...wrap.querySelectorAll('img.pov')];
          await Promise.all(imgs.map(i => i.decode().catch(() => 0)));
          const face = wrap.querySelector('.av').getBoundingClientRect();
          const nr = nm.getBoundingClientRect();
          const pal = wrap.querySelector('.pd-pal');
          const pr = pal ? pal.getBoundingClientRect() : null;
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.ceil(nr.width));
          c.height = Math.max(1, Math.ceil(nr.height));
          const x = c.getContext('2d');
          let hit = 0;
          for (const img of imgs) {
            const r = img.getBoundingClientRect();
            x.clearRect(0, 0, c.width, c.height);
            x.drawImage(img, r.left - nr.left, r.top - nr.top, r.width, r.height);
            const data = x.getImageData(0, 0, c.width, c.height).data;
            for (let i = 3; i < data.length; i += 4) if (data[i] > 28) hit++;
          }
          const fc = document.createElement('canvas');
          fc.width = fc.height = 10;
          const fx = fc.getContext('2d');
          let faceHit = 0;
          const ox = face.left + face.width / 2 - 5, oy = face.top + face.height / 2 - 5;
          for (const img of imgs) {
            const r = img.getBoundingClientRect();
            fx.clearRect(0, 0, 10, 10);
            fx.drawImage(img, r.left - ox, r.top - oy, r.width, r.height);
            const data = fx.getImageData(0, 0, 10, 10).data;
            for (let i = 3; i < data.length; i += 4) if (data[i] > 28) faceHit++;
          }
          const overlap = (a, b) => !!(a && b && a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5);
          let palFace = false;
          if (pr) {
            const cx = face.left + face.width / 2, cy = face.top + face.height / 2, rad = face.width / 2 - 1;
            const qx = Math.max(pr.left, Math.min(cx, pr.right));
            const qy = Math.max(pr.top, Math.min(cy, pr.bottom));
            palFace = (qx - cx) ** 2 + (qy - cy) ** 2 < rad * rad;
          }
          const ratio = pr && face.width ? pr.width / face.width : 0;
          out.push({
            k, name, hit, faceHit, palFace,
            pal: pal ? pal.dataset.pal : '',
            want: pals[k] || '',
            ratio: Math.round(ratio * 100) / 100,
            onName: overlap(pr, nr),
            sheen: getComputedStyle(wrap, '::after').animationName,
            ellipsis: nm.scrollWidth > nm.clientWidth + 1,
            text: nm.textContent,
          });
        }
      }
      return out;
    })()`);
    for (const row of clearFrames) {
      assert(row.hit === 0, row.k + ' does not paint on ' + row.name + ' (' + row.hit + ')');
      assert(row.faceHit === 0, row.k + ' leaves the face hole clear');
      assert(!row.palFace, row.k + ' charm stays off the face');
      assert(!row.onName, row.k + ' charm stays off ' + row.name);
      assert(row.ratio >= 0.48 && row.ratio < 0.85, row.k + ' charm is a large moderate size (' + row.ratio + ')');
      assert(row.pal === row.want, row.k + ' charm is ' + row.want + ' (' + row.pal + ')');
      assert(!row.ellipsis && row.text === row.name, row.k + ' keeps the full name ' + row.text);
      const moving = row.k === 'frostmirror' || row.k === 'icesword' ? 'iceSweep' : 'pdSheen';
      assert(row.sheen === moving, row.k + ' sheen is ' + moving + ' (' + row.sheen + ')');
    }
    const wear = async (k, name) => {
      await cdp.eval(`(() => {
        const st = document.querySelector('.rt .st');
        st.querySelector('.nm').textContent = ${JSON.stringify(name)};
        st.querySelector('.av-wrap').outerHTML = window.__av.av({ pendant: ${JSON.stringify(k)}, avatar: 'fox', bg: '#fff7ea', name: 'x' }, 58);
        st.querySelector('.nm').textContent = ${JSON.stringify(name)};
      })()`);
      await cdp.eval(`Promise.all([...document.querySelectorAll('.rt .st img')].map(i => i.decode().catch(() => 0)))`);
      await sleep(60);
    };
    for (const [k] of FRAMES) {
      await wear(k, k === 'icesword' ? 'Dickson' : '龍吟九霄呀哈');
      await cdp.shot('seat-charm-' + k + '-375');
    }
    await wear('icesword', 'Dickson');
    await cdp.shot('seat-icesword-dickson-375');
    const swordRead = await cdp.eval(`(() => {
      const pal = document.querySelector('.rt .st .pd-pal');
      const face = document.querySelector('.rt .st .av').getBoundingClientRect();
      const pr = pal.getBoundingClientRect();
      return { kind: pal.dataset.pal, ratio: Math.round(pr.width / face.width * 100) / 100, text: document.querySelector('.rt .st .nm').textContent };
    })()`);
    assert(swordRead.kind === 'sword' && swordRead.ratio >= 0.48 && swordRead.ratio < 0.85 && swordRead.text === 'Dickson', '逆光之劍 shows a readable sword beside Dickson ' + JSON.stringify(swordRead));
    await size(390, 844);
    await sleep(80);
    await cdp.shot('seat-icesword-dickson-390');
    await size(375, 812);
    const crowd = await cdp.eval(`(() => {
      const keys = ${JSON.stringify(FRAMES.map(x => x[0]))};
      const names = ['Dickson', '龍吟九霄呀哈'];
      const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const faceHit = (pal, face) => {
        const cx = face.left + face.width / 2, cy = face.top + face.height / 2, rad = face.width / 2 - 1;
        const qx = Math.max(pal.left, Math.min(cx, pal.right));
        const qy = Math.max(pal.top, Math.min(cy, pal.bottom));
        return (qx - cx) ** 2 + (qy - cy) ** 2 < rad * rad;
      };
      const probe = document.createElement('div');
      probe.className = 'card tbl';
      probe.style.cssText = 'position:fixed;left:0;top:0;width:100%;z-index:40;background:#fff';
      document.body.appendChild(probe);
      const bad = [];
      for (let n = 8; n <= 8; n++) {
        for (const focus of keys) {
          for (let seat = 1; seat <= n; seat++) {
            const seats = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, seat: i + 1, name: names[i % 2], pendant: i + 1 === seat ? focus : keys[i % keys.length], avatar: 'fox', bg: '#fff7ea', online: true }));
            probe.innerHTML = window.__av.roundTable(seats);
            const people = [...probe.querySelectorAll('.rt .st')].filter(s => s.querySelector('.pd-pal'));
            const nameBoxes = people.map(s => s.querySelector('.nm').getBoundingClientRect());
            people.forEach((s, i) => {
              const pal = s.querySelector('.pd-pal').getBoundingClientRect();
              const face = s.querySelector('.av').getBoundingClientRect();
              const nm = s.querySelector('.nm');
              if (nm.scrollWidth > nm.clientWidth + 1) bad.push(focus + '@' + seat + ' ellipsis ' + nm.textContent);
              if (faceHit(pal, face)) bad.push(focus + '@' + seat + ' face');
              nameBoxes.forEach((box, j) => { if (overlap(pal, box)) bad.push('seat ' + (i + 1) + ' ' + focus + ' covers seat ' + (j + 1) + ' ' + people[j].querySelector('.nm').textContent + ' overlapY=' + Math.round(box.bottom - pal.top)); });
            });
          }
        }
      }
      probe.remove();
      return bad.slice(0, 8);
    })()`);
    assert(!crowd.length, 'charms stay off every name and face around the table ' + JSON.stringify(crowd));
    await cdp.eval(`(() => {
      const keys = ${JSON.stringify(FRAMES.map(x => x[0]))};
      const names = ['Dickson', '龍吟九霄呀哈', 'Dickson', '星樓望月呀', 'Dickson', '龍吟九霄呀哈', 'Dickson', '奧丁之眼呀'];
      const seats = keys.slice(0, 8).map((k, i) => ({ id: 'p' + i, seat: i + 1, name: names[i], pendant: k, avatar: 'fox', bg: '#fff7ea', online: true }));
      const probe = document.createElement('div');
      probe.id = 'charm-probe';
      probe.className = 'card tbl';
      probe.style.cssText = 'position:fixed;left:0;top:0;width:100%;z-index:40;background:#fff';
      probe.innerHTML = window.__av.roundTable(seats);
      document.body.appendChild(probe);
    })()`);
    await sleep(80);
    await cdp.shot('seat-eight-charms-375');
    await cdp.eval(`document.getElementById('charm-probe').remove()`);
    await wear('icesword', 'Dickson');
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await sleep(40);
    const reducedSheen = await cdp.eval(`(() => {
      const wrap = document.querySelector('.rt .st .av-wrap');
      const pal = wrap.querySelector('.pd-pal');
      return { sheen: getComputedStyle(wrap, '::after').animationName, pal: pal ? getComputedStyle(pal).animationName : '', kind: pal ? pal.dataset.pal : '', opacity: getComputedStyle(wrap, '::after').opacity };
    })()`);
    assert(reducedSheen.sheen === 'none' && reducedSheen.pal === 'none' && reducedSheen.kind === 'sword' && Number(reducedSheen.opacity) === 0, 'reduced motion freezes the sheen and the sword charm (' + JSON.stringify(reducedSheen) + ')');
    await cdp.shot('seat-sword-reduced-375');
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });

    await put(tokens[gm.id], { pendant: 'icesword', avatar: 'fox', name: 'Dickson' });
    await put(tokens[rich.id], { pendant: 'skydragon', avatar: 'dragonet', name: '龍吟九霄呀哈' });
    await boot(tokens[gm.id], { name: 'Dickson', avatar: 'fox', bg: '#ffffff', fx: 'none', pendant: 'icesword' });
    await cdp.eval(`document.querySelector('[data-a="create"]').click()`);
    const hostReady = await cdp.eval(`new Promise(r => { const t = setInterval(() => { const img = document.querySelector('.rt .st .av img'); if (img && document.querySelector('.top-code') && document.querySelector('.rt .st .pd-pal')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 12000); })`, 20000);
    assert(hostReady, 'host is seated with the sword charm');
    const code = await cdp.eval(`document.querySelector('.top-code').textContent.trim()`);
    const { io } = require('socket.io-client');
    const sock = io(APP, { transports: ['websocket'], forceNew: true });
    const emit = (e, d) => new Promise(res => sock.emit(e, d, res));
    await new Promise(r => sock.on('connect', r));
    const hello = await emit('hello', { token: tokens[rich.id] });
    assert(hello && hello.ok !== false, 'neighbor socket joined the account ' + JSON.stringify(hello).slice(0, 180));
    const joined = await emit('join', { code });
    assert(joined && !joined.error, 'neighbor entered the room ' + JSON.stringify(joined).slice(0, 180));
    const sat = await emit('act', { type: 'sit', data: { seat: 2 } });
    assert(sat && sat.ok, 'neighbor sat beside the host ' + JSON.stringify(sat).slice(0, 180));
    const pairReady = await cdp.eval(`new Promise(r => { const t = setInterval(() => { const seats = [...document.querySelectorAll('.rt .st .pd-pal')]; if (seats.length >= 2) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    assert(pairReady, 'two charms are on the table');
    const pairGeom = await cdp.eval(`(() => {
      const seats = [...document.querySelectorAll('.rt .st')].filter(s => s.querySelector('.pd-pal'));
      const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      return seats.map(s => {
        const nm = box(s.querySelector('.nm'));
        const pal = box(s.querySelector('.pd-pal'));
        const names = seats.map(o => box(o.querySelector('.nm')));
        return { text: s.querySelector('.nm').textContent, palOnOwn: overlap(pal, nm), palOnAny: names.some(n => overlap(pal, n)), ellipsis: s.querySelector('.nm').scrollWidth > s.querySelector('.nm').clientWidth + 1 };
      });
    })()`);
    for (const row of pairGeom) {
      assert(!row.palOnOwn && !row.palOnAny && !row.ellipsis, 'charm stays off every name (' + JSON.stringify(row) + ')');
      assert(row.text === 'Dickson' || row.text === '龍吟九霄呀哈', 'adjacent seat keeps its name ' + row.text);
    }
    await cdp.eval(`Promise.all([...document.images].map(i => i.decode().catch(() => 0)))`);
    await sleep(80);
    await cdp.shot('seat-pair-sword-neighbor-375');
    await size(390, 844);
    await sleep(80);
    await cdp.shot('seat-pair-sword-neighbor-390');
    sock.close();

    const art = '/opt/cursor/artifacts';
    fs.mkdirSync(art, { recursive: true });
    for (const name of fs.readdirSync(OUT)) fs.copyFileSync(path.join(OUT, name), path.join(art, name));
    console.log('COSMETICS TESTS PASSED');
  } finally {
    srv.kill('SIGTERM');
    chrome.kill('SIGTERM');
  }
})().catch(e => { console.error(e); process.exit(1); });
