// Phone stills of the post-game lady chain and the vote grid at 375 and 390.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { build } = require('../review');

const PORT = 3493;
const CDP = 9513;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/recap-visual-' + Date.now();
const OUTS = ['/opt/cursor/artifacts', '/tmp/recap-stills'];
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function get(url) {
  return new Promise((resolve, reject) => http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject));
}

const ROLES = ['servant', 'minion', 'percival', 'assassin', 'morgana', 'servant', 'mordred', 'servant', 'servant', 'merlin'];
const SIDE = { servant: 'good', percival: 'good', merlin: 'good', minion: 'evil', assassin: 'evil', morgana: 'evil', mordred: 'evil' };
const NAMES = ['Howard', '匪徒2餅', 'iFo', 'Akito', 'Dickson', 'kk', 'Wson', 'Serena', '騎士', 'Ryan'];
const AV = ['panda', 'fox', 'cat', 'bunny', 'hedgehog', 'bear', 'otter', 'shiba', 'koala', 'duck'];

function players() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: 'p' + (i + 1), name: NAMES[i], seat: i + 1, avatar: AV[i], bg: '#ffffff', pendant: 'none',
    role: ROLES[i], side: SIDE[ROLES[i]],
  }));
}
function votes(list, yes) {
  const v = {};
  list.forEach(p => { v[p.id] = yes.includes(p.id); });
  return v;
}
function record(extra) {
  const list = players();
  const id = (seat) => list[seat - 1].id;
  const base = {
    players: list,
    settings: { lady: true },
    winner: 'good',
    quests: [
      { success: true, fails: 0 },
      { success: false, fails: 1 },
      { success: true, fails: 0 },
      { success: true, fails: 0 },
    ],
    rounds: [
      [
        { leader: id(6), team: [id(5), id(6), id(7)], votes: votes(list, [id(1), id(5), id(6), id(7), id(10)]), approved: false, yes: 5, no: 5, attempt: 1 },
        { leader: id(7), team: [id(1), id(7), id(10)], votes: votes(list, list.map(p => p.id)), approved: true, yes: 10, no: 0, attempt: 2 },
      ],
      [
        { leader: id(8), team: [id(2), id(4), id(8), id(9)], votes: votes(list, [id(1), id(3), id(6), id(8), id(9), id(10)]), approved: true, yes: 6, no: 4, attempt: 1 },
      ],
      [
        { leader: id(9), team: [id(1), id(3), id(9), id(10)], votes: votes(list, [id(2), id(4), id(5), id(7)]), approved: false, yes: 4, no: 6, attempt: 1 },
        { leader: id(10), team: [id(3), id(6), id(8), id(10)], votes: votes(list, list.map(p => p.id)), approved: true, yes: 10, no: 0, attempt: 2 },
      ],
      [
        { leader: id(1), team: [id(1), id(3), id(5), id(6), id(10)], votes: votes(list, [id(2), id(4), id(5), id(7)]), approved: false, yes: 4, no: 6, attempt: 1 },
        { leader: id(2), team: [id(1), id(6), id(8), id(9), id(10)], votes: votes(list, list.map(p => p.id)), approved: true, yes: 10, no: 0, attempt: 2 },
      ],
    ],
    ladyStartId: id(2),
    ladyLog: [
      { round: 1, holder: id(2), target: id(10), side: 'evil' },
      { round: 2, holder: id(10), target: id(5), side: 'evil' },
    ],
  };
  return Object.assign(base, extra || {});
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  OUTS.forEach(d => fs.mkdirSync(d, { recursive: true }));
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let chrome;
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });
  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-recap-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 15000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 700)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  const SAFE = { 375: { top: 50, bottom: 34 }, 390: { top: 47, bottom: 34 } };
  async function setSize(w, h) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: SAFE[w].top, left: 0, bottom: SAFE[w].bottom, right: 0 } });
    await sleep(80);
  }
  async function shot(name) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(data, 'base64');
    for (const dir of OUTS) fs.writeFileSync(path.join(dir, name), buf);
    return buf.length;
  }
  async function frame(sel) {
    await evalj(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      const header = document.querySelector('.topbar').getBoundingClientRect().bottom;
      window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - header - 6));
    })()`);
    await sleep(60);
  }

  try {
    await setSize(390, 844);
    const ready = await evalj(`new Promise(r => { const t = setInterval(() => { if (window.__av && window.__av.reviewHtml && document.querySelector('#app')) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    if (!ready) throw new Error('app did not boot');
    const shown = build(record());
    assert(shown.cards.some(c => c.type === 'lady' && c.unused.length === 1), 'fixture has one unused lady use');
    await evalj(`document.querySelector('#app').innerHTML = window.__av.reviewHtml(${JSON.stringify(record())});
      if (!document.querySelector('.end-next')) document.body.insertAdjacentHTML('beforeend', '<div class="end-next"><button type="button" class="btn">🔁 再來一局（保留座位）</button></div>');`);
    await evalj(`Promise.all([...document.querySelectorAll('.lady-node .av img')].map(img => img.complete && img.naturalWidth ? 1 : new Promise(r => { img.onload = img.onerror = () => r(1); })))`);
    await sleep(80);

    async function measure(tag) {
      const box = await evalj(`(() => {
        const pass = document.querySelector('.lady-pass');
        const faces = [...document.querySelectorAll('.lady-node')].map(n => {
          const av = n.querySelector('.av');
          const img = n.querySelector('.av img');
          const ar = av.getBoundingClientRect();
          const ir = img.getBoundingClientRect();
          const pr = pass.getBoundingClientRect();
          return { seat: n.querySelector('.lady-no').textContent, cap: n.querySelector('.lady-cap').textContent, aw: ar.width, ah: ar.height, iw: ir.width, ih: ir.height, nw: img.naturalWidth, src: img.getAttribute('src'), clipped: ar.left < pr.left - 1 || ar.right > pr.right + 1 || ar.top < pr.top - 1 || ar.bottom > pr.bottom + 1 };
        });
        const row = document.querySelector('.vrec-row');
        const cells = [...row.querySelectorAll('.vrec-cell')].map(c => {
          const b = c.querySelector('b');
          const cr = c.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return { t: b.textContent, w: cr.width, h: cr.height, out: br.left < cr.left - 0.5 || br.right > cr.right + 0.5 || br.top < cr.top - 0.5 || br.bottom > cr.bottom + 0.5 };
        });
        const crownHits = [...document.querySelectorAll('.vrec-cell .crown')].filter(crown => {
          const b = crown.parentElement.querySelector('b');
          const kr = crown.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return kr.left < br.right - 1 && kr.right > br.left + 1 && kr.top < br.bottom - 1 && kr.bottom > br.top + 1;
        }).length;
        const doc = document.documentElement;
        const fail = [...document.querySelectorAll('.vrec-mh em.bad')].map(e => e.textContent);
        const text = document.querySelector('.lady-recap').innerText.replace(/\\s+/g, ' ');
        return {
          faces, cells: cells.length, cell0: cells[0], overflow: cells.filter(c => c.out).length, crownHits,
          sw: doc.scrollWidth, cw: doc.clientWidth,
          passScroll: pass.scrollWidth > pass.clientWidth + 1,
          camps: document.querySelectorAll('.vrec-cell .dot.good').length + ',' + document.querySelectorAll('.vrec-cell .dot.evil').length,
          fail, text,
          rows: document.querySelectorAll('.vrec-row').length
        };
      })()`);
      assert(box.faces.length === 3 && box.faces.every(f => f.aw >= 60 && f.ah >= 60 && f.iw >= 60 && f.ih >= 60 && f.nw > 20 && !f.clipped), tag + ' lady faces are large and unclipped ' + JSON.stringify(box.faces));
      assert(new Set(box.faces.map(f => f.src)).size === 3, tag + ' the three holders use different avatars');
      assert(!box.passScroll, tag + ' a three-holder chain fits without shrinking into a scroller');
      assert(box.cells === 10 && box.overflow === 0 && box.cell0.w >= 18 && box.cell0.h >= 24, tag + ' ten seat numbers stay inside their cells ' + JSON.stringify(box.cell0));
      assert(box.crownHits === 0, tag + ' crowns stay off the seat numbers');
      assert(box.sw <= box.cw + 1, tag + ' page does not overflow ' + box.sw + '/' + box.cw);
      assert(box.fail.includes('失敗 · 1 張失敗') && box.text.includes('沒用的 1次') && box.text.includes('當過湖仙的不能再被查驗：2、10、5號'), tag + ' copy is on the card');
      assert(!/[好壞]/.test(box.text), tag + ' lady card has no alignment');
      const clear = await evalj(`(() => {
        const foot = document.querySelector('.lady-foot');
        const dock = document.querySelector('.end-next');
        foot.scrollIntoView({ block: 'end' });
        const gap = dock.getBoundingClientRect().top - foot.getBoundingClientRect().bottom;
        if (gap < 4) window.scrollBy(0, 8 - gap);
        const fr = foot.getBoundingClientRect();
        const dr = dock.getBoundingClientRect();
        return { foot: fr.bottom, dock: dr.top, ok: fr.bottom <= dr.top + 1 && fr.top >= 0 };
      })()`);
      assert(clear.ok, tag + ' lady footer clears the next-round dock ' + JSON.stringify(clear));
      return box;
    }

    await setSize(375, 812);
    await frame('.lady-recap');
    const m375 = await measure('375');
    assert(m375.text.includes('開局持有') && m375.text.includes('2號驗') && m375.text.includes('10號驗'), '375 captions');
    await frame('.lady-recap');
    await shot('lady-recap-unused1-375.png');
    await frame('.vrec');
    const voteFit = await evalj(`(() => {
      const dock = document.querySelector('.end-next').getBoundingClientRect().top;
      const bits = [...document.querySelectorAll('.vrec-mh, .vrec-row')].map(el => ({ t: el.innerText.replace(/\\s+/g,' ').slice(0, 24), bottom: el.getBoundingClientRect().bottom }));
      return { dock, above: bits.filter(b => b.bottom <= dock + 1).length, all: bits.length };
    })()`);
    assert(voteFit.all >= 8 && voteFit.above >= 6, '375 vote rows are readable above the dock ' + JSON.stringify(voteFit));
    await shot('vote-recap-375.png');

    await setSize(390, 844);
    await frame('.lady-recap');
    await measure('390');
    await frame('.lady-recap');
    await shot('lady-recap-unused1-390.png');
    await frame('.vrec');
    await shot('vote-recap-390.png');

    const zero = record({
      quests: [
        { success: true, fails: 0 },
        { success: false, fails: 1 },
        { success: true, fails: 0 },
        { success: false, fails: 2 },
      ],
      ladyLog: [
        { round: 1, holder: 'p2', target: 'p10', side: 'evil' },
        { round: 2, holder: 'p10', target: 'p5', side: 'evil' },
        { round: 3, holder: 'p5', target: 'p8', side: 'good' },
      ],
    });
    await evalj(`document.querySelector('#app').innerHTML = window.__av.reviewHtml(${JSON.stringify(zero)});`);
    await evalj(`Promise.all([...document.querySelectorAll('.lady-node .av img')].map(img => img.complete && img.naturalWidth ? 1 : new Promise(r => { img.onload = img.onerror = () => r(1); })))`);
    const zeroBox = await evalj(`(() => {
      const pass = document.querySelector('.lady-pass');
      const pr = pass.getBoundingClientRect();
      const faces = [...document.querySelectorAll('.lady-node .av')].map(av => {
        const r = av.getBoundingClientRect();
        const partial = r.right > pr.left + 1 && r.left < pr.right - 1 && (r.left < pr.left - 1 || r.right > pr.right + 1);
        return { w: r.width, partial };
      });
      const text = document.querySelector('.lady-recap').innerText.replace(/\\s+/g,' ');
      return { n: faces.length, min: Math.min(...faces.map(f => f.w)), partial: faces.filter(f => f.partial).length, scroll: pass.scrollWidth > pass.clientWidth + 1, text };
    })()`);
    assert(zeroBox.n === 4 && zeroBox.min >= 60 && zeroBox.scroll && zeroBox.partial === 0, 'four holders keep full-size faces and scroll without slicing a face ' + JSON.stringify(zeroBox));
    assert(!zeroBox.text.includes('沒用的') && zeroBox.text.includes('當過湖仙的不能再被查驗：2、10、5、8號') && !/[好壞]/.test(zeroBox.text), 'unused 0 hides the unused line');
    await setSize(375, 812);
    await frame('.lady-recap');
    await shot('lady-recap-unused0-375.png');
    await setSize(390, 844);
    await frame('.lady-recap');
    await shot('lady-recap-unused0-390.png');
    console.log('RECAP VISUAL PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
  }
})().catch(e => { console.error(e); process.exit(1); });
