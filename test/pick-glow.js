// Leader pick plants a pennant and a star ring. The same mark stays through the vote.
// The vote chips show avatar, seat number and name.
// The avoid card is only on the lobby screen, never after the game starts.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3477;
const CDP = 9491;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/pick-glow-' + Date.now();
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
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', GM_EMAIL: '', GM_USER_ID: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let chrome;
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });
  const names = ['甲', '乙', '丙', '丁', '戊'];
  const people = [];
  for (let i = 0; i < 5; i++) {
    const guestKey = 'pg' + i + Date.now().toString(36);
    const pendant = i === 1 ? 'bow' : 'none';
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#fff', fx: 'spot', pendant } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i], pendant });
  }
  const bots = people.map(p => bot(p.guestKey, p.name));
  await Promise.all(bots.map(b => b.ready));
  const made = await bots[0].emit('create', {});
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  await bots[0].act('capacity', { n: 5 });
  assert((await bots[0].act('settings', { veto: true })).ok !== false, 'host can allow the avoid card');
  const code = made.room;
  for (let i = 1; i < 5; i++) {
    await bots[i].emit('join', { code });
    if (!(await bots[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit');
  }
  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-pick-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 15000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  const SAFE = { 375: { top: 50, bottom: 34 }, 390: { top: 47, bottom: 34 } };
  async function setSize(w, h) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    const safe = SAFE[w] || { top: 0, bottom: 0 };
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safe.top, left: 0, bottom: safe.bottom, right: 0 } });
  }
  async function motion(reduce) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
  }
  async function asUser(person) {
    const profile = JSON.stringify({ name: person.name, avatar: 'fox', bg: '#fff', fx: 'spot', pendant: person.pendant || 'none' });
    for (let attempt = 0; attempt < 3; attempt++) {
      for (let i = 0; i < 30; i++) { if (await evalj(`!!document.querySelector('[data-a="create"], .rt')`).catch(() => false)) break; await sleep(100); }
      await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + '?g=' + Date.now())})`);
      for (let i = 0; i < 40; i++) { if (await evalj(`!!document.querySelector('.rt')`).catch(() => false)) return; await sleep(120); }
    }
    throw new Error('no room');
  }
  async function quiet() {
    for (let i = 0; i < 6; i++) {
      const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`);
      if (!open) return;
      await evalj(`(() => { const b = document.querySelector('#modal #ok') || document.querySelector('#modal .btn'); if (b) b.click(); const x = document.querySelector('.vote-remind-x'); if (x) x.click(); })()`);
      await sleep(120);
    }
  }
  async function shot(name) { const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); }
  const overlap = (a, b) => a && b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
  async function pickView() {
    return evalj(`(() => {
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const fab = document.querySelector('.veto-fab');
      const role = document.querySelector('.myrole-fab');
      const card = document.querySelector('.rt').closest('.card');
      const seats = [...document.querySelectorAll('.rt .st[data-sid]')].map(s => {
        const av = s.querySelector('.av');
        const ar = av.getBoundingClientRect();
        const cx = ar.left + ar.width / 2, cy = ar.top + ar.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        const edge = document.elementFromPoint(cx + ar.width * 0.22, cy);
        const stars = [...s.querySelectorAll('.gstar')].map(el => {
          const b = box(el);
          const st = getComputedStyle(el);
          return { l: b.l, t: b.t, r: b.r, b: b.b, w: b.w, h: b.h, anim: st.animationName, op: parseFloat(st.opacity) };
        });
        const ring = getComputedStyle(s.querySelector('.av-wrap'), '::before');
        const avs = getComputedStyle(av);
        const crown = s.querySelector('.mark.crown');
        const pov = s.querySelector('.pov');
        const flagEl = s.querySelector('.pick-flag');
        const flag = flagEl ? box(flagEl) : null;
        const flagSvg = flagEl && flagEl.querySelector('svg');
        const cheek = document.elementFromPoint(cx + ar.width * 0.4, cy);
        const centerHit = document.elementFromPoint(cx, cy);
        const nm = s.querySelector('.nm');
        const nameBox = nm ? box(nm) : null;
        const num = document.querySelector('.rt > .no[data-seat="' + s.dataset.seat + '"]');
        const pal = s.querySelector('.pd-pal');
        let charm = null;
        if (pal) {
          const pr = pal.getBoundingClientRect();
          const wr = pal.parentElement.getBoundingClientRect();
          charm = { l: pr.left, t: pr.top, r: pr.right, b: pr.bottom, w: pr.width / wr.width, left: (pr.left - wr.left) / wr.width, top: (pr.top - wr.top) / wr.height };
        }
        return {
          seat: s.dataset.seat, gold: s.classList.contains('gold-pick'), lead: s.classList.contains('is-lead'),
          sparks: stars.length, spark: stars, cx, cy, aw: ar.width, ah: ar.height,
          face: !!(cheek && av.contains(cheek)), edge: !!(edge && av.contains(edge)),
          flag: !!flag, flagOn: !!(flagEl && centerHit && flagEl.contains(centerHit)),
          flagBox: flag, flagAnim: flagSvg ? getComputedStyle(flagSvg).animationName : '',
          shadow: avs.boxShadow, anim: avs.animationName,
          ring: ring.content, ringAnim: ring.animationName, ringBg: ring.backgroundImage || ring.backgroundColor,
          crown: crown ? box(crown) : null, pendant: !!(pov && pov.getBoundingClientRect().width > 8),
          name: (nm || {}).textContent || '', nameBox, num: num ? box(num) : null, charm
        };
      });
      const probe = document.createElement('div');
      probe.style.cssText = 'position:absolute;left:-999px;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
      document.body.appendChild(probe);
      const top = parseFloat(getComputedStyle(probe).paddingTop) || 0;
      const bottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      return {
        seats, fab: box(fab), role: box(role), card: box(card),
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        ih: innerHeight, iw: innerWidth, top, bottom,
        headerBottom: (document.querySelector('.topbar') || document.body).getBoundingClientRect().bottom,
        ladyBadge: !!document.querySelector('.lady-chain .badge'),
        labels: document.querySelectorAll('.rt .lbl').length
      };
    })()`);
  }
  function assertGold(tag, view, safe, count = 2) {
    const picked = view.seats.filter(s => s.gold);
    assert(picked.length === count, tag + ' lights the selected seats (' + picked.length + '/' + count + ')');
    assert(view.seats.filter(s => !s.gold).every(s => s.sparks === 0), tag + ' leaves the other seats plain');
    assert(view.sw <= view.cw + 1, tag + ' does not overflow');
    assert(view.top + 0.5 >= safe.top && view.bottom + 0.5 >= safe.bottom, tag + ' applies the safe area (' + view.top + '/' + view.bottom + ')');
    assert(!view.ladyBadge && view.labels === 0, tag + ' does not publish a side or a role');
    assert(!view.fab, tag + ' does not show the avoid chip while the leader is picking');
    const blockers = [view.role].filter(Boolean);
    for (const s of picked) {
      assert(s.sparks === 8 && s.flag && s.flagOn && s.face, tag + ' seat ' + s.seat + ' has a center pennant and keeps a cheek of the face clear');
      assert(s.flagBox && s.flagBox.w <= s.aw * 0.72 && s.flagBox.h <= s.ah * 0.55, tag + ' pennant stays compact (' + (s.flagBox && Math.round(s.flagBox.w)) + 'x' + (s.flagBox && Math.round(s.flagBox.h)) + ')');
      assert(s.flagBox.l >= s.cx - s.aw / 2 - 1 && s.flagBox.r <= s.cx + s.aw / 2 + 1 && s.flagBox.t >= s.cy - s.ah / 2 - 1 && s.flagBox.b <= s.cy + s.ah / 2 + 1, tag + ' pennant stays on the portrait');
      if (s.nameBox) assert(!overlap(s.flagBox, s.nameBox), tag + ' pennant does not cover the name');
      if (s.num) assert(!overlap(s.flagBox, s.num), tag + ' pennant does not cover the seat numeral');
      if (s.crown) assert(!overlap(s.flagBox, s.crown), tag + ' pennant does not cover the crown');
      if (s.charm) {
        assert(s.charm.w > 0.46 && s.charm.w < 0.58 && s.charm.top < -0.22 && s.charm.top > -0.42, tag + ' charm stays on the upper rim (' + s.charm.w.toFixed(2) + '/' + s.charm.top.toFixed(2) + ')');
        assert(s.charm.left < -0.25 || s.charm.left > 0.7, tag + ' charm stays off the middle of the face');
        assert(!overlap(s.flagBox, s.charm), tag + ' pennant does not cover the charm');
      }
      assert(s.shadow && s.shadow !== 'none' && (s.anim === 'goldhalo' || /226,\s*178,\s*58|240,\s*193,\s*74/.test(s.shadow)), tag + ' seat ' + s.seat + ' has a gold halo');
      assert(s.ring && s.ring !== 'none', tag + ' seat ' + s.seat + ' has a gold ring');
      const r = s.aw / 2;
      for (const sp of s.spark) {
        const sx = (sp.l + sp.r) / 2, sy = (sp.t + sp.b) / 2;
        const dist = Math.hypot(sx - s.cx, sy - s.cy);
        assert(dist > r + 1, tag + ' sparkle stays outside the face (' + dist.toFixed(1) + '/' + r.toFixed(1) + ')');
        assert(sp.l >= -1 && sp.r <= view.iw + 1 && sp.t >= view.top - 1 && sp.b <= view.ih - view.bottom + 1, tag + ' sparkle stays on screen');
        assert(!blockers.some(b => overlap(sp, b)), tag + ' sparkle is not under a chip');
      }
      if (s.crown) assert(!overlap(s.crown, { l: s.cx - 4, t: s.cy - 4, r: s.cx + 4, b: s.cy + 4 }), tag + ' crown stays off the face');
      for (const part of [{ l: s.cx - 2, t: s.cy - 2, r: s.cx + 2, b: s.cy + 2 }]) {
        assert(!blockers.some(b => overlap(part, b)), tag + ' face is not under a chip');
      }
    }
    assert(picked.some(s => s.pendant), tag + ' a selected pendant stays visible');
    assert(view.seats.some(s => s.lead && s.crown), tag + ' the leader crown stays readable');
  }

  try {
    await setSize(375, 812);
    await asUser(people[0]);
    await quiet();
    async function lobbyChip(tag) {
      const c = await evalj(`(() => {
        const b = document.querySelector('.bottombar .avoid-btn');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { label: b.getAttribute('aria-label') || '', w: r.width, h: r.height, l: r.left, b: r.bottom, ih: innerHeight, iw: innerWidth, img: !!b.querySelector('img') };
      })()`);
      assert(c && c.shown !== false && c.img && c.w >= 36 && c.h >= 48, tag + ' lobby shows the avoid chip');
      assert(/迴避卡|回避卡/.test(c.label), tag + ' lobby chip is the avoid card');
      assert(c.l < c.iw / 2 && c.b <= c.ih - 30, tag + ' lobby chip sits in the bottom bar');
    }
    await lobbyChip('375');
    await shot('lobby-avoid-375.png');
    await setSize(390, 844);
    await lobbyChip('390');
    await shot('lobby-avoid-390.png');
    if (!(await bots[0].act('start')).ok) throw new Error('start');
    for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.me); i++) await sleep(40);
    await setSize(375, 812);
    const leader = bots.find(b => b.st.meId === b.st.game.leaderId);
    await asUser(people[bots.indexOf(leader)]);
    await quiet();
    await evalj(`document.querySelector('main').scrollTop = 0`);
    for (const seat of [2, 3]) {
      const hit = await evalj(`(() => { const el = document.querySelector('.rt .st[data-seat="${seat}"][data-a="sel"]'); if (!el) return 0; el.click(); return 1; })()`);
      assert(hit, 'leader can select seat ' + seat);
      await sleep(40);
    }
    let view = await pickView();
    await noAvoid('leader pick 375');
    assertGold('375', view, SAFE[375]);
    assert(view.seats.filter(s => s.gold).every(s => s.anim === 'goldhalo' && s.ringAnim === 'goldspin'), '375 sparkle animates');
    await shot('pick-gold-375.png');
    await setSize(390, 844);
    await evalj(`document.querySelector('main').scrollTop = 0`);
    await sleep(40);
    view = await pickView();
    await noAvoid('leader pick 390');
    assertGold('390', view, SAFE[390]);
    await shot('pick-gold-390.png');

    await setSize(375, 812);
    await motion(true);
    await sleep(30);
    view = await pickView();
    const still = view.seats.filter(s => s.gold);
    assert(still.length === 2 && still.every(s => s.anim === 'none' && s.ringAnim === 'none' && s.flagAnim === 'none' && s.flagOn && s.face && s.spark.every(sp => sp.anim === 'none' && sp.op > 0.9) && /226,\s*178,\s*58|240,\s*193,\s*74/.test(s.shadow)), 'reduced motion keeps the pennant and a static bright ring');
    await motion(false);

    const proposed = await evalj(`(() => { const b = document.querySelector('[data-a="propose"]'); if (!b || b.disabled) return 0; b.click(); return 1; })()`);
    assert(proposed, 'the leader can submit the glowing seats');
    for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.phase === 'vote'); i++) await sleep(40);
    assert(bots[0].st.game.phase === 'vote', 'the table moves to the team vote');
    const team = bots[0].st.game.team.slice();
    const seats = bots[0].st.game.seats;
    const chosen = seats.filter(s => team.includes(s.id));
    assert(chosen.map(s => s.seat).sort().join() === '2,3', 'the vote is for seats 2 and 3');

    async function voteView() {
      await evalj(`(() => {
        const x = document.querySelector('.vote-remind-x'); if (x) x.click();
        const p = document.querySelector('.vote-panel');
        const main = document.querySelector('main');
        const fab = document.querySelector('.myrole-fab');
        if (!p || !main) return;
        p.scrollIntoView({ block: 'end' });
        const limit = (fab ? fab.getBoundingClientRect().top : main.getBoundingClientRect().bottom) - 10;
        const over = p.getBoundingClientRect().bottom - limit;
        if (over > 0) main.scrollTop += over;
      })()`);
      await sleep(60);
      return evalj(`(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const panel = document.querySelector('.vote-panel');
        const mates = [...document.querySelectorAll('.vote-panel .chip')].map(m => {
          const img = m.querySelector('.av img');
          const no = m.querySelector('.seatno');
          const face = m.querySelector('.av').getBoundingClientRect();
          const badge = no ? no.getBoundingClientRect() : null;
          const cx = face.left + face.width / 2, cy = face.top + face.height / 2;
          const hit = document.elementFromPoint(cx, cy);
          const bg = getComputedStyle(m).backgroundColor;
          return {
            text: (m.innerText || '').replace(/\\s+/g, ''),
            no: no ? no.textContent : '',
            src: img ? img.getAttribute('src') : '',
            face: !!(hit && m.querySelector('.av').contains(hit)),
            beside: !!(badge && badge.left >= face.right - 2 && badge.top < face.bottom && badge.bottom > face.top),
            light: /244,\\s*246,\\s*251|255,\\s*255,\\s*255/.test(bg),
            w: m.getBoundingClientRect().width
          };
        });
        const pr = panel.getBoundingClientRect();
        return {
          mates, votes: document.querySelectorAll('.vote-panel [data-a="vote"]').length,
          vetoBtn: !!document.querySelector('.vote-panel [data-a="veto"]'),
          fab: !!document.querySelector('.veto-fab'),
          avoid: !!document.querySelector('.avoid-btn'),
          vetoImg: !!document.querySelector('img[src*="veto"]'),
          text: panel.innerText.replace(/\\s+/g, ' '),
          sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
          ih: innerHeight, iw: innerWidth,
          panel: { t: pr.top, b: pr.bottom, l: pr.left, r: pr.right },
          afterTable: !!(document.querySelector('.rt').compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING),
          ladyBadge: !!document.querySelector('.lady-chain .badge'),
          labels: document.querySelectorAll('.rt .lbl').length,
          ballots: document.body.innerText.includes('贊成') && !document.body.innerText.includes('已投「')
        };
      })()`);
    }
    function assertVote(tag, v, safeBottom) {
      assert(v.afterTable && v.mates.length === chosen.length, tag + ' lists the proposed team under the table');
      assert(v.sw <= v.cw + 1, tag + ' vote does not overflow');
      assert(v.panel.l >= -1 && v.panel.r <= v.iw + 1 && v.panel.b <= v.ih - safeBottom + 8, tag + ' vote panel fits the phone (' + v.panel.b.toFixed(0) + ')');
      assert(!v.fab && !v.avoid && !v.vetoImg && !v.vetoBtn, tag + ' hides the avoid card during the vote');
      assert(!/回避卡|迴避卡/.test(v.text), tag + ' vote card does not say 回避卡');
      assert(!v.ladyBadge && v.labels === 0, tag + ' still hides sides and roles');
      for (const p of chosen) {
        const m = v.mates.find(x => x.text.includes(p.name));
        assert(m && m.no === p.seat + '號' && m.text.includes(p.seat + '號' + p.name), tag + ' shows ' + p.seat + '號 beside ' + p.name + ' (' + (m && m.text) + ')');
        assert(m.src && /\/img\/av\/|\/api\/avatar\//.test(m.src) && !/veto/.test(m.src), tag + ' uses ' + p.name + ' avatar');
        assert(m.face && m.beside && m.light, tag + ' keeps a light chip and puts the number beside the face');
        assert(m.w <= v.iw - 24, tag + ' roster chip fits');
      }
    }
    async function noAvoid(tag) {
      const s = await evalj(`(() => ({ text: document.body.innerText, ctl: !!document.querySelector('.veto-fab, .avoid-btn, [data-a="veto"], [data-a="vetoinfo"], .vchip') }))()`);
      assert(!/回避卡|迴避卡/.test(s.text) && !s.ctl, tag + ' has no avoid card on screen');
    }

    const outsider = people[3];
    await setSize(375, 812);
    await asUser(outsider);
    await quiet();
    let vote = await voteView();
    assert(vote.votes === 2, '375 vote buttons remain before a ballot');
    assertVote('375', vote, 34);
    await noAvoid('team vote 375');
    const cast = await evalj(`(() => { const b = document.querySelector('.vote-panel [data-a="vote"][data-v="0"]'); if (!b) return 0; b.click(); return 1; })()`);
    assert(cast, 'the voter can oppose the team');
    for (let i = 0; i < 30 && !(bots[3].st.game.me && bots[3].st.game.me.voted); i++) await sleep(40);
    vote = await voteView();
    assert(/你已投「反對」/.test(vote.text), '375 shows the waiting line after a ballot');
    assertVote('375 voted', vote, 34);
    await shot('vote-team-375.png');
    await setSize(390, 844);
    vote = await voteView();
    assertVote('390', vote, 34);
    await noAvoid('team vote 390');
    await shot('vote-team-390.png');

    const member = people.find(p => chosen.some(s => s.name === p.name));
    await setSize(375, 812);
    await asUser(member);
    await quiet();
    vote = await voteView();
    assertVote('teammate 375', vote, 34);
    await noAvoid('teammate vote');
    for (const b of bots) {
      const r = await b.act('vote', { approve: true });
      if (!r.ok && !(r.error && /已經/.test(r.error))) throw new Error('vote ' + JSON.stringify(r));
    }
    for (let i = 0; i < 40 && bots[0].st.game.phase !== 'quest'; i++) await sleep(40);
    assert(bots[0].st.game.phase === 'quest', 'an approved team reaches the mission');
    for (let i = 0; i < 30 && !await evalj(`document.body.innerText.includes('任務進行中')`).catch(() => false); i++) await sleep(50);
    await noAvoid('mission');
    assert(await evalj(`document.querySelectorAll('.rt .pick-flag').length === 0`), 'the pennant does not follow the team into the mission');
    for (const b of bots) {
      if (!bots[0].st.game.team.includes(b.st.meId)) continue;
      const r = await b.act('quest', { success: true });
      if (!r.ok && !(r.error && /已經/.test(r.error))) throw new Error('quest ' + JSON.stringify(r));
    }
    for (let i = 0; i < 40 && bots[0].st.game.phase === 'quest'; i++) await sleep(40);
    assert(bots[0].st.game.phase !== 'quest', 'the mission moves on');
    for (let i = 0; i < 30 && await evalj(`document.body.innerText.includes('任務進行中')`).catch(() => true); i++) await sleep(50);
    await noAvoid('later phase ' + bots[0].st.game.phase);

    const names10 = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const p10 = [];
    for (let i = 0; i < 10; i++) {
      const guestKey = 'pf' + i + Date.now().toString(36);
      const pendant = i === 1 ? 'frostmirror' : 'none';
      const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names10[i], avatar: 'fox', bg: '#fff', fx: 'spot', pendant } }) }).then(r => r.json());
      p10.push({ ...j, guestKey, name: names10[i], pendant });
    }
    const b10 = p10.map(p => bot(p.guestKey, p.name));
    bots.push(...b10);
    await Promise.all(b10.map(b => b.ready));
    const made10 = await b10[0].emit('create', {});
    for (let i = 0; i < 30 && !(b10[0].st && b10[0].st.code); i++) await sleep(40);
    assert((await b10[0].act('capacity', { n: 10 })).ok !== false, '10-player table');
    for (let i = 1; i < 10; i++) {
      await b10[i].emit('join', { code: made10.room });
      if (!(await b10[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit10 ' + (i + 1));
    }
    if (!(await b10[0].act('start')).ok) throw new Error('start10');
    for (let i = 0; i < 40 && !(b10[0].st.game && b10[0].st.game.me); i++) await sleep(40);
    const lead10 = b10.find(b => b.st.meId === b10[0].st.game.leaderId);
    await setSize(375, 812);
    await asUser(p10[b10.indexOf(lead10)]);
    await quiet();
    async function frameTable() {
      await evalj(`(() => {
        const main = document.querySelector('main');
        const card = document.querySelector('.rt') && document.querySelector('.rt').closest('.card');
        const x = document.querySelector('.vote-remind-x'); if (x) x.click();
        if (main && card) main.scrollTop += card.getBoundingClientRect().top - main.getBoundingClientRect().top;
      })()`);
      await sleep(50);
    }
    const picks = ['1', '2', '4'];
    for (const seat of picks) {
      const hit = await evalj(`(() => { const el = document.querySelector('.rt .st[data-seat="${seat}"][data-a="sel"]'); if (!el) return 0; el.click(); return 1; })()`);
      assert(hit, '10p leader can select seat ' + seat);
      await sleep(30);
    }
    function assertTop(tag, view) {
      for (const n of ['1', '2', '10']) {
        const s = view.seats.find(x => x.seat === n);
        assert(s, tag + ' shows seat ' + n);
        const faceTop = s.cy - s.ah / 2;
        assert(faceTop >= view.headerBottom - 1, tag + ' seat ' + n + ' face clears the header (' + faceTop.toFixed(1) + '/' + view.headerBottom.toFixed(1) + ')');
        if (s.nameBox) assert(s.nameBox.t >= view.headerBottom - 1 && s.nameBox.b <= view.ih - view.bottom + 1, tag + ' seat ' + n + ' name stays on screen');
        if (s.num) assert(s.num.t >= view.headerBottom - 1, tag + ' seat ' + n + ' numeral clears the header');
        if (s.crown) assert(s.crown.t >= view.headerBottom - 1, tag + ' seat ' + n + ' crown clears the header');
      }
      const a = view.seats.find(s => s.seat === '1');
      const b = view.seats.find(s => s.seat === '10');
      assert(a.gold && a.flagOn && !b.gold && !b.flag, tag + ' seat 10 stays plain beside selected seat 1');
    }
    await frameTable();
    let ten = await pickView();
    assertGold('10p 375', ten, SAFE[375], 3);
    assertTop('10p 375', ten);
    assert(ten.seats.filter(s => s.gold).length === 3, '10p selects three seats');
    assert(ten.seats.some(s => s.gold && s.charm), '10p a selected seat keeps its hanging charm');
    await shot('pick-flag-375.png');
    await setSize(390, 844);
    await frameTable();
    ten = await pickView();
    assertGold('10p 390', ten, SAFE[390], 3);
    assertTop('10p 390', ten);
    await shot('pick-flag-390.png');
    await setSize(375, 812);
    await motion(true);
    await frameTable();
    await sleep(40);
    ten = await pickView();
    const frozen = ten.seats.filter(s => s.gold);
    assert(frozen.length === 3 && frozen.every(s => s.flagOn && s.anim === 'none' && s.ringAnim === 'none' && s.flagAnim === 'none' && /226,\s*178,\s*58|240,\s*193,\s*74/.test(s.shadow)), '10p reduced motion keeps the pennant and a bright static ring');
    assertTop('10p reduced', ten);
    await shot('pick-flag-reduced-375.png');
    await motion(false);
    const sent = await evalj(`(() => { const b = document.querySelector('[data-a="propose"]'); if (!b || b.disabled) return 0; b.click(); return 1; })()`);
    assert(sent, '10p leader can submit the marked seats');
    for (let i = 0; i < 40 && !(b10[0].st.game && b10[0].st.game.phase === 'vote'); i++) await sleep(40);
    assert(b10[0].st.game.phase === 'vote', '10p moves to the team vote');
    for (let i = 0; i < 40; i++) {
      const n = await evalj(`document.querySelectorAll('.rt .st.gold-pick .pick-flag').length`).catch(() => 0);
      if (n === 3) break;
      await sleep(50);
    }
    await frameTable();
    ten = await pickView();
    assert(ten.seats.filter(s => s.gold && s.flagOn && s.sparks === 8).length === 3, '10p vote keeps the pennant and star ring');
    assert(ten.seats.filter(s => !s.gold).every(s => !s.flag && s.sparks === 0), '10p vote does not mark the rest of the table');
    assertTop('10p vote 375', ten);
    await shot('pick-vote-375.png');
    await setSize(390, 844);
    await frameTable();
    ten = await pickView();
    assert(ten.seats.filter(s => s.gold && s.flag).length === 3, '10p 390 vote still shows the pennant');
    assertTop('10p vote 390', ten);
    await shot('pick-vote-390.png');
    console.log('PICK GLOW TESTS PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
    bots.forEach(b => { try { b.s.close(); } catch {} });
  }
})().catch(e => { console.error(e); process.exit(1); });
