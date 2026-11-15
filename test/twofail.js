// 7 players: R1 S, R2 F, R3 S, R4 one fail -> must still SUCCEED (2 fails needed) => good 3 wins
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3000';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return; await sleep(30); } throw new Error('timeout'); }
(async () => {
  const cs = await Promise.all(Array.from({ length: 7 }, (_, i) => new Promise(res => {
    const pid = 'tf' + i + Math.random().toString(36).slice(2, 10); const s = io(URL, { transports: ['websocket'], forceNew: true });
    const c = { s, st: null, emit: (e, d) => new Promise(r => s.emit(e, d, r)) }; c.act = (t, d) => c.emit('act', { type: t, data: d });
    s.on('state', st => c.st = st); s.on('connect', async () => { await c.emit('hello', { pid, name: 'P' + i }); res(c); });
  })));
  const { room } = await cs[0].emit('create'); for (const c of cs.slice(1)) await c.emit('join', { code: room });
  await cs[0].act('start'); await until(() => cs.every(c => c.st.game && c.st.game.me));
  const by = id => cs.find(c => c.st.meId === id); const side = c => c.st.game.me.side;
  const evils = cs.filter(c => side(c) === 'evil').map(c => c.st.meId), goods = cs.filter(c => side(c) === 'good').map(c => c.st.meId);
  const plan = [{ e: 0, fail: 0 }, { e: 1, fail: 1 }, { e: 0, fail: 0 }, { e: 2, fail: 1 }];
  for (let r = 0; r < 4; r++) {
    const g = cs[0].st.game; const need = g.teamSizes[r];
    const team = evils.slice(0, plan[r].e).concat(goods).slice(0, need);
    await by(g.leaderId).act('propose', { team }); await until(() => cs[0].st.game.phase === 'vote');
    await Promise.all(cs.map(c => c.act('vote', { approve: true }))); await until(() => cs[0].st.game.phase === 'quest');
    let failsLeft = plan[r].fail;
    for (const id of team) { const c = by(id); const f = side(c) === 'evil' && failsLeft-- > 0; await c.act('quest', { success: !f }); }
    await until(() => cs[0].st.game.quests[r]);
    console.log('R' + (r + 1), JSON.stringify({ size: need, fails: cs[0].st.game.quests[r].fails, success: cs[0].st.game.quests[r].success }));
  }
  const q4 = cs[0].st.game.quests[3];
  if (!(q4.fails === 1 && q4.success && cs[0].st.game.phase === 'assassin')) { console.error('FAILED two-fail rule'); process.exit(1); }
  console.log('TWO-FAIL RULE OK; phase =', cs[0].st.game.phase); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
