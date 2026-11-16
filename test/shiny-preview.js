// Shiny card preview is separate from equip. 10 real MVPs required, including GM.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3219;
const APP = 'http://127.0.0.1:' + PORT + '/';
const CDP = 9355;
const DATA = '/tmp/shiny-' + Date.now();
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}
async function putSkins(token, skins) {
  const r = await fetch(APP + 'api/me', { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ skins }) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.user;
}

const PROTECTED = {
  'servant.webp': ['40676', 'a59fb264250ce508e29066e3e00c44d9da7abc6f46bfb54810b7b3c06ffa63f1'],
  'servant_t.webp': ['7538', 'f4a4f41c6df09a0523887d363aff38789b3a710291315307417b6dd8249fda06'],
  'servant_casual.webp': ['40810', 'ff9a50ab0379ebbf2c9f0ed9305bd2e4b40fa98fa2d6835c06d8c0b348b4be0e'],
  'servant_casual_t.webp': ['7972', '665eea863839aca21da5a7a6f735da3ebd99d3d6b703cf726c2caf794e3ac4ad'],
  'servant_festive.webp': ['45174', '3aaa7b79109de45269dc5132772e0bbed0a027ac5d9f911e7a8e65f718b83ea2'],
  'servant_festive_t.webp': ['7946', '353d0be9de63fd77e52575898a4447424c2ea26db57ecd416195b5720c7391cf'],
  'mordred.webp': ['51674', 'd2b043f7f245ce9d06c5343ee6abb7950b2bf99978dc429b1630535076390f0d'],
  'oberon.webp': ['49654', '2b4ccf93b625e3fa94b2cbb04f99bcc2f77d72a40fb981513c8ecbf1c730e1fe'],
};
const NEW_ART = ['mordred_casual.webp', 'mordred_casual_t.webp', 'mordred_festive.webp', 'mordred_festive_t.webp', 'oberon_casual.webp', 'oberon_casual_t.webp', 'oberon_festive.webp', 'oberon_festive_t.webp', 'servant_male.webp', 'servant_male_t.webp', 'servant_casual_male.webp', 'servant_casual_male_t.webp'];
(async () => {
  const crypto = require('crypto');
  const imgDir = path.join(__dirname, '..', 'public', 'img');
  for (const [name, [bytes, hash]] of Object.entries(PROTECTED)) {
    const buf = fs.readFileSync(path.join(imgDir, name));
    assert(String(buf.length) === bytes && crypto.createHash('sha256').update(buf).digest('hex') === hash, name + ' bytes are unchanged');
  }
  const female = fs.readFileSync(path.join(imgDir, 'servant.webp'));
  const male = fs.readFileSync(path.join(imgDir, 'servant_male.webp'));
  assert(!female.equals(male), 'classic male art is not a copy of the female classic');
  for (const name of NEW_ART) assert(fs.existsSync(path.join(imgDir, name)), 'new art exists: ' + name);
  fs.mkdirSync(DATA, { recursive: true });
  process.env.DATA_DIR = DATA;
  process.env.DATABASE_URL = '';
  delete require.cache[require.resolve('../db')];
  const db = require('../db');
  await db.init();
  const low = await db.createGuest({ guestKey: 'shiny-low-key-1234', name: '未夠MVP' });
  const high = await db.createGuest({ guestKey: 'shiny-high-key-1234', name: '十次MVP' });
  const gm = await db.createGuest({ guestKey: 'shiny-gm-key-12345', name: 'GM零MVP' });
  const lowTok = await db.createSession(low.id);
  const highTok = await db.createSession(high.id);
  const gmTok = await db.createSession(gm.id);
  db.flush();
  const file = path.join(DATA, 'db.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.stats = saved.stats || {};
  saved.stats[low.id] = { played: 3, won: 1, mvp: 0, roles: {} };
  saved.stats[high.id] = { played: 12, won: 10, mvp: 10, roles: {} };
  saved.stats[gm.id] = { played: 4, won: 2, mvp: 0, roles: {} };
  fs.writeFileSync(file, JSON.stringify(saved));

  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', GM_USER_ID: gm.id, GM_EMAIL: 'nobody-gm@example.invalid' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server')), 8000); srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } }); });

  const chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-shiny', 'about:blank'], { stdio: 'ignore' });
  try {
    const denied = await putSkins(lowTok, { _shiny: true, merlin: 'classic' });
    assert(denied.skins._shiny === false, '0 MVP cannot equip the shiny effect');
    const gmDenied = await putSkins(gmTok, { _shiny: true });
    assert(gmDenied.gm === true && gmDenied.skins._shiny === false, 'GM with 0 real MVP cannot equip the shiny effect');
    const earned = await putSkins(highTok, { _shiny: true, merlin: 'classic' });
    assert(earned.skins._shiny === true && earned.skins.merlin === 'classic', '10 real MVPs can equip the shiny effect');

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
    let page;
    for (let i = 0; i < 40 && !page; i++) { try { page = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
    const cdp = new Page(page.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: APP });
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-v="skins"]')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    await cdp.eval(`document.querySelector('[data-v="skins"]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('#shiny-sample')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    await cdp.eval(`document.querySelector('.shiny-card').scrollIntoView({ block: 'center' }); window.scrollTo(0, 220);`);
    await sleep(80);
    const before = await cdp.eval(`(() => {
      const card = document.querySelector('#shiny-sample');
      const sw = document.querySelector('[data-a="shiny"]');
      const r = card.getBoundingClientRect();
      return { y: window.scrollY, holo: card.classList.contains('holo'), h: r.height, w: r.width, disabled: sw.disabled, lock: document.querySelector('#shiny-lock').textContent, marker: document.body.dataset.keep = 'skins' };
    })()`);
    assert(before.holo && before.h >= 280 && before.w >= 200, 'preview card is large enough to see the foil (' + Math.round(before.w) + 'x' + Math.round(before.h) + ')');
    assert(before.disabled && /10/.test(before.lock) && /預覽/.test(before.lock), 'locked state shows the 10 MVP line');
    await cdp.eval(`document.querySelector('[data-a="shinyprev"]').click()`);
    await sleep(40);
    const after = await cdp.eval(`(() => ({ y: window.scrollY, holo: document.querySelector('#shiny-sample').classList.contains('holo'), marker: document.body.dataset.keep, shiny: !!(JSON.parse(localStorage.getItem('cc.skins') || '{}')._shiny), status: document.querySelector('.shiny-status').textContent, still: location.pathname }))()`);
    assert(after.holo && after.marker === 'skins' && Math.abs(after.y - before.y) < 2 && !after.shiny, 'replay does not equip, refresh, or jump (' + after.status + ')');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: await cdp.eval(`(() => { const e = document.querySelector('.shiny-card').getBoundingClientRect(); return { x: 0, y: Math.max(0, e.top), width: 375, height: Math.min(812, e.height), scale: 1 }; })()`) });
    fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
    fs.writeFileSync('/opt/cursor/artifacts/shiny-preview-375.png', Buffer.from(shot.data, 'base64'));
    const mordred = await cdp.eval(`(() => { const h = [...document.querySelectorAll('h3')].find(x => x.textContent.includes('莫德雷德')); if (!h) return { missing: true, heads: [...document.querySelectorAll('h3')].map(x => x.textContent) }; const card = h.closest('.card'); return { tiles: [...card.querySelectorAll('[data-a=skin]')].map(s => s.dataset.s), note: card.innerText }; })()`);
    assert(mordred.tiles && mordred.tiles.includes('casual') && mordred.tiles.includes('festive') && !/原圖未收錄/.test(mordred.note || ''), 'Mordred has casual and festive tiles from real art');
    const mordredArt = await cdp.eval(`(() => [...document.querySelectorAll('[data-r=mordred][data-a=skin]')].map(s => ({ id: s.dataset.s, art: getComputedStyle(s.querySelector('.art')).backgroundImage, name: s.querySelector('.rn').textContent })))()`);
    assert(mordredArt.find(t => t.id === 'casual').art.includes('/img/mordred_casual.webp') && mordredArt.find(t => t.id === 'festive').art.includes('/img/mordred_festive.webp') && mordredArt.every(t => t.name === '莫德雷德'), 'Mordred tiles use the new outfit files');
    const oberonArt = await cdp.eval(`(() => [...document.querySelectorAll('[data-r=oberon][data-a=skin]')].map(s => ({ id: s.dataset.s, art: getComputedStyle(s.querySelector('.art')).backgroundImage, name: s.querySelector('.rn').textContent })))()`);
    assert(oberonArt.find(t => t.id === 'casual').art.includes('/img/oberon_casual.webp') && oberonArt.find(t => t.id === 'festive').art.includes('/img/oberon_festive.webp'), 'Oberon tiles use the new outfit files');
    const servant = await cdp.eval(`(() => {
      const h = [...document.querySelectorAll('h3')].find(x => x.textContent.includes('亞瑟的忠臣'));
      const card = h.closest('.card');
      const tiles = [...card.querySelectorAll('[data-a=skin]')].map(s => ({ id: s.dataset.s, label: s.childNodes[s.childNodes.length-1].textContent.trim(), name: s.querySelector('.rn').textContent, art: getComputedStyle(s.querySelector('.art')).backgroundImage }));
      return { tiles, note: card.innerText.includes('男仕') };
    })()`);
    const byId = Object.fromEntries(servant.tiles.map(t => [t.id, t]));
    assert(byId.classic && byId.classic.art.includes('/img/servant.webp') && !byId.classic.art.includes('servant_male') && byId.classic.label.startsWith('經典 · 女') && byId.classic.name === '亞瑟的忠臣', 'female classic servant art and role name stay');
    assert(byId.casual && byId.casual.art.includes('/img/servant_casual.webp') && !byId.casual.art.includes('casual_male') && byId.casual.label.startsWith('日常便服 · 女'), 'female casual servant art stays');
    assert(byId.classic_male && byId.classic_male.art.includes('/img/servant_male.webp') && byId.classic_male.label.startsWith('經典 · 男'), 'classic male servant uses servant_male.webp');
    assert(byId.casual_male && byId.casual_male.art.includes('/img/servant_casual_male.webp') && byId.casual_male.label.startsWith('日常便服 · 男'), 'casual male servant uses servant_casual_male.webp');
    assert(!servant.tiles.some(t => t.id === 'festive_male'), 'no male festive tile');
    await cdp.eval(`document.querySelector('[data-r=servant][data-s=classic_male]').scrollIntoView({ block: 'center' })`);
    const rowShot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: await cdp.eval(`(() => { const e = document.querySelector('[data-r=servant]').closest('.card').getBoundingClientRect(); return { x: 0, y: Math.max(0, e.top), width: 375, height: Math.min(520, e.height), scale: 1 }; })()`) });
    fs.writeFileSync('/opt/cursor/artifacts/servant-picker-375.png', Buffer.from(rowShot.data, 'base64'));
    const yBefore = await cdp.eval(`window.scrollY`);
    await cdp.eval(`document.querySelector('[data-r=servant][data-s=classic_male]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.skinprev img')) { clearInterval(t); r(1); } }, 30); setTimeout(() => r(0), 4000); })`);
    const malePrev = await cdp.eval(`(() => { const img = document.querySelector('.skinprev img'); const rn = document.querySelector('.skinprev .rn'); return { src: img.src, name: rn.textContent, lines: rn.getClientRects().length }; })()`);
    assert(malePrev.src.includes('/img/servant_male.webp') && malePrev.name === '亞瑟的忠臣' && malePrev.lines === 1, 'male classic preview keeps one role-name line');
    const maleShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/opt/cursor/artifacts/servant-male-preview-375.png', Buffer.from(maleShot.data, 'base64'));
    await cdp.eval(`document.querySelector('#sp-x').click()`);
    const yMale = await cdp.eval(`window.scrollY`);
    assert(Math.abs(yMale - yBefore) < 2, 'closing the male preview restores scroll');
    await cdp.eval(`document.querySelector('[data-r=mordred][data-s=festive]').scrollIntoView({ block: 'center' })`);
    await cdp.eval(`document.querySelector('[data-r=mordred][data-s=festive]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.skinprev img')) { clearInterval(t); r(1); } }, 30); setTimeout(() => r(0), 4000); })`);
    const morPrev = await cdp.eval(`document.querySelector('.skinprev img').src`);
    assert(morPrev.includes('/img/mordred_festive.webp'), 'Mordred festive preview uses the new full card');
    const morShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/opt/cursor/artifacts/mordred-festive-preview-375.png', Buffer.from(morShot.data, 'base64'));
    await cdp.eval(`document.querySelector('#sp-x').click()`);
  } finally {
    try { chrome.kill('SIGKILL'); } catch {}
    try { srv.kill('SIGKILL'); } catch {}
  }
  console.log('SHINY PREVIEW TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });
