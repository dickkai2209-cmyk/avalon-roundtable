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
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12) || '玩家';
const cleanAvatar = (s) => String(s || '🙂').slice(0, 4);

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
    settings: { percival: true, morgana: true, mordred: false, oberon: false },
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
  const seats = room.players.map((p, i) => ({ pid: p.pid, id: p.id, name: p.name, avatar: p.avatar, role: roles[i] }));
  room.game = {
    gid: crypto.randomUUID(), startedAt: Date.now(), n, seats,
    settings: { ...room.settings },
    round: 0, leader: crypto.randomInt(n), rejects: 0,
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
  const rec = {
    gid: g.gid, room: room.code, startedAt: g.startedAt, endedAt: g.endedAt, n: g.n, winner, reason,
    players: g.seats.map(s => ({ id: s.id, name: s.name, avatar: s.avatar, role: s.role })),
    quests: g.quests.map(q => q ? { success: q.success, fails: q.fails } : null),
    assassinTarget: g.assassinTarget,
    pids: g.seats.map(s => s.pid),
  };
  db.games.push(rec);
  if (db.games.length > 2000) db.games.splice(0, db.games.length - 2000);
  for (const s of g.seats) {
    const st = db.stats[s.pid] || (db.stats[s.pid] = { played: 0, won: 0, roles: {} });
    const r = st.roles[s.role] || (st.roles[s.role] = { played: 0, won: 0 });
    const won = ROLE_SIDE[s.role] === winner;
    st.played++; r.played++; if (won) { st.won++; r.won++; }
  }
  saveDb();
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
      for (const k of ['percival', 'morgana', 'mordred', 'oberon']) if (k in data) room.settings[k] = !!data[k];
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
        else { g.round++; g.phase = 'team'; }
        if (g.phase === 'end') room.lastEvent = { ...room.lastEvent, ...qev, then: 'end' };
      }
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
    players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, online: online.has(p.pid) })),
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
      seats: g.seats.map(s => ({ id: s.id, name: s.name, avatar: s.avatar, online: online.has(s.pid),
        role: ended ? s.role : undefined,
        evil: (revealEvil && ROLE_SIDE[s.role] === 'evil' && s.role !== 'oberon') ? true : undefined,
        assassin: revealEvil && s.role === 'assassin' ? true : undefined })),
      team: g.team, voted: Object.keys(g.votes), questDone: Object.keys(g.questVotes).length,
      quests: g.quests.map(q => q ? { success: q.success, fails: q.fails, team: q.team } : null),
      rounds: g.rounds, winner: g.winner, reason: g.reason, assassinTarget: g.assassinTarget,
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

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m' }));
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
app.get('/api/stats', (req, res) => res.json(db.stats[String(req.query.pid || '')] || { played: 0, won: 0, roles: {} }));
app.get(['/r/:code', '/room/:code'], (req, res) => res.redirect('/?room=' + encodeURIComponent(req.params.code.toUpperCase())));

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
  socket.on('hello', ({ pid, name, avatar } = {}, cb = () => {}) => {
    if (typeof pid !== 'string' || pid.length < 8 || pid.length > 64) return cb({ error: 'bad pid' });
    socket.data.pid = pid; socket.data.name = cleanName(name); socket.data.avatar = cleanAvatar(avatar);
    const code = pidRoom.get(pid); const room = code && rooms.get(code);
    if (room) {
      const p = findPlayer(room, pid);
      if (p && (!room.game || room.game.phase === 'end')) { p.name = socket.data.name; p.avatar = socket.data.avatar; }
      socket.join(code); socket.data.room = code; broadcast(room);
      return cb({ room: code });
    }
    cb({ room: null });
  });
  socket.on('profile', ({ name, avatar } = {}) => {
    socket.data.name = cleanName(name); socket.data.avatar = cleanAvatar(avatar);
    const room = socket.data.room && rooms.get(socket.data.room);
    if (room && (!room.game || room.game.phase === 'end')) { const p = findPlayer(room, socket.data.pid); if (p) { p.name = socket.data.name; p.avatar = socket.data.avatar; broadcast(room); } }
  });
  socket.on('create', (_, cb = () => {}) => {
    const pid = socket.data.pid; if (!pid) return cb({ error: '請先設定暱稱' });
    const cur = pidRoom.get(pid) && rooms.get(pidRoom.get(pid));
    if (cur && cur.game && cur.game.phase !== 'end') return cb({ error: '你正在另一局遊戲中' });
    leaveCurrent(socket, pid, true);
    const room = makeRoom({ pid });
    room.players.push({ pid, id: pubId(pid), name: socket.data.name, avatar: socket.data.avatar });
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
      room.players.push({ pid, id: pubId(pid), name: socket.data.name, avatar: socket.data.avatar });
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
