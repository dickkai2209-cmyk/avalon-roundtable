'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// ---------- persistence ----------
let db = { games: [], stats: {} };
try { fs.mkdirSync(DATA_DIR, { recursive: true }); db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { /* fresh */ }
db.games = db.games || []; db.stats = db.stats || {};
let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); } catch (e) { console.error('save failed', e.message); }
  }, 200);
}

// ---------- rules ----------
const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
};
const EVIL_COUNT = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
const GOOD_ROLES = ['merlin', 'percival', 'servant'];
const ROLE_SIDE = { merlin: 'good', percival: 'good', servant: 'good', assassin: 'evil', morgana: 'evil', mordred: 'evil', oberon: 'evil', minion: 'evil' };
const ROLE_NAME = { merlin: '梅林', percival: '派西維爾', servant: '亞瑟的忠臣', assassin: '刺客', morgana: '莫甘娜', mordred: '莫德雷德', oberon: '奧伯倫', minion: '莫德雷德的爪牙' };
const needTwoFails = (n, round) => n >= 7 && round === 3;

const pubId = (pid) => crypto.createHash('sha256').update(String(pid)).digest('hex').slice(0, 10);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cleanName = (s) => Array.from(String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim()).slice(0, 10).join('') || '騎士';
const cleanAvatar = (s) => { s = String(s || ''); if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 16000) return s; return Array.from(s).slice(0, 3).join('') || '🦊'; };
const cleanBg = (s) => /^#[0-9a-fA-F]{6}$/.test(String(s)) ? s : '#f3d9a4';
const FX = ['none', 'spot', 'gold', 'spark'];
const cleanFx = (s) => FX.includes(s) ? s : 'spot';
const pubPlayer = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, bg: p.bg, fx: p.fx });

// ---------- rooms ----------
const rooms = new Map();           // code -> room
const pidRoom = new Map();         // pid -> code
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!rooms.has(c)) return c; }
}

function makeRoom(host) {
  const code = newCode();
  const room = {
    code, hostPid: host.pid, createdAt: Date.now(), touched: Date.now(),
    players: [], // {pid, id, name, avatar}
    settings: { percival: true, morgana: true, mordred: false, oberon: false, lady: false },
    game: null, eventSeq: 0,
  };
  rooms.set(code, room);
  return room;
}

function findPlayer(room, pid) { return room.players.find(p => p.pid === pid); }

function validateSettings(n, s) {
  const evilSpecial = 1 + (s.morgana ? 1 : 0) + (s.mordred ? 1 : 0) + (s.oberon ? 1 : 0);
  if (evilSpecial > EVIL_COUNT[n]) return `${n} 人局只有 ${EVIL_COUNT[n]} 個壞人，請減少壞人角色`;
  const goodSpecial = 1 + (s.percival ? 1 : 0);
  if (goodSpecial > n - EVIL_COUNT[n]) return '好人角色太多';
  return null;
}

function buildRoles(n, s) {
  const evil = ['assassin']; if (s.morgana) evil.push('morgana'); if (s.mordred) evil.push('mordred'); if (s.oberon) evil.push('oberon');
  while (evil.length < EVIL_COUNT[n]) evil.push('minion');
  const good = ['merlin']; if (s.percival) good.push('percival');
  while (good.length < n - EVIL_COUNT[n]) good.push('servant');
  return shuffle(good.concat(evil));
}

