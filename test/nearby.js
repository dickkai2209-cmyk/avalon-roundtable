'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const PORT = 39100 + (process.pid % 700);
const ROOT = path.join(__dirname, '..');
const DATA = '/tmp/av-near-' + process.pid;
fs.mkdirSync(DATA, { recursive: true });
const URL = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const kids = [];
const track = (p) => { kids.push(p); return p; };
function killAll() { for (const p of kids) { if (!p || !p.pid) continue; try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { try { p.kill('SIGKILL'); } catch (e2) {} } } }
process.on('exit', killAll);
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
async function mk(name) {
  const pid = 'near' + name + Math.random().toString(36).slice(2, 8);
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { s, st: null };
  s.on('state', st => { c.st = st; });
  c.emit = (e, d) => new Promise(r => s.emit(e, d, r));
  c.act = (t, d) => c.emit('act', { type: t, data: d });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('connect')), 8000); s.on('connect', () => { clearTimeout(t); res(); }); });
  await c.emit('hello', { pid, name, avatar: 'fox' });
  return c;
}
(async () => {
  const srv = track(spawn(process.execPath, ['server.js'], { cwd: ROOT, detached: true, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0', DISCOVER_TTL_MS: '8000' }, stdio: ['ignore', 'pipe', 'pipe'] }));
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  const t0 = Date.now(); while (!/on :/.test(log)) { if (Date.now() - t0 > 8000) throw new Error(log.slice(-300)); await sleep(40); }
  const origin = { lat: 22.3, lng: 114.17 };
  const north = (km) => ({ lat: +(origin.lat + km / 111.32).toFixed(6), lng: origin.lng });
  const a = await mk('近'), b = await mk('中'), c = await mk('遠'), guest = await mk('客');
  const ra = (await a.emit('create')).room, rb = (await b.emit('create')).room, rc = (await c.emit('create')).room;
  assert((await guest.emit('nearby', {})).error, 'no coordinates refused');
  assert((await guest.emit('nearby', origin)).rooms.length === 0, 'private rooms stay unlisted');
  const joiner = await mk('客2'); await joiner.emit('join', { code: ra });
  assert((await joiner.act('discover', { on: true, lat: north(0.4).lat, lng: north(0.4).lng })).error, 'non-host cannot publish');
  assert((await a.act('discover', { on: true, lat: 120, lng: 10 })).error, 'bad latitude rejected');
  assert((await a.act('discover', { on: true, lat: north(0.4).lat, lng: north(0.4).lng })).ok, 'near opt in');
  assert((await b.act('discover', { on: true, lat: north(2.4).lat, lng: north(2.4).lng })).ok, 'mid opt in');
  assert((await c.act('discover', { on: true, lat: north(8).lat, lng: north(8).lng })).ok, 'far opt in');
  const found = await guest.emit('nearby', origin);
  const codes = found.rooms.map(r => r.code);
  assert(codes[0] === ra && codes[1] === rb && !codes.includes(rc), 'radius order ' + codes.join(','));
  const blob = JSON.stringify(found);
  assert(!blob.includes(String(north(0.4).lat)) && !blob.includes('email') && !blob.includes('latitude'), 'no exact coordinates or email');
  assert(found.rooms.every(r => JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['capacity', 'code', 'distance', 'hostName', 'name', 'seated'])), 'public fields only');
  assert((await a.act('discover', { on: false })).ok, 'opt out');
  assert(!(await guest.emit('nearby', origin)).rooms.some(r => r.code === ra), 'opt-out excluded');
  const h = await mk('主'); const room = (await h.emit('create')).room;
  await h.act('capacity', { n: 5 });
  await h.act('discover', { on: true, lat: north(0.4).lat, lng: north(0.4).lng });
  for (let i = 0; i < 4; i++) { const p = await mk('員' + i); await p.emit('join', { code: room }); await p.act('sit', { seat: i + 2 }); }
  const look = await mk('查');
  assert((await look.emit('nearby', origin)).rooms.some(r => r.code === room), 'waiting room listed');
  assert((await h.act('start')).ok, 'start');
  await sleep(80);
  assert(!(await look.emit('nearby', origin)).rooms.some(r => r.code === room), 'started game excluded');
  assert((await b.act('discover', { on: true, lat: north(2.4).lat, lng: north(2.4).lng })).ok, 'mid fresh');
  const listed = (await look.emit('nearby', origin)).rooms.find(r => r.code === rb);
  const j1 = await mk('併1'), j2 = await mk('併2');
  const both = await Promise.all([j1.emit('join', { code: listed.code }), j2.emit('join', { code: listed.code })]);
  assert(both.every(r => r && r.room === rb), 'parallel join uses the room code');
  assert((await guest.emit('join', { code: 'ZZZZ' })).error, 'bad code still fails');
  let limited = false; const spam = await mk('頻');
  for (let i = 0; i < 9; i++) { const r = await spam.emit('nearby', origin); if (r.error) limited = true; }
  assert(limited, 'search rate limit');
  [a, b, c, guest, joiner, h, look, j1, j2, spam].forEach(p => { try { p.s.close(); } catch (e) {} });
  killAll();
  console.log('NEARBY TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('FAILED', e); killAll(); process.exit(1); });
