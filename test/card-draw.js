// Identity card: a slightly longer draw, then a turn. The role stays covered in artifacts.
const { spawn, execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3473;
const CDP = 9493;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/carddraw-' + Date.now();
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
const POSE = `function pose(el){const cs=getComputedStyle(el);const raw=cs.transform;const m=new DOMMatrix(raw&&raw!=='none'?raw:'matrix(1,0,0,1,0,0)');return {ty:Math.round(m.m42*10)/10,ry:Math.round(Math.atan2(-m.m31,m.m33)*180/Math.PI*10)/10,rz:Math.round(Math.atan2(m.m12,m.m11)*180/Math.PI*10)/10,op:Math.round(parseFloat(cs.opacity)*100)/100};}`;

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0', GM_EMAIL: '', GM_USER_ID: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let chrome;
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });
  const html = await fetch(APP).then(r => r.text());
  const cssV = Number((html.match(/style\.css\?v=(\d+)/) || [])[1]);
  const appV = Number((html.match(/app\.js\?v=(\d+)/) || [])[1]);
  const names = ['甲', '乙', '丙', '丁', '戊'];
  const people = [];
  for (let i = 0; i < 5; i++) {
    const guestKey = 'cd' + i + Date.now().toString(36);
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#fff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i] });
  }
  const bots = people.map(p => bot(p.guestKey, p.name));
  await Promise.all(bots.map(b => b.ready));
  const made = await bots[0].emit('create', {});
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  await bots[0].act('capacity', { n: 5 });
  for (let i = 1; i < 5; i++) {
    await bots[i].emit('join', { code: made.room });
    if (!(await bots[i].act('sit', { seat: i + 1 })).ok) throw new Error('sit');
  }
  if (!(await bots[0].act('start')).ok) throw new Error('start');
  for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.me); i++) await sleep(40);

  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-carddraw-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++idn; const t = setTimeout(() => rej(new Error(method)), 20000); pending.set(i, v => { clearTimeout(t); res(v); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  const SAFE = { 375: { top: 50, bottom: 34 }, 390: { top: 47, bottom: 34 } };
  async function setSize(w, h) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    const safe = SAFE[w];
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safe.top, left: 0, bottom: safe.bottom, right: 0 } });
  }
  async function setMotion(value) {
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  }
  async function shot(name) {
    await evalj(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, name);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }
  async function quiet() {
    for (let i = 0; i < 6; i++) {
      const open = await evalj(`(() => { const m = document.querySelector('#modal'); return !!m && !m.classList.contains('hidden'); })()`);
      if (!open) return;
      await evalj(`(() => { const b = document.querySelector('#modal #ok') || document.querySelector('#modal .btn'); if (b) b.click(); })()`);
      await sleep(80);
    }
  }
  async function asUser(person) {
    const profile = JSON.stringify({ name: person.name, avatar: 'fox', bg: '#fff', fx: 'spot', pendant: 'none' });
    for (let attempt = 0; attempt < 3; attempt++) {
      for (let i = 0; i < 30; i++) { if (await evalj(`!!document.body`).catch(() => false)) break; await sleep(100); }
      await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + '?cd=' + Date.now())})`);
      for (let i = 0; i < 50; i++) { if (await evalj(`!!document.querySelector('.myrole-fab')`).catch(() => false)) return; await sleep(120); }
    }
    throw new Error('no table ' + await evalj(`document.body.innerText.replace(/\\s+/g,' ').slice(0,180)`).catch(() => ''));
  }
  async function openCovered() {
    await quiet();
    await evalj(`document.querySelector('.myrole-fab').click()`);
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('.reveal .flip')`)); i++) await sleep(40);
    await evalj(`(() => { const flip = document.querySelector('.reveal .flip'); const a = flip && flip.getAnimations().find(x => x.animationName === 'cardIn'); if (a) { a.pause(); a.currentTime = 0; } const kn = document.querySelector('#kn'); if (kn) kn.classList.add('hidden'); })()`);
  }
  async function sample(selector, name, steps) {
    return evalj(`(async () => {
      ${POSE}
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { missing: true, names: [] };
      const anim = el.getAnimations().find(a => a.animationName === ${JSON.stringify(name)});
      if (!anim) return { missing: true, names: el.getAnimations().map(a => a.animationName || ('transition:' + (a.transitionProperty || '?'))) };
      anim.pause();
      const dur = Number(anim.effect.getComputedTiming().duration);
      const frames = [];
      for (let i = 0; i <= ${steps}; i++) {
        anim.currentTime = dur * (i / ${steps});
        const p = pose(el);
        p.ms = Number(anim.currentTime);
        frames.push(p);
      }
      return { missing: false, dur, frames };
    })()`);
  }
  async function show(which, ms) {
    return evalj(`(() => {
      const flip = document.querySelector('.reveal .flip');
      const rv = document.querySelector('.reveal');
      const kn = document.querySelector('#kn');
      if (kn) kn.classList.add('hidden');
      if (${JSON.stringify(which)} === 'cardIn') {
        flip.classList.remove('on');
        rv.classList.remove('opened');
        flip.style.animation = 'none';
        void flip.offsetWidth;
        flip.style.animation = '';
      } else {
        flip.classList.add('on');
        rv.classList.add('opened');
      }
      const el = ${JSON.stringify(which)} === 'cardIn' ? flip : flip.querySelector('.in');
      const anim = el.getAnimations().find(a => a.animationName === ${JSON.stringify(which)});
      if (!anim) return false;
      document.querySelectorAll('.reveal, .reveal *').forEach(n => n.getAnimations && n.getAnimations().forEach(a => a.pause()));
      anim.pause();
      anim.currentTime = ${Number(ms)};
      return true;
    })()`);
  }

  try {
    await setMotion('no-preference');
    await setSize(375, 812);
    await asUser(people[0]);
    await openCovered();
    const covered = await evalj(`(() => { const kn = document.querySelector('#kn'); const hint = document.querySelector('.reveal .hint'); return { hidden: !!(kn && kn.classList.contains('hidden')), hint: hint ? hint.textContent : '' }; })()`);
    const enter = await sample('.reveal .flip', 'cardIn', 12);
    await evalj(`(() => { const flip = document.querySelector('.reveal .flip'); const rv = document.querySelector('.reveal'); flip.classList.add('on'); rv.classList.add('opened'); const kn = document.querySelector('#kn'); if (kn) kn.classList.add('hidden'); })()`);
    await evalj(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    const flip = await sample('.reveal .flip .in', 'cardDraw', 24);
    const lady = await evalj(`(async () => {
      ${POSE}
      const host = document.createElement('div');
      host.className = 'sheet';
      host.innerHTML = '<div class="flip"><div class="in"><div class="face front"><div class="rc lady-reveal"></div></div></div></div>';
      host.style.cssText = 'position:fixed;left:-1200px;top:0;width:240px';
      document.body.appendChild(host);
      const el = host.querySelector('.in');
      host.querySelector('.flip').classList.add('on');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const anim = el.getAnimations().find(a => a.animationName === 'cardDrawShort');
      if (!anim) { const names = el.getAnimations().map(a => a.animationName || ('transition:' + (a.transitionProperty || '?'))); host.remove(); return { missing: true, names }; }
      anim.pause();
      const dur = Number(anim.effect.getComputedTiming().duration);
      const frames = [];
      for (let i = 0; i <= 16; i++) { anim.currentTime = dur * (i / 16); const p = pose(el); p.ms = Number(anim.currentTime); frames.push(p); }
      host.remove();
      return { missing: false, dur, frames };
    })()`);
    const others = await evalj(`(() => {
      const q = document.createElement('div'); q.className = 'qc'; q.innerHTML = '<div class="qci"></div>';
      const v = document.createElement('div'); v.className = 'vc'; v.innerHTML = '<div class="c"><div class="ci"></div></div>';
      document.body.append(q, v);
      const qd = parseFloat(getComputedStyle(q.querySelector('.qci')).transitionDuration);
      const vd = parseFloat(getComputedStyle(v.querySelector('.ci')).transitionDuration);
      q.remove(); v.remove();
      return { qd, vd };
    })()`);
    await setMotion('reduce');
    const reduced = await evalj(`(() => {
      const flip = document.querySelector('.reveal .flip');
      const inn = flip.querySelector('.in');
      flip.classList.add('on');
      document.querySelector('.reveal').classList.add('opened');
      const f = getComputedStyle(flip), i = getComputedStyle(inn);
      const host = document.createElement('div');
      host.innerHTML = '<div class="flip"><div class="in"><div class="face front"><div class="rc lady-reveal"></div></div></div></div>';
      host.style.cssText = 'position:fixed;left:-1200px;top:0';
      document.body.appendChild(host);
      host.querySelector('.flip').classList.add('on');
      const li = getComputedStyle(host.querySelector('.in'));
      const out = { enter: f.animationName, enterDur: parseFloat(f.animationDuration) || 0, flipName: i.animationName, flipDur: parseFloat(i.animationDuration) || 0, flipTrans: parseFloat(i.transitionDuration) || 0, ladyName: li.animationName, ladyDur: parseFloat(li.animationDuration) || 0, ladyTrans: parseFloat(li.transitionDuration) || 0 };
      host.remove();
      return out;
    })()`);
    await setMotion('no-preference');

    const failures = [];
    const bad = (label) => failures.push(label);
    if (!covered.hidden || !String(covered.hint).includes('點擊卡片翻開')) bad('the card still waits, covered, with 點擊卡片翻開');
    if (enter.missing) bad('entrance animation cardIn is missing (' + enter.names.join(',') + ')');
    else {
      if (!(enter.dur >= 850 && enter.dur <= 1050)) bad('entrance draw should be a little longer than 0.7s, got ' + enter.dur + 'ms');
      if (!enter.frames.some(f => f.op >= 0.8 && f.ty >= 28)) bad('entrance should rise from the deck (no low visible frame)');
      if (!enter.frames.some(f => f.ty <= -10)) bad('entrance should lift past the seat like a card pulled from a deck');
      const end = enter.frames[enter.frames.length - 1];
      if (!(Math.abs(end.ty) <= 6 && Math.abs(end.rz) <= 4)) bad('entrance should settle upright, got ty ' + end.ty + ' rz ' + end.rz);
    }
    if (flip.missing) bad('identity flip animation cardDraw is missing (' + (flip.names || []).join(',') + ')');
    else {
      if (!(flip.dur >= 1150 && flip.dur <= 1500)) bad('identity turn should be a bit longer than 0.9s, got ' + flip.dur + 'ms');
      let peak = flip.frames[0];
      flip.frames.forEach(f => { if (f.ty < peak.ty) peak = f; });
      const peakAt = flip.frames.indexOf(peak);
      if (!(peak.ty <= -22)) bad('the flip should lift the card off the table, peak ty ' + peak.ty);
      if (!(Math.abs(peak.ry) <= 40)) bad('the lift should happen before the turn is far along, ry ' + peak.ry + ' at ty ' + peak.ty);
      const mid = flip.frames.slice(peakAt + 1).find(f => Math.abs(f.ry) >= 60 && Math.abs(f.ry) <= 88);
      if (!mid) bad('after the lift the card should still be turning (no edge-on frame <= 88deg)');
      const end = flip.frames[flip.frames.length - 1];
      if (!(Math.abs(end.ry) >= 170 && Math.abs(end.ty) <= 6)) bad('the flip should finish face-up and seated, ry ' + end.ry + ' ty ' + end.ty);
    }
    if (lady.missing) bad('lake card should use a short draw-turn too (' + (lady.names || []).join(',') + ')');
    else {
      if (!(lady.dur >= 950 && lady.dur <= 1200)) bad('lake flip should be only a little longer, got ' + lady.dur + 'ms');
      let peak = lady.frames[0];
      lady.frames.forEach(f => { if (f.ty < peak.ty) peak = f; });
      if (!(peak.ty <= -12 && Math.abs(peak.ry) <= 40)) bad('lake card should lift briefly before it turns, ty ' + peak.ty + ' ry ' + peak.ry);
      const end = lady.frames[lady.frames.length - 1];
      if (!(Math.abs(end.ry) >= 170)) bad('lake card should finish turned');
    }
    if (!(others.qd >= 0.5 && others.qd <= 0.7)) bad('mission flips should stay brief, got ' + others.qd);
    if (!(others.vd >= 0.5 && others.vd <= 0.75)) bad('vote flips should stay brief, got ' + others.vd);
    if (!(cssV >= 50)) bad('style.css cache bust should move past 49, got ' + cssV);
    if (!(appV >= 57)) bad('app.js cache bust should move past 56, got ' + appV);
    if (reduced.enter !== 'none' || reduced.enterDur !== 0) bad('reduced motion still plays the entrance (' + reduced.enter + ' ' + reduced.enterDur + ')');
    if (reduced.flipName !== 'none' || reduced.flipDur !== 0 || reduced.flipTrans !== 0) bad('reduced motion still plays the identity flip (' + reduced.flipName + ' dur ' + reduced.flipDur + ' trans ' + reduced.flipTrans + ')');
    if (reduced.ladyName !== 'none' || reduced.ladyDur !== 0 || reduced.ladyTrans !== 0) bad('reduced motion still plays the lake flip');
    if (failures.length) {
      console.log('entrance', JSON.stringify(enter));
      console.log('flip', JSON.stringify(flip));
      console.log('lady', JSON.stringify(lady));
      console.log('reduced', JSON.stringify(reduced));
      throw new Error('ASSERT: card motion\n' + failures.map(f => '- ' + f).join('\n'));
    }
    console.log('ok - identity draw is a little longer and lifts before it turns');
    console.log('ok - lake flip matches briefly; mission and vote flips stay short');
    console.log('ok - reduced motion drops the long card motion');

    const enterShot = enter.frames.find(f => f.op >= 0.85 && f.ty >= 28) || enter.frames.find(f => f.ty >= 28);
    let peak = flip.frames[0];
    flip.frames.forEach(f => { if (f.ty < peak.ty) peak = f; });
    const midShot = flip.frames.filter(f => f.ms > peak.ms && Math.abs(f.ry) >= 60 && Math.abs(f.ry) <= 88).slice(-1)[0];
    assert(enterShot && midShot, 'found an entrance frame and an edge-on frame that does not show the face');
    const files = [];
    for (const w of [375, 390]) {
      await setSize(w, w === 375 ? 812 : 844);
      const enterHeld = await show('cardIn', enterShot.ms);
      assert(enterHeld !== false, w + ' entrance frame is held');
      files.push(await shot('card-enter-' + w + '.png'));
      const midHeld = await show('cardDraw', midShot.ms);
      assert(midHeld !== false, w + ' mid-flip frame is held');
      const pose = await evalj(`(() => { ${POSE} const el = document.querySelector('.reveal .flip .in'); const kn = document.querySelector('#kn'); return { ...pose(el), covered: kn.classList.contains('hidden') }; })()`);
      assert(pose.covered && Math.abs(pose.ry) <= 88 && Math.abs(pose.ry) >= 60, w + ' mid-flip stays edge-on with the role covered (ry ' + pose.ry + ')');
      files.push(await shot('card-midflip-' + w + '.png'));
    }
    const clipDir = path.join(DATA, 'frames');
    fs.mkdirSync(clipDir, { recursive: true });
    const ticks = (from, to, step) => { const out = []; for (let t = from; t < to; t += step) out.push(t); out.push(to); return out; };
    const enterFrom = enter.frames.find(f => f.op >= 0.8).ms;
    const clipFrames = ticks(enterFrom, enter.dur, 70).map(ms => ({ kind: 'cardIn', ms }))
      .concat(ticks(0, midShot.ms, 70).map(ms => ({ kind: 'cardDraw', ms })));
    let n = 0;
    const writeFrame = async () => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(clipDir, String(n).padStart(3, '0') + '.png'), Buffer.from(data, 'base64'));
      n++;
    };
    await setSize(390, 844);
    for (const f of clipFrames) {
      await show(f.kind, f.ms);
      await evalj(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      await writeFrame();
    }
    for (let i = 0; i < 3; i++) await writeFrame();
    const clip = path.join(OUT, 'card-draw-390.mp4');
    await new Promise((res, rej) => execFile('ffmpeg', ['-y', '-framerate', '14', '-start_number', '0', '-i', path.join(clipDir, '%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', '-an', clip], { stdio: 'ignore' }, err => err ? rej(err) : res()));
    assert(fs.statSync(clip).size > 8000, 'short clip of the draw and turn');
    for (const f of files) assert(fs.statSync(f).size > 8000, path.basename(f) + ' captured');

    const shut = await evalj(`(async () => {
      ${POSE}
      const flip = document.querySelector('#flip');
      const inn = flip.querySelector('.in');
      const kn = document.querySelector('#kn');
      if (!flip.classList.contains('on')) flip.click();
      let anim = inn.getAnimations().find(a => a.animationName === 'cardDraw');
      if (!anim) return { missing: 'cardDraw' };
      anim.pause();
      anim.currentTime = Number(anim.effect.getComputedTiming().duration);
      const openRy = Math.abs(pose(inn).ry);
      flip.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      anim = inn.getAnimations().find(a => a.animationName === 'cardPut');
      if (!anim) return { missing: 'cardPut', names: inn.getAnimations().map(a => a.animationName) };
      const dur = Number(anim.effect.getComputedTiming().duration);
      anim.pause();
      anim.currentTime = dur * 0.28;
      const midRy = Math.abs(pose(inn).ry);
      const midTy = pose(inn).ty;
      anim.currentTime = dur;
      const endRy = Math.abs(pose(inn).ry);
      return { openRy, midRy, midTy, endRy, dur, covered: kn.classList.contains('hidden'), opened: flip.classList.contains('on') };
    })()`);
    assert(!shut.missing && shut.covered && shut.opened === false && shut.openRy >= 170 && shut.dur >= 700 && shut.dur <= 1100 && shut.midRy > 40 && shut.midTy <= -10 && shut.endRy < 8, 'closing puts the card back down (' + JSON.stringify(shut) + ')');
    await quiet();
    await setMotion('no-preference');
    await evalj(`document.querySelector('.myrole-fab').click()`);
    for (let i = 0; i < 30 && !(await evalj(`!!document.querySelector('#flip')`)); i++) await sleep(40);
    const click = await evalj(`(() => {
      const kn = document.querySelector('#kn');
      const flip = document.querySelector('#flip');
      const covered = !!(kn && kn.classList.contains('hidden') && flip && !flip.classList.contains('on'));
      flip.click();
      const opened = kn && !kn.classList.contains('hidden') && flip.classList.contains('on');
      kn.classList.add('hidden');
      return { covered, opened };
    })()`);
    assert(click.covered && click.opened, 'a seated player can still open the card; nothing else was recorded');
    await quiet();
    console.log('CARD DRAW TESTS PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
    bots.forEach(b => { try { b.s.close(); } catch {} });
  }
})().catch(e => { console.error(e); process.exit(1); });
