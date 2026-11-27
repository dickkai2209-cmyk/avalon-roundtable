// Rules sections page vertically. Scrolling down advances a page; scrolling up returns.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 37000 + (process.pid % 800);
const CDP_PORT = 47000 + (process.pid % 800);
const APP = 'http://127.0.0.1:' + PORT + '/';
const ROOT = path.join(__dirname, '..');
const DATA = '/tmp/av-rules-' + process.pid;
const OUT = process.env.OUT || '/tmp/av-rules-shots-' + process.pid;
const ART = '/opt/cursor/artifacts';
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map();
    this.ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    });
  }
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
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(OUT, name + '.png'), buf);
    fs.writeFileSync(path.join(ART, name + '.png'), buf);
    return path.join(ART, name + '.png');
  }
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const chrome = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=/tmp/chrome-rules-' + process.pid, 'about:blank',
  ], { stdio: 'ignore' });
  const stop = () => { try { srv.kill('SIGKILL'); } catch (e) {} try { chrome.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', stop);
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('server')), 8000);
      srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
    });
    let page;
    for (let i = 0; i < 40 && !page; i++) {
      try { page = JSON.parse(await get('http://127.0.0.1:' + CDP_PORT + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(150); }
    }
    if (!page) throw new Error('no chrome page');
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    try { await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }); } catch (e) {}
    const setSize = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    let safeArea = false;
    try {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, left: 0, bottom: 34, right: 0 } });
      safeArea = true;
    } catch (e) { console.log('safe-area override unavailable: ' + e.message); }

    const openRules = async () => {
      await cdp.send('Page.navigate', { url: APP });
      const ready = await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('[data-a="go"][data-v="rules"]')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
      assert(ready === 1, 'home is ready');
      await cdp.eval(`document.querySelector('[data-a="go"][data-v="rules"]').click()`);
      const shown = await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('.rules-pager') && document.querySelector('.rules table')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
      assert(shown === 1, 'rules pager is mounted');
      await sleep(80);
    };
    const table = () => cdp.eval(`(() => {
      const tb = document.querySelector('.rules-page[data-tab="overview"] table');
      const rows = [...tb.rows].map(r => [...r.cells].map(c => c.textContent.trim()));
      const box = tb.getBoundingClientRect();
      const shell = document.querySelector('.rules-shell').getBoundingClientRect();
      const bar = document.querySelector('.topbar').getBoundingClientRect();
      const doc = document.documentElement;
      const pages = [...document.querySelectorAll('.rules-page')];
      const pager = document.querySelector('.rules-pager');
      const ph = pager.clientHeight;
      return {
        rows,
        table: { l: box.left, r: box.right, t: box.top, b: box.bottom, w: box.width },
        shell: { t: shell.top, b: shell.bottom, l: shell.left, r: shell.right, w: shell.width },
        bar: { b: bar.bottom, t: bar.top },
        sw: doc.scrollWidth, cw: doc.clientWidth, ih: innerHeight, iw: innerWidth,
        bodyOverflow: getComputedStyle(document.body).overflowY,
        pages: pages.length,
        pageH: pages.map(p => Math.round(p.getBoundingClientRect().height)),
        ph,
        docTop: document.scrollingElement.scrollTop,
        tab: document.querySelector('.rules-shell .tabs button.sel')?.textContent || '',
      };
    })()`);
    const visibleTab = () => cdp.eval(`(() => {
      const mid = innerHeight / 2;
      const hit = [...document.querySelectorAll('.rules-page')].find(p => { const r = p.getBoundingClientRect(); return r.top < mid && r.bottom > mid; });
      return { tab: hit ? hit.dataset.tab : '', page: hit ? hit.dataset.page : '', top: hit ? Math.round(hit.getBoundingClientRect().top) : null, scroll: document.querySelector('.rules-pager').scrollTop, doc: document.scrollingElement.scrollTop };
    })()`);
    const wheel = async (dy) => {
      const pt = await cdp.eval(`(() => { const r = document.querySelector('.rules-pager').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(180, r.height / 2) }; })()`);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY: dy });
    };
    const waitTab = async (tab) => {
      const v = await cdp.eval(`new Promise(r => { const t0 = Date.now(); const tick = () => { const mid = innerHeight / 2; const hit = [...document.querySelectorAll('.rules-page')].find(p => { const b = p.getBoundingClientRect(); return b.top < mid && b.bottom > mid; }); if (hit && hit.dataset.tab === ${JSON.stringify(tab)}) return r(hit.dataset.tab); if (Date.now() - t0 > 2500) return r(hit ? hit.dataset.tab : ''); requestAnimationFrame(tick); }; tick(); })`);
      return v;
    };

    await setSize(375, 812);
    await openRules();
    let info = await table();
    assert(info.rows[0].join(',') === '人數,5,6,7,8,9,10,11,12', '375 headers ' + info.rows[0].join(','));
    assert(info.rows[1].join(',') === '好人,3,4,4,5,6,6,7,7', '375 good row is 7 at 12 players');
    assert(info.rows[2].join(',') === '壞人,2,2,3,3,3,4,4,5', '375 evil row unchanged');
    for (let i = 1; i < info.rows[0].length; i++) {
      const sum = Number(info.rows[1][i]) + Number(info.rows[2][i]);
      assert(sum === Number(info.rows[0][i]), '375 ' + info.rows[0][i] + ' players add up (' + sum + ')');
    }
    assert(info.pages === 8, 'eight rule pages');
    assert(info.pageH.every(h => Math.abs(h - info.ph) <= 2), 'each page is one pager viewport ' + info.pageH.join(',') + ' vs ' + info.ph);
    assert(info.table.l >= info.shell.l - 1 && info.table.r <= info.shell.r + 1, '375 table stays inside the rules shell');
    assert(info.table.r - info.table.l > 200 && info.rows[0].includes('12'), '375 table shows the 12 column');
    assert(info.sw <= info.cw + 1, '375 rules do not overflow horizontally');
    assert(info.shell.t + 0.5 >= info.bar.b - 1, '375 rules start below the top bar (' + info.shell.t + ' / ' + info.bar.b + ')');
    assert(info.shell.b <= info.ih + 1, '375 rules stay inside the viewport');
    assert(info.bodyOverflow === 'hidden', '375 rules lock document scroll');
    assert(info.tab === '概覽', 'opens on 概覽');
    await cdp.shot('rules-table-375');

    await wheel(140);
    let landed = await waitTab('sides');
    assert(landed === 'sides', '375 wheel down advances to 陣營, got ' + landed);
    let vis = await visibleTab();
    assert(vis.doc === 0, '375 paging does not scroll the document');
    await sleep(700);
    await cdp.shot('rules-next-375');
    await wheel(-140);
    landed = await waitTab('overview');
    assert(landed === 'overview', '375 wheel up returns to 概覽, got ' + landed);
    await sleep(400);

    await cdp.eval(`document.querySelector('.rules-shell .tabs button[data-v="quest"]').click()`);
    landed = await waitTab('quest');
    assert(landed === 'quest', '375 tab still jumps to 任務');
    await cdp.eval(`document.querySelector('#backBtn').click()`);
    const home = await cdp.eval(`new Promise(r => { const t = setInterval(() => { if (!document.querySelector('.rules-shell') && document.querySelector('[data-a="go"][data-v="rules"]')) { clearInterval(t); r(getComputedStyle(document.body).overflowY); } }, 40); setTimeout(() => r('timeout'), 4000); })`);
    assert(home !== 'hidden' && home !== 'timeout', 'leaving rules restores document scroll (' + home + ')');
    const scrolled = await cdp.eval(`(() => { const before = document.scrollingElement.scrollTop; window.scrollTo(0, 240); const after = document.scrollingElement.scrollTop; window.scrollTo(0, 0); return { before, after, h: document.scrollingElement.scrollHeight, ih: innerHeight }; })()`);
    assert(scrolled.after > scrolled.before, 'home still scrolls (' + scrolled.before + ' → ' + scrolled.after + ')');

    await setSize(390, 844);
    await openRules();
    info = await table();
    assert(info.rows[1].join(',') === '好人,3,4,4,5,6,6,7,7', '390 good row is 7 at 12 players');
    assert(info.rows[2][8] === '5' && Number(info.rows[1][8]) + Number(info.rows[2][8]) === 12, '390 twelve players are 7 + 5');
    assert(info.sw <= info.cw + 1, '390 rules do not overflow horizontally');
    assert(info.shell.t + 0.5 >= info.bar.b - 1, '390 rules start below the top bar');
    assert(info.shell.b <= info.ih + 1, '390 rules respect the bottom edge');
    assert(info.pageH.every(h => Math.abs(h - info.ph) <= 2), '390 each page fills the pager');
    await cdp.shot('rules-table-390');
    const swipe = await cdp.eval(`(() => {
      const pager = document.querySelector('.rules-pager');
      const r = pager.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.55, h: r.height };
    })()`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: swipe.x, y: swipe.y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: swipe.x, y: swipe.y - i * 18 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: swipe.x, y: swipe.y - 144 }] });
    landed = await waitTab('sides');
    assert(landed === 'sides', '390 swipe down advances to 陣營, got ' + landed);
    await sleep(700);
    await cdp.shot('rules-next-390');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: swipe.x, y: swipe.y - 80 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: swipe.x, y: swipe.y - 80 + i * 18 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: swipe.x, y: swipe.y - 80 + 144 }] });
    landed = await waitTab('overview');
    assert(landed === 'overview', '390 swipe up returns to 概覽, got ' + landed);
    console.log('safe-area override ' + (safeArea ? 'applied' : 'not available'));
    console.log('RULES PAGER TESTS PASSED');
    process.exit(0);
  } finally {
    stop();
  }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
