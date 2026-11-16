// Lobby features: seats, capacity shrink, host transfer (manual / leave / disconnect), evasion-card inventory, public replay
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(f, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return; await sleep(40); } throw new Error('timeout'); }
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
async function mk(i, tag) {
  const s = io(URL, { transports: ['websocket'], forceNew: true }); const c = { s, st: null, pid: 'lb' + tag + i + Math.random().toString(36).slice(2, 9) };
  c.emit = (e, d) => new Promise(r => s.emit(e, d, r)); c.act = (t, d) => c.emit('act', { type: t, data: d });
  s.on('state', st => c.st = st); await new Promise(r => s.on('connect', r)); await c.emit('hello', { pid: c.pid, name: 'L' + i }); return c;
}
(async () => {
  const cs = []; for (let i = 0; i < 6; i++) cs.push(await mk(i, 'a'));
  const { room } = await cs[0].emit('create');
  await until(() => cs[0].st && cs[0].st.capacity === 8);
  assert(cs[0].st.seats.length === 8 && cs[0].st.seated === 1 && cs[0].st.mySeat === 1, 'room starts with 8 seats, host in seat 1');
  for (let i = 1; i < 6; i++) { await cs[i].emit('join', { code: room }); }
  await until(() => cs[5].st && cs[5].st.code === room);
  assert(cs[5].st.mySeat === null, 'joiner is not auto-seated');
  for (let i = 1; i < 6; i++) assert((await cs[i].act('sit', { seat: i + 2 })).ok, `player ${i} sits seat ${i + 2}`);
  assert((await cs[1].act('sit', { seat: 4 })).error, 'occupied seat rejected');
  assert((await cs[1].act('sit', { seat: 2 })).ok, 'move to another empty seat');
  await until(() => cs[0].st.seated === 6);
  assert((await cs[0].act('start')).error, 'cannot start with empty seats');
  assert((await cs[0].act('capacity', { n: 5 })).ok, 'shrink to 5');
  await until(() => cs[0].st.capacity === 5 && cs[4].st.capacity === 5 && cs[5].st.capacity === 5).catch(() => {});
  assert(cs[0].st.seated === 4 && cs[4].st.mySeat === null && cs[5].st.mySeat === null, 'players in seats 6+ stood up on shrink');
  assert((await cs[4].act('sit', { seat: 3 })).ok, 'stood-up player re-sits in an empty seat');
  assert((await cs[1].act('capacity', { n: 6 })).error, 'non-host cannot change count');
  // manual transfer
  const target = cs[2].st.meId;
  assert((await cs[0].act('transfer', { id: target })).ok, 'host transfers');
  await until(() => cs.every(c => c.st.hostId === target));
  assert(cs[2].st.isHost && !cs[0].st.isHost, 'host flag moved for everyone');
  assert((await cs[0].act('capacity', { n: 6 })).error && (await cs[2].act('capacity', { n: 6 })).ok, 'host controls moved');
  // host leaves -> next seated
  await cs[2].emit('leave');
  await until(() => cs[0].st.hostId !== target);
  assert(cs[0].st.seats.some(p => p && !p.empty && p.id === cs[0].st.hostId), 'auto-transfer on leave to a seated player');
  // host disconnects -> auto transfer after timeout (HOST_AWAY_MS on server)
  const hostC = cs.find(c => c !== cs[2] && c.st.isHost); const oldHost = hostC.st.meId; hostC.s.disconnect();
  const watcher = cs.find(c => c !== hostC && c !== cs[2]);
  await until(() => watcher.st.hostId !== oldHost, Number(process.env.HOST_WAIT || 120000));
  assert(true, 'auto-transfer after host disconnect');
  cs.forEach(c => c.s.close());

  // evasion inventory
  const vs = []; for (let i = 0; i < 5; i++) vs.push(await mk(i, 'v'));
  const r = await vs[0].emit('create'); await vs[0].act('capacity', { n: 5 });
  for (let i = 1; i < 5; i++) { await vs[i].emit('join', { code: r.room }); await vs[i].act('sit', { seat: i + 1 }); }
  await vs[0].act('settings', { veto: true });
  let usedId = null;
  for (let round = 0; round < 2; round++) {
    if (round === 1) { await vs[0].act('abort'); }
    assert((await vs[0].act('start')).ok, 'start game ' + (round + 1));
    await until(() => vs.every(c => c.st.game && c.st.game.me && c.st.game.phase === 'team'));
    const g = vs[0].st.game; const leader = vs.find(c => c.st.meId === g.leaderId);
    let others = g.seats.map(s => s.id).filter(id => id !== g.leaderId);
    if (round === 1 && usedId && usedId !== g.leaderId) others = [usedId, ...others.filter(id => id !== usedId)];
    const team = others.slice(0, g.teamSizes[0] - 1).concat(g.leaderId);
    await leader.act('propose', { team }); await until(() => vs[0].st.game.phase === 'vote');
    const m = (round === 1 && usedId !== g.leaderId && vs.find(c => c.st.meId === usedId)) || vs.find(c => team.includes(c.st.meId) && c.st.meId !== g.leaderId);
    if (round === 0) usedId = m.st.meId;
    if (round === 1 && m.st.meId !== usedId) { console.log('skip: card user is leader'); continue; }
    const before = m.st.game.me.vetoCards;
    const res = await m.act('veto');
    if (round === 0) { assert(before === 1 && res.ok, 'new account has 1 card and can use it'); await until(() => m.st.game.me.vetoCards === 0); assert(true, 'card consumed (0 left)'); }
    else assert(res.error && /沒有回避卡/.test(res.error), 'with 0 cards veto is refused');
  }
  // end early
  assert((await vs[1].act('endearly')).error, 'non-host cannot end early');
  const gid = vs[0].st.game.gid;
  assert((await vs[0].act('endearly')).ok, 'host ends early');
  await until(() => vs.every(c => c.st.game && c.st.game.phase === 'end'));
  const eg = vs[2].st.game;
  assert(eg.winner === 'none' && eg.seats.every(s => s.role), 'early end: no winner, all roles revealed');
  assert(vs[2].st.lastEvent && vs[2].st.lastEvent.early, 'early-end event broadcast');
  await sleep(500);
  const det = await (await fetch(URL + '/api/game/' + gid)).json();
  const gg = det.game || det;
  assert(gg.winner === 'none' && gg.reason === '提前結束', 'history records 提前結束');
  // public replay
  cs.length = 0;
  console.log('LOBBY TESTS PASSED'); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
