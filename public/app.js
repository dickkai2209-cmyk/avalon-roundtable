'use strict';
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ================= data =================
const ROLE = {
  merlin:   { n: '梅林', en: 'MERLIN', side: 'good', d: '你知道誰是壞人（莫德雷德除外）。暗中引導好人，但千萬別暴露自己——刺客正在找你。' },
  percival: { n: '派西維爾', en: 'PERCIVAL', side: 'good', d: '你看到兩個人：一個是梅林，一個是假扮梅林的莫甘娜。分辨真假，保護真正的梅林。' },
  servant:  { n: '亞瑟的忠臣', en: 'LOYAL SERVANT', side: 'good', d: '你沒有特殊資訊。靠觀察發言和投票，找出隱藏在圓桌旁的叛徒。' },
  assassin: { n: '刺客', en: 'ASSASSIN', side: 'evil', d: '破壞任務。若好人完成 3 個任務，你有最後一次機會刺殺梅林，刺中即壞人逆轉勝利。' },
  morgana:  { n: '莫甘娜', en: 'MORGANA', side: 'evil', d: '在派西維爾眼中，你與梅林一模一樣。扮演梅林，把他引入歧途。' },
  mordred:  { n: '莫德雷德', en: 'MORDRED', side: 'evil', d: '梅林看不見你。利用這份隱形，混入任務隊伍。' },
  oberon:   { n: '奧伯倫', en: 'OBERON', side: 'evil', d: '你屬於壞人，但你不知道同伴是誰，他們也不知道你。孤身作戰。' },
  minion:   { n: '莫德雷德的爪牙', en: 'MINION OF MORDRED', side: 'evil', d: '你知道你的壞人同伴。互相掩護，讓 3 個任務失敗。' },
};
const ROLE_ORDER = ['merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'oberon', 'minion'];
const img = (r) => `/img/${r}.webp`, thumb = (r) => `/img/${r}_t.webp`;
const SKINS = [
  { id: 'classic', n: '經典', need: 0 },
  { id: 'moon', n: '月影', need: 1 },
  { id: 'gold', n: '鎏金', need: 3 },
  { id: 'blood', n: '血月', need: 6 },
];
const ANIMALS = ['🦊', '🐼', '🦆', '🐿️', '🦔', '🐰', '🐻', '🦝', '🦦', '🐹', '🐕', '🐶', '🦫', '🐧', '🐨', '🐱', '🐯', '🦁', '🐸', '🦉', '🐺', '🦄', '🐲', '🐙'];
const BGS = ['#f3d9a4', '#f7c1c8', '#bfe3c9', '#bcd6ff', '#d9c6ff', '#ffe08a', '#c8eef0', '#ffcfa6', '#2b3a6e', '#3a2a1c'];
const FXS = [['none', '無'], ['spot', '聚光燈'], ['gold', '金光'], ['spark', '星火']];
const PHASE = { team: '組隊', vote: '投票', quest: '任務', lady: '湖中仙女', assassin: '刺殺梅林', end: '遊戲結束' };
const TEAM_SIZES = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5] };
const LOGO = `<svg class="logo" viewBox="0 0 64 64"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c0"/><stop offset="1" stop-color="#b8892f"/></linearGradient></defs><path d="M32 4l22 7v17c0 16-10 27-22 32C20 55 10 44 10 28V11z" fill="#16224a" stroke="url(#lg)" stroke-width="3"/><path d="M32 13v38M24 21h16" stroke="url(#lg)" stroke-width="3.6" stroke-linecap="round"/><circle cx="32" cy="12" r="3" fill="url(#lg)"/><path d="M20 40c4 4 8 6 12 6s8-2 12-6" stroke="url(#lg)" stroke-width="2" fill="none" opacity=".6"/></svg>`;

// ================= identity =================
const LS = window.localStorage;
let pid = LS.getItem('cc.pid') || LS.getItem('avalon.pid');
if (!pid) pid = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))).replace(/-/g, '');
LS.setItem('cc.pid', pid);
let profile = JSON.parse(LS.getItem('cc.profile') || 'null') || { name: LS.getItem('avalon.name') || '', avatar: ANIMALS[Math.floor(Math.random() * 15)], bg: BGS[Math.floor(Math.random() * 8)], fx: 'spot' };
const saveProfile = () => LS.setItem('cc.profile', JSON.stringify(profile));
let skinSel = JSON.parse(LS.getItem('cc.skins') || '{}');
let myStats = { played: 0, won: 0, roles: {} };
const refreshStats = () => fetch('/api/stats?pid=' + encodeURIComponent(pid)).then(r => r.json()).then(s => { myStats = s; return s; }).catch(() => myStats);
refreshStats();
const skinOf = (role) => { const s = SKINS.find(k => k.id === skinSel[role]); const played = (myStats.roles[role] || {}).played || 0; return s && played >= s.need ? s.id : 'classic'; };

// ================= state & socket =================
let S = null, view = 'home', viewArg = null;
let selected = new Set(), lastSeatIds = [], enterIds = new Set();
let seenEvent = 0;
let pendingJoin = new URLSearchParams(location.search).get('room');
if (pendingJoin) history.replaceState(null, '', '/');
let autoRoom = true;

const socket = io({ transports: ['websocket', 'polling'] });
socket.on('connect', () => {
  $('#conn').classList.add('on');
  socket.emit('hello', { pid, ...profile }, (r) => {
    if (!r || !r.room) { S = null; if (view === 'room') go('home'); }
    if (pendingJoin) { const c = pendingJoin; pendingJoin = null; ensureName(() => joinRoom(c)); }
    render();
  });
});
socket.on('disconnect', () => $('#conn').classList.remove('on'));
socket.on('state', (st) => {
  const prev = S;
  if (prev && prev.code === st.code && !st.game) { const old = new Set(lastSeatIds); st.players.forEach(p => { if (!old.has(p.id)) { enterIds.add(p.id); setTimeout(() => enterIds.delete(p.id), 2500); } }); }
  lastSeatIds = st.players.map(p => p.id);
  if (!prev || !!prev.game !== !!st.game || (prev.game && st.game && prev.game.gid !== st.game.gid)) selected = new Set();
  if (st.game && ['vote', 'quest', 'end'].includes(st.game.phase)) selected = new Set();
  if (st.game && prev && prev.game && prev.game.phase !== st.game.phase) selected = new Set();
  S = st;
  if (autoRoom && view === 'home') { autoRoom = false; view = 'room'; }
  handleEvent(st);
  if (view === 'room' || view === 'home') render();
});
socket.on('kicked', () => { S = null; toast('你已被房主移出房間'); go('home'); });
const emit = (ev, data) => new Promise((res) => socket.emit(ev, data, (r) => { if (r && r.error) toast(r.error); res(r || {}); }));
const act = (type, data) => emit('act', { type, data });

