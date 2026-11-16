'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const JSON_FILE = path.join(DATA_DIR, 'db.json');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const BCRYPT_ROUNDS = 10;
// never pull the photo BYTEA on ordinary user lookups (it is served separately via /api/avatar)
const UCOLS = 'id,username,username_norm,password_hash,guest_key,pub_id,name,avatar,bg,fx,pendant,skins,created_at,updated_at,veto_cards,google_sub,email,(photo IS NOT NULL) AS has_photo';
const UCOLS_U = UCOLS.split(',').map(c => c.startsWith('(') ? '(u.photo IS NOT NULL) AS has_photo' : 'u.' + c).join(',');

let mode = 'json';
let pool = null;
let mem = { users: [], sessions: [], games: [], stats: {} };

function hashTok(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }
function newId() { return crypto.randomUUID(); }
function newToken() { return crypto.randomBytes(32).toString('hex'); }

async function init() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false }, max: 8, idleTimeoutMillis: 300000, keepAlive: true });
    const c = await pool.connect();
    try {
      await c.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE,
          username_norm TEXT UNIQUE,
          password_hash TEXT,
          guest_key TEXT UNIQUE,
          pub_id TEXT UNIQUE,
          name TEXT NOT NULL DEFAULT '',
          avatar TEXT NOT NULL DEFAULT 'fox',
          bg TEXT NOT NULL DEFAULT '#f3d9a4',
          fx TEXT NOT NULL DEFAULT 'spot',
          pendant TEXT NOT NULL DEFAULT 'none',
          skins JSONB NOT NULL DEFAULT '{}',
          photo BYTEA,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
        CREATE TABLE IF NOT EXISTS games (
          gid TEXT PRIMARY KEY,
          room TEXT,
          started_at TIMESTAMPTZ,
          ended_at TIMESTAMPTZ,
          n INT,
          winner TEXT,
          reason TEXT,
          settings JSONB,
          players JSONB,
          quests JSONB,
          rounds JSONB,
          lady_log JSONB,
          assassin_target TEXT,
          scores JSONB,
          mvp TEXT,
          runner_up TEXT,
          highlights JSONB,
          pids TEXT[]
        );
        CREATE INDEX IF NOT EXISTS games_pids_idx ON games USING GIN (pids);
        CREATE INDEX IF NOT EXISTS games_ended_idx ON games (ended_at DESC);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pub_id TEXT UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS veto_cards INT NOT NULL DEFAULT 1;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
        CREATE TABLE IF NOT EXISTS user_stats (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          played INT NOT NULL DEFAULT 0,
          won INT NOT NULL DEFAULT 0,
          mvp INT NOT NULL DEFAULT 0,
          roles JSONB NOT NULL DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS rooms_state (
          code TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      mode = 'pg';
      console.log('DB: postgres');
    } finally { c.release(); }
  } else {
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    try { mem = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8')); } catch (e) { /* fresh */ }
    mem.users = mem.users || []; mem.sessions = mem.sessions || []; mem.games = mem.games || []; mem.stats = mem.stats || {}; mem.rooms = mem.rooms || {};
    mode = 'json';
    console.log('DB: local json at', JSON_FILE);
  }
}

let saveTimer;
function saveJson() {
  if (mode !== 'json') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = JSON_FILE + '.tmp';
      const copy = { ...mem, users: mem.users.map(u => { const { photo, ...r } = u; return r; }) };
      fs.writeFileSync(tmp, JSON.stringify(copy));
      fs.renameSync(tmp, JSON_FILE);
    } catch (e) { console.error('json save', e.message); }
  }, 200);
}

// Exactly one GM: the account whose verified Google email equals GM_EMAIL, or whose id equals GM_USER_ID.
// No API or UI can grant this; it is derived only from server env + verified identity.
function isGM(u) {
  if (!u) return false;
  const em = (process.env.GM_EMAIL || '').trim().toLowerCase(), gid = (process.env.GM_USER_ID || '').trim();
  return !!((gid && u.id === gid) || (em && u.google_sub && (u.email || '').toLowerCase() === em));
}
function pubUser(u) {
  if (!u) return null;
  return {
    gm: isGM(u),
    id: u.id, username: u.username || null, guest: !u.username && !u.google_sub,
    google: !!u.google_sub, email: u.email || null,
    vetoCards: u.veto_cards == null ? 1 : u.veto_cards,
    name: u.name, avatar: u.avatar, bg: u.bg, fx: u.fx, pendant: u.pendant,
    skins: typeof u.skins === 'string' ? JSON.parse(u.skins) : (u.skins || {}),
    hasPhoto: u.avatar === 'photo' || !!(u.has_photo || u.photo || (mode === 'json' && fs.existsSync(path.join(PHOTO_DIR, u.id + '.webp')))),
    photoUrl: u.avatar === 'photo' ? `/api/avatar/${u.id}?v=${u.updated_at ? new Date(u.updated_at).getTime() : 0}` : null,
  };
}