function startGame(room) {
  const n = room.players.length;
  if (n < 5 || n > 10) return '需要 5 至 10 位玩家';
  const err = validateSettings(n, room.settings); if (err) return err;
  const roles = buildRoles(n, room.settings);
  const seats = room.players.map((p, i) => ({ pid: p.pid, id: p.id, name: p.name, avatar: p.avatar, bg: p.bg, role: roles[i] }));
  const leader = crypto.randomInt(n);
  room.game = {
    gid: crypto.randomUUID(), startedAt: Date.now(), n, seats,
    settings: { ...room.settings },
    round: 0, leader, rejects: 0,
    lady: room.settings.lady ? (leader - 1 + n) % n : -1, ladyUsed: room.settings.lady ? [seats[(leader - 1 + n) % n].id] : [], ladyLog: [],
    phase: 'team', team: [], votes: {}, questVotes: {},
    quests: [null, null, null, null, null], // {success, fails, team}
    rounds: [[], [], [], [], []], // proposals per round
    questLog: [],
    assassinTarget: null, winner: null, reason: '', endedAt: null,
  };
  room.lastEvent = { seq: ++room.eventSeq, type: 'start' };
  return null;
}

function endGame(room, winner, reason) {
  const g = room.game;
  g.phase = 'end'; g.winner = winner; g.reason = reason; g.endedAt = Date.now();
  room.lastEvent = { seq: ++room.eventSeq, type: 'end', winner, reason };
  const { scores, mvp, runnerUp, highlights } = scoreGame(g);
  g.scores = scores; g.mvp = mvp; g.runnerUp = runnerUp; g.highlights = highlights;
  const rec = {
    gid: g.gid, room: room.code, startedAt: g.startedAt, endedAt: g.endedAt, n: g.n, winner, reason, settings: g.settings,
    players: g.seats.map((s, i) => ({ id: s.id, name: s.name, avatar: s.avatar.startsWith('data:') ? null : s.avatar, bg: s.bg, role: s.role, seat: i + 1 })),
    quests: g.quests.map(q => q ? { success: q.success, fails: q.fails, team: q.team } : null),
    rounds: g.rounds, ladyLog: g.ladyLog, assassinTarget: g.assassinTarget, scores, mvp, runnerUp, highlights,
    pids: g.seats.map(s => s.pid),
  };
  db.games.push(rec);
  if (db.games.length > 2000) db.games.splice(0, db.games.length - 2000);
  for (const s of g.seats) {
    const st = db.stats[s.pid] || (db.stats[s.pid] = { played: 0, won: 0, roles: {} });
    const r = st.roles[s.role] || (st.roles[s.role] = { played: 0, won: 0 });
    const won = ROLE_SIDE[s.role] === winner;
    st.played++; r.played++; if (won) { st.won++; r.won++; }
    if (s.id === mvp) st.mvp = (st.mvp || 0) + 1;
  }
  saveDb();
}

