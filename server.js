'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const db = require('./db');
const { build: buildReview } = require('./review');
const {
  TEAM_SIZES, EVIL_COUNT, ROLE_SIDE, ROLE_NAME,
  defaultSettings, presetRoles, currentSide, canPlayFail, needTwoFails, knowledge, resolveAvoidance,
  SPEAK_MS, speakOrder,
} = require('./rules');

const PORT = process.env.PORT || 3000;
const pubId = (pid) => crypto.createHash('sha256').update(String(pid)).digest('hex').slice(0, 10);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cleanName = (s) => Array.from(String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim()).slice(0, 10).join('') || '騎士';
const ANIMALS = ['fox','panda','duck','squirrel','hedgehog','bunny','bear','redpanda','otter','hamster','shiba','dalmatian','capybara','penguin','koala','cat','wolf','lion','piglet','guineapig'];
const FXS = ['none','spot','gold','snow','spark','petals','howl','fire','lightning'];
const EMOTES = ['1f602','1f62d','1f631','1f914','1f60e','1f621','1f64f','1f44d','1f44f','1f525','2764_fe0f','1f608','1f92b','1f440','1f389'];
const emoteAt = new Map();
// cosmetic unlock rules, enforced server-side (GM bypasses all)
const PD_RULE = { wolf: ['free', 0], pumpkin: ['free', 0], devil: ['free', 0], crown: ['free', 0], bow: ['free', 0], santa: ['free', 0], holly: ['free', 0], newmoon: ['games', 1], halo: ['games', 2], egg: ['games', 3], ghost: ['games', 4], witch: ['games', 5], bolo: ['games', 6], tram: ['games', 7], bat: ['games', 8], vampire: ['games', 12], plume: ['wins', 1], taxi: ['wins', 2], merlinhat: ['wins', 3], lotus: ['wins', 5], neon: ['wins', 6], excal: ['wins', 10], laurel: ['mvp', 10] };
const CB_RULE = { cardback: ['free', 0], cardback_xmas: ['free', 0], cardback_sakura: ['games', 2], cardback_halloween: ['games', 3], cardback_lny: ['games', 6], cardback_starry: ['wins', 3], cardback_neon: ['wins', 5], cardback_amigos: ['wins', 10] };
const FX_NEED = { none: 0, spot: 0, gold: 0, snow: 0, spark: 1, petals: 3, howl: 4, fire: 6, lightning: 10 };
function unlockedBy(rule, st) { if (!rule) return false; const [k, n] = rule; return k === 'free' || (k === 'games' ? st.played : k === 'wins' ? st.won : st.mvp) >= n; }
async function enforceUnlocks(user, f) {
  const s = await db.getStats(user.id) || {}; const st = { played: s.played || 0, won: s.won || 0, mvp: s.mvp || 0 };
  // MVP rewards (pendant + shiny card effect) require 10 real MVPs — even for GM
  if (f.pendant === 'laurel' && st.mvp < 10) f.pendant = 'none';
  if (f.skins && f.skins._shiny && st.mvp < 10) f.skins._shiny = false;
  if (db.isGM(user)) return null;
  if (f.pendant && f.pendant !== 'none' && f.pendant !== 'laurel' && !unlockedBy(PD_RULE[f.pendant], st)) f.pendant = 'none';
  if (f.fx && st.played < (FX_NEED[f.fx] || 0)) f.fx = 'spot';
  if (f.skins) {
    if (f.skins._cardback && !unlockedBy(CB_RULE[f.skins._cardback], st)) f.skins._cardback = 'cardback';
  }
  return null;
}
const PENDANTS = ['none','wolf','pumpkin','devil','crown','bow','santa','holly','newmoon','halo','egg','ghost','witch','bolo','tram','bat','vampire','plume','taxi','merlinhat','lotus','neon','excal','laurel'];
const cleanAvatar = (s) => ANIMALS.includes(s) || s === 'photo' ? s : 'fox';
const cleanBg = (s) => /^#[0-9a-fA-F]{6}$/.test(String(s)) ? s : '#f3d9a4';
const cleanFx = (s) => FXS.includes(s) ? s : 'spot';
const cleanPendant = (s) => PENDANTS.includes(s) ? s : 'none';

const rooms = new Map();
const vetoCache = new Map(); // userId -> evasion cards left
const hostAway = new Map(); // room code -> timer
const pidRoom = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!rooms.has(c)) return c; }
}

function pubPlayer(p) {
  return {
    id: p.id, name: p.name, avatar: p.avatar, bg: p.bg, fx: p.fx, pendant: p.pendant,
    photoUrl: p.avatar === 'photo' ? `/api/avatar/${p.id}?v=${p.pv || 0}` : `/img/av/${p.avatar || 'fox'}.webp`,
    ready: !!p.ready, seat: p.seat,
  };
}
function seated(room) { return room.seats.map((p, i) => p && { ...p, seat: i + 1 }).filter(Boolean); }
function findPlayer(room, pid) { return room.seats.find(p => p && p.pid === pid) || null; }
function findSeat(room, pid) { return room.seats.findIndex(p => p && p.pid === pid); }
function inGameSeat(room, pid) { return !!(room.game && room.game.seats.some(s => s.pid === pid)); }
function isSeatedPid(room, pid) { return !!findPlayer(room, pid) || inGameSeat(room, pid); }
function rememberWatcher(room, socket) {
  if (!socket || !socket.data || !socket.data.pid) return;
  room.watchers = room.watchers || {};
  const d = socket.data;
  room.watchers[d.pid] = { name: d.name || '觀戰', avatar: d.avatar || 'fox', bg: d.bg, fx: d.fx, pendant: d.pendant || 'none', pv: d.pv || 0 };
}
function spectatorList(room) {
  const seated = new Set();
  for (const p of room.seats) if (p) seated.add(p.pid);
  if (room.game) for (const p of room.game.seats) seated.add(p.pid);
  const out = [], seen = new Set();
  for (const so of io.sockets.sockets.values()) {
    if (so.data.room === room.code && so.data.pid && !seated.has(so.data.pid) && !seen.has(so.data.pid)) {
      seen.add(so.data.pid);
      const d = so.data;
      out.push({ id: pubId(d.pid), name: d.name || '觀戰', avatar: d.avatar || 'fox', bg: d.bg, pendant: d.pendant || 'none', pv: d.pv || 0, online: true });
    }
  }
  for (const [pid, w] of Object.entries(room.watchers || {})) {
    if (!seated.has(pid) && !seen.has(pid))
      out.push({ id: pubId(pid), name: (w && w.name) || '觀戰', avatar: (w && w.avatar) || 'fox', bg: w && w.bg, pendant: (w && w.pendant) || 'none', pv: (w && w.pv) || 0, online: false });
  }
  return out;
}
function newPlayer(pid, d, seat) {
  return { pid, id: pubId(pid), name: d.name || '騎士', avatar: d.avatar || 'fox', bg: d.bg, fx: d.fx, pendant: d.pendant || 'none', pv: d.pv || 0, ready: false, seat };
}
function applyProfile(p, d) { p.name = d.name; p.avatar = d.avatar; p.bg = d.bg; p.fx = d.fx; p.pendant = d.pendant || 'none'; p.pv = d.pv || 0; }

function makeRoom(host) {
  const code = newCode();
  const capacity = 8;
  const room = {
    code, hostPid: host.pid, createdAt: Date.now(), touched: Date.now(),
    capacity, seats: Array(capacity).fill(null),
    settings: defaultSettings(capacity),
    game: null, eventSeq: 0, members: new Set([host.pid]),
    avoid: {}, avoidResult: {},
  };
  room.seats[0] = newPlayer(host.pid, host, 1);
  rooms.set(code, room);
  return room;
}

function onlinePids(room) {
  const s = new Set(); for (const so of io.sockets.sockets.values()) if (so.data.room === room.code && so.data.pid) s.add(so.data.pid); return s;
}
function pickNextHost(room, oldPid) {
  const n = room.seats.length; const from = Math.max(0, room.seats.findIndex(p => p && p.pid === oldPid));
  const online = onlinePids(room); const cands = [];
  for (let k = 1; k <= n; k++) { const p = room.seats[(from + k) % n]; if (p && p.pid !== oldPid) cands.push(p); }
  const pick = cands.find(p => online.has(p.pid)) || cands[0];
  if (pick) { room.hostPid = pick.pid; pick.ready = false; room.lastEvent = { seq: ++room.eventSeq, type: 'host', id: pick.id, name: pick.name }; return true; }
  return false;
}
function standUp(room, pid) {
  const i = findSeat(room, pid);
  if (i >= 0) room.seats[i] = null;
  voiceDrop(room, pid);
}

function setCapacity(room, n) {
  n = Math.max(5, Math.min(12, n | 0));
  const old = room.seats;
  const next = Array(n).fill(null);
  for (let i = 0; i < n; i++) next[i] = old[i] || null;
  room.seats = next;
  room.capacity = n;
  // standing extra seats already dropped
  room.settings = { ...room.settings, ...defaultSettings(n), excalibur: !!room.settings.excalibur, veto: !!room.settings.veto, mic: !!room.settings.mic, lancelot: n >= 11 ? (room.settings.lancelot !== false) : !!room.settings.lancelot };
  room.seats.forEach(p => { if (p) p.ready = false; });
}

function buildRoles(n, s) {
  const { good, evil, overflow } = presetRoles(n, s);
  if (overflow) return { error: `${n} 人局角色數量超出陣營人數，請調整進階設定` };
  return { roles: shuffle(good.concat(evil)) };
}