// ================= helpers =================
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600); }
let modalLock = false;
function openModal(html, onMount, lock) { modalLock = !!lock; $('#sheet').innerHTML = html; $('#modal').classList.remove('hidden'); onMount && onMount($('#sheet')); }
function closeModal() { $('#modal').classList.add('hidden'); $('#sheet').innerHTML = ''; modalLock = false; modalQueueNext(); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !modalLock) closeModal(); });
const modalQueue = [];
function queueModal(fn) { if ($('#modal').classList.contains('hidden')) fn(); else modalQueue.push(fn); }
function modalQueueNext() { const f = modalQueue.shift(); if (f) setTimeout(f, 120); }
$('#backBtn').onclick = () => go(view === 'detail' && viewArg && viewArg.from ? viewArg.from : 'home');
function go(v, arg) { view = v; viewArg = arg || null; window.scrollTo(0, 0); render(); }
const people = () => (S && S.game ? S.game.seats : (S ? S.players : []));
const P = (id, list) => (list || people()).find(x => x.id === id) || { name: '?', avatar: '❔', bg: '#555' };
function av(p, size = 36) {
  const a = p && p.avatar; const inner = a && String(a).startsWith('data:') ? `<img src="${a}" alt="">` : esc(a || '🛡️');
  return `<span class="av s${size}" style="background:${esc((p && p.bg) || '#f3d9a4')}">${inner}</span>`;
}
const chip = (id, list) => { const p = P(id, list); return `<span class="chip">${av(p, 22)}${esc(p.name)}</span>`; };
const fmtTime = (t) => { const d = new Date(t); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const inviteUrl = (code) => `${location.origin}/r/${code}`;
const pct = (w, p) => p ? Math.round(w * 100 / p) : 0;

// ================= profile =================
function editProfile(after) {
  const d = { ...profile }; let tab = d.avatar && d.avatar.startsWith('data:') ? 'photo' : 'animal';
  const draw = (el) => {
    el.innerHTML = `<h2>個人檔案</h2>
      <div class="center">${av(d, 56)}</div>
      <div class="small muted" style="margin:12px 0 4px">暱稱（最多 10 字）</div>
      <input class="inp" id="nm" maxlength="10" placeholder="輸入暱稱" value="${esc(d.name)}">
      <div class="seg"><button data-t="animal" class="${tab === 'animal' ? 'sel' : ''}">動物頭像</button><button data-t="photo" class="${tab === 'photo' ? 'sel' : ''}">上載相片</button></div>
      ${tab === 'animal' ? `<div class="grid-av">${ANIMALS.map(e => `<button data-e="${e}" class="${e === d.avatar ? 'sel' : ''}" style="background:${d.bg}">${e}</button>`).join('')}</div>
        <div class="small muted" style="margin-top:12px">背景顏色</div><div class="swatches">${BGS.map(c => `<button data-c="${c}" class="${c === d.bg ? 'sel' : ''}" style="background:${c}"></button>`).join('')}</div>`
      : `<div class="center" style="margin-top:12px"><label class="btn ghost" style="display:inline-block;width:auto;padding:10px 20px">選擇相片<input id="file" type="file" accept="image/*" hidden></label><div class="small muted" style="margin-top:6px">相片只會壓縮成小頭像，同房玩家可見</div></div>`}
      <div class="small muted" style="margin-top:14px">入場特效（入房時在圓桌上顯示）</div>
      <div class="seg">${FXS.map(([k, n]) => `<button data-fx="${k}" class="${d.fx === k ? 'sel' : ''}">${n}</button>`).join('')}</div>
      <button class="btn" id="ok">儲存</button>`;
    const nm = $('#nm', el); nm.oninput = () => d.name = nm.value;
    $$('[data-t]', el).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(el); });
    $$('[data-e]', el).forEach(b => b.onclick = () => { d.avatar = b.dataset.e; draw(el); });
    $$('[data-c]', el).forEach(b => b.onclick = () => { d.bg = b.dataset.c; draw(el); });
    $$('[data-fx]', el).forEach(b => b.onclick = () => { d.fx = b.dataset.fx; draw(el); });
    const f = $('#file', el); if (f) f.onchange = () => { const file = f.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d'); const s = Math.min(im.width, im.height);
      x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 96, 96); d.avatar = c.toDataURL('image/jpeg', 0.72); draw(el); }; im.src = r.result; }; r.readAsDataURL(file); };
    $('#ok', el).onclick = () => {
      const n = Array.from((d.name || '').trim()).slice(0, 10).join(''); if (!n) return toast('請輸入暱稱');
      if (tab === 'photo' && !(d.avatar || '').startsWith('data:')) return toast('請選擇相片');
      if (tab === 'animal' && (d.avatar || '').startsWith('data:')) d.avatar = ANIMALS[0];
      profile = { ...d, name: n }; saveProfile(); socket.emit('profile', profile); closeModal(); render(); after && after();
    };
  };
  openModal('', draw);
}
function ensureName(fn) { if (profile.name) fn(); else editProfile(fn); }
async function createRoom() { const r = await emit('create'); if (r.room) go('room'); }
async function joinRoom(code) { const r = await emit('join', { code }); if (r.room) { closeModal(); go('room'); } }
function joinDialog() {
  openModal(`<h2>加入房間</h2><input class="inp code-inp" id="cd" maxlength="4" placeholder="····" autocomplete="off">
  <p class="muted small center">輸入同枱朋友的 4 位房間號，或用相機掃描他們的二維碼</p><button class="btn" id="ok">進入圓桌</button>`, (el) => {
    const cd = $('#cd', el); setTimeout(() => cd.focus(), 60);
    const go2 = () => { const c = cd.value.trim().toUpperCase(); if (c.length !== 4) return toast('房間號為 4 位'); joinRoom(c); };
    $('#ok', el).onclick = go2; cd.onkeydown = (e) => { if (e.key === 'Enter') go2(); };
  });
}
function inviteDialog() {
  const url = inviteUrl(S.code);
  openModal(`<h2>召集騎士</h2>
    <img class="qr" alt="QR" src="/api/qr?text=${encodeURIComponent(url)}">
    <p class="center muted small">同枱朋友用手機相機掃一掃，直接入房</p>
    <div class="center"><div class="tiny muted">房間號</div><div class="code">${S.code}</div></div>
    <div class="btns"><button class="btn ghost" id="cp">複製連結</button>${navigator.share ? '<button class="btn" id="sh">分享</button>' : ''}</div>`, (el) => {
    $('#cp', el).onclick = async () => { try { await navigator.clipboard.writeText(url); toast('已複製：' + url); } catch { prompt('複製此連結', url); } };
    const sh = $('#sh', el); if (sh) sh.onclick = () => navigator.share({ title: '卡美洛密令 · 阿瓦隆', text: `入房玩阿瓦隆！房間號 ${S.code}`, url }).catch(() => {});
  });
}

// ================= components =================
function roundTable(seats, o = {}) {
  const n = seats.length; const R = n > 8 ? 42 : 40;
  const st = seats.map((s, i) => {
    const a = (-90 + i * 360 / n) * Math.PI / 180; const x = 50 + R * Math.cos(a), y = 50 + R * Math.sin(a);
    const cls = (o.cls ? o.cls(s, i) : '') + (o.click && o.click(s, i) ? ' click' : '');
    return `<div class="st ${cls}" style="left:${x}%;top:${y}%" ${o.click && o.click(s, i) ? `data-a="${o.action || 'sel'}" data-id="${s.id}"` : ''}>
      <span class="no">${i + 1}</span><div class="mk">${o.marker ? o.marker(s, i) : ''}</div>${av(s, 44)}${o.label ? o.label(s, i) : ''}<div class="nm">${esc(s.name)}</div></div>`;
  }).join('');
  return `<div class="rt"><div class="table"><div class="ctr">${o.center || ''}</div></div>${st}</div>`;
}
function roleFace(role, skin = 'classic', small) {
  const r = ROLE[role];
  return `<div class="rc ${r.side} sk-${skin}"><div class="art" style="background-image:url(${img(role)})"></div>
    <div class="cap">${small ? `<div class="rn" style="font-size:13px;letter-spacing:1px">${r.n}</div>` : `<div class="side">${r.side === 'good' ? '亞瑟的忠誠陣營' : '莫德雷德的爪牙陣營'}</div><div class="rn">${r.n}</div><div class="en">${r.en}</div>`}</div></div>`;
}
function trackHtml(g) {
  return `<div class="track">${g.teamSizes.map((sz, i) => {
    const q = g.quests[i]; const cur = i === g.round && !['end', 'assassin'].includes(g.phase) && !q;
    return `<div class="q ${q ? (q.success ? 'ok' : 'bad') : (cur ? 'cur' : '')}">${q ? (q.success ? '✓' : '✕') : sz}${i === g.twoFailRound ? '<span class="two">2敗</span>' : ''}<small>${q ? `${q.fails} 張失敗` : `第${i + 1}輪`}</small></div>`;
  }).join('')}</div>
  <div class="rej">否決 ${[1, 2, 3, 4, 5].map(i => `<i class="${i <= g.rejects ? 'on' : ''}">${i}</i>`).join('')}<span>5 次即壞人勝</span></div>`;
}
function knowsHtml(me, list) {
  if (!me.knows.length) return me.role === 'oberon' ? '你不知道同伴是誰，他們也不知道你。' : '你沒有額外資訊，靠推理吧。';
  return me.knows.map(k => `${chip(k.id, list)} <span class="badge ${k.label.includes('壞') ? 'evil' : ''}">${esc(k.label)}</span>`).join('<br>');
}
function voteGrid(seats, rounds, quests, myId) {
  const rows = [];
  rounds.forEach((props, ri) => props.forEach((p, k) => {
    const q = quests[ri]; const last = k === props.length - 1;
    rows.push(`<tr><td class="lab">R${ri + 1}-${k + 1}</td>${seats.map(s => {
      const v = p.votes[s.id]; const tm = p.team.includes(s.id);
      return `<td class="${v === undefined ? '' : (v ? 'y' : 'n')} ${tm ? 'tm' : ''}">${p.leader === s.id ? '👑' : (tm ? '◆' : '')}</td>`;
    }).join('')}<td class="res">${p.approved ? (last && q ? (q.success ? '<span class="badge good">成功</span>' : `<span class="badge evil">失敗${q.fails}</span>`) : '<span class="badge ok">通過</span>') : '<span class="badge grey">否決</span>'}</td></tr>`);
  }));
  if (!rows.length) return '<div class="muted small">尚未有組隊記錄</div>';
  return `<div class="vg"><table><tr><th></th>${seats.map((s, i) => `<th${s.id === myId ? ' style="color:#fff"' : ''}>${i + 1}</th>`).join('')}<th></th></tr>${rows.join('')}</table></div>
  <div class="legend"><span><i style="background:rgba(75,141,255,.5)"></i>贊成</span><span><i style="background:rgba(229,71,93,.5)"></i>反對</span><span><i style="box-shadow:inset 0 0 0 2px #f3d68f"></i>隊員 ◆</span><span>👑 隊長</span></div>
  <div class="small muted" style="margin-top:6px">${seats.map((s, i) => `${i + 1}.${esc(s.name)}`).join('　')}</div>`;
}