async function getUser(id) {
  if (mode === 'pg') return (await pool.query(`SELECT ${UCOLS} FROM users WHERE id=$1`, [id])).rows[0] || null;
  return mem.users.find(u => u.id === id) || null;
}
async function getUserByUsername(name) {
  const n = String(name || '').trim();
  const norm = n.toLowerCase();
  if (mode === 'pg') return (await pool.query(`SELECT ${UCOLS} FROM users WHERE username_norm=$1`, [norm])).rows[0] || null;
  return mem.users.find(u => u.username_norm === norm) || null;
}
async function getUserByPubId(pub) {
  if (!pub) return null;
  if (mode === 'pg') return (await pool.query(`SELECT ${UCOLS} FROM users WHERE pub_id=$1`, [pub])).rows[0] || null;
  return mem.users.find(u => u.pub_id === pub) || null;
}
async function getUserByGuestKey(key) {
  if (!key) return null;
  if (mode === 'pg') return (await pool.query(`SELECT ${UCOLS} FROM users WHERE guest_key=$1`, [key])).rows[0] || null;
  return mem.users.find(u => u.guest_key === key) || null;
}
async function getUserByToken(raw) {
  if (!raw) return null;
  const h = hashTok(raw);
  if (mode === 'pg') {
    const r = await pool.query(`SELECT ${UCOLS_U} FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now()`, [h]);
    return r.rows[0] || null;
  }
  const s = mem.sessions.find(x => x.token_hash === h && new Date(x.expires_at) > new Date());
  return s ? mem.users.find(u => u.id === s.user_id) : null;
}