async function cardsOf(pid) {
  if (!vetoCache.has(pid)) vetoCache.set(pid, await db.getVetoCards(pid));
  return vetoCache.get(pid);
}
async function startGame(room) {
  const n = room.capacity;
  if (room.seats.some(s => !s)) return `還有空位（${seated(room).length}/${n}）`;
  const { roles, error } = buildRoles(n, room.settings);
  if (error) return error;
  const players = seated(room);
  room.avoid = room.avoid || {};
  room.avoidResult = room.avoidResult || {};
  const raw = players.map(p => room.avoid[p.pid] || null);
  const cards = [];
  for (const p of players) cards.push(await cardsOf(p.pid));
  // A choice with no cards is not applied. GM inventory is 999, so it stays eligible.
  const gated = raw.map((role, i) => (role && cards[i] > 0) ? role : null);
  const { assign, result } = resolveAvoidance(gated, roles);
  for (let i = 0; i < players.length; i++) {
    if (raw[i] && cards[i] <= 0) result[i] = { role: raw[i], status: 'insufficient' };
  }
  const seats = players.map((p, i) => ({ pid: p.pid, id: p.id, name: p.name, avatar: p.avatar, bg: p.bg, fx: p.fx, pendant: p.pendant, pv: p.pv || 0, role: assign[i] }));
  const forcedLeader = process.env.FORCE_LEADER;
  const leader = forcedLeader != null && forcedLeader !== '' && Number.isInteger(Number(forcedLeader))
    ? ((Number(forcedLeader) % n) + n) % n
    : crypto.randomInt(n);
  const lance = !!(room.settings.lancelot && seats.some(s => s.role === 'lancelot_good'));
  room.game = {
    gid: crypto.randomUUID(), startedAt: Date.now(), n, seats, settings: { ...room.settings },
    round: 0, leader, rejects: 0,
    lady: room.settings.lady ? (leader - 1 + n) % n : -1,
    ladyStartId: room.settings.lady ? seats[(leader - 1 + n) % n].id : null,
    ladyUsed: room.settings.lady ? [seats[(leader - 1 + n) % n].id] : [],
    ladyLog: [],
    phase: 'team', discuss: 1, team: [], votes: {}, questVotes: {},
    quests: [null, null, null, null, null],
    rounds: [[], [], [], [], []],
    assassinTarget: null, winner: null, reason: '', endedAt: null,
    sword: null, swordFlipped: null,
    lance, lanceSwitched: false, lanceDeck: lance ? shuffle(['switch', 'switch', 'stay', 'stay', 'stay']) : [], lanceLog: [],
    vetoUsed: [], vetoBlocked: {},
    avoidDebited: {},
  };
  // Charge one card only when the deal honours the choice (final role is not the
  // chosen role). Inactive, conflict, and insufficient choices are not charged.
  // avoidDebited makes a second pass over this same game a no-op.
  for (let i = 0; i < players.length; i++) {
    const pid = players[i].pid;
    if (!raw[i]) continue;
    const status = result[i].status;
    room.avoidResult[pid] = { gid: room.game.gid, status, role: raw[i] };
    delete room.avoid[pid];
    if (status === 'applied' && !room.game.avoidDebited[pid]) {
      room.game.avoidDebited[pid] = true;
      const left = await db.consumeVeto(pid);
      if (left >= 0) vetoCache.set(pid, left);
    }
  }
  room.lastEvent = { seq: ++room.eventSeq, type: 'start' };
  return null;
}

function scoreGame(g) {
  const sideOf = (s) => currentSide(s.role, g.lanceSwitched);
  const scores = {};
  for (const s of g.seats) {
    const items = []; const my = sideOf(s); const won = my === g.winner;
    if (won) items.push(['勝利', 12]);
    let correct = 0;
    for (const props of g.rounds) for (const p of props) {
      if (!(s.id in p.votes)) continue;
      const evilOn = p.team.some(id => sideOf(g.seats.find(x => x.id === id)) === 'evil');
      const goodV = my === 'good' ? (p.votes[s.id] === !evilOn) : (p.votes[s.id] === evilOn);
      if (goodV) correct++;
    }
    if (correct) items.push([`正確投票 ×${correct}`, correct * 2]);
    let qs = 0; for (const q of g.quests) if (q && q.team.includes(s.id) && (q.success ? 'good' : 'evil') === my) qs++;
    if (qs) items.push([`完成任務 ×${qs}`, qs]);
    if (won && g.n > 5) items.push([`${g.n} 人局加成`, g.n - 5]);
    if (g.assassinTarget) {
      if (s.role === 'assassin' && g.seats.find(x => x.id === g.assassinTarget)?.role === 'merlin') items.push(['一擊刺中梅林', 5]);
      if (s.role === 'merlin' && g.seats.find(x => x.id === g.assassinTarget)?.role !== 'merlin') items.push(['梅林成功隱藏', 5]);
    }
    scores[s.id] = { total: items.reduce((a, x) => a + x[1], 0), items };
  }
  const order = g.seats.map(s => s.id).sort((a, b) => (scores[b].total - scores[a].total) || ((sideOf(g.seats.find(s => s.id === b)) === g.winner) - (sideOf(g.seats.find(s => s.id === a)) === g.winner)));
  order.forEach((id, i) => scores[id].rank = i + 1);
  const hl = [];
  const mordred = g.seats.find(s => s.role === 'mordred');
  if (mordred && g.quests.some(q => q && q.team.includes(mordred.id))) hl.push(`莫德雷德 ${mordred.name} 成功混入任務隊伍`);
  const merlin = g.seats.find(s => s.role === 'merlin');
  if (g.assassinTarget) hl.push(g.seats.find(s => s.id === g.assassinTarget)?.role === 'merlin' ? `刺客一擊即中，梅林 ${merlin.name} 倒下` : `梅林 ${merlin.name} 完美隱藏到最後`);
  if (g.lanceLog.some(l => l.switched)) hl.push('蘭斯洛特的忠誠發生了變化');
  const maxRej = Math.max(0, ...g.rounds.map(r => r.filter(p => !p.approved).length));
  if (maxRej >= 3) hl.push(`同一輪連續被否決 ${maxRej} 次`);
  const qres = g.quests.filter(Boolean);
  if (qres.length === 3 && qres.every(q => q.success)) hl.push('三連勝！好人任務零失誤');
  if (qres.length === 3 && qres.every(q => !q.success)) hl.push('三連敗！壞人全面滲透');
  return { scores, mvp: order[0], runnerUp: order[1], highlights: hl };
}

async function endGame(room, winner, reason) {
  const g = room.game;
  if (!g || g.settled) return;
  g.settled = true;
  g.phase = 'end'; g.winner = winner; g.reason = reason; g.endedAt = Date.now();
  clearFloor(room);
  muteExcept(room, null);
  const early = winner === 'none';
  if (early) g.early = true;
  const { scores, mvp, runnerUp, highlights } = early ? { scores: null, mvp: null, runnerUp: null, highlights: [] } : scoreGame(g);
  g.scores = scores; g.mvp = mvp; g.runnerUp = runnerUp; g.highlights = highlights;
  room.lastEvent = { seq: ++room.eventSeq, type: 'end', winner, reason, early };
  const mvpPid = g.seats.find(s => s.id === mvp)?.pid;
  const rec = {
    gid: g.gid, room: room.code, startedAt: g.startedAt, endedAt: g.endedAt, n: g.n, winner, reason,
    settings: g.settings,
    players: g.seats.map((s, i) => ({ id: s.id, name: s.name, avatar: s.avatar, bg: s.bg, pendant: s.pendant, pv: s.pv || 0, role: s.role, side: currentSide(s.role, g.lanceSwitched), seat: i + 1 })),
    quests: g.quests.map(q => q ? { success: q.success, fails: q.fails, team: q.team, sword: q.sword, flipped: q.flipped } : null),
    rounds: g.rounds, ladyLog: g.ladyLog, ladyStartId: g.ladyStartId || null, ladyUsed: g.ladyUsed || [],
    lanceLog: g.lanceLog, assassinTarget: g.assassinTarget,
    scores, mvp, runnerUp, highlights, review: buildReview({
      players: g.seats.map((s, i) => ({ ...s, seat: i + 1, role: s.role, name: s.name, id: s.id })),
      quests: g.quests, rounds: g.rounds, ladyLog: g.ladyLog, ladyStartId: g.ladyStartId, ladyUsed: g.ladyUsed,
      settings: g.settings, winner: g.winner,
    }),
    pids: g.seats.map(s => s.pid), mvpPid, early,
  };
  try { await db.saveGame(rec); } catch (e) { console.error('saveGame', e); }
  for (const s of g.seats) db.getVetoCards(s.pid).then(c => { vetoCache.set(s.pid, c); }).catch(() => {});
  setTimeout(() => rooms.has(room.code) && broadcast(room), 800);
}

function openDiscussion(g) {
  g.phase = 'team';
  g.discuss = (g.discuss || 0) + 1;
}

function afterQuest(room, qev) {
  const g = room.game;
  const goodWins = g.quests.filter(q => q && q.success).length;
  const evilWins = g.quests.filter(q => q && !q.success).length;
  if (evilWins >= 3) return endGame(room, 'evil', '三個任務失敗，壞人勝利').then(() => { room.lastEvent = { seq: room.eventSeq, ...qev, then: 'end' }; });
  if (goodWins >= 3) { g.phase = 'assassin'; return; }
  // Lancelot card after quests 2–4 (rounds 1,2,3)
  if (g.lance && g.round >= 1 && g.round <= 3 && g.lanceDeck.length) {
    const card = g.lanceDeck.shift();
    const switched = card === 'switch';
    if (switched) g.lanceSwitched = !g.lanceSwitched;
    g.lanceLog.push({ round: g.round, card, switched: g.lanceSwitched });
    qev.lance = { card, switched: g.lanceSwitched };
    room.lastEvent = { seq: ++room.eventSeq, ...qev };
    if (g.lady >= 0 && g.round >= 1 && g.round <= 3) g.phase = 'lady';
    else { g.round++; g.leader = (g.leader + 1) % g.n; openDiscussion(g); }
    return;
  }
  if (g.lady >= 0 && g.round >= 1 && g.round <= 3) g.phase = 'lady';
  else { g.round++; g.leader = (g.leader + 1) % g.n; openDiscussion(g); }
}