function scoreGame(g) {
  const side = {}; const role = {}; g.seats.forEach(s => { side[s.id] = ROLE_SIDE[s.role]; role[s.id] = s.role; });
  const scores = {};
  for (const s of g.seats) {
    const items = []; const my = side[s.id]; const won = my === g.winner;
    if (won) items.push(['勝利', 12]);
    let correct = 0;
    for (const props of g.rounds) for (const p of props) {
      if (!(s.id in p.votes)) continue;
      const evilOn = p.team.some(id => side[id] === 'evil');
      const good = my === 'good' ? (p.votes[s.id] === !evilOn) : (p.votes[s.id] === evilOn);
      if (good) correct++;
    }
    if (correct) items.push([`正確投票 ×${correct}`, correct * 2]);
    let qs = 0; for (const q of g.quests) if (q && q.team.includes(s.id) && (q.success ? 'good' : 'evil') === my) qs++;
    if (qs) items.push([`完成任務 ×${qs}`, qs]);
    if (won && g.n > 5) items.push([`${g.n} 人局加成`, g.n - 5]);
    if (g.assassinTarget) {
      if (s.role === 'assassin' && role[g.assassinTarget] === 'merlin') items.push(['一擊刺中梅林', 5]);
      if (s.role === 'merlin' && role[g.assassinTarget] !== 'merlin') items.push(['梅林成功隱藏', 5]);
    }
    if (g.ladyLog.some(l => l.holder === s.id && side[l.target] !== my)) items.push(['湖中仙女驗出敵人', 1]);
    scores[s.id] = { total: items.reduce((a, x) => a + x[1], 0), items };
  }
  const order = g.seats.map(s => s.id).sort((a, b) => (scores[b].total - scores[a].total) || ((side[b] === g.winner) - (side[a] === g.winner)));
  order.forEach((id, i) => scores[id].rank = i + 1);
  const hl = [];
  const mordred = g.seats.find(s => s.role === 'mordred');
  if (mordred && g.quests.some(q => q && q.team.includes(mordred.id))) hl.push(`莫德雷德 ${mordred.name} 成功混入任務隊伍`);
  const merlin = g.seats.find(s => s.role === 'merlin');
  if (g.assassinTarget) hl.push(role[g.assassinTarget] === 'merlin' ? `刺客一擊即中，梅林 ${merlin.name} 倒下` : `梅林 ${merlin.name} 完美隱藏到最後`);
  const allProps = g.rounds.flat();
  const maxRej = Math.max(0, ...g.rounds.map(r => r.filter(p => !p.approved).length));
  if (maxRej >= 3) hl.push(`同一輪連續被否決 ${maxRej} 次，圓桌氣氛緊張`);
  const unanimous = allProps.filter(p => p.yes === g.n).length; if (unanimous) hl.push(`${unanimous} 次全票通過的隊伍`);
  const qres = g.quests.filter(Boolean);
  if (qres.length === 3 && qres.every(q => q.success)) hl.push('三連勝！好人任務零失誤');
  if (qres.length === 3 && qres.every(q => !q.success)) hl.push('三連敗！壞人全面滲透');
  const oberon = g.seats.find(s => s.role === 'oberon'); if (oberon) hl.push(`奧伯倫 ${oberon.name} 孤軍作戰`);
  const big = qres.find(q => q.fails >= 2); if (big) hl.push(`有任務出現 ${big.fails} 張失敗卡`);
  return { scores, mvp: order[0], runnerUp: order[1], highlights: hl };
}

function knowledgeFor(g, seat) {
  const role = seat.role; const out = [];
  for (const o of g.seats) {
    if (o.pid === seat.pid) continue;
    if (role === 'merlin' && ROLE_SIDE[o.role] === 'evil' && o.role !== 'mordred') out.push({ id: o.id, label: '壞人' });
    else if (role === 'percival' && (o.role === 'merlin' || o.role === 'morgana')) out.push({ id: o.id, label: '梅林或莫甘娜' });
    else if (ROLE_SIDE[role] === 'evil' && role !== 'oberon' && ROLE_SIDE[o.role] === 'evil' && o.role !== 'oberon') out.push({ id: o.id, label: '壞人同伴' });
  }
  return out;
}

