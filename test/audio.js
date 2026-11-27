// Game music and button sounds: modest levels, persisted mute, gesture unlock,
// distinct cues, in-game BGM, and a mixer that does not touch room voice.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 37200 + (process.pid % 800);
const CDP_PORT = 47200 + (process.pid % 800);
const ROOT = path.join(__dirname, '..');
const DATA = '/tmp/av-audio-' + process.pid;
const OUT = '/opt/cursor/artifacts';
const APP = 'http://127.0.0.1:' + PORT + '/';
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kids = [];
const track = (p) => { kids.push(p); return p; };
function killAll() { for (const p of kids) { if (!p || !p.pid) continue; try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { try { p.kill('SIGKILL'); } catch (e2) {} } } }
process.on('exit', killAll);

const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const voiceSrc = fs.readFileSync(path.join(ROOT, 'public/voice.js'), 'utf8');
assert(html.includes('style.css?v=85') && html.includes('app.js?v=86'), 'style stays 85 and app cache is 86');
assert(!html.includes('style.css?v=84') && !html.includes('app.js?v=85') && !html.includes('app.js?v=84') && !html.includes('style.css?v=83') && !html.includes('app.js?v=83'), 'previous audio cache 85, 84 and 83 are not reused');
assert(html.includes('voice.js?v=5') && !html.includes('voice.js?v=6'), 'voice.js cache stays 5');
for (let v = 68; v <= 84; v++) assert(!html.includes('style.css?v=' + v), 'style cache ' + v + ' is not reused');
for (let v = 76; v <= 85; v++) assert(!html.includes('app.js?v=' + v), 'app cache ' + v + ' is not reused');
const audioAt = appSrc.indexOf('Original music and UI sounds');
const audioSrc = appSrc.slice(audioAt, appSrc.indexOf('window.AvalonAudio =', audioAt));
assert(audioSrc.includes('Original music') && audioSrc.includes('No samples'), 'license note is in the mixer');
assert(!/getUserMedia|RTCPeerConnection|AvalonVoice|voice:mic|voice:signal/.test(audioSrc), 'mixer does not touch the voice graph');
assert(audioSrc.includes('AUDIO_DEFAULT_VOL = 0.4') && audioSrc.includes('AUDIO_BGM_BASE = 0.2') && audioSrc.includes('AUDIO_SFX_BASE = 0.62'), 'modest gain constants');
assert(voiceSrc.includes('getUserMedia') && voiceSrc.includes('RTCPeerConnection'), 'voice chat file is still the WebRTC mixer');
assert(!html.includes('id="audioCtl"') && !html.includes('audio-ctl') && !html.includes('audioMute'), 'header has no volume control');
assert(appSrc.includes('audioMenuHtml()') && appSrc.includes('id="audioCtl"') && appSrc.includes('aria-label="遊戲音量"') && appSrc.includes('唔會關房間咪'), 'mute and volume live in the room menu');

function get(url) { return new Promise((resolve, reject) => { http.get(url, (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve(d)); }).on('error', reject); }); }
class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.ws.addEventListener('message', (ev) => { const msg = JSON.parse(ev.data); if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); }
  ready() { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('cdp')), 5000); this.ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true }); }); }
  send(method, params = {}, timeout = 20000) { const id = ++this.id; return new Promise((resolve, reject) => { const t = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, timeout); this.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800)); return r.result && r.result.value; }
  async shot(name) { const { data } = await this.send('Page.captureScreenshot', { format: 'png' }); const p = path.join(OUT, name + '.png'); fs.writeFileSync(p, Buffer.from(data, 'base64')); return p; }
}
async function mk(name) {
  const pid = 'au' + name + Math.random().toString(36).slice(2, 7);
  const s = io(APP, { transports: ['websocket'], forceNew: true });
  const c = { name, s, st: null };
  s.on('state', (st) => { c.st = st; });
  c.emit = (ev, d) => new Promise((r) => s.emit(ev, d, r));
  c.act = (t, d) => c.emit('act', { type: t, data: d });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('connect ' + name)), 8000); s.on('connect', () => { clearTimeout(t); res(); }); });
  const hello = await c.emit('hello', { pid, name, avatar: 'panda', bg: '#ffffff', fx: 'none', pendant: 'none' });
  if (!hello || hello.error) throw new Error('hello ' + name + ' ' + JSON.stringify(hello));
  return c;
}