async function act(room, pid, type, data) {
  const g = room.game; const isHost = room.hostPid === pid;
  const member = room.members.has(pid);
  switch (type) {
    case 'capacity': {
      if (!isHost) return '只有房主可以修改人數';
      if (g && g.phase !== 'end') return '遊戲進行中';
      setCapacity(room, data.n);
      return null;
    }
    case 'settings': {
      if (!isHost) return '只有房主可以修改';
      const live = g && g.phase !== 'end';
      const keys = Object.keys(data || {});
      const onlyMic = keys.length === 1 && keys[0] === 'mic';
      if (live && !onlyMic) return '遊戲進行中';
      if ('mic' in data) {
        room.settings.mic = !!data.mic;
        if (!room.settings.mic) silenceRoom(room);
      }
      if (onlyMic) return null;
      for (const k of ['lady', 'excalibur', 'lancelot', 'veto', 'advanced', 'percival', 'morgana', 'mordred', 'oberon'])
        if (k in data) room.settings[k] = !!data[k];
      if (['percival', 'morgana', 'mordred', 'oberon'].some(k => k in data)) room.settings.advanced = true;
      return null;
    }
    case 'sit': {
      const i = (data.seat | 0) - 1;
      if (i < 0 || i >= room.capacity) return '無效座位';
      // Mid-game the only open seat is one the host released. The sitter inherits
      // that seat's role and in-game state; the public id stays so votes still match.
      if (g && g.phase !== 'end') {
        const gs = g.seats[i];
        if (!gs || !gs.claimable || gs.pid) return '遊戲進行中';
        if (isSeatedPid(room, pid)) return '你已經就座';
        const holder = [...io.sockets.sockets.values()].find(s => s.data.pid === pid);
        const d = holder ? holder.data : {};
        gs.pid = pid;
        gs.claimable = false;
        if (d.name) gs.name = d.name;
        if (d.avatar) gs.avatar = d.avatar;
        if (d.bg) gs.bg = d.bg;
        if (d.fx) gs.fx = d.fx;
        if (d.pendant) gs.pendant = d.pendant;
        if (d.pv) gs.pv = d.pv;
        room.seats[i] = { pid, id: gs.id, name: gs.name, avatar: gs.avatar, bg: gs.bg, fx: gs.fx, pendant: gs.pendant || 'none', pv: gs.pv || 0, ready: false, seat: i + 1 };
        if (room.watchers) delete room.watchers[pid];
        return null;
      }
      if (room.seats[i] && room.seats[i].pid !== pid) return '這個座位已經有人';
      const cur = findSeat(room, pid);
      const sock = [...io.sockets.sockets.values()].find(s => s.data.pid === pid);
      const d = sock ? sock.data : {};
      if (cur >= 0) { if (cur === i) return null; room.seats[i] = room.seats[cur]; room.seats[cur] = null; room.seats[i].seat = i + 1; room.seats[i].ready = false; }
      else room.seats[i] = newPlayer(pid, d, i + 1);
      room.lastEvent = { seq: ++room.eventSeq, type: 'sit', id: pubId(pid), seat: i + 1 };
      return null;
    }
    case 'stand': {
      if (g && g.phase !== 'end') return '遊戲進行中';
      const target = data.id ? room.seats.find(p => p && p.id === data.id) : findPlayer(room, pid);
      if (!target) return '該玩家未就座';
      if (target.pid !== pid && !isHost) return '只有房主可以請人離座';
      const wasHost = target.pid === room.hostPid;
      standUp(room, target.pid);
      if (wasHost) pickNextHost(room, target.pid);
      return null;
    }
    case 'release': {
      if (!isHost) return '只有房主可以釋出座位';
      const id = String((data && data.id) || '');
      if (g && g.phase !== 'end') {
        const gi = g.seats.findIndex(s => s && s.id === id);
        if (gi < 0) return '該玩家未就座';
        const gs = g.seats[gi];
        if (!gs.pid) return gs.claimable ? null : '該玩家未就座';
        const old = gs.pid;
        const wasHost = old === room.hostPid;
        standUp(room, old);
        gs.pid = null;
        gs.claimable = true;
        if (room.watchers) delete room.watchers[old];
        if (wasHost) pickNextHost(room, old);
        return null;
      }
      const target = room.seats.find(p => p && p.id === id);
      if (!target) return '該玩家未就座';
      const wasHost = target.pid === room.hostPid;
      standUp(room, target.pid);
      if (wasHost) pickNextHost(room, target.pid);
      return null;
    }
    case 'ready': {
      const p = findPlayer(room, pid); if (!p) return '請先就座';
      if (isHost) return '房主無需準備';
      p.ready = !!data.ready;
      return null;
    }
    case 'kick': {
      if (!isHost) return '只有房主可以踢人';
      if (g && g.phase !== 'end') return '遊戲進行中';
      const p = seated(room).find(x => x.id === data.id) || null;
      // also unseated members? we only track seated + members set
      const pidK = p ? p.pid : null;
      if (!pidK || pidK === pid) return '無效玩家';
      standUp(room, pidK); room.members.delete(pidK); pidRoom.delete(pidK);
      for (const s of io.sockets.sockets.values()) if (s.data.pid === pidK) { s.leave(room.code); s.data.room = null; s.emit('kicked'); }
      return null;
    }
    case 'transfer': {
      if (!isHost) return '只有房主可以轉讓';
      if (g && g.phase !== 'end') return '遊戲進行中';
      const p = seated(room).find(x => x.id === data.id);
      if (!p) return '對方必須已就座';
      room.hostPid = p.pid; p.ready = false;
      const pin = discovery.get(room.code);
      if (pin) discovery.set(room.code, { ...pin, hostPid: p.pid });
      room.lastEvent = { seq: ++room.eventSeq, type: 'host', id: p.id, name: p.name };
      return null;
    }
    case 'seize': {
      // Client flags are ignored. Only the verified GM account can take host,
      // including as a spectator and while a game is in progress.
      if (!member) return '你不在房間中';
      const u = await db.getUser(pid);
      if (!db.isGM(u)) return '你沒有搶房主的權限';
      if (room.hostPid === pid) return null;
      room.hostPid = pid;
      const seatedMe = findPlayer(room, pid);
      if (seatedMe) seatedMe.ready = false;
      const pin = discovery.get(room.code);
      if (pin) discovery.set(room.code, { ...pin, hostPid: pid });
      let name = seatedMe && seatedMe.name;
      if (!name && room.watchers && room.watchers[pid]) name = room.watchers[pid].name;
      if (!name) { for (const s of io.sockets.sockets.values()) if (s.data.pid === pid && s.data.name) { name = s.data.name; break; } }
      if (!name && u && u.name) name = u.name;
      room.lastEvent = { seq: ++room.eventSeq, type: 'host', id: pubId(pid), name: name || '騎士' };
      return null;
    }
    case 'dissolve': {
      if (!isHost) return '只有房主可以解散房間';
      if (g && g.phase !== 'end') return '遊戲進行中，請先結束本局';
      for (const s of io.sockets.sockets.values()) if (s.data.room === room.code) { s.leave(room.code); s.data.room = null; s.emit('dissolved'); }
      for (const p of seated(room)) pidRoom.delete(p.pid);
      for (const mid of room.members) pidRoom.delete(mid);
      dropRoom(room.code);
      return 'dissolved';
    }
    case 'avoid': {
      if (g && g.phase !== 'end') return '遊戲進行中，下一局先可以改';
      room.avoid = room.avoid || {};
      const role = String((data && data.role) || '');
      if (!role) {
        delete room.avoid[pid];
        return null;
      }
      if (!ROLE_SIDE[role]) return '無效角色';
      const cards = await cardsOf(pid);
      if (cards <= 0) return '你沒有迴避卡';
      room.avoid[pid] = role;
      return null;
    }
    case 'start': {
      if (!isHost) return '只有房主可以開始';
      if (g && g.phase !== 'end') return '遊戲已開始';
      const e = await startGame(room);
      if (!e && room.game) {
        discovery.delete(room.code);
        room.game.vetoInv = {};
        for (const s of room.game.seats) { const c = await db.getVetoCards(s.pid).catch(() => 0); room.game.vetoInv[s.id] = c; vetoCache.set(s.pid, c); }
      }
      return e;
    }
    case 'endearly': {
      if (!isHost) return '只有房主可以提前結束';
      if (!g || g.phase === 'end') return '目前沒有進行中的遊戲';
      clearTimeout(g.timer);
      await endGame(room, 'none', '提前結束');
      return null;
    }
    case 'abort': {
      if (!isHost) return '只有房主可以結束';
      if (!g) return null;
      room.game = null; room.lastEvent = { seq: ++room.eventSeq, type: 'abort' };
      room.seats.forEach(p => { if (p) p.ready = false; });
      return null;
    }
    case 'lobby': {
      if (!isHost) return '只有房主可以操作';
      if (g && g.phase !== 'end') return '遊戲進行中';
      room.game = null; room.seats.forEach(p => { if (p) p.ready = false; });
      return null;
    }
    case 'discover': {
      if (!isHost) return '只有房主可以公開房間';
      if (g && g.phase !== 'end') return '遊戲進行中不能公開搜尋';
      if (!data.on) { discovery.delete(room.code); return null; }
      if (g) return '請先回到等待大廳再開啟搜尋';
      const c = coarseCoord(data.lat, data.lng);
      if (!c) return '位置不正確';
      discovery.set(room.code, { lat: c.lat, lng: c.lng, at: Date.now(), hostPid: pid });
      return null;
    }
  }
  if (!g) return '遊戲未開始';
  const seatIdx = g.seats.findIndex(s => s.pid === pid); const seat = g.seats[seatIdx];
  if (!seat) return '你不在這局遊戲中';
  switch (type) {
    case 'floor': {
      if (!micMode(room) || g.phase !== 'team') return '現在沒有發言輪次';
      if (data.op === 'restart') {
        if (room.hostPid !== pid) return '只有房主可以重開發言';
        beginFloor(room);
        return null;
      }
      if (data.op === 'pause' || data.op === 'resume') {
        if (room.hostPid !== pid) return '只有房主可以暫停計時';
        const f = floors.get(room.code);
        if (!f || f.status !== 'speak' || !f.speaker) return '現在沒有發言輪次';
        if (Number(data.token) !== f.token) return null;
        return data.op === 'pause' ? pauseFloor(room) : resumeFloor(room);
      }
      if (data.op === 'skip') {
        if (room.hostPid !== pid) return '只有房主可以跳過發言';
        const f = floors.get(room.code);
        if (!f || f.status !== 'speak' || !f.speaker || f.key !== (g.gid + ':' + (g.discuss || 0))) return '現在沒有發言輪次';
        if (Number(data.token) !== f.token) return null;
        advanceFloor(room, f.token);
        return null;
      }
      if (data.op === 'end') {
        const f = floors.get(room.code);
        if (!f || f.status === 'select' || !f.speaker) return null;
        if (seat.id !== f.speaker) return '現在不是你的發言';
        if (Number(data.token) !== f.token) return null;
        if (f.paused) return '計時暫停中，請房主先繼續';
        advanceFloor(room, f.token);
        return null;
      }
      return '無效操作';
    }
    case 'propose': {
      if (g.phase !== 'team') return '現在不是組隊階段';
      if (seatIdx !== g.leader) return '只有隊長可以組隊';
      const need = TEAM_SIZES[g.n][g.round];
      const ids = Array.from(new Set(data.team || []));
      if (ids.length !== need || !ids.every(id => g.seats.some(s => s.id === id))) return `需要選擇 ${need} 位隊員`;
      const blocked = g.vetoBlocked[g.round] || [];
      if (ids.some(id => blocked.includes(id))) return '本輪被回避的玩家不能再入隊';
      if (micMode(room)) {
        const f = floors.get(room.code);
        const key = g.gid + ':' + (g.discuss || 0);
        if (!f || f.status !== 'select' || f.key !== key) return '請先完成發言，再選擇隊伍';
      }
      g.team = ids; g.votes = {}; g.phase = 'vote';
      return null;
    }
    case 'veto': {
      if (!g.settings.veto) return '本局未啟用回避卡';
      if (g.phase !== 'vote') return '現在不是投票階段';
      if (!g.team.includes(seat.id)) return '你不在任務隊伍中';
      if (g.vetoUsed.includes(seat.id)) return '你本局已經用過回避卡';
      const left = await db.consumeVeto(pid);
      if (left < 0) return '你沒有回避卡（每贏一局可獲得 1 張）';
      vetoCache.set(pid, left); if (g.vetoInv) g.vetoInv[seat.id] = left;
      g.vetoUsed.push(seat.id);
      g.vetoBlocked[g.round] = (g.vetoBlocked[g.round] || []).concat(seat.id);
      room.lastEvent = { seq: ++room.eventSeq, type: 'veto', who: seat.id, name: seat.name, round: g.round };
      g.team = []; g.votes = {}; openDiscussion(g);
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
        if (approved) {
          g.rejects = 0;
          if (g.settings.excalibur) { g.phase = 'sword'; g.sword = null; }
          else { g.phase = 'quest'; g.questVotes = {}; }
        } else {
          g.rejects++;
          if (g.rejects >= 5) {
            g.team = [];
            await endGame(room, 'evil', '連續 5 次組隊被否決，壞人勝利');
            room.lastEvent = { ...room.lastEvent, prev: rec };
          } else {
            g.leader = (g.leader + 1) % g.n;
            g.team = [];
            openDiscussion(g);
          }
        }
        g.votes = {};
      }
      return null;
    }
    case 'sword': {
      if (g.phase !== 'sword') return '現在不是授予王者之劍的階段';
      const proposer = g.rounds[g.round][g.rounds[g.round].length - 1];
      if (seat.id !== proposer.leader) return '只有本輪隊長可以授予王者之劍';
      const t = g.seats.find(s => s.id === data.id);
      if (!t || !g.team.includes(t.id) || t.id === seat.id) return '必須交給隊伍中的另一位隊員';
      g.sword = t.id; g.phase = 'quest'; g.questVotes = {};
      return null;
    }
    case 'quest': {
      if (g.phase !== 'quest') return '現在不是任務階段';
      if (!g.team.includes(seat.id)) return '你不在任務隊伍中';
      if (seat.id in g.questVotes) return '你已經出過任務卡';
      let success = !!data.success;
      if (!canPlayFail(seat.role, g.lanceSwitched)) success = true;
      g.questVotes[seat.id] = success;
      if (Object.keys(g.questVotes).length === g.team.length) {
        if (g.sword) { g.phase = 'swordflip'; }
        else await finishQuest(room);
      }
      return null;
    }
    case 'swordflip': {
      if (g.phase !== 'swordflip') return '現在不是使用王者之劍的階段';
      if (seat.id !== g.sword) return '只有持劍者可以操作';
      if (data.skip) { g.swordFlipped = null; await finishQuest(room); return null; }
      const t = g.seats.find(s => s.id === data.id);
      if (!t || !g.team.includes(t.id) || t.id === seat.id) return '必須選擇隊伍中的另一位隊員';
      const original = g.questVotes[t.id];
      g.questVotes[t.id] = !original;
      g.swordFlipped = t.id;
      await finishQuest(room);
      if (room.lastEvent) room.lastEvent.swordPrivate = { holder: seat.id, target: t.id, original };
      return null;
    }
    case 'lady': {
      if (g.phase !== 'lady') return '現在不是湖中仙女階段';
      if (seatIdx !== g.lady) return '只有湖中仙女持有者可以查驗';
      const ti = g.seats.findIndex(s => s.id === data.id); const t = g.seats[ti];
      if (!t || t.pid === pid) return '無效目標';
      if (g.ladyUsed.includes(t.id)) return '此玩家已持有過湖中仙女，不能被查驗';
      g.ladyLog.push({ round: g.round, holder: seat.id, target: t.id, side: currentSide(t.role, g.lanceSwitched) });
      g.ladyUsed.push(t.id); g.lady = ti;
      room.lastEvent = { seq: ++room.eventSeq, type: 'lady', holder: seat.id, target: t.id };
      g.round++; g.leader = (g.leader + 1) % g.n; openDiscussion(g);
      return null;
    }
    case 'earlyassassin': {
      if (!g || ['end', 'assassin'].includes(g.phase)) return '現在不能提前刺殺';
      if (seat.role !== 'assassin') return '只有刺客可以提前刺殺';
      g.phase = 'assassin'; g.earlyAssassin = true; g.team = []; g.votes = {}; g.questVotes = {}; g.sword = null;
      room.lastEvent = { seq: ++room.eventSeq, type: 'earlyassassin', name: seat.name };
      return null;
    }
    case 'assassinate': {
      if (g.phase !== 'assassin') return '現在不是刺殺階段';
      if (seat.role !== 'assassin') return '只有刺客可以刺殺';
      const t = g.seats.find(s => s.id === data.id);
      if (!t || t.pid === pid) return '無效目標';
      g.assassinTarget = t.id;
      const pre = g.earlyAssassin ? '提前刺殺：' : '';
      if (t.role === 'merlin') await endGame(room, 'evil', `${pre}刺客刺中梅林（${t.name}），壞人${g.earlyAssassin ? '' : '逆轉'}勝利`);
      else await endGame(room, 'good', `${pre}刺客刺錯了（${t.name} 不是梅林），好人勝利`);
      return null;
    }
  }
  return '未知操作';
}

