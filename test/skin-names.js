// Role-name contrast + single line (t131/t132) and large skin preview (t130).
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3211;
const APP = 'http://127.0.0.1:' + PORT + '/';
const CDP = 9341;
const OUT = process.env.OUT || '/tmp/av-skins';
const DATA = '/tmp/av-skin-' + Date.now();
fs.mkdirSync(OUT, { recursive: true });
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lum = (css) => {
  const m = String(css).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return 0;
  const [r, g, b] = [1, 2, 3].map(i => Number(m[i]) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails).slice(0, 900));
    return r.result && r.result.value;
  }
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64'));
  }
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server')), 8000); srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } }); });
  const chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-skin-names', 'about:blank'], { stdio: 'ignore' });
  let page;
  for (let i = 0; i < 40 && !page; i++) { try { page = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(150); } }
  if (!page) throw new Error('no chrome');
  const cdp = new Page(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Runtime.enable');
  const size = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  try {
    await size(375, 812);
    await cdp.send('Page.navigate', { url: APP });
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-v="skins"]')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    await cdp.eval(`document.querySelector('[data-v="skins"]').click()`);
    const ready = await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelectorAll('.skin[data-a="skin"] .rn').length >= 8) { clearInterval(t); r(document.querySelectorAll('.skin[data-a="skin"]').length); } }, 40); setTimeout(() => r(0), 8000); })`);
    assert(ready >= 8, 'skin picker mounted (' + ready + ' tiles)');

    const namesExpr = `(() => {
      const tiles = [...document.querySelectorAll('.skin[data-a="skin"]')];
      return tiles.map(tile => {
        const rn = tile.querySelector('.rn');
        const cs = getComputedStyle(rn);
        const r = rn.getBoundingClientRect();
        const card = tile.querySelector('.rc').getBoundingClientRect();
        return {
          role: tile.dataset.r, skin: tile.dataset.s, text: rn.textContent,
          lines: rn.getClientRects().length, sw: rn.scrollWidth, cw: rn.clientWidth,
          color: cs.color, size: parseFloat(cs.fontSize), weight: cs.fontWeight,
          whiteSpace: cs.whiteSpace, l: r.left, right: r.right, cardL: card.left, cardR: card.right,
          sel: tile.classList.contains('sel')
        };
      });
    })()`;

    for (const [w, h, tag] of [[375, 812, '375'], [390, 844, '390']]) {
      await size(w, h);
      await sleep(80);
      const rows = await cdp.eval(namesExpr);
      assert(rows.length >= 40, tag + ' checks every role skin tile (' + rows.length + ')');
      const roles = new Set(rows.map(x => x.role));
      assert(roles.size === 8, tag + ' covers all 8 roles');
      for (const row of rows) {
        assert(row.lines === 1, tag + ' ' + row.role + '/' + row.skin + '「' + row.text + '」is one line (' + row.lines + ')');
        assert(row.whiteSpace === 'nowrap', tag + ' name does not wrap');
        assert(row.sw <= row.cw + 1, tag + ' ' + row.text + ' is not clipped (' + row.sw + '>' + row.cw + ')');
        assert(row.l >= row.cardL - 1 && row.right <= row.cardR + 1, tag + ' ' + row.text + ' stays inside its card');
        assert(lum(row.color) > 0.75, tag + ' ' + row.text + ' is high contrast (' + row.color + ')');
        assert(row.size >= 14, tag + ' ' + row.text + ' stays readable (' + row.size + 'px)');
      }
      const long = rows.filter(x => x.text === '莫德雷德的爪牙' || x.text === '亞瑟的忠臣' || x.text === '派西維爾');
      assert(long.length >= 3 && long.every(x => x.lines === 1 && x.sw <= x.cw + 1), tag + ' longest names stay one line');
      if (tag === '375') await cdp.shot('skin-names-375');
    }

    // Scroll a row, open a locked preview, close, scroll unchanged, no equip.
    await size(375, 812);
    await cdp.eval(`(() => { const row = document.querySelector('.skin[data-r="percival"]').closest('.skinrow'); row.scrollLeft = 120; window.scrollTo(0, 420); window.__mark = document.querySelector('#app'); })()`);
    const before = await cdp.eval(`(() => ({ y: window.scrollY, x: document.querySelector('.skin[data-r="percival"]').closest('.skinrow').scrollLeft, sel: document.querySelector('.skin[data-r="percival"][data-s="festive"]').classList.contains('sel'), href: location.href }))()`);
    await cdp.eval(`document.querySelector('.skin[data-r="percival"][data-s="festive"]').click()`);
    await sleep(200);
    const prev = await cdp.eval(`(() => {
      const ov = document.querySelector('.skinprev');
      const img = ov.querySelector('img');
      const rn = ov.querySelector('.rn');
      const en = ov.querySelector('.en');
      const btn = ov.querySelector('#sp-eq');
      const cs = getComputedStyle(img);
      const ncs = getComputedStyle(rn);
      const r = rn.getBoundingClientRect();
      const frame = ov.querySelector('.sp-frame').getBoundingClientRect();
      return {
        open: !!ov, src: img.getAttribute('src'), fit: cs.objectFit, alt: img.alt,
        text: rn.textContent, en: en && en.textContent, lines: rn.getClientRects().length,
        color: ncs.color, size: parseFloat(ncs.fontSize),
        sw: rn.scrollWidth, cw: Math.ceil(frame.width),
        nw: img.naturalWidth, nh: img.naturalHeight, dw: img.clientWidth, dh: img.clientHeight,
        btn: btn.textContent, dis: btn.disabled,
        puts: 0, href: location.href, app: document.querySelector('#app') === window.__mark,
        docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth,
        nameRight: r.right, frameRight: frame.right, nameLeft: r.left, frameLeft: frame.left
      };
    })()`);
    assert(prev.open && prev.href === before.href && prev.app, 'preview does not refresh or rebuild the picker');
    assert(prev.src.includes('/img/percival_festive.webp') && !prev.src.includes('_t.'), 'preview uses full festive art');
    assert(prev.fit === 'contain', 'preview art is contained, not cropped');
    assert(prev.nw > 0 && Math.abs(prev.dw / prev.dh - prev.nw / prev.nh) < 0.04, 'displayed art keeps its aspect ratio');
    assert(prev.text === '派西維爾' && prev.lines === 1 && lum(prev.color) > 0.75 && prev.size >= 18, 'large preview Chinese name is one bright line');
    assert(prev.en === 'PERCIVAL', 'English stays a secondary label');
    assert(prev.nameLeft >= prev.frameLeft - 1 && prev.nameRight <= prev.frameRight + 1, 'preview name is not clipped');
    assert(prev.dis && /再玩 \d+ 場派西維爾即可解鎖/.test(prev.btn), 'locked preview disables equip with the real requirement (' + prev.btn + ')');
    assert(!before.sel, 'opening a locked skin does not equip it');
    assert(prev.docSW <= prev.docCW + 1, 'preview does not overflow the 375px page');
    await cdp.shot('skin-preview-percival-375');
    await cdp.eval(`document.querySelector('#sp-x').click()`);
    await sleep(50);
    const after = await cdp.eval(`(() => ({ y: window.scrollY, x: document.querySelector('.skin[data-r="percival"]').closest('.skinrow').scrollLeft, open: !!document.querySelector('.skinprev'), sel: document.querySelector('.skin[data-r="percival"][data-s="festive"]').classList.contains('sel') }))()`);
    assert(!after.open && !after.sel, 'close returns to the picker without equipping');
    assert(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2, 'close restores picker scroll (' + before.x + '/' + before.y + ' → ' + after.x + '/' + after.y + ')');

    // Unlocked casual is preview-only until 換上, then the existing success toast.
    await cdp.eval(`document.querySelector('.skin[data-r="merlin"][data-s="casual"]').click()`);
    await sleep(150);
    const casual = await cdp.eval(`(() => { const b = document.querySelector('#sp-eq'); return { text: b.textContent, dis: b.disabled, src: document.querySelector('.skinprev img').src, rn: document.querySelector('.skinprev .rn').textContent }; })()`);
    assert(casual.text === '換上' && !casual.dis && casual.rn === '梅林' && casual.src.includes('merlin_casual'), 'unlocked preview shows 換上 and does not equip yet');
    await cdp.shot('skin-preview-merlin-375');
    await size(390, 844);
    await sleep(40);
    const wide = await cdp.eval(`(() => { const img = document.querySelector('.skinprev img'); const rn = document.querySelector('.skinprev .rn'); const doc = document.documentElement; return { fit: getComputedStyle(img).objectFit, lines: rn.getClientRects().length, sw: rn.scrollWidth, cw: rn.clientWidth, color: getComputedStyle(rn).color, docSW: doc.scrollWidth, docCW: doc.clientWidth, dw: img.clientWidth, dh: img.clientHeight, nw: img.naturalWidth, nh: img.naturalHeight }; })()`);
    assert(wide.fit === 'contain' && wide.lines === 1 && lum(wide.color) > 0.75 && wide.sw <= wide.cw + 1, '390px large preview name stays one bright line');
    assert(Math.abs(wide.dw / wide.dh - wide.nw / wide.nh) < 0.04 && wide.docSW <= wide.docCW + 1, '390px art is contained without horizontal overflow');
    await cdp.shot('skin-preview-merlin-390');
    await cdp.eval(`document.querySelector('#sp-eq').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { const toast = document.querySelector('#toast'); if (toast && /已換上：梅林 · 日常便服/.test(toast.textContent)) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 4000); })`);
    const equipped = await cdp.eval(`(() => ({ toast: document.querySelector('#toast').textContent, sel: document.querySelector('.skin[data-r="merlin"][data-s="casual"]').classList.contains('sel'), btn: document.querySelector('#sp-eq').textContent, dis: document.querySelector('#sp-eq').disabled, classic: document.querySelector('.skin[data-r="merlin"][data-s="classic"]').classList.contains('sel') }))()`);
    assert(/已換上：梅林 · 日常便服/.test(equipped.toast), 'equip success message stays explicit');
    assert(equipped.sel && !equipped.classic && equipped.dis && equipped.btn === '使用中', '換上 equips only that skin');

    // Reduced motion: preview still shows the name, no animation on the overlay.
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const motion = await cdp.eval(`(() => { const ov = document.querySelector('.skinprev'); const cs = getComputedStyle(ov); return { anim: cs.animationName, text: ov.querySelector('.rn').textContent }; })()`);
    assert(motion.anim === 'none' && motion.text === '梅林', 'reduced motion keeps a still preview with the role name');

    // Every role's full-card caption (rules peek uses the same face) stays one light line.
    await cdp.eval(`document.querySelector('#sp-x').click()`);
    await cdp.eval(`document.querySelector('#backBtn').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-v="rules"]')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 4000); })`);
    await cdp.eval(`document.querySelector('[data-v="rules"]').click()`);
    await cdp.eval(`new Promise(r => setTimeout(r, 200))`);
    await cdp.eval(`document.querySelector('[data-a="rtab"][data-v="sides"]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelectorAll('.rolecell').length === 8) { clearInterval(t); r(1); } }, 30); setTimeout(() => r(0), 3000); })`);
    const cells = await cdp.eval(`(() => [...document.querySelectorAll('.rolecell b')].map(b => { const cs = getComputedStyle(b); const card = b.closest('.rolecell').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { text: b.textContent, lines: b.getClientRects().length, color: cs.color, size: parseFloat(cs.fontSize), sw: b.scrollWidth, cw: b.clientWidth, l: r.left, right: r.right, cardL: card.left, cardR: card.right }; }))()`);
    assert(cells.length === 8, 'rules grid shows every role');
    for (const c of cells) {
      assert(c.lines === 1 && c.sw <= c.cw + 1 && c.l >= c.cardL - 1 && c.right <= c.cardR + 1, 'grid 「' + c.text + '」is one unclipped line');
      assert(lum(c.color) > 0.75 && c.size >= 14, 'grid 「' + c.text + '」is bright (' + c.color + ', ' + c.size + 'px)');
    }
    console.log('ALL SKIN NAME CHECKS PASSED');
  } finally {
    chrome.kill('SIGKILL');
    srv.kill('SIGKILL');
  }
})().catch(e => { console.error(e); process.exit(1); });
