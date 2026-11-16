// In-app vote reminder: once per actionable vote, not for spectators or players who already voted.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3433;
const CDP = 9441;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/vote-remind-' + Date.now();
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject);
  });
}
function bot(key, name) {
  const s = io(APP, { transports: ['websocket'], forceNew: true, query: { diff: '1' } });
  const c = { s, st: null, name };
  s.on('state', st => {
    if (st && st.__d) {
      if (!c.st || c.st.code !== st.code) return s.emit('resync');
      const m = { ...c.st };
      for (const k in st) if (k !== '__d' && k !== '__r' && k !== '__g') m[k] = st[k];
      (st.__r || []).forEach(k => delete m[k]);
      if (st.__g) {
        const g = { ...(m.game || {}) };
        for (const k in st.__g) if (k !== '__r') g[k] = st.__g[k];
        (st.__g.__r || []).forEach(k => delete g[k]);
        m.game = g;
      }
      st = m;
    }
    c.st = st;
  });
  c.emit = (ev, d) => new Promise(r => s.emit(ev, d, r));
  c.act = (type, data) => c.emit('act', { type, data });
  c.ready = new Promise((res, rej) => s.on('connect', async () => {
    const h = await c.emit('hello', { guestKey: key, name });
    if (!h || h.error) rej(new Error(h && h.error || 'hello'));
    else res(h);
  }));
  return c;
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0', GM_EMAIL: '', GM_USER_ID: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const stop = () => { try { chrome && chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server')), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });

  const names = ['甲', '乙', '丙', '丁', '戊'];
  const people = [];
  for (let i = 0; i < 5; i++) {
    const guestKey = 'vr' + i + 'k' + Date.now().toString(36);
    const j = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey, profile: { name: names[i], avatar: 'fox', bg: '#ffffff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
    people.push({ ...j, guestKey, name: names[i] });
  }
  const watcherKey = 'vrwatch' + Date.now().toString(36);
  const watcher = await fetch(APP + 'api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ guestKey: watcherKey, profile: { name: '觀戰', avatar: 'cat', bg: '#ffffff', fx: 'spot', pendant: 'none' } }) }).then(r => r.json());
  const bots = people.map(p => bot(p.guestKey, p.name));
  const spec = bot(watcherKey, '觀戰');
  await Promise.all([...bots, spec].map(b => b.ready));
  const made = await bots[0].emit('create', {});
  if (!made || !made.room) throw new Error('create ' + JSON.stringify(made));
  for (let i = 0; i < 30 && !(bots[0].st && bots[0].st.code); i++) await sleep(40);
  await bots[0].act('capacity', { n: 5 });
  const code = made.room;
  for (let i = 1; i < 5; i++) {
    await bots[i].emit('join', { code });
    const sat = await bots[i].act('sit', { seat: i + 1 });
    if (!sat || !sat.ok) throw new Error('sit ' + JSON.stringify(sat));
  }
  await spec.emit('join', { code });
  const started = await bots[0].act('start');
  if (!started || !started.ok) throw new Error('start ' + JSON.stringify(started));
  for (let i = 0; i < 40 && !(bots[0].st && bots[0].st.game); i++) await sleep(50);
  const g0 = bots[0].st.game;
  const meId = bots[0].st.meId;
  const need = g0.teamSizes[g0.round];
  const others = g0.seats.map(s => s.id).filter(id => id !== meId);
  const team = [meId, ...others].slice(0, need);
  const leader = bots.find(b => b.st.meId === g0.leaderId);
  const proposed = await leader.act('propose', { team });
  if (!proposed || !proposed.ok) throw new Error('propose ' + JSON.stringify(proposed));

  let chrome;
  const chromeBin = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-vote-remind-' + Date.now(), '--window-size=420,900', APP], { stdio: 'ignore' });
  chrome = chromeBin;
  let tab;
  for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP + '/json/list')).find(t => t.type === 'page'); } catch { await sleep(120); } }
  assert(tab && tab.webSocketDebuggerUrl, 'browser ready');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let idn = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p(m.result); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise(res => { const i = ++idn; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalj = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

  const profile = JSON.stringify({ name: '甲', avatar: 'fox', bg: '#ffffff', fx: 'spot', pendant: 'none' });
  async function asUser(person) {
    await evalj(`localStorage.setItem('cc.token', ${JSON.stringify(person.token)}); localStorage.setItem('cc.pid', ${JSON.stringify(person.user.id)}); localStorage.setItem('cc.profile', ${JSON.stringify(profile)}); location.replace(${JSON.stringify(APP + '?vr=' + Date.now())})`);
    for (let i = 0; i < 40; i++) {
      const ok = await evalj(`!!(window.__voteAction && document.querySelector('.rt, [data-a="create"]'))`).catch(() => false);
      if (ok) return;
      await sleep(150);
    }
    throw new Error('page did not load for ' + person.user.name);
  }
  async function banner() {
    return evalj(`(() => { const els = [...document.querySelectorAll('.vote-remind')]; const t = els.map(el => el.innerText.replace(/\\s+/g, ' ')); return { n: els.length, text: t[0] || '', key: els[0] ? els[0].dataset.key : '' }; })()`);
  }
  async function waitBanner(pred, label) {
    let last = null;
    for (let i = 0; i < 40; i++) {
      last = await banner();
      if (pred(last)) return last;
      await sleep(150);
    }
    throw new Error(label + ' ' + JSON.stringify(last));
  }

  try {
    for (let i = 0; i < 40; i++) {
      const ready = await evalj(`!!document.querySelector('[data-a="create"]')`).catch(() => false);
      if (ready) break;
      await sleep(150);
    }
    await sleep(300);
    await asUser(people[0]);
    const rules = await evalj(`(() => {
      const base = { gid: 'G', phase: 'vote', round: 1, team: ['a', 'b'], rounds: [[], []], me: { voted: false, questSubmitted: false } };
      const first = __voteAction(base, 'me', false);
      const same = __voteAction(base, 'me', false);
      const nextProposal = __voteAction({ ...base, rounds: [[], [{ approved: false }]], team: ['c', 'd'] }, 'me', false);
      const voted = __voteAction({ ...base, me: { voted: true, questSubmitted: false } }, 'me', false);
      const spec = __voteAction(base, 'me', true);
      const noMe = __voteAction({ ...base, me: null }, 'me', false);
      const offTeam = __voteAction({ ...base, phase: 'quest' }, 'me', false);
      const onTeam = __voteAction({ ...base, phase: 'quest', team: ['me', 'b'], me: { voted: false, questSubmitted: false } }, 'me', false);
      const submitted = __voteAction({ ...base, phase: 'quest', team: ['me'], me: { questSubmitted: true } }, 'me', false);
      const nextQuest = __voteAction({ ...base, phase: 'quest', round: 2, team: ['me'], me: { questSubmitted: false } }, 'me', false);
      const mvp = __voteAction({ ...base, phase: 'end', me: { voted: false } }, 'me', false);
      return { first, same, nextProposal, voted, spec, noMe, offTeam, onTeam, submitted, nextQuest, mvp };
    })()`);
    assert(rules.first && rules.first.text === '輪到你投票' && rules.first.key === rules.same.key, 'same proposal has one reminder key');
    assert(rules.nextProposal.key !== rules.first.key, 'a new proposal gets a new reminder');
    assert(rules.voted === null && rules.spec === null && rules.noMe === null, 'already voted, spectators, and non-players are silent');
    assert(rules.offTeam === null, 'quest reminder skips players who are not on the mission');
    assert(rules.onTeam && rules.onTeam.text === '請提交任務票' && !/贊成|反對|梅林|刺客/.test(rules.onTeam.text), 'mission participants are asked to submit a quest card');
    assert(rules.submitted === null && rules.nextQuest.key !== rules.onTeam.key, 'a submitted card ends the reminder and the next quest is new');
    assert(rules.mvp === null, 'automatic MVP scoring is not a vote');

    const first = await waitBanner(b => b.n === 1 && b.text.includes('輪到你投票'), 'vote banner');
    assert(!/贊成|反對|梅林|刺客/.test(first.text), 'the live banner does not reveal a ballot or a role');
    const other = bots.find(b => b !== leader && b.st.meId !== meId) || bots[1];
    await other.act('vote', { approve: true });
    await sleep(400);
    const again = await banner();
    assert(again.n === 1 && again.key === first.key, 'another player voting does not raise a second reminder');

    await asUser({ token: watcher.token, user: watcher.user });
    await sleep(600);
    const specView = await banner();
    assert(specView.n === 0, 'a spectator gets no vote reminder');
    const specBar = await evalj(`(document.querySelector('.specbar') || {}).textContent || ''`);
    assert(/觀戰/.test(specBar), 'spectator view is the one under test');

    await asUser(people[0]);
    const back = await waitBanner(b => b.n === 1 && b.text.includes('輪到你投票'), 'reminder on re-entry');
    assert(back.n === 1, 'reconnect shows the pending vote once');
    await evalj(`document.querySelector('[data-a="votego"]').click()`);
    await sleep(200);
    const focused = await evalj(`!!document.querySelector('[data-a="vote"]')`);
    assert(focused, 'tapping the reminder reaches the vote controls');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
    fs.writeFileSync('/opt/cursor/artifacts/vote-remind-375.png', Buffer.from(shot.data, 'base64'));

    await evalj(`document.querySelector('[data-a="vote"][data-v="1"]').click()`);
    await waitBanner(b => b.n === 0, 'banner clears after voting');
    for (const b of bots) {
      if (b.st.game && b.st.game.me && b.st.game.me.voted) continue;
      if (b.st.meId === meId) continue;
      await b.act('vote', { approve: true });
    }
    for (let i = 0; i < 40 && !(bots[0].st.game && bots[0].st.game.phase === 'quest'); i++) await sleep(80);
    assert(bots[0].st.game.phase === 'quest' && bots[0].st.game.team.includes(meId), 'approved team includes this player');
    const quest = await waitBanner(b => b.n === 1 && b.text.includes('請提交任務票'), 'quest reminder');
    await bots.find(b => b.st.meId !== meId && bots[0].st.game.team.includes(b.st.meId)).act('quest', { success: true });
    await sleep(350);
    const questStill = await banner();
    assert(questStill.n === 1 && questStill.key === quest.key, 'a teammate submitting does not repeat the quest reminder');
    await evalj(`document.querySelector('[data-a="quest"][data-v="1"]').click()`);
    await waitBanner(b => b.n === 0, 'quest reminder clears when this player submits');
    console.log('VOTE REMIND TESTS PASSED');
  } finally {
    try { ws.close(); } catch {}
    stop();
    bots.forEach(b => { try { b.s.close(); } catch {} });
    try { spec.s.close(); } catch {}
  }
})().catch(e => { console.error(e); process.exit(1); });