async function finishQuest(room) {
  const g = room.game;
  const fails = Object.values(g.questVotes).filter(v => !v).length;
  const ok = fails < (needTwoFails(g.n, g.round) ? 2 : 1);
  g.quests[g.round] = { success: ok, fails, team: g.team.slice(), sword: g.sword, flipped: g.swordFlipped };
  const qev = { type: 'quest', round: g.round, success: ok, fails, size: g.team.length, flipped: g.swordFlipped };
  room.lastEvent = { seq: ++room.eventSeq, ...qev };
  g.questVotes = {}; g.votes = {}; g.team = []; g.sword = null; g.swordFlipped = null;
  await afterQuest(room, qev);
}

function viewFor(room, pid) {
  const meSeated = findPlayer(room, pid);
  const held = room.game && room.game.seats.find(s => s.pid === pid);
  const specs = spectatorList(room);
  const preset = presetRoles(room.capacity, room.settings);
  const readyN = seated(room).filter(p => p.ready || p.pid === room.hostPid).length;
  const v = {
    code: room.code, hostId: pubId(room.hostPid), meId: held ? held.id : pubId(pid), isHost: room.hostPid === pid,
    settings: room.settings, lastEvent: room.lastEvent ? (({ swordPrivate, ...rest }) => rest)(room.lastEvent) : null,
    capacity: room.capacity, seated: seated(room).length, readyCount: readyN,
    mySeat: meSeated ? findSeat(room, pid) + 1 : null, myVetoCards: vetoCache.has(pid) ? vetoCache.get(pid) : null,
    myAvoid: (room.avoid && room.avoid[pid]) || null,
    myAvoidResult: (room.avoidResult && room.avoidResult[pid]) || null,
    spectating: !isSeatedPid(room, pid), spectators: specs,
    seats: room.seats.map((p, i) => p ? { ...pubPlayer({ ...p, seat: i + 1 }), online: playerOnline(room, p.pid), isHost: p.pid === room.hostPid } : { empty: true, seat: i + 1 }),
    floor: floorView(room),
    preset, teamSizes: TEAM_SIZES[room.capacity], evilCount: EVIL_COUNT[room.capacity],
    game: null,
  };
  const g = room.game;
  if (g) {
    const seat = g.seats.find(s => s.pid === pid);
    const ended = g.phase === 'end';
    const isPlayer = !!seat;
    // Spectators never receive hidden role info; mid-game evil reveal is players only; full roles at game end (public replay)
    const revealEvil = g.phase === 'assassin' && isPlayer;
    v.game = {
      gid: g.gid, n: g.n, phase: g.phase, earlyAssassin: !!g.earlyAssassin, round: g.round, leaderId: g.seats[g.leader].id, rejects: g.rejects,
      teamSizes: TEAM_SIZES[g.n], twoFailRound: g.n >= 7 ? 3 : -1, settings: g.settings,
      seats: g.seats.map((s, i) => ({
        seat: i + 1,
        id: s.id, name: s.name, avatar: s.avatar, bg: s.bg, fx: s.fx, pendant: s.pendant,
        photoUrl: s.avatar === 'photo' ? `/api/avatar/${s.id}?v=${s.pv || 0}` : `/img/av/${s.avatar || 'fox'}.webp`,
        online: playerOnline(room, s.pid),
        claimable: s.claimable ? true : undefined,
        role: ended ? s.role : undefined,
        side: ended ? currentSide(s.role, g.lanceSwitched) : undefined,
        evil: (revealEvil && currentSide(s.role, g.lanceSwitched) === 'evil' && s.role !== 'oberon') ? true : undefined,
        assassin: revealEvil && s.role === 'assassin' ? true : undefined,
      })),
      team: g.team, voted: Object.keys(g.votes), questDone: Object.keys(g.questVotes).length,
      quests: g.quests.map(q => q ? { success: q.success, fails: q.fails, team: q.team, sword: q.sword } : null),
      rounds: g.rounds, winner: g.winner, reason: g.reason, assassinTarget: g.assassinTarget,
      ladyId: g.lady >= 0 ? g.seats[g.lady].id : null, ladyUsed: g.ladyUsed, ladyStartId: g.ladyStartId || null,
      // Mid-game the public chain is only who passed 湖中仙女 to whom. The alignment
      // stays on the inspector's own entry so they can reopen it; spectators and
      // every other player get no side field. After the game ends, roles are public.
      ladyLog: g.ladyLog.map(l => {
        const row = { round: l.round, holder: l.holder, target: l.target };
        if (ended || (isPlayer && seat && l.holder === seat.id)) row.side = l.side;
        return row;
      }),
      sword: g.sword, lanceSwitched: ended ? g.lanceSwitched : undefined, lanceLog: g.lanceLog,
      scores: ended ? g.scores : undefined, mvp: ended ? g.mvp : undefined, runnerUp: ended ? g.runnerUp : undefined, highlights: ended ? g.highlights : undefined,
      startedAt: ended ? g.startedAt : undefined, endedAt: ended ? g.endedAt : undefined,
      review: ended ? (g.review || buildReview({
        players: g.seats.map((s, i) => ({ ...s, seat: i + 1, role: ended ? s.role : undefined, name: s.name, id: s.id })),
        quests: g.quests, rounds: g.rounds, ladyLog: g.ladyLog, ladyStartId: g.ladyStartId, ladyUsed: g.ladyUsed,
        settings: g.settings, winner: g.winner,
      })) : undefined,
      vetoUsed: g.vetoUsed, vetoBlocked: g.vetoBlocked[g.round] || [],
      me: seat ? {
        role: seat.role, side: currentSide(seat.role, g.lanceSwitched), roleName: ROLE_NAME[seat.role],
        knows: knowledge(g.seats, seat, g.lanceSwitched),
        voted: seat.id in g.votes, myVote: g.votes[seat.id], questSubmitted: seat.id in g.questVotes,
        canFail: canPlayFail(seat.role, g.lanceSwitched),
        hasVeto: !!(g.settings.veto && !g.vetoUsed.includes(seat.id) && (g.vetoInv ? g.vetoInv[seat.id] > 0 : true)),
        vetoCards: g.vetoInv ? g.vetoInv[seat.id] : vetoCache.get(pid),
        swordPrivate: room.lastEvent && room.lastEvent.swordPrivate && room.lastEvent.swordPrivate.holder === seat.id ? room.lastEvent.swordPrivate : undefined,
      } : null,
    };
  }
  return v;
}