// ================= events & animations =================
function handleEvent(st) {
  const key = 'cc.seen.' + st.code; seenEvent = Number(sessionStorage.getItem(key) || 0);
  const ev = st.lastEvent; if (!ev || ev.seq <= seenEvent) return;
  const fresh = seenEvent !== 0 || ev.type === 'start';
  sessionStorage.setItem(key, String(ev.seq));
  if (!fresh) return;
  if (ev.type === 'start') queueModal(() => showRole(true));
  else if (ev.type === 'vote') queueModal(() => showVote(ev));
  else if (ev.type === 'quest') queueModal(() => showQuest(ev));
  else if (ev.type === 'lady') queueModal(() => showLady(ev));
  else if (ev.type === 'end') { if (ev.prev) queueModal(() => showVote(ev.prev)); queueModal(showEnd); }
  else if (ev.type === 'abort') toast('房主已結束本局');
  if (ev.type === 'quest' && ev.then === 'end') queueModal(showEnd);
}
function showRole(first) {
  const g = S && S.game; const me = g && g.me; if (!me) return;
  openModal(`<h2>${first ? '你的身份' : '我的身份'}</h2>
    <div class="flip" id="flip"><div class="in"><div class="face back"><div class="hint">🤫 遮住螢幕 · 點擊翻開</div></div><div class="face front">${roleFace(me.role, skinOf(me.role))}</div></div></div>
    <div id="kn" class="hidden"><div class="small" style="margin-top:12px;color:var(--ivory)">${ROLE[me.role].d}</div><div class="know">${knowsHtml(me, g.seats)}</div></div>
    <div class="cover">翻開前請確認旁邊沒有人偷看</div>
    <button class="btn" id="ok">記住了，蓋上</button>`, (el) => {
    const f = $('#flip', el); f.onclick = () => { f.classList.toggle('on'); $('#kn', el).classList.toggle('hidden', !f.classList.contains('on')); };
    $('#ok', el).onclick = closeModal;
  }, true);
}
function showVote(ev) {
  const ids = Object.keys(ev.votes); const list = people();
  openModal(`<h2>第 ${ev.round + 1 || ''} 輪 · 投票公開</h2>
    <div class="center small muted">隊長 ${chip(ev.leader, list)}</div><div class="center">${ev.team.map(id => chip(id, list)).join('')}</div>
    <div class="vcards">${ids.map(id => `<div class="vc"><div class="c"><div class="ci"><div class="f b"></div><div class="f ${ev.votes[id] ? 'y' : 'n'}">${ev.votes[id] ? '✓' : '✕'}</div></div></div><div class="nm">${esc(P(id, list).name)}</div></div>`).join('')}</div>
    <div class="tally ${ev.approved ? 'result-good' : 'result-evil'}" id="tl">${ev.approved ? '✅ 組隊通過' : '❌ 組隊被否決'}<div class="small muted" style="font-family:sans-serif;font-weight:500">贊成 ${ev.yes} : 反對 ${ev.no}${ev.approved ? '' : `　（否決第 ${ev.attempt} 次）`}</div></div>
    <button class="btn" id="ok">繼續</button>`, async (el) => {
    $('#ok', el).onclick = closeModal;
    const cs = $$('.vc', el); for (const c of cs) { await sleep(140); c.classList.add('on'); }
    await sleep(450); const t = $('#tl', el); t && t.classList.add('on');
  });
}
function showQuest(ev) {
  const cards = Array(ev.size).fill(true); for (let i = 0; i < ev.fails; i++) cards[i] = false;
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  openModal(`<h2>第 ${ev.round + 1} 個任務</h2><p class="center muted small">洗牌後逐張翻開任務卡…</p>
    <div class="qcards">${cards.map(c => `<div class="vc"><div class="c"><div class="ci"><div class="f b"></div><div class="f ${c ? 'y' : 'n'}">${c ? '🛡️' : '🗡️'}</div></div></div><div class="nm">${c ? '成功' : '失敗'}</div></div>`).join('')}</div>
    <div class="tally ${ev.success ? 'result-good' : 'result-evil'}" id="tl"><div class="big">${ev.success ? '🏆' : '💥'}</div>${ev.success ? '任務成功' : '任務失敗'}<div class="small muted" style="font-family:sans-serif;font-weight:500">${ev.size} 張中有 ${ev.fails} 張失敗${!ev.success || ev.fails === 0 ? '' : '（本輪需 2 張失敗）'}</div></div>
    <button class="btn" id="ok">繼續</button>`, async (el) => {
    $('#ok', el).onclick = closeModal;
    for (const c of $$('.vc', el)) { await sleep(650); c.classList.add('on'); }
    await sleep(500); const t = $('#tl', el); t && t.classList.add('on');
  });
}
function showLady(ev) {
  const g = S && S.game; const list = people();
  const mine = g && g.ladyLog.slice().reverse().find(l => l.holder === S.meId && l.target === ev.target && l.side);
  if (!mine) return toast(`🌊 ${P(ev.holder, list).name} 用湖中仙女查驗了 ${P(ev.target, list).name}`);
  openModal(`<h2>湖中仙女的啟示</h2><div class="center">${chip(ev.target, list)}</div>
    <div class="flip" id="flip" style="width:min(56vw,200px)"><div class="in"><div class="face back"><div class="hint">點擊查看陣營</div></div><div class="face front"><div class="rc ${mine.side}"><div class="art" style="background-image:url(${img('lady')})"></div><div class="cap"><div class="rn" style="font-size:20px">${mine.side === 'good' ? '好人陣營' : '壞人陣營'}</div></div></div></div></div></div>
    <p class="center small muted">只有你看到這個結果，你可以選擇說真話或說謊。</p><button class="btn" id="ok">知道了</button>`, (el) => { const f = $('#flip', el); f.onclick = () => f.classList.add('on'); $('#ok', el).onclick = closeModal; }, true);
}
function showEnd() {
  const g = S && S.game; if (!g || g.phase !== 'end') return;
  const goodWin = g.winner === 'good'; refreshStats();
  openModal(`<div class="banner ${g.winner}"><div class="big">${goodWin ? '🛡️' : '🗡️'}</div><h2>${goodWin ? '亞瑟陣營勝利' : '莫德雷德陣營勝利'}</h2><div class="small">${esc(g.reason)}</div></div>
    ${roundTable(g.seats, { label: s => `<span class="lbl ${ROLE[s.role].side === 'good' ? 'g' : 'e'}">${ROLE[s.role].n}</span>`, marker: s => (s.id === g.assassinTarget ? '🗡️' : '') + (s.id === g.mvp ? '🏅' : ''), center: `<b>${goodWin ? '好人勝' : '壞人勝'}</b>${g.quests.map(q => q ? (q.success ? '🔵' : '🔴') : '⚪').join('')}` })}
    <button class="btn" id="ok">查看對局詳情</button>`, (el) => $('#ok', el).onclick = () => { closeModal(); setTimeout(() => { const d = $('#detail'); d && d.scrollIntoView({ behavior: 'smooth' }); }, 100); });
}

