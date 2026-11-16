// Simulate N players through full games against URL (default local)
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3000';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function mk(i, tag) {
  const pid = `sim${tag}${i}${Math.random().toString(36).slice(2, 10)}`;
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { i, pid, s, st: null };
  s.on('state', st => c.st = st);
  c.emit = (ev, d) => new Promise(r => s.emit(ev, d, r));
  c.act = (type, data) => c.emit('act', { type, data });
  c.ready = new Promise(r => s.on('connect', async () => { await c.emit('hello', { pid, name: `玩家${i + 1}`, avatar: '🙂' }); r(); }));
  return c;
}
async function until(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return; await sleep(30); } throw new Error('timeout waiting'); }
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); };

async function setup(n, tag, settings) {
  const cs = Array.from({ length: n }, (_, i) => mk(i, tag));
  await Promise.all(cs.map(c => c.ready));
  const r = await cs[0].emit('create'); assert(r.room && r.room.length === 4, 'room code');
  const cap = await cs[0].act('capacity', { n }); assert(cap && cap.ok, 'capacity ' + JSON.stringify(cap));
  for (const c of cs.slice(1)) { const j = await c.emit('join', { code: r.room.toLowerCase() }); assert(j.room === r.room, 'join ' + JSON.stringify(j)); }
  for (let i = 1; i < n; i++) { const s = await cs[i].act('sit', { seat: i + 1 }); assert(s.ok, 'sit '+i+' '+JSON.stringify(s)); }
  await until(() => cs.every(c => c.st && c.st.seated === n));
  const bad = await cs[1].act('start'); assert(bad.error, 'non-host cannot start');
  const sr = await cs[0].act('settings', settings); assert(sr.ok, 'settings ' + JSON.stringify(sr));
  const st = await cs[0].act('start'); assert(st.ok, 'start ' + JSON.stringify(st));
  await until(() => cs.every(c => c.st.game && c.st.game.me));
  return { cs, code: r.room };
}
function checkKnowledge(cs) {
  const roleOf = {}; cs.forEach(c => roleOf[c.st.meId] = c.st.game.me.role);
  const evil = r => ['assassin', 'morgana', 'mordred', 'oberon', 'minion', 'lancelot_evil'].includes(r);
  for (const c of cs) {
    const me = c.st.game.me; const ids = me.knows.map(k => k.id).sort();
    let exp = [];
    for (const [id, r] of Object.entries(roleOf)) { if (id === c.st.meId) continue;
      if (me.role === 'merlin' && evil(r) && r !== 'mordred') exp.push(id);
      else if (me.role === 'percival' && (r === 'merlin' || r === 'morgana')) exp.push(id);
      else if ((me.role === 'lancelot_good' || me.role === 'lancelot_evil') && (r === 'lancelot_good' || r === 'lancelot_evil')) exp.push(id);
      else if (evil(me.role) && me.role !== 'oberon' && evil(r) && r !== 'oberon') exp.push(id); }
    assert(JSON.stringify(ids) === JSON.stringify(exp.sort()), `knowledge for ${me.role}`);
    // no role leak in public seats
    assert(c.st.game.seats.every(s => s.role === undefined), 'role leak');
  }
  return roleOf;
}
// strategy: 'good' => evil plays success, assassin misses; 'evil' => evil fails quests; 'reject' => all reject
async function play(cs, strategy, log) {
  const by = id => cs.find(c => c.st.meId === id);
  for (let step = 0; step < 60; step++) {
    const g = cs[0].st.game;
    if (g.phase === 'end') return g;
    if (g.phase === 'team') {
      const leader = by(g.leaderId); const need = g.teamSizes[g.round];
      // wrong size should fail
      const wrong = await leader.act('propose', { team: [cs[0].st.meId] }); if (need !== 1) assert(wrong.error, 'wrong size rejected');
      const evilIds = cs.filter(c => c.st.game.me.side === 'evil').map(c => c.st.meId);
      const order = strategy === 'evil' ? evilIds.concat(g.seats.map(s => s.id).filter(id => !evilIds.includes(id))) : g.seats.map(s => s.id);
      const team = order.slice(0, need);
      // pick a team containing an evil player when strategy evil
      const r = await leader.act('propose', { team }); assert(r.ok, 'propose ' + JSON.stringify(r));
      await until(() => cs.every(c => c.st.game.phase === 'vote'));
    } else if (g.phase === 'vote') {
      const approve = strategy !== 'reject';
      await Promise.all(cs.map(c => c.act('vote', { approve })));
      const dup = await cs[0].act('vote', { approve }); assert(dup.error, 'double vote blocked');
      await until(() => cs.every(c => c.st.game.phase !== 'vote'));
      const ev = cs[0].st.lastEvent; log.push(`R${g.round + 1} vote ${ev.prev ? 'REJECT(5th)' : (ev.approved ? 'approve' : 'reject')}`);
    } else if (g.phase === 'sword') {
      const leader = by(g.leaderId); const other = g.team.find(id => id !== g.leaderId) || g.team[0];
      const r = await leader.act('sword', { id: other }); assert(r.ok, 'sword ' + JSON.stringify(r));
      await until(() => cs.every(c => c.st.game.phase !== 'sword'));
    } else if (g.phase === 'swordflip') {
      const holder = by(g.sword);
      const r = await holder.act('swordflip', { skip: true }); assert(r.ok, 'sword skip ' + JSON.stringify(r));
      await until(() => cs.every(c => c.st.game.phase !== 'swordflip'));
    } else if (g.phase === 'quest') {
      const members = g.team.map(by);
      await Promise.all(members.map(c => { const evil = c.st.game.me.side === 'evil'; return c.act('quest', { success: strategy === 'evil' ? !evil : true }); }));
      await until(() => cs.every(c => c.st.game.phase !== 'quest'));
      if (cs[0].st.game.phase === 'swordflip') continue;
      const q = cs[0].st.game.quests[g.round]; log.push(`R${g.round + 1} quest team=${g.team.length} fails=${q.fails} ${q.success ? 'SUCCESS' : 'FAIL'}`);
    } else if (g.phase === 'lady') {
      const holder = by(g.ladyId); const t = g.seats.find(s => s.id !== g.ladyId && !g.ladyUsed.includes(s.id));
      const bad = await holder.act('lady', { id: g.ladyUsed[0] === g.ladyId ? g.ladyId : g.ladyUsed[0] }); assert(bad.error, 'lady on used blocked');
      const r = await holder.act('lady', { id: t.id }); assert(r.ok, 'lady ' + JSON.stringify(r));
      await until(() => cs.every(c => c.st.game.phase !== 'lady'));
      const mine = holder.st.game.ladyLog.slice(-1)[0]; const other = cs.find(c => c !== holder).st.game.ladyLog.slice(-1)[0];
      assert(mine.side && (other.side === undefined || cs.find(c => c !== holder).st.meId === mine.holder), 'lady result private');
      log.push(`lady: ${mine.holder}->${mine.target} = ${mine.side}`);
    } else if (g.phase === 'assassin') {
      const as = cs.find(c => c.st.game.me.role === 'assassin');
      const nonAs = cs.find(c => c.st.game.me.role !== 'assassin');
      assert((await nonAs.act('assassinate', { id: as.st.meId })).error, 'non-assassin blocked');
      const target = cs.find(c => c.st.game.me.side === 'good' && c.st.game.me.role !== 'merlin');
      const r = await as.act('assassinate', { id: target.st.meId }); assert(r.ok, 'assassinate');
      log.push(`assassin targets ${target.st.game.me.role}`);
      await until(() => cs.every(c => c.st.game.phase === 'end'));
    }
  }
  throw new Error('game did not finish');
}
(async () => {
  const results = [];
  // Game 1: 5 players, good wins (assassin misses). Note good players "try" to fail -> server forces success.
  { const { cs, code } = await setup(5, 'a', { percival: true, morgana: true, mordred: false, oberon: false });
    const roles = checkKnowledge(cs); const log = [];
    const g = await play(cs, 'good', log);
    assert(g.winner === 'good', 'good should win'); assert(g.seats.every(s => s.role), 'roles revealed at end');
    // reconnect test: new socket with same pid keeps seat
    const c2 = io(URL, { transports: ['websocket'], forceNew: true }); let st2;
    c2.on('state', s => st2 = s); await new Promise(r => c2.on('connect', r));
    const h = await new Promise(r => c2.emit('hello', { pid: cs[2].pid, name: 'x' }, r));
    await until(() => st2); assert(h.room === code && st2.meId === cs[2].st.meId, 'reconnect keeps seat'); c2.close();
    const hist = await fetch(`${URL}/api/history?pid=${cs[0].pid}`).then(r => r.json());
    const stats = await fetch(`${URL}/api/stats?pid=${cs[0].pid}`).then(r => r.json());
    assert(hist.length === 1 && stats.played === 1, 'history/stats saved');
    // back to lobby + second game: evil fails quests
    assert((await cs[0].act('lobby')).ok, 'lobby');
    assert((await cs[0].act('start')).ok, 'restart'); await until(() => cs.every(c => c.st.game && c.st.game.phase === 'team' && c.st.game.rounds.every(r => !r.length)));
    const log2 = []; const g2 = await play(cs, 'evil', log2); assert(g2.winner === 'evil', 'evil should win');
    results.push({ game: '5p good-win', roles: Object.values(roles), log, reason: g.reason }, { game: '5p evil-quests', log: log2, reason: g2.reason });
    cs.forEach(c => c.s.close()); }
  // Game 2: 5 players all reject -> 5 rejects
  { const { cs } = await setup(5, 'b', { percival: false, morgana: false });
    const log = []; const g = await play(cs, 'reject', log); assert(g.winner === 'evil' && g.rejects === 5, '5 rejects');
    results.push({ game: '5p five-rejects', log, reason: g.reason }); cs.forEach(c => c.s.close()); }
  // Game 3: 7 players with all roles; check 2-fail rule at round 4 is applied
  { const { cs } = await setup(7, 'c', { percival: true, morgana: true, mordred: true, oberon: false });
    checkKnowledge(cs); const log = []; const g = await play(cs, 'good', log); assert(g.winner === 'good', '7p good');
    assert(g.twoFailRound === 3, 'two fail round'); results.push({ game: '7p all roles', log, reason: g.reason }); cs.forEach(c => c.s.close()); }
  // Settings validation: 5p with morgana+mordred+oberon should fail
  { const { cs } = await (async () => { const cs = Array.from({ length: 5 }, (_, i) => mk(i, 'd')); await Promise.all(cs.map(c => c.ready));
      const r = await cs[0].emit('create'); await cs[0].act('capacity', { n: 5 }); for (const c of cs.slice(1)) await c.emit('join', { code: r.room });
      for (let i=1;i<5;i++) await cs[i].act('sit', { seat: i+1 }); return { cs }; })();
    await cs[0].act('settings', { morgana: true, mordred: true, oberon: true }); const r = await cs[0].act('start');
    assert(r.error, 'too many evil roles rejected'); results.push({ game: 'validation', error: r.error }); cs.forEach(c => c.s.close()); }
  // 10 players oberon
  { const { cs } = await setup(10, 'e', { percival: true, morgana: true, mordred: true, oberon: true });
    checkKnowledge(cs); const log = []; const g = await play(cs, 'evil', log); assert(g.winner === 'evil', '10p evil'); results.push({ game: '10p oberon', log, reason: g.reason }); cs.forEach(c => c.s.close()); }
  // 8 players with Lady of the Lake
  { const { cs } = await setup(8, 'f', { percival: true, morgana: true, mordred: false, oberon: false, lady: true });
    const log = []; const g = await play(cs, 'good', log); assert(g.winner === 'good' && g.ladyLog.length >= 1, '8p lady');
    assert(g.scores && g.mvp && g.highlights, 'scores computed');
    const det = await fetch(`${URL}/api/game/${g.gid}?pid=${cs[0].pid}`).then(r => r.json()); assert(det.rounds && det.myId === cs[0].st.meId && det.mvp, 'detail api');
    results.push({ game: '8p lady', log, reason: g.reason, mvp: g.mvp, highlights: g.highlights }); cs.forEach(c => c.s.close()); }
  // 11 players: Lancelot default on, both Lancelots know each other
  { const { cs } = await setup(11, 'g', { lady: false, excalibur: false, lancelot: true });
    const roles = checkKnowledge(cs);
    const vals = Object.values(roles);
    assert(vals.includes('lancelot_good') && vals.includes('lancelot_evil'), '11p lancelots');
    const log = []; const g = await play(cs, 'good', log); assert(g.winner === 'good', '11p good');
    results.push({ game: '11p lancelot', roles: vals, log, reason: g.reason }); cs.forEach(c => c.s.close()); }
  // 5p Excalibur: sword given then skipped, game proceeds
  { const { cs } = await setup(5, 'h', { percival: true, morgana: true, mordred: false, oberon: false, excalibur: true, lady: false });
    const log = []; const g = await play(cs, 'good', log); assert(g.winner === 'good', '5p excalibur');
    results.push({ game: '5p excalibur', log, reason: g.reason }); cs.forEach(c => c.s.close()); }
  // veto card: cancels proposal without incrementing rejects
  { const cs = Array.from({ length: 5 }, (_, i) => mk(i, 'v')); await Promise.all(cs.map(c => c.ready));
    const r0 = await cs[0].emit('create'); await cs[0].act('capacity', { n: 5 });
    for (const c of cs.slice(1)) await c.emit('join', { code: r0.room });
    for (let i=1;i<5;i++) await cs[i].act('sit', { seat: i+1 });
    await cs[0].act('settings', { veto: true, percival: true, morgana: true });
    assert((await cs[0].act('start')).ok, 'veto start'); await until(() => cs.every(c => c.st.game && c.st.game.me));
    const g0 = cs[0].st.game; const leader = cs.find(c => c.st.meId === g0.leaderId);
    const team = g0.seats.map(s => s.id).slice(0, g0.teamSizes[0]);
    assert((await leader.act('propose', { team })).ok, 'veto propose');
    await until(() => cs[0].st.game.phase === 'vote');
    const member = cs.find(c => team.includes(c.st.meId) && c.st.meId !== g0.leaderId);
    const vr = await member.act('veto'); assert(vr.ok, 'veto ' + JSON.stringify(vr));
    await until(() => cs[0].st.game.phase === 'team');
    assert(cs[0].st.game.rejects === 0, 'veto does not increment rejects');
    assert((cs[0].st.game.vetoBlocked || []).includes(member.st.meId), 'veto blocks for the round');
    results.push({ game: 'veto card' }); cs.forEach(c => c.s.close()); }
  // accounts: guest upgrade + login
  { const key = 'acct' + Math.random().toString(36).slice(2, 10) + 'xx';
    const g = await fetch(URL + '/api/auth/guest', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ guestKey: key, profile: { name: '帳號測' } }) }).then(r=>r.json());
    assert(g.token && g.user && g.user.guest, 'guest ' + JSON.stringify(g));
    const uname = 'u' + Math.random().toString(36).slice(2, 8);
    const reg = await fetch(URL + '/api/auth/register', { method:'POST', headers:{'content-type':'application/json', Authorization:'Bearer '+g.token}, body: JSON.stringify({ username: uname, password: '1234' }) }).then(r=>r.json());
    assert(reg.token && reg.user && reg.user.username === uname && !reg.user.guest, 'register ' + JSON.stringify(reg));
    const me = await fetch(URL + '/api/me', { headers: { Authorization: 'Bearer ' + reg.token } }).then(r=>r.json());
    assert(me.user && me.user.id === g.user.id, 'upgrade keeps id');
    const login = await fetch(URL + '/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ username: uname, password: '1234' }) }).then(r=>r.json());
    assert(login.token && login.user.username === uname, 'login');
    const bad = await fetch(URL + '/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ username: uname, password: '0000' }) });
    assert(bad.status === 401, 'bad pin rejected');
    results.push({ game: 'accounts', username: uname }); }

  console.log(JSON.stringify(results, null, 1)); console.log('ALL TESTS PASSED'); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
