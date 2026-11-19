'use strict';
// In-room audio. Room mic mode and each player's mic both default off.
// Icons exist in the DOM only while the room mode is on. No recording, no camera.
(() => {
  const MIC_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const MIC_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 5l14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let socket = null;
  let hooks = { myId: () => '', seated: () => false, inRoom: () => false, mode: () => false };
  let micOn = false, starting = false, token = 0, gumCalls = 0, lastConstraints = null;
  let localStream = null, localTrack = null, listening = false, needsListen = false;
  let config = { iceServers: [], turn: false };
  let note = '', noteCls = '';
  const roster = Object.create(null);
  const talking = Object.create(null);
  const pcs = new Map();
  const audios = new Map();
  const meters = new Map();
  let audioCtx = null, meterTimer = null, floor = null, round = null, floorTimer = null, floorStopped = 0;

  const myId = () => { try { return hooks.myId() || ''; } catch (e) { return ''; } };
  const seated = () => { try { return !!hooks.seated(); } catch (e) { return false; } };
  const inRoom = () => { try { return !!hooks.inRoom(); } catch (e) { return false; } };
  const modeOn = () => { try { return hooks.mode() === true; } catch (e) { return false; } };

  function setNote(text, cls) { note = text || ''; noteCls = cls || ''; paint(); }
  function stripIcons() {
    document.querySelectorAll('.seat-mic, .seat-presence').forEach(el => el.remove());
    document.querySelectorAll('.rt .st.is-speak').forEach(el => el.classList.remove('is-speak'));
  }
  function presence(online) {
    if (!modeOn()) return '';
    const on = !!online;
    return `<span class="seat-presence ${on ? 'on' : 'off'}" role="img" aria-label="${on ? '在線' : '離線'}"></span>`;
  }
  function paintGlow() {
    const id = floor && modeOn() ? floor.speaker : '';
    document.querySelectorAll('.rt .st').forEach(el => {
      const sid = el.dataset.id || el.dataset.sid || '';
      el.classList.toggle('is-speak', !!id && sid === id);
    });
  }
  function tickFloor() {
    const el = document.querySelector('.floor-time');
    if (!floor || !modeOn()) return;
    const left = Math.max(0, floor.deadline - Date.now());
    const sec = Math.ceil(left / 1000);
    const text = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    if (el && el.textContent !== text) el.textContent = text;
    if (left <= 0 && floor.token !== floorStopped && floor.speaker === myId() && micOn) {
      floorStopped = floor.token;
      token++; micOn = false; starting = false;
      stopLocal(); dropSenders();
      if (socket) socket.emit('voice:mic', { on: false }, () => {});
    }
  }
  function ensureFloorClock() {
    if (!floorTimer) floorTimer = setInterval(tickFloor, 250);
    tickFloor();
  }
  function stopOwnedMic() {
    token++; micOn = false; starting = false;
    stopLocal(); dropSenders();
    if (socket) socket.emit('voice:mic', { on: false }, () => {});
  }
  function applyFloor(next) {
    const info = modeOn() && next ? next : null;
    const speaking = !!(info && info.status !== 'select' && info.speaker && !info.skipped);
    const on = speaking ? next : null;
    const prev = floor;
    round = info;
    floor = on;
    if (info && info.skipped) {
      if (micOn) stopOwnedMic();
      for (const id of [...pcs.keys()]) closePeer(id);
    }
    if (prev && prev.speaker && (!on || on.speaker !== prev.speaker)) {
      if (micOn && prev.speaker === myId()) stopOwnedMic();
      if (prev.speaker === myId()) { for (const id of [...pcs.keys()]) closePeer(id); }
      else closePeer(prev.speaker);
    }
    if (!on) { paintGlow(); return; }
    if (on.speaker !== myId() && micOn) {
      token++; micOn = false; starting = false;
      stopLocal(); dropSenders();
      if (socket) socket.emit('voice:mic', { on: false }, () => {});
    }
    for (const id of [...pcs.keys()]) if (id !== on.speaker) closePeer(id);
    paintGlow();
    ensureFloorClock();
  }
  function afterRender() {
    if (!modeOn()) { stripIcons(); return; }
    paintGlow();
    ensureFloorClock();
  }
  function liveFor(id) { return !!(id && (id === myId() ? micOn : roster[id])); }

  function glyph(id) {
    if (!modeOn() || !id) return '';
    const mine = id === myId();
    const live = liveFor(id);
    const talk = live && talking[id];
    const label = live ? (talk ? '講話中' : '麥克風開') : '麥克風關';
    const cls = `seat-mic ${mine ? 'mine' : 'status'} ${live ? 'on' : 'off'}${talk ? ' talk' : ''}`;
    const icon = live ? MIC_ON : MIC_OFF;
    if (mine) return `<button type="button" class="${cls}" data-a="mic" data-mic="${live ? 'on' : 'off'}" aria-pressed="${live ? 'true' : 'false'}" aria-label="${esc(live ? '關閉麥克風' : '開啟麥克風')}">${icon}</button>`;
    return `<span class="${cls}" data-mic="${live ? 'on' : 'off'}" role="img" aria-label="${esc(label)}">${icon}</span>`;
  }
  function barHtml() {
    const showListen = modeOn() && inRoom() && !listening;
    if (!showListen && !needsListen && !note) return '';
    return `<div class="voicebar">${(showListen || needsListen) ? '<button type="button" class="listen-btn" data-a="listen">開啟房間聲音</button>' : ''}<span class="voice-note${noteCls === 'bad' ? ' bad' : ''}" role="status">${esc(note)}</span></div>`;
  }
  function paint() {
    document.querySelectorAll('.voice-note').forEach(n => { n.textContent = note; n.classList.toggle('bad', noteCls === 'bad'); });
    if (!modeOn()) { stripIcons(); return; }
    document.querySelectorAll('.rt .seat-mic').forEach(el => {
      const id = (el.closest('.st') || {}).dataset && ((el.closest('.st').dataset.id) || el.closest('.st').dataset.sid);
      const live = liveFor(id);
      const talk = live && !!talking[id];
      const was = el.dataset.mic === 'on';
      el.classList.toggle('on', live);
      el.classList.toggle('off', !live);
      el.classList.toggle('talk', talk);
      el.dataset.mic = live ? 'on' : 'off';
      if (was !== live) el.innerHTML = live ? MIC_ON : MIC_OFF;
      if (el.tagName === 'BUTTON') {
        el.setAttribute('aria-pressed', live ? 'true' : 'false');
        el.setAttribute('aria-label', live ? '關閉麥克風' : '開啟麥克風');
      }
    });
  }
  function markTalk() {
    if (!modeOn()) return;
    document.querySelectorAll('.rt .seat-mic').forEach(el => {
      const st = el.closest('.st');
      const id = st && (st.dataset.id || st.dataset.sid);
      const talk = !!(id && liveFor(id) && talking[id]);
      if (el.classList.contains('talk') !== talk) el.classList.toggle('talk', talk);
    });
  }

  function stopMeter(id) {
    const m = meters.get(id);
    if (m && m.src) { try { m.src.disconnect(); } catch (e) {} }
    meters.delete(id); delete talking[id];
  }
  function ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    return audioCtx;
  }
  function watch(id, stream) {
    const ctx = ensureCtx();
    if (!ctx || !stream) return;
    stopMeter(id);
    try {
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256; src.connect(an); meters.set(id, { an, src });
    } catch (e) { return; }
    if (!meterTimer) meterTimer = setInterval(sample, 200);
  }
  function sample() {
    if (!meters.size || !modeOn()) { clearInterval(meterTimer); meterTimer = null; return; }
    let changed = false;
    for (const [id, m] of meters) {
      const buf = new Uint8Array(m.an.fftSize);
      m.an.getByteTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
      const rms = Math.sqrt(s / buf.length);
      const prev = !!talking[id];
      const next = prev ? rms > 0.02 : rms > 0.045;
      if (next !== prev) { talking[id] = next; changed = true; }
    }
    if (changed) markTalk();
  }
  function closePeer(id) {
    const pc = pcs.get(id);
    if (pc) { try { pc.close(); } catch (e) {} pcs.delete(id); }
    const a = audios.get(id);
    if (a) { try { a.srcObject = null; a.remove(); } catch (e) {} audios.delete(id); }
    stopMeter(id);
  }
  function closeAll() { for (const id of [...pcs.keys()]) closePeer(id); }
  function stopLocal() {
    if (localStream) localStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    localStream = null; localTrack = null; stopMeter(myId() || 'self');
  }
  async function dropSenders() {
    for (const pc of pcs.values()) for (const sender of pc.getSenders()) if (sender.track) { try { await sender.replaceTrack(null); } catch (e) {} }
  }
  function roomOff() {
    token++; micOn = false; starting = false; floor = null; floorStopped = 0;
    const id = myId(); if (id) roster[id] = false;
    stopLocal(); dropSenders(); closeAll();
    for (const k of Object.keys(roster)) delete roster[k];
    for (const k of Object.keys(talking)) delete talking[k];
    stripIcons();
    note = '';
    noteCls = '';
    paint();
  }
  function hardOff() { roomOff(); }

  function linkNote() {
    if (!micOn || !modeOn()) return;
    const list = [...pcs.values()];
    const up = list.filter(pc => pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed').length;
    const failed = list.filter(pc => pc.connectionState === 'failed' || pc.iceConnectionState === 'failed').length;
    if (!list.length) setNote('麥克風已開。房間裡暫時沒有其他人。', '');
    else if (up) setNote(`麥克風已開 · 已接通 ${up}/${list.length}`, '');
    else if (failed) setNote(config.turn ? '語音連線失敗。' : '語音未能接通。沒有 TURN 中繼，部分網絡會連不上。', 'bad');
    else setNote(`麥克風已開 · 正在接通（${list.length}）`, '');
  }
  function signal(to, kind, sdp, candidate) {
    if (!socket || !modeOn()) return Promise.resolve({ error: '麥克風模式未開啟' });
    return new Promise(res => socket.emit('voice:signal', { to, kind, sdp, candidate }, r => res(r || {})));
  }
  function attachLocal(pc) {
    if (!localTrack) return;
    const sender = pc.getSenders().find(s => (s.track && s.track.kind === 'audio') || !s.track);
    if (sender && sender.replaceTrack) return sender.replaceTrack(localTrack);
    pc.addTrack(localTrack, localStream);
  }
  function tune(pc) {
    for (const sender of pc.getSenders()) {
      if (!sender.track || sender.track.kind !== 'audio' || !sender.getParameters) continue;
      try { const p = sender.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}]; p.encodings[0].maxBitrate = 24000; sender.setParameters(p).catch(() => {}); } catch (e) {}
    }
  }
  function playRemote(id, stream) {
    let audio = audios.get(id);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true; audio.playsInline = true; audio.setAttribute('playsinline', '');
      audio.dataset.voiceFrom = id;
      audio.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
      document.body.appendChild(audio); audios.set(id, audio);
    }
    if (audio.srcObject !== stream) audio.srcObject = stream;
    const p = audio.play();
    if (p && p.catch) p.catch(() => { needsListen = true; setNote('請按「開啟房間聲音」先聽到其他人。', ''); });
    watch(id, stream);
  }
  function ensurePc(remoteId) {
    let pc = pcs.get(remoteId);
    if (pc && pc.connectionState !== 'closed') return pc;
    if (typeof RTCPeerConnection !== 'function') throw new Error('unsupported');
    pc = new RTCPeerConnection({ iceServers: config.iceServers || [], bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    pc._ice = []; pcs.set(remoteId, pc);
    pc.onicecandidate = (e) => { if (e.candidate) signal(remoteId, 'ice', null, { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex }); };
    pc.ontrack = (e) => { playRemote(remoteId, (e.streams && e.streams[0]) || new MediaStream([e.track])); linkNote(); };
    pc.onconnectionstatechange = () => linkNote();
    pc.oniceconnectionstatechange = () => linkNote();
    return pc;
  }
  async function flushIce(pc) { const q = pc._ice || []; pc._ice = []; for (const c of q) { try { await pc.addIceCandidate(c); } catch (e) {} } }
  async function offer(remoteId) {
    if (!modeOn() || !remoteId || remoteId === myId() || !micOn || !localTrack) return;
    let pc; try { pc = ensurePc(remoteId); } catch (e) { setNote('此瀏覽器不支援語音連線。', 'bad'); return; }
    if (pc._busy) { pc._redo = true; return; }
    pc._busy = true;
    try {
      await attachLocal(pc);
      if (pc.signalingState !== 'stable') return;
      const desc = await pc.createOffer();
      await pc.setLocalDescription(desc);
      const r = await signal(remoteId, 'offer', pc.localDescription.sdp);
      if (r && r.error) setNote(r.error, 'bad');
      tune(pc);
    } catch (e) { setNote('未能送出語音連線。', 'bad'); }
    finally { pc._busy = false; if (pc._redo) { pc._redo = false; offer(remoteId); } }
  }
  async function onOffer(from, sdp) {
    if (!modeOn() || !from || from === myId() || !sdp) return;
    const pc = ensurePc(from);
    const polite = String(myId()) > String(from);
    if ((pc._busy || pc.signalingState !== 'stable') && !polite) return;
    if (pc.signalingState !== 'stable' && polite) { try { await pc.setLocalDescription({ type: 'rollback' }); } catch (e) {} }
    await pc.setRemoteDescription({ type: 'offer', sdp });
    await flushIce(pc);
    if (localTrack && micOn) await attachLocal(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await signal(from, 'answer', pc.localDescription.sdp);
    tune(pc);
  }
  async function onAnswer(from, sdp) {
    const pc = pcs.get(from);
    if (!pc || !sdp || pc.signalingState !== 'have-local-offer') return;
    await pc.setRemoteDescription({ type: 'answer', sdp });
    await flushIce(pc); tune(pc); linkNote();
  }
  async function onIce(from, candidate) {
    const pc = pcs.get(from);
    if (!pc || !candidate) return;
    if (!pc.remoteDescription) { pc._ice.push(candidate); return; }
    try { await pc.addIceCandidate(candidate); } catch (e) {}
  }
  function onSignal(msg) {
    if (round && round.skipped) return;
    if (floor && floor.speaker && msg && msg.from !== floor.speaker && myId() !== floor.speaker) return;
    if (!modeOn() || !msg || !msg.from || msg.from === myId()) return;
    if (msg.kind === 'offer') onOffer(msg.from, msg.sdp).catch(() => setNote('未能接通對方的語音。', 'bad'));
    else if (msg.kind === 'answer') onAnswer(msg.from, msg.sdp).catch(() => {});
    else if (msg.kind === 'ice') onIce(msg.from, msg.candidate).catch(() => {});
  }
  function onState(msg) {
    if (!modeOn() || !msg || !msg.id) return;
    roster[msg.id] = !!msg.on;
    if (msg.id === myId() && !msg.on && micOn) { token++; micOn = false; stopLocal(); dropSenders(); setNote('麥克風已關閉。', ''); return; }
    if (!msg.on) stopMeter(msg.id);
    paint();
  }
  function onGone(msg) { if (msg && msg.id) { roster[msg.id] = false; closePeer(msg.id); paint(); } }
  function onPlease(msg) {
    if (!modeOn() || !msg || !msg.id || !micOn) return;
    if (round && round.skipped) return;
    if (floor && floor.speaker && floor.speaker !== myId()) return;
    offer(msg.id);
  }
  function unlock() {
    listening = true; needsListen = false;
    const ctx = ensureCtx(); if (ctx && ctx.resume) ctx.resume().catch(() => {});
    audios.forEach(a => { const p = a.play(); if (p && p.catch) p.catch(() => { needsListen = true; }); });
  }
  function listen() {
    if (!modeOn()) return;
    unlock();
    if (!socket) return;
    socket.emit('voice:listen', {}, (r) => {
      if (!r || r.error) { setNote((r && r.error) || '未能開始收聽', 'bad'); return; }
      if (r.iceServers) config = { iceServers: r.iceServers, turn: !!r.turn };
      (r.roster || []).forEach(row => { if (row && row.id) roster[row.id] = !!row.on; });
      setNote(needsListen ? '請再按一次開啟房間聲音。' : '已準備收聽這間房。麥克風仍然關閉。', '');
    });
  }
  function toggle() {
    if (!modeOn()) { stripIcons(); return; }
    if (starting) return;
    if (micOn) {
      token++; micOn = false; starting = false;
      const id = myId(); if (id) roster[id] = false;
      stopLocal(); dropSenders();
      if (socket) socket.emit('voice:mic', { on: false }, () => {});
      setNote('麥克風已關閉。', '');
      return;
    }
    if (!inRoom()) { setNote('進入房間後先可以開咪。', 'bad'); return; }
    if (!seated()) { setNote('觀戰中不能開咪。', 'bad'); return; }
    if (round && round.skipped) { setNote('已連續兩次派隊不通過，現在不能發言。', 'bad'); return; }
    if (floor && floor.speaker && floor.speaker !== myId()) { setNote('現在不是你的發言。', 'bad'); return; }
    if (!window.isSecureContext) { setNote('需要 HTTPS 先可以用麥克風。', 'bad'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setNote('此瀏覽器不支援麥克風。', 'bad'); return; }
    const constraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false };
    lastConstraints = constraints; gumCalls++; starting = true;
    const my = ++token;
    setNote('正在請求麥克風…', '');
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      stream.getVideoTracks().forEach(t => t.stop());
      if (my !== token || !modeOn() || !inRoom() || !seated()) { stream.getTracks().forEach(t => t.stop()); starting = false; stripIcons(); return; }
      unlock();
      localStream = stream; localTrack = stream.getAudioTracks()[0] || null;
      if (!localTrack) { stream.getTracks().forEach(t => t.stop()); starting = false; setNote('找不到可用的麥克風。', 'bad'); return; }
      micOn = true; starting = false;
      const id = myId(); if (id) roster[id] = true;
      watch(id || 'self', stream);
      if (!socket) { roomOff(); setNote('未連上伺服器，已停止麥克風。', 'bad'); return; }
      socket.emit('voice:mic', { on: true }, (r) => {
        if (my !== token || !modeOn()) { roomOff(); return; }
        if (!r || !r.ok) { stopLocal(); micOn = false; if (id) roster[id] = false; setNote((r && r.error) || '伺服器拒絕開咪', 'bad'); return; }
        if (r.iceServers) config = { iceServers: r.iceServers, turn: !!r.turn };
        (r.roster || []).forEach(row => { if (row && row.id) roster[row.id] = !!row.on; });
        if (id) roster[id] = true;
        (r.listeners || []).forEach(to => offer(to));
        linkNote();
      });
    }).catch((err) => {
      if (my !== token) return;
      starting = false; micOn = false;
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') setNote('麥克風權限被拒絕。', 'bad');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') setNote('找不到可用的麥克風。', 'bad');
      else if (name === 'NotReadableError') setNote('麥克風被其他程式佔用。', 'bad');
      else setNote('無法開啟麥克風。', 'bad');
    });
  }
  function attach(sock, h) {
    socket = sock; hooks = h || hooks;
    if (!sock || sock.__voice) return;
    sock.__voice = true;
    sock.on('voice:signal', onSignal);
    sock.on('voice:state', onState);
    sock.on('voice:gone', onGone);
    sock.on('voice:please-offer', onPlease);
    sock.on('voice:mode', (m) => { if (!m || !m.on) roomOff(); });
    sock.on('disconnect', () => { roomOff(); });
  }
  function sync(st) {
    if (!modeOn()) { roomOff(); return; }
    applyFloor(st && st.floor);
    if (inRoom() && !seated() && !micOn && !starting) setNote('觀戰中不能開咪。', '');
    else paint();
  }
  async function audioStats() {
    let recv = 0, send = 0;
    for (const pc of pcs.values()) {
      const stats = await pc.getStats();
      stats.forEach(s => {
        if (s.type === 'inbound-rtp' && (s.kind === 'audio' || s.mediaType === 'audio')) recv += s.bytesReceived || 0;
        if (s.type === 'outbound-rtp' && (s.kind === 'audio' || s.mediaType === 'audio')) send += s.bytesSent || 0;
      });
    }
    return { recv, send };
  }
  function debug() {
    return { mode: modeOn(), micOn, starting, listening, needsListen, note, gumCalls, turn: !!config.turn, iceServers: config.iceServers || [], lastConstraints, videoTracks: localStream ? localStream.getVideoTracks().length : 0, localState: localTrack ? localTrack.readyState : 'none', peers: [...pcs.entries()].map(([id, pc]) => ({ id, conn: pc.connectionState, ice: pc.iceConnectionState, recv: pc.getReceivers().map(s => s.track && { kind: s.track.kind, state: s.track.readyState }) })) };
  }
  window.AvalonVoice = { attach, sync, paint, toggle, listen, hardOff, roomOff, glyph, presence, afterRender, barHtml, debug, audioStats, stripIcons };
})();