// ---------- actions ----------
function act(room, pid, type, data) {
  const g = room.game; const isHost = room.hostPid === pid;
  switch (type) {
    case 'settings': {
      if (!isHost) return '只有房主可以修改';
      if (g && g.phase !== 'end') return '遊戲進行中';
      for (const k of ['percival', 'morgana', 'mordred', 'oberon', 'lady']) if (k in data) room.settings[k] = !!data[k];
      return null;
    }
    case 'kick': {
      if (!isHost) return '只有房主可以踢人';
      if (g && g.phase !== 'end') return '遊戲進行中';
      const p = room.players.find(x => x.id === data.id); if (!p || p.pid === pid) return '無效玩家';
      room.players = room.players.filter(x => x !== p); pidRoom.delete(p.pid);
      for (const [, s] of io.sockets.sockets) if (s.data.pid === p.pid) { s.leave(room.code); s.data.room = null; s.emit('kicked'); }
      return null;
    }
    case 'move': { // reorder seat
      if (!isHost) return '只有房主可以調位';
      if (g && g.phase !== 'end') return '遊戲進行中';
      const i = room.players.findIndex(x => x.id === data.id); const j = i + (data.dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= room.players.length) return null;
      [room.players[i], room.players[j]] = [room.players[j], room.players[i]];
      return null;
    }
    case 'swap': {
      if (!isHost) return '只有房主可以調位';
      if (g && g.phase !== 'end') return '遊戲進行中';
      const i = room.players.findIndex(x => x.id === data.a), j = room.players.findIndex(x => x.id === data.b);
      if (i < 0 || j < 0) return '無效玩家';
      [room.players[i], room.players[j]] = [room.players[j], room.players[i]];
      return null;
    }
    case 'start': {
      if (!isHost) return '只有房主可以開始';
      if (g && g.phase !== 'end') return '遊戲已開始';
      return startGame(room);
    }
    case 'abort': {
      if (!isHost) return '只有房主可以結束';
      if (!g) return null;
      room.game = null; room.lastEvent = { seq: ++room.eventSeq, type: 'abort' };
      return null;
    }
    case 'lobby': {
      if (!isHost) return '只有房主可以操作';
      if (g && g.phase !== 'end') return '遊戲進行中';
      room.game = null; return null;
    }
  }
  if (!g) return '遊戲未開始';
  const seatIdx = g.seats.findIndex(s => s.pid === pid); const seat = g.seats[seatIdx];
  if (!seat) return '你不在這局遊戲中';
  switch (type) {
    case 'propose': {
      if (g.phase !== 'team') return '現在不是組隊階段';
      if (seatIdx !== g.leader) return '只有隊長可以組隊';
      const need = TEAM_SIZES[g.n][g.round];
      const ids = Array.from(new Set(data.team || []));
      if (ids.length !== need || !ids.every(id => g.seats.some(s => s.id === id))) return `需要選擇 ${need} 位隊員`;
      g.team = ids; g.votes = {}; g.phase = 'vote';
      return null;
    }
    case 'vote': {
      if (g.phase !== 'vote') return '現在不是投票階段';
      if (seat.id in g.votes) return '你已經投票';
      g.votes[seat.id] = !!data.approve;
      if (Object.keys(g.votes).length === g.n) {
        const yes = Object.values(g.votes).filter(Boolean).length;
        const approved = yes * 2 > g.n;
        const rec = { leader: g.seats[g.leader].id, team: g.team.slice(), votes: { ...g.votes }, approved, yes, no: g.n - yes, attempt: g.rejects + 1 };
        g.rounds[g.round].push(rec);
        room.lastEvent = { seq: ++room.eventSeq, type: 'vote', round: g.round, ...rec };
        g.leader = (g.leader + 1) % g.n;
        if (approved) { g.rejects = 0; g.phase = 'quest'; g.questVotes = {}; }
        else {
          g.rejects++;
          if (g.rejects >= 5) { g.team = []; endGame(room, 'evil', '連續 5 次組隊被否決，壞人勝利'); room.lastEvent.prev = rec; }
          else { g.phase = 'team'; g.team = []; }
        }
        g.votes = {};
      }
      return null;
    }
    case 'quest': {
      if (g.phase !== 'quest') return '現在不是任務階段';
      if (!g.team.includes(seat.id)) return '你不在任務隊伍中';
      if (seat.id in g.questVotes) return '你已經出過任務卡';
      let success = !!data.success;
      if (ROLE_SIDE[seat.role] === 'good') success = true; // good can only succeed
      g.questVotes[seat.id] = success;
      if (Object.keys(g.questVotes).length === g.team.length) {
        const fails = Object.values(g.questVotes).filter(v => !v).length;
        const ok = fails < (needTwoFails(g.n, g.round) ? 2 : 1);
        g.quests[g.round] = { success: ok, fails, team: g.team.slice() };
        const qev = { type: 'quest', round: g.round, success: ok, fails, size: g.team.length };
        room.lastEvent = { seq: ++room.eventSeq, ...qev };
        g.questVotes = {}; g.votes = {}; g.team = [];
        const goodWins = g.quests.filter(q => q && q.success).length;
        const evilWins = g.quests.filter(q => q && !q.success).length;
        if (evilWins >= 3) endGame(room, 'evil', '三個任務失敗，壞人勝利');
        else if (goodWins >= 3) { g.phase = 'assassin'; }
        else if (g.lady >= 0 && g.round >= 1 && g.round <= 3) { g.phase = 'lady'; }
        else { g.round++; g.phase = 'team'; }
        if (g.phase === 'end') room.lastEvent = { ...room.lastEvent, ...qev, then: 'end' };
      }
      return null;
    }
    case 'lady': {
      if (g.phase !== 'lady') return '現在不是湖中仙女階段';
      if (seatIdx !== g.lady) return '只有湖中仙女持有者可以查驗';
      const ti = g.seats.findIndex(s => s.id === data.id); const t = g.seats[ti];
      if (!t || t.pid === pid) return '無效目標';
      if (g.ladyUsed.includes(t.id)) return '此玩家已持有過湖中仙女，不能被查驗';
      g.ladyLog.push({ round: g.round, holder: seat.id, target: t.id, side: ROLE_SIDE[t.role] });
      g.ladyUsed.push(t.id); g.lady = ti;
      room.lastEvent = { seq: ++room.eventSeq, type: 'lady', holder: seat.id, target: t.id };
      g.round++; g.phase = 'team';
      return null;
    }
    case 'assassinate': {
      if (g.phase !== 'assassin') return '現在不是刺殺階段';
      if (seat.role !== 'assassin') return '只有刺客可以刺殺';
      const t = g.seats.find(s => s.id === data.id);
      if (!t || t.pid === pid) return '無效目標';
      g.assassinTarget = t.id;
      if (t.role === 'merlin') endGame(room, 'evil', `刺客刺中梅林（${t.name}），壞人逆轉勝利`);
      else endGame(room, 'good', `刺客刺錯了（${t.name} 不是梅林），好人勝利`);
      return null;
    }
  }
  return '未知操作';
}

