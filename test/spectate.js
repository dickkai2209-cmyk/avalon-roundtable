// Mid-game spectating: a player who is not seated can enter or stay, see the
// public table, and cannot see or play private actions.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 41000 + (process.pid % 500);
const CDP = 9600 + (process.pid % 300);
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/av-spec-' + process.pid;
const OUT = '/opt/cursor/artifacts';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function getRaw(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => { res.resume(); resolve({ status: res.statusCode, loc: res.headers.location || '' }); });
    req.on('error', reject);
    req.setTimeout(4000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}
function bot(key, name) {
  const s = io(APP, { transports: ['websocket'], forceNew: true, query: { diff: '1' } });
  const c = { s, st: null, name, key, raws: [] };
  s.on('state', st => {
    c.raws.push(st);
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
    if (!h || h.error) rej(new Error((h && h.error) || 'hello')); else res(h);
  }));
  return c;
}
async function guest(name, avatar) {
  const guestKey = 'sp' + name + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name, avatar, bg: '#ffffff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
  return { ...j, guestKey, name };
}
async function until(pred, label) {
  for (let i = 0; i < 120; i++) { if (pred()) return; await sleep(40); }
  throw new Error('timeout ' + label);
}
function hidden(st) {
  const g = st && st.game;
  if (!g) return 'no game';
  const blob = JSON.stringify(g);
  if (g.me) return 'private me';
  if (/questVotes|myVote|myAvoid|"side"/.test(blob)) return blob.slice(0, 180);
  if (g.seats.some(s => s.role || s.side || s.evil || s.assassin)) return 'public role';
  if ((g.ladyLog || []).some(l => 'side' in l)) return 'lady side';
  return '';
}
function ladyRaw(c) {
  for (let i = c.raws.length - 1; i >= 0; i--) {
    const st = c.raws[i];
    const log = (st.game && st.game.ladyLog) || (st.__g && st.__g.ladyLog);
    if (log && log.length) return log;
  }
  return null;
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', GM_EMAIL: '', GM_USER_ID: '', FORCE_LEADER: '0', KEEPALIVE: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let chrome;
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch (e) {} try { srv.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });

  const names = ['甲', '乙', '丙', '丁', '戊'];
  const people = [];
  for (let i = 0; i < 5; i++) people.push(await guest(names[i], i === 0 ? 'fox' : 'panda'));
  const lobbyP = await guest('留席', 'cat');
  const lateP = await guest('後來', 'otter');
  const bots = people.map(p => bot(p.guestKey, p.name));
  const lobby = bot(lobbyP.guestKey, '留席');
  await Promise.all([...bots, lobby].map(b => b.ready));
  const code = (await bots[0].emit('create')).room;
  await until(() => bots[0].st && bots[0].st.code === code, 'host room');
  assert((await bots[0].act('capacity', { n: 5 })).ok, '5 player table');
  assert((await bots[0].act('settings', { lady: true, excalibur: false, lancelot: false, veto: false, mic: false })).ok, 'lady on, no sword');
  for (let i = 1; i < 5; i++) {
    assert((await bots[i].emit('join', { code })).room === code, 'seat join ' + names[i]);
    assert((await bots[i].act('sit', { seat: i + 1 })).ok, 'sit ' + (i + 1));
  }
  const stayed = await lobby.emit('join', { code });
  assert(stayed.spectating === true, 'an unseated lobby guest is already a spectator');
  await until(() => lobby.st && lobby.st.code === code && lobby.st.spectating, 'lobby state');
  const beforeSeats = () => bots[0].st.game ? bots[0].st.game.seats.map(s => s.id + ':' + s.name).join('|') : bots[0].st.seats.filter(s => !s.empty).map(s => s.id).join('|');
  const seatedBefore = beforeSeats();
  assert((await bots[0].act('start')).ok, 'game started with the lobby guest still inside');
  await until(() => bots[0].st.game && bots[0].st.game.me && lobby.st.game && lobby.st.spectating, 'lobby watches the start');
  assert(lobby.st.mySeat == null && lobby.st.game.me == null && !hidden(lobby.st), 'the unseated guest stays and receives no hidden role');
  assert(lobby.st.game.phase === 'team' && lobby.st.game.n === 5 && lobby.st.game.quests.length === 5, 'spectator sees the public mission track');
  assert(bots[0].st.game.me.role && bots[0].st.game.seats.every(s => !s.role), 'the seated host still has a private role and the public seats do not');
  assert(seatedBefore.split('|').length === 5, 'five seats were filled before the extra guest arrived');

  const late = bot(lateP.guestKey, '後來');
  await late.ready;
  const joined = await late.emit('join', { code });
  await until(() => late.st && late.st.game && late.st.spectating, 'late state');
  assert(joined.spectating === true && late.st.mySeat == null && late.st.game.me == null, 'a direct join during the game spectates');
  assert(!hidden(late.st), 'a late spectator has no hidden roles, lady side, or mission ballots');
  assert(bots[0].st.game.seats.map(s => s.id).join() === late.st.game.seats.map(s => s.id).join(), 'joining does not replace a seated player');
  const redir = await getRaw(APP + 'r/' + code);
  assert(redir.status === 302 && redir.loc.includes('room=' + code), 'room link and QR redirect into the room (' + redir.status + ' ' + redir.loc + ')');

  for (const type of ['propose', 'vote', 'quest', 'lady', 'assassinate', 'sword', 'earlyassassin', 'veto']) {
    const r = await late.act(type, { approve: true, success: false, team: [], id: bots[0].st.meId });
    assert(r && r.error && /觀戰/.test(r.error), type + ' is refused for a spectator');
  }
  const steal = await late.act('sit', { seat: 1 });
  assert(steal.error && /遊戲進行中/.test(steal.error), 'arriving does not take the host seat');
  assert(bots[0].st.mySeat === 1 && bots[0].st.game.me.role, 'the host seat and role are unchanged');
  assert((await late.act('endearly')).error && /房主/.test((await late.act('endearly')).error), 'a spectator does not gain host controls');
  assert(bots[0].st.isHost === true && late.st.isHost === false, 'the host remains the host');

  assert((await bots[0].act('settings', { mic: true })).ok, 'host opens the mic');
  await until(() => late.st.floor && late.st.floor.order && late.st.floor.order.length === 5, 'public floor');
  assert(late.st.floor.status && late.st.settings.mic === true, 'spectator sees the public speaking state');
  const mic = await late.emit('voice:mic', { on: true });
  assert(mic && mic.error && /觀戰/.test(mic.error), 'a spectator cannot publish voice');
  assert((await bots[0].act('settings', { mic: false })).ok, 'host closes the mic before team selection');
  await until(() => !late.st.floor, 'floor cleared');

  const gme = () => bots[0].st.game;
  async function propose(roundFail) {
    const g = gme();
    const need = g.teamSizes[g.round];
    const evil = bots.filter(b => b.st.game.me && b.st.game.me.canFail).map(b => b.st.meId);
    const team = [];
    if (roundFail && evil.length) team.push(evil[0]);
    for (const s of g.seats) {
      if (team.length >= need) break;
      if (!team.includes(s.id)) team.push(s.id);
    }
    const leader = bots.find(b => b.st.meId === g.leaderId);
    assert((await leader.act('propose', { team })).ok, 'leader proposes');
    await until(() => gme().phase === 'vote', 'vote');
    return team;
  }
  await propose(true);
  const voter = bots[1];
  assert((await voter.act('vote', { approve: false })).ok, 'one seated player votes');
  await until(() => late.st.game.voted && late.st.game.voted.includes(voter.st.meId) && late.st.game.voted.length === 1, 'spectator sees that a vote was cast');
  assert(!JSON.stringify(late.st.game).includes('myVote') && !(late.st.game.rounds[late.st.game.round] || []).length, 'the choice stays hidden until the public reveal');
  assert(voter.st.game.me.myVote === false, 'the voter still sees their own ballot');
  assert((await late.act('vote', { approve: true })).error, 'spectator vote during the ballot is refused');
  for (const b of bots) {
    if (b === voter) continue;
    const r = await b.act('vote', { approve: true });
    assert(r.ok || (r.error && /已經/.test(r.error)), 'remaining votes');
  }
  await until(() => gme().phase === 'quest', 'quest');
  const failer = bots.find(b => b.st.game.me.canFail && gme().team.includes(b.st.meId));
  assert(failer, 'an evil player is on the team');
  assert((await failer.act('quest', { success: false })).ok, 'evil plays a fail');
  await until(() => late.st.game.questDone === 1, 'one mission card is in');
  assert(!hidden(late.st) && late.st.game.quests.every(q => !q), 'the spectator cannot see who played the fail');
  assert(failer.st.game.me.questSubmitted === true, 'the seated player still has their own submission');
  for (const b of bots) {
    if (!gme().team.includes(b.st.meId) || b === failer) continue;
    assert((await b.act('quest', { success: true })).ok, 'rest of the team plays success');
  }
  await until(() => gme().phase === 'team' && gme().round === 1, 'next round');
  const pubQ = late.st.game.quests[0];
  assert(pubQ && pubQ.success === false && pubQ.fails === 1 && !pubQ.votes, 'the public result is only the fail count');
  await propose(false);
  for (const b of bots) {
    const r = await b.act('vote', { approve: true });
    assert(r.ok || (r.error && /已經/.test(r.error)), 'second vote');
  }
  await until(() => gme().phase === 'quest', 'quest 2');
  for (const b of bots) if (gme().team.includes(b.st.meId)) assert((await b.act('quest', { success: true })).ok, 'second quest success');
  await until(() => gme().phase === 'lady', 'lady');
  const holder = bots.find(b => b.st.meId === gme().ladyId);
  const target = gme().seats.find(s => s.id !== holder.st.meId);
  assert((await holder.act('lady', { id: target.id })).ok, 'the holder inspects');
  await until(() => holder.st.game.ladyLog.length === 1 && late.st.game.ladyLog.length === 1, 'lady log');
  assert(holder.st.game.ladyLog[0].side === 'good' || holder.st.game.ladyLog[0].side === 'evil', 'the inspector receives the private alignment');
  assert(late.st.game.ladyLog[0].holder && late.st.game.ladyLog[0].target && !('side' in late.st.game.ladyLog[0]), 'spectator lady log is only the public pass');
  assert(lobby.st.game.ladyLog.every(l => !('side' in l)) && !hidden(lobby.st), 'the guest who stayed from the lobby also sees no side');
  const raw = ladyRaw(late);
  assert(raw && raw.every(l => !('side' in l)), 'the spectator diff omits lady side');
  assert(bots[0].st.game.me.role && bots[0].st.spectating === false, 'seated players are still seated after the inspection');

  late.s.close();
  const back = bot(lateP.guestKey, '後來');
  await back.ready;
  await until(() => back.st && back.st.game && back.st.spectating && back.st.mySeat == null, 'reconnect');
  assert(!back.st.game.me && !hidden(back.st), 'reconnecting a spectator does not restore a seat or a role');

  // 10-player table, entered from the room link the way a QR scan does.
  const tenNames = ['葵', '蘭', '竹', '菊', '松', '杉', '柏', '楓', '桐', '柳'];
  const animals = ['fox', 'panda', 'duck', 'otter', 'bunny', 'bear', 'cat', 'wolf', 'lion', 'penguin'];
  const ten = [];
  for (let i = 0; i < 10; i++) ten.push(await guest(tenNames[i], animals[i]));
  const watch = await guest('觀戰', 'cat');
  const tenBots = ten.map(p => bot(p.guestKey, p.name));
  await Promise.all(tenBots.map(b => b.ready));
  const room = (await tenBots[0].emit('create')).room;
  await until(() => tenBots[0].st && tenBots[0].st.code === room, '10 room');
  assert((await tenBots[0].act('capacity', { n: 10 })).ok, '10 player table');
  for (let i = 1; i < 10; i++) {
    await tenBots[i].emit('join', { code: room });
    assert((await tenBots[i].act('sit', { seat: i + 1 })).ok, '10 sit ' + (i + 1));
  }
  assert((await tenBots[0].act('start')).ok, '10 player game started');
  await until(() => tenBots[0].st.game && tenBots[0].st.game.n === 10 && tenBots[0].st.game.me, '10 started');
  const link = await getRaw(APP + 'r/' + room);
  assert(link.status === 302 && link.loc.includes('room=' + room), '10 player room link redirects');

  chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-spec-' + process.pid, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  async function getText(url) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
      req.on('error', reject);
    });
  }
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await getText('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
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
    await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: SAFE[w].top, left: 0, bottom: SAFE[w].bottom, right: 0 } });
    await sleep(80);
  }
  async function shot(name) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
  }
  const profile = JSON.stringify({ name: '觀戰', avatar: 'cat', bg: '#ffffff', fx: 'spot', pendant: 'none' });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('cc.token', ${JSON.stringify(watch.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(watch.user.id)}); localStorage.setItem('cc.guest', ${JSON.stringify(watch.guestKey)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)});` });
  await setSize(375, 812);
  await send('Page.navigate', { url: APP + 'r/' + room });
  const ready = await evalj(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { if (document.querySelector('[data-spec="live"]')) { clearInterval(t); r(1);} else if (Date.now()-t0>12000) { clearInterval(t); r(0);} }, 50); })`);
  if (!ready) throw new Error('spectator view missing ' + await evalj(`(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,240)`));
  await evalj(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const toast=document.querySelector('#toast'); if (!toast || toast.classList.contains('hidden') || Date.now()-t0>2600) { clearInterval(t); r(1);} }, 40); })`);
  async function viewInfo() {
    return evalj(`(() => {
      const bar = document.querySelector('[data-spec="live"]');
      const main = document.querySelector('main');
      const top = document.querySelector('.topbar');
      const br = bar.getBoundingClientRect();
      const tr = top.getBoundingClientRect();
      return {
        bar: bar.textContent,
        fab: !!document.querySelector('.myrole-fab, [data-a="role"], #flip'),
        text: (document.body.innerText || '').replace(/\\s+/g, ' '),
        faces: document.querySelectorAll('.rt .av').length,
        seats: document.querySelectorAll('.rt .st').length,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        width: window.innerWidth,
        barTop: br.top, barBottom: br.bottom, topBottom: tr.bottom,
        mainPad: main ? getComputedStyle(main).paddingBottom : '',
      };
    })()`);
  }
  const info = await viewInfo();
  assert(/觀戰中/.test(info.bar) && /唔會看到隱藏身分/.test(info.bar), '375 shows the spectator banner');
  assert(!info.fab && !/我的身份|梅林|刺客|派西維爾|莫甘娜|好人陣營|壞人陣營/.test(info.text), '375 has no private role card');
  assert(info.faces === 10 && info.seats === 10 && /第1輪|第 1 輪/.test(info.text), '375 shows the 10 public seats and the mission track');
  assert(!info.overflow && info.width === 375 && info.barTop >= info.topBottom - 1 && info.barBottom <= 812, '375 spectator banner sits below the header and inside the screen');
  await shot('spectate-10p-375.png');
  await setSize(390, 844);
  await evalj(`document.querySelector('main') && (document.querySelector('main').scrollTop = 0); window.scrollTo(0,0);`);
  await sleep(80);
  const wide = await viewInfo();
  assert(/觀戰中/.test(wide.bar) && !wide.fab && wide.faces === 10 && !wide.overflow && wide.width === 390, '390 keeps the spectator table and hides the role card');
  assert(wide.barTop >= wide.topBottom - 1, '390 banner stays below the safe-area header');
  await shot('spectate-10p-390.png');

  try { ws.close(); } catch (e) {}
  stop();
  console.log('SPECTATE TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
