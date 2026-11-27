// Lobby ring (t123), colour swatches (t124), footer gap (t125), avatar-anchored entrance preview.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3207;
const APP = 'http://127.0.0.1:' + PORT + '/';
const CDP_PORT = 9333;
const OUT = process.env.OUT || '/tmp/av-after';
const DATA = '/tmp/av-ui-' + Date.now();
fs.mkdirSync(OUT, { recursive: true });
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}

class CDP {
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails).slice(0, 800));
    return r.result && r.result.value;
  }
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(OUT, name + '.png');
    fs.writeFileSync(p, Buffer.from(data, 'base64'));
    return p;
  }
}

const box = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height }; })()`;
const hit = (a, b) => a && b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;

(async () => {
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server')), 8000); srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } }); });
  const chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=/tmp/chrome-ui-layout', 'about:blank'], { stdio: 'ignore' });
  let list, page;
  for (let i = 0; i < 40 && !page; i++) { try { list = JSON.parse(await get('http://127.0.0.1:' + CDP_PORT + '/json/list')); page = list.find(t => t.type === 'page'); } catch { await sleep(150); } }
  if (!page) throw new Error('no chrome page');
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Runtime.enable');
  const setSize = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  const go = async (url) => { await cdp.send('Page.navigate', { url }); await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-a="profile"], .rt')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`); };

  try {
    await setSize(390, 844);
    await go(APP);
    await cdp.eval(`localStorage.setItem('cc.profile', JSON.stringify({ name:'Dickson', avatar:'fox', bg:'#ffffff', fx:'spot', pendant:'wolf' }))`);
    await go(APP);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.footer a[href="/privacy"]') && document.querySelector('[data-a="profile"]')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);

    for (const [w, h, tag] of [[390, 844, '390'], [375, 812, '375']]) {
      await setSize(w, h);
      await sleep(80);
      const gap = await cdp.eval(`(() => {
        const footer = document.querySelector('.footer');
        const fr = footer.getBoundingClientRect();
        const doc = document.documentElement;
        const links = [...footer.querySelectorAll('a')].map(a => a.textContent);
        return { scrollH: doc.scrollHeight, innerH: innerHeight, footerBottom: fr.bottom + scrollY, gap: doc.scrollHeight - (fr.bottom + scrollY), links, pad: getComputedStyle(document.querySelector('main')).paddingBottom, sw: doc.scrollWidth, cw: doc.clientWidth };
      })()`);
      assert(gap.links.includes('私隱政策') && gap.links.includes('使用條款'), tag + ' footer keeps privacy and terms');
      assert(gap.gap < 36 && gap.gap > 4, tag + ' home gap below footer is a small safe gap (' + gap.gap.toFixed(1) + 'px, pad ' + gap.pad + ')');
      assert(gap.sw <= gap.cw + 1, tag + ' home has no horizontal overflow');
      await cdp.eval(`window.scrollTo(0, document.documentElement.scrollHeight)`);
      const seen = await cdp.eval(`(() => { const a = document.querySelector('.footer a[href="/terms"]'); const r = a.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, ih: innerHeight }; })()`);
      assert(seen.top >= -1 && seen.bottom <= seen.ih + 1, tag + ' terms link scrolls fully into view');
      if (tag === '390') await cdp.shot('home-footer-after-390');
    }

    // swatches — white is the default selected colour
    await setSize(375, 812);
    await cdp.eval(`window.scrollTo(0,0); document.querySelector('[data-a="profile"]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.swatches button.sel')) { clearInterval(t); r(1); } }, 30); setTimeout(() => r(0), 4000); })`);
    const swatchCheck = async (label) => cdp.eval(`(() => {
      const body = document.querySelector('.pe-body');
      const br = body.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.swatches button')];
      const ring = 4;
      const rows = buttons.map(b => {
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return { bg: b.style.background, sel: b.classList.contains('sel'), l:r.left, r:r.right, t:r.top, b:r.bottom, w:r.width, h:r.height, transform: cs.transform, shadow: cs.boxShadow };
      });
      const clipped = rows.filter(r => r.l - (r.sel ? ring : 0) < br.left - 0.6 || r.r + (r.sel ? ring : 0) > br.right + 0.6 || r.t < br.top - 0.6);
      return { n: rows.length, clipped: clipped.length, first: rows[0], last: rows[rows.length-1], bodyL: br.left, bodyR: br.right, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, overflowX: getComputedStyle(body).overflowX };
    })()`);
    let sw = await swatchCheck('open');
    if (!(sw.n === 11 && sw.first && sw.first.sel)) console.log('SWATCH DEBUG', JSON.stringify(sw));
    const bg0 = sw.first && String(sw.first.bg).toLowerCase();
    assert(sw.n === 11 && sw.first.sel && (bg0 === '#ffffff' || bg0.includes('255, 255, 255')), 'eleven swatches, white selected first');
    assert(sw.first.transform === 'none', 'selected swatch is not scaled out of its box');
    assert(sw.clipped === 0, 'no swatch or blue ring is clipped by the editor (' + sw.clipped + ')');
    assert(sw.sw <= sw.cw + 1, 'profile editor does not widen the page');
    await cdp.shot('swatch-white-375');
    const colours = await cdp.eval(`JSON.stringify([...document.querySelectorAll('.swatches button')].map(b => b.dataset.c))`);
    for (const c of JSON.parse(colours)) {
      await cdp.eval(`document.querySelector('.swatches button[data-c="${c}"]').click()`);
      sw = await swatchCheck(c);
      assert(sw.clipped === 0, 'swatch ' + c + ' ring stays inside the row');
    }
    await setSize(390, 844);
    await sleep(60);
    sw = await swatchCheck('390');
    assert(sw.clipped === 0 && sw.sw <= sw.cw + 1, '390px swatch row including the selected ring stays inside');
    await cdp.shot('swatch-selected-390');

    // Put on a free pendant so the preview has to keep it visible.
    await cdp.eval(`document.querySelector('[data-t="pendant"]').click()`);
    await cdp.eval(`document.querySelector('[data-pd="wolf"]').click()`);
    await cdp.eval(`document.querySelector('[data-t="avatar"]').click()`);
    const rolePick = await cdp.eval(`(() => {
      const heads = [...document.querySelectorAll('.pe-h')].map(el => el.textContent.trim());
      const roleGrid = document.querySelector('.pe-roles');
      const roles = roleGrid ? [...roleGrid.querySelectorAll('[data-e]')].map(b => ({ k: b.dataset.e, n: (b.querySelector('.lb') || {}).textContent || '', src: (b.querySelector('img') || {}).getAttribute('src') || '' })) : [];
      const animal = [...document.querySelectorAll('.pe-grid')].find(g => !g.classList.contains('pe-roles'));
      const beasts = animal ? [...animal.querySelectorAll('[data-e]')].map(b => b.dataset.e) : [];
      const roleAfter = !!(animal && roleGrid && (animal.compareDocumentPosition(roleGrid) & Node.DOCUMENT_POSITION_FOLLOWING));
      return { heads, roles, beasts, upload: !!(animal && animal.querySelector('[data-upload]')), roleAfter };
    })()`);
    assert(rolePick.heads.join() === '動物,角色' && rolePick.roleAfter, 'avatar picker puts 角色 at the bottom, after 動物 ' + JSON.stringify(rolePick.heads));
    assert(rolePick.roles.map(r => r.k + ':' + r.n + ':' + r.src).join('|') === 'merlin:梅林:/img/av/merlin.webp|percival:派西維爾:/img/av/percival.webp|servant:忠臣:/img/av/servant.webp|assassin:刺客:/img/av/assassin.webp|mordred:莫德雷特:/img/av/mordred.webp|oberon:奧柏倫:/img/av/oberon.webp|morgana:莫甘娜:/img/av/morgana.webp', 'seven role faces are in the 角色 group');
    assert(rolePick.upload && rolePick.beasts.includes('fox') && rolePick.roles.every(r => !rolePick.beasts.includes(r.k)), 'photo upload and animal faces stay, roles are not mixed in');
    // entrance preview anchored on own avatar; locked items do not equip
    await cdp.eval(`(() => {
      window.__puts = 0; const orig = window.fetch;
      window.fetch = function(url, opt) { if (String(url).includes('/api/me') && opt && String(opt.method).toUpperCase() === 'PUT') window.__puts++; return orig.apply(this, arguments); };
      const sheet = document.querySelector('#sheet'); sheet.dataset.keep = 'stay';
      const body = document.querySelector('.pe-body'); body.style.maxHeight = '140px'; body.scrollTop = 60;
      window.__scroll = body.scrollTop; window.__href = location.href;
    })()`);
    const beforeOpen = await cdp.eval(`(() => { const w = document.querySelector('.pe-av .av-wrap'); return { cls: w.className, audio: !!document.querySelector('audio,video'), pov: !!document.querySelector('.pe-av .pov'), img: !!document.querySelector('.pe-av .av img') }; })()`);
    assert(beforeOpen.img && beforeOpen.pov && !/fx-/.test(beforeOpen.cls) && !beforeOpen.audio, 'editor shows own avatar and pendant with no autoplayed effect');
    await cdp.eval(`document.querySelector('.pe-tabs [data-t="fx"]').click()`);
    await cdp.eval(`(() => { const body = document.querySelector('.pe-body'); body.style.maxHeight = '140px'; const max = Math.max(0, body.scrollHeight - body.clientHeight); body.scrollTop = Math.min(40, max); })()`);
    const keys = ['snow', 'howl', 'spark', 'petals', 'fire', 'lightning', 'gold', 'spot', 'none'];
    for (const k of keys) {
      const scrollBefore = await cdp.eval(`document.querySelector('.pe-body').scrollTop`);
      await cdp.eval(`document.querySelector('[data-fx="${k}"]').click()`);
      await sleep(30);
      const st = await cdp.eval(`(() => {
        const wrap = document.querySelector('.pe-av .av-wrap');
        const row = document.querySelector('.pe-top');
        const btn = document.querySelector('[data-fx="${k}"]');
        const av = document.querySelector('.pe-av .av').getBoundingClientRect();
        const pov = document.querySelector('.pe-av .pov').getBoundingClientRect();
        let pc = null;
        if (wrap.classList.contains('fx-${k}')) {
          const s = getComputedStyle(wrap, '::before');
          const wr = wrap.getBoundingClientRect();
          pc = { l: wr.left + (parseFloat(s.left)||0) + (parseFloat(s.marginLeft)||0), t: wr.top + (parseFloat(s.top)||0), content: s.content !== 'none' };
        }
        return {
          cls: wrap.className, row: row.className, sel: btn.classList.contains('sel'), prev: btn.classList.contains('prev'),
          off: btn.classList.contains('off'), keep: document.querySelector('#sheet').dataset.keep,
          hidden: document.querySelector('#modal').classList.contains('hidden'),
          scroll: document.querySelector('.pe-body').scrollTop, winY: window.scrollY, href: location.href,
          puts: window.__puts, stage: !!document.querySelector('.preview-stage'), audio: !!document.querySelector('audio,video'),
          imgW: av.width, povW: pov.width, pc, av: { l: av.left, t: av.top, w: av.width, h: av.height },
          sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
        };
      })()`);
      assert(st.keep === 'stay' && !st.hidden && st.href === st.href, k + ' does not reopen or navigate');
      assert(Math.abs(st.scroll - scrollBefore) < 2 && st.winY < 2, k + ' does not jump scroll');
      assert(!st.stage && st.row === 'pe-top' && !/\bfx-/.test(st.row) && !/\benter\b/.test(st.row), k + ' is not a detached or header-row preview');
      assert(st.imgW > 40 && st.povW > 40, k + ' keeps avatar and pendant visible');
      assert(st.puts === 0 && !st.audio, k + ' does not save or play sound');
      assert(st.sw <= st.cw + 1, k + ' preview does not overflow horizontally');
      if (k === 'none') assert(!/fx-/.test(st.cls), 'none clears the effect class');
      else {
        assert(st.cls.split(/\s+/).includes('fx-' + k), k + ' class is on the avatar wrap');
        if (st.pc && st.pc.content) {
          const cx = st.pc.l, cy = st.pc.t;
          const acx = st.av.l + st.av.w / 2, acy = st.av.t + st.av.h / 2;
          const dist = Math.hypot(cx - acx, cy - acy);
          const vcx = 195, vcy = 422;
          assert(dist < 90, k + ' effect anchor is on the avatar (dist ' + dist.toFixed(0) + ')');
          assert(Math.hypot(cx - vcx, cy - vcy) > 80, k + ' effect is not parked at the viewport centre');
        }
      }
      const free = ['none', 'spot', 'gold', 'snow'].includes(k);
      if (free) assert(st.sel, k + ' unlocked choice is marked to equip');
      else assert(!st.sel && st.off && st.prev, k + ' locked preview is not equipped');
    }
    await cdp.shot('fx-howl-on-avatar');
    const equipped = await cdp.eval(`document.querySelector('[data-fx].sel').dataset.fx`);
    assert(equipped === 'none', 'last unlocked choice stays equipped after a locked preview');
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp.eval(`document.querySelector('[data-fx="howl"]').click(); document.querySelector('[data-fx="snow"]').click()`);
    const rm = await cdp.eval(`(() => {
      const wrap = document.querySelector('.pe-av .av-wrap');
      const b = getComputedStyle(wrap, '::before');
      const a = getComputedStyle(wrap, '::after');
      return { cls: wrap.className, bAnim: b.animationName, aAnim: a.animationName, bOp: b.opacity, img: document.querySelector('.pe-av .av').getBoundingClientRect().width };
    })()`);
    assert(/fx-snow/.test(rm.cls) && rm.bAnim === 'none' && rm.aAnim === 'none' && rm.img > 40, 'reduced motion shows a still snow preview on the avatar');
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    const granted = await cdp.eval(`(async () => {
      const r = await fetch('/api/me', { method:'PUT', headers:{ Authorization:'Bearer '+localStorage.getItem('cc.token'), 'Content-Type':'application/json' }, body: JSON.stringify({ fx:'howl', name:'Dickson' }) });
      const j = await r.json();
      const r2 = await fetch('/api/me', { method:'PUT', headers:{ Authorization:'Bearer '+localStorage.getItem('cc.token'), 'Content-Type':'application/json' }, body: JSON.stringify({ fx:'snow', name:'Dickson' }) });
      const j2 = await r2.json();
      return { howl: j.user.fx, snow: j2.user.fx };
    })()`);
    assert(granted.howl === 'spot' && granted.snow === 'snow', 'server keeps a locked howl unequipped and accepts free snow');

    // close editor, lobby geometry
    await cdp.eval(`document.querySelector('#modal').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
    await sleep(100);
    await cdp.eval(`document.querySelector('[data-a="create"]').click()`);
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.rt .st')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);

    async function setCap(n) {
      await cdp.eval(`document.querySelector('[data-a="cfg"]').click()`);
      await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-a="cap"][data-n="${n}"]')) { clearInterval(t); r(1); } }, 30); setTimeout(() => r(0), 3000); })`);
      await cdp.eval(`document.querySelector('[data-a="cap"][data-n="${n}"]').click()`);
      await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelectorAll('.rt .st').length === ${n}) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 4000); })`);
      await cdp.eval(`(() => { const b = document.querySelector('[data-a="cfgclose"]'); if (b) b.click(); })()`);
      await sleep(80);
    }
    const measure = async () => cdp.eval(`(() => {
      const rt = document.querySelector('.rt').getBoundingClientRect();
      const card = document.querySelector('.card.tbl').getBoundingClientRect();
      const table = getComputedStyle(document.querySelector('.rt .table'));
      const emo = document.querySelector('.emote-btn');
      const ecs = getComputedStyle(emo);
      const er = emo.getBoundingClientRect();
      const center = document.querySelector('.seatcount');
      const b = center.querySelector('b');
      const small = b.querySelector('small');
      const bcs = getComputedStyle(b), scs = getComputedStyle(small), lab = getComputedStyle(center.querySelector('span'));
      const byNo = {};
      document.querySelectorAll('.rt > .no').forEach(n => { byNo[n.dataset.seat] = n; });
      const seats = [...document.querySelectorAll('.rt .st')].map(s => {
        const icon = (s.querySelector('.av') || s.querySelector('.av-empty')).getBoundingClientRect();
        const noEl = byNo[s.dataset.seat];
        const no = noEl.getBoundingClientRect();
        const nm = (s.querySelector('.nm') || s.querySelector('.st-meta')).getBoundingClientRect();
        const pills = [...s.querySelectorAll('.hostpill, .mepill')].map(el => el.getBoundingClientRect());
        const pr = pills.length ? {
          left: Math.min(...pills.map(r => r.left)), top: Math.min(...pills.map(r => r.top)),
          right: Math.max(...pills.map(r => r.right)), bottom: Math.max(...pills.map(r => r.bottom))
        } : null;
        const ncs = getComputedStyle(noEl);
        return {
          seat: s.dataset.seat,
          icon: { l:icon.left,t:icon.top,r:icon.right,b:icon.bottom,w:icon.width,h:icon.height },
          no: { l:no.left,t:no.top,r:no.right,b:no.bottom,w:no.width,h:no.height },
          nm: { l:nm.left,t:nm.top,r:nm.right,b:nm.bottom },
          pill: pr ? { l:pr.left,t:pr.top,r:pr.right,b:pr.bottom } : null,
          weight: ncs.fontWeight, size: parseFloat(ncs.fontSize), color: ncs.color
        };
      });
      const doc = document.documentElement;
      const bar = document.querySelector('.bottombar').getBoundingClientRect();
      return {
        rt: { l:rt.left,t:rt.top,r:rt.right,b:rt.bottom,w:rt.width,h:rt.height },
        card: { l:card.left,t:card.top,r:card.right,b:card.bottom,w:card.width,h:card.height },
        border: table.borderTopWidth, bg: table.backgroundImage, shadow: table.boxShadow,
        emo: { bg: ecs.backgroundColor, shadow: ecs.boxShadow, l:er.left,t:er.top,r:er.right,b:er.bottom },
        count: { text: b.childNodes[0].textContent, small: small.textContent, bSize: parseFloat(bcs.fontSize), sSize: parseFloat(scs.fontSize), bColor: bcs.color, sColor: scs.color, lab: lab.color, labText: center.querySelector('span').textContent },
        seats, sw: doc.scrollWidth, cw: doc.clientWidth, sh: doc.scrollHeight, ih: innerHeight,
        barBottom: bar.bottom + scrollY, gap: doc.scrollHeight - (bar.bottom + scrollY),
        top: !!document.querySelector('.top-room-acts:not(.hidden)'),
        rhead: (document.querySelector('.rhead') || {}).className || '',
        avoidBtns: document.querySelectorAll('[data-a="avoid"]').length,
        avoidFixed: getComputedStyle(document.querySelector('[data-a="avoid"]') || document.body).position === 'fixed' && !!document.querySelector('[data-a="avoid"]'),
        avoidInBar: !!document.querySelector('.bottombar > .avoid-btn')
      };
    })()`);

    async function assertBarPinned(tag) {
      const r = await cdp.eval(`(() => {
        const bar = document.querySelector('.bottombar');
        const card = document.querySelector('.cfgcard');
        const modal = document.querySelector('.modal');
        const box = (el) => { const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, w: b.width }; };
        const before = box(bar);
        window.scrollTo(0, 280);
        const mid = box(bar);
        window.scrollTo(0, document.documentElement.scrollHeight);
        const end = box(bar);
        const cardEnd = card.getBoundingClientRect().bottom;
        const doc = document.documentElement;
        const out = {
          pos: getComputedStyle(bar).position,
          pad: getComputedStyle(bar).paddingBottom,
          before, mid, end,
          ih: innerHeight, iw: innerWidth,
          cardEnd, sw: doc.scrollWidth, cw: doc.clientWidth,
          modalZ: parseFloat(getComputedStyle(modal).zIndex) || 0,
          barZ: parseFloat(getComputedStyle(bar).zIndex) || 0,
          avoid: document.querySelectorAll('.bottombar > .avoid-btn').length,
          pill: !!document.querySelector('.avoid-fab')
        };
        window.scrollTo(0, 0);
        return out;
      })()`);
      const near = (a, b, n) => Math.abs(a - b) <= n;
      assert(r.pos === 'fixed', tag + ' action bar is fixed (' + r.pos + ')');
      assert(near(r.mid.t, r.before.t, 2) && near(r.end.t, r.before.t, 2), tag + ' action bar stays put while scrolling');
      assert(near(r.before.b, r.ih, 2) && near(r.mid.b, r.ih, 2) && near(r.end.b, r.ih, 2), tag + ' action bar sits on the viewport bottom');
      assert(near(r.mid.l, r.before.l, 2) && near(r.end.w, r.before.w, 2), tag + ' action bar width stays stable');
      assert(r.before.l >= -1 && r.before.l + r.before.w <= r.iw + 1 && r.sw <= r.cw + 1, tag + ' action bar does not overflow horizontally');
      assert(r.cardEnd <= r.end.t + 1, tag + ' last lobby card clears the fixed bar (' + r.cardEnd.toFixed(0) + '/' + r.end.t.toFixed(0) + ')');
      assert(r.modalZ > r.barZ, tag + ' sheets stay above the action bar');
      assert(r.avoid === 1 && !r.pill, tag + ' compact avoid button stays in the bar');
      assert(parseFloat(r.pad) >= 10, tag + ' action bar keeps bottom padding (' + r.pad + ')');
      if (tag === 'desktop') assert(r.before.w <= 521 && near(r.before.l, (r.iw - r.before.w) / 2, 2), tag + ' action bar stays in the centred column');
    }

    for (const [w, h, tag] of [[375, 812, '375'], [390, 844, '390']]) {
      await setSize(w, h);
      await sleep(60);
      for (const n of [8, 10, 5, 12]) {
        await setCap(n);
        await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (![...document.querySelectorAll('.rt .st')].some(e => e.style.transform || e.style.transition)) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 2000); })`);
        await sleep(80);
        const m = await measure();
        assert(m.seats.length === n, tag + ' shows ' + n + ' seats');
        assert(m.border === '0px' && m.bg === 'none' && m.shadow === 'none', tag + '/' + n + ' has no gold centre disc');
        assert(m.count.small === '/' + n && Number(m.count.text) >= 1, tag + '/' + n + ' counter splits occupied and /' + n);
        assert(m.count.bSize > m.count.sSize + 8, tag + ' occupied digit is larger than /n');
        assert(m.count.labText === '已就座', '已就座 label remains');
        const bCol = m.count.bColor, sCol = m.count.sColor;
        assert(bCol !== sCol, 'occupied digit and /n are different colours');
        assert(m.emo.shadow === 'none' && !/255, 224|255, 201|ffe066|ffc928/i.test(m.emo.bg + m.emo.shadow), tag + ' emoji button is flat pale, not yellow glow');
        assert(m.sw <= m.cw + 1, tag + '/' + n + ' no horizontal overflow (' + m.sw + '/' + m.cw + ')');
        assert(m.avoidBtns === 1 && m.avoidInBar && !m.avoidFixed, tag + '/' + n + ' has one compact avoid button in the bottom bar');
        if (n === 8) await assertBarPinned(tag);
        assert(m.top && /compact/.test(m.rhead), 'sticky invite/menu and compact header stay');
        const cx = m.rt.l + m.rt.w / 2, cy = m.rt.t + m.rt.h / 2;
        let minEdge = Infinity, maxReach = 0;
        for (let i = 0; i < m.seats.length; i++) {
          const s = m.seats[i];
          const icx = s.icon.l + s.icon.w / 2, icy = s.icon.t + s.icon.h / 2;
          minEdge = Math.min(minEdge, icx - m.card.l, m.card.r - (icx), icy - m.card.t, m.card.b - icy);
          maxReach = Math.max(maxReach, Math.hypot(icx - cx, icy - cy));
          assert(s.icon.l >= -1 && s.icon.r <= w + 1 && s.icon.t >= 40, tag + '/' + n + ' seat ' + s.seat + ' icon is on screen');
          assert(s.weight === '500' || s.weight === '400', tag + ' seat number is not bold (' + s.weight + ')');
          assert(s.size <= 13, tag + ' seat number is small (' + s.size + 'px)');
          assert(!hit(s.no, s.nm), tag + '/' + n + ' number ' + s.seat + ' does not cover the name');
          if (s.pill) assert(!hit(s.no, s.pill), tag + '/' + n + ' number ' + s.seat + ' does not cover a pill');
          for (let j = i + 1; j < m.seats.length; j++) {
            assert(!hit(s.icon, m.seats[j].icon), tag + '/' + n + ' icons ' + s.seat + ' and ' + m.seats[j].seat + ' do not overlap');
          }
          assert(!hit(s.icon, { l: erSafe(m.emo), t: m.emo.t, r: m.emo.r, b: m.emo.b }), tag + '/' + n + ' icon ' + s.seat + ' misses the emoji button');
        }
        const radiusRatio = maxReach / (m.rt.w / 2);
        assert(radiusRatio > 0.72, tag + '/' + n + ' ring uses the card (radius ratio ' + radiusRatio.toFixed(2) + ')');
        assert(minEdge < m.rt.w * 0.22, tag + '/' + n + ' seats sit toward the outer edge (inset ' + minEdge.toFixed(0) + 'px)');
        const ordered = [...m.seats].sort((a, b) => Number(a.seat) - Number(b.seat));
        const nc = (s) => ({ x: s.no.l + s.no.w / 2, y: s.no.t + s.no.h / 2 });
        const dists = ordered.map(s => { const p = nc(s); return Math.hypot(p.x - cx, p.y - cy); });
        const spread = Math.max(...dists) - Math.min(...dists);
        assert(spread <= 2.5, tag + '/' + n + ' numerals share one radius (spread ' + spread.toFixed(2) + 'px; ' + dists.map(d => d.toFixed(1)).join(',') + '; rt ' + m.rt.w.toFixed(0) + 'x' + m.rt.h.toFixed(0) + ')');
        const iconD = ordered.map(s => Math.hypot((s.icon.l + s.icon.w / 2) - cx, (s.icon.t + s.icon.h / 2) - cy));
        const gaps = ordered.map((s, i) => iconD[i] - dists[i]);
        const gapSpread = Math.max(...gaps) - Math.min(...gaps);
        const ratio = dists.reduce((a, b) => a + b, 0) / iconD.reduce((a, b) => a + b, 0);
        assert(gapSpread <= 2.5, tag + '/' + n + ' avatar-to-number distance is the same (spread ' + gapSpread.toFixed(2) + 'px)');
        const wantNum = n >= 12 ? 21.5 : n >= 10 ? 22 : 23.1;
        const numPx = dists.reduce((a, b) => a + b, 0) / n;
        const wantPx = wantNum / 100 * m.rt.w;
        assert(Math.abs(numPx - wantPx) <= 2.5, tag + '/' + n + ' numerals stay on the original ring (' + numPx.toFixed(1) + 'px vs ' + wantPx.toFixed(1) + ')');
        const host = ordered.find(s => s.pill) || ordered[0];
        const nameGap = host.nm.t - (host.icon.t + host.icon.h);
        assert(nameGap >= 1 && nameGap <= 6, tag + '/' + n + ' name sits ' + nameGap.toFixed(1) + 'px under the avatar');
        if (host.pill) {
          const pillGap = host.pill.t - host.nm.b;
          assert(pillGap >= 0 && pillGap <= 5, tag + '/' + n + ' pills sit ' + pillGap.toFixed(1) + 'px under the name');
        }
        assert(m.count.bSize >= 22 && m.count.bSize <= 27 && m.count.sSize <= 14 && m.count.bSize > m.count.sSize + 8, tag + ' centre count is smaller but the occupied digit stays larger (' + m.count.bSize + '/' + m.count.sSize + ')');
        const ang = (s) => { const p = nc(s); return Math.atan2(p.y - cy, p.x - cx); };
        const norm = (d) => { while (d <= -Math.PI) d += Math.PI * 2; while (d > Math.PI) d -= Math.PI * 2; return d; };
        const step = Math.PI * 2 / n;
        for (let i = 0; i < n; i++) {
          const d = norm(ang(ordered[(i + 1) % n]) - ang(ordered[i]));
          assert(Math.abs(d - step) < 0.09, tag + '/' + n + ' seat ' + ordered[i].seat + ' angle step ' + d.toFixed(3));
          assert(!hit(ordered[i].no, ordered[i].icon), tag + '/' + n + ' number ' + ordered[i].seat + ' does not cover its avatar');
          const nmOver = Math.max(0, m.card.l - ordered[i].nm.l, ordered[i].nm.r - m.card.r, ordered[i].nm.b - m.card.b);
          assert(nmOver <= 14, tag + '/' + n + ' name ' + ordered[i].seat + ' stays in the card (over ' + nmOver.toFixed(1) + 'px)');
        }
        if (n % 2 === 0) {
          for (let i = 0; i < n / 2; i++) {
            const a = nc(ordered[i]), b = nc(ordered[i + n / 2]);
            const mid = Math.hypot((a.x + b.x) / 2 - cx, (a.y + b.y) / 2 - cy);
            assert(mid <= 2, tag + '/' + n + ' seats ' + ordered[i].seat + '/' + ordered[i + n / 2].seat + ' mirror through centre (' + mid.toFixed(2) + 'px)');
          }
        }
        if (n === 8) {
          const p = Object.fromEntries(ordered.map(s => [s.seat, nc(s)]));
          assert(p[1].y < cy - 8 && p[5].y > cy + 8 && Math.abs(p[1].x - cx) < 6 && Math.abs(p[5].x - cx) < 6, tag + ' 1 is top and 5 is bottom');
          assert(p[3].x > cx + 8 && p[7].x < cx - 8 && Math.abs(p[3].y - cy) < 6 && Math.abs(p[7].y - cy) < 6, tag + ' 3 is right and 7 is left');
          assert(Math.abs(p[2].y - p[8].y) < 3 && Math.abs((p[2].x + p[8].x) / 2 - cx) < 3, tag + ' 2 and 8 are symmetric');
          assert(Math.abs(p[4].y - p[6].y) < 3 && Math.abs((p[4].x + p[6].x) / 2 - cx) < 3, tag + ' 4 and 6 are symmetric');
          assert(Math.abs(dists[0] - dists[2]) <= 2 && Math.abs(dists[0] - dists[4]) <= 2, tag + ' 1, 3 and 5 are the same distance from centre');
        }
        if (n === 8 && tag === '375') await cdp.shot('lobby-after-375');
        if (n === 8 && tag === '390') await cdp.shot('lobby-after-390');
        if (n === 10 && tag === '390') await cdp.shot('lobby-after-10-390');
        if (n === 12 && tag === '375') await cdp.shot('lobby-after-12-375');
      }
    }

    // t140: numbers stay on the physical seats when occupants move. 10-seat room, self 1→9→6,
    // then a second player moves. Angles come from the clockwise index (seat 1 at the top),
    // not from a hardcoded screen side for seat 9 or 6.
    await setSize(375, 812);
    await setCap(10);
    const settled = () => cdp.eval(`new Promise(r => { const t = setInterval(() => { if (![...document.querySelectorAll('.rt .st')].some(e => e.style.transform || e.style.transition)) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 2500); })`);
    const ringExpr = `(() => {
      const rt = document.querySelector('.rt').getBoundingClientRect();
      const nums = [...document.querySelectorAll('.rt > .no')].map(n => {
        const r = n.getBoundingClientRect();
        return { seat: n.dataset.seat, label: n.textContent.trim(), x: r.left + r.width / 2, y: r.top + r.height / 2, inside: !!n.closest('.st'), moved: !!n.style.transform };
      });
      const host = document.querySelector('.rt .hostpill');
      const seat = host ? host.closest('.st') : null;
      const icon = seat && (seat.querySelector('.av') || seat.querySelector('.av-empty'));
      const ir = icon ? icon.getBoundingClientRect() : null;
      return {
        cx: rt.left + rt.width / 2, cy: rt.top + rt.height / 2,
        head: (document.querySelector('.rhead') || {}).textContent || '',
        hostSeat: seat ? seat.dataset.seat : '',
        hostName: seat ? (seat.querySelector('.nm') || {}).textContent || '' : '',
        icon: ir ? { x: ir.left + ir.width / 2, y: ir.top + ir.height / 2 } : null,
        nums
      };
    })()`;
    await settled();
    await sleep(80);
    const ring = await cdp.eval(ringExpr);
    assert(ring.nums.length === 10 && ring.nums.every(n => !n.inside && !n.moved && n.label === n.seat), 'numbers are fixed labels on the table, not inside a seat');
    const canon = (seat, count) => (-90 + (seat - 1) * 360 / count) * Math.PI / 180;
    const norm = (d) => { while (d <= -Math.PI) d += Math.PI * 2; while (d > Math.PI) d -= Math.PI * 2; return d; };
    const seen = (snap, label) => {
      assert(snap.nums.length === ring.nums.length, label + ' still has every seat number');
      for (const n of snap.nums) {
        const was = ring.nums.find(w => w.seat === n.seat);
        assert(was && n.label === was.label, label + ' label ' + n.seat + ' stayed ' + (was && was.label));
        assert(Math.hypot(n.x - was.x, n.y - was.y) <= 1.5, label + ' number ' + n.seat + ' stayed put (' + Math.hypot(n.x - was.x, n.y - was.y).toFixed(2) + 'px)');
        const ang = Math.atan2(n.y - snap.cy, n.x - snap.cx);
        assert(Math.abs(norm(ang - canon(Number(n.seat), 10))) < 0.12, label + ' number ' + n.seat + ' is on its canonical angle');
      }
      const one = snap.nums.find(n => n.seat === '1');
      assert(one && one.y < snap.cy - 8 && Math.abs(one.x - snap.cx) < 8, label + ' number 1 is still at the top');
    };
    const atSeat = (snap, seat, who) => {
      assert(snap.hostSeat === String(seat), who + ' own-seat indicator is seat ' + seat + ' (got ' + snap.hostSeat + ')');
      assert(snap.head.includes(seat + '號座'), who + ' header shows ' + seat + '號座');
      const ang = Math.atan2(snap.icon.y - snap.cy, snap.icon.x - snap.cx);
      assert(Math.abs(norm(ang - canon(seat, 10))) < 0.15, who + ' avatar is on canonical seat ' + seat);
    };
    seen(ring, 'start');
    atSeat(ring, 1, 'host');
    const sit = async (seat) => {
      const ok = await cdp.eval(`(() => { const el = document.querySelector('.rt .st.empty[data-seat="${seat}"]'); if (!el) return 0; el.click(); return 1; })()`);
      assert(ok, 'clicked empty seat ' + seat);
      const shown = await cdp.eval(`new Promise(r => { const t = setInterval(() => { const h = document.querySelector('.rhead'); if (h && h.textContent.includes('${seat}號座')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 4000); })`);
      assert(shown, 'header updated to seat ' + seat);
      await settled();
      await sleep(80);
    };
    await sit(9);
    const at9 = await cdp.eval(ringExpr);
    seen(at9, 'after 1→9');
    atSeat(at9, 9, 'host');
    await sit(6);
    const at6 = await cdp.eval(ringExpr);
    seen(at6, 'after 9→6');
    atSeat(at6, 6, 'host');
    const { io } = require('socket.io-client');
    const code = await cdp.eval(`document.querySelector('.top-code').textContent.trim()`);
    const bot = io(APP, { transports: ['websocket'], forceNew: true });
    const bst = { st: null };
    bot.on('state', st => { bst.st = st; });
    const bemit = (e, d) => new Promise(r => bot.emit(e, d, r));
    await new Promise(r => bot.on('connect', r));
    await bemit('hello', { pid: 'mvB' + Math.random().toString(36).slice(2, 7), name: '乙座' });
    await bemit('join', { code });
    assert((await bemit('act', { type: 'sit', data: { seat: 3 } })).ok, 'second player sits seat 3');
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { if ([...document.querySelectorAll('.rt .nm')].some(n => n.textContent === '乙座')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 4000); })`);
    await settled();
    await sleep(80);
    const withB = await cdp.eval(ringExpr);
    seen(withB, 'second player seated');
    atSeat(withB, 6, 'host');
    assert((await cdp.eval(`document.querySelector('.rt .st[data-seat="3"] .nm').textContent`)) === '乙座', 'second player avatar is on seat 3');
    assert((await bemit('act', { type: 'sit', data: { seat: 8 } })).ok, 'second player moves to seat 8');
    await cdp.eval(`new Promise(r => { const t = setInterval(() => { const s = document.querySelector('.rt .st[data-seat="8"] .nm'); if (s && s.textContent === '乙座') { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 4000); })`);
    await settled();
    await sleep(80);
    const movedB = await cdp.eval(ringExpr);
    seen(movedB, 'second player moved');
    atSeat(movedB, 6, 'host');
    assert((await cdp.eval(`document.querySelector('.rt .st[data-seat="8"] .nm').textContent`)) === '乙座', 'second player avatar arrived on seat 8');
    assert((await cdp.eval(`document.querySelector('.rt .st[data-seat="3"] .nm').textContent`)) === '空位', 'seat 3 is empty again');
    const merlinFace = await cdp.eval(`(async () => {
      const st = document.querySelector('.rt .st[data-seat="6"]');
      const avSize = Math.round(parseFloat(getComputedStyle(st).getPropertyValue('--av')) || 58);
      st.querySelector('.av-wrap').outerHTML = window.__av.av({ pendant: 'icesword', avatar: 'merlin', bg: '#bcd6ff', name: st.querySelector('.nm').textContent }, avSize);
      const img = st.querySelector('.av img');
      await img.decode().catch(() => 0);
      const palEl = st.querySelector('.pd-pal');
      palEl.style.animation = 'none';
      palEl.style.transform = 'none';
      const face = st.querySelector('.av').getBoundingClientRect();
      const pal = palEl.getBoundingClientRect();
      const no = document.querySelector('.rt > .no[data-seat="6"]').getBoundingClientRect();
      const nm = st.querySelector('.nm').getBoundingClientRect();
      const overlap = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const cy = face.top + face.height / 2;
      let onFace = 0;
      const node = palEl.querySelector('image');
      const href = node && node.getAttribute('href');
      if (href) {
        const im = new Image();
        im.src = href;
        await im.decode();
        const sc = 2;
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(pal.width * sc));
        c.height = Math.max(1, Math.round(pal.height * sc));
        const g = c.getContext('2d');
        g.drawImage(im, 0, 0, c.width, c.height);
        const data = g.getImageData(0, 0, c.width, c.height).data;
        const cx = face.left + face.width / 2, rad = face.width / 2 - 1;
        for (let y = 0; y < c.height && !onFace; y += 2) for (let x = 0; x < c.width; x += 2) {
          if (data[(y * c.width + x) * 4 + 3] < 28) continue;
          const sx = pal.left + x / sc, sy = pal.top + y / sc;
          if ((sx - cx) * (sx - cx) + (sy - cy) * (sy - cy) < rad * rad) onFace++;
        }
      }
      return {
        src: img.getAttribute('src'), pal: st.querySelector('.pd-pal').dataset.pal,
        no: document.querySelector('.rt > .no[data-seat="6"]').textContent,
        topLeft: pal.left < face.left + face.width * 0.45 && pal.top < cy,
        onFace,
        onNo: overlap(pal, no), onName: overlap(pal, nm),
      };
    })()`);
    assert(merlinFace.src === '/img/av/merlin.webp' && merlinFace.pal === 'sword' && merlinFace.no === '6', 'lobby seat renders the Merlin face with the sword charm ' + JSON.stringify(merlinFace));
    assert(merlinFace.topLeft && !merlinFace.onFace && !merlinFace.onNo && !merlinFace.onName, 'charm stays top-left of Merlin and the seat number stays clear ' + JSON.stringify(merlinFace));
    bot.close();
    await setSize(1280, 800);
    await sleep(80);
    await assertBarPinned('desktop');
    console.log('ALL UI LAYOUT CHECKS PASSED');
  } finally {
    chrome.kill('SIGKILL');
    srv.kill('SIGKILL');
  }
})().catch(e => { console.error(e); process.exit(1); });

function erSafe(e) { return e.l; }