const persistT = new Map();
function persistRoom(room) {
  if (persistT.has(room.code)) return;
  persistT.set(room.code, setTimeout(() => {
    persistT.delete(room.code);
    if (!rooms.has(room.code)) return;
    db.saveRoom(room.code, { ...room, members: [...room.members] }).catch(e => console.error('saveRoom', e.message));
  }, 600));
}
function dropRoom(code) {
  const f = floors.get(code);
  if (f) clearTimeout(f.timer);
  floors.delete(code);
  presenceGone.delete(code);
  const vm = voicePub.get(code);
  if (vm) { for (const pid of vm.keys()) io.to(code).emit('voice:gone', { id: pubId(pid) }); voicePub.delete(code); }
  discovery.delete(code);
  rooms.delete(code); clearTimeout(persistT.get(code)); persistT.delete(code);
  db.deleteRoom(code).catch(() => {});
}
async function restoreRooms() {
  try {
    for (const d of await db.loadRooms()) {
      if (!d || !d.code || rooms.has(d.code)) continue;
      const room = { ...d, members: new Set(d.members || []) };
      rooms.set(room.code, room);
      for (const pid of room.members) pidRoom.set(pid, room.code);
      for (const p of room.seats) if (p) pidRoom.set(p.pid, room.code);
      if (room.game) for (const s of room.game.seats) pidRoom.set(s.pid, room.code);
    }
    if (rooms.size) console.log('restored rooms:', rooms.size);
  } catch (e) { console.error('restoreRooms', e.message); }
}
const bcastPending = new Set();
// per-socket state diff: first push is full; later pushes carry only changed top-level keys
// (and changed sub-keys of `game`), marked with __d so the client merges them.
function stateDiff(s, v) {
  const prev = s.data.sent; const next = {}; for (const k in v) next[k] = k === 'game' && v.game ? null : JSON.stringify(v[k]);
  const gNext = {}; if (v.game) for (const k in v.game) gNext[k] = JSON.stringify(v.game[k]);
  if (!s.handshake.query || s.handshake.query.diff !== '1') { const j = JSON.stringify(v); if (j === s.data.lastJ) return null; s.data.lastJ = j; return v; }
  if (!prev || prev.code !== v.code) { s.data.sent = { code: v.code, top: next, game: v.game ? gNext : null }; return v; }
  const out = { __d: 1, code: v.code }; let n = 0;
  for (const k in v) { if (k === 'game') continue; if (prev.top[k] !== next[k]) { out[k] = v[k]; n++; } }
  const rm = Object.keys(prev.top).filter(k => !(k in v)); if (rm.length) { out.__r = rm; n++; }
  if (!v.game) { if (prev.game) { out.game = null; n++; } }
  else if (!prev.game) { out.game = v.game; n++; }
  else { const gp = {}; let gn = 0; for (const k in v.game) if (prev.game[k] !== gNext[k]) { gp[k] = v.game[k]; gn++; }
    const grm = Object.keys(prev.game).filter(k => !(k in v.game)); if (grm.length) { gp.__r = grm; gn++; }
    if (gn) { out.__g = gp; n++; } }
  s.data.sent = { code: v.code, top: next, game: v.game ? gNext : null };
  return n ? out : null;
}
function broadcast(room) {
  // coalesce bursts of updates in the same tick into one state push per socket
  if (!rooms.has(room.code) || bcastPending.has(room.code)) return;
  bcastPending.add(room.code);
  setImmediate(() => {
    bcastPending.delete(room.code);
    if (!rooms.has(room.code)) return;
    room.touched = Date.now(); persistRoom(room);
    for (const s of io.sockets.sockets.values()) if (s.data.room === room.code) {
      const v = viewFor(room, s.data.pid);
      const d = stateDiff(s, v); if (d) s.emit('state', d); // only changed keys after the first full push

    }
  });
}

function leaveCurrent(socket, pid, removeFromLobby) {
  const code = pidRoom.get(pid); if (!code) return;
  const room = rooms.get(code);
  if (!room) { pidRoom.delete(pid); return; }
  if (removeFromLobby && (!room.game || room.game.phase === 'end')) {
    standUp(room, pid); room.members.delete(pid); pidRoom.delete(pid);
    if (room.hostPid === pid) pickNextHost(room, pid);
    if (!room.members.size && !seated(room).length) dropRoom(code);
  }
  socket.leave(code); socket.data.room = null;
  if (rooms.has(code)) broadcast(room);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 20000, pingTimeout: 25000, perMessageDeflate: { threshold: 1024 } });
app.use((req, res, next) => { // Server-Timing: app processing time (excludes network), visible in devtools / curl
  if (!req.path.startsWith('/api/') && req.path !== '/healthz') return next();
  const t0 = process.hrtime.bigint(); const wh = res.writeHead;
  res.writeHead = function (...a) { try { res.setHeader('Server-Timing', `app;dur=${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)}`); } catch (e) {} return wh.apply(this, a); };
  next();
});
app.use(require('compression')());
app.use(express.json({ limit: '2mb' }));
app.get(['/privacy', '/terms'], (req, res) => res.set('Cache-Control', 'public, max-age=600').sendFile(path.join(__dirname, 'public', req.path.slice(1) + '.html')));
app.get('/healthz', (req, res) => res.set('Cache-Control', 'no-store').send('ok'));
app.get('/vendor/socket.io.min.js', (req, res) => res.set('Cache-Control', 'public, max-age=604800').sendFile(path.join(__dirname, 'node_modules/socket.io-client/dist/socket.io.min.js')));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, file) {
    if (/\.html?$/.test(file) || /manifest\.webmanifest$/.test(file)) res.set('Cache-Control', 'no-cache');
    else if (/[\\/]img[\\/]/.test(file)) res.set('Cache-Control', 'public, max-age=2592000');
    else res.set('Cache-Control', 'public, max-age=604800'); // app.js / style.css are versioned with ?v=
  },
}));

function bearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  return req.query.token || req.body && req.body.token || '';
}
async function authUser(req, res, next) {
  const u = await db.getUserByToken(bearer(req)) || (req.query.pid && (await db.getUser(req.query.pid) || await db.getUserByGuestKey(String(req.query.pid))));
  if (!u) return res.status(401).json({ error: '請先登入' });
  req.user = u; next();
}