// ---------- views ----------
function viewFor(room, pid) {
  const online = new Set();
  for (const [, s] of io.sockets.sockets) if (s.data.room === room.code && s.data.pid) online.add(s.data.pid);
  const me = findPlayer(room, pid);
  const v = {
    code: room.code, hostId: pubId(room.hostPid), meId: me ? me.id : null, isHost: room.hostPid === pid,
    settings: room.settings, lastEvent: room.lastEvent || null,
    players: room.players.map(p => ({ ...pubPlayer(p), online: online.has(p.pid) })),
    teamSizes: TEAM_SIZES[room.players.length] || null, evilCount: EVIL_COUNT[room.players.length] || null,
    game: null,
  };
  const g = room.game;
  if (g) {
    const seat = g.seats.find(s => s.pid === pid);
    const ended = g.phase === 'end';
    const revealEvil = g.phase === 'assassin';
    v.game = {
      gid: g.gid, n: g.n, phase: g.phase, round: g.round, leaderId: g.seats[g.leader].id, rejects: g.rejects,
      teamSizes: TEAM_SIZES[g.n], twoFailRound: g.n >= 7 ? 3 : -1, settings: g.settings,
      seats: g.seats.map(s => ({ id: s.id, name: s.name, avatar: s.avatar, bg: s.bg, online: online.has(s.pid),
        role: ended ? s.role : undefined,
        evil: (revealEvil && ROLE_SIDE[s.role] === 'evil' && s.role !== 'oberon') ? true : undefined,
        assassin: revealEvil && s.role === 'assassin' ? true : undefined })),
      team: g.team, voted: Object.keys(g.votes), questDone: Object.keys(g.questVotes).length,
      quests: g.quests.map(q => q ? { success: q.success, fails: q.fails, team: q.team } : null),
      rounds: g.rounds, winner: g.winner, reason: g.reason, assassinTarget: g.assassinTarget,
      ladyId: g.lady >= 0 ? g.seats[g.lady].id : null, ladyUsed: g.ladyUsed,
      ladyLog: g.ladyLog.map(l => ({ round: l.round, holder: l.holder, target: l.target, side: (ended || (seat && l.holder === seat.id)) ? l.side : undefined })),
      scores: ended ? g.scores : undefined, mvp: ended ? g.mvp : undefined, runnerUp: ended ? g.runnerUp : undefined, highlights: ended ? g.highlights : undefined,
      me: seat ? { role: seat.role, side: ROLE_SIDE[seat.role], roleName: ROLE_NAME[seat.role], knows: knowledgeFor(g, seat),
        voted: seat.id in g.votes, myVote: g.votes[seat.id], questSubmitted: seat.id in g.questVotes } : null,
    };
  }
  return v;
}

