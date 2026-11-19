'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { io } = require('socket.io-client');
const PORT = 40100 + (process.pid % 700);
const CDP_PORT = 51100 + (process.pid % 700);
const ROOT = path.join(__dirname, '..');
const DATA = '/tmp/av-voice-' + process.pid;
fs.mkdirSync(DATA, { recursive: true });
const URL = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const kids = [];
const track = (p) => { kids.push(p); return p; };
function killAll() { for (const p of kids) { if (!p || !p.pid) continue; try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { try { p.kill('SIGKILL'); } catch (e2) {} } } }
process.on('exit', killAll);
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const pubId = (pid) => crypto.createHash('sha256').update(String(pid)).digest('hex').slice(0, 10);
function get(url) { return new Promise((resolve, reject) => { const req = http.get(url, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }); req.on('error', reject); req.setTimeout(2500, () => { req.destroy(); reject(new Error('timeout')); }); }); }
function put(raw) { return new Promise((resolve, reject) => { const m = String(raw).match(/^http:\/\/([^:/]+):(\d+)(\/.*)$/); if (!m) return reject(new Error('bad url')); const req = http.request({ hostname: m[1], port: m[2], path: m[3], method: 'PUT' }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }); req.on('error', reject); req.end(); }); }
async function untilState(c, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (c.st && c.st.meId) return; await sleep(20); } throw new Error('no state'); }
async function mk(name) {
  const pid = 'vo' + name + Math.random().toString(36).slice(2, 8);
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { pid, s, id: pubId(pid), st: null, voice: [], gone: [] };
  s.on('state', st => { c.st = st; }); s.on('voice:state', m => c.voice.push(m)); s.on('voice:gone', m => c.gone.push(m));
  c.emit = (ev, d) => new Promise(r => s.emit(ev, d, r));
  c.act = (t, d) => c.emit('act', { type: t, data: d });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('connect')), 8000); s.on('connect', () => { clearTimeout(t); res(); }); });
  await c.emit('hello', { pid, name, avatar: 'fox' });
  return c;
}
class Dev {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.ws.addEventListener('message', ev => { const msg = JSON.parse(ev.data); if (msg.id && this.pending.has(msg.id)) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } }); }
  ready() { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('cdp')), 5000); this.ws.addEventListener('open', () => { clearTimeout(t); res(); }, { once: true }); }); }
  send(method, params = {}, timeout = 20000) { const id = ++this.id; return new Promise((resolve, reject) => { const t = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, timeout); this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800)); return r.result && r.result.value; }
}
(async () => {
  const srv = track(spawn(process.execPath, ['server.js'], { cwd: ROOT, detached: true, env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0', KEEPALIVE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }));
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  const boot = Date.now(); while (!/on :/.test(log)) { if (Date.now() - boot > 8000) throw new Error('server'); await sleep(40); }
  const host = await mk('主'), spec = await mk('觀'), outsider = await mk('外');
  const room = (await host.emit('create')).room;
  await spec.emit('join', { code: room });
  const other = (await outsider.emit('create')).room;
  await untilState(host); await untilState(spec); await untilState(outsider);
  host.id = host.st.meId; spec.id = spec.st.meId; outsider.id = outsider.st.meId;
  assert(other !== room, 'second room');
  assert((await host.emit('voice:mic', { on: true })).error, 'mode off rejects publish');
  assert((await host.emit('voice:signal', { to: spec.id, kind: 'offer', sdp: 'v=0\r\n' + 'x'.repeat(16) })).error, 'mode off rejects signaling');
  assert((await spec.act('settings', { mic: true })).error, 'nonhost cannot enable mic mode');
  assert((await host.act('settings', { mic: true })).ok, 'host enables');
  await sleep(60);
  assert(!spec.voice.some(v => v && v.on), 'enabling leaves everyone muted');
  assert((await spec.emit('voice:mic', { on: true })).error, 'spectator still cannot publish');
  const micHost = await host.emit('voice:mic', { on: true });
  assert(micHost.ok && micHost.turn === false && micHost.listeners.includes(spec.id) && !micHost.listeners.includes(outsider.id), 'publish stays inside the room and has no TURN secret');
  assert((await outsider.emit('voice:signal', { to: host.id, kind: 'ice', candidate: { candidate: 'candidate:1 1 UDP 1 1.1.1.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 } })).error, 'cross-room signal refused');
  assert((await host.act('settings', { mic: false })).ok, 'host disables');
  await sleep(40);
  assert((await host.emit('voice:mic', { on: true })).error, 're-disabled room rejects publish');
  spec.voice.length = 0;
  assert((await host.act('settings', { mic: true })).ok, 'host re-enables');
  await sleep(40);
  assert(!spec.voice.some(v => v && v.on), 're-enable does not unmute ' + JSON.stringify(spec.voice));

  const dir = '/tmp/chrome-voice-' + process.pid; fs.mkdirSync(dir, { recursive: true });
  track(spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + dir, 'about:blank'], { detached: true, stdio: 'ignore' }));
  let tab; for (let i = 0; i < 40 && !tab; i++) { try { tab = JSON.parse(await get('http://127.0.0.1:' + CDP_PORT + '/json/list')).find(t => t.type === 'page'); } catch (e) { await sleep(120); } }
  if (!tab) throw new Error('no chrome');
  const open = async (profile) => {
    const created = JSON.parse(await put('http://127.0.0.1:' + CDP_PORT + '/json/new?' + encodeURIComponent(URL + '/')));
    const dev = new Dev(created.webSocketDebuggerUrl); await dev.ready(); await dev.send('Runtime.enable'); await dev.send('Page.enable');
    await dev.send('Page.navigate', { url: URL + '/' });
    await dev.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('#app')) { clearInterval(t); r(1);} }, 30); })`);
    await dev.eval(`localStorage.setItem('cc.pid', ${JSON.stringify(profile.pid)}); localStorage.removeItem('cc.token'); localStorage.setItem('cc.profile', JSON.stringify(${JSON.stringify(profile)}))`);
    await dev.send('Page.navigate', { url: URL + '/' });
    await dev.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('[data-a="create"], [data-a="join"]') && document.querySelector('#conn').classList.contains('on')) { clearInterval(t); r(1);} }, 40); })`);
    return dev;
  };
  const idStamp = Math.random().toString(36).slice(2, 8);
  const A = await open({ pid: 'voiceA' + idStamp, name: '甲咪', avatar: 'fox', bg: '#fff', fx: 'none', pendant: 'none' });
  await A.eval(`sessionStorage.setItem('keep.pid', localStorage.getItem('cc.pid')||''); sessionStorage.setItem('keep.token', localStorage.getItem('cc.token')||''); sessionStorage.setItem('keep.profile', localStorage.getItem('cc.profile')||'')`);
  const B = await open({ pid: 'voiceB' + idStamp, name: '乙聽', avatar: 'panda', bg: '#fff', fx: 'none', pendant: 'none' });
  await A.eval(`document.querySelector('[data-a="create"]').click()`);
  const code = await A.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const c=document.querySelector('.top-code'); if (c && c.textContent.length===4) { clearInterval(t); r(c.textContent);} else if (Date.now()-t0>8000) { clearInterval(t); r(''); } }, 40); })`);
  assert(code && code.length === 4, 'room ' + code);
  const absent = await A.eval(`({ icons: document.querySelectorAll('.seat-mic').length, gum: window.AvalonVoice.debug().gumCalls, chip: document.body.innerText.includes('麥克風模式') && document.body.innerText.includes('未開啟') })`);
  assert(absent.icons === 0 && absent.gum === 0 && absent.chip, 'initial room has no mic nodes ' + JSON.stringify(absent));
  await A.eval(`document.querySelector('[data-a="cfg"]').click()`);
  await A.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('[data-a="tg"][data-k="mic"]')) { clearInterval(t); r(1);} }, 30); })`);
  await A.eval(`document.querySelector('[data-a="tg"][data-k="mic"]').click()`);
  const armed = await A.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const b=document.querySelector('button.seat-mic'); if (b && b.getAttribute('aria-pressed')==='false' && document.querySelectorAll('.seat-mic').length===1) { clearInterval(t); r(1);} else if (Date.now()-t0>5000) { clearInterval(t); r(0);} }, 40); })`);
  const quiet = await A.eval(`window.AvalonVoice.debug()`);
  assert(armed === 1 && quiet.gumCalls === 0 && quiet.micOn === false, 'mode on shows one muted own control and does not capture');
  await A.eval(`{ const b=document.querySelector('[data-a="cfgclose"]'); if (b) b.click(); }`);
  await B.eval(`document.querySelector('[data-a="join"]').click()`);
  await B.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('#cd')) { clearInterval(t); r(1);} }, 30); })`);
  await B.eval(`document.querySelector('#cd').value=${JSON.stringify(code)}; document.querySelector('#ok').click()`);
  await B.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const c=document.querySelector('.top-code'); if (c && c.textContent==='${code}' && document.querySelectorAll('button.seat-mic').length===0) { clearInterval(t); r(1);} else if (Date.now()-t0>8000) { clearInterval(t); r(0);} }, 40); })`);
  assert((await B.eval(`window.AvalonVoice.debug().gumCalls`)) === 0, 'spectator has no mic control and no capture');
  await B.eval(`document.querySelector('.rt .st.empty').click()`);
  await A.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { if (document.querySelectorAll('span.seat-mic.status').length===1 && document.querySelectorAll('button.seat-mic').length===1) { clearInterval(t); r(1);} else if (Date.now()-t0>5000) { clearInterval(t); r(0);} }, 40); })`);
  const kinds = await A.eval(`({ btn: document.querySelector('button.seat-mic').getAttribute('data-a'), status: document.querySelector('span.seat-mic.status').getAttribute('data-a'), pe: getComputedStyle(document.querySelector('span.seat-mic.status')).pointerEvents })`);
  assert(kinds.btn === 'mic' && !kinds.status && kinds.pe === 'none', 'others are status only ' + JSON.stringify(kinds));
  await A.eval(`document.querySelector('button.seat-mic').click()`);
  const live = await A.eval(`new Promise(async r => { const t0=Date.now(); while (Date.now()-t0<8000) { const d=window.AvalonVoice.debug(); if (d.micOn && d.localState==='live' && d.videoTracks===0) return r(d); await new Promise(x=>setTimeout(x,40)); } r(window.AvalonVoice.debug()); })`);
  assert(live.micOn && live.videoTracks === 0 && live.gumCalls === 1, 'own click captures audio only');
  await B.eval(`document.querySelector('[data-a="listen"]').click()`);
  const heard = await B.eval(`new Promise(async r => { const t0=Date.now(); while (Date.now()-t0<10000) { const n=await window.AvalonVoice.audioStats(); if (n.recv>0) return r(n.recv); await new Promise(x=>setTimeout(x,80)); } r(0); })`);
  assert(heard > 0, 'peer audio bytes ' + heard);
  const calls = await A.eval(`window.AvalonVoice.debug().gumCalls`);
  await A.eval(`document.querySelector('[data-a="cfg"]').click()`);
  await A.eval(`new Promise(r => { const t=setInterval(() => { if (document.querySelector('[data-a="tg"][data-k="mic"]')) { clearInterval(t); r(1);} }, 30); })`);
  await A.eval(`document.querySelector('[data-a="tg"][data-k="mic"]').click()`);
  const stopped = await A.eval(`new Promise(async r => { const t0=Date.now(); while (Date.now()-t0<5000) { const d=window.AvalonVoice.debug(); if (d.mode===false && !d.micOn && document.querySelectorAll('.seat-mic').length===0 && d.peers.length===0) return r(d); await new Promise(x=>setTimeout(x,40)); } r({ ...window.AvalonVoice.debug(), icons: document.querySelectorAll('.seat-mic').length }); })`);
  assert(stopped.micOn === false && stopped.peers.length === 0 && stopped.gumCalls === calls, 'mode off stops tracks and peers ' + JSON.stringify(stopped));
  assert((await A.eval(`document.querySelectorAll('.seat-mic').length`)) === 0, 'disabled room has no mic elements in the DOM');
  await A.eval(`document.querySelector('[data-a="tg"][data-k="mic"]').click()`);
  const back = await A.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const b=document.querySelector('button.seat-mic'); const d=window.AvalonVoice.debug(); if (d.mode===true && b && b.getAttribute('aria-pressed')==='false') { clearInterval(t); r(d); } else if (Date.now()-t0>5000) { clearInterval(t); r(d); } }, 40); })`);
  assert(back.mode === true && back.micOn === false && back.gumCalls === calls, 're-enable shows controls but does not recapture');
  const beforeOff = await A.eval(`(() => { const sw=document.querySelector('[data-a="tg"][data-k="mic"]'); return { cls: sw && sw.className, mode: window.AvalonVoice.debug().mode, icons: document.querySelectorAll('.seat-mic').length }; })()`);
  await A.eval(`document.querySelector('[data-a="tg"][data-k="mic"]').click()`);
  const hidden = await A.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const icons=document.querySelectorAll('.seat-mic').length; const d=window.AvalonVoice.debug(); if (icons===0 && d.mode===false) { clearInterval(t); r({icons, mode:d.mode}); } else if (Date.now()-t0>5000) { const sw=document.querySelector('[data-a="tg"][data-k="mic"]'); clearInterval(t); r({icons, mode:d.mode, cls: sw && sw.className}); } }, 30); })`);
  assert(hidden.icons === 0, 'turning mode off removes lobby mic icons immediately ' + JSON.stringify({ beforeOff, hidden }));
  const hiddenB = await B.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { if (document.querySelectorAll('.seat-mic').length===0) { clearInterval(t); r(1);} else if (Date.now()-t0>5000) { clearInterval(t); r(0);} }, 30); })`);
  assert(hiddenB === 1, 'the other player also loses every mic icon');
  await A.eval(`localStorage.setItem('cc.pid', sessionStorage.getItem('keep.pid')||''); const t=sessionStorage.getItem('keep.token'); if (t) localStorage.setItem('cc.token', t); else localStorage.removeItem('cc.token'); if (sessionStorage.getItem('keep.profile')) localStorage.setItem('cc.profile', sessionStorage.getItem('keep.profile'))`);
  await A.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__micSeen=0;new MutationObserver(()=>{window.__micSeen+=document.querySelectorAll(".seat-mic").length;}).observe(document.documentElement,{childList:true,subtree:true});' });
  await A.send('Page.reload', { ignoreCache: true });
  const re = await A.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const c=document.querySelector('.top-code'); if (c && c.textContent.length===4 && Date.now()-t0>500) { clearInterval(t); r({ code:c.textContent, icons:document.querySelectorAll('.seat-mic').length, seen:window.__micSeen||0, gum:window.AvalonVoice.debug().gumCalls }); } else if (Date.now()-t0>8000) { clearInterval(t); r({ timeout:1, icons:document.querySelectorAll('.seat-mic').length, seen:window.__micSeen||0, title:(document.querySelector('#topTitle')||{}).textContent||'', pid:localStorage.getItem('cc.pid'), app:(document.querySelector('#app').innerText||'').slice(0,160) }); } }, 20); })`);
  assert(re.code === code && re.icons === 0 && re.seen === 0 && re.gum === 0, 'reconnect with mic mode off never flashes a mic icon ' + JSON.stringify(re));
  const fillers = [];
  for (let i = 0; i < 6; i++) {
    const p = await mk('局' + i);
    const joined = await p.emit('join', { code });
    assert(joined && joined.room === code, 'filler joined');
    let sat = false;
    for (let n = 1; n <= 8 && !sat; n++) { const r = await p.act('sit', { seat: n }); sat = !!(r && r.ok); }
    assert(sat, 'filler sat');
    fillers.push(p);
  }
  await A.eval(`{ const b=document.querySelector('[data-a="cfgclose"]'); if (b) b.click(); }`);
  const began = await A.eval(`new Promise(r => { const t0=Date.now(); let clicked=0; const t=setInterval(() => { const b=document.querySelector('[data-a="start"]'); if (b && !b.disabled && !clicked) { clicked=1; b.click(); } if (document.querySelector('.track') && document.querySelectorAll('.seat-mic').length===0) { clearInterval(t); r({ok:1, icons:0}); } else if (Date.now()-t0>8000) { clearInterval(t); const s=document.querySelector('[data-a="start"]'); r({ok:0, clicked, start:!!s, disabled:!!(s&&s.disabled), label:s&&s.textContent, track:!!document.querySelector('.track'), icons:document.querySelectorAll('.seat-mic').length, title:(document.querySelector('#topTitle')||{}).textContent||'', app:(document.querySelector('#app').innerText||'').slice(0,180)}); } }, 40); })`);
  assert(began.ok === 1, 'game board with mic mode off has no avatar mic icons ' + JSON.stringify(began));
  await A.eval(`document.querySelector('.micmode [data-a="tg"][data-k="mic"]').click()`);
  const shown = await A.eval(`new Promise(r => { const t0=Date.now(); const t=setInterval(() => { const btn=document.querySelectorAll('button.seat-mic').length, st=document.querySelectorAll('span.seat-mic.status').length, empty=document.querySelectorAll('.st.empty .seat-mic').length; if (btn===1 && st===7 && empty===0) { clearInterval(t); r({btn,st,empty,pressed:document.querySelector('button.seat-mic').getAttribute('aria-pressed'),gum:window.AvalonVoice.debug().gumCalls}); } else if (Date.now()-t0>5000) { clearInterval(t); r({btn,st,empty}); } }, 40); })`);
  assert(shown.btn === 1 && shown.st === 7 && shown.empty === 0 && shown.pressed === 'false' && shown.gum === 0, 'game mode on shows own toggle and others status only ' + JSON.stringify(shown));
  fillers.forEach(p => { try { p.s.close(); } catch (e) {} });
  [host, spec, outsider].forEach(p => { try { p.s.close(); } catch (e) {} });
  try { A.ws.close(); B.ws.close(); } catch (e) {}
  killAll();
  console.log('VOICE TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('FAILED', e); killAll(); process.exit(1); });