app.get('/healthz', (req, res) => res.json({ ok: true, rooms: rooms.size, db: db.mode() }));
app.get('/api/qr', async (req, res) => {
  try {
    const svg = await QRCode.toString(String(req.query.text || '').slice(0, 300), { type: 'svg', margin: 1, width: 240, color: { dark: '#1f2937', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch (e) { res.status(400).end(); }
});

app.post('/api/auth/guest', async (req, res) => {
  try {
    const guestKey = String(req.body.guestKey || '');
    if (guestKey.length < 8 || guestKey.length > 80) return res.status(400).json({ error: '無效身份' });
    const profile = req.body.profile || {};
    const known = await userByKey(guestKey);
    const u = known || await db.createGuest({
      guestKey, name: cleanName(profile.name), avatar: cleanAvatar(profile.avatar),
      bg: cleanBg(profile.bg), fx: cleanFx(profile.fx), pendant: cleanPendant(profile.pendant), skins: profile.skins || {},
    });
    const token = await db.createSession(u.id);
    const stats = await db.getStats(u.id);
    res.json({ token, user: db.pubUser(u), stats });
  } catch (e) { console.error(e); res.status(500).json({ error: '伺服器錯誤' }); }
});
app.post('/api/auth/register', async (req, res) => {
  try {
    let u = await db.getUserByToken(bearer(req));
    if (!u) {
      const guestKey = String(req.body.guestKey || crypto.randomUUID());
      u = await db.createGuest({ guestKey, name: cleanName(req.body.name) });
    }
    const upd = await db.registerOrUpgrade(u, req.body.username, req.body.password);
    const token = await db.createSession(upd.id);
    res.json({ token, user: db.pubUser(upd), stats: await db.getStats(upd.id) });
  } catch (e) { res.status(400).json({ error: e.message || '註冊失敗' }); }
});
app.post('/api/auth/login', async (req, res) => {
  try {
    const u = await db.verifyLogin(req.body.username, req.body.password);
    if (!u) return res.status(401).json({ error: '帳號或密碼不正確' });
    const token = await db.createSession(u.id);
    res.json({ token, user: db.pubUser(u), stats: await db.getStats(u.id) });
  } catch (e) { res.status(400).json({ error: e.message || '登入失敗' }); }
});
app.post('/api/auth/logout', async (req, res) => { await db.deleteSession(bearer(req)); res.json({ ok: true }); });
app.get('/api/me', authUser, async (req, res) => {
  res.json({ user: db.pubUser(req.user), stats: await db.getStats(req.user.id) });
});
app.put('/api/me', authUser, async (req, res) => {
  try {
    const f = {};
    if ('name' in req.body) f.name = cleanName(req.body.name);
    if ('avatar' in req.body && req.body.avatar !== 'photo') f.avatar = cleanAvatar(req.body.avatar);
    if ('bg' in req.body) f.bg = cleanBg(req.body.bg);
    if ('fx' in req.body) f.fx = cleanFx(req.body.fx);
    if ('pendant' in req.body) f.pendant = cleanPendant(req.body.pendant);
    if ('skins' in req.body && typeof req.body.skins === 'object') f.skins = req.body.skins;
    if (req.body.photo) {
      const raw = String(req.body.photo);
      const m = raw.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/);
      if (!m) return res.status(400).json({ error: '相片格式無效' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 1_500_000) return res.status(400).json({ error: '相片太大' });
      const out = buf; // client already centre-crops and resizes to 256x256
      await db.setPhoto(req.user.id, out);
      f.avatar = 'photo';
    }
    const lockErr = await enforceUnlocks(req.user, f); if (lockErr) return res.status(403).json({ error: lockErr });
    const u = await db.updateUser(req.user.id, f);
    res.json({ user: db.pubUser(u) });
  } catch (e) { console.error(e); res.status(500).json({ error: '儲存失敗' }); }
});
app.get('/api/avatar/:id', async (req, res) => {
  const id = req.params.id;
  let u = await db.getUser(id) || await db.getUserByPubId(id);
  if (!u) {
    // try pubId match among recent rooms / not efficient; scan not available. History players use pub id.
    // fallback: look at seated rooms
    for (const room of rooms.values()) {
      const p = seated(room).find(x => x.id === id);
      if (p) { u = await db.getUser(p.pid); break; }
    }
  }
  if (!u) {
    // search all? skip
  }
  const uid = u ? u.id : id;
  const buf = await db.getPhoto(uid);
  if (!buf) return res.status(404).end();
  const type = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf[0] === 0x89 ? 'image/png' : 'image/webp';
  res.type(type).set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=300').send(buf);
});
app.get('/api/history', authUser, async (req, res) => {
  const list = await db.listHistory(req.user.id);
  res.json(list.map(g => {
    const { pids, ...rest } = g; const idx = (pids || []).indexOf(req.user.id);
    const me = rest.players && rest.players[idx];
    const players = (rest.players || []).map((pl, i) => ({ ...pl, photoUrl: pl.avatar === 'photo' ? `/api/avatar/${(pids||[])[i]}?v=${pl.pv || 0}` : `/img/av/${pl.avatar||'fox'}.webp` }));
    return { ...rest, players, myId: me && me.id, myRole: me && me.role };
  }));
});
app.get('/api/stats', authUser, async (req, res) => res.json(await db.getStats(req.user.id)));
app.get('/api/leaderboard', async (req, res) => {
  try {
    const players = await db.leaderboard(100);
    res.set('Cache-Control', 'no-store').json({ players, limit: 100 });
  } catch (e) {
    console.error('leaderboard', e);
    res.status(500).json({ error: '暫時無法載入排行榜' });
  }
});
app.get('/api/game/:gid', async (req, res) => {
  const g = await db.getGame(req.params.gid); if (!g) return res.status(404).json({ error: 'not found' });
  const viewer = await db.getUserByToken(bearer(req)) || (req.query.pid && await db.getUserByGuestKey(String(req.query.pid))) || (req.query.pid && await db.getUser(String(req.query.pid)));
  const idx = viewer ? (g.pids || []).indexOf(viewer.id) : -1;
  const { pids, ...rest } = g;
  res.json({ ...rest, myId: idx >= 0 && rest.players[idx] ? rest.players[idx].id : null });
});
// ---------- Google sign-in (enabled when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set) ----------
const G_ID = process.env.GOOGLE_CLIENT_ID, G_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const oauthStates = new Map();
const baseUrl = (req) => process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
app.get('/api/config', (req, res) => { const pub = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || ''; res.json({ google: !!(G_ID && G_SECRET), publicUrl: pub && !/localhost|127\.0\.0\.1/.test(pub) ? pub.replace(/\/$/, '') : 'https://avalon-roundtable-10t9.onrender.com' }); });
app.post('/api/auth/google/start', async (req, res) => {
  if (!G_ID || !G_SECRET) return res.status(503).json({ error: 'Google 登入尚未設定' });
  const u = await db.getUserByToken(bearer(req));
  const state = crypto.randomBytes(18).toString('hex');
  for (const [k, v] of oauthStates) if (v.exp < Date.now()) oauthStates.delete(k);
  oauthStates.set(state, { linkId: u ? u.id : null, room: String(req.body.room || '').slice(0, 8), exp: Date.now() + 10 * 60 * 1000 });
  const q = new URLSearchParams({ client_id: G_ID, redirect_uri: baseUrl(req) + '/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  res.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q });
});
app.get('/auth/google/callback', async (req, res) => {
  const st = oauthStates.get(String(req.query.state || '')); oauthStates.delete(String(req.query.state || ''));
  if (!st || st.exp < Date.now() || !req.query.code) return res.redirect('/?gerr=state');
  try {
    const tok = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: String(req.query.code), client_id: G_ID, client_secret: G_SECRET, redirect_uri: baseUrl(req) + '/auth/google/callback', grant_type: 'authorization_code' }) }).then(r => r.json());
    if (!tok.access_token) throw new Error('token exchange failed');
    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } }).then(r => r.json());
    if (!info.sub) throw new Error('no sub');
    let u = await db.getUserByGoogle(info.sub);
    if (!u && st.linkId) { const cur = await db.getUser(st.linkId); if (cur && !cur.google_sub) u = await db.linkGoogle(cur.id, info.sub, info.email); }
    if (!u) { u = await db.createGuest({ guestKey: 'g:' + info.sub, name: cleanName(info.given_name || info.name) }); u = await db.linkGoogle(u.id, info.sub, info.email); }
    const token = await db.createSession(u.id);
    res.redirect('/#gauth=' + token + (st.room ? '&room=' + encodeURIComponent(st.room) : ''));
  } catch (e) { console.error('google oauth', e.message); res.redirect('/?gerr=google'); }
});
app.get('/g/:gid', (req, res) => res.redirect('/?game=' + encodeURIComponent(req.params.gid)));
app.get(['/r/:code', '/room/:code'], (req, res) => res.redirect('/?room=' + encodeURIComponent(req.params.code.toUpperCase())));

async function userByKey(guestKey) {
  const key = String(guestKey || '');
  if (key.length < 8 || key.length > 80) return null;
  return await db.getUserByGuestKey(key) || await db.getUser(key);
}
async function bindSocketUser(socket, token, guestKey, profile) {
  let u = token ? await db.getUserByToken(token) : null;
  if (!u && guestKey) u = await userByKey(guestKey);
  if (!u && guestKey) u = await db.createGuest({ guestKey, name: cleanName(profile && profile.name), avatar: cleanAvatar(profile && profile.avatar), bg: cleanBg(profile && profile.bg), fx: cleanFx(profile && profile.fx), pendant: cleanPendant(profile && profile.pendant) });
  if (!u) return null;
  socket.data.pid = u.id;
  vetoCache.set(u.id, db.isGM(u) ? 999 : (u.veto_cards == null ? 1 : u.veto_cards));
  socket.data.name = u.name || cleanName(profile && profile.name);
  socket.data.avatar = u.avatar; socket.data.pv = u.updated_at ? new Date(u.updated_at).getTime() : 0;
  socket.data.bg = u.bg;
  socket.data.fx = u.fx;
  socket.data.pendant = u.pendant || 'none';
  return u;
}