// ================= views =================
function render() {
  const app = $('#app'); const inRoom = S && S.code;
  if (view === 'room' && !inRoom) view = 'home';
  $('#backBtn').classList.toggle('hidden', view === 'home');
  $('#topTitle').textContent = { home: '卡美洛密令', room: inRoom ? `圓桌 ${S.code}` : '房間', history: '歷史記錄', stats: '數據統計', rules: '規則介紹', skins: '角色皮膚', detail: '對局詳情' }[view];
  if (view === 'home') app.innerHTML = homeHtml();
  else if (view === 'room') { app.innerHTML = S.game ? gameHtml() : lobbyHtml(); enterIds.clear(); }
  else if (view === 'rules') { app.innerHTML = rulesHtml(); mountRules(); }
  else if (view === 'history') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadHistory(); }
  else if (view === 'stats') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadStats(); }
  else if (view === 'skins') { app.innerHTML = '<div class="card center muted">載入中…</div>'; refreshStats().then(() => { if (view === 'skins') app.innerHTML = skinsHtml(); }); }
  else if (view === 'detail') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadDetail(viewArg.gid); }
}
function homeHtml() {
  const inRoom = S && S.code;
  return `<div class="hero">${LOGO}<h1>卡美洛密令</h1><div class="en">CAMELOT CIPHER</div><div class="small muted" style="margin-top:6px">免安裝 · 手機瀏覽器即玩的阿瓦隆</div></div>
  <div class="card row" data-a="profile" style="cursor:pointer">${av(profile, 56)}
    <div class="grow"><div class="name">${profile.name ? esc(profile.name) : '未設定暱稱'}</div><div class="muted small">${myStats.played} 場 · 勝率 ${pct(myStats.won, myStats.played)}%　點擊編輯檔案</div></div><span class="gold">✎</span></div>
  ${inRoom ? `<div class="card"><h3>我的圓桌</h3><div class="row between"><div><span class="code">${S.code}</span>${S.isHost ? '<span class="badge">👑 房主</span>' : ''}<div class="muted small">${S.players.length} 位騎士 · ${S.game ? (S.game.phase === 'end' ? '已結束' : '遊戲中') : '等待開始'}</div></div><button class="btn sm" data-a="toroom">回到房間</button></div></div>` : ''}
  <div class="btns"><button class="btn" data-a="create">⚔️ 建立房間</button><button class="btn ghost" data-a="join">🛡️ 加入房間</button></div>
  <div class="card menu" style="margin-top:16px">
    <div class="item" data-a="go" data-v="history"><span class="ic">📜</span><span class="grow">歷史記錄</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="stats"><span class="ic">📊</span><span class="grow">數據統計</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="skins"><span class="ic">🎴</span><span class="grow">角色皮膚</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="rules"><span class="ic">📖</span><span class="grow">規則介紹</span><span class="chev">›</span></div>
  </div>
  <div class="footer">一人開房，同枱朋友掃碼入座<br>5–10 人 · 繁體中文 · 無需微信</div>`;
}
function lobbyHtml() {
  const n = S.players.length; const s = S.settings; const host = S.isHost; const evilCount = S.evilCount;
  const toggles = [['percival', '派西維爾', '好人：看到梅林與莫甘娜'], ['morgana', '莫甘娜', '壞人：在派西維爾眼中像梅林'], ['mordred', '莫德雷德', '壞人：梅林看不見他'], ['oberon', '奧伯倫', '壞人：與其他壞人互不相識']];
  let comp;
  if (evilCount) {
    const evil = ['刺客'].concat(s.morgana ? ['莫甘娜'] : [], s.mordred ? ['莫德雷德'] : [], s.oberon ? ['奧伯倫'] : []); const good = ['梅林'].concat(s.percival ? ['派西維爾'] : []);
    const over = evil.length > evilCount; while (evil.length < evilCount) evil.push('爪牙'); while (good.length < n - evilCount) good.push('忠臣');
    comp = `<div class="small" style="margin-top:10px;line-height:1.9"><span class="badge good">好人 ${n - evilCount}</span> ${good.join('、')}<br><span class="badge evil">壞人 ${evilCount}</span> ${evil.join('、')}${over ? '<br><span class="result-evil">⚠️ 壞人角色多於壞人人數</span>' : ''}<br><span class="muted">任務人數：${S.teamSizes.join(' / ')}${n >= 7 ? '（第 4 輪需 2 張失敗）' : ''}</span></div>`;
  } else comp = `<div class="muted small" style="margin-top:8px">需要 5–10 位玩家（現在 ${n} 位）</div>`;
  const swapSel = [...selected];
  return `<div class="card center"><div class="tiny muted">房間號</div><div class="code">${S.code}</div><button class="btn" data-a="invite">📯 召集騎士（二維碼 / 連結）</button></div>
  <div class="card"><h3>圓桌座位 ${n}/10</h3>
    ${roundTable(S.players, { cls: p => (enterIds.has(p.id) ? `enter fx-${p.fx || 'spot'}` : '') + (selected.has(p.id) ? ' sel' : '') + (p.online ? '' : ' off'), marker: p => (p.id === S.hostId ? '👑' : '') + (p.id === S.meId ? '⭐' : ''), click: () => host, action: 'swap',
      center: `<b>${n} 位騎士</b>${host ? (swapSel.length ? '再點一位交換座位' : '點兩位騎士交換座位') : '座位次序＝隊長輪替次序'}` })}
    ${host ? `<div class="plist">${S.players.filter(p => p.id !== S.meId).map(p => `<div class="p">${av(p, 28)}<span class="grow">${esc(p.name)}${p.online ? '' : '<span class="badge grey">離線</span>'}</span><button class="btn sm dark" data-a="kick" data-id="${p.id}">移除</button></div>`).join('')}</div>` : ''}
  </div>
  <div class="card"><h3>角色配置${host ? '' : '（由房主設定）'}</h3>
    <div class="toggle"><img src="${thumb('merlin')}" alt=""><div class="grow"><b>梅林</b>、<b>刺客</b><div class="muted small">必選</div></div><button class="sw on" disabled></button></div>
    ${toggles.map(([k, nm, d]) => `<div class="toggle"><img src="${thumb(k)}" alt=""><div class="grow"><b>${nm}</b><div class="muted small">${d}</div></div><button class="sw ${s[k] ? 'on' : ''}" data-a="tg" data-k="${k}" ${host ? '' : 'disabled'}></button></div>`).join('')}
    <div class="toggle"><img src="${thumb('lady')}" alt=""><div class="grow"><b>湖中仙女</b> <span class="badge">擴展</span><div class="muted small">第 2–4 個任務後查驗一人陣營（建議 8 人以上）</div></div><button class="sw ${s.lady ? 'on' : ''}" data-a="tg" data-k="lady" ${host ? '' : 'disabled'}></button></div>
    ${comp}</div>
  ${host ? `<button class="btn" data-a="start" ${n < 5 ? 'disabled' : ''}>⚔️ 開始遊戲${n < 5 ? `（還差 ${5 - n} 人）` : ''}</button>` : '<div class="card center muted">等待房主開始遊戲…</div>'}
  <button class="btn dark" data-a="leave">離開房間</button>`;
}
function gameHtml() {
  const g = S.game; const me = g.me; const meId = S.meId;
  const need = g.teamSizes[g.round]; const isLeader = g.leaderId === meId; const isLady = g.ladyId === meId;
  let panel = '', center = '';
  const selCount = selected.size;
  if (g.phase === 'team') {
    center = `<b>第 ${g.round + 1} 輪</b>隊長 ${esc(P(g.leaderId).name)}<br>需要 ${need} 人`;
    panel = isLeader ? `<div class="phase">👑 你是隊長</div><div class="small muted">在圓桌上點選 ${need} 位隊員（已選 ${selCount}/${need}），可以選自己</div><button class="btn" data-a="propose" ${selCount === need ? '' : 'disabled'}>提交隊伍</button>`
      : `<div class="phase">等待隊長組隊</div><div class="small muted">${chip(g.leaderId)} 正在挑選 ${need} 位隊員，大家可以討論</div>`;
  } else if (g.phase === 'vote') {
    center = `<b>投票中</b>${g.voted.length}/${g.n} 已投`;
    panel = `<div class="phase">是否同意此隊伍出任務？</div><div>${g.team.map(id => chip(id)).join('')}</div><div class="small muted" style="margin-top:6px">全員投完後同時公開</div>` +
      (me && !me.voted ? `<div class="btns"><button class="btn good" data-a="vote" data-v="1">✓ 贊成</button><button class="btn evil" data-a="vote" data-v="0">✕ 反對</button></div>` : `<div class="center muted" style="margin-top:10px">你已投${me && me.myVote ? '「贊成」' : '「反對」'}，等待其他騎士…</div>`);
  } else if (g.phase === 'quest') {
    const onTeam = g.team.includes(meId);
    center = `<b>任務進行中</b>${g.questDone}/${g.team.length} 已出卡`;
    panel = `<div class="phase">任務進行中</div><div>${g.team.map(id => chip(id)).join('')}</div>${g.twoFailRound === g.round ? '<div class="small result-evil" style="margin-top:6px">本輪需 2 張失敗才算任務失敗</div>' : ''}` +
      (onTeam && !me.questSubmitted ? `<div class="small muted" style="margin-top:6px">秘密選擇你的任務卡：</div><div class="btns"><button class="btn good" data-a="quest" data-v="1">🛡️ 成功</button><button class="btn evil" data-a="quest" data-v="0" ${me.side === 'good' ? 'disabled' : ''}>🗡️ 失敗</button></div>${me.side === 'good' ? '<div class="small muted center" style="margin-top:6px">好人只能出「成功」</div>' : ''}`
        : `<div class="center muted" style="margin-top:10px">${onTeam ? '你已交卡，等待其他隊員…' : '等待隊員秘密出卡…'}</div>`);
  } else if (g.phase === 'lady') {
    center = `<b>湖中仙女</b>${esc(P(g.ladyId).name)} 查驗中`;
    panel = isLady ? `<div class="phase">🌊 湖中仙女在你手上</div><div class="small muted">點選一位騎士查驗陣營（不能查驗曾持有仙女的人）。已選：${selCount ? esc(P([...selected][0]).name) : '無'}</div><button class="btn" data-a="lady" ${selCount === 1 ? '' : 'disabled'}>查驗</button>`
      : `<div class="phase">🌊 湖中仙女</div><div class="small muted">${chip(g.ladyId)} 正在選擇查驗對象</div>`;
  } else if (g.phase === 'assassin') {
    const amA = me && me.role === 'assassin'; const as = g.seats.find(s => s.assassin);
    center = `<b>刺殺時刻</b>好人已完成 3 個任務`;
    panel = `<div class="phase">🗡️ 刺客的最後一擊</div><div class="small muted">壞人可以公開討論，由刺客 ${as ? chip(as.id) : ''} 指認梅林</div>` +
      (amA ? `<div class="small muted" style="margin-top:6px">點選目標：${selCount ? esc(P([...selected][0]).name) : '未選'}</div><button class="btn evil" data-a="assassinate" ${selCount === 1 ? '' : 'disabled'}>確認刺殺</button>` : '');
  } else if (g.phase === 'end') {
    center = `<b>${g.winner === 'good' ? '好人勝' : '壞人勝'}</b>${g.quests.map(q => q ? (q.success ? '🔵' : '🔴') : '⚪').join('')}`;
    panel = `${S.isHost ? '<button class="btn" data-a="lobby" style="margin-top:0">🔁 再來一局（保留座位）</button>' : '<div class="center muted small">等待房主開新一局（座位保留）</div>'}`;
  }
  const selectable = (s) => (g.phase === 'team' && isLeader) || (g.phase === 'assassin' && me && me.role === 'assassin' && s.id !== meId && !s.evil) || (g.phase === 'lady' && isLady && s.id !== meId && !g.ladyUsed.includes(s.id));
  const ended = g.phase === 'end';
  const table = roundTable(g.seats, {
    click: selectable,
    cls: s => (selected.has(s.id) ? 'sel' : (g.team.includes(s.id) ? 'team' : '')) + (s.online ? '' : ' off'),
    marker: s => [s.id === g.leaderId && !ended ? '<span class="crown">👑</span>' : '', s.id === g.ladyId && !ended ? '🌊' : '', g.team.includes(s.id) ? '🛡️' : '', g.phase === 'vote' && g.voted.includes(s.id) ? '✅' : '', s.id === meId ? '⭐' : '', ended && s.id === g.assassinTarget ? '🗡️' : ''].join(''),
    label: s => ended ? `<span class="lbl ${ROLE[s.role].side === 'good' ? 'g' : 'e'}">${ROLE[s.role].n}</span>` : (s.evil ? '<span class="lbl e">壞人</span>' : ''),
    center,
  });
  return `<div class="card">${trackHtml(g)}</div>
  <div class="card" style="padding:10px">${table}</div>
  <div class="card">${panel}</div>
  ${me ? `<div class="card rolestrip" data-a="role"><div class="th"></div><div class="grow"><div class="serif gold" style="font-weight:700">我的身份卡</div><div class="small muted">點擊翻開查看（請遮住螢幕）</div></div><span class="gold">›</span></div>` : '<div class="card muted">你是觀眾</div>'}
  ${ended ? `<div id="detail">${detailHtml(liveRecord(g))}</div>` : `<div class="card"><h3>組隊 / 投票記錄</h3>${voteGrid(g.seats, g.rounds, g.quests, meId)}${ladyChainHtml(g.ladyLog, g.seats)}</div>`}
  <div class="btns"><button class="btn dark" data-a="invite">房間二維碼</button><button class="btn dark" data-a="go" data-v="home">返回主頁</button></div>
  ${S.isHost && !ended ? '<button class="btn dark" data-a="abort" style="color:#ff8b9c">強制結束本局</button>' : ''}`;
}
function ladyChainHtml(log, seats) {
  if (!log || !log.length) return '';
  return `<div class="small" style="margin-top:12px"><span class="gold">🌊 湖中仙女：</span>${log.map(l => `${esc(P(l.holder, seats).name)} → ${esc(P(l.target, seats).name)}${l.side ? ` <span class="badge ${l.side}">${l.side === 'good' ? '好' : '壞'}</span>` : ''}`).join('　')}</div>`;
}
function liveRecord(g) {
  return { winner: g.winner, reason: g.reason, n: g.n, players: g.seats.map((s, i) => ({ ...s, seat: i + 1 })), quests: g.quests, rounds: g.rounds, ladyLog: g.ladyLog, assassinTarget: g.assassinTarget, scores: g.scores || {}, mvp: g.mvp, runnerUp: g.runnerUp, highlights: g.highlights || [], myId: S.meId, room: S.code, endedAt: Date.now() };
}
function detailHtml(r) {
  const seats = r.players; const me = seats.find(s => s.id === r.myId); const sc = r.scores || {};
  const goodWin = r.winner === 'good'; const merlin = seats.find(s => s.role === 'merlin');
  const at = r.assassinTarget && seats.find(s => s.id === r.assassinTarget);
  const mvpBox = (id, t) => { if (!id || !sc[id]) return ''; const p = P(id, seats); return `<div><div class="t">${t}</div>${av(p, 44)}<div style="font-weight:700;margin-top:4px">${esc(p.name)}</div><div class="small"><span class="badge ${ROLE[p.role].side}">${ROLE[p.role].n}</span> <b class="gold">${sc[id].total} 分</b></div><ul>${sc[id].items.map(([l, v]) => `<li>${esc(l)} <b>+${v}</b></li>`).join('')}</ul></div>`; };
  window.__lastRecord = r;
  return `<div class="card"><div class="banner ${r.winner}"><div class="tiny" style="letter-spacing:3px;opacity:.8">${r.room ? '房間 ' + esc(r.room) + ' · ' : ''}${r.n} 人局</div><h2>${goodWin ? '🛡️ 亞瑟陣營勝利' : '🗡️ 莫德雷德陣營勝利'}</h2><div class="small">${esc(r.reason)}</div>
      ${at ? `<div class="small" style="margin-top:6px">刺客刺殺了 ${esc(at.name)}（${ROLE[at.role].n}）· 梅林是 ${esc(merlin ? merlin.name : '?')}</div>` : ''}
      <div style="margin-top:8px;font-size:20px">${r.quests.map(q => q ? (q.success ? '🔵' : '🔴') : '⚪').join(' ')}</div></div>
    ${me && sc[me.id] ? `<div class="row between" style="margin-top:12px"><div class="row">${av(me, 36)}<div><b>我的表現</b><div class="small muted">${ROLE[me.role].n} · 座位 ${me.seat} · ${ROLE[me.role].side === r.winner ? '<span class="badge ok">勝利</span>' : '<span class="badge evil">落敗</span>'}</div></div></div><div class="center"><div class="code" style="font-size:22px;letter-spacing:1px">${sc[me.id].total} 分</div><div class="tiny muted">第 ${sc[me.id].rank} 名</div></div></div>` : ''}
  </div>
  <div class="card"><h3>MVP</h3><div class="mvp">${mvpBox(r.mvp, '🏅 MVP')}${mvpBox(r.runnerUp, '🥈 亞軍')}</div><div class="tiny muted" style="margin-top:8px">計分：勝利 +12 · 正確投票 +2 · 完成己方任務 +1 · 人數加成 · 刺中梅林/梅林隱藏 +5</div></div>
  <div class="card"><h3>全員身份</h3>${roundTable(seats, { label: s => `<span class="lbl ${ROLE[s.role].side === 'good' ? 'g' : 'e'}">${ROLE[s.role].n}</span>`, marker: s => (s.id === r.assassinTarget ? '🗡️' : '') + (s.id === r.mvp ? '🏅' : '') + (s.id === r.myId ? '⭐' : ''), center: `<b>${goodWin ? '好人勝' : '壞人勝'}</b>🗡️ 被刺殺　🏅 MVP` })}</div>
  ${r.highlights && r.highlights.length ? `<div class="card"><h3>精彩時刻</h3><ul class="hl">${r.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>${ladyChainHtml(r.ladyLog, seats)}</div>` : ''}
  <div class="card"><h3>組隊 / 投票全記錄</h3>${voteGrid(seats, r.rounds || [], r.quests, r.myId)}</div>
  <button class="btn ghost" data-a="poster">🖼️ 生成戰報海報</button>`;
}
async function loadDetail(gid) {
  const r = await fetch(`/api/game/${encodeURIComponent(gid)}?pid=${encodeURIComponent(pid)}`).then(x => x.json()).catch(() => null);
  if (view !== 'detail') return;
  $('#app').innerHTML = r && !r.error ? detailHtml(r) : '<div class="card center muted">找不到此對局</div>';
}
async function loadHistory() {
  const list = await fetch('/api/history?pid=' + encodeURIComponent(pid)).then(r => r.json()).catch(() => []);
  if (view !== 'history') return;
  $('#app').innerHTML = list.length ? list.map(g => {
    const r = ROLE[g.myRole] || ROLE.servant; const won = r.side === g.winner; const me = g.players.find(p => p.id === g.myId) || {};
    return `<div class="card hitem" data-a="detail" data-g="${g.gid}"><img src="${thumb(g.myRole)}" alt=""><div class="grow"><div><b class="serif">${r.n}</b> ${won ? '<span class="badge ok">勝</span>' : '<span class="badge evil">負</span>'}${g.mvp === g.myId ? '<span class="badge">🏅 MVP</span>' : ''}</div>
      <div class="small muted">${g.n} 人局 · 座位 ${me.seat || '-'} · ${g.winner === 'good' ? '好人勝' : '壞人勝'}</div><div class="tiny muted">${fmtTime(g.endedAt)}　${g.quests.map(q => q ? (q.success ? '🔵' : '🔴') : '⚪').join('')}</div></div><span class="gold">›</span></div>`;
  }).join('') : '<div class="card center muted">還未有完成的對局<br><span class="small">完成一局後會自動記錄</span></div>';
}
async function loadStats() {
  const st = await refreshStats(); if (view !== 'stats') return;
  let gw = 0, gp = 0, ew = 0, ep = 0; for (const [k, v] of Object.entries(st.roles || {})) { if (ROLE[k].side === 'good') { gw += v.won; gp += v.played; } else { ew += v.won; ep += v.played; } }
  $('#app').innerHTML = `<div class="card row">${av(profile, 56)}<div><div class="name">${esc(profile.name || '騎士')}</div><div class="small muted">MVP ${st.mvp || 0} 次</div></div></div>
  <div class="card"><div class="kpis"><div class="kpi"><b>${st.played}</b><span>總場數</span></div><div class="kpi"><b>${pct(st.won, st.played)}%</b><span>勝率</span></div><div class="kpi"><b>${st.won}</b><span>勝場</span></div></div>
    <div class="row" style="margin-top:14px;gap:8px"><div class="grow"><span class="badge good">好人</span> <b>${gw}</b> 勝 <b>${gp - gw}</b> 負<div class="bar"><i style="width:${pct(gw, gp)}%;background:var(--good)"></i></div></div><div class="grow"><span class="badge evil">壞人</span> <b>${ew}</b> 勝 <b>${ep - ew}</b> 負<div class="bar"><i style="width:${pct(ew, ep)}%;background:var(--evil)"></i></div></div></div></div>
  <div class="card"><h3>各角色戰績</h3><div class="rstats">${ROLE_ORDER.map(k => { const r = (st.roles || {})[k] || { played: 0, won: 0 };
    return `<div class="rstat ${ROLE[k].side}"><img src="${thumb(k)}" alt=""><b>${ROLE[k].n.replace('莫德雷德的', '')}</b>${r.played} 場 · ${pct(r.won, r.played)}%</div>`; }).join('')}</div></div>
  <div class="footer">數據跟隨此瀏覽器的玩家身份保存</div>`;
}
function skinsHtml() {
  return `<div class="card"><div class="small muted">每個角色玩得越多，解鎖越多皮膚。揭曉身份時會顯示你所選的皮膚。</div></div>` + ROLE_ORDER.map(k => {
    const played = (myStats.roles[k] || {}).played || 0; const cur = skinOf(k); const next = SKINS.find(s => s.need > played);
    return `<div class="card"><div class="row between"><h3 style="margin:0">${ROLE[k].n}</h3><span class="small muted">已玩 ${played} 場</span></div>
      <div class="skinrow" style="margin-top:10px">${SKINS.map(s => `<div class="skin ${played >= s.need ? '' : 'lock'} ${cur === s.id ? 'sel' : ''}" data-a="skin" data-r="${k}" data-s="${s.id}">${roleFace(k, s.id, true)}<div style="margin-top:4px">${s.n}${played >= s.need ? '' : ` 🔒${s.need}場`}</div></div>`).join('')}</div>
      ${next ? `<div class="tiny muted" style="margin-top:6px">下一款「${next.n}」：${played}/${next.need} 場</div><div class="bar"><i style="width:${pct(played, next.need)}%"></i></div>` : '<div class="tiny gold" style="margin-top:6px">已解鎖全部皮膚 ✦</div>'}</div>`;
  }).join('');
}

// ================= rules =================
let rulesTab = 'overview', wkRole = 'merlin', wkReveal = false, demoStep = 0;
const TABS = [['overview', '概覽'], ['sides', '陣營'], ['knows', '誰知道誰'], ['round', '一輪點行'], ['quest', '任務'], ['win', '勝負'], ['tips', '思路'], ['ext', '擴展']];
const DEMO_SEATS = [['亞瑟', '🦁', '#ffe08a'], ['桂妮薇', '🦢', '#f7c1c8'], ['高文', '🐻', '#bfe3c9'], ['凱', '🦊', '#ffcfa6'], ['貝德維爾', '🦉', '#bcd6ff'], ['崔斯坦', '🐺', '#d9c6ff'], ['加拉哈德', '🐰', '#c8eef0'], ['伊索德', '🐱', '#f3d9a4']]
  .map(([name, avatar, bg], i) => ({ id: 'd' + i, name, avatar, bg }));
const WK_ROLES = ['merlin', 'percival', 'servant', 'servant', 'assassin', 'morgana', 'mordred', 'oberon'];
function rulesHtml() { return `<div class="tabs">${TABS.map(([k, n]) => `<button data-a="rtab" data-v="${k}" class="${k === rulesTab ? 'sel' : ''}">${n}</button>`).join('')}</div><div id="rulesBody"></div>`; }
function mountRules() { const b = $('#rulesBody'); if (b) b.innerHTML = rulesBody(); $$('.tabs button').forEach(x => x.classList.toggle('sel', x.dataset.v === rulesTab)); if (rulesTab === 'round') animateDemo(); }
function rulesBody() {
  const P_ = (h) => `<div class="card parch rules">${h}</div>`;
  switch (rulesTab) {
    case 'overview': return P_(`<h4>🏰 遊戲目標</h4><p>圓桌旁坐著<b>亞瑟的忠臣（好人）</b>與<b>莫德雷德的爪牙（壞人）</b>。好人要完成 3 個任務；壞人要令 3 個任務失敗，或在最後刺殺梅林。</p>
      <h4>👥 人數配置</h4><table><tr><th>人數</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th></tr><tr><td>好人</td><td>3</td><td>4</td><td>4</td><td>5</td><td>6</td><td>6</td></tr><tr><td>壞人</td><td>2</td><td>2</td><td>3</td><td>3</td><td>3</td><td>4</td></tr></table>
      <h4>📱 使用方法</h4><p>一人建立房間，其他人掃二維碼或輸入 4 位房間號入座。每人手機只顯示自己的身份。重新整理或斷線會自動回到原座位（同一部手機同一瀏覽器）。</p>`);
    case 'sides': return `<div class="rolegrid">${ROLE_ORDER.map(k => `<div class="rolecell ${ROLE[k].side}" style="background-image:url(${img(k)})" data-a="rolepeek" data-r="${k}"><div class="t"><b>${ROLE[k].n}</b><span class="tiny">${ROLE[k].side === 'good' ? '好人陣營' : '壞人陣營'}</span></div></div>`).join('')}</div><div class="small muted center" style="margin-top:8px">點擊角色查看能力</div>`;
    case 'knows': {
      const viewer = WK_ROLES.indexOf(wkRole); const vr = wkRole;
      const seen = (r, i) => { if (i === viewer) return null; if (vr === 'merlin' && ROLE[r].side === 'evil' && r !== 'mordred') return ['壞人', 'e']; if (vr === 'percival' && (r === 'merlin' || r === 'morgana')) return ['梅林?', 'p']; if (ROLE[vr].side === 'evil' && vr !== 'oberon' && ROLE[r].side === 'evil' && r !== 'oberon') return ['同伴', 'e']; return null; };
      const desc = { merlin: '梅林看到所有壞人——但看不到莫德雷德。', percival: '派西維爾看到兩個「梅林?」：一個是真梅林，一個是莫甘娜。', servant: '忠臣甚麼都看不到。', assassin: '壞人互相認識（奧伯倫除外）。', morgana: '壞人互相認識（奧伯倫除外）。', mordred: '壞人互相認識，而且梅林看不見莫德雷德。', oberon: '奧伯倫看不到同伴，同伴也看不到他。' }[vr];
      return `<div class="card"><h3>選擇視角</h3><div class="rchips">${['merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'oberon'].map(k => `<button data-a="wk" data-r="${k}" class="${k === wkRole ? 'sel' : ''}"><img src="${thumb(k)}" alt="">${ROLE[k].n}</button>`).join('')}</div>
        ${roundTable(DEMO_SEATS, { cls: (s, i) => i === viewer ? 'sel' : (seen(WK_ROLES[i], i) ? (seen(WK_ROLES[i], i)[1] === 'p' ? 'glowg' : 'glow') : (wkReveal ? '' : 'dim')),
          label: (s, i) => { const r = WK_ROLES[i]; if (i === viewer) return '<span class="lbl y">你</span>'; const v = seen(r, i); if (wkReveal) return `<span class="lbl ${ROLE[r].side === 'good' ? 'g' : 'e'}">${ROLE[r].n.replace('亞瑟的', '')}</span>`; return v ? `<span class="lbl ${v[1]}">${v[0]}</span>` : ''; },
          center: `<b>${ROLE[vr].n}</b>的視角` })}
        <div class="small" style="text-align:center;margin-top:4px">${desc}</div>
        <button class="btn ghost" data-a="wkrev">${wkReveal ? '隱藏真實身份' : '揭曉所有真實身份'}</button></div>`;
    }
    case 'round': {
      const s = DEMO[demoStep];
      return `<div class="card demo"><h3>一輪點行 · 動畫示範</h3><div class="track" style="margin-bottom:6px">${[2, 3, 2, 3, 3].map((sz, i) => `<div class="q ${s.quests[i] === 1 ? 'ok' : s.quests[i] === 0 ? 'bad' : (i === s.round ? 'cur' : '')}">${s.quests[i] === 1 ? '✓' : s.quests[i] === 0 ? '✕' : sz}</div>`).join('')}</div>
        <div class="rej" style="margin-top:6px">否決 ${[1, 2, 3, 4, 5].map(i => `<i class="${i <= s.rejects ? 'on' : ''}">${i}</i>`).join('')}</div>
        ${roundTable(DEMO_SEATS.slice(0, 5), { cls: x => s.team.includes(x.id) ? 'team' : '', marker: x => (x.id === s.leader ? '<span class="crown">👑</span>' : '') + (s.team.includes(x.id) ? '🛡️' : ''), center: s.center || '' })}
        ${s.votes ? `<div class="vcards" id="dv">${DEMO_SEATS.slice(0, 5).map((p, i) => `<div class="vc"><div class="c"><div class="ci"><div class="f b"></div><div class="f ${s.votes[i] ? 'y' : 'n'}">${s.votes[i] ? '✓' : '✕'}</div></div></div><div class="nm">${p.name}</div></div>`).join('')}</div>` : ''}
        ${s.qcards ? `<div class="qcards" id="dq">${s.qcards.map(c => `<div class="vc"><div class="c"><div class="ci"><div class="f b"></div><div class="f ${c ? 'y' : 'n'}">${c ? '🛡️' : '🗡️'}</div></div></div></div>`).join('')}</div>` : ''}
        <div class="cap"><b>${s.t}</b><span class="small">${s.d}</span></div>
        <div class="dots">${DEMO.map((_, i) => `<i class="${i === demoStep ? 'on' : ''}"></i>`).join('')}</div>
        <div class="btns"><button class="btn dark" data-a="demo" data-v="-1" ${demoStep ? '' : 'disabled'}>上一步</button><button class="btn" data-a="demo" data-v="1">${demoStep === DEMO.length - 1 ? '重新播放' : '下一步'}</button></div></div>`;
    }
    case 'quest': return P_(`<h4>🛡️ 每輪任務人數</h4><table><tr><th>人數</th><th>第1輪</th><th>第2輪</th><th>第3輪</th><th>第4輪</th><th>第5輪</th></tr>
      ${[5, 6, 7, 8, 9, 10].map(n => `<tr><td><b>${n}人</b></td>${TEAM_SIZES[n].map((x, i) => `<td class="${n >= 7 && i === 3 ? 'two' : ''}">${x}${n >= 7 && i === 3 ? '*' : ''}</td>`).join('')}</tr>`).join('')}</table>
      <p class="small">* 紅色格：7 人或以上的第 4 輪是「保護輪」，需要 <b>2 張失敗</b>才算任務失敗。</p>
      <h4>🃏 任務卡</h4><p>隊員秘密交出「成功」或「失敗」卡。<b>好人只能出成功</b>，壞人可以選擇。卡片洗勻後公開，只知道失敗張數，不知道是誰出的。</p>`);
    case 'win': return P_(`<h4>🛡️ 好人勝利</h4><p>完成 3 個任務，<b>而且</b>刺客最後沒有刺中梅林。</p>
      <h4>🗡️ 壞人勝利（任一）</h4><ul><li>3 個任務失敗</li><li>同一輪連續 5 次組隊被否決</li><li>好人完成 3 個任務後，刺客成功刺中梅林</li></ul>
      <h4>🗳️ 投票規則</h4><p>贊成票<b>超過半數</b>才通過，平票算否決。每次否決，隊長交給下一位，否決計數 +1；任務出發後計數歸零。</p>`);
    case 'tips': return P_(`<h4>🔵 好人思路</h4><ul><li>留意誰總是投票支持有失敗的隊伍。</li><li>任務失敗後，對比隊員名單，縮窄嫌疑範圍。</li><li>第 1 輪資訊少，可以多觀察發言。</li></ul>
      <h4>🧙 梅林</h4><ul><li>不要太早、太明顯地指出壞人，用投票暗示。</li><li>偶爾「猜錯」一兩次，降低被刺風險。</li></ul>
      <h4>⚔️ 派西維爾</h4><ul><li>觀察兩位「梅林?」的投票與發言，找出真梅林並替他擋刀。</li><li>可以假裝自己是梅林，吸引刺客。</li></ul>
      <h4>🔴 壞人思路</h4><ul><li>不要每次都出失敗卡，早期可以「潛伏」建立信任。</li><li>兩個壞人同隊時，協調好誰出失敗。</li><li>莫甘娜要模仿梅林的行為，混淆派西維爾。</li><li>刺客全程觀察：誰最清楚壞人是誰？</li></ul>`);
    case 'ext': return P_(`<h4>🌊 湖中仙女 Lady of the Lake <span class="badge ok">本 App 已支援</span></h4><p>開局時交給隊長右手邊（上一位）玩家。第 2、3、4 個任務結束後，持有者查驗一位玩家的陣營（只有自己看到），然後把仙女交給被查驗者。曾持有仙女的人不能被查驗。建議 8 人以上使用，可在房間設定開啟。</p>
      <h4>⚔️ 王者之劍 Excalibur <span class="badge grey">規則說明</span></h4><p>隊長組隊時把王者之劍交給一位隊員（不可給自己）。任務卡交出後，持劍者可以選擇翻轉另一位隊員的任務卡（成功↔失敗），並私下看到原本的卡。為任務結果增加變數。</p>
      <h4>🗡️ 蘭斯洛特 Lancelot <span class="badge grey">規則說明</span></h4><p>好人與壞人各有一位蘭斯洛特。遊戲中可能因「忠誠牌」而互換陣營，增加不確定性。可配合 11–12 人擴展局使用。</p>
      <p class="small">王者之劍與蘭斯洛特目前只提供規則說明，日後版本可加入。</p>`);
  }
  return '';
}
const DEMO = [
  { t: '① 隊長產生', d: '隊長按座位次序輪流擔任，皇冠在誰頭上誰就組隊。', leader: 'd0', team: [], rejects: 0, quests: [], round: 0, center: '<b>第 1 輪</b>需要 2 人' },
  { t: '② 隊長選隊員', d: '第 1 輪（5 人局）需要 2 位隊員，隊長可以選自己。', leader: 'd0', team: ['d0', 'd2'], rejects: 0, quests: [], round: 0, center: '<b>提名隊伍</b>' },
  { t: '③ 全員同時投票', d: '每人秘密投贊成或反對，全員投完一起翻開。', leader: 'd0', team: ['d0', 'd2'], rejects: 0, quests: [], round: 0, votes: [1, 0, 1, 0, 0], center: '<b>2 : 3</b>否決！' },
  { t: '④ 否決計數 +1', d: '未過半數，隊長傳給下一位，否決計數變成 1。連續 5 次否決壞人直接勝利。', leader: 'd1', team: [], rejects: 1, quests: [], round: 0, center: '<b>隊長換人</b>' },
  { t: '⑤ 新隊伍投票通過', d: '新隊長提名 2 人，4 : 1 通過，否決計數歸零。', leader: 'd1', team: ['d1', 'd3'], rejects: 0, quests: [], round: 0, votes: [1, 1, 1, 1, 0], center: '<b>4 : 1</b>通過' },
  { t: '⑥ 秘密出任務卡', d: '只有隊員出卡。好人只能出成功，壞人可以出失敗。', leader: 'd1', team: ['d1', 'd3'], rejects: 0, quests: [], round: 0, qcards: [true, false], center: '<b>任務中</b>' },
  { t: '⑦ 洗牌翻開：任務失敗', d: '出現 1 張失敗卡，任務失敗。大家開始推理：失敗卡是誰出的？', leader: 'd1', team: ['d1', 'd3'], rejects: 0, quests: [0], round: 1, qcards: [true, false], center: '<b>1 張失敗</b>' },
  { t: '⑧ 進入下一輪', d: '重複流程，直到一方取得 3 個任務。好人勝 3 次後，刺客還有最後一擊！', leader: 'd2', team: [], rejects: 0, quests: [0, 1, 1], round: 3, center: '<b>第 4 輪</b>' },
];
async function animateDemo() {
  const step = demoStep; const dv = $('#dv'), dq = $('#dq');
  if (dv) for (const c of $$('.vc', dv)) { await sleep(220); if (step !== demoStep) return; c.classList.add('on'); }
  if (dq && DEMO[step].quests.length > (DEMO[step - 1] || { quests: [] }).quests.length) for (const c of $$('.vc', dq)) { await sleep(500); if (step !== demoStep) return; c.classList.add('on'); }
}

// ================= poster =================
async function makePoster(r) {
  const W = 750, H = 1200; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const load = (src) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#131f4a'); g.addColorStop(1, '#070b20'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#d8b25e'; x.lineWidth = 4; x.strokeRect(20, 20, W - 40, H - 40); x.lineWidth = 1; x.strokeRect(32, 32, W - 64, H - 64);
  x.textAlign = 'center'; x.fillStyle = '#f3d68f'; x.font = 'bold 54px serif'; x.fillText('卡美洛密令', W / 2, 110);
  x.font = '20px sans-serif'; x.fillStyle = '#d8b25e'; x.fillText('CAMELOT CIPHER · 戰報', W / 2, 145);
  const good = r.winner === 'good'; x.fillStyle = good ? '#2b56b8' : '#a32638'; x.fillRect(60, 180, W - 120, 120);
  x.fillStyle = '#fff'; x.font = 'bold 44px serif'; x.fillText(good ? '🛡️ 亞瑟陣營勝利' : '🗡️ 莫德雷德陣營勝利', W / 2, 240);
  x.font = '22px sans-serif'; x.fillText(r.reason.slice(0, 26), W / 2, 280);
  x.font = '34px sans-serif'; x.fillText(r.quests.map(q => q ? (q.success ? '🔵' : '🔴') : '⚪').join(' '), W / 2, 350);
  const ps = r.players; const cols = 5, cw = (W - 120) / cols, ch = 250;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]; const cx = 60 + (i % cols) * cw, cy = 390 + Math.floor(i / cols) * ch; const im = await load(thumb(p.role));
    x.save(); x.beginPath(); x.roundRect ? x.roundRect(cx + 8, cy, cw - 16, cw - 16, 14) : x.rect(cx + 8, cy, cw - 16, cw - 16); x.clip(); if (im) x.drawImage(im, cx + 8, cy, cw - 16, cw - 16); x.restore();
    x.strokeStyle = ROLE[p.role].side === 'good' ? '#7fb0ff' : '#ff7d90'; x.lineWidth = 3; x.strokeRect(cx + 8, cy, cw - 16, cw - 16);
    x.fillStyle = '#f5ecd8'; x.font = 'bold 20px sans-serif'; x.fillText(String(p.name).slice(0, 6), cx + cw / 2, cy + cw + 14);
    x.fillStyle = ROLE[p.role].side === 'good' ? '#9cc0ff' : '#ff9aa8'; x.font = '17px sans-serif'; x.fillText(ROLE[p.role].n.replace('莫德雷德的', '') + (p.id === r.mvp ? ' 🏅' : '') + (p.id === r.assassinTarget ? ' 🗡️' : ''), cx + cw / 2, cy + cw + 40);
  }
  if (r.mvp) { const m = ps.find(p => p.id === r.mvp); x.fillStyle = '#f3d68f'; x.font = 'bold 30px serif'; x.fillText(`🏅 MVP：${m.name}（${(r.scores[r.mvp] || {}).total || 0} 分）`, W / 2, 960); }
  x.fillStyle = '#c9cfe6'; x.font = '20px sans-serif'; (r.highlights || []).slice(0, 3).forEach((h, i) => x.fillText('✦ ' + h, W / 2, 1010 + i * 34));
  x.fillStyle = '#97a1c2'; x.font = '18px sans-serif'; x.fillText(`${r.n} 人局 · ${fmtTime(r.endedAt || Date.now())} · ${location.host}`, W / 2, H - 60);
  return c.toDataURL('image/png');
}
async function posterDialog() {
  const r = window.__lastRecord; if (!r) return;
  openModal('<h2>戰報海報</h2><div class="center muted">生成中…</div>');
  const url = await makePoster(r);
  openModal(`<h2>戰報海報</h2><img src="${url}" style="width:100%;border-radius:12px;border:1px solid var(--line)"><p class="center small muted">長按圖片可儲存或分享</p><a class="btn" href="${url}" download="camelot-cipher.png" style="text-align:center;text-decoration:none">下載圖片</a>`);
}

