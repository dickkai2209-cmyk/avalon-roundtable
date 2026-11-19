'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const { speakOrder, SPEAK_MS } = require('../rules');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const kids = [];
const track = (p) => { kids.push(p); return p; };
function killAll() { for (const p of kids) { if (!p || !p.pid) continue; try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { try { p.kill('SIGKILL'); } catch (e2) {} } } }
process.on('exit', killAll);
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
function boot(port, env) {
  const data = '/tmp/av-floor-' + port + '-' + process.pid;
  fs.mkdirSync(data, { recursive: true });
  const srv = track(spawn(process.execPath, ['server.js'], { cwd: ROOT, detached: true, env: { ...process.env, PORT: String(port), DATA_DIR: data, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0', FORCE_LEADER: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] }));
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  return (async () => {
    const t0 = Date.now();
    while (!/on :/.test(log)) { if (Date.now() - t0 > 8000) throw new Error(log.slice(-400) || 'server'); await sleep(40); }
    return { url: 'http://127.0.0.1:' + port, srv };
  })();
}
async function mk(url, name) {
  const pid = 'fl' + name + Math.random().toString(36).slice(2, 8);
  const s = io(url, { transports: ['websocket'], forceNew: true });
  const c = { s, st: null, voice: [] };
  s.on('state', st => { c.st = st; });
  s.on('voice:state', m => c.voice.push(m));
  c.emit = (e, d) => new Promise(r => s.emit(e, d, r));
  c.act = (t, d) => c.emit('act', { type: t, data: d });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('connect')), 8000); s.on('connect', () => { clearTimeout(t); res(); }); });
  await c.emit('hello', { pid, name, avatar: 'fox' });
  c.pid = pid;
  return c;
}
async function until(fn, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return; await sleep(20); }
  throw new Error('timeout');
}
function get(url) { return new Promise((resolve, reject) => { const req = http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }); req.on('error', reject); req.setTimeout(2500, () => { req.destroy(); reject(new Error('timeout')); }); }); }
function put(raw) { return new Promise((resolve, reject) => { const m = String(raw).match(/^http:\/\/([^:/]+):(\d+)(\/.*)$/); if (!m) return reject(new Error('bad url')); const req = http.request({ hostname: m[1], port: m[2], path: m[3], method: 'PUT' }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }); req.on('error', reject); req.end(); }); }
class Dev {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.ws.addEventListener('message', ev => { const msg = JSON.parse(ev.data); if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); }
  ready() { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('cdp')), 5000); this.ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true }); }); }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { const t = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, 20000); this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result && r.result.value; }
}
async function domTalk(url, q) {
  const port = 53100 + (process.pid % 200);
  const dir = '/tmp/chrome-floor-' + process.pid;
  fs.mkdirSync(dir, { recursive: true });
  track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
  let tab; for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + port + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
  const dev = new Dev(tab.webSocketDebuggerUrl); await dev.ready(); await dev.send('Runtime.enable'); await dev.send('Page.enable');
  await dev.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const pid = 'flwatch' + Math.random().toString(36).slice(2, 8);
  await dev.send('Page.navigate', { url });
  await dev.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('#app')) { clearInterval(t); r(1);} }, 30); })`);
  await dev.eval(`localStorage.setItem('cc.pid', ${JSON.stringify(pid)}); localStorage.removeItem('cc.token'); localStorage.setItem('cc.profile', JSON.stringify({name:'旁觀',avatar:'fox',bg:'#fff',fx:'none',pendant:'none'}))`);
  await dev.send('Page.navigate', { url });
  await dev.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('[data-a="join"]')) { clearInterval(t); r(1);} }, 40); })`);
  assert((await dev.eval(`document.querySelectorAll('.seat-presence, .seat-mic, .is-speak').length`)) === 0, 'home screen has no mic or presence decoration');
  await dev.eval(`document.querySelector('[data-a="join"]').click()`);
  await dev.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('#cd')) { clearInterval(t); r(1);} }, 30); })`);
  await dev.eval(`document.querySelector('#cd').value=${JSON.stringify(q.room)}; document.querySelector('#ok').click()`);
  const seen = await dev.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const seat=document.querySelector('.is-speak'); if (seat && document.querySelectorAll('.seat-presence').length===10 && document.querySelector('.floor-time')) { clearInterval(t); r({ seat: seat.dataset.seat, pres: document.querySelectorAll('.seat-presence.on').length, off: document.querySelectorAll('.seat-presence.off').length, text: document.querySelector('.floor-time').textContent, anim: getComputedStyle(seat.querySelector('.av')).animationName }); } else if (Date.now()-t0>8000) { clearInterval(t); r(null); } }, 40); })`);
  assert(seen && seen.seat === String(q.host.st.floor.seat) && seen.pres + seen.off === 10 && seen.anim === 'none', 'speaker glow and presence follow the server turn ' + JSON.stringify(seen));
  const quiet = await dev.eval(`new Promise(r => { let n=0; const rt=document.querySelector('.rt'); const obs=new MutationObserver(recs => { recs.forEach(rec => { if (!rec.target.closest || !rec.target.closest('.floor-time')) n++; }); }); obs.observe(rt, { childList:true, subtree:true, attributes:true, characterData:true }); setTimeout(() => { obs.disconnect(); r(n); }, 700); })`);
  assert(quiet === 0, 'the countdown does not rebuild the table (' + quiet + ')');
  assert((await q.host.act('settings', { mic: false })).ok, 'host turns mic off for the watcher');
  const gone = await dev.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { if (!document.querySelector('.seat-presence, .seat-mic, .is-speak, .floorbar')) { clearInterval(t); r(1);} else if (Date.now()-t0>5000) { clearInterval(t); r(0);} }, 40); })`);
  assert(gone === 1, 'mic mode off removes presence, glow, and the speaking bar');
  try { dev.ws.close(); } catch (e) {}
}
async function speakUntilSelect(host, cs) {
  for (let n = 0; n < 12 && !(host.st.floor && host.st.floor.status === 'select'); n++) {
    const f = host.st.floor;
    if (!f || !f.speaker) break;
    const who = cs.find(c => c.st && c.st.meId === f.speaker) || host;
    await who.act('floor', { op: 'end', token: f.token });
    await until(() => host.st.floor && (host.st.floor.status === 'select' || host.st.floor.token !== f.token), 4000);
  }
  return host.st.floor;
}
async function domPick(url, q) {
  const port = 53200 + (process.pid % 200);
  const dir = '/tmp/chrome-floor-pick-' + process.pid;
  fs.mkdirSync(dir, { recursive: true });
  track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
  let tab; for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + port + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
  const dev = new Dev(tab.webSocketDebuggerUrl); await dev.ready(); await dev.send('Runtime.enable'); await dev.send('Page.enable');
  await dev.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('cc.pid', ${JSON.stringify(q.host.pid)}); localStorage.removeItem('cc.token'); localStorage.setItem('cc.profile', ${JSON.stringify(JSON.stringify({ name: '主', avatar: 'fox', bg: '#fff', fx: 'none', pendant: 'none' }))});` });
  await dev.send('Page.navigate', { url });
  const view = await dev.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const prompt=document.querySelector('.pick-team'); const modal=document.querySelector('#modal:not(.hidden)'); if (prompt) { clearInterval(t); r({ prompt: prompt.textContent, propose: !!document.querySelector('[data-a="propose"]:not([disabled])') || !!document.querySelector('[data-a="propose"]'), glow: document.querySelectorAll('.is-speak').length, clock: !!document.querySelector('.floor-time'), modal: !!(modal && modal.innerText.includes('請選擇隊伍')), ready: document.querySelectorAll('.pick-ready').length }); } else if (Date.now()-t0>8000) { clearInterval(t); r({ text: document.body.innerText.slice(0, 180) }); } }, 40); })`);
  assert(view.prompt === '請選擇隊伍' && view.glow === 0 && !view.clock && !view.modal && view.ready === 1, 'leader sees one selection prompt and no speaking chrome ' + JSON.stringify(view));
  try { dev.ws.close(); } catch (e) {}
}
async function five(url) {
  const host = await mk(url, '主');
  const room = (await host.emit('create')).room;
  assert((await host.act('capacity', { n: 5 })).ok, 'capacity 5');
  assert((await host.act('settings', { mic: true })).ok, 'mic stays on');
  const cs = [host];
  for (let i = 2; i <= 5; i++) {
    const p = await mk(url, '五' + i);
    await p.emit('join', { code: room });
    assert((await p.act('sit', { seat: i })).ok, 'five sit ' + i);
    cs.push(p);
  }
  assert((await host.act('start')).ok, 'five start');
  await until(() => host.st && host.st.game && host.st.floor);
  return { host, cs, room };
}
function leaderSeat(st) { const s = st.game.seats.find(x => x.id === st.game.leaderId); return s && s.seat; }
async function proposeNow(cs) {
  const st = cs[0].st;
  const n = st.game.teamSizes[st.game.round];
  const ids = st.game.seats.slice(0, n).map(s => s.id);
  const leader = cs.find(c => c.st.meId === st.game.leaderId);
  const r = await leader.act('propose', { team: ids });
  if (!r || !r.ok) throw new Error('propose ' + JSON.stringify(r));
  await until(() => cs[0].st.game.phase === 'vote');
}
async function voteAll(cs, approve) {
  await Promise.all(cs.map(c => c.act('vote', { approve })));
  await until(() => cs[0].st.game.phase !== 'vote', 5000);
}
async function rejectionGate() {
  const gate = await boot(41800 + (process.pid % 200), { SPEAK_MS: '200', PRESENCE_GRACE_MS: '300' });
  const g = await five(gate.url);
  const cs = g.cs;
  const speech = () => cs[0].st.floor && cs[0].st.floor.status === 'speak' && !cs[0].st.floor.skipped && cs[0].st.floor.speaker;
  assert(cs[0].st.game.rejects === 0 && speech() && cs[0].st.floor.seats[cs[0].st.floor.seats.length - 1] === leaderSeat(cs[0].st), 'rejection 0 keeps the speaking round');
  await speakUntilSelect(cs[0], cs);
  await proposeNow(cs);
  await voteAll(cs, false);
  await until(() => cs[0].st.game.rejects === 1 && cs[0].st.floor && cs[0].st.floor.status === 'speak');
  assert(!cs[0].st.floor.skipped && cs[0].st.floor.seats[cs[0].st.floor.seats.length - 1] === leaderSeat(cs[0].st), 'rejection 1 still speaks, leader last');
  await speakUntilSelect(cs[0], cs);
  await proposeNow(cs);
  await voteAll(cs, false);
  await until(() => cs[0].st.game.rejects === 2 && cs[0].st.floor && cs[0].st.floor.status === 'select');
  const skip = cs[0].st.floor;
  assert(skip.skipped && !skip.speaker && !skip.deadline && cs[0].st.game.phase === 'team' && !(cs[0].st.game.team || []).length, 'rejection 2 skips speech and opens selection');
  assert((await cs[1].emit('voice:mic', { on: true })).error, 'skipped discussion rejects unmute');
  assert((await cs[2].emit('voice:signal', { to: cs[1].st.meId, kind: 'offer', sdp: 'v=0\r\n' + 'x'.repeat(16) })).error, 'skipped discussion rejects transmit');
  const sid = skip.selectId;
  assert((await cs[0].act('floor', { op: 'restart' })).ok, 'restart during the skip');
  await sleep(40);
  assert(cs[0].st.floor.status === 'select' && cs[0].st.floor.skipped && !cs[0].st.floor.speaker, 'restart cannot reopen speaking');
  await cs[0].act('floor', { op: 'end', token: cs[0].st.floor.token });
  await sleep(30);
  assert(cs[0].st.game.phase === 'team' && cs[0].st.floor.skipped, 'a late finish cannot start speaking');
  assert((await cs[0].act('settings', { mic: false })).ok, 'toggle mic off');
  await until(() => cs[0].st.floor == null);
  assert((await cs[0].act('settings', { mic: true })).ok, 'toggle mic on');
  await until(() => cs[0].st.floor && cs[0].st.floor.skipped && cs[0].st.floor.status === 'select' && !cs[0].st.floor.speaker);
  assert(cs[0].st.game.rejects === 2, 'toggling mic does not reset the rejection count');
  const who = cs[3];
  who.s.disconnect();
  await sleep(80);
  who.s.connect();
  await new Promise(r => who.s.once('connect', r));
  await who.emit('hello', { pid: who.pid, name: '回', avatar: 'fox' });
  await until(() => who.st && who.st.floor && who.st.floor.skipped && !who.st.floor.speaker);
  assert(who.st.game.rejects === 2 && who.st.game.phase === 'team', 'reconnect cannot bypass the skip');
  await domSkip(gate.url, cs.find(c => c.st.meId === cs[0].st.game.leaderId).pid);
  await proposeNow(cs);
  await voteAll(cs, false);
  await until(() => cs[0].st.game.rejects === 3 && cs[0].st.floor.skipped && !cs[0].st.floor.speaker);
  assert(cs[0].st.floor.status === 'select', 'rejection 3 stays on direct selection');
  await proposeNow(cs);
  await voteAll(cs, false);
  await until(() => cs[0].st.game.rejects === 4 && cs[0].st.floor.status === 'select' && cs[0].st.floor.skipped);
  assert(cs[0].st.game.phase === 'team', 'rejection 4 does not end the game early');
  const evil = cs.find(c => c.st.game.me && c.st.game.me.canFail);
  const n = cs[0].st.game.teamSizes[cs[0].st.game.round];
  const ids = [evil.st.meId];
  for (const c of cs) { if (ids.length >= n) break; if (!ids.includes(c.st.meId)) ids.push(c.st.meId); }
  const leader = cs.find(c => c.st.meId === cs[0].st.game.leaderId);
  assert((await leader.act('propose', { team: ids })).ok, 'approve path after four rejections');
  await until(() => cs[0].st.game.phase === 'vote');
  await voteAll(cs, true);
  await until(() => cs[0].st.game.phase === 'quest' && cs[0].st.game.rejects === 0);
  for (const c of cs) {
    if (!ids.includes(c.st.meId)) continue;
    await c.act('quest', { success: !c.st.game.me.canFail });
  }
  await until(() => cs[0].st.game.phase === 'team' && cs[0].st.game.round === 1, 5000);
  assert(cs[0].st.game.quests[0] && cs[0].st.game.quests[0].success === false, 'the mission itself failed');
  assert(cs[0].st.game.rejects === 0 && cs[0].st.floor.status === 'speak' && !cs[0].st.floor.skipped && cs[0].st.floor.speaker, 'the next mission speaks again');
  assert(sid !== cs[0].st.floor.selectId, 'the new mission is not the skipped selection');
  cs.forEach(c => { try { c.s.close(); } catch (err) {} });
}
async function fifthReject() {
  const gate = await boot(41900 + (process.pid % 200), { SPEAK_MS: '200', PRESENCE_GRACE_MS: '300' });
  const g = await five(gate.url);
  const cs = g.cs;
  for (let n = 1; n <= 4; n++) {
    if (!(cs[0].st.floor && cs[0].st.floor.skipped)) await speakUntilSelect(cs[0], cs);
    await proposeNow(cs);
    await voteAll(cs, false);
    await until(() => cs[0].st.game.rejects === n && cs[0].st.game.phase === 'team');
    assert(cs[0].st.game.winner == null && cs[0].st.game.phase !== 'end' && cs[0].st.game.phase !== 'assassin', 'rejection ' + n + ' does not end the game');
  }
  assert(cs[0].st.game.rejects === 4 && cs[0].st.floor.skipped && cs[0].st.floor.status === 'select' && !cs[0].st.floor.speaker, 'four rejections skip speech and wait for the leader');
  await proposeNow(cs);
  await voteAll(cs, false);
  await until(() => cs[0].st.game.phase === 'end');
  const done = cs[0].st.game;
  assert(done.winner === 'evil' && done.phase === 'end' && done.phase !== 'assassin' && !done.assassinTarget, 'the fifth rejection is an immediate red victory');
  assert(String(done.reason || '').includes('連續 5 次'), 'settlement names the five rejections');
  assert(done.mvp && done.scores && cs[0].st.floor == null, 'one settlement is published and the speaking turn is gone');
  assert((done.rounds[0] || []).length === 5 && (done.rounds[0] || []).every(r => r && r.approved === false), 'exactly five rejected proposals were recorded');
  const again = await cs[0].act('vote', { approve: false });
  const extra = await cs[0].act('propose', { team: cs[0].st.game.seats.slice(0, 2).map(s => s.id) });
  const spoke = await cs[1].act('floor', { op: 'end', token: 1 });
  const mic = await cs[2].emit('voice:mic', { on: true });
  assert(again.error && extra.error && spoke.error, 'late vote, proposal, and speaking are refused');
  await sleep(50);
  assert(cs[0].st.game.phase === 'end' && cs[0].st.game.winner === 'evil' && cs[0].st.game.mvp === done.mvp, 'duplicates do not open a sixth proposal or change the result');
  const stats = async () => JSON.parse(await get(gate.url + '/api/stats?pid=' + encodeURIComponent(cs[0].pid)));
  const hist = async () => JSON.parse(await get(gate.url + '/api/history?pid=' + encodeURIComponent(cs[0].pid)));
  const before = await stats();
  const games = await hist();
  assert(before.played === 1 && games.filter(x => x.gid === done.gid).length === 1, 'the record and MVP are stored once');
  await cs[0].act('vote', { approve: true });
  await cs[2].emit('voice:signal', { to: cs[1].st.meId, kind: 'offer', sdp: 'v=0\r\n' + 'y'.repeat(16) });
  await sleep(40);
  const after = await stats();
  const games2 = await hist();
  assert(after.played === 1 && after.mvp === before.mvp && games2.filter(x => x.gid === done.gid).length === 1, 'a repeated final vote does not award the game again');
  cs.forEach(c => { try { c.s.close(); } catch (err) {} });
}
async function pauseClock() {
  const gate = await boot(42100 + (process.pid % 200), { SPEAK_MS: '800', PRESENCE_GRACE_MS: '5000' });
  const host = await mk(gate.url, '主');
  const room = (await host.emit('create')).room;
  await host.act('capacity', { n: 5 });
  await host.act('settings', { mic: true });
  const cs = [host];
  for (let i = 2; i <= 5; i++) {
    const p = await mk(gate.url, '暫停' + i);
    await p.emit('join', { code: room });
    await p.act('sit', { seat: i });
    cs.push(p);
  }
  assert((await host.act('start')).ok, 'pause game starts');
  await until(() => host.st.floor && host.st.floor.speaker);
  const speaker = cs.find(c => c.st.meId === host.st.floor.speaker);
  const voices = speaker.voice.length;
  assert((await speaker.emit('voice:mic', { on: true })).ok, 'speaker opts in before the pause');
  await sleep(120);
  const token = host.st.floor.token;
  const idx = host.st.floor.index;
  const who = host.st.floor.speaker;
  assert((await cs[1].act('floor', { op: 'pause', token })).error, 'a non-host cannot pause');
  assert((await host.act('floor', { op: 'pause', token })).ok, 'host pauses');
  await until(() => host.st.floor && host.st.floor.paused);
  const held = host.st.floor.remainingMs;
  assert(held > 500 && held < 800 && host.st.floor.speaker === who && host.st.floor.deadline === 0, 'pause keeps the speaker and the leftover budget ' + held);
  const again = await host.act('floor', { op: 'pause', token });
  assert(again.ok && host.st.floor.remainingMs === held, 'a second pause does not change the budget');
  assert((await speaker.act('floor', { op: 'end', token })).error, 'ending the turn is refused while paused');
  await sleep(900);
  assert(host.st.floor.paused && host.st.floor.index === idx && host.st.floor.speaker === who && host.st.floor.remainingMs === held, 'waiting past the full budget does not advance a paused turn');
  assert(cs[2].st.floor.paused && cs[2].st.floor.remainingMs === held, 'another client sees the same pause');
  const back = cs[3];
  back.s.disconnect();
  await sleep(40);
  back.s.connect();
  await new Promise(r => back.s.once('connect', r));
  await back.emit('hello', { pid: back.pid, name: '暫停3', avatar: 'fox' });
  await until(() => back.st && back.st.floor && back.st.floor.paused && back.st.floor.remainingMs === held);
  assert(speaker.voice.filter(v => v && v.on === false).length === 0, 'pausing does not mute the speaker');
  assert((await host.act('floor', { op: 'resume', token: token + 9 })) .ok && host.st.floor.paused, 'a stale resume does not continue the turn');
  assert((await host.act('floor', { op: 'resume', token })).ok, 'host resumes');
  await until(() => host.st.floor && !host.st.floor.paused && host.st.floor.deadline);
  const left = host.st.floor.deadline - Date.now();
  assert(left > held - 80 && left <= held && host.st.floor.speaker === who && host.st.floor.ms === 800, 'resume continues the leftover time and does not restart the full turn ' + left);
  assert((await host.act('floor', { op: 'pause', token })).ok, 'host pauses again');
  await until(() => host.st.floor.paused && host.st.floor.remainingMs < held);
  const smaller = host.st.floor.remainingMs;
  assert((await host.act('floor', { op: 'resume', token })).ok, 'host resumes again');
  await until(() => !host.st.floor.paused);
  assert(host.st.floor.deadline - Date.now() <= smaller + 30, 'the second resume uses the newer leftover');
  await host.act('settings', { mic: false });
  await until(() => host.st.floor == null);
  assert((await host.act('floor', { op: 'pause', token })).error, 'a cleared turn cannot be paused');
  cs.forEach(c => { try { c.s.close(); } catch (e) {} });
}
async function skipTurn() {
  const gate = await boot(42200 + (process.pid % 200), { SPEAK_MS: '500', PRESENCE_GRACE_MS: '5000' });
  const host = await mk(gate.url, '主');
  const room = (await host.emit('create')).room;
  await host.act('capacity', { n: 5 });
  await host.act('settings', { mic: true });
  const cs = [host];
  for (let i = 2; i <= 5; i++) {
    const p = await mk(gate.url, '跳' + i);
    await p.emit('join', { code: room });
    await p.act('sit', { seat: i });
    cs.push(p);
  }
  assert((await host.act('start')).ok, 'skip game starts');
  await until(() => host.st.floor && host.st.floor.speaker);
  assert(host.st.floor.seats.join(',') === '5,4,3,2,1', 'five-seat order ends with the leader');
  const first = cs.find(c => c.st.meId === host.st.floor.speaker);
  assert((await first.emit('voice:mic', { on: true })).ok, 'current speaker is live before skip');
  const token = host.st.floor.token;
  assert((await cs[1].act('floor', { op: 'skip', token })).error, 'a non-host cannot skip');
  const both = await Promise.all([host.act('floor', { op: 'skip', token }), host.act('floor', { op: 'skip', token })]);
  assert(both.filter(r => r && r.ok).length >= 1, 'host skip accepted');
  await until(() => host.st.floor && host.st.floor.seat === 4);
  assert(host.st.floor.index === 1 && !host.st.floor.paused && host.st.floor.deadline - Date.now() > 350, 'skip moves one speaker onto a fresh running turn');
  assert(first.voice.some(v => v && v.on === false), 'the skipped speaker is silenced');
  await sleep(420);
  assert(host.st.floor.seat === 4 && host.st.floor.index === 1, 'the cleared timer does not also expire the next turn');
  assert((await host.act('floor', { op: 'pause', token: host.st.floor.token })).ok, 'pause the second speaker');
  await until(() => host.st.floor.paused && host.st.floor.seat === 4);
  const pausedToken = host.st.floor.token;
  assert((await host.act('floor', { op: 'skip', token: pausedToken })).ok, 'host can skip while paused');
  await until(() => host.st.floor && host.st.floor.seat === 3 && !host.st.floor.paused);
  assert(host.st.floor.deadline - Date.now() > 350 && !(host.st.game.team || []).length, 'the next turn is running for a full budget and no team was chosen');
  assert((await host.act('floor', { op: 'skip', token: pausedToken })).ok && host.st.floor.seat === 3, 'a stale skip does not move another player');
  const leaderId = host.st.meId;
  while (host.st.floor && host.st.floor.status !== 'select' && host.st.floor.speaker !== leaderId) {
    const tok = host.st.floor.token;
    await host.act('floor', { op: 'skip', token: tok });
    await until(() => host.st.floor && (host.st.floor.status === 'select' || host.st.floor.token !== tok));
  }
  assert(host.st.floor.speaker === leaderId && host.st.floor.seat === 1, 'the leader is reached last');
  const leadToken = host.st.floor.token;
  assert((await host.act('floor', { op: 'skip', token: leadToken })).ok, 'skipping the leader finishes the discussion');
  await until(() => host.st.floor && host.st.floor.status === 'select');
  assert(!host.st.floor.speaker && host.st.game.phase === 'team' && host.st.game.leaderId === leaderId && !(host.st.game.team || []).length, 'leader skip opens selection without another turn or a chosen team');
  assert((await host.act('floor', { op: 'skip', token: leadToken })).error || host.st.floor.status === 'select', 'a delayed skip cannot reopen speaking');
  const other = cs.find(c => c.st.meId !== leaderId);
  assert(other.st.floor.status === 'select' && !other.st.floor.speaker, 'a reconnecting view matches the finished discussion');
  cs.forEach(c => { try { c.s.close(); } catch (e) {} });
}
async function domSkip(url, pid) {
  const port = 53300 + (process.pid % 200);
  const dir = '/tmp/chrome-floor-skip-' + process.pid;
  fs.mkdirSync(dir, { recursive: true });
  track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
  let tab; for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + port + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
  const dev = new Dev(tab.webSocketDebuggerUrl); await dev.ready(); await dev.send('Runtime.enable'); await dev.send('Page.enable');
  await dev.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('cc.pid', ${JSON.stringify(pid)}); localStorage.removeItem('cc.token'); localStorage.setItem('cc.profile', ${JSON.stringify(JSON.stringify({ name: '隊', avatar: 'fox', bg: '#fff', fx: 'none', pendant: 'none' }))});` });
  await dev.send('Page.navigate', { url });
  const view = await dev.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { if (document.body.innerText.includes('已連續兩次派隊不通過，直接由隊長選隊')) { clearInterval(t); r({ note: true, clock: !!document.querySelector('.floor-time'), glow: document.querySelectorAll('.is-speak').length, pick: !!document.querySelector('.pick-team') }); } else if (Date.now()-t0>8000) { clearInterval(t); r({ text: document.body.innerText.slice(0, 160) }); } }, 40); })`);
  assert(view.note && !view.clock && view.glow === 0 && view.pick, 'skipped discussion shows the leader prompt and no countdown ' + JSON.stringify(view));
  try { dev.ws.close(); } catch (e) {}
}
async function table(url) {
  const host = await mk(url, '主');
  const room = (await host.emit('create')).room;
  assert((await host.act('capacity', { n: 10 })).ok, 'capacity 10');
  assert((await host.act('settings', { mic: true })).ok, 'mic mode on');
  await until(() => host.st && host.st.floor == null && host.st.settings && host.st.settings.mic === true);
  assert(host.st.floor == null, 'lobby has no speaking countdown');
  const cs = [host];
  for (let i = 2; i <= 10; i++) {
    const p = await mk(url, '座' + i);
    assert((await p.emit('join', { code: room })).room === room, 'join ' + i);
    assert((await p.act('sit', { seat: i })).ok, 'sit ' + i);
    cs.push(p);
  }
  assert((await host.act('start')).ok, 'start');
  await until(() => host.st && host.st.game && host.st.floor && host.st.floor.speaker);
  return { host, cs, room };
}

(async () => {
  assert(SPEAK_MS === 90000, 'default turn is 90 seconds');
  const full = speakOrder(10, 0, Array(10).fill(true)).map(i => i + 1);
  assert(JSON.stringify(full) === JSON.stringify([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 'leader seat 1 speaks last, starting at their right (seat 10) ' + full.join(','));
  const hole = speakOrder(10, 0, [true, true, true, true, true, true, true, true, true, false]).map(i => i + 1);
  assert(JSON.stringify(hole) === JSON.stringify([9, 8, 7, 6, 5, 4, 3, 2, 1]), 'empty seat on the leader right is skipped ' + hole.join(','));
  const from3 = speakOrder(10, 2, Array(10).fill(true)).map(i => i + 1);
  assert(from3[0] === 2 && from3[from3.length - 1] === 3 && from3.length === 10, 'seat 3 also starts at their own right and speaks last ' + from3.join(','));

  const main = await boot(41200 + (process.pid % 200), {});
  const game = await table(main.url);
  const floor = game.host.st.floor;
  const leader = game.host.st.game.leaderId;
  assert(game.host.st.game.seats[0].id === leader, 'forced leader is physical seat 1');
  assert(JSON.stringify(floor.seats) === JSON.stringify([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 'live order is 10 then 9 down to the leader');
  assert(floor.order.length === 10 && new Set(floor.order).size === 10, 'each seated player once');
  assert(floor.ms === 90000 && floor.deadline - Date.now() > 85000 && floor.deadline - Date.now() <= 90000, 'deadline is about 90 seconds');
  assert(floor.index === 0 && floor.speaker === floor.order[0] && floor.seat === 10, 'first speaker is seat 10');
  const late = await mk(main.url, '旁');
  assert((await late.emit('join', { code: game.room })).room === game.room, 'late join');
  await until(() => late.st && late.st.floor && late.st.floor.token === floor.token);
  assert(late.st.floor.speaker === floor.speaker && late.st.floor.deadline === floor.deadline, 'late join sees the same turn');
  const other = game.cs.find(c => c.st.meId !== floor.speaker);
  assert((await other.emit('voice:mic', { on: true })).error, 'non-current player cannot publish');
  assert((await other.emit('voice:signal', { to: floor.speaker, kind: 'offer', sdp: 'v=0\r\n' + 'x'.repeat(20) })).error, 'non-current offer is rejected');
  assert((await other.emit('voice:listen', {})).ok, 'listening does not need a microphone');
  assert(!other.voice.some(v => v && v.on), 'rejecting a turn does not unmute anyone');
  const speaker = game.cs.find(c => c.st.meId === floor.speaker);
  const token = floor.token;
  const ended = await Promise.all([speaker.act('floor', { op: 'end', token }), speaker.act('floor', { op: 'end', token })]);
  assert(ended.filter(r => r && r.ok).length >= 1, 'early end accepted');
  await until(() => game.host.st.floor && game.host.st.floor.index === 1);
  assert(game.host.st.floor.speaker === floor.order[1] && game.host.st.floor.seat === 9, 'early end advances once to seat 9');
  assert(game.host.st.floor.deadline - Date.now() > 85000, 'the next speaker gets a fresh 90 seconds');
  const next = game.cs.find(c => c.st.meId === game.host.st.floor.speaker);
  const stuck = game.host.st.floor.index;
  assert((await next.act('floor', { op: 'end', token }) ).ok, 'stale token is ignored');
  await sleep(80);
  assert(game.host.st.floor.index === stuck, 'a repeated end does not skip another player');
  const guest = game.cs.find(c => c !== game.host);
  assert((await guest.act('floor', { op: 'restart' })).error, 'non-host cannot restart');
  const before = game.host.st.floor.id;
  assert((await game.host.act('floor', { op: 'restart' })).ok, 'host restart');
  await until(() => game.host.st.floor && game.host.st.floor.id !== before && game.host.st.floor.index === 0);
  assert(game.host.st.floor.seat === 10 && JSON.stringify(game.host.st.floor.seats) === JSON.stringify(floor.seats), 'restart keeps the same right-hand order');
  await domTalk(main.url, game);
  assert((await game.host.act('settings', { mic: false })).ok, 'host disables mic mode');
  await until(() => game.host.st.floor == null && game.host.st.settings.mic === false);
  assert((await speaker.emit('voice:mic', { on: true })).error, 'mode off rejects transmit');
  assert((await game.host.act('settings', { mic: true })).ok, 'host enables mic again');
  await until(() => game.host.st.floor && game.host.st.floor.index === 0 && game.host.st.floor.seat === 10);
  assert(!game.cs.some(c => c.voice.some(v => v && v.on)), 'a new turn does not unmute anyone');
  const team = game.host.st.game.seats.slice(0, 3).map(s => s.id);
  const leaderBefore = game.host.st.game.leaderId;
  const blocked = await game.host.act('propose', { team });
  assert(blocked.error && game.host.st.game.phase === 'team' && game.host.st.game.leaderId === leaderBefore && !(game.host.st.game.team || []).length, 'mic mode rejects a team before speaking finishes');
  assert((await game.host.act('settings', { mic: false })).ok, 'mic off removes the speech gate');
  await until(() => game.host.st.floor == null && game.host.st.settings.mic === false);
  assert((await game.host.act('propose', { team })).ok, 'mic off keeps immediate team selection');
  await until(() => game.host.st.game.phase === 'vote' && game.host.st.floor == null);
  assert(game.host.st.floor == null && game.host.st.game.leaderId === leaderBefore, 'voting clears the speaking turn without changing the leader');
  game.cs.forEach(c => c.s.close()); late.s.close();

  const quick = await boot(41400 + (process.pid % 200), { SPEAK_MS: '2000', PRESENCE_GRACE_MS: '350' });
  const q = await table(quick.url);
  assert(q.host.st.floor.ms === 2000, 'test server uses its speaking budget');
  const firstDeadline = q.host.st.floor.deadline;
  await until(() => q.host.st.floor && q.host.st.floor.index === 1, 4000);
  assert(q.host.st.floor.seat === 9 && q.host.st.floor.deadline !== firstDeadline, 'expiry advances to the next seat');
  assert(JSON.stringify(q.host.st.floor.seats) === JSON.stringify([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 'expiry does not rebuild the order');
  const cur = q.cs.find(c => c.st.meId === q.host.st.floor.speaker);
  const deadline = q.host.st.floor.deadline;
  const index = q.host.st.floor.index;
  cur.s.disconnect();
  await sleep(120);
  assert(q.host.st.floor.speaker === cur.st.meId && q.host.st.floor.deadline === deadline && q.host.st.seats.find(s => s.id === cur.st.meId).online === true, 'reconnect grace keeps the speaker and the deadline');
  cur.s.connect();
  await new Promise(r => cur.s.once('connect', r));
  await cur.emit('hello', { pid: cur.pid, name: '回', avatar: 'fox' });
  await sleep(80);
  assert(q.host.st.floor.index === index && q.host.st.floor.deadline === deadline, 'reconnecting does not restart the budget or the order');
  cur.s.disconnect();
  await sleep(700);
  await until(() => q.host.st.floor && q.host.st.floor.index === index + 1, 2000);
  assert(q.host.st.seats.find(s => s.id === cur.st.meId).online === false, 'after the grace the seat is offline');
  const skipped = q.host.st.floor.speaker;
  cur.s.connect();
  await new Promise(r => cur.s.once('connect', r));
  await cur.emit('hello', { pid: cur.pid, name: '回', avatar: 'fox' });
  await sleep(120);
  assert(q.host.st.floor.index === index + 1 && q.host.st.floor.speaker === skipped, 'coming back does not reclaim the skipped turn');
  const early = await speakUntilSelect(q.host, q.cs);
  assert(early.status === 'select' && early.seat == null && !early.deadline && early.selectId, 'early end opens selection once ' + JSON.stringify(early));
  assert(q.host.st.game.phase === 'team' && q.host.st.game.leaderId === q.host.st.meId && !(q.host.st.game.team || []).length, 'selection stays with the same leader and does not pick a team');
  assert(!JSON.stringify(early).match(/merlin|role|assassin|percival/), 'the speaking state does not carry roles');
  const selectId = early.selectId;
  const again = await Promise.all([q.host.act('floor', { op: 'end', token: early.token }), q.host.act('floor', { op: 'end', token: 1 })]);
  assert(again.every(r => r && r.ok), 'duplicate finish is a no-op');
  await sleep(60);
  assert(q.host.st.floor.selectId === selectId && q.host.st.floor.status === 'select' && q.host.st.game.phase === 'team', 'a late finish does not reopen selection or skip to voting');
  await domPick(quick.url, q);
  const picked = q.host.st.game.seats.slice(0, 3).map(s => s.id);
  assert((await q.host.act('propose', { team: picked })).ok, 'leader submits after the prompt');
  await until(() => q.host.st.game.phase === 'vote' && q.host.st.floor == null);
  assert((await q.host.act('propose', { team: picked })).error, 'a second submit does not reopen selection');
  q.cs.forEach(c => { try { c.s.close(); } catch (e) {} });
  const exp = await boot(41600 + (process.pid % 200), { SPEAK_MS: '200', PRESENCE_GRACE_MS: '300' });
  const e = await table(exp.url);
  const leaderId = e.host.st.game.leaderId;
  await until(() => e.host.st.floor && e.host.st.floor.status === 'select', 5000);
  const sid = e.host.st.floor.selectId;
  assert(e.host.st.floor.status === 'select' && sid && !e.host.st.floor.speaker && e.host.st.game.phase === 'team' && e.host.st.game.leaderId === leaderId && !(e.host.st.game.team || []).length, 'expiry opens selection for the same leader');
  await e.host.act('floor', { op: 'end', token: e.host.st.floor.token });
  await sleep(40);
  assert(e.host.st.floor.selectId === sid && e.host.st.game.phase === 'team', 'a late expiry finish does not skip to voting');
  assert((await e.host.act('endearly')).ok, 'clear the expiry game');
  await until(() => e.host.st.game.phase === 'end');
  assert((await e.host.act('start')).ok, 'start the next discussion');
  await until(() => e.host.st.floor && e.host.st.floor.status === 'speak');
  const sameLeader = e.host.st.game.leaderId;
  e.host.s.disconnect();
  await until(() => e.cs[1].st.floor && e.cs[1].st.floor.status === 'select', 5000);
  assert(e.cs[1].st.game.leaderId === sameLeader && e.cs[1].st.game.phase === 'team' && !(e.cs[1].st.game.team || []).length, 'an offline leader is not replaced or given a secret team');
  e.host.s.connect();
  await new Promise(r => e.host.s.once('connect', r));
  await e.host.emit('hello', { pid: e.host.pid, name: '主', avatar: 'fox' });
  await until(() => e.host.st && e.host.st.floor && e.host.st.floor.status === 'select');
  const ids = e.host.st.game.seats.slice(0, 3).map(s => s.id);
  assert((await e.host.act('propose', { team: ids })).ok, 'the same leader can select after reconnecting');
  await until(() => e.host.st.game.phase === 'vote');
  e.cs.forEach(c => { try { c.s.close(); } catch (err) {} });
  await rejectionGate();
  await fifthReject();
  await pauseClock();
  await skipTurn();
  killAll();
  console.log('FLOOR TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('FAILED', e); killAll(); process.exit(1); });