const voicePub = new Map();
const discovery = new Map();
const floors = new Map();
const presenceGone = new Map();
const PRESENCE_GRACE_MS = Number(process.env.PRESENCE_GRACE_MS) > 0 ? Number(process.env.PRESENCE_GRACE_MS) : 4000;
const SPEAK_TURN_MS = Number(process.env.SPEAK_MS) > 0 ? Number(process.env.SPEAK_MS) : SPEAK_MS;
let floorSerial = 1;
const DISCOVER_RADIUS_KM = 5;
const DISCOVER_TTL_MS = Number(process.env.DISCOVER_TTL_MS) > 0 ? Number(process.env.DISCOVER_TTL_MS) : 15 * 60 * 1000;
const DISCOVER_MAX = 12;
function voiceBucket(code) { let m = voicePub.get(code); if (!m) { m = new Map(); voicePub.set(code, m); } return m; }
function silenceRoom(room) {
  if (!room) return;
  clearFloor(room);
  const m = voicePub.get(room.code);
  voicePub.delete(room.code);
  if (m) for (const pid of m.keys()) { const id = pubId(pid); io.to(room.code).emit('voice:state', { id, on: false }); io.to(room.code).emit('voice:gone', { id }); }
  io.to(room.code).emit('voice:mode', { on: false });
}
function micMode(room) { return !!(room && room.settings && room.settings.mic === true); }
function voiceDrop(room, pid, sid) {
  if (!room || !pid) return;
  const m = voicePub.get(room.code); if (!m) return;
  const cur = m.get(pid); if (!cur || (sid && cur.sid !== sid)) return;
  m.delete(pid); if (!m.size) voicePub.delete(room.code);
  const id = pubId(pid);
  io.to(room.code).emit('voice:state', { id, on: false });
  io.to(room.code).emit('voice:gone', { id });
}
function socketsInRoom(room, pid) {
  let n = 0;
  for (const s of io.sockets.sockets.values()) if (s.data.room === room.code && s.data.pid === pid) n++;
  return n;
}
function markOnline(room, pid) {
  const m = presenceGone.get(room.code);
  if (m) m.delete(pid);
}
function playerOnline(room, pid) {
  if (!room || !pid) return false;
  if (socketsInRoom(room, pid) > 0) return true;
  const at = presenceGone.get(room.code) && presenceGone.get(room.code).get(pid);
  return !!(at && Date.now() - at < PRESENCE_GRACE_MS);
}
function markMaybeOffline(room, pid) {
  if (!room || !pid || socketsInRoom(room, pid) > 0) return;
  let m = presenceGone.get(room.code);
  if (!m) { m = new Map(); presenceGone.set(room.code, m); }
  if (!m.has(pid)) m.set(pid, Date.now());
  const at = m.get(pid);
  setTimeout(() => {
    if (!rooms.has(room.code)) return;
    const cur = presenceGone.get(room.code);
    if (!cur || cur.get(pid) !== at || socketsInRoom(room, pid) > 0) return;
    const f = floors.get(room.code);
    const speaking = f && !f.paused && f.order[f.index] && f.order[f.index].pid === pid;
    if (speaking) advanceFloor(room, f.token);
    broadcast(room);
  }, PRESENCE_GRACE_MS);
}
function floorView(room) {
  const f = floors.get(room.code);
  if (!f) return null;
  const base = { id: f.id, token: f.token, discuss: f.discuss, index: f.index, order: f.order.map(x => x.id), seats: f.order.map(x => x.seat), ms: f.ms, status: f.status, selectId: f.selectId || null, skipped: !!f.skipped };
  if (f.status === 'select') return { ...base, speaker: null, seat: null, deadline: 0, paused: false, remainingMs: 0 };
  if (!f.speaker) return null;
  const paused = !!f.paused;
  return { ...base, speaker: f.speaker, seat: f.seat, paused, remainingMs: paused ? Math.max(0, Math.round(f.remainingMs || 0)) : Math.max(0, (f.deadline || 0) - Date.now()), deadline: paused ? 0 : f.deadline };
}
function muteExcept(room, speakerPid) {
  const m = voicePub.get(room.code);
  if (!m) return;
  for (const pid of [...m.keys()]) if (pid !== speakerPid) voiceDrop(room, pid);
}
function clearFloor(room) {
  const f = room && floors.get(room.code);
  if (!f) return;
  clearTimeout(f.timer);
  floors.delete(room.code);
  if (f.speakerPid) voiceDrop(room, f.speakerPid);
}
function finishSpeaking(room) {
  const f = floors.get(room.code);
  if (!f || f.status === 'select') return false;
  clearTimeout(f.timer);
  f.timer = null;
  const prev = f.speakerPid;
  f.status = 'select';
  f.selectId = f.id + ':' + f.key;
  f.speaker = null;
  f.speakerPid = null;
  f.seat = null;
  f.deadline = 0;
  f.token += 1;
  if (prev) voiceDrop(room, prev);
  muteExcept(room, null);
  return true;
}
function armFloor(room) {
  const f = floors.get(room.code);
  if (!f || f.status === 'select') return;
  clearTimeout(f.timer);
  const prevPid = f.speakerPid;
  while (f.index < f.order.length && !playerOnline(room, f.order[f.index].pid)) f.index++;
  if (f.index >= f.order.length) {
    finishSpeaking(room);
    return;
  }
  const cur = f.order[f.index];
  f.speaker = cur.id;
  f.speakerPid = cur.pid;
  f.seat = cur.seat;
  f.paused = false;
  f.remainingMs = f.ms;
  f.deadline = Date.now() + f.ms;
  f.token += 1;
  const token = f.token;
  f.timer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    const cur = floors.get(room.code);
    if (!cur || cur.paused || cur.token !== token) return;
    if (advanceFloor(room, token)) broadcast(room);
  }, f.ms);
  if (prevPid && prevPid !== cur.pid) voiceDrop(room, prevPid);
  muteExcept(room, cur.pid);
}
function pauseFloor(room) {
  const f = floors.get(room.code);
  if (!f || f.status !== 'speak' || !f.speaker) return '現在沒有發言輪次';
  if (f.paused) return null;
  clearTimeout(f.timer);
  f.timer = null;
  const left = f.deadline - Date.now();
  if (left <= 0) { advanceFloor(room, f.token); return null; }
  f.paused = true;
  f.remainingMs = left;
  f.deadline = 0;
  return null;
}
function resumeFloor(room) {
  const f = floors.get(room.code);
  if (!f || f.status !== 'speak' || !f.speaker) return '現在沒有發言輪次';
  if (!f.paused) return null;
  if (!(f.remainingMs > 0)) { f.paused = false; advanceFloor(room, f.token); return null; }
  f.paused = false;
  const wait = f.remainingMs;
  f.deadline = Date.now() + wait;
  const token = f.token;
  f.timer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    const cur = floors.get(room.code);
    if (!cur || cur.paused || cur.token !== token) return;
    if (advanceFloor(room, token)) broadcast(room);
  }, wait);
  return null;
}
function advanceFloor(room, token) {
  const f = floors.get(room.code);
  if (!f || f.status === 'select' || f.token !== token) return false;
  clearTimeout(f.timer);
  f.index += 1;
  armFloor(room);
  return true;
}
function speechSkipped(g) { return !!(g && g.phase === 'team' && g.rejects >= 2); }
function beginDirectSelect(room) {
  clearFloor(room);
  muteExcept(room, null);
  const g = room.game;
  const key = g.gid + ':' + (g.discuss || 0);
  const id = floorSerial++;
  floors.set(room.code, { id, token: 1, discuss: g.discuss || 0, key, status: 'select', selectId: id + ':' + key, skipped: true, order: [], index: 0, ms: SPEAK_TURN_MS, timer: null, speaker: null, speakerPid: null, seat: null, deadline: 0 });
}
function beginFloor(room) {
  const g = room.game;
  if (!g || g.phase !== 'team' || !micMode(room)) return;
  if (speechSkipped(g)) { beginDirectSelect(room); return; }
  clearFloor(room);
  const idxs = speakOrder(g.n, g.leader, g.seats.map(s => !!s));
  const order = idxs.map(i => ({ id: g.seats[i].id, pid: g.seats[i].pid, seat: i + 1 }));
  if (!order.length) return;
  floors.set(room.code, { id: floorSerial++, token: 0, discuss: g.discuss || 0, key: g.gid + ':' + (g.discuss || 0), status: 'speak', selectId: null, skipped: false, paused: false, remainingMs: SPEAK_TURN_MS, order, index: 0, ms: SPEAK_TURN_MS, timer: null, speaker: null, speakerPid: null, seat: null, deadline: 0 });
  armFloor(room);
}
function syncFloor(room) {
  if (!room) return;
  const g = room.game;
  if (!micMode(room) || !g || g.phase !== 'team') { clearFloor(room); return; }
  const key = g.gid + ':' + (g.discuss || 0);
  const cur = floors.get(room.code);
  if (cur && cur.key === key) return;
  beginFloor(room);
}
function floorActive(room) {
  const f = room && floors.get(room.code);
  return f && f.speaker ? f : null;
}
function hostInRoom(room) { for (const s of io.sockets.sockets.values()) if (s.data.room === room.code && s.data.pid === room.hostPid) return true; return false; }
function coarseCoord(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}
function haversineKm(a, b) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2, s2 = Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s1 + s2)));
}
function distanceLabel(km) { if (km <= 0.5) return '約 500 公尺內'; if (km <= 1) return '約 1 公里內'; if (km <= 2) return '約 2 公里內'; return '約 5 公里內'; }
function hostPublic(room) {
  const p = findPlayer(room, room.hostPid);
  let sock = null;
  if (!p) { for (const s of io.sockets.sockets.values()) if (s.data.pid === room.hostPid) { sock = s; break; } }
  const hostName = (p && p.name) || (sock && sock.data.name) || '房主';
  const hostAvatar = cleanAvatar((p && p.avatar) || (sock && sock.data.avatar) || 'fox');
  const hostBg = cleanBg((p && p.bg) || (sock && sock.data.bg));
  const id = (p && p.id) || (sock ? pubId(sock.data.pid) : '');
  const pv = Number((p && p.pv) || (sock && sock.data.pv) || 0) || 0;
  const hostPhoto = hostAvatar === 'photo' && /^[a-f0-9]{10}$/.test(id)
    ? `/api/avatar/${id}?v=${pv}`
    : `/img/av/${hostAvatar}.webp`;
  return { hostName, hostAvatar, hostBg, hostPhoto };
}
function searchNearby(origin) {
  const now = Date.now(), out = [];
  for (const [code, pin] of discovery) {
    if (!pin || now - pin.at > DISCOVER_TTL_MS) { discovery.delete(code); continue; }
    const room = rooms.get(code);
    if (!room || room.game || !hostInRoom(room)) { discovery.delete(code); continue; }
    if (pin.hostPid !== room.hostPid) pin.hostPid = room.hostPid;
    const km = haversineKm(origin, pin);
    if (km > DISCOVER_RADIUS_KM) continue;
    const seatedN = seated(room).length;
    out.push({ code: room.code, name: '房間 ' + room.code, ...hostPublic(room), seated: seatedN, capacity: room.capacity, distance: distanceLabel(km), _km: km });
  }
  out.sort((a, b) => a._km - b._km || (a.code < b.code ? -1 : 1));
  return out.slice(0, DISCOVER_MAX).map(({ _km, ...pub }) => pub);
}
function roomSocketIds(room, exceptPid) {
  const ids = [], seen = new Set();
  for (const s of io.sockets.sockets.values()) {
    if (s.data.room !== room.code || !s.data.pid || s.data.pid === exceptPid || seen.has(s.data.pid)) continue;
    seen.add(s.data.pid); ids.push(pubId(s.data.pid));
  }
  return ids;
}
function voiceRoster(room) {
  const m = voicePub.get(room.code), rows = [];
  if (m) for (const [pid, v] of m) if (v && v.on) rows.push({ id: pubId(pid), on: true });
  return rows;
}
function iceConfig() {
  const servers = [];
  const stun = process.env.STUN_URL == null ? 'stun:stun.l.google.com:19302' : String(process.env.STUN_URL);
  if (stun && stun !== '0' && stun !== 'off') servers.push({ urls: stun.split(',').map(s => s.trim()).filter(Boolean) });
  const turn = !!(process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL);
  if (turn) servers.push({ urls: String(process.env.TURN_URL).split(',').map(s => s.trim()).filter(Boolean), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return { iceServers: servers, turn };
}
function allowBurst(socket, key, limit, windowMs) {
  const now = Date.now();
  const bag = socket.data.rl || (socket.data.rl = {});
  const b = bag[key] || (bag[key] = { t: now, n: 0 });
  if (now - b.t > windowMs) { b.t = now; b.n = 0; }
  b.n += 1; return b.n <= limit;
}
function voiceCtx(socket) {
  const pid = socket.data.pid, room = socket.data.room && rooms.get(socket.data.room);
  if (!pid || !room || !room.members.has(pid)) return null;
  return { pid, room };
}

io.on('connection', (socket) => {
  socket.on('hello', async ({ token, guestKey, pid: rawPid, name, avatar, bg, fx, pendant } = {}, cb = () => {}) => {
    socket.data.sent = null;
    const u = await bindSocketUser(socket, token, guestKey || rawPid, { name, avatar, bg, fx, pendant });
    if (!u) return cb({ error: '請先登入或建立訪客' });
    const pid = u.id;
    const code = pidRoom.get(pid); const room = code && rooms.get(code);
    if (room && (room.members.has(pid) || isSeatedPid(room, pid))) {
      room.members.add(pid);
      const p = findPlayer(room, pid);
      if (p && (!room.game || room.game.phase === 'end')) applyProfile(p, socket.data);
      if (!isSeatedPid(room, pid)) rememberWatcher(room, socket);
      socket.join(code); socket.data.room = code; markOnline(room, pid); broadcast(room);
      return cb({ room: code, user: db.pubUser(u) });
    }
    cb({ room: null, user: db.pubUser(u) });
  });
  socket.on('profile', async (prof = {}) => {
    const pid = socket.data.pid; if (!pid) return;
    // prefer server copy; optional live tweaks while socket is connected
    const u = await db.getUser(pid);
    if (u) {
      socket.data.name = u.name; socket.data.avatar = u.avatar; socket.data.pv = u.updated_at ? new Date(u.updated_at).getTime() : 0; socket.data.bg = u.bg; socket.data.fx = u.fx; socket.data.pendant = u.pendant;
    }
    const room = socket.data.room && rooms.get(socket.data.room);
    if (room && (!room.game || room.game.phase === 'end')) { const p = findPlayer(room, pid); if (p) { applyProfile(p, socket.data); broadcast(room); } else { rememberWatcher(room, socket); broadcast(room); } }
  });
  socket.on('create', async (_, cb = () => {}) => {
    socket.data.sent = null;
    const pid = socket.data.pid; if (!pid) return cb({ error: '請先設定暱稱' });
    const cur = pidRoom.get(pid) && rooms.get(pidRoom.get(pid));
    if (cur && cur.game && cur.game.phase !== 'end') return cb({ error: '你正在另一局遊戲中' });
    leaveCurrent(socket, pid, true);
    const room = makeRoom(socket.data);
    pidRoom.set(pid, room.code); socket.join(room.code); socket.data.room = room.code; markOnline(room, pid);
    broadcast(room); cb({ room: room.code });
  });
  socket.on('join', ({ code } = {}, cb = () => {}) => {
    socket.data.sent = null;
    const pid = socket.data.pid; if (!pid) return cb({ error: '請先設定暱稱' });
    code = String(code || '').toUpperCase().trim();
    const room = rooms.get(code); if (!room) return cb({ error: `找不到房間 ${code}` });
    const cur = pidRoom.get(pid) && rooms.get(pidRoom.get(pid));
    if (cur && cur !== room && cur.game && cur.game.phase !== 'end' && isSeatedPid(cur, pid))
      return cb({ error: '你正在另一局遊戲中' });
    if (cur !== room) leaveCurrent(socket, pid, true);
    room.members.add(pid); pidRoom.set(pid, code);
    if (!isSeatedPid(room, pid)) rememberWatcher(room, socket);
    socket.join(code); socket.data.room = code; markOnline(room, pid); broadcast(room);
    cb({ room: code, spectating: !isSeatedPid(room, pid) });
  });
  socket.on('leave', (_, cb = () => {}) => {
    socket.data.sent = null;
    const pid = socket.data.pid; const room = pidRoom.get(pid) && rooms.get(pidRoom.get(pid));
    if (room && room.game && room.game.phase !== 'end' && isSeatedPid(room, pid)) { socket.leave(room.code); socket.data.room = null; return cb({ ok: true, stillSeated: true }); }
    if (room && room.watchers) delete room.watchers[pid];
    leaveCurrent(socket, pid, true); cb({ ok: true });
  });
  socket.on('act', async ({ type, data } = {}, cb = () => {}) => {
    const pid = socket.data.pid; const room = socket.data.room && rooms.get(socket.data.room);
    if (!room || !room.members.has(pid) && !findPlayer(room, pid) && room.hostPid !== pid) return cb({ error: '你不在房間中' });
    room.members.add(pid);
    const GAME_ACTS = { vote:1, propose:1, quest:1, lady:1, assassinate:1, sword:1, swordflip:1, swordskip:1, veto:1, earlyassassin:1, ready:1 };
    if (GAME_ACTS[String(type)] && room.game && room.game.phase !== 'end' && !inGameSeat(room, pid) && !(String(type)==='ready' && findPlayer(room, pid)))
      return cb({ error: '觀戰中不能進行此操作' });
    let err;
    try { err = await act(room, pid, String(type), data || {}); } catch (e) { console.error(e); err = '伺服器錯誤'; }
    if (err === 'dissolved') return cb({ ok: true, dissolved: true });
    if (err) return cb({ error: err });
    if (rooms.has(room.code)) syncFloor(room);
    broadcast(room); cb({ ok: true });
  });
  socket.on('resync', () => { socket.data.sent = null; const room = socket.data.room && rooms.get(socket.data.room); if (room) broadcast(room); });
  socket.on('emote', ({ e } = {}) => {
    const pid = socket.data.pid; const room = socket.data.room && rooms.get(socket.data.room);
    if (!room || !pid || !EMOTES.includes(e)) return;
    if (!room.members.has(pid) && !findPlayer(room, pid)) return;
    const now = Date.now(); if (now - (emoteAt.get(pid) || 0) < 1900) return; emoteAt.set(pid, now);
    io.to(room.code).emit('emote', { id: pubId(pid), e });
  });
  socket.on('voice:mic', ({ on } = {}, cb = () => {}) => {
    if (!allowBurst(socket, 'vm', 8, 10000)) return cb({ error: '操作太頻密' });
    const ctx = voiceCtx(socket);
    if (!ctx) return cb({ error: '你不在房間中' });
    if (!micMode(ctx.room)) return cb({ error: '麥克風模式未開啟' });
    const want = !!on;
    if (want && !isSeatedPid(ctx.room, ctx.pid)) return cb({ error: '觀戰中不能開咪' });
    if (want && speechSkipped(ctx.room.game)) return cb({ error: '已連續兩次派隊不通過，現在不能發言' });
    const turn = floorActive(ctx.room);
    if (want && turn && turn.speaker !== pubId(ctx.pid)) return cb({ error: '現在不是你的發言' });
    const m = voiceBucket(ctx.room.code);
    if (want) m.set(ctx.pid, { on: true, sid: socket.id });
    else { m.delete(ctx.pid); if (!m.size) voicePub.delete(ctx.room.code); }
    io.to(ctx.room.code).emit('voice:state', { id: pubId(ctx.pid), on: want });
    const ice = iceConfig();
    cb({ ok: true, on: want, listeners: want ? roomSocketIds(ctx.room, ctx.pid) : [], roster: voiceRoster(ctx.room), iceServers: ice.iceServers, turn: ice.turn });
  });
  socket.on('voice:listen', (_, cb = () => {}) => {
    const ctx = voiceCtx(socket);
    if (!ctx) return cb({ error: '你不在房間中' });
    if (!micMode(ctx.room)) return cb({ error: '麥克風模式未開啟' });
    const id = pubId(ctx.pid);
    const m = voicePub.get(ctx.room.code);
    if (m && !speechSkipped(ctx.room.game)) for (const [pid, v] of m) {
      if (!v || !v.on || pid === ctx.pid) continue;
      const s = [...io.sockets.sockets.values()].find(x => x.id === v.sid && x.data.room === ctx.room.code);
      if (s) s.emit('voice:please-offer', { id });
    }
    const ice = iceConfig();
    cb({ ok: true, roster: voiceRoster(ctx.room), iceServers: ice.iceServers, turn: ice.turn });
  });
  socket.on('voice:signal', (msg = {}, cb = () => {}) => {
    if (typeof cb !== 'function') cb = () => {};
    if (!allowBurst(socket, 'vs', 40, 1000)) return cb({ error: '語音訊號太頻密' });
    const ctx = voiceCtx(socket);
    if (!ctx) return cb({ error: '你不在房間中' });
    if (!micMode(ctx.room)) return cb({ error: '麥克風模式未開啟' });
    if (speechSkipped(ctx.room.game)) return cb({ error: '已連續兩次派隊不通過，現在不能發言' });
    const kind = msg.kind;
    if (kind !== 'offer' && kind !== 'answer' && kind !== 'ice') return cb({ error: '無效訊號' });
    if (kind === 'offer') {
      const v = voicePub.get(ctx.room.code) && voicePub.get(ctx.room.code).get(ctx.pid);
      if (!v || !v.on || !isSeatedPid(ctx.room, ctx.pid)) return cb({ error: '請先開啟麥克風' });
    }
    const turn = floorActive(ctx.room);
    if (turn) {
      const me = pubId(ctx.pid);
      if (kind === 'offer' && me !== turn.speaker) return cb({ error: '現在不是你的發言' });
      if (kind !== 'offer' && me !== turn.speaker && String(msg.to || '') !== turn.speaker) return cb({ error: '現在不是你的發言' });
    }
    const to = String(msg.to || '');
    const target = [...io.sockets.sockets.values()].find(s => s.data.room === ctx.room.code && s.data.pid && pubId(s.data.pid) === to);
    if (!target || target.id === socket.id) return cb({ error: '對方不在這個房間' });
    let sdp;
    if (kind !== 'ice') {
      if (typeof msg.sdp !== 'string' || msg.sdp.length < 8 || msg.sdp.length > 20000) return cb({ error: '缺少連線資料' });
      sdp = msg.sdp;
    }
    let candidate;
    if (kind === 'ice' && msg.candidate && typeof msg.candidate === 'object') {
      const cand = String(msg.candidate.candidate || '');
      if (!cand || cand.length > 1000) return cb({ error: '無效候選' });
      candidate = { candidate: cand, sdpMid: msg.candidate.sdpMid ?? null, sdpMLineIndex: msg.candidate.sdpMLineIndex ?? null };
    }
    target.emit('voice:signal', { from: pubId(ctx.pid), kind, sdp, candidate });
    cb({ ok: true });
  });
  socket.on('nearby', ({ lat, lng } = {}, cb = () => {}) => {
    if (!socket.data.pid) return cb({ error: '請先登入' });
    if (!allowBurst(socket, 'near', 8, 60000)) return cb({ error: '搜尋太頻密，請稍後再試' });
    const c = coarseCoord(lat, lng);
    if (!c) return cb({ error: '需要位置先可以搜尋附近房間' });
    cb({ ok: true, radiusKm: DISCOVER_RADIUS_KM, rooms: searchNearby(c) });
  });
  socket.on('disconnect', () => {
    const room = socket.data.room && rooms.get(socket.data.room);
    if (process.env.DEBUG_HOST) console.log('disc', socket.data.pid, socket.data.room, !!room, room && room.hostPid);
    if (!room) return;
    voiceDrop(room, socket.data.pid, socket.id);
    markMaybeOffline(room, socket.data.pid);
    if (room.hostPid === socket.data.pid) discovery.delete(room.code);
    setTimeout(() => rooms.has(room.code) && broadcast(room), 100);
    if (room.hostPid === socket.data.pid) {
      clearTimeout(hostAway.get(room.code));
      hostAway.set(room.code, setTimeout(() => {
        hostAway.delete(room.code);
        if (process.env.DEBUG_HOST) console.log('hostAway fire', room.code, rooms.has(room.code), onlinePids(room).has(room.hostPid));
        if (!rooms.has(room.code) || onlinePids(room).has(room.hostPid)) return;
        if (pickNextHost(room, room.hostPid)) broadcast(room);
      }, Number(process.env.HOST_AWAY_MS || 90000)));
    }
  });
});

setInterval(() => {
  const cutoff = Date.now() - 12 * 3600 * 1000;
  for (const [code, r] of rooms) if (r.touched < cutoff) { for (const p of seated(r)) pidRoom.delete(p.pid); dropRoom(code); }
}, 30 * 60 * 1000).unref();

async function flushRooms() {
  await Promise.all([...rooms.values()].map(r => db.saveRoom(r.code, { ...r, members: [...r.members] }).catch(() => {})));
  if (db.flush) db.flush();
}
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { flushRooms().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 4000).unref(); });