(async () => {
  const srv = track(spawn(process.execPath, ['server.js'], { cwd: ROOT, detached: true, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }));
  let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  const boot = Date.now(); while (!/on :/.test(log)) { if (Date.now() - boot > 8000) throw new Error('server ' + log.slice(-400)); await sleep(40); }
  const dir = '/tmp/chrome-audio-' + process.pid;
  fs.mkdirSync(dir, { recursive: true });
  track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=document-user-activation-required', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
  let tab; for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP_PORT + '/json/list')).find((t) => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
  const cdp = new CDP(tab.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  const SAFE = { 375: { top: 50, bottom: 34, h: 812 }, 390: { top: 47, bottom: 34, h: 844 } };
  async function setPhone(w) {
    const safe = SAFE[w];
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: safe.h, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safe.top, left: 0, bottom: safe.bottom, right: 0 } }).catch(() => {});
    await cdp.eval(`(() => {
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:-999px;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
      document.body.appendChild(el);
      const t = parseFloat(getComputedStyle(el).paddingTop) || 0;
      const b = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      el.remove();
      let s = document.getElementById('safe-test');
      if (t >= ${safe.top} - 0.5 && b >= ${safe.bottom} - 0.5) { if (s) s.textContent = ''; return 'env'; }
      if (!s) { s = document.createElement('style'); s.id = 'safe-test'; document.head.appendChild(s); }
      s.textContent = '.topbar{padding-top:${safe.top}px !important}body{padding-bottom:${safe.bottom}px !important}';
      return 'inject';
    })()`);
    await cdp.eval('window.scrollTo(0,0)');
    await sleep(60);
  }
  async function waitFor(expr, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = await cdp.eval(expr);
      if (v) return v;
      await sleep(40);
    }
    const extra = await cdp.eval(`({ title: (document.querySelector('#topTitle')||{}).textContent || '', modal: document.querySelector('#modal') && !document.querySelector('#modal').classList.contains('hidden'), audio: window.AvalonAudio && AvalonAudio.debug(), app: ((document.querySelector('#app')||{}).innerText||'').slice(0,240) })`);
    throw new Error('timeout ' + expr + ' ' + JSON.stringify(extra).slice(0, 700));
  }
  async function clickSel(sel) {
    const pt = await cdp.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(innerHeight - 2, Math.max(2, r.top + r.height / 2)), w: r.width, h: r.height, off: e.disabled === true }; })()`);
    if (!pt || pt.w < 1) throw new Error('missing ' + sel + ' ' + JSON.stringify(pt));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(40);
    return pt;
  }
  async function headerClean(tag) {
    const box = await cdp.eval(`(() => {
      const bar = document.querySelector('.topbar');
      const doc = document.documentElement;
      const invite = bar.querySelector('[data-a="invite"]');
      const more = bar.querySelector('[data-a="menu"]');
      const conn = bar.querySelector('#conn');
      const code = document.querySelector('.top-code');
      const cr = code ? code.getBoundingClientRect() : null;
      return {
        audio: !!bar.querySelector('#audioCtl, .audio-ctl, .audio-mute, input[type=range]'),
        text: /音量|audio-ctl|audioMute/.test(bar.innerHTML),
        invite: invite && invite.textContent,
        more: more && more.getAttribute('aria-label'),
        conn: !!conn,
        sw: doc.scrollWidth, cw: doc.clientWidth,
        code: cr && { w: cr.width, r: cr.right, iw: innerWidth },
      };
    })()`);
    assert(!box.audio && !box.text, tag + ' header has no speaker or volume control ' + JSON.stringify(box));
    assert(box.invite === '邀請' && box.more === '更多' && box.conn, tag + ' keeps 邀請, ⋯, and the connection dot ' + JSON.stringify(box));
    assert(box.sw <= box.cw + 1, tag + ' header has no horizontal overflow');
    assert(box.code && box.code.w >= 24 && box.code.r <= box.code.iw + 1, tag + ' room code stays visible ' + JSON.stringify(box.code));
  }
  async function menuFit(tag, safeTop) {
    const box = await cdp.eval(`(() => {
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const hit = (a, b) => !!(a && b && a.w > 1 && b.w > 1 && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5);
      const audio = box(document.querySelector('.room-menu #audioCtl'));
      const faces = [...document.querySelectorAll('.rt .st .av, .rt .st .av-wrap')].map(box);
      const nums = [...document.querySelectorAll('.rt > .no')].map(box);
      const actions = [...document.querySelectorAll('[data-a="start"], [data-a="ready"], [data-a="propose"], [data-a="vote"], .myrole-fab, .bottombar .btn')].map((el) => ({ a: el.getAttribute('data-a') || 'fab', ...box(el) }));
      const code = box(document.querySelector('.top-code'));
      const doc = document.documentElement;
      const slider = document.querySelector('.room-menu #audioVol');
      const mute = document.querySelector('.room-menu #audioMute');
      return {
        audio, inMenu: !!document.querySelector('.room-menu #audioCtl'),
        headerAudio: !!document.querySelector('.topbar #audioCtl, .topbar .audio-ctl'),
        label: mute && mute.getAttribute('aria-label'),
        slider: slider && !slider.disabled,
        copy: (document.querySelector('.room-menu .audio-copy') || {}).innerText || '',
        sw: doc.scrollWidth, cw: doc.clientWidth, iw: innerWidth, ih: innerHeight,
        faceHits: faces.filter((f) => hit(audio, f)).length,
        numHits: nums.filter((f) => hit(audio, f)).length,
        numYs: nums.map((n) => Math.round(n.t)),
        faceYs: faces.map((f) => Math.round(f.t)),
        actHits: actions.filter((f) => hit(audio, f)).map((f) => f.a),
        codeHit: hit(audio, code),
      };
    })()`);
    assert(box.inMenu && !box.headerAudio, tag + ' volume control is only inside the menu');
    assert(box.audio && box.audio.w >= 200 && box.audio.h >= 48 && box.audio.b <= box.ih + 1 && box.audio.r <= box.iw + 1, tag + ' volume row is on screen ' + JSON.stringify(box.audio));
    assert(box.audio.t >= safeTop - 1, tag + ' volume row is under the safe area (' + box.audio.t + ' vs ' + safeTop + ')');
    assert(box.slider && box.label && box.label.includes('遊戲'), tag + ' mute and slider are visible');
    assert(box.copy.includes('遊戲音量') && box.copy.includes('咪'), tag + ' menu explains music vs room mic');
    assert(box.sw <= box.cw + 1, tag + ' menu has no horizontal overflow');
    assert(box.faceHits === 0 && box.numHits === 0, tag + ' volume row does not cover faces or seat numbers ' + JSON.stringify(box));
    assert(box.actHits.length === 0, tag + ' volume row does not cover primary actions ' + JSON.stringify(box.actHits));
    assert(!box.codeHit, tag + ' volume row does not cover the room code');
  }

  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await setPhone(390);
  await cdp.send('Page.navigate', { url: APP });
  await waitFor(`document.querySelector('#app')`);
  await cdp.eval(`localStorage.setItem('cc.profile', JSON.stringify({ name:'主持人', avatar:'fox', bg:'#ffffff', fx:'none', pendant:'none' })); localStorage.removeItem('cc.audio'); localStorage.removeItem('cc.token');`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(`window.AvalonAudio && document.querySelector('[data-a="create"]') && document.querySelector('#conn').classList.contains('on') && !document.querySelector('#audioCtl')`);
  const fresh = await cdp.eval(`({ d: AvalonAudio.debug(), nag: !!document.querySelector('.audio-nag, #audioNag, [data-audio-nag]'), text: document.body.innerText })`);
  assert(fresh.d.contextState === 'idle' && fresh.d.started === false && fresh.d.bgmPlaying === false, 'autoplay is blocked until a gesture ' + JSON.stringify(fresh.d));
  assert(fresh.d.defaultVol === 0.4 && fresh.d.vol === 0.4 && fresh.d.muted === false, 'default volume is the modest 40%');
  assert(fresh.d.bgmBase * fresh.d.defaultVol * fresh.d.bufPeak <= 0.08, 'default BGM level stays under 0.08 (' + (fresh.d.bgmBase * fresh.d.defaultVol * fresh.d.bufPeak) + ')');
  assert(fresh.d.sfxBase * fresh.d.defaultVol * fresh.d.sfxPeak <= 0.12, 'default SFX level stays under 0.12 (' + (fresh.d.sfxBase * fresh.d.defaultVol * fresh.d.sfxPeak) + ')');
  assert(fresh.d.ceiling < 0.5, 'full-scale BGM+SFX sum stays under 0.5 (' + fresh.d.ceiling + ')');
  assert(fresh.d.routesVoice === false && fresh.d.license === 'original-synthesis', 'mixer reports an independent original graph');
  assert(!fresh.nag && !/點擊開啟音樂|請開聲音|開啟背景音樂|點擊畫面開聲/.test(fresh.text), 'no autoplay nag');
  const map = await cdp.eval(`(() => { const b = (a, extra) => { const n = document.createElement('button'); n.dataset.a = a; if (extra) Object.assign(n.dataset, extra); return AvalonAudio.cueFor(n); }; return { start: b('start'), menu: b('menu'), back: AvalonAudio.cueFor(document.getElementById('backBtn')), yes: b('vote', { v: '1' }), no: b('vote', { v: '0' }), ok: b('quest', { v: '1' }), bad: b('quest', { v: '0' }), skip: b('swordskip'), cfg: b('cfg') }; })()`);
  assert(map.start === 'confirm' && map.menu === 'open' && map.back === 'cancel' && map.yes === 'voteYes' && map.no === 'voteNo' && map.ok === 'questOk' && map.bad === 'questBad' && map.skip === 'cancel' && map.cfg === 'open', 'cue map ' + JSON.stringify(map));

  await clickSel('[data-a="create"]');
  await waitFor(`document.querySelector('.top-code') && AvalonAudio.debug().contextState === 'running' && AvalonAudio.debug().bgmPlaying && AvalonAudio.debug().scene === 'lobby' && AvalonAudio.debug().played.includes('open')`);
  const lobbyAudio = await cdp.eval(`AvalonAudio.debug()`);
  assert(lobbyAudio.engine === 'buffer' && !lobbyAudio.error, 'BGM is a rendered loop ' + JSON.stringify({ engine: lobbyAudio.engine, error: lobbyAudio.error }));
  assert(lobbyAudio.loopDelta.lobby < 0.06 && lobbyAudio.loopDelta.game < 0.06, 'loops meet at the boundary ' + JSON.stringify(lobbyAudio.loopDelta));
  assert(lobbyAudio.bufferPeak.lobby <= 0.73 && lobbyAudio.bufferPeak.game <= 0.73, 'rendered peaks stay under the cap ' + JSON.stringify(lobbyAudio.bufferPeak));
  assert(lobbyAudio.targetGain === 0.4 && lobbyAudio.masterNow <= 0.45, 'master sits at the modest default ' + lobbyAudio.masterNow);
  const code = await cdp.eval(`document.querySelector('.top-code').textContent`);
  assert(code && code.length === 4, 'room ' + code);

  await clickSel('[data-a="cfg"]');
  await waitFor(`document.querySelector('[data-a="cap"][data-n="5"]')`);
  const opened = await cdp.eval(`AvalonAudio.debug().played.slice(-3)`);
  assert(opened.includes('open'), 'settings open plays the open cue ' + JSON.stringify(opened));
  await clickSel('[data-a="cap"][data-n="5"]');
  await clickSel('[data-a="cfgclose"]');
  await waitFor(`!document.querySelector('[data-a="cfgclose"]') && AvalonAudio.debug().played.includes('confirm')`);

  const names = ['阿米', '小晴', '家明', '詠詩'];
  const bots = [];
  for (let i = 0; i < names.length; i++) {
    const b = await mk(names[i]);
    const joined = await b.emit('join', { code });
    assert(joined && joined.room === code, names[i] + ' joined');
    const sat = await b.act('sit', { seat: i + 2 });
    assert(sat && sat.ok, names[i] + ' sat ' + JSON.stringify(sat));
    bots.push(b);
  }
  await waitFor(`document.querySelector('[data-a="start"]') && !document.querySelector('[data-a="start"]').disabled`);
  await cdp.eval('window.scrollTo(0,0)');
  for (const w of [375, 390]) {
    await setPhone(w);
    await headerClean('lobby header ' + w);
    await cdp.shot('audio-lobby-header-' + w);
    await clickSel('[data-a="menu"]');
    await waitFor(`document.querySelector('.room-menu #audioCtl')`);
    await menuFit('lobby menu ' + w, SAFE[w].top);
    await cdp.shot('audio-lobby-menu-' + w);
    await clickSel('#room-menu-close');
    await waitFor(`document.querySelector('#modal').classList.contains('hidden') && !document.querySelector('#audioCtl')`);
  }

  await setPhone(390);
  const voiceBefore = await cdp.eval(`window.AvalonVoice.debug()`);
  assert(voiceBefore.micOn === false && voiceBefore.gumCalls === 0, 'voice starts idle');
  await clickSel('[data-a="cfg"]');
  await waitFor(`document.querySelector('[data-a="tg"][data-k="mic"]')`);
  await clickSel('[data-a="tg"][data-k="mic"]');
  await clickSel('[data-a="cfgclose"]');
  await waitFor(`document.querySelector('button.seat-mic')`);
  await clickSel('button.seat-mic');
  const live = await waitFor(`(() => { const d = AvalonVoice.debug(); return d.micOn && d.localState === 'live' ? d : null; })()`);
  assert(live.gumCalls === 1 && live.videoTracks === 0, 'voice capture is its own graph ' + JSON.stringify(live));
  const audBefore = await cdp.eval(`([...document.querySelectorAll('audio')]).map(a => ({ muted: a.muted, vol: a.volume, voice: a.dataset.voiceFrom || '' }))`);
  await clickSel('[data-a="menu"]');
  await waitFor(`document.querySelector('.room-menu #audioMute')`);
  await clickSel('#audioMute');
  await sleep(80);
  const mutedVoice = await cdp.eval(`({ v: AvalonVoice.debug(), a: ([...document.querySelectorAll('audio')]).map(x => ({ muted: x.muted, vol: x.volume, voice: x.dataset.voiceFrom || '' })), g: AvalonAudio.debug() })`);
  assert(mutedVoice.g.muted === true && mutedVoice.g.targetGain === 0, 'game mute silences the game mixer');
  assert(mutedVoice.v.micOn === true && mutedVoice.v.localState === 'live' && mutedVoice.v.gumCalls === live.gumCalls, 'game mute does not touch the mic ' + JSON.stringify(mutedVoice.v));
  assert(JSON.stringify(mutedVoice.a) === JSON.stringify(audBefore), 'game mute does not mute voice elements ' + JSON.stringify(mutedVoice.a));
  await clickSel('#audioMute');
  await sleep(80);
  const restored = await cdp.eval(`({ v: AvalonVoice.debug(), g: AvalonAudio.debug() })`);
  assert(restored.g.muted === false && restored.v.micOn === true && restored.v.gumCalls === live.gumCalls, 'unmuting game audio leaves the mic publishing');
  await clickSel('#room-menu-close');
  await waitFor(`document.querySelector('#modal').classList.contains('hidden')`);
  await clickSel('[data-a="cfg"]');
  await waitFor(`document.querySelector('[data-a="tg"][data-k="mic"]')`);
  await clickSel('[data-a="tg"][data-k="mic"]');
  await clickSel('[data-a="cfgclose"]');
  const quiet = await waitFor(`(() => { const d = AvalonVoice.debug(); return d.mode === false && d.micOn === false && document.querySelectorAll('.seat-mic').length === 0 ? d : null; })()`);
  assert(quiet.gumCalls === live.gumCalls, 'turning voice mode off does not recapture');

  await clickSel('[data-a="menu"]');
  await waitFor(`document.querySelector('#room-menu-close')`);
  await clickSel('#room-menu-close');
  const menuCues = await cdp.eval(`AvalonAudio.debug().played.slice(-4)`);
  assert(menuCues.includes('open') && menuCues.includes('cancel'), 'menu open and close have distinct cues ' + JSON.stringify(menuCues));

  await cdp.eval('window.scrollTo(0,0)');
  await clickSel('[data-a="start"]');
  await waitFor(`document.querySelector('#flip') && AvalonAudio.debug().scene === 'game' && AvalonAudio.debug().bgmPlaying && AvalonAudio.debug().played.includes('confirm')`);
  await clickSel('#flip');
  await waitFor(`document.querySelector('#flip').classList.contains('on') && AvalonAudio.debug().played.includes('card')`);
  const card = await cdp.eval(`AvalonAudio.debug().played.filter(x => x === 'card').length`);
  assert(card === 1, 'opening the role card plays one sting (' + card + ')');
  await clickSel('#ok');
  await waitFor(`document.querySelector('#modal').classList.contains('hidden') && document.querySelector('.rt')`);
  await cdp.eval('window.scrollTo(0,0)');
  for (const w of [375, 390]) {
    await setPhone(w);
    await headerClean('game header ' + w);
    await cdp.shot('audio-game-header-' + w);
    await clickSel('[data-a="menu"]');
    await waitFor(`document.querySelector('.room-menu #audioCtl')`);
    await menuFit('game menu ' + w, SAFE[w].top);
    await cdp.shot('audio-game-menu-' + w);
    await clickSel('#room-menu-close');
    await waitFor(`document.querySelector('#modal').classList.contains('hidden')`);
  }
  const gameAudio = await cdp.eval(`AvalonAudio.debug()`);
  assert(gameAudio.scene === 'game' && gameAudio.activeScene === 'game' && gameAudio.bgmPlaying, 'in-game BGM is the table loop ' + JSON.stringify({ scene: gameAudio.scene, active: gameAudio.activeScene, on: gameAudio.bgmPlaying }));

  await setPhone(390);
  const snap = await cdp.eval(`(() => { const s = window.__av.S; const g = s.game; return { me: s.meId, leader: g.leaderId, phase: g.phase, need: g.teamSizes[g.round], seats: g.seats.map(x => x.id) }; })()`);
  assert(snap.phase === 'team' && snap.need === 2, 'team phase ' + JSON.stringify(snap));
  const team = [snap.me, snap.seats.find((id) => id !== snap.me)];
  if (snap.me === snap.leader) {
    for (const id of team) await clickSel('.st[data-id="' + id + '"]');
    await waitFor(`document.querySelector('[data-a="propose"]') && !document.querySelector('[data-a="propose"]').disabled`);
    await clickSel('[data-a="propose"]');
  } else {
    const leader = bots.find((b) => b.st && b.st.meId === snap.leader);
    if (!leader) throw new Error('no leader bot ' + snap.leader);
    const proposed = await leader.act('propose', { team });
    assert(proposed && proposed.ok, 'bot propose ' + JSON.stringify(proposed));
  }
  await waitFor(`document.querySelector('[data-a="vote"][data-v="1"]') && document.querySelector('[data-a="vote"][data-v="0"]')`);
  await cdp.eval(`window.__blockAct = true; if (!window.__blockBound) { window.__blockBound = true; document.addEventListener('click', (e) => { if (!window.__blockAct) return; const a = e.target.closest('[data-a]'); if (a && (a.dataset.a === 'vote' || a.dataset.a === 'quest')) { e.stopPropagation(); e.preventDefault(); } }, true); }`);
  await clickSel('[data-a="vote"][data-v="1"]');
  await clickSel('[data-a="vote"][data-v="0"]');
  const votes = await cdp.eval(`AvalonAudio.debug().played.slice(-4)`);
  assert(votes.includes('voteYes') && votes.includes('voteNo'), 'approve and reject play different cues ' + JSON.stringify(votes));
  await cdp.eval('window.__blockAct = false');
  for (const b of bots) {
    const voted = await b.act('vote', { approve: true });
    assert(voted && voted.ok, b.name + ' vote ' + JSON.stringify(voted));
  }
  await clickSel('[data-a="vote"][data-v="1"]');
  await waitFor(`document.querySelector('#modal:not(.hidden) #ok, [data-a="quest"]')`);
  if (await cdp.eval(`!!document.querySelector('#modal:not(.hidden) #ok')`)) {
    await clickSel('#modal #ok');
    await waitFor(`document.querySelector('#modal').classList.contains('hidden')`);
  }
  await waitFor(`document.querySelector('[data-a="quest"][data-v="1"]')`);
  const failDisabled = await cdp.eval(`!!(document.querySelector('[data-a="quest"][data-v="0"]') || {}).disabled`);
  await cdp.eval('window.__blockAct = true');
  await clickSel('[data-a="quest"][data-v="1"]');
  if (!failDisabled) await clickSel('[data-a="quest"][data-v="0"]');
  const quests = await cdp.eval(`AvalonAudio.debug().played.slice(-4)`);
  assert(quests.includes('questOk'), 'success card plays its cue ' + JSON.stringify(quests));
  if (!failDisabled) assert(quests.includes('questBad'), 'fail card plays its cue ' + JSON.stringify(quests));
  else assert(map.bad === 'questBad', 'fail card cue is mapped when that button is disabled for this role');
  await cdp.eval('window.__blockAct = false');

  await clickSel('#backBtn');
  const back = await cdp.eval(`AvalonAudio.debug().played.slice(-2)`);
  assert(back.includes('cancel'), 'back plays the cancel cue ' + JSON.stringify(back));
  if (await cdp.eval(`!!document.querySelector('[data-a="toroom"]')`)) {
    await clickSel('[data-a="toroom"]');
    await waitFor(`document.querySelector('[data-a="menu"]')`);
  }
  await clickSel('[data-a="menu"]');
  await waitFor(`document.querySelector('.room-menu #audioMute')`);
  await clickSel('#audioMute');
  const storedMute = await cdp.eval(`JSON.parse(localStorage.getItem('cc.audio'))`);
  assert(storedMute.m === 1 && storedMute.v === 0.4, 'mute is stored on the device ' + JSON.stringify(storedMute));
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(`window.AvalonAudio && document.querySelector('[data-a="menu"], [data-a="create"]') && document.querySelector('#conn').classList.contains('on') && !document.querySelector('#audioCtl')`);
  const held = await cdp.eval(`AvalonAudio.debug()`);
  assert(held.muted === true && held.vol === 0.4 && held.contextState === 'idle', 'reloaded page keeps mute and still waits for a gesture ' + JSON.stringify(held));
  await clickSel('#topTitle');
  await sleep(200);
  const heldAfter = await cdp.eval(`AvalonAudio.debug()`);
  assert(heldAfter.contextState === 'running' && heldAfter.targetGain === 0 && heldAfter.bgmPlaying === false, 'a gesture does not unmute a stored mute ' + JSON.stringify(heldAfter));
  await cdp.eval(`(() => { const m = document.getElementById('modal'); if (m && !m.classList.contains('hidden')) { const b = m.querySelector('#room-menu-close, #ok, #cc'); if (b) b.click(); } })()`);
  await sleep(80);
  if (!await cdp.eval(`!!document.querySelector('.room-menu #audioMute')`)) {
    await clickSel('[data-a="menu"]');
    await waitFor(`document.querySelector('.room-menu #audioMute')`);
  }
  const hit = await cdp.eval(`(() => { const b = document.getElementById('audioMute'); const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const el = document.elementFromPoint(x, y); return { x, y, w: r.width, h: r.height, owns: !!(el && (el === b || b.contains(el))), hit: el && (el.id || el.className || el.tagName), modal: !document.getElementById('modal').classList.contains('hidden') }; })()`);
  assert(hit.owns, 'mute button is what a tap hits ' + JSON.stringify(hit));
  await clickSel('#audioMute');
  await sleep(250);
  const openAgain = await cdp.eval(`({ g: AvalonAudio.debug(), s: JSON.parse(localStorage.getItem('cc.audio')) })`);
  assert(openAgain.g.muted === false && openAgain.s.m === 0 && openAgain.g.bgmPlaying, 'unmuting is persisted and music returns ' + JSON.stringify(openAgain));

  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.eval(`localStorage.removeItem('cc.audio')`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(`window.AvalonAudio && AvalonAudio.debug().reduced === true && document.querySelector('[data-a="about"], [data-a="menu"], [data-a="create"]')`);
  const reduced = await cdp.eval(`AvalonAudio.debug()`);
  assert(reduced.reduced === true && reduced.bgmOptIn == null && reduced.bgmPlaying === false, 'reduced motion holds BGM ' + JSON.stringify(reduced));
  const cueSel = await cdp.eval(`document.querySelector('[data-a="about"]') ? '[data-a="about"]' : (document.querySelector('[data-a="menu"]') ? '[data-a="menu"]' : '[data-a="create"]')`);
  await clickSel(cueSel);
  await sleep(180);
  const reducedClick = await cdp.eval(`AvalonAudio.debug()`);
  assert(reducedClick.played.length > 0 && reducedClick.bgmPlaying === false && reducedClick.contextState === 'running', 'reduced motion still plays a short cue and does not start BGM ' + JSON.stringify({ played: reducedClick.played, on: reducedClick.bgmPlaying, state: reducedClick.contextState }));
  if (!await cdp.eval(`!!document.querySelector('.room-menu #audioVol')`)) {
    await clickSel('[data-a="menu"]');
    await waitFor(`document.querySelector('.room-menu #audioVol')`);
  }
  await cdp.eval(`{ const s = document.getElementById('audioVol'); s.value = '48'; s.dispatchEvent(new Event('input', { bubbles: true })); }`);
  await waitFor(`AvalonAudio.debug().bgmPlaying && AvalonAudio.debug().bgmOptIn === true`);
  const opted = await cdp.eval(`JSON.parse(localStorage.getItem('cc.audio'))`);
  assert(opted.b === 1 && opted.m === 0, 'choosing a volume opts into BGM and is stored ' + JSON.stringify(opted));
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(`window.AvalonAudio && AvalonAudio.debug().reduced === true`);
  await clickSel('#topTitle');
  await waitFor(`AvalonAudio.debug().bgmPlaying && AvalonAudio.debug().contextState === 'running'`);
  assert(true, 'stored opt-in still plays BGM under reduced motion after a gesture');

  for (const w of [375, 390]) {
    for (const name of ['audio-lobby-header-', 'audio-lobby-menu-', 'audio-game-header-', 'audio-game-menu-']) {
      assert(fs.existsSync(path.join(OUT, name + w + '.png')), 'still ' + name + w);
    }
  }
  console.log('AUDIO TESTS PASSED');
  killAll();
  process.exit(0);
})().catch((err) => { console.error(err); killAll(); process.exit(1); });
