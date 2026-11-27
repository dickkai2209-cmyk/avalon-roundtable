// 12-player games deal 7 good and 5 evil. 5–11 stay on the counts that already add up.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const { presetRoles, EVIL_COUNT, ROLE_SIDE } = require('../rules');

const PORT = 36000 + (process.pid % 800);
const URL = 'http://127.0.0.1:' + PORT;
const DATA = '/tmp/av-roles-' + process.pid;
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const EXPECT = {
  5: [3, 2], 6: [4, 2], 7: [4, 3], 8: [5, 3], 9: [6, 3], 10: [6, 4], 11: [7, 4], 12: [7, 5],
};

for (const n of Object.keys(EXPECT).map(Number)) {
  const deal = presetRoles(n);
  const [g, e] = EXPECT[n];
  assert(deal.overflow === false, n + ' default does not overflow');
  assert(deal.good.length === g && deal.evil.length === e, n + ' preset is ' + g + ' good / ' + e + ' evil, got ' + deal.good.length + '/' + deal.evil.length);
  assert(deal.good.length + deal.evil.length === n, n + ' preset deals exactly ' + n + ' roles');
  assert(EVIL_COUNT[n] === e, n + ' evil count is ' + e);
  assert(deal.good.every(r => ROLE_SIDE[r] === 'good') && deal.evil.every(r => ROLE_SIDE[r] === 'evil'), n + ' sides match the role list');
}

const full12 = presetRoles(12, { advanced: true, percival: true, lancelot: true, morgana: true, mordred: true, oberon: true });
assert(full12.overflow === false && full12.good.length === 7 && full12.evil.length === 5, '12 advanced roles still fill 7 good / 5 evil');
const lanceOff = presetRoles(12, { lancelot: false });
assert(lanceOff.good.length === 7 && lanceOff.evil.length === 5 && !lanceOff.good.includes('lancelot_good') && !lanceOff.evil.includes('lancelot_evil'), '12 without Lancelot is still 7 / 5');
const tooEvil = presetRoles(5, { advanced: true, percival: true, morgana: true, mordred: true, oberon: true });
assert(tooEvil.overflow === true && tooEvil.evil.length > EVIL_COUNT[5], 'advanced overflow still rejects too many evil roles');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
assert(app.includes('<td>好人</td><td>3</td><td>4</td><td>4</td><td>5</td><td>6</td><td>6</td><td>7</td><td>7</td>'), 'rules table gives 12 players 7 good');
assert(app.includes('<td>壞人</td><td>2</td><td>2</td><td>3</td><td>3</td><td>3</td><td>4</td><td>4</td><td>5</td>'), 'rules table keeps 5 evil at 12');
assert(!app.includes('<td>7</td><td>8</td></tr><tr><td>壞人</td>'), 'the 8-good cell for 12 players is gone');
assert(app.includes('const PD_V = 8'), 'slim frame cache key stays at 8');
assert(html.includes('style.css?v=86') && html.includes('app.js?v=85'), 'style cache is 86 and app cache stays 85');
assert(!html.includes('style.css?v=85'), 'previous style cache 85 is not reused');
assert(!html.includes('style.css?v=69') && !html.includes('app.js?v=77') && !html.includes('style.css?v=70') && !html.includes('app.js?v=78'), 'reserved cache versions stay unused');

function mk(i) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { s, st: null, pid: 'rc' + i + Math.random().toString(36).slice(2, 10) };
  c.emit = (e, d) => new Promise(r => s.emit(e, d, r));
  c.act = (t, d) => c.emit('act', { type: t, data: d });
  s.on('state', st => { c.st = st; });
  c.ready = new Promise(r => s.on('connect', async () => { await c.emit('hello', { pid: c.pid, name: 'R' + i }); r(); }));
  return c;
}
async function until(fn, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (fn()) return; await sleep(30); }
  throw new Error('timeout');
}

(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(DATA, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const stop = () => { try { srv.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', stop);
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('server did not start')), 8000);
      srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
    });
    const cs = [];
    for (let i = 0; i < 12; i++) cs.push(mk(i));
    await Promise.all(cs.map(c => c.ready));
    const { room } = await cs[0].emit('create');
    assert((await cs[0].act('capacity', { n: 12 })).ok, 'host sets 12 seats');
    await until(() => cs[0].st && cs[0].st.capacity === 12 && cs[0].st.preset && cs[0].st.preset.good.length === 7);
    assert(cs[0].st.preset.good.length === 7 && cs[0].st.preset.evil.length === 5 && cs[0].st.evilCount === 5, 'lobby reports 藍方 7 / 紅方 5');
    assert((await cs[0].act('settings', { advanced: true, percival: true, morgana: true, mordred: true, oberon: true, lancelot: true })).ok, 'advanced roles on');
    await until(() => cs[0].st.preset.good.length === 7 && cs[0].st.preset.evil.length === 5 && cs[0].st.settings.advanced);
    assert(cs[0].st.preset.good.length === 7 && cs[0].st.preset.evil.length === 5, 'advanced 12-player lobby stays 7 / 5');
    for (let i = 1; i < 12; i++) {
      await cs[i].emit('join', { code: room });
      assert((await cs[i].act('sit', { seat: i + 1 })).ok, 'seat ' + (i + 1));
    }
    await until(() => cs[0].st.seated === 12);
    assert((await cs[0].act('start')).ok, '12-player game starts');
    await until(() => cs.every(c => c.st && c.st.game && c.st.game.me && c.st.game.me.role));
    const roles = cs.map(c => c.st.game.me.role);
    const good = roles.filter(r => ROLE_SIDE[r] === 'good').length;
    const evil = roles.filter(r => ROLE_SIDE[r] === 'evil').length;
    assert(roles.length === 12 && good === 7 && evil === 5, 'dealt hands are 7 good / 5 evil (' + good + '/' + evil + ')');
    assert(cs.every(c => c.st.game.n === 12), 'the running game is a 12-player game');
    cs.forEach(c => c.s.close());
    console.log('ROLES COUNT TESTS PASSED');
    process.exit(0);
  } finally {
    stop();
  }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