function broadcast(room) {
  room.touched = Date.now();
  for (const [, s] of io.sockets.sockets) if (s.data.room === room.code) s.emit('state', viewFor(room, s.data.pid));
}

// ---------- server ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 20000, pingTimeout: 25000 });

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '10m' }));
app.get('/healthz', (req, res) => res.json({ ok: true, rooms: rooms.size }));
app.get('/api/qr', async (req, res) => {
  try {
    const svg = await QRCode.toString(String(req.query.text || '').slice(0, 300), { type: 'svg', margin: 1, width: 240, color: { dark: '#1f2937', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch (e) { res.status(400).end(); }
});
app.get('/api/history', (req, res) => {
  const pid = String(req.query.pid || '');
  const list = db.games.filter(g => g.pids.includes(pid)).slice(-50).reverse().map(g => {
    const { pids, ...rest } = g; const idx = pids.indexOf(pid);
    return { ...rest, myId: rest.players[idx] && rest.players[idx].id, myRole: rest.players[idx] && rest.players[idx].role };
  });
  res.json(list);
});
app.get('/api/game/:gid', (req, res) => {
  const g = db.games.find(x => x.gid === req.params.gid); if (!g) return res.status(404).json({ error: 'not found' });
  const { pids, ...rest } = g; const idx = pids.indexOf(String(req.query.pid || ''));
  res.json({ ...rest, myId: idx >= 0 ? rest.players[idx].id : null });
});
app.get('/api/stats', (req, res) => res.json(db.stats[String(req.query.pid || '')] || { played: 0, won: 0, roles: {} }));
app.get(['/r/:code', '/room/:code'], (req, res) => res.redirect('/?room=' + encodeURIComponent(req.params.code.toUpperCase())));

function applyProfile(p, d) { p.name = d.name; p.avatar = d.avatar; p.bg = d.bg; p.fx = d.fx; }
function newPlayer(pid, d) { const p = { pid, id: pubId(pid) }; applyProfile(p, d); return p; }

function leaveCurrent(socket, pid, removeFromLobby) {
  const code = pidRoom.get(pid); if (!code) return;
  const room = rooms.get(code);
  if (!room) { pidRoom.delete(pid); return; }
  if (removeFromLobby && (!room.game || room.game.phase === 'end')) {
    room.players = room.players.filter(p => p.pid !== pid); pidRoom.delete(pid);
    if (room.hostPid === pid && room.players.length) room.hostPid = room.players[0].pid;
    if (!room.players.length) rooms.delete(code);
  }
  socket.leave(code); socket.data.room = null;
  if (rooms.has(code)) broadcast(room);
}

io.on('connection', (socket) => {
  socket.on('hello', ({ pid, name, avatar, bg, fx } = {}, cb = () => {}) => {
    if (typeof pid !== 'string' || pid.length < 8 || pid.length > 64) return cb({ error: 'bad pid' });
    socket.data.pid = pid; Object.assign(socket.data, { name: cleanName(name), avatar: cleanAvatar(avatar), bg: cleanBg(bg), fx: cleanFx(fx) });
    const code = pidRoom.get(pid); const room = code && rooms.get(code);
    if (room) {
      const p = findPlayer(room, pid);
      if (p && (!room.game || room.game.phase === 'end')) applyProfile(p, socket.data);
      socket.join(code); socket.data.room = code; broadcast(room);
      return cb({ room: code });
    }
    cb({ room: null });
  });
  socket.on('profile', ({ name, avatar, bg, fx } = {}) => {
    Object.assign(socket.data, { name: cleanName(name), avatar: cleanAvatar(avatar), bg: cleanBg(bg), fx: cleanFx(fx) });
    const room = socket.data.room && rooms.get(socket.data.room);
    if (room && (!room.game || room.game.phase === 'end')) { const p = findPlayer(room, socket.data.pid); if (p) { applyProfile(p, socket.data); broadcast(room); } }
  });
  socket.on('create', (_, cb = () => {}) => {
    const pid = socket.data.pid; if (!pid) return cb({ error: '請先設定暱稱' });
    const cur = pidRoom.get(pid) && rooms.get(pidRoom.get(pid));
    if (cur && cur.game && cur.game.phase !== 'end') return cb({ error: '你正在另一局遊戲中' });
    leaveCurrent(socket, pid, true);
    const room = makeRoom({ pid });
    room.players.push(newPlayer(pid, socket.data));
    pidRoom.set(pid, room.code); socket.join(room.code); socket.data.room = room.code;
    broadcast(room); cb({ room: room.code });
  });
  socket.on('join', ({ code } = {}, cb = () => {}) => {
    const pid = socket.data.pid; if (!pid) return cb({ error: '請先設定暱稱' });
    code = String(code || '').toUpperCase().trim();
    const room = rooms.get(code); if (!room) return cb({ error: `找不到房間 ${code}` });
    if (!findPlayer(room, pid)) {
      if (room.game && room.game.phase !== 'end') return cb({ error: '遊戲已開始，無法加入' });
      if (room.players.length >= 10) return cb({ error: '房間已滿（最多 10 人）' });
      const cur = pidRoom.get(pid) && rooms.get(pidRoom.get(pid));
      if (cur && cur !== room && cur.game && cur.game.phase !== 'end') return cb({ error: '你正在另一局遊戲中' });
      if (cur !== room) leaveCurrent(socket, pid, true);
      room.players.push(newPlayer(pid, socket.data));
      pidRoom.set(pid, code);
    }
    socket.join(code); socket.data.room = code; broadcast(room); cb({ room: code });
  });
  socket.on('leave', (_, cb = () => {}) => {
    const pid = socket.data.pid; const room = pidRoom.get(pid) && rooms.get(pidRoom.get(pid));
    if (room && room.game && room.game.phase !== 'end') { socket.leave(room.code); socket.data.room = null; return cb({ ok: true, stillSeated: true }); }
    leaveCurrent(socket, pid, true); cb({ ok: true });
  });
  socket.on('act', ({ type, data } = {}, cb = () => {}) => {
    const pid = socket.data.pid; const room = socket.data.room && rooms.get(socket.data.room);
    if (!room || !findPlayer(room, pid)) return cb({ error: '你不在房間中' });
    let err;
    try { err = act(room, pid, String(type), data || {}); } catch (e) { console.error(e); err = '伺服器錯誤'; }
    if (err) return cb({ error: err });
    broadcast(room); cb({ ok: true });
  });
  socket.on('disconnect', () => { const room = socket.data.room && rooms.get(socket.data.room); if (room) setTimeout(() => rooms.has(room.code) && broadcast(room), 100); });
});

// cleanup idle rooms (12h)
setInterval(() => {
  const cutoff = Date.now() - 12 * 3600 * 1000;
  for (const [code, r] of rooms) if (r.touched < cutoff) { for (const p of r.players) pidRoom.delete(p.pid); rooms.delete(code); }
}, 30 * 60 * 1000).unref();

server.listen(PORT, () => console.log('Avalon server on :' + PORT));
module.exports = { server, TEAM_SIZES, EVIL_COUNT };