db.init().then(async () => {
  try { const c = await db.findGMCandidates(); console.log('GM config: email=' + (process.env.GM_EMAIL || '-') + ' id=' + (process.env.GM_USER_ID || '-') + ' candidates=' + JSON.stringify(c.map(u => ({ id: u.id, username: u.username, name: u.name, email: u.email, google: u.google, gm: db.isGM({ ...u, google_sub: u.google ? 1 : null }) })))); } catch (e) { console.error('gm', e.message); }
  if (process.env.PURGE_TEST_DATA !== '0') { try { const r = await db.purgeTestData(); if (r.users) console.log('purged test data', JSON.stringify(r)); } catch (e) { console.error('purge', e.message); } }
}).then(restoreRooms).then(() => {
  server.listen(PORT, () => console.log('旺角阿瓦隆 on :' + PORT, 'db=' + db.mode()));
  // keep the free Render instance warm (it sleeps after 15 min idle); disable with KEEPALIVE=0
  const self = process.env.KEEPALIVE_URL || (process.env.RENDER_EXTERNAL_URL && process.env.RENDER_EXTERNAL_URL + '/healthz');
  if (self && process.env.KEEPALIVE !== '0') setInterval(() => fetch(self).catch(() => {}), 10 * 60 * 1000).unref();
}).catch(e => { console.error('DB init failed', e); process.exit(1); });

module.exports = { server, TEAM_SIZES, EVIL_COUNT };