// ================= actions =================
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-a]'); if (!el || !document.body.contains(el)) return;
  const a = el.dataset.a;
  switch (a) {
    case 'profile': return editProfile();
    case 'create': return ensureName(createRoom);
    case 'join': return ensureName(joinDialog);
    case 'toroom': return go('room');
    case 'go': return go(el.dataset.v);
    case 'invite': return inviteDialog();
    case 'role': return showRole(false);
    case 'tg': return act('settings', { [el.dataset.k]: !S.settings[el.dataset.k] });
    case 'kick': if (confirm('移除這位玩家？')) act('kick', { id: el.dataset.id }); return;
    case 'swap': { const id = el.dataset.id; if (selected.has(id)) selected.delete(id); else selected.add(id);
      if (selected.size === 2) { const [x, y] = [...selected]; selected = new Set(); await act('swap', { a: x, b: y }); } return render(); }
    case 'start': return act('start');
    case 'leave': { const r = await emit('leave'); S = null; if (r.stillSeated) toast('遊戲進行中，你的座位會保留'); return go('home'); }
    case 'abort': if (confirm('確定強制結束本局？（不會計入記錄）')) act('abort'); return;
    case 'lobby': return act('lobby');
    case 'sel': {
      const id = el.dataset.id; const g = S.game;
      if (g.phase === 'team') { if (selected.has(id)) selected.delete(id); else if (selected.size < g.teamSizes[g.round]) selected.add(id); else toast(`最多選 ${g.teamSizes[g.round]} 人`); }
      else selected = new Set(selected.has(id) ? [] : [id]);
      return render();
    }
    case 'propose': { const r = await act('propose', { team: [...selected] }); if (r.ok) selected = new Set(); return; }
    case 'vote': return act('vote', { approve: el.dataset.v === '1' });
    case 'quest': return act('quest', { success: el.dataset.v === '1' });
    case 'lady': { const id = [...selected][0]; if (id && confirm(`用湖中仙女查驗 ${P(id).name}？`)) { const r = await act('lady', { id }); if (r.ok) selected = new Set(); } return; }
    case 'assassinate': { const id = [...selected][0]; if (id && confirm(`確定刺殺 ${P(id).name}？`)) { const r = await act('assassinate', { id }); if (r.ok) selected = new Set(); } return; }
    case 'detail': return go('detail', { gid: el.dataset.g, from: 'history' });
    case 'poster': return posterDialog();
    case 'skin': { const r = el.dataset.r, s = el.dataset.s; const need = SKINS.find(k => k.id === s).need; const played = (myStats.roles[r] || {}).played || 0;
      if (played < need) return toast(`再玩 ${need - played} 場${ROLE[r].n}即可解鎖`); skinSel[r] = s; LS.setItem('cc.skins', JSON.stringify(skinSel)); return render(); }
    case 'rtab': rulesTab = el.dataset.v; if (rulesTab === 'round') demoStep = 0; return mountRules();
    case 'wk': wkRole = el.dataset.r; return mountRules();
    case 'wkrev': wkReveal = !wkReveal; return mountRules();
    case 'demo': demoStep = demoStep === DEMO.length - 1 && el.dataset.v === '1' ? 0 : Math.max(0, demoStep + Number(el.dataset.v)); return mountRules();
    case 'rolepeek': { const k = el.dataset.r; return openModal(`<div class="flip on" style="cursor:default"><div class="in"><div class="face back"></div><div class="face front">${roleFace(k)}</div></div></div><p class="center" style="margin-top:14px">${ROLE[k].d}</p><button class="btn" id="ok">關閉</button>`, (m) => $('#ok', m).onclick = closeModal); }
  }
});
render();
})();