async function createGuest({ guestKey, name, avatar, bg, fx, pendant, skins }) {
  const existing = await getUserByGuestKey(guestKey);
  if (existing) return existing;
  const id = newId();
  const pub = require('crypto').createHash('sha256').update(id).digest('hex').slice(0, 10);
  const u = {
    id, username: null, username_norm: null, password_hash: null, guest_key: guestKey, pub_id: pub,
    name: name || '', avatar: avatar || 'fox', bg: bg || '#f3d9a4', fx: fx || 'spot',
    pendant: pendant || 'none', skins: skins || {}, veto_cards: 1, created_at: new Date().toISOString(),
  };
  if (mode === 'pg') {
    await pool.query(
      `INSERT INTO users (id,guest_key,pub_id,name,avatar,bg,fx,pendant,skins) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [u.id, u.guest_key, u.pub_id, u.name, u.avatar, u.bg, u.fx, u.pendant, JSON.stringify(u.skins || {})]
    );
  } else { mem.users.push(u); saveJson(); }
  return u;
}

async function updateUser(id, fields) {
  const allow = ['name', 'avatar', 'bg', 'fx', 'pendant', 'skins'];
  const sets = {};
  for (const k of allow) if (k in fields) sets[k] = fields[k];
  if (!Object.keys(sets).length) return getUser(id);
  if (mode === 'pg') {
    const keys = Object.keys(sets);
    const vals = keys.map(k => k === 'skins' ? JSON.stringify(sets[k] || {}) : sets[k]);
    const sql = keys.map((k, i) => `${k}=$${i + 2}`).join(',');
    await pool.query(`UPDATE users SET ${sql}, updated_at=now() WHERE id=$1`, [id, ...vals]);
  } else {
    const u = mem.users.find(x => x.id === id); if (u) Object.assign(u, sets); saveJson();
  }
  return getUser(id);
}

async function setPhoto(id, buf) {
  if (mode === 'pg') {
    await pool.query(`UPDATE users SET photo=$2, avatar='photo', updated_at=now() WHERE id=$1`, [id, buf]);
  } else {
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    fs.writeFileSync(path.join(PHOTO_DIR, id + '.webp'), buf);
    const u = mem.users.find(x => x.id === id); if (u) { u.avatar = 'photo'; u.updated_at = new Date().toISOString(); } saveJson();
  }
}
async function getPhoto(id) {
  if (mode === 'pg') {
    const r = await pool.query('SELECT photo FROM users WHERE id=$1', [id]);
    return r.rows[0] && r.rows[0].photo ? r.rows[0].photo : null;
  }
  const p = path.join(PHOTO_DIR, id + '.webp');
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

function validUsername(s) {
  s = String(s || '').trim();
  const chars = Array.from(s);
  if (chars.length < 2 || chars.length > 10) return '帳號須為 2 至 10 個字';
  if (!/^[\u4e00-\u9fffA-Za-z0-9_]+$/.test(s)) return '帳號只能用中文、英文字母、數字或底線';
  return null;
}
function validPassword(s) {
  s = String(s || '');
  if (s.length < 4 || s.length > 64) return '密碼或 PIN 須為 4 至 64 個字（PIN 可用 4–6 位數字）';
  return null;
}

async function registerOrUpgrade(user, username, password) {
  const e1 = validUsername(username), e2 = validPassword(password);
  if (e1) throw new Error(e1);
  if (e2) throw new Error(e2);
  const taken = await getUserByUsername(username);
  if (taken && taken.id !== user.id) throw new Error('此帳號已被使用');
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const norm = username.trim().toLowerCase();
  if (mode === 'pg') {
    await pool.query(`UPDATE users SET username=$2, username_norm=$3, password_hash=$4, updated_at=now() WHERE id=$1`, [user.id, username.trim(), norm, hash]);
  } else {
    const u = mem.users.find(x => x.id === user.id);
    if (u) { u.username = username.trim(); u.username_norm = norm; u.password_hash = hash; }
    saveJson();
  }
  return getUser(user.id);
}

async function verifyLogin(username, password) {
  const u = await getUserByUsername(username);
  if (!u || !u.password_hash) return null;
  const ok = await bcrypt.compare(String(password || ''), u.password_hash);
  return ok ? u : null;
}

async function createSession(userId) {
  const raw = newToken();
  const exp = new Date(Date.now() + 400 * 24 * 3600 * 1000); // ~13 months
  if (mode === 'pg') {
    await pool.query(`INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)`, [hashTok(raw), userId, exp.toISOString()]);
  } else {
    mem.sessions.push({ token_hash: hashTok(raw), user_id: userId, expires_at: exp.toISOString() });
    if (mem.sessions.length > 5000) mem.sessions = mem.sessions.slice(-4000);
    saveJson();
  }
  return raw;
}
async function deleteSession(raw) {
  const h = hashTok(raw);
  if (mode === 'pg') await pool.query('DELETE FROM sessions WHERE token_hash=$1', [h]);
  else { mem.sessions = mem.sessions.filter(s => s.token_hash !== h); saveJson(); }
}

const J = (v) => v === undefined ? null : JSON.stringify(v);
async function saveGame(rec) {
  if (mode === 'pg') {
    await pool.query(
      `INSERT INTO games (gid,room,started_at,ended_at,n,winner,reason,settings,players,quests,rounds,lady_log,assassin_target,scores,mvp,runner_up,highlights,pids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (gid) DO NOTHING`,
      [rec.gid, rec.room, rec.startedAt ? new Date(rec.startedAt) : null, rec.endedAt ? new Date(rec.endedAt) : new Date(), rec.n, rec.winner, rec.reason, J(rec.settings), J(rec.players), J(rec.quests), J(rec.rounds), J(rec.ladyLog), rec.assassinTarget, J(rec.scores), rec.mvp, rec.runnerUp, J(rec.highlights), rec.pids]
    );
    for (const pid of rec.winner === 'none' ? [] : rec.pids) {
      const st = rec.players[rec.pids.indexOf(pid)];
      if (!st) continue;
      const won = st.side === rec.winner;
      if (won) await pool.query('UPDATE users SET veto_cards = LEAST(COALESCE(veto_cards,0) + 1, 10) WHERE id=$1', [pid]);
      await pool.query(
        `INSERT INTO user_stats (user_id,played,won,mvp,roles) VALUES ($1,1,$2,$3,$4)
         ON CONFLICT (user_id) DO UPDATE SET
           played = user_stats.played + 1,
           won = user_stats.won + $2,
           mvp = user_stats.mvp + $3,
           roles = user_stats.roles`,
        [pid, won ? 1 : 0, rec.mvpPid === pid ? 1 : 0, '{}']
      );
      // update roles jsonb
      const cur = (await pool.query('SELECT roles FROM user_stats WHERE user_id=$1', [pid])).rows[0];
      const roles = cur.roles || {};
      const r = roles[st.role] || { played: 0, won: 0 };
      r.played++; if (won) r.won++; roles[st.role] = r;
      await pool.query('UPDATE user_stats SET roles=$2 WHERE user_id=$1', [pid, J(roles)]);
    }
  } else {
    mem.games.push(rec);
    if (mem.games.length > 2000) mem.games.splice(0, mem.games.length - 2000);
    for (const pid of rec.winner === 'none' ? [] : rec.pids) {
      const st = rec.players[rec.pids.indexOf(pid)]; if (!st) continue;
      const won = (st.side || require('./rules').ROLE_SIDE[st.role]) === rec.winner;
      const s = mem.stats[pid] || (mem.stats[pid] = { played: 0, won: 0, mvp: 0, roles: {} });
      const r = s.roles[st.role] || (s.roles[st.role] = { played: 0, won: 0 });
      s.played++; r.played++; if (won) { s.won++; r.won++; }
      if (rec.mvpPid === pid) s.mvp = (s.mvp || 0) + 1;
      if (won) { const u = mem.users.find(x => x.id === pid); if (u) u.veto_cards = Math.min((u.veto_cards == null ? 1 : u.veto_cards) + 1, 10); }
    }
    saveJson();
  }
}

async function listHistory(userId) {
  if (mode === 'pg') {
    const r = await pool.query(`SELECT * FROM games WHERE $1 = ANY(pids) ORDER BY ended_at DESC LIMIT 50`, [userId]);
    return r.rows.map(rowToGame);
  }
  return mem.games.filter(g => g.pids.includes(userId)).slice(-50).reverse();
}
async function getGame(gid) {
  if (mode === 'pg') {
    const r = await pool.query('SELECT * FROM games WHERE gid=$1', [gid]);
    return r.rows[0] ? rowToGame(r.rows[0]) : null;
  }
  return mem.games.find(g => g.gid === gid) || null;
}
function rowToGame(r) {
  return {
    gid: r.gid, room: r.room, startedAt: r.started_at || r.startedAt, endedAt: r.ended_at || r.endedAt,
    n: r.n, winner: r.winner, reason: r.reason, settings: r.settings, players: r.players,
    quests: r.quests, rounds: r.rounds, ladyLog: r.lady_log || r.ladyLog, assassinTarget: r.assassin_target || r.assassinTarget,
    scores: r.scores, mvp: r.mvp, runnerUp: r.runner_up || r.runnerUp, highlights: r.highlights, pids: r.pids,
  };
}
async function getStats(userId) {
  if (mode === 'pg') {
    const r = await pool.query('SELECT * FROM user_stats WHERE user_id=$1', [userId]);
    return r.rows[0] || { played: 0, won: 0, mvp: 0, roles: {} };
  }
  return mem.stats[userId] || { played: 0, won: 0, mvp: 0, roles: {} };
}

async function getVetoCards(id) {
  const u = await getUser(id); return u ? (u.veto_cards == null ? 1 : u.veto_cards) : 0;
}
async function consumeVeto(id) {
  if (mode === 'pg') {
    const r = await pool.query('UPDATE users SET veto_cards = veto_cards - 1 WHERE id=$1 AND veto_cards > 0 RETURNING veto_cards', [id]);
    return r.rows.length ? r.rows[0].veto_cards : -1;
  }
  const u = mem.users.find(x => x.id === id); if (!u) return -1;
  const c = u.veto_cards == null ? 1 : u.veto_cards; if (c <= 0) return -1;
  u.veto_cards = c - 1; saveJson(); return u.veto_cards;
}
async function getUserByGoogle(sub) {
  if (mode === 'pg') return (await pool.query(`SELECT ${UCOLS} FROM users WHERE google_sub=$1`, [sub])).rows[0] || null;
  return mem.users.find(u => u.google_sub === sub) || null;
}
async function linkGoogle(id, sub, email) {
  if (mode === 'pg') await pool.query('UPDATE users SET google_sub=$2, email=COALESCE($3,email), updated_at=now() WHERE id=$1', [id, sub, email || null]);
  else { const u = mem.users.find(x => x.id === id); if (u) { u.google_sub = sub; if (email) u.email = email; } saveJson(); }
  return getUser(id);
}


// ---- live room snapshots (resume after tab close / server restart) ----
async function saveRoom(code, data) {
  if (mode === 'pg') await pool.query(`INSERT INTO rooms_state (code,data,updated_at) VALUES ($1,$2,now()) ON CONFLICT (code) DO UPDATE SET data=$2, updated_at=now()`, [code, JSON.stringify(data)]);
  else { mem.rooms[code] = data; saveJson(); }
}
async function deleteRoom(code) {
  if (mode === 'pg') await pool.query('DELETE FROM rooms_state WHERE code=$1', [code]);
  else { delete mem.rooms[code]; saveJson(); }
}
async function loadRooms() {
  if (mode === 'pg') { await pool.query(`DELETE FROM rooms_state WHERE updated_at < now() - interval '12 hours'`); return (await pool.query('SELECT data FROM rooms_state')).rows.map(r => r.data); }
  return Object.values(mem.rooms || {});
}
function flush() {
  if (mode !== 'json') return;
  clearTimeout(saveTimer);
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); const copy = { ...mem, users: mem.users.map(u => { const { photo, ...r } = u; return r; }) }; fs.writeFileSync(JSON_FILE, JSON.stringify(copy)); } catch (e) { console.error('flush', e.message); }
}

// ---- one-off cleanup of automated-test guests (strict key patterns that real clients never generate) ----
const TEST_KEY_SQL = `(guest_key ~ '^(sim|tf|lb|rs|smk|rvb|uibot)[a-z0-9]+$' AND username IS NULL AND google_sub IS NULL)
  OR (guest_key ~ '^acct[a-z0-9]{8}xx$' AND username ~ '^u[a-z0-9]{6}$' AND google_sub IS NULL)`;
const TEST_KEY_RE = /^(sim|tf|lb|rs|smk|rvb|uibot)[a-z0-9]+$/;
async function purgeTestData() {
  if (mode === 'pg') {
    const ids = (await pool.query(`SELECT id FROM users WHERE (${TEST_KEY_SQL}) AND email IS NULL AND google_sub IS NULL`)).rows.map(r => r.id).filter(id => id !== (process.env.GM_USER_ID || '').trim());
    if (!ids.length) return { users: 0, games: 0, rooms: 0 };
    const g = await pool.query(`DELETE FROM games WHERE pids <@ $1::text[]`, [ids]);
    let rooms = 0;
    for (const r of (await pool.query('SELECT code, data FROM rooms_state')).rows) {
      const pids = [...(r.data.members || []), ...(r.data.seats || []).filter(Boolean).map(s => s.pid)];
      if (pids.length && pids.every(x => ids.includes(x))) { await pool.query('DELETE FROM rooms_state WHERE code=$1', [r.code]); rooms++; }
    }
    const u = await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [ids]);
    return { users: u.rowCount, games: g.rowCount, rooms, roomCodes: [] };
  }
  const isTest = (u) => !u.google_sub && ((!u.username && TEST_KEY_RE.test(u.guest_key || '')) || (/^acct[a-z0-9]{8}xx$/.test(u.guest_key || '') && /^u[a-z0-9]{6}$/.test(u.username || '')));
  const ids = new Set(mem.users.filter(isTest).map(u => u.id));
  if (!ids.size) return { users: 0, games: 0, rooms: 0 };
  const g0 = mem.games.length; mem.games = mem.games.filter(g => !(g.pids || []).every(x => ids.has(x)));
  let rooms = 0; for (const [code, r] of Object.entries(mem.rooms || {})) { const pids = [...(r.members || []), ...(r.seats || []).filter(Boolean).map(s => s.pid)]; if (pids.length && pids.every(x => ids.has(x))) { delete mem.rooms[code]; rooms++; } }
  mem.users = mem.users.filter(u => !ids.has(u.id)); mem.sessions = mem.sessions.filter(s => !ids.has(s.user_id || s.userId)); for (const id of ids) delete mem.stats[id];
  saveJson(); return { users: ids.size, games: g0 - mem.games.length, rooms };
}
async function findGMCandidates() {
  if (mode !== 'pg') return [];
  return (await pool.query(`SELECT id, username, name, email, google_sub IS NOT NULL AS google, created_at FROM users WHERE email ILIKE '%dickson%' OR username ILIKE '%dickson%' OR name ILIKE '%dickson%' OR email = $1 ORDER BY created_at LIMIT 10`, [(process.env.GM_EMAIL || '').toLowerCase()])).rows;
}
module.exports = {
  isGM, findGMCandidates, purgeTestData, flush, saveRoom, deleteRoom, loadRooms,
  init, mode: () => mode, pubUser,
  getUser, getUserByUsername, getUserByGuestKey, getUserByPubId, getUserByToken,
  createGuest, updateUser, setPhoto, getPhoto,
  validUsername, validPassword, registerOrUpgrade, verifyLogin,
  createSession, deleteSession, saveGame, listHistory, getGame, getStats,
  getVetoCards, consumeVeto, getUserByGoogle, linkGoogle,
};
