// Early assassination + resume after tab close and full server restart (room/game persisted in DB)
const { io } = require('socket.io-client');
const { spawn } = require('child_process');
const fs = require('fs');
const PORT = 3100, URL = 'http://127.0.0.1:' + PORT, DATA = '/tmp/avtest-' + Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(f, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return; await sleep(40); } throw new Error('timeout'); }
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
let srv;
async function startServer() {
  srv = spawn(process.execPath, ['server.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT, DATA_DIR: DATA, DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.on('data', d => { if (/on :/.test(String(d))) r(); }));
}
async function mk(pid, name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false }); const c = { s, st: null, pid };
  c.emit = (e, d) => new Promise(r => s.emit(e, d, r)); c.act = (t, d) => c.emit('act', { type: t, data: d });
  s.on('state', st => c.st = st); await new Promise(r => s.on('connect', r)); c.hello = await c.emit('hello', { guestKey: pid, name }); return c;
}
async function room5(tag) {
  const cs = []; for (let i = 0; i < 5; i++) cs.push(await mk('rs' + tag + i + Math.random().toString(36).slice(2, 8), 'P' + i));
  const { room } = await cs[0].emit('create'); await cs[0].act('capacity', { n: 5 });
  for (let i = 1; i < 5; i++) { await cs[i].emit('join', { code: room }); await cs[i].act('sit', { seat: i + 1 }); }
  assert((await cs[0].act('start')).ok, 'game started (' + tag + ')');
  await until(() => cs.every(c => c.st && c.st.game && c.st.game.me && c.st.game.phase === 'team'));
  return { cs, room };
}
(async () => {
  await startServer();
  // ---- early assassination ----
  for (const hit of [true, false]) {
    const { cs } = await room5(hit ? 'hit' : 'miss');
    const ass = cs.find(c => c.st.game.me.role === 'assassin'); const other = cs.find(c => c !== ass);
    assert((await other.act('earlyassassin')).error, 'non-assassin cannot trigger early assassination');
    assert((await ass.act('earlyassassin')).ok, 'assassin triggers early assassination');
    await until(() => cs.every(c => c.st.game.phase === 'assassin'));
    const g = other.st.game; const evilIds = cs.filter(c => ['assassin', 'morgana', 'minion', 'mordred'].includes(c.st.game.me.role)).map(c => c.st.meId);
    assert(g.earlyAssassin && g.seats.filter(s => s.evil).map(s => s.id).sort().join() === evilIds.sort().join(), 'red team revealed to everyone');
    const merlin = cs.find(c => c.st.game.me.role === 'merlin'); const wrong = cs.find(c => c.st.game.me.side === 'good' && c.st.game.me.role !== 'merlin');
    const tgt = hit ? merlin : wrong;
    assert((await ass.act('assassinate', { id: tgt.st.meId })).ok, 'assassin picks target');
    await until(() => cs.every(c => c.st.game.phase === 'end'));
    assert(other.st.game.winner === (hit ? 'evil' : 'good'), hit ? 'hit Merlin -> red wins' : 'missed -> blue wins');
    await sleep(300);
    const d = await (await fetch(URL + '/api/game/' + other.st.game.gid)).json(); const gg = d.game || d;
    assert(gg.winner === (hit ? 'evil' : 'good') && gg.scores, 'recorded in history with scores');
    cs.forEach(c => c.s.close());
  }
  // ---- resume ----
  const { cs, room } = await room5('res');
  const lead = cs.find(c => c.st.meId === c.st.game.leaderId);
  const team = cs[0].st.game.seats.map(s => s.id).filter(id => id !== lead.st.meId).slice(0, cs[0].st.game.teamSizes[0] - 1).concat(lead.st.meId);
  await lead.act('propose', { team }); await until(() => cs[0].st.game.phase === 'vote');
  await cs[1].act('vote', { v: true }); await sleep(200);
  const victim = cs[2]; const before = { role: victim.st.game.me.role, seat: victim.st.mySeat || victim.st.game.seats.findIndex(s => s.id === victim.st.meId) + 1, gid: victim.st.game.gid, phase: victim.st.game.phase, knows: JSON.stringify(victim.st.game.me.knows) };
  victim.s.close(); // close tab
  await until(() => cs[0].st.game.seats.find(s => s.id === victim.st.meId).online === false);
  assert(true, 'disconnected player shows offline, seat kept');
  let back = await mk(victim.pid, 'P2');
  assert(back.hello.room === room, 'reopening restores the room');
  await until(() => back.st && back.st.game && back.st.game.me);
  assert(back.st.game.me.role === before.role && back.st.game.gid === before.gid && back.st.game.phase === 'vote' && JSON.stringify(back.st.game.me.knows) === before.knows, 'same role, same game, same phase after reopening');
  await sleep(1500); // let snapshot flush
  cs.forEach(c => c.s.close()); back.s.close();
  srv.kill('SIGTERM'); await new Promise(r => srv.on('exit', r));
  await startServer();
  const all = []; for (const c of cs) all.push(await mk(c.pid, 'x'));
  const v2 = all[2];
  assert(v2.hello.room === room, 'after server restart the room is restored');
  await until(() => all.every(c => c.st && c.st.game && c.st.game.me));
  assert(v2.st.game.me.role === before.role && v2.st.game.gid === before.gid && v2.st.game.phase === 'vote' && v2.st.game.voted.length >= 1, 'after server restart: same role, phase and votes kept');
  for (const c of all) if (!c.st.game.me.voted) await c.act('vote', { v: true });
  await until(() => all[0].st.game.phase !== 'vote');
  assert(true, 'game continues after restart (phase ' + all[0].st.game.phase + ')');
  all.forEach(c => c.s.close()); srv.kill(); fs.rmSync(DATA, { recursive: true, force: true });
  console.log('RESUME TESTS PASSED'); process.exit(0);
})().catch(e => { console.error('FAILED', e); srv && srv.kill(); process.exit(1); });
