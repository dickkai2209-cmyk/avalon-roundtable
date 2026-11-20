// After a game ends, the host's next-round control stays on screen above the
// iPhone home indicator. A non-host only sees that the host will start it.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3479;
const CDP = 9499;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/next-game-' + Date.now();
const OUT = '/opt/cursor/artifacts';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function get(url) {
  return new Promise((resolve, reject) => http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject));
}
function bot(key, name) {
  const s = io(APP, { transports: ['websocket'], forceNew: true, query: { diff: '1' } });
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
    const h = await c.emit('hello', { guestKey: key, name });
    if (!h || h.error) rej(new Error(h && h.error || 'hello')); else res(h);
  }));
  return c;
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', GM_EMAIL: '', GM_USER_ID: '', HOST_AWAY_MS: '600000' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let chrome;
  const crowd = [];
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });

  async function people(n, tag) {
    const names = ['Dickson', 'iFo', 'Howard', 'Ada', 'Bea', 'Cid', 'Dan', 'Eve', 'Fay', 'Gus'];
    const out = [];
    for (let i = 0; i < n; i++) {
      const guestKey = tag + i + Date.now().toString(36);
      const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#fff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
      out.push({ ...j, guestKey, name: names[i] });
    }
    const bots = out.map(p => bot(p.guestKey, p.name));
    crowd.push(...bots);
    await Promise.all(bots.map(b => b.ready));
    const made = await bots[0].emit('create', {});
    for (let i = 0; i < 40 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
    if (!(await bots[0].act('capacity', { n })).ok) throw new Error('capacity');
    for (let i = 1; i < n; i++) {
      await bots[i].emit('join', { code: made.room });
      if (!(await bots[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit ' + (i + 1));
    }
    if (!(await bots[0].act('start')).ok) throw new Error('start');
    for (let i = 0; i < 50 && !(bots[0].st.game && bots[0].st.game.me); i++) await sleep(40);
    return { bots, people: out };
  }
  async function until(bots, pred, label) {
    for (let i = 0; i < 80; i++) { if (pred()) return; await sleep(40); }
    throw new Error('timeout ' + label + ' ' + (bots[0].st.game && bots[0].st.game.phase));
  }
  async function finish(bots) {
    const gme = () => bots[0].st.game;
    while (gme().phase !== 'end') {
      const g = gme();
      if (g.phase === 'lady') {
        const holder = bots.find(b => b.st.meId === g.ladyId);
        const target = g.seats.find(s => s.id !== g.ladyId && !(g.ladyUsed || []).includes(s.id));
        if (!(await holder.act('lady', { id: target.id })).ok) throw new Error('lady');
        await until(bots, () => gme().phase !== 'lady', 'after lady');
        continue;
      }
      if (g.phase === 'assassin') {
        const assassin = bots.find(b => b.st.game.me.role === 'assassin');
        const merlin = bots.find(b => b.st.game.me.role === 'merlin');
        if (!(await assassin.act('assassinate', { id: merlin.st.meId })).ok) throw new Error('stab');
        await until(bots, () => gme().phase === 'end', 'assassin end');
        continue;
      }
      if (g.phase !== 'team') throw new Error('unexpected ' + g.phase);
      const evil = new Set(bots.filter(b => b.st.game.me.side === 'evil').map(b => b.st.meId));
      const need = g.teamSizes[g.round];
      const ids = g.seats.map(s => s.id);
      const team = [g.leaderId];
      const evilOther = ids.find(id => evil.has(id) && id !== g.leaderId);
      if (evilOther && !evil.has(g.leaderId)) team.push(evilOther);
      for (const id of ids) { if (team.length >= need) break; if (!team.includes(id)) team.push(id); }
      const leader = bots.find(b => b.st.meId === g.leaderId);
      if (!(await leader.act('propose', { team })).ok) throw new Error('propose');
      await until(bots, () => gme().phase === 'vote', 'vote');
      for (const b of bots) {
        const r = await b.act('vote', { approve: true });
        if (!r.ok && !(r.error && /已經/.test(r.error))) throw new Error('vote ' + (r.error || ''));
      }
      await until(bots, () => gme().phase === 'quest', 'quest');
      let failed = false;
      for (const b of bots) {
        if (!(gme().team || []).includes(b.st.meId)) continue;
        const success = !(evil.has(b.st.meId) && !failed);
        if (!success) failed = true;
        if (!(await b.act('quest', { success })).ok) throw new Error('quest');
      }
      await until(bots, () => gme().phase !== 'quest', 'after quest');
    }
    assert(bots[0].st.isHost && bots.every((b, i) => i === 0 || !b.st.isHost), 'only the room creator is the host at the end');
    assert(bots.every(b => b.st.game.phase === 'end' && b.st.mySeat), 'every seated player is still in the finished game');
  }

  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-next-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 20000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  const SAFE = { 375: { top: 50, bottom: 34 }, 390: { top: 47, bottom: 34 } };
  let viewW = 375;
  async function setSize(w, h) {
    viewW = w;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    const safe = SAFE[w];
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safe.top, left: 0, bottom: safe.bottom, right: 0 } }).catch(() => {});
    await forceSafe();
  }
  async function forceSafe() {
    const safe = SAFE[viewW];
    return evalj(`(() => {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:-999px;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
      document.body.appendChild(el);
      const t = parseFloat(getComputedStyle(el).paddingTop) || 0;
      const b = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      el.remove();
      let s = document.getElementById('safe-test');
      if (t >= ${safe.top} - 0.5 && b >= ${safe.bottom} - 0.5) { if (s) s.textContent = ''; return 'env'; }
      if (!s) { s = document.createElement('style'); s.id = 'safe-test'; document.head.appendChild(s); }
      s.textContent = ${JSON.stringify('.topbar{padding-top:' + safe.top + 'px !important}.end-next{padding-bottom:calc(6px + ' + safe.bottom + 'px) !important}')};
      return 'inject';
    })()`);
  }
  async function asUser(person) {
    const profile = JSON.stringify({ name: person.name, avatar: 'fox', bg: '#fff', fx: 'spot', pendant: 'none' });
    for (let attempt = 0; attempt < 3; attempt++) {
      for (let i = 0; i < 30; i++) { if (await evalj(`!!document.querySelector('[data-a="create"], .rt, .endsum')`).catch(() => false)) break; await sleep(80); }
      await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.guest', ${JSON.stringify(person.guestKey)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + '?n=' + person.user.id + attempt + Date.now())})`);
      for (let i = 0; i < 50; i++) { if (await evalj(`!!document.querySelector('.endsum, [data-a="start"])`).catch(() => false)) break; await sleep(100); }
      if (await evalj(`!!document.querySelector('.endsum, [data-a="start"])`).catch(() => false)) break;
    }
    for (let i = 0; i < 8; i++) {
      const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`).catch(() => false);
      if (!open) break;
      await evalj(`(() => { const b = document.querySelector('#settle-ok') || document.querySelector('#settle-x') || document.querySelector('#modal #ok') || document.querySelector('#modal .btn'); if (b) b.click(); })()`);
      await sleep(120);
    }
    await forceSafe();
  }
  async function shot(name) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
  }
  async function dock(expect) {
    const safe = SAFE[viewW].bottom;
    await evalj(`window.scrollTo(0, 0)`);
    const top = await evalj(`(() => {
      const btn = document.querySelector('[data-a="lobby"]');
      const wait = document.querySelector('.end-wait');
      const dock = document.querySelector('.end-next');
      const bar = document.querySelector('.topbar').getBoundingClientRect();
      const nodeOf = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2);
        const y = Math.round(r.top + Math.min(r.height / 2, 22));
        const hit = document.elementFromPoint(x, y);
        return {
          t: r.top, b: r.bottom, l: r.left, r: r.right, h: r.height, w: r.width,
          text: (el.innerText || '').replace(/\\s+/g, ' ').trim(),
          hit: hit ? (hit.getAttribute('data-a') || hit.className || hit.tagName) : null,
          inside: !!(hit && (el === hit || el.contains(hit))),
        };
      };
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:-999px;padding-bottom:env(safe-area-inset-bottom)';
      document.body.appendChild(probe);
      const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      return {
        ih: innerHeight, iw: innerWidth, inset, barB: bar.bottom,
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        btn: nodeOf(btn), wait: nodeOf(wait), dock: nodeOf(dock),
        lobbyN: document.querySelectorAll('[data-a="lobby"]').length,
        modal: !!(document.querySelector('#modal') && !document.querySelector('#modal').classList.contains('hidden')),
      };
    })()`);
    const limit = top.ih - Math.max(top.inset, safe);
    if (expect === 'host') {
      assert(top.lobbyN === 1 && top.btn && /再來一局/.test(top.btn.text) && !top.wait, viewW + ' host has one next-round button ' + JSON.stringify(top.btn));
      assert(top.btn.t >= top.barB - 1 && top.btn.b <= limit + 1 && top.btn.h >= 44 && top.btn.l >= 8 && top.btn.r <= top.iw - 8, viewW + ' host button is fully above the home indicator ' + JSON.stringify(top));
      assert(top.btn.inside && top.btn.hit === 'lobby', viewW + ' host button is tappable, not under the settlement or the header ' + JSON.stringify(top.btn));
    } else {
      assert(top.lobbyN === 0 && top.wait && top.wait.text === '等待房主開新一局（座位保留）', viewW + ' non-host sees only the waiting copy ' + JSON.stringify(top));
      assert(top.wait.t >= top.barB - 1 && top.wait.b <= limit + 1 && top.wait.h >= 44 && top.wait.inside, viewW + ' waiting copy is fully visible and not a button ' + JSON.stringify(top.wait));
    }
    assert(!top.modal && top.sw <= top.cw + 1 && top.inset + 0.5 >= safe, viewW + ' end screen keeps the safe area and does not overflow');
    await evalj(`(() => {
      const el = document.querySelector('.endsum');
      const bar = document.querySelector('.topbar');
      if (!el || !bar) return;
      const y = el.getBoundingClientRect().top + window.scrollY - bar.getBoundingClientRect().height;
      window.scrollTo(0, Math.max(0, y));
    })()`);
    const mid = await evalj(`(() => {
      const btn = document.querySelector('[data-a="lobby"]');
      const wait = document.querySelector('.end-wait');
      const el = btn || wait;
      const hero = document.querySelector('.endsum-hero');
      const rows = [...document.querySelectorAll('.settle-page .settle-row')];
      const last = rows[rows.length - 1];
      const r = el.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + Math.min(r.height / 2, 22));
      const hit = document.elementFromPoint(x, y);
      const lastB = last ? last.getBoundingClientRect().bottom : null;
      const heroB = hero ? hero.getBoundingClientRect() : null;
      return {
        t: r.top, b: r.bottom, inside: !!(hit && (el === hit || el.contains(hit))),
        hit: hit ? (hit.getAttribute('data-a') || hit.className || hit.tagName) : null,
        lastB, heroTop: heroB && heroB.top, n: rows.length,
        barB: document.querySelector('.topbar').getBoundingClientRect().bottom,
      };
    })()`);
    assert(mid.inside && mid.t >= mid.barB - 1, viewW + ' control stays tappable when the result is on screen ' + JSON.stringify(mid));
    if (mid.n) assert(mid.lastB <= mid.t + 1, viewW + ' the rank list is not trapped under the next-round control ' + JSON.stringify(mid));
    return top;
  }

  try {
    const five = await people(5, 'n5');
    await finish(five.bots);
    const seats5 = five.bots.map(b => b.st.meId);
    await setSize(375, 812);
    await asUser(five.people[0]);
    await dock('host');
    await setSize(390, 844);
    await dock('host');
    await setSize(375, 812);
    await asUser(five.people[1]);
    await dock('wait');
    const denied = await five.bots[1].act('lobby');
    assert(denied.error && /房主/.test(denied.error), 'a non-host cannot start the next game');
    assert(five.bots[0].st.game && five.bots[0].st.game.phase === 'end', 'the refused action leaves the finished game in place');
    await setSize(390, 844);
    await dock('wait');

    await setSize(375, 812);
    await asUser(five.people[0]);
    await evalj(`document.querySelector('[data-a="lobby"]').click()`);
    await until(five.bots, () => five.bots.every(b => b.st && !b.st.game), 'lobby');
    assert(five.bots.every((b, i) => b.st.mySeat === i + 1 && b.st.meId === seats5[i]), '5-player seats stay with the same players');
    assert(five.bots[0].st.isHost && five.bots[0].st.seated === 5 && five.bots[0].st.capacity === 5, 'the host is back in a full lobby');
    const lobby5 = await evalj(`(() => {
      const start = document.querySelector('[data-a="start"]');
      return { start: start && start.textContent, disabled: start && start.disabled, seats: document.querySelectorAll('.rt .st:not(.empty)').length, wait: !!document.querySelector('.end-wait') };
    })()`);
    assert(lobby5.seats === 5 && lobby5.start && !lobby5.disabled && !lobby5.wait && /開始遊戲/.test(lobby5.start), 'the host can start the kept-seat lobby ' + JSON.stringify(lobby5));

    const ten = await people(10, 'n10');
    await finish(ten.bots);
    const seats10 = ten.bots.map(b => b.st.meId);
    assert((ten.bots[0].st.game.ladyLog || []).length >= 1, '10-player game recorded a Lady pass');
    await setSize(375, 812);
    await asUser(ten.people[0]);
    await dock('host');
    await evalj(`(() => { const el = document.querySelector('.endsum'); const bar = document.querySelector('.topbar'); const y = el.getBoundingClientRect().top + window.scrollY - bar.getBoundingClientRect().height; window.scrollTo(0, Math.max(0, y)); })()`);
    await shot('next-game-host-375.png');
    await setSize(390, 844);
    await dock('host');
    await evalj(`(() => { const el = document.querySelector('.endsum'); const bar = document.querySelector('.topbar'); const y = el.getBoundingClientRect().top + window.scrollY - bar.getBoundingClientRect().height; window.scrollTo(0, Math.max(0, y)); })()`);
    await shot('next-game-host-390.png');
    await setSize(375, 812);
    await asUser(ten.people[4]);
    await dock('wait');
    const denied10 = await ten.bots[4].act('lobby');
    assert(denied10.error && /房主/.test(denied10.error) && ten.bots[4].st.mySeat === 5, 'seat 5 still cannot start');
    await evalj(`(() => { const el = document.querySelector('.endsum'); const bar = document.querySelector('.topbar'); const y = el.getBoundingClientRect().top + window.scrollY - bar.getBoundingClientRect().height; window.scrollTo(0, Math.max(0, y)); })()`);
    await shot('next-game-wait-375.png');
    await setSize(390, 844);
    await dock('wait');
    await shot('next-game-wait-390.png');
    await setSize(375, 812);
    await asUser(ten.people[0]);
    await evalj(`document.querySelector('[data-a="lobby"]').click()`);
    await until(ten.bots, () => ten.bots.every(b => b.st && !b.st.game), 'lobby10');
    assert(ten.bots.every((b, i) => b.st.mySeat === i + 1 && b.st.meId === seats10[i] && b.st.seated === 10), '10-player seats are kept');
    assert(ten.bots[0].st.isHost && !ten.bots[4].st.isHost, 'host does not move when the next round opens');
    const lobby10 = await evalj(`(() => { const start = document.querySelector('[data-a="start"]'); return { text: start && start.textContent, disabled: !!(start && start.disabled), seats: document.querySelectorAll('.rt .st:not(.empty)').length }; })()`);
    assert(lobby10.seats === 10 && lobby10.text && !lobby10.disabled && /開始遊戲/.test(lobby10.text), '10-player lobby is playable ' + JSON.stringify(lobby10));
    console.log('NEXT GAME TESTS PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
    crowd.forEach(b => { try { b.s.close(); } catch {} });
  }
})().catch(e => { console.error(e); process.exit(1); });
