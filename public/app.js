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
  lancelot_good: { n: '蘭斯洛特（正）', en: 'LANCELOT (LOYAL)', side: 'good', d: '你知道邪惡蘭斯洛特是誰。你即使是好人也可以出失敗卡。忠誠牌可能讓你們互換陣營。' },
  lancelot_evil: { n: '蘭斯洛特（邪）', en: 'LANCELOT (EVIL)', side: 'evil', d: '你知道正義蘭斯洛特是誰。忠誠牌可能讓你們互換陣營。' },
};
const CARDBACKS = [['cardback', '經典', 0], ['cardback_halloween', '萬聖節', 3], ['cardback_lny', '新春', 6]];
const cardBackOf = () => { const k = (skinSel && skinSel._cardback) || 'cardback'; const c = CARDBACKS.find(x => x[0] === k); return c && playedTotal() >= c[2] ? k : 'cardback'; };
const OUTFIT_ROLES = ['merlin', 'percival', 'morgana', 'assassin', 'servant'];
const skinsFor = (role) => SKINS.filter(s => !s.outfit || OUTFIT_ROLES.includes(role));
const ROLE_ORDER = ['merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'oberon', 'minion'];
const img = (r) => `/img/${r}.webp`, thumb = (r) => `/img/${r}_t.webp`;
const SKINS = [
  { id: 'classic', n: '經典', need: 0 },
  { id: 'casual', n: '日常便服', need: 0, outfit: 1 },
  { id: 'festive', n: '節日盛裝', need: 2, outfit: 1 },
  { id: 'moon', n: '月影', need: 1 },
  { id: 'gold', n: '鎏金', need: 3 },
  { id: 'blood', n: '血月', need: 6 },
];
const ANIMALS = [
  ['fox','狐狸'],['panda','熊貓'],['duck','小鴨'],['squirrel','松鼠'],['hedgehog','刺蝟'],['bunny','兔子'],
  ['bear','棕熊'],['redpanda','小熊貓'],['otter','水獺'],['hamster','倉鼠'],['shiba','柴犬'],['dalmatian','斑點狗'],
  ['capybara','水豚'],['penguin','企鵝'],['koala','無尾熊'],['cat','貓咪']
];
const EMOJI_MAP = {'🦊':'fox','🐼':'panda','🦆':'duck','🐿️':'squirrel','🦔':'hedgehog','🐰':'bunny','🐻':'bear','🦝':'redpanda','🦦':'otter','🐹':'hamster','🐕':'shiba','🐶':'shiba','🦫':'capybara','🐧':'penguin','🐨':'koala','🐱':'cat'};
const BGS = ['#f3d9a4', '#f7c1c8', '#bfe3c9', '#bcd6ff', '#d9c6ff', '#ffe08a', '#c8eef0', '#ffcfa6', '#2b3a6e', '#3a2a1c'];
const FXS = [['none','無',0],['spot','聚光燈',0],['gold','金光',0],['spark','星火',1],['petals','花瓣',3],['fire','火焰圈',6],['lightning','閃電',10]];
const PENDANTS = [['none','無',0],['crown','小王冠',0],['bow','花花蝴蝶結',0],['halo','星星光環',0],['star','星星',3],['sword','短劍',3],['moon','新月',6],['wings','雙翼',10]];
const PD_IMG = { crown: 1, bow: 1, halo: 1 };
const PENDANT_ICON = { none:'', crown:'👑', bow:'🎀', halo:'✨', flower:'🌸', star:'⭐', sword:'⚔️', moon:'🌙', wings:'🕊️' };
const PHASE = { team: '組隊', vote: '投票', sword: '授予王者之劍', quest: '任務', swordflip: '王者之劍', lady: '湖中仙女', assassin: '刺殺梅林', end: '遊戲結束' };
const TEAM_SIZES = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5], 11: [3, 4, 4, 5, 5], 12: [3, 4, 5, 5, 5] };
const LOGO = `<img class="logo amigos" src="/img/amigos.webp" alt="Amigos' Party" width="120" height="96" decoding="async">`;
const ROLE_ART = {};
const RN = { merlin:'梅林', percival:'派西維爾', servant:'忠臣', lancelot_good:'蘭斯洛特（正）', assassin:'刺客', morgana:'莫甘娜', mordred:'莫德雷德', oberon:'奧伯倫', minion:'爪牙', lancelot_evil:'蘭斯洛特（邪）' };

// ================= identity =================
const LS = window.localStorage;
let pid = LS.getItem('cc.pid') || LS.getItem('avalon.pid');
if (!pid) pid = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))).replace(/-/g, '');
LS.setItem('cc.pid', pid);
let token = LS.getItem('cc.token') || '';
let account = null; // {username, guest}
function migrateAvatar(a) { if (!a) return 'fox'; if (EMOJI_MAP[a]) return EMOJI_MAP[a]; if (a === 'photo' || ANIMALS.some(([k]) => k === a) || String(a).startsWith('data:')) return a; return 'fox'; }
let profile = JSON.parse(LS.getItem('cc.profile') || 'null') || { name: LS.getItem('avalon.name') || '', avatar: 'fox', bg: BGS[Math.floor(Math.random() * 8)], fx: 'spot', pendant: 'none' };
profile.avatar = migrateAvatar(profile.avatar);
profile.pendant = profile.pendant || 'none';
const saveProfile = () => LS.setItem('cc.profile', JSON.stringify(profile));
let skinSel = JSON.parse(LS.getItem('cc.skins') || '{}');
let myStats = { played: 0, won: 0, roles: {}, mvp: 0 };
const authHdr = () => token ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
const api = (url, opt = {}) => fetch(url, { ...opt, headers: { ...authHdr(), ...(opt.headers || {}) } }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || '請求失敗'); return j; });
const refreshStats = () => api('/api/stats').then(s => { myStats = s; if (s && account) { /* skins may live on account */ } return s; }).catch(() => myStats);
const skinOf = (role) => { const s = SKINS.find(k => k.id === skinSel[role]); const played = (myStats.roles[role] || {}).played || 0; return s && played >= s.need ? s.id : 'classic'; };
function applyUser(u, stats) {
  if (!u) return;
  account = u; pid = u.id; LS.setItem('cc.pid', pid);
  profile = { name: u.name || profile.name, avatar: u.avatar || profile.avatar, bg: u.bg || profile.bg, fx: u.fx || profile.fx, pendant: u.pendant || 'none' };
  if (u.skins) skinSel = { ...skinSel, ...u.skins };
  if (stats) myStats = stats;
  saveProfile(); LS.setItem('cc.skins', JSON.stringify(skinSel));
}
async function ensureSession() {
  try {
    if (token) { const r = await api('/api/me'); applyUser(r.user, r.stats); return r.user; }
  } catch (e) { token = ''; LS.removeItem('cc.token'); }
  const r = await api('/api/auth/guest', { method: 'POST', body: JSON.stringify({ guestKey: LS.getItem('cc.pid'), profile }) });
  token = r.token; LS.setItem('cc.token', token); applyUser(r.user, r.stats); return r.user;
}

// ================= state & socket =================
let S = null, view = 'home', viewArg = null;
let selected = new Set(), lastSeatIds = [], enterIds = new Set();
let seenEvent = 0;
(function pickGoogleToken() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('gauth')) { token = h.get('gauth'); LS.setItem('cc.token', token); if (h.get('room')) history.replaceState(null, '', '/?room=' + h.get('room')); else history.replaceState(null, '', '/'); setTimeout(() => toast('已用 Google 登入'), 800); }
  const q = new URLSearchParams(location.search);
  if (q.get('gerr')) { setTimeout(() => toast(q.get('gerr') === 'notconfigured' ? 'Google 登入尚未設定' : 'Google 登入未完成，請再試'), 800); history.replaceState(null, '', '/'); }
})();
let pendingGame = (location.pathname.match(/^\/g\/([\w-]{8,})/) || [])[1] || new URLSearchParams(location.search).get('game');
if (pendingGame) history.replaceState(null, '', '/');
let pendingJoin = new URLSearchParams(location.search).get('room');
if (pendingJoin) history.replaceState(null, '', '/');
let autoRoom = true;

const socket = io({ transports: ['websocket', 'polling'] });
socket.on('connect', () => {
  $('#conn').classList.add('on');
  ensureSession().then(() => {
    socket.emit('hello', { token, guestKey: LS.getItem('cc.pid'), ...profile }, (r) => {
      if (r && r.user) applyUser(r.user);
      if (!r || !r.room) { S = null; if (view === 'room') go('home'); }
      if (pendingJoin) { const c = pendingJoin; pendingJoin = null; ensureName(() => joinRoom(c)); }
      if (pendingGame) { const gid = pendingGame; pendingGame = null; return go('detail', { gid, from: 'home' }); }
      render();
    });
  }).catch(e => toast(e.message || '無法連線至伺服器'));
});
socket.on('disconnect', () => $('#conn').classList.remove('on'));
let wakeT = setTimeout(() => { if (!socket.connected) $('#wake').classList.remove('hidden'); }, 2500);
socket.on('connect', () => { clearTimeout(wakeT); $('#wake').classList.add('hidden'); });
function refreshRoom() {
  toast('重新同步中…'); sessionStorage.removeItem('cc.modalq');
  socket.once('state', () => toast('已同步最新房間狀態 ✓'));
  socket.disconnect(); setTimeout(() => socket.connect(), 250);
}
socket.on('state', (st) => {
  const prev = S;
  const occ = (st.seats || []).filter(s => !s.empty);
  if (prev && prev.code === st.code && !st.game) {
    const old = new Set(lastSeatIds);
    occ.forEach(p => { if (!old.has(p.id)) { enterIds.add(p.id); setTimeout(() => enterIds.delete(p.id), 2800); } });
  }
  lastSeatIds = occ.map(p => p.id);
  if (!prev || !!prev.game !== !!st.game || (prev.game && st.game && prev.game.gid !== st.game.gid)) selected = new Set();
  if (st.game && ['vote', 'quest', 'end'].includes(st.game.phase)) selected = new Set();
  if (st.game && prev && prev.game && prev.game.phase !== st.game.phase) selected = new Set();
  S = st;
  if (autoRoom && view === 'home' && st.code) { autoRoom = false; view = 'room'; }
  handleEvent(st);
  if (view === 'room' || view === 'home') render();
  if (cfgOpen && !st.game && !$('#modal').classList.contains('hidden')) $('#sheet').innerHTML = cfgSheetHtml();
});
socket.on('kicked', () => { S = null; toast('你已被房主移出房間'); go('home'); });
socket.on('dissolved', () => { S = null; toast('房間已解散'); go('home'); });
const emit = (ev, data) => new Promise((res) => socket.emit(ev, data, (r) => { if (r && r.error) toast(r.error); if (r && r.dissolved) { S = null; go('home'); } res(r || {}); }));
const act = (type, data) => emit('act', { type, data });

// ================= helpers =================
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600); }
let modalLock = false;
function openModal(html, onMount, lock) { modalLock = !!lock; $('#sheet').innerHTML = html; $('#modal').classList.remove('hidden'); onMount && onMount($('#sheet')); }
let cfgOpen = false;
function closeModal() { cfgOpen = false; $('#modal').classList.add('hidden'); $('#sheet').innerHTML = ''; modalLock = false; modalQueueNext(); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !modalLock) closeModal(); });
const modalQueue = [];
function queueModal(fn) { if ($('#modal').classList.contains('hidden')) fn(); else modalQueue.push(fn); }
function modalQueueNext() { const f = modalQueue.shift(); if (f) setTimeout(f, 120); }
$('#backBtn').onclick = () => go(view === 'detail' && viewArg && viewArg.from ? viewArg.from : 'home');
function go(v, arg) { view = v; viewArg = arg || null; window.scrollTo(0, 0); render(); }
const people = () => (S && S.game ? S.game.seats : (S ? (S.seats || []).filter(s => !s.empty) : []));
const P = (id, list) => (list || people()).find(x => x && x.id === id) || { name: '?', avatar: 'fox', bg: '#555' };
function photoSrc(p) {
  if (!p) return '/img/av/fox.webp';
  if (p.photoUrl) return p.photoUrl;
  if (p.avatar === 'photo' || (p.avatar && String(p.avatar).startsWith('data:'))) return p.avatar.startsWith('data:') ? p.avatar : '/api/avatar/' + (p.id || '');
  const key = migrateAvatar(p.avatar);
  return key === 'photo' ? (p.photoUrl || '') : `/img/av/${key}.webp`;
}
function pendantHtml(p) {
  const k = (p && p.pendant) || 'none'; if (k === 'none') return '';
  if (PD_IMG[k]) return `<img class="pimg ${k}" src="/img/pd/${k}.webp" alt="">`;
  if (k === 'wings') return `<span class="pendant wings">✨<span></span>✨</span>`;
  return `<span class="pendant ${k}">${PENDANT_ICON[k] || ''}</span>`;
}
function av(p, size = 36) {
  return `<span class="av-wrap"><span class="av s${size}" style="width:${size}px;height:${size}px;background:${esc((p && p.bg) || '#f3d9a4')}"><img src="${esc(photoSrc(p))}" alt="" width="${size}" height="${size}" decoding="async"></span>${pendantHtml(p)}</span>`;
}
const chip = (id, list) => { const p = P(id, list); return `<span class="chip">${av(p, 22)}${esc(p.name)}</span>`; };
const fmtTime = (t) => { const d = new Date(t); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
let PUBLIC_ORIGIN = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) ? 'https://avalon-roundtable-10t9.onrender.com' : location.origin;
fetch('/api/config').then(r => r.json()).then(c => { if (c.publicUrl && PUBLIC_ORIGIN !== location.origin) PUBLIC_ORIGIN = c.publicUrl; }).catch(() => {});
const inviteUrl = (code) => `${PUBLIC_ORIGIN}/r/${code}`;
const pct = (w, p) => p ? Math.round(w * 100 / p) : 0;
const playedTotal = () => myStats.played || 0;

// ================= profile =================
function fxUnlocked(k) { const item = FXS.find(x => x[0] === k); return playedTotal() >= (item ? item[2] : 0); }
function pdUnlocked(k) { const item = PENDANTS.find(x => x[0] === k); return playedTotal() >= (item ? item[2] : 0); }
function previewHtml(d) {
  return `<div class="preview-stage ${d.fx && d.fx !== 'none' ? 'enter fx-' + d.fx : ''}">${av(d, 56)}<div class="nm gold" style="position:absolute;bottom:10px">${esc(d.name || '騎士')}</div></div>`;
}
function editProfile(after, startTab) {
  const d = { ...profile }; let tab = startTab || 'avatar';
  const draw = (el) => {
    const sub = d._forceSub || ((d.avatar === 'photo' || (d.avatar && String(d.avatar).startsWith('data:'))) ? 'photo' : 'animal');
    el.innerHTML = `<h2>個人檔案</h2>
      ${previewHtml(d)}
      <div class="small muted" style="margin:4px 0">暱稱（最多 10 字）</div>
      <input class="inp" id="nm" maxlength="10" placeholder="輸入暱稱" value="${esc(d.name)}">
      <div class="seg" style="margin-top:12px"><button data-t="avatar" class="${tab==='avatar'?'sel':''}">頭像</button><button data-t="pendant" class="${tab==='pendant'?'sel':''}">掛件</button><button data-t="fx" class="${tab==='fx'?'sel':''}">入場特效</button></div>
      ${tab==='avatar' ? `
        <div class="seg"><button data-sub="animal" class="${sub==='animal'?'sel':''}">動物頭像</button><button data-sub="photo" class="${sub==='photo'?'sel':''}">上載相片</button></div>
        ${sub==='animal' ? `<div class="agrid">${ANIMALS.map(([k,n]) => `<button data-e="${k}" class="${k===d.avatar?'sel':''}"><div class="cell" style="background:${d.bg}"><img src="/img/av/${k}.webp" alt=""></div><div class="lb">${n}</div></button>`).join('')}</div>
          <div class="small muted" style="margin-top:12px">背景顏色</div><div class="swatches">${BGS.map(c => `<button data-c="${c}" class="${c===d.bg?'sel':''}" style="background:${c}"></button>`).join('')}</div>`
        : `<div class="center" style="margin-top:12px"><label class="btn ghost" style="display:inline-block;width:auto;padding:10px 20px">選擇相片<input id="file" type="file" accept="image/*" hidden></label><div class="small muted" style="margin-top:6px">相片會壓縮保存到你的帳號，歷史記錄也看得到</div></div>`}
      ` : tab==='pendant' ? `<div class="agrid">${PENDANTS.map(([k,n,need]) => `<button data-pd="${k}" class="${d.pendant===k?'sel':''} ${pdUnlocked(k)?'':'off'}"><div class="cell" style="background:${d.bg}">${k==='none'?'—':(PD_IMG[k]?`<img src="/img/pd/${k}.webp" alt="" style="width:80%;height:80%;object-fit:contain">`:PENDANT_ICON[k])}</div><div class="lb">${n}${pdUnlocked(k)?'':` 🔒${need}場`}</div></button>`).join('')}</div>`
      : `<div class="agrid">${FXS.map(([k,n,need]) => `<button data-fx="${k}" class="${d.fx===k?'sel':''} ${fxUnlocked(k)?'':'off'}"><div class="cell" style="background:#1a2550">${k==='none'?'—':({spot:'💡',gold:'✨',spark:'🌟',petals:'🌸',fire:'🔥',lightning:'⚡'}[k]||'')}</div><div class="lb">${n}${fxUnlocked(k)?'':` 🔒${need}場`}</div></button>`).join('')}</div><div class="small muted center" style="margin-top:8px">選擇後可在上方預覽，入座時所有人會看見</div>`}
      <button class="btn" id="ok">儲存到帳號</button>`;
    const nm = $('#nm', el); if (nm) nm.oninput = () => d.name = nm.value;
    $$('[data-t]', el).forEach(b => b.onclick = () => { tab = b.dataset.t; draw(el); });
    $$('[data-sub]', el).forEach(b => b.onclick = () => { if (b.dataset.sub==='animal' && (d.avatar==='photo' || String(d.avatar).startsWith('data:'))) d.avatar='fox'; draw.sub=b.dataset.sub; if (b.dataset.sub==='animal') d._sub='animal'; else d._sub='photo'; tab='avatar'; if (b.dataset.sub==='photo') { /* keep */ } d.__sub=b.dataset.sub; /* redraw with photo tab */ 
      // use closure
    });
    // sub tab: reuse draw by setting d._sub
    $$('[data-sub]', el).forEach(b => b.onclick = () => { d._forceSub = b.dataset.sub; if (b.dataset.sub==='animal' && (d.avatar==='photo'||String(d.avatar||'').startsWith('data:'))) d.avatar='fox'; draw(el); });
    $$('[data-e]', el).forEach(b => b.onclick = () => { d.avatar = b.dataset.e; d._forceSub='animal'; draw(el); });
    $$('[data-c]', el).forEach(b => b.onclick = () => { d.bg = b.dataset.c; draw(el); });
    $$('[data-fx]', el).forEach(b => b.onclick = () => { if (!fxUnlocked(b.dataset.fx)) return toast('再玩多幾場即可解鎖此外觀'); d.fx = b.dataset.fx; draw(el); });
    $$('[data-pd]', el).forEach(b => b.onclick = () => { if (!pdUnlocked(b.dataset.pd)) return toast('再玩多幾場即可解鎖此掛件'); d.pendant = b.dataset.pd; draw(el); });
    const f = $('#file', el); if (f) f.onchange = () => { const file = f.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const s = Math.min(im.width, im.height);
      x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 256, 256); d.avatar = 'photo'; d._photo = c.toDataURL('image/jpeg', 0.8); d._forceSub='photo'; draw(el);
      // show preview using data url
      profile._tmp = d._photo;
    }; im.src = r.result; }; r.readAsDataURL(file); };
    if (d._photo && (d.avatar==='photo')) { const img = el.querySelector('.preview-stage img'); if (img) img.src = d._photo; }
    $('#ok', el).onclick = async () => {
      const n = Array.from((d.name || '').trim()).slice(0, 10).join(''); if (!n) return toast('請輸入暱稱');
      if ((d._forceSub==='photo' || d.avatar==='photo') && !d._photo && d.avatar!=='photo') return toast('請選擇相片');
      try {
        await ensureSession();
        const body = { name: n, bg: d.bg, fx: d.fx, pendant: d.pendant, skins: skinSel };
        if (d._photo) body.photo = d._photo;
        else body.avatar = migrateAvatar(d.avatar) === 'photo' ? undefined : migrateAvatar(d.avatar);
        const r = await api('/api/me', { method: 'PUT', body: JSON.stringify(body) });
        applyUser(r.user); socket.emit('profile', {}); closeModal(); render(); after && after(); toast('已永久保存');
      } catch (e) { toast(e.message || '儲存失敗'); }
    };
  };
  // fix sub tab detection
  const _draw = draw;
  const wrapped = (el) => {
    const orig = d._forceSub;
    // monkeypatch photoSrc for preview of data url
    const prevPhotoSrc = photoSrc;
    if (d._photo) { const p = photoSrc; window.__tmpPhoto = d._photo; }
    _draw(el);
  };
  openModal('', draw);
}
function ensureName(fn) { if (profile.name) fn(); else editProfile(fn); }
async function createRoom() { await ensureSession(); const r = await emit('create'); if (r.room) go('room'); }
async function joinRoom(code) { await ensureSession(); const r = await emit('join', { code }); if (r.room) { closeModal(); go('room'); } }
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
    const sh = $('#sh', el); if (sh) sh.onclick = () => navigator.share({ title: '旺角阿瓦隆', text: `入房玩旺角阿瓦隆！房間號 ${S.code}`, url }).catch(() => {});
  });
}
function authDialog(mode) {
  openModal(`<h2>${mode==='login'?'登入帳號':'註冊帳號'}</h2>
    <div class="small muted">帳號 2–10 字，密碼或 4–6 位 PIN。登入後換機也能找回頭像、戰績與皮膚。</div>
    <input class="inp" id="un" maxlength="10" placeholder="帳號" style="margin-top:10px">
    <input class="inp" id="pw" type="password" maxlength="64" placeholder="密碼或 PIN" style="margin-top:8px">
    <button class="btn" id="ok">${mode==='login'?'登入':'註冊並綁定此訪客資料'}</button>
    <button class="btn ghost" id="sw">${mode==='login'?'沒有帳號？改為註冊':'已有帳號？改為登入'}</button>
    <div class="or"><span>或</span></div>
    <button class="btn gbtn" id="gg"><svg viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> 使用 Google 登入</button>
    <div class="tiny muted center" style="margin-top:6px">用 Google 登入會綁定你目前的訪客資料（戰績、頭像會保留）</div>`, (el) => {
    $('#gg', el).onclick = () => googleLogin();
    $('#ok', el).onclick = async () => {
      try {
        await ensureSession();
        const r = await api(mode==='login'?'/api/auth/login':'/api/auth/register', { method:'POST', body: JSON.stringify({ username: $('#un',el).value, password: $('#pw',el).value, guestKey: LS.getItem('cc.pid') }) });
        token = r.token; LS.setItem('cc.token', token); applyUser(r.user, r.stats);
        socket.emit('hello', { token, guestKey: LS.getItem('cc.pid'), ...profile }, () => {});
        closeModal(); render(); toast(mode==='login'?'歡迎回來':'帳號已建立，資料會永久保存');
      } catch (e) { toast(e.message); }
    };
    $('#sw', el).onclick = () => authDialog(mode==='login'?'register':'login');
  });
}
async function googleLogin() {
  try {
    const cfg = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
    if (!cfg.google) return toast('Google 登入即將開放（伺服器尚未設定）');
    await ensureSession();
    const r = await api('/api/auth/google/start', { method: 'POST', body: JSON.stringify({ room: S && S.code || '' }) });
    if (r.url) location.href = r.url;
  } catch (e) { toast(e.message || 'Google 登入失敗'); }
}
async function doLogout() { try { await api('/api/auth/logout', { method:'POST' }); } catch(e){} token=''; LS.removeItem('cc.token'); account=null; await ensureSession(); socket.emit('hello', { token, guestKey: LS.getItem('cc.pid'), ...profile }, ()=>{}); render(); toast('已登出，現為訪客'); }

// ================= components =================
function roomHead() {
  if (!S) return '';
  const n = S.capacity, x = S.seated, r = S.readyCount;
  return `<div class="rhead">
    <div class="rh-row"><button class="rpill" data-a="copycode">房間 <b>${S.code}</b> <span class="cpy">⧉</span></button><span class="grow"></span>
      <button class="rbtn" data-a="invite">邀請</button><button class="rbtn" data-a="menu" aria-label="更多">•••</button></div>
    <div class="rh-sub">等待開局 · 就座 ${x}/${n} · 準備 ${r}/${x}<span class="grow"></span>${S.mySeat ? `${S.mySeat}號座` : '未就座'}${S.isHost ? ' · 👑 房主' : ''}</div>
  </div>`;
}
function presetCard(pr) {
  if (!pr) return '';
  const g = (pr.good||[]).map(k => RN[k]||k);
  const e = (pr.evil||[]).map(k => RN[k]||k);
  const gc = g.filter(x=>x==='忠臣').length, ec = e.filter(x=>x==='爪牙').length;
  const gl = g.filter(x=>x!=='忠臣'); if (gc) gl.push(`忠臣×${gc}`);
  const el = e.filter(x=>x!=='爪牙'); if (ec) el.push(`爪牙×${ec}`);
  return `<div class="preset"><div class="blue"><b>藍方 ${pr.good.length}</b>${gl.map(v => `<span class="pill">${v}</span>`).join('')}</div><div class="red"><b>紅方 ${pr.evil.length}</b>${el.map(v => `<span class="pill">${v}</span>`).join('')}</div></div>`;
}
function roleFace(role, skin = 'classic', small) {
  const r = ROLE[role] || { n: RN[role], side: (role||'').includes('evil')?'evil':'good', en: '' };
  let art = ROLE_ART[role] || role;
  if (OUTFIT_ROLES.includes(role) && (skin === 'casual' || skin === 'festive')) art = `${role}_${skin}`;
  return `<div class="rc ${r.side||'good'} sk-${skin}"><div class="art" style="background-image:url(${img(art)})"></div>
    <div class="cap">${small ? `<div class="rn" style="font-size:13px;letter-spacing:1px">${r.n||RN[role]}</div>` : `<div class="side">${(r.side==='good') ? '亞瑟的忠誠陣營' : '莫德雷德的爪牙陣營'}</div><div class="rn">${r.n||RN[role]||''}</div><div class="en">${r.en||''}</div>`}</div></div>`;
}

function knowRing(items, o) {
  const n = items.length; const R = 40;
  const seats = items.map((it, i) => {
    const a = (-90 + i * 360 / n) * Math.PI / 180; const x = 50 + R * Math.cos(a), y = 50 + R * Math.sin(a);
    let circ, lbl, cls = '';
    if (it.me) { circ = `<div class="kc me" style="background-image:url(${thumb(it.art)})"></div>`; lbl = '<span class="kl me">你</span>'; }
    else if (o.reveal && it.real) { cls = it.kind === 'u' ? 'faded' : ''; circ = `<div class="kc real ${it.real.side}" style="background-image:url(${thumb(it.real.art)})"></div>`; lbl = `<span class="kl ${it.real.side === 'good' ? 'g' : 'e'}">${esc(it.real.n)}</span>`; }
    else if (it.kind === 'e') { circ = '<div class="kc e">💀</div>'; lbl = `<span class="kl e">${esc(it.label)}</span>`; }
    else if (it.kind === 'p') { circ = '<div class="kc p">✨</div>'; lbl = `<span class="kl p">${esc(it.label)}</span>`; }
    else { circ = '<div class="kc u">?</div>'; lbl = '<span class="kl u">?</span>'; }
    return `<div class="ks ${cls}" style="left:${x}%;top:${y}%">${circ}${lbl}${it.name && !it.me ? `<span class="kn">${esc(it.name)}</span>` : ''}</div>`;
  }).join('');
  return `<div class="kring"><div class="kcen"><span class="tiny">你係</span><b class="${o.side}">${esc(o.role)}</b><span class="tiny">睇到 ${o.n} 人</span></div>${seats}</div>`;
}
function roundTable(seats, o = {}) {
  const n = seats.length; const R = n > 8 ? 42 : n > 10 ? 40 : 40;
  const st = seats.map((s, i) => {
    const a = (-90 + i * 360 / n) * Math.PI / 180; const x = 50 + R * Math.cos(a), y = 50 + R * Math.sin(a);
    const seatNo = (s && s.seat) || (i + 1);
    if (!s || s.empty) {
      return `<div class="st empty click" style="left:${x}%;top:${y}%" data-a="sit" data-seat="${seatNo}"><span class="no">${seatNo}</span><div class="av-empty">+</div><div class="nm">空位</div></div>`;
    }
    const cls = (o.cls ? o.cls(s, i) : '') + (o.click && o.click(s, i) ? ' click' : '') + (enterIds.has(s.id) ? ` enter fx-${s.fx || 'spot'}` : '');
    const action = o.action || 'sel';
    const extra = o.click && o.click(s, i) ? `data-a="${action}" data-id="${s.id}"` : (o.seatClick ? `data-a="${o.seatClick}" data-id="${s.id}" data-seat="${seatNo}"` : '');
    return `<div class="st ${cls}" style="left:${x}%;top:${y}%" ${extra}>
      <span class="no">${seatNo}</span><div class="mk">${o.marker ? o.marker(s, i) : ''}</div>${av(s, 44)}${o.label ? o.label(s, i) : ''}<div class="nm">${esc(s.name)}</div></div>`;
  }).join('');
  return `<div class="rt"><div class="table"><div class="ctr">${o.center || ''}</div></div>${st}</div>`;
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
  else if (ev.type === 'quest') {
    queueModal(() => showQuest(ev));
    const sp = st.game && st.game.me && st.game.me.swordPrivate;
    if (sp) queueModal(() => openModal(`<h2>王者之劍（僅你可見）</h2><p class="center">${esc(P(sp.target).name)} 原本出的是 <b>${sp.original?'成功':'失敗'}</b>，已被你翻轉。</p><button class="btn" id="ok">知道了</button>`, el => $('#ok',el).onclick=closeModal));
    if (ev.lance) queueModal(() => showLance(ev.lance));
  }
  else if (ev.type === 'lady') queueModal(() => showLady(ev));
  else if (ev.type === 'veto') queueModal(() => openModal(`<h2>回避卡</h2><p class="center">${esc(ev.name||'一位騎士')} 使用回避卡退出隊伍，本輪否決不增加，隊長需重新組隊。</p><button class="btn" id="ok">知道了</button>`, el => $('#ok',el).onclick=closeModal));
  else if (ev.type === 'end') { if (ev.prev) queueModal(() => showVote(ev.prev)); queueModal(showEnd); }
  else if (ev.type === 'abort') toast('房主已結束本局');
  else if (ev.type === 'earlyassassin') queueModal(() => openModal(`<div class="center"><div class="big">🗡️</div><h2 class="result-evil">提前刺殺！</h2><p>${esc(ev.name || '刺客')} 發動提前刺殺，紅方已亮明身份（奧伯倫除外）。<br>刺客正在選擇目標：刺中梅林紅方勝，刺錯藍方勝。</p></div><button class="btn" id="ok">知道了</button>`, el => $('#ok', el).onclick = closeModal));
  else if (ev.type === 'host') toast(ev.id === st.meId ? '你現在是房主 👑' : `${ev.name} 成為新房主 👑`);
  if (ev.type === 'quest' && ev.then === 'end') queueModal(showEnd);
}
function showLance(L) {
  openModal(`<h2>蘭斯洛特忠誠牌</h2><div class="big">${L.card==='switch'?'🔄':'🛡️'}</div>
    <h2 class="${L.card==='switch'?'result-evil':'result-good'}">${L.card==='switch'?'陣營互換！':'本輪不變'}</h2>
    <p class="center muted small">兩位蘭斯洛特${L.switched?'此刻已互換陣營':'維持原先陣營'}。這個資訊對所有人公開。</p>
    <button class="btn" id="ok">繼續</button>`, el => $('#ok',el).onclick=closeModal);
}
const ROLE_INFO = {
  merlin: '你看得到所有壞人（莫德雷德除外）。派西維爾會看到你（與莫甘娜一起）。小心別被刺客發現！',
  percival: '你會看到梅林和莫甘娜，但分不出誰是誰。保護真正的梅林。',
  servant: '你沒有特殊資訊，靠投票與任務記錄推理出壞人。',
  lancelot_good: '你知道另一位蘭斯洛特是誰。忠誠牌可能讓你們互換陣營；你即使是好人也可以出失敗卡。',
  assassin: '你知道壞人隊友（奧伯倫除外）。梅林看得到你。好人完成三個任務後，由你刺殺梅林翻盤。',
  morgana: '梅林看得到你是壞人；你知道壞人隊友；派西維爾會把你和梅林一起看到，請假扮梅林。',
  mordred: '梅林看不到你！你知道壞人隊友（奧伯倫除外）。',
  oberon: '梅林可以看到你是壞人；你同隊友互相唔知。',
  minion: '你知道壞人隊友（奧伯倫除外）。梅林看得到你。',
  lancelot_evil: '你知道另一位蘭斯洛特是誰。忠誠牌可能讓你們互換陣營。',
};
function showRole(first) {
  const g = S && S.game; const me = g && g.me; if (!me) return;
  const r = ROLE[me.role] || {}; const side = me.side || r.side;
  const seatNo = (id) => g.seats.findIndex(s => s.id === id) + 1;
  const mates = (me.knows || []).map(k => { const p = P(k.id, g.seats); return `<div class="mate">${av(p, 40)}<div class="grow"><b>${esc(p.name)}</b><div class="tiny muted">${esc(k.label)}</div></div><span class="seatpill ${k.label.includes('壞') ? 'e' : ''}">${seatNo(k.id)}號</span></div>`; }).join('');
  const ladyMine = (g.ladyLog || []).filter(l => l.side && l.holder === S.meId).map(l => { const p = P(l.target, g.seats); return `<div class="mate">${av(p, 34)}<div class="grow"><b>${esc(p.name)}</b><div class="tiny muted">第 ${l.round + 1} 輪後查驗</div></div><span class="seatpill ${l.side === 'evil' ? 'e' : ''}">${seatNo(l.target)}號 · ${l.side === 'good' ? '好人' : '壞人'}</span></div>`; }).join('');
  const kmap = {}; (me.knows || []).forEach(k => { kmap[k.id] = k.label; });
  const special = !['servant', 'minion'].includes(me.role);
  let art = ROLE_ART[me.role] || me.role; const sk = skinOf(me.role);
  if (OUTFIT_ROLES.includes(me.role) && (sk === 'casual' || sk === 'festive')) art = `${me.role}_${sk}`;
  const cb = cardBackOf();
  openModal(`<div class="reveal ${side} ${special ? 'special' : ''}"><div class="rv-h">你的身份是</div>
    <div class="rv-stage"><div class="rays"></div><canvas class="fxc" id="fxc"></canvas>
    <div class="flip" id="flip"><div class="in"><div class="face back" style="background-image:url(${img(cb)})"><div class="hint">👉 點擊卡片翻開</div></div>
      <div class="face front"><div class="rcard ${side}"><div class="strip"></div><div class="rart" style="background-image:url(${img(art)})"></div>
        <div class="rname">${r.n || me.roleName}</div><span class="teampill ${side}">${side === 'good' ? '藍方' : '紅方'}</span></div></div></div></div></div>
    <div id="kn" class="hidden">
      <div class="rinfo">${ROLE_INFO[me.role] || r.d || ''}${g.lanceSwitched !== undefined && me.side !== r.side ? '<br><b>注意：蘭斯洛特已互換陣營</b>' : ''}</div>
      ${mates ? `<div class="matepanel"><div class="mp-h">${side === 'evil' ? '可看到的隊友' : '可看到的人物'}</div>${mates}</div>` : ''}
      <div class="matepanel"><div class="mp-h">你開局睇到嘅人</div>${knowRing(g.seats.map(s => s.id === S.meId ? { me: true, art } : (kmap[s.id] ? { kind: /梅林/.test(kmap[s.id]) ? 'p' : (/壞|同伴|隊友/.test(kmap[s.id]) ? 'e' : 'p'), label: kmap[s.id], name: s.name } : { kind: 'u', name: s.name })), { role: r.n || me.roleName, side, n: Object.keys(kmap).length })}<div class="tiny muted center" style="margin-top:6px">灰色「?」= 你睇唔到佢嘅身份</div></div>
      ${ladyMine ? `<div class="matepanel"><div class="mp-h">🌊 湖中仙女查驗結果</div>${ladyMine}</div>` : ''}
    </div>
    <div class="cover" id="cov">翻開前請確認旁邊沒有人偷看</div>
    ${!first && me.role === 'assassin' && !['end', 'assassin'].includes(g.phase) ? '<button class="btn evil big" id="early">🗡️ 提前刺殺</button>' : ''}
    <button class="btn big" id="ok">我記住了</button></div>`, (el) => {
    const eb = $('#early', el); if (eb) eb.onclick = () => { if (!confirm('確定提前刺殺？\n紅方會即時亮明身份（奧伯倫除外），你要喺圓桌上揀一位玩家刺殺：刺中梅林紅方即勝，刺錯藍方即勝。')) return; closeModal(); act('earlyassassin'); };
    const f = $('#flip', el); const rv = $('.reveal', el);
    f.onclick = () => { f.classList.toggle('on'); const on = f.classList.contains('on'); rv.classList.toggle('opened', on); $('#kn', el).classList.toggle('hidden', !on); $('#cov', el).classList.toggle('hidden', on); if (on) burst($('#fxc', el), side); };
    $('#ok', el).onclick = closeModal;
  }, !!first);
}
function burst(cv, side) {
  if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = cv.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = r.height * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr); const cx = r.width / 2, cy = r.height / 2; const good = side === 'good';
  const ps = Array.from({ length: good ? 90 : 70 }, () => { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * (good ? 6 : 3.5);
    return { x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (good ? 0 : 1.2), life: 1, sz: good ? 1.5 + Math.random() * 3 : 4 + Math.random() * 10, hue: good ? 42 + Math.random() * 15 : 350 + Math.random() * 20 }; });
  const t0 = performance.now();
  const step = (t) => {
    const k = (t - t0) / 1500; x.clearRect(0, 0, r.width, r.height); if (k > 1) return;
    if (k < 0.25) { const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r.width * 0.7); gr.addColorStop(0, `rgba(255,${good ? 240 : 190},${good ? 190 : 170},${0.8 * (1 - k * 4)})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, r.width, r.height); }
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy = p.vy * 0.97 + (good ? 0.05 : -0.04); p.life = 1 - k;
      x.globalAlpha = Math.max(0, p.life); x.fillStyle = good ? `hsl(${p.hue},95%,${60 + Math.random() * 25}%)` : `hsla(${p.hue},80%,${35 + Math.random() * 20}%,.7)`;
      x.beginPath(); if (good) { const s = p.sz; x.moveTo(p.x, p.y - s * 2); x.lineTo(p.x + s * .6, p.y - s * .6); x.lineTo(p.x + s * 2, p.y); x.lineTo(p.x + s * .6, p.y + s * .6); x.lineTo(p.x, p.y + s * 2); x.lineTo(p.x - s * .6, p.y + s * .6); x.lineTo(p.x - s * 2, p.y); x.lineTo(p.x - s * .6, p.y - s * .6); } else x.arc(p.x, p.y, p.sz * (0.6 + k), 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = 1; requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
  const sub = ev.fails === 0 ? '全部係成功牌' : `${ev.fails} 張失敗牌${ev.success ? '（本輪需要 2 張失敗先算失敗）' : ''}`;
  openModal(`<div class="qreveal"><div class="qr-h">第 ${ev.round + 1} 個任務 · 結果揭曉</div><div class="qr-sub">牌已打亂，睇唔到係邊個出</div>
    <div class="qr-cards">${cards.map(c => `<div class="qc"><div class="qci"><div class="f b"><span>?</span></div><div class="f fr ${c ? 'ok' : 'ng'}"><img src="/img/${c ? 'q_success' : 'q_fail'}.webp" alt=""><b>${c ? '成功' : '失敗'}</b></div></div></div>`).join('')}</div>
    <div class="qr-res ${ev.success ? 'ok' : 'ng'}" id="tl"><div class="t">${ev.success ? '任務成功' : '任務失敗'}</div><div class="s">${sub}</div></div>
    <button class="btn big" id="ok">繼續</button></div>`, async (el) => {
    $('#ok', el).onclick = closeModal;
    const cs = $$('.qc', el); await sleep(700);
    for (let i = 0; i < cs.length; i++) {
      const last = i === cs.length - 1;
      if (last && cs.length > 1) { cs[i].classList.add('tense'); await sleep(1100); cs[i].classList.remove('tense'); }
      cs[i].classList.add('on'); if (navigator.vibrate && !cards[i]) navigator.vibrate(60);
      await sleep(last ? 500 : 800);
    }
    const t = $('#tl', el); t && t.classList.add('on');
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
  const sn = (id) => g.seats.findIndex(s => s.id === id) + 1; const mer = g.seats.find(s => s.role === 'merlin'); const tgt = g.assassinTarget && g.seats.find(s => s.id === g.assassinTarget);
  const atLine = tgt ? `刺殺目標係 ${sn(tgt.id)}號${(ROLE[tgt.role] || {}).n || ''}，梅林係 ${mer ? sn(mer.id) : '?'}號` : '';
  const qrows = g.quests.map((q, i) => q ? `<div class="qrow"><b>任務${i + 1}</b><span class="qm">${q.team.map(id => `<span class="seatpill ${(g.seats.find(s => s.id === id) || {}).side === 'evil' ? 'e' : ''}">${sn(id)}</span>`).join('')}</span><span class="badge ${q.success ? 'good' : 'evil'}">${q.success ? '成功' : '失敗'}</span></div>` : '').join('');
  openModal(`<div class="banner ${g.winner}"><div class="big">${g.winner === 'none' ? '🏳️' : goodWin ? '🛡️' : '🗡️'}</div><h2>${g.winner === 'none' ? '提前結束' : goodWin ? '藍方勝利' : '紅方勝利'}</h2><div class="small">${g.winner === 'none' ? '房主提前結束本局 · 不計勝負、不計分、不派回避卡' : esc(g.reason)}</div>${atLine ? `<div class="small" style="margin-top:4px"><b>${atLine}</b></div>` : ''}</div>
    ${roundTable(g.seats, { cls: s => s.side === 'evil' ? 'evil-tint' : '', label: s => `<span class="lbl ${s.side === 'good' ? 'g' : 'e'}">${ROLE[s.role].n}</span>`, marker: s => (s.id === S.hostId ? '👑' : '') + (s.id === g.assassinTarget ? '🎯' : '') + (s.id === g.mvp ? '🏅' : ''), center: `<b>${goodWin ? '好人勝' : '壞人勝'}</b>${g.quests.map(q => q ? (q.success ? '🔵' : '🔴') : '⚪').join('')}` })}
    <div class="qrows">${qrows}</div>
    <div class="btns"><button class="btn" id="sh">📤 分享戰果</button><button class="btn ghost" id="pp">🖼️ 生成海報</button></div>
    <button class="btn dark" id="ok">查看對局詳情</button>`, (el) => { const rec = liveRecord(g); window.__lastRecord = rec; $('#sh', el).onclick = () => shareSheet(rec); $('#pp', el).onclick = () => saveCard(rec, true); $('#ok', el).onclick = () => { closeModal(); setTimeout(() => { const d = $('#detail'); d && d.scrollIntoView({ behavior: 'smooth' }); }, 100); }; });
}

// ================= views =================
// ---- tiny DOM morph: patch only what changed (keeps images/animations, avoids full re-render jank) ----
function morphAttrs(a, b) {
  for (const { name } of Array.from(a.attributes)) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of Array.from(b.attributes)) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
}
function morphChildren(a, b) {
  const an = a.childNodes, bn = Array.from(b.childNodes);
  for (let i = 0; i < bn.length; i++) {
    const x = an[i], y = bn[i];
    if (!x) { a.appendChild(y); continue; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName || (x.nodeType === 1 && (x.dataset.id || '') !== (y.dataset.id || ''))) { a.replaceChild(y, x); continue; }
    if (x.nodeType === 3 || x.nodeType === 8) { if (x.data !== y.data) x.data = y.data; continue; }
    if (x.tagName === 'CANVAS') { a.replaceChild(y, x); continue; }
    morphAttrs(x, y);
    if ((x.tagName === 'INPUT' || x.tagName === 'TEXTAREA') && document.activeElement === x) continue;
    morphChildren(x, y);
  }
  while (an.length > bn.length) a.removeChild(a.lastChild);
}
function setHTML(el, html) {
  if (el._html === html) return false;
  el._html = html;
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  if (!el.firstChild) el.appendChild(tpl.content); else morphChildren(el, tpl.content);
  return true;
}
function render() {
  const app = $('#app'); const inRoom = S && S.code;
  if (view === 'room' && !inRoom) view = 'home';
  $('#backBtn').classList.toggle('hidden', view === 'home');
  $('#topTitle').textContent = { home: '旺角阿瓦隆', room: inRoom ? `圓桌 ${S.code}` : '房間', history: '歷史記錄', stats: '數據統計', rules: '規則介紹', skins: '角色皮膚', detail: '對局詳情', ach: '成就' }[view];
  if (view !== 'home' && view !== 'room') app._html = null;
  if (view === 'home') setHTML(app, homeHtml());
  else if (view === 'room') {
    const before = {}; $$('.rt .st[data-id]').forEach(e => { const r = e.getBoundingClientRect(); before[e.dataset.id] = [r.left, r.top]; });
    setHTML(app, S.game ? gameHtml() : lobbyHtml()); enterIds.clear();
    if (!S.game) $$('.rt .st[data-id]').forEach(e => {
      const b = before[e.dataset.id]; if (!b) return; const r = e.getBoundingClientRect(); const dx = b[0] - r.left, dy = b[1] - r.top;
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      e.style.transition = 'none'; e.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; e.style.zIndex = 5;
      requestAnimationFrame(() => requestAnimationFrame(() => { e.style.transition = 'transform .55s cubic-bezier(.3,1.3,.5,1)'; e.style.transform = ''; setTimeout(() => { e.style.zIndex = ''; e.style.transition = ''; }, 600); }));
    });
  }
  else if (view === 'rules') { app.innerHTML = rulesHtml(); mountRules(); }
  else if (view === 'history') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadHistory(); }
  else if (view === 'stats') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadStats(); }
  else if (view === 'ach') { app.innerHTML = '<div class="card center muted">載入中…</div>'; refreshStats().catch(() => {}).then(() => { if (view === 'ach') app.innerHTML = achHtml(); }); }
  else if (view === 'skins') { app.innerHTML = '<div class="card center muted">載入中…</div>'; refreshStats().then(() => { if (view === 'skins') app.innerHTML = skinsHtml(); }); }
  else if (view === 'detail') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadDetail(viewArg.gid); }
}
function homeHtml() {
  const inRoom = S && S.code;
  const vc = account ? account.vetoCards : null;
  return `<div class="hero sm">${LOGO}<h1>旺角阿瓦隆</h1><div class="en">MONGKOK AVALON</div></div>
  <div class="card prof-head">
    <div class="row" data-a="profile" style="cursor:pointer">${av(profile, 60)}
      <div class="grow"><div class="name">${profile.name ? esc(profile.name) : '未設定暱稱'}</div><div class="muted small">${myStats.played || 0} 場 · 勝率 ${pct(myStats.won, myStats.played)}%${vc != null ? ` · 🛡️ 回避卡 ${vc}/10` : ''}</div></div></div>
    <div class="row" style="gap:8px;margin-top:10px"><button class="btn sm ghost" data-a="profile">✎ 編輯檔案</button><button class="btn sm ghost" data-a="ptab" data-t="pendant">🎀 頭像掛件</button></div>
    <div class="acct">${account && (account.username || account.google) ? `<div class="row between"><div class="small">已登入 <b>${esc(account.username || account.email || 'Google 帳號')}</b>${account.google ? ' <span class="badge">Google</span>' : ''}</div><button class="btn sm dark" data-a="logout">登出</button></div>` : `<div class="tiny muted">目前是訪客。註冊或用 Google 登入後，資料永久保存、換機也能找回。</div><div class="btns"><button class="btn sm" data-a="register">註冊帳號</button><button class="btn sm ghost" data-a="login">登入</button></div>`}</div>
  </div>
  ${inRoom ? `<div class="card"><div class="row between"><div><span class="code">${S.code}</span>${S.isHost ? '<span class="badge">👑 房主</span>' : ''}<div class="muted small">就座 ${S.seated}/${S.capacity} · ${S.game ? (S.game.phase === 'end' ? '已結束' : '遊戲中') : '等待開局'}</div></div><button class="btn sm" data-a="toroom">回到房間</button></div></div>` : ''}
  <div class="bigcards">
    <div class="bigcard create" data-a="create"><div class="ic">⚔️</div><b>建立房間</b><span>我做房主</span></div>
    <div class="bigcard join" data-a="join"><div class="ic">🛡️</div><b>加入房間</b><span>輸入 4 位房間號</span></div>
  </div>
  <div class="card menu" style="margin-top:14px">
    <div class="item" data-a="go" data-v="history"><span class="ic">📜</span><span class="grow">歷史記錄</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="stats"><span class="ic">📊</span><span class="grow">數據統計</span><span class="chev">›</span></div>
    <div class="item" data-a="ptab" data-t="avatar"><span class="ic">🦊</span><span class="grow">我的頭像</span><span class="chev">›</span></div>
    <div class="item" data-a="ptab" data-t="fx"><span class="ic">✨</span><span class="grow">我的入場特效</span><span class="chev">›</span></div>
    <div class="item" data-a="ptab" data-t="pendant"><span class="ic">🎀</span><span class="grow">頭像掛件</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="skins"><span class="ic">🎴</span><span class="grow">角色皮膚</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="ach"><span class="ic">🏆</span><span class="grow">成就</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="rules"><span class="ic">📖</span><span class="grow">規則介紹</span><span class="chev">›</span></div>
    <div class="item" data-a="about"><span class="ic">ℹ️</span><span class="grow">版本</span><span class="muted small">v3.1</span><span class="chev">›</span></div>
  </div>
  <div class="footer"><span class="credit">旺角阿瓦隆 · by Amigosparty · v3.1</span><br><span class="credit2">Design by Teddy Design Limited</span></div>`;
}
const ACHS = [
  ['first', '初入圓桌', '完成第 1 場遊戲', s => s.played >= 1],
  ['ten', '圓桌常客', '完成 10 場遊戲', s => s.played >= 10],
  ['win1', '首勝', '贏得第 1 場', s => s.won >= 1],
  ['win10', '常勝騎士', '累積 10 場勝利', s => s.won >= 10],
  ['mvp', '全場最佳', '獲得一次 MVP', s => (s.mvp || 0) >= 1],
  ['merlin', '智者', '以梅林身份獲勝', s => ((s.roles || {}).merlin || {}).won >= 1],
  ['assassin', '暗影之刃', '以刺客身份獲勝', s => ((s.roles || {}).assassin || {}).won >= 1],
  ['allroles', '千面騎士', '玩過 6 種不同角色', s => Object.keys(s.roles || {}).length >= 6],
];
function achHtml() {
  const s = myStats || {}; const got = ACHS.filter(a => a[3](s)).length;
  return `<div class="card"><h3>成就 ${got}/${ACHS.length}</h3><div class="bar"><i style="width:${pct(got, ACHS.length)}%"></i></div></div>` +
    `<div class="card ach">${ACHS.map(([k, n, d, f]) => `<div class="ach-i ${f(s) ? 'on' : ''}"><span class="medal">${f(s) ? '🏅' : '🔒'}</span><div><b>${n}</b><div class="tiny muted">${d}</div></div></div>`).join('')}</div>`;
}
function expStatus(s) {
  return [['蘭斯洛特', s.lancelot], ['湖中仙女', s.lady], ['王者之劍', s.excalibur], ['回避卡', s.veto]]
    .map(([n, on]) => `<span class="xp ${on ? 'on' : ''}">${n}<i>${on ? '已開啟' : '未開啟'}</i></span>`).join('');
}
function cfgSheetHtml() {
  if (!S) return '';
  const n = S.capacity, s = S.settings, host = S.isHost; const dis = host ? '' : 'disabled';
  const tg = (k, title, desc, icon) => `<div class="toggle">${icon || ''}<div class="grow"><b>${title}</b><div class="muted small">${desc}</div></div><button class="sw ${s[k] ? 'on' : ''}" data-a="tg" data-k="${k}" ${dis}></button></div>`;
  return `<h2>${n} 人局設定</h2>${host ? '' : '<div class="center small muted">由房主設定，所有人即時同步</div>'}
    <div class="small muted" style="margin-top:6px">玩家人數</div>
    <div class="nums">${[5,6,7,8,9,10,11,12].map(k => `<button data-a="cap" data-n="${k}" class="${k === n ? 'sel' : ''}" ${dis}>${k}</button>`).join('')}</div>
    ${presetCard(S.preset)}
    <div class="tiny muted" style="margin-top:6px">任務人數：${(S.teamSizes || []).join(' / ')}${n >= 7 ? '（第 4 輪需 2 張失敗）' : ''}　減少人數時，多出座位上的玩家會自動離座</div>
    ${tg('lady', '湖中仙女', '第 2–4 個任務後查驗一人陣營（8 人以上預設開啟）', `<img src="${thumb('lady')}" alt="">`)}
    ${tg('veto', '允許使用回避卡', '投票時可用一張回避卡退出隊伍，不計否決（每贏一局得 1 張，上限 10）')}
    ${tg('excalibur', '王者之劍', '隊長把劍交給隊員，任務後可翻轉一張任務卡')}
    ${tg('lancelot', '蘭斯洛特', '正邪各一，忠誠牌可能互換陣營（11 人以上預設開啟）')}
    <div class="adv"><button class="btn ghost sm" data-a="adv" ${dis}>${s.advanced ? '收起進階角色調整' : '進階：自行調整角色（選用）'}</button></div>
    ${s.advanced ? `<div class="small muted" style="margin-top:8px">進階模式會改寫上方預設陣容</div>${[['percival','派西維爾'],['morgana','莫甘娜'],['mordred','莫德雷德'],['oberon','奧伯倫']].map(([k, nm]) => `<div class="toggle"><div class="grow"><b>${nm}</b></div><button class="sw ${s[k] ? 'on' : ''}" data-a="tg" data-k="${k}" ${dis}></button></div>`).join('')}` : ''}
    <button class="btn" data-a="cfgclose" style="margin-top:12px">完成</button>`;
}
function lobbyHtml() {
  const n = S.capacity, x = S.seated, s = S.settings, host = S.isHost;
  const me = (S.seats || []).find(p => p && p.id === S.meId);
  const vc = S.myVetoCards == null ? (account && account.vetoCards) : S.myVetoCards;
  return `${roomHead()}
  <div class="card" style="padding:10px">${roundTable(S.seats, {
      seatClick: 'seat',
      marker: p => (p.isHost || p.id === S.hostId ? '👑' : '') + (p.ready ? '✅' : ''),
      label: p => p.isHost || p.id === S.hostId ? '<span class="lbl y">房主</span>' : (p.id === S.meId ? '<span class="lbl g">我</span>' : ''),
      center: `<b>${x}/${n} 已就座</b>` })}
    <div class="tiny muted center" style="margin-top:4px">點空位就座 · 點玩家看名片${host ? '或請他離座' : ''}</div></div>
  <div class="card cfgcard" data-a="cfg">
    <div class="row between"><h3 style="margin:0">${n} 人局</h3><span class="small gold">${host ? '調整 ›' : '查看 ›'}</span></div>
    ${presetCard(S.preset)}
    <div class="xps">${expStatus(s)}</div>
  </div>
  <div class="bottombar">${s.veto ? `<div class="veto-ic" data-a="vetoinfo" title="回避卡"><span>🛡️</span><b>${vc == null ? '–' : vc}</b></div>` : `<div class="thumb" data-a="role"></div>`}
    ${host ? `<button class="btn" data-a="start" ${x === n ? '' : 'disabled'}>開始遊戲（${x}/${n}）</button>` :
      S.mySeat ? `<button class="btn ${me && me.ready ? 'ghost' : ''}" data-a="ready">${me && me.ready ? '已準備 ✓' : '準備'}</button>` : `<button class="btn ghost" disabled>請先點空位就座</button>`}
  </div>`;
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
      (me && !me.voted ? `<div class="btns"><button class="btn good" data-a="vote" data-v="1">✓ 贊成</button><button class="btn evil" data-a="vote" data-v="0">✕ 反對</button></div>${me.hasVeto && g.team.includes(meId) ? '<button class="btn ghost" data-a="veto">使用回避卡（退出隊伍）</button>' : ''}` : `<div class="center muted" style="margin-top:10px">你已投${me && me.myVote ? '「贊成」' : '「反對」'}，等待其他騎士…</div>`);
  } else if (g.phase === 'sword') {
    const proposer = (g.rounds[g.round]||[]).slice(-1)[0];
    const amL = proposer && proposer.leader === meId;
    center = `<b>王者之劍</b>隊長授予中`;
    panel = amL ? `<div class="phase">⚔️ 授予王者之劍</div><div class="small muted">點選隊伍中除自己以外的一位隊員持劍。已選：${selCount?esc(P([...selected][0]).name):'無'}</div><button class="btn" data-a="sword" ${selCount===1?'':'disabled'}>交給他</button>`
      : `<div class="phase">⚔️ 王者之劍</div><div class="small muted">等待隊長把劍交給一位隊員</div>`;
  } else if (g.phase === 'swordflip') {
    const amS = g.sword === meId;
    center = `<b>王者之劍</b>持劍者行動`;
    panel = amS ? `<div class="phase">⚔️ 你持有王者之劍</div><div class="small muted">可翻轉另一位隊員的任務卡（你會看到原本是什麼），或不使用。</div><button class="btn" data-a="swordflip" ${selCount===1?'':'disabled'}>翻轉此卡</button><button class="btn ghost" data-a="swordskip">不使用</button>`
      : `<div class="phase">⚔️ 王者之劍</div><div class="small muted">等待 ${chip(g.sword)} 決定是否翻轉一張任務卡</div>`;
  } else if (g.phase === 'quest') {
    const onTeam = g.team.includes(meId);
    center = `<b>任務進行中</b>${g.questDone}/${g.team.length} 已出卡`;
    panel = `<div class="phase">任務進行中</div><div>${g.team.map(id => chip(id)).join('')}</div>${g.twoFailRound === g.round ? '<div class="small result-evil" style="margin-top:6px">本輪需 2 張失敗才算任務失敗</div>' : ''}` +
      (onTeam && !me.questSubmitted ? `<div class="small muted" style="margin-top:6px">秘密選擇你的任務卡：</div><div class="btns"><button class="btn good" data-a="quest" data-v="1">🛡️ 成功</button><button class="btn evil" data-a="quest" data-v="0" ${me.canFail ? '' : 'disabled'}>🗡️ 失敗</button></div>${me.canFail ? '' : '<div class="small muted center" style="margin-top:6px">你只能出「成功」</div>'}`
        : `<div class="center muted" style="margin-top:10px">${onTeam ? '你已交卡，等待其他隊員…' : '等待隊員秘密出卡…'}</div>`);
  } else if (g.phase === 'lady') {
    center = `<b>湖中仙女</b>${esc(P(g.ladyId).name)} 查驗中`;
    panel = isLady ? `<div class="phase">🌊 湖中仙女在你手上</div><div class="small muted">點選一位騎士查驗陣營（不能查驗曾持有仙女的人）。已選：${selCount ? esc(P([...selected][0]).name) : '無'}</div><button class="btn" data-a="lady" ${selCount === 1 ? '' : 'disabled'}>查驗</button>`
      : `<div class="phase">🌊 湖中仙女</div><div class="small muted">${chip(g.ladyId)} 正在選擇查驗對象</div>`;
  } else if (g.phase === 'assassin') {
    const amA = me && me.role === 'assassin'; const as = g.seats.find(s => s.assassin);
    center = g.earlyAssassin ? `<b>刺殺階段</b>紅方已亮明身份` : `<b>刺殺時刻</b>好人已完成 3 個任務`;
    panel = (g.earlyAssassin ? `<div class="phase evilbar">🗡️ 刺殺階段 — 紅方已亮明身份，刺客選擇目標中</div><div class="small muted">刺客 ${as ? chip(as.id) : ''} 發動提前刺殺：刺中梅林紅方即勝，刺錯藍方即勝（奧伯倫仍然隱藏）</div>` : `<div class="phase">🗡️ 刺客的最後一擊</div><div class="small muted">壞人可以公開討論，由刺客 ${as ? chip(as.id) : ''} 指認梅林</div>`) +
      (amA ? `<div class="small muted" style="margin-top:6px">點選目標：${selCount ? esc(P([...selected][0]).name) : '未選'}</div><button class="btn evil" data-a="assassinate" ${selCount === 1 ? '' : 'disabled'}>確認刺殺</button>` : '');
  } else if (g.phase === 'end') {
    center = `<b>${g.winner === 'none' ? '提前結束' : g.winner === 'good' ? '好人勝' : '壞人勝'}</b>${g.quests.map(q => q ? (q.success ? '🔵' : '🔴') : '⚪').join('')}`;
    panel = `${S.isHost ? '<button class="btn" data-a="lobby" style="margin-top:0">🔁 再來一局（保留座位）</button>' : '<div class="center muted small">等待房主開新一局（座位保留）</div>'}`;
  }
  const selectable = (s) => (g.phase === 'team' && isLeader) || (g.phase === 'assassin' && me && me.role === 'assassin' && s.id !== meId && !s.evil) || (g.phase === 'lady' && isLady && s.id !== meId && !g.ladyUsed.includes(s.id)) || (g.phase === 'sword' && isLeader && g.team.includes(s.id) && s.id !== meId) || (g.phase === 'swordflip' && g.sword === meId && g.team.includes(s.id) && s.id !== meId);
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
  ${S.isHost && !ended ? '<button class="btn dark" data-a="abort" style="color:#ff8b9c">強制結束本局</button>' : ''}
  ${me && !ended ? `<button class="myrole-fab" data-a="role" aria-label="我的身份"><span class="mini-back" style="background-image:url(${thumb(cardBackOf())})"></span><span>我的身份</span></button>` : ''}`;
}
function ladyChainHtml(log, seats) {
  if (!log || !log.length) return '';
  return `<div class="small" style="margin-top:12px"><span class="gold">🌊 湖中仙女：</span>${log.map(l => `${esc(P(l.holder, seats).name)} → ${esc(P(l.target, seats).name)}${l.side ? ` <span class="badge ${l.side}">${l.side === 'good' ? '好' : '壞'}</span>` : ''}`).join('　')}</div>`;
}
function liveRecord(g) {
  return { gid: g.gid, winner: g.winner, reason: g.reason, n: g.n, players: g.seats.map((s, i) => ({ ...s, seat: i + 1 })), quests: g.quests, rounds: g.rounds, ladyLog: g.ladyLog, assassinTarget: g.assassinTarget, scores: g.scores || {}, mvp: g.mvp, runnerUp: g.runnerUp, highlights: g.highlights || [], myId: S.meId, room: S.code, endedAt: Date.now() };
}
function detailHtml(r) {
  const seats = r.players; const me = seats.find(s => s.id === r.myId); const sc = r.scores || {};
  const goodWin = r.winner === 'good'; const merlin = seats.find(s => s.role === 'merlin');
  const at = r.assassinTarget && seats.find(s => s.id === r.assassinTarget);
  const mvpBox = (id, t) => { if (!id || !sc[id]) return ''; const p = P(id, seats); return `<div><div class="t">${t}</div>${av(p, 44)}<div style="font-weight:700;margin-top:4px">${esc(p.name)}</div><div class="small"><span class="badge ${ROLE[p.role].side}">${ROLE[p.role].n}</span> <b class="gold">${sc[id].total} 分</b></div><ul>${sc[id].items.map(([l, v]) => `<li>${esc(l)} <b>+${v}</b></li>`).join('')}</ul></div>`; };
  window.__lastRecord = r;
  setTimeout(() => renderCardPreview(r), 30);
  return `<div class="card"><h3>戰果卡</h3><div id="cardprev" class="cardprev"><div class="center muted small">生成中…</div></div>
    <div class="btns"><button class="btn" data-a="savecard">💾 儲存圖片</button><button class="btn ghost" data-a="sharecard">📤 分享</button></div></div>
  <div class="card"><div class="banner ${r.winner}"><div class="tiny" style="letter-spacing:3px;opacity:.8">${r.room ? '房間 ' + esc(r.room) + ' · ' : ''}${r.n} 人局</div><h2>${r.winner === 'none' ? '🏳️ 提前結束' : goodWin ? '🛡️ 亞瑟陣營勝利' : '🗡️ 莫德雷德陣營勝利'}</h2><div class="small">${esc(r.reason)}</div>
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
  const r = await api(`/api/game/${encodeURIComponent(gid)}`).catch(() => null);
  if (view !== 'detail') return;
  $('#app').innerHTML = r && !r.error ? detailHtml(r) : '<div class="card center muted">找不到此對局</div>';
}
async function loadHistory() {
  const list = await api('/api/history').catch(() => []);
  if (view !== 'history') return;
  $('#app').innerHTML = list.length ? list.map(g => {
    const r = ROLE[g.myRole] || ROLE.servant; const won = r.side === g.winner; const me = g.players.find(p => p.id === g.myId) || {};
    return `<div class="card hitem" data-a="detail" data-g="${g.gid}"><img src="${thumb(g.myRole)}" alt=""><div class="grow"><div><b class="serif">${r.n}</b> ${g.winner === 'none' ? '<span class="badge">提前結束</span>' : won ? '<span class="badge ok">勝</span>' : '<span class="badge evil">負</span>'}${g.mvp === g.myId ? '<span class="badge">🏅 MVP</span>' : ''}</div>
      <div class="small muted">${g.n} 人局 · 座位 ${me.seat || '-'} · ${g.winner === 'none' ? '提前結束' : g.winner === 'good' ? '好人勝' : '壞人勝'}</div><div class="tiny muted">${fmtTime(g.endedAt)}　${g.quests.map(q => q ? (q.success ? '🔵' : '🔴') : '⚪').join('')}</div></div><span class="gold">›</span></div>`;
  }).join('') : '<div class="card center muted">還未有完成的對局<br><span class="small">完成一局後會自動記錄</span></div>';
}
async function loadStats() {
  let st; try { st = await refreshStats(); } catch(e) { st = myStats; } if (view !== 'stats') return;
  let gw = 0, gp = 0, ew = 0, ep = 0; for (const [k, v] of Object.entries(st.roles || {})) { if (ROLE[k].side === 'good') { gw += v.won; gp += v.played; } else { ew += v.won; ep += v.played; } }
  $('#app').innerHTML = `<div class="card row">${av(profile, 56)}<div><div class="name">${esc(profile.name || '騎士')}</div><div class="small muted">MVP ${st.mvp || 0} 次</div></div></div>
  <div class="card"><div class="kpis"><div class="kpi"><b>${st.played}</b><span>總場數</span></div><div class="kpi"><b>${pct(st.won, st.played)}%</b><span>勝率</span></div><div class="kpi"><b>${st.won}</b><span>勝場</span></div></div>
    <div class="row" style="margin-top:14px;gap:8px"><div class="grow"><span class="badge good">好人</span> <b>${gw}</b> 勝 <b>${gp - gw}</b> 負<div class="bar"><i style="width:${pct(gw, gp)}%;background:var(--good)"></i></div></div><div class="grow"><span class="badge evil">壞人</span> <b>${ew}</b> 勝 <b>${ep - ew}</b> 負<div class="bar"><i style="width:${pct(ew, ep)}%;background:var(--evil)"></i></div></div></div></div>
  <div class="card"><h3>各角色戰績</h3><div class="rstats">${ROLE_ORDER.map(k => { const r = (st.roles || {})[k] || { played: 0, won: 0 };
    return `<div class="rstat ${ROLE[k].side}"><img src="${thumb(k)}" alt=""><b>${ROLE[k].n.replace('莫德雷德的', '')}</b>${r.played} 場 · ${pct(r.won, r.played)}%</div>`; }).join('')}</div></div>
  <div class="footer">數據跟隨此瀏覽器的玩家身份保存</div>`;
}
function skinsHtml() {
  const cbk = cardBackOf();
  return `<div class="card"><h3 style="margin:0 0 8px">卡背</h3><div class="skinrow">${CARDBACKS.map(([k, n, need]) => `<div class="skin ${playedTotal() >= need ? '' : 'lock'} ${cbk === k ? 'sel' : ''}" data-a="cardback" data-k="${k}"><div class="rc"><div class="art" style="background-image:url(${img(k)})"></div></div><div style="margin-top:4px">${n}${playedTotal() >= need ? '' : ` 🔒${need}場`}</div></div>`).join('')}</div></div><div class="card"><div class="small muted">主要角色有不同服裝（日常便服、節日盛裝）及特效皮膚。玩得越多解鎖越多，揭曉身份時會顯示你所選的皮膚，並保存到帳號。</div></div>` + ROLE_ORDER.map(k => {
    const played = (myStats.roles[k] || {}).played || 0; const cur = skinOf(k); const next = SKINS.find(s => s.need > played);
    return `<div class="card"><div class="row between"><h3 style="margin:0">${ROLE[k].n}</h3><span class="small muted">已玩 ${played} 場</span></div>
      <div class="skinrow" style="margin-top:10px">${skinsFor(k).map(s => `<div class="skin ${played >= s.need ? '' : 'lock'} ${cur === s.id ? 'sel' : ''}" data-a="skin" data-r="${k}" data-s="${s.id}">${roleFace(k, s.id, true)}<div style="margin-top:4px">${s.n}${played >= s.need ? '' : ` 🔒${s.need}場`}</div></div>`).join('')}</div>
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
      <h4>👥 人數配置</h4><table><tr><th>人數</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th><th>11</th><th>12</th></tr><tr><td>好人</td><td>3</td><td>4</td><td>4</td><td>5</td><td>6</td><td>6</td><td>7</td><td>8</td></tr><tr><td>壞人</td><td>2</td><td>2</td><td>3</td><td>3</td><td>3</td><td>4</td><td>4</td><td>5</td></tr></table>
      <h4>📱 使用方法</h4><p>一人建立房間，其他人掃二維碼或輸入 4 位房間號入座。每人手機只顯示自己的身份。重新整理或斷線會自動回到原座位（同一部手機同一瀏覽器）。</p>`);
    case 'sides': return `<div class="rolegrid">${ROLE_ORDER.map(k => `<div class="rolecell ${ROLE[k].side}" style="background-image:url(${img(k)})" data-a="rolepeek" data-r="${k}"><div class="t"><b>${ROLE[k].n}</b><span class="tiny">${ROLE[k].side === 'good' ? '好人陣營' : '壞人陣營'}</span></div></div>`).join('')}</div><div class="small muted center" style="margin-top:8px">點擊角色查看能力</div>`;
    case 'knows': {
      const viewer = WK_ROLES.indexOf(wkRole); const vr = wkRole;
      const seenAs = (v, r) => { if (v === 'merlin' && ROLE[r].side === 'evil' && r !== 'mordred') return ['壞人', 'e']; if (v === 'percival' && (r === 'merlin' || r === 'morgana')) return ['梅林?', 'p']; if (ROLE[v].side === 'evil' && v !== 'oberon' && ROLE[r].side === 'evil' && r !== 'oberon' && r !== v) return ['隊友', 'e']; return null; };
      const items = WK_ROLES.map((r, i) => { if (i === viewer) return { me: true, art: r, name: '你' }; const v = seenAs(vr, r); return { kind: v ? v[1] : 'u', label: v ? v[0] : '?', real: { art: r, n: ROLE[r].n.replace('亞瑟的', ''), side: ROLE[r].side }, name: DEMO_SEATS[i][0] }; });
      const nSeen = items.filter(x => !x.me && x.kind !== 'u').length;
      const seers = [...new Set(WK_ROLES.filter((r, i) => i !== viewer && seenAs(r, vr)).map(r => ROLE[r].n.replace('亞瑟的', '')))];
      const desc = { merlin: '梅林睇到所有壞人，但睇唔到莫德雷德。', percival: '派西維爾睇到兩個「梅林?」，一個係真梅林，一個係扮梅林嘅莫甘娜。', servant: '忠臣乜都睇唔到，只可以靠推理。', assassin: '壞人互相認識，但睇唔到奧伯倫。', morgana: '壞人互相認識，但睇唔到奧伯倫。', mordred: '壞人互相認識，而且梅林睇唔到莫德雷德。', oberon: '奧伯倫睇唔到隊友，隊友亦睇唔到佢。' }[vr];
      return `<div class="card wk"><div class="wk-tabs">${['merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'oberon'].map(k => `<button data-a="wk" data-r="${k}" class="${k === wkRole ? 'sel' : ''}">${ROLE[k].n.replace('亞瑟的', '')}</button>`).join('')}</div>
        ${knowRing(items, { role: ROLE[vr].n.replace('亞瑟的', ''), side: ROLE[vr].side, n: nSeen, reveal: wkReveal })}
        <p class="wk-desc">${desc}</p>
        <div class="wk-seers">👁 ${seers.length ? `睇到你嘅人：${seers.join('、')}` : '冇人睇到你'}</div>
        <div class="wk-tog" data-a="wkrev"><div class="grow"><b>揭曉真實身份</b><div class="tiny muted">對照一下：變淡嘅人，你開局時睇唔到</div></div><span class="sw2 ${wkReveal ? 'on' : ''}"><i></i></span></div></div>`;
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
      <h4>⚔️ 王者之劍 Excalibur <span class="badge grey">已實作</span></h4><p>隊長組隊時把王者之劍交給一位隊員（不可給自己）。任務卡交出後，持劍者可以選擇翻轉另一位隊員的任務卡（成功↔失敗），並私下看到原本的卡。為任務結果增加變數。</p>
      <h4>🗡️ 蘭斯洛特 Lancelot <span class="badge grey">已實作</span></h4><p>好人與壞人各有一位蘭斯洛特，開局時互相認識。第 2–4 個任務後公開抽一張忠誠牌（五張牌中有兩張「互換」），可能讓兩人陣營對調。正義蘭斯洛特即使是好人也可以出失敗卡。湖中仙女看到的是當下陣營。11 人以上預設開啟。</p>
      <p class="small">本版本已實作王者之劍、蘭斯洛特與 11–12 人局，可在開局前於房間設定開啟。</p>`);
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
const replayUrl = (r) => r && r.gid ? `${PUBLIC_ORIGIN}/g/${r.gid}` : PUBLIC_ORIGIN;
const sideOf = (p) => (ROLE[p.role] || {}).side || p.side || 'good';
const roleN = (k) => (ROLE[k] || {}).n || RN[k] || k;
async function makePoster(r, personal = true) {
  const load = (src) => new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const ps = r.players || []; const n = ps.length; const W = 750; const pad = 36;
  const me = personal && r.myId ? ps.find(p => p.id === r.myId) : null; const sc = r.scores || {};
  const cols = n > 10 ? 4 : (n > 8 ? 5 : 4); const cellW = (W - pad * 2 - 32) / cols, cellH = 170; const gridRows = Math.ceil(n / cols);
  const props = []; (r.rounds || []).forEach((rs, ri) => rs.forEach((pp, k) => props.push({ ri, k, pp, last: k === rs.length - 1 })));
  const chip = Math.min(34, Math.floor((W - pad * 2 - 150) / n) - 4); const rowH = chip + 20;
  const roundsN = (r.rounds || []).filter(x => x.length).length;
  const H = 330 + (me ? 180 : 0) + 90 + gridRows * cellH + 110 + props.length * rowH + roundsN * 40 + 300;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const rr = (X, Y, w, h, rad) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, rad) : x.rect(X, Y, w, h); };
  const C = { bg: '#f4f6fa', card: '#ffffff', line: '#e6e9ef', ink: '#1f2633', sub: '#5d6472', mute: '#8a909c', blue: '#2f6fe8', red: '#e23a52', green: '#2fa866', gold: '#f5b800' };
  const early = r.winner === 'none'; const good = r.winner === 'good';
  const accent = early ? '#7a808c' : good ? C.blue : C.red;
  const card = (Y, h) => { x.save(); x.shadowColor = 'rgba(20,30,60,.08)'; x.shadowBlur = 18; x.shadowOffsetY = 4; x.fillStyle = C.card; rr(pad, Y, W - pad * 2, h, 22); x.fill(); x.restore(); };
  x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
  // header card with team-colour band
  card(28, 270);
  x.save(); rr(pad, 28, W - pad * 2, 270, 22); x.clip();
  let g = x.createLinearGradient(pad, 28, W - pad, 28); g.addColorStop(0, early ? '#eef0f4' : good ? '#e8f0ff' : '#ffecef'); g.addColorStop(1, '#ffffff'); x.fillStyle = g; x.fillRect(pad, 28, W - pad * 2, 270);
  x.fillStyle = accent; x.fillRect(pad, 28, W - pad * 2, 8); x.restore();
  const logo = await load('/img/amigos.webp');
  const hero = early ? null : (ps.find(p => p.id === r.mvp && sideOf(p) === r.winner) || ps.find(p => sideOf(p) === r.winner));
  const drawAv = async (p, cx, cy, rad, ring) => {
    x.save(); x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fillStyle = p.bg || '#f3d9a4'; x.fill(); x.clip();
    const im = await load(photoSrc(p)); if (im) x.drawImage(im, cx - rad, cy - rad, rad * 2, rad * 2); x.restore();
    if (ring) { x.strokeStyle = ring; x.lineWidth = Math.max(3, rad / 12); x.beginPath(); x.arc(cx, cy, rad + 1, 0, Math.PI * 2); x.stroke(); }
    if (PD_IMG[p.pendant]) { const pi = await load(`/img/pd/${p.pendant}.webp`); if (pi) { const s = rad * (p.pendant === 'halo' ? 1.8 : p.pendant === 'crown' ? 1.2 : 0.95); const hh = s * pi.height / pi.width; const oy = p.pendant === 'bow' ? cy - rad * 1.05 : cy - rad - hh * 0.55; const ox = p.pendant === 'bow' ? cx + rad * 0.2 : cx - s / 2; x.drawImage(pi, ox, oy, s, hh); } }
  };
  if (hero) await drawAv(hero, pad + 92, 150, 58, accent);
  else { x.fillStyle = '#eef0f4'; x.beginPath(); x.arc(pad + 92, 150, 58, 0, Math.PI * 2); x.fill(); x.font = '56px sans-serif'; x.textAlign = 'center'; x.fillText('🏳️', pad + 92, 170); }
  if (logo) x.drawImage(logo, W - pad - 108, 46, 90, 72);
  x.textAlign = 'left'; x.fillStyle = accent; x.font = 'bold 54px sans-serif'; x.fillText(early ? '提前結束' : good ? '藍方勝利' : '紅方勝利', pad + 176, 150);
  x.font = '20px sans-serif'; x.fillStyle = C.sub;
  const merlin = ps.find(p => p.role === 'merlin'); const at = r.assassinTarget && ps.find(p => p.id === r.assassinTarget);
  const sub = early ? '房主提前結束本局 · 不計勝負' : at ? (at.role === 'merlin' ? `刺客刺中梅林（${at.seat}號 ${at.name}）` : `刺客刺中的是 ${at.seat}號${roleN(at.role)}·${at.name}　梅林（${merlin ? merlin.seat : '?'}號）安然無恙`) : r.reason;
  const wrap = (txt, X, Y, maxW, lh) => { let line = ''; for (const ch of Array.from(String(txt || ''))) { if (x.measureText(line + ch).width > maxW) { x.fillText(line, X, Y); line = ch; Y += lh; } else line += ch; } x.fillText(line, X, Y); return Y; };
  wrap(sub, pad + 176, 190, W - pad * 2 - 200, 26);
  x.font = '18px sans-serif'; x.fillStyle = C.mute; x.fillText(`${n} 人局 · ${fmtTime(r.endedAt || Date.now())}${r.room ? ' · 房間 ' + r.room : ''}`, pad + 176, 262);
  // quest dots
  (r.quests || []).forEach((q, i) => { const cx = W - pad - 30 - (4 - i) * 30, cy = 262 - 6; x.beginPath(); x.arc(cx, cy, 11, 0, Math.PI * 2); x.fillStyle = q ? (q.success ? C.blue : C.red) : '#e3e6ec'; x.fill(); });
  let y = 320;
  // personal
  if (me) {
    card(y, 160);
    await drawAv(me, pad + 76, y + 80, 50, sideOf(me) === 'good' ? C.blue : C.red);
    const won = !early && sideOf(me) === r.winner; x.textAlign = 'left'; x.fillStyle = C.ink; x.font = 'bold 28px sans-serif'; x.fillText(me.name, pad + 146, y + 60);
    x.font = 'bold 20px sans-serif'; x.fillStyle = sideOf(me) === 'good' ? C.blue : C.red; x.fillText(`${me.seat}號 · ${roleN(me.role)}`, pad + 146, y + 94);
    const tag = early ? '提前結束' : won ? '勝利' : '落敗'; x.font = 'bold 18px sans-serif'; const tw = x.measureText(tag).width + 24;
    x.fillStyle = early ? '#eef0f4' : won ? '#e3f6ec' : '#ffecef'; rr(pad + 146, y + 108, tw, 32, 16); x.fill(); x.fillStyle = early ? C.sub : won ? C.green : C.red; x.fillText(tag, pad + 158, y + 130);
    const ri = await load(thumb(me.role)); if (ri) { x.save(); rr(W - pad - 260, y + 20, 120, 120, 16); x.clip(); x.drawImage(ri, W - pad - 260, y + 20, 120, 120); x.restore(); }
    x.textAlign = 'center'; x.fillStyle = C.ink; x.font = 'bold 44px sans-serif'; x.fillText(sc[me.id] ? `${sc[me.id].total}` : '–', W - pad - 70, y + 82);
    x.font = '16px sans-serif'; x.fillStyle = C.mute; x.fillText(r.mvp === me.id ? '🏅 MVP' : (sc[me.id] ? `第 ${sc[me.id].rank} 名` : '分數'), W - pad - 70, y + 114);
    y += 180;
  }
  // roles grid
  const gridH = 70 + gridRows * cellH; card(y, gridH);
  x.textAlign = 'left'; x.fillStyle = C.ink; x.font = 'bold 24px sans-serif'; x.fillText('全員身份', pad + 22, y + 42);
  const gy = y + 66;
  for (let i = 0; i < n; i++) {
    const p = ps[i]; const cx = pad + 16 + (i % cols) * cellW + cellW / 2, cy = gy + Math.floor(i / cols) * cellH + 46;
    const side = sideOf(p);
    await drawAv(p, cx, cy, 40, side === 'good' ? '#bcd2ff' : '#ffc2cb');
    if (p.id === r.assassinTarget) { x.strokeStyle = C.red; x.lineWidth = 3; x.beginPath(); x.arc(cx + 30, cy - 30, 13, 0, Math.PI * 2); x.moveTo(cx + 13, cy - 30); x.lineTo(cx + 47, cy - 30); x.moveTo(cx + 30, cy - 47); x.lineTo(cx + 30, cy - 13); x.stroke(); }
    const tag = roleN(p.role).replace('莫德雷德的', '').replace('亞瑟的', ''); x.font = 'bold 16px sans-serif'; const tw = x.measureText(tag).width + 18;
    x.fillStyle = side === 'good' ? C.blue : C.red; rr(cx - tw / 2, cy + 48, tw, 26, 13); x.fill();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText(tag, cx, cy + 67);
    x.fillStyle = C.sub; x.font = '16px sans-serif'; x.fillText(`${p.seat}號 ${String(p.name).slice(0, 6)}${p.id === r.mvp ? ' 🏅' : ''}`, cx, cy + 98);
  }
  y += gridH + 20;
  // mission record
  const recH = 70 + props.length * rowH + roundsN * 40 + 40; card(y, recH);
  x.textAlign = 'left'; x.fillStyle = C.ink; x.font = 'bold 24px sans-serif'; x.fillText('組隊記錄', pad + 22, y + 42);
  let ry = y + 60; let lastRi = -1;
  for (const { ri, pp } of props) {
    if (ri !== lastRi) { lastRi = ri; const q = (r.quests || [])[ri]; x.font = 'bold 19px sans-serif'; x.fillStyle = C.sub; x.textAlign = 'left'; x.fillText(`任務 ${ri + 1}`, pad + 22, ry + 26);
      if (q) { x.fillStyle = q.success ? C.blue : C.red; x.fillText(q.success ? `成功${q.fails ? `（${q.fails} 失敗）` : ''}` : `失敗（${q.fails} 張）`, pad + 110, ry + 26); } ry += 40; }
    for (let i = 0; i < n; i++) {
      const p = ps[i]; const cx = pad + 30 + i * (chip + 4) + chip / 2, cy = ry + chip / 2 + 4; const v = pp.votes[p.id]; const tm = pp.team.includes(p.id);
      x.beginPath(); x.arc(cx, cy, chip / 2, 0, Math.PI * 2); x.fillStyle = v === undefined ? '#e3e6ec' : (v ? '#dff4e8' : '#ffe3e7'); x.fill();
      x.strokeStyle = tm ? C.blue : (v === undefined ? '#d5d9e0' : v ? '#9fdcbc' : '#f5a9b5'); x.lineWidth = tm ? 3 : 1.5; x.stroke();
      x.fillStyle = v === undefined ? C.mute : v ? '#1f7a4a' : '#b8293f'; x.font = `bold ${Math.round(chip * 0.45)}px sans-serif`; x.textAlign = 'center'; x.fillText(String(i + 1), cx, cy + chip * 0.16);
      if (pp.leader === p.id) { x.font = `${Math.round(chip * 0.5)}px sans-serif`; x.fillText('👑', cx, cy - chip / 2 + 2); }
    }
    const lab = pp.approved ? '通過' : '否決'; x.font = 'bold 16px sans-serif'; const lw = x.measureText(lab).width + 20;
    x.fillStyle = pp.approved ? '#e3f6ec' : '#ffecef'; rr(W - pad - 22 - lw, ry + chip / 2 - 10, lw, 28, 14); x.fill();
    x.fillStyle = pp.approved ? C.green : C.red; x.textAlign = 'center'; x.fillText(lab, W - pad - 22 - lw / 2, ry + chip / 2 + 9);
    ry += rowH;
  }
  x.textAlign = 'left'; x.font = '15px sans-serif'; x.fillStyle = C.mute; x.fillText('綠＝贊成　紅＝反對　藍框＝隊員　👑＝隊長　⌖＝被刺殺', pad + 22, y + recH - 22);
  y += recH + 20;
  // footer
  card(y, 210);
  const qr = await load('/api/qr?text=' + encodeURIComponent(replayUrl(r)));
  x.strokeStyle = C.line; x.lineWidth = 2; rr(pad + 20, y + 20, 170, 170, 14); x.stroke(); if (qr) x.drawImage(qr, pad + 30, y + 30, 150, 150);
  x.textAlign = 'left'; x.fillStyle = C.ink; x.font = 'bold 32px sans-serif'; x.fillText('旺角阿瓦隆', pad + 214, y + 66);
  x.fillStyle = C.mute; x.font = 'bold 15px sans-serif'; x.fillText('MONGKOK AVALON', pad + 214, y + 92);
  x.fillStyle = C.sub; x.font = '18px sans-serif'; x.fillText('掃碼查看對局回放', pad + 214, y + 132);
  x.fillStyle = C.mute; x.font = '14px sans-serif'; x.fillText(replayUrl(r).replace(/^https?:\/\//, ''), pad + 214, y + 158);
  x.fillText('by Amigosparty · Design by Teddy Design Limited', pad + 214, y + 182);
  if (logo) x.drawImage(logo, W - pad - 130, y + 60, 110, 88);
  return c;
}
async function cardBlob(r) { const c = await makePoster(r, true); return new Promise(res => c.toBlob(b => res(b), 'image/png')); }
async function saveCard(r, show) {
  if (!r) return;
  openModal('<h2>戰報海報</h2><div class="center muted">生成中…</div>');
  const c = await makePoster(r, true); const url = c.toDataURL('image/png');
  openModal(`<h2>戰報海報</h2><img src="${url}" style="width:100%;border-radius:12px;border:1px solid var(--line)"><p class="center small muted">長按圖片可儲存，或按下方下載</p>
    <div class="btns"><a class="btn" href="${url}" download="mongkok-avalon-${(r.gid || 'game').slice(0, 8)}.png" style="text-align:center;text-decoration:none">💾 下載圖片</a><button class="btn ghost" id="sh">📤 分享</button></div>`, el => { $('#sh', el).onclick = () => shareSheet(r); });
}
function shareSheet(r) {
  if (!r) return;
  const url = replayUrl(r); const text = `旺角阿瓦隆｜${r.winner === 'none' ? '提前結束' : r.winner === 'good' ? '藍方勝利' : '紅方勝利'}！${r.n} 人局戰報`;
  const e = encodeURIComponent;
  const links = [
    ['WhatsApp', '#25D366', `https://wa.me/?text=${e(text + ' ' + url)}`],
    ['Facebook', '#1877F2', `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`],
    ['Threads', '#111', `https://www.threads.net/intent/post?text=${e(text + ' ' + url)}`],
    ['Telegram', '#229ED9', `https://t.me/share/url?url=${e(url)}&text=${e(text)}`],
    ['LINE', '#06C755', `https://social-plugins.line.me/lineit/share?url=${e(url)}&text=${e(text)}`],
    ['X', '#000', `https://x.com/intent/post?text=${e(text)}&url=${e(url)}`],
  ];
  openModal(`<h2>分享戰果</h2>
    <div class="share-grid">${links.map(([n, c, href]) => `<a class="sh-i" href="${href}" target="_blank" rel="noopener"><span style="background:${c}">${n[0]}</span>${n}</a>`).join('')}
      <button class="sh-i" id="ig"><span style="background:linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)">IG</span>Instagram</button>
      <button class="sh-i" id="cp"><span style="background:#56607f">🔗</span>複製連結</button>
      <button class="sh-i" id="sys"><span style="background:#b8892f">⋯</span>更多</button>
      <button class="sh-i" id="pp"><span style="background:#2b3a6e">🖼️</span>生成海報</button></div>
    <div class="tiny muted center" style="margin-top:8px">${esc(url)}</div><button class="btn ghost" id="cc">關閉</button>`, el => {
    $('#cc', el).onclick = closeModal;
    $('#cp', el).onclick = async () => { try { await navigator.clipboard.writeText(url); toast('已複製連結'); } catch { prompt('複製連結', url); } };
    $('#pp', el).onclick = () => saveCard(r, true);
    $('#ig', el).onclick = async () => {
      const b = await cardBlob(r); const f = new File([b], 'mongkok-avalon.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: '旺角阿瓦隆', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mongkok-avalon.png'; a.click();
      toast('海報已儲存，請打開 Instagram 發佈（限時動態或貼文）');
    };
    $('#sys', el).onclick = async () => {
      try {
        const b = await cardBlob(r); const f = new File([b], 'mongkok-avalon.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: '旺角阿瓦隆', text, url });
        else if (navigator.share) await navigator.share({ title: '旺角阿瓦隆', text, url });
        else { await navigator.clipboard.writeText(url); toast('此瀏覽器不支援系統分享，已複製連結'); }
      } catch (e) { if (e.name !== 'AbortError') toast('分享未完成'); }
    };
  });
}
async function posterDialog() { return saveCard(window.__lastRecord, true); }

// ================= actions =================
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-a]'); if (!el || !document.body.contains(el)) return;
  const a = el.dataset.a;
  switch (a) {
    case 'profile': return editProfile();
    case 'ptab': return editProfile(null, el.dataset.t);
    case 'about': return openModal(`<h2>關於</h2><div class="center">${LOGO}<div class="name" style="margin-top:6px">旺角阿瓦隆</div><div class="small muted">版本 3.1 · 網頁版阿瓦隆多人遊戲</div><div class="small" style="margin-top:10px">by <b class="gold">Amigosparty</b></div><div class="tiny muted">Design by Teddy Design Limited</div><div class="tiny muted" style="margin-top:8px">原創美術 · 角色立繪、動物頭像、掛件皆為本作原創</div></div><button class="btn" id="ok">關閉</button>`, el2 => $('#ok', el2).onclick = closeModal);
    case 'cfg': cfgOpen = true; openModal(cfgSheetHtml()); cfgOpen = true; return;
    case 'cfgclose': return closeModal();
    case 'vetoinfo': { const vc = S && S.myVetoCards != null ? S.myVetoCards : (account && account.vetoCards); return openModal(`<h2>回避卡</h2><div class="center big">🛡️</div><div class="center name">${vc == null ? '–' : vc} / 10</div><p class="small muted center">每贏一局 +1 張（上限 10 張），永久保存在帳號。房間開啟「回避卡」時，投票階段身為隊員可用一張退出隊伍，本次組隊作廢且不計否決。</p><button class="btn" id="ok">知道了</button>`, el2 => $('#ok', el2).onclick = closeModal); }
    case 'cardback': { const k = el.dataset.k; const c = CARDBACKS.find(x => x[0] === k); if (playedTotal() < c[2]) return toast(`再玩 ${c[2] - playedTotal()} 場即可解鎖`); skinSel._cardback = k; LS.setItem('cc.skins', JSON.stringify(skinSel)); api('/api/me', { method: 'PUT', body: JSON.stringify({ skins: skinSel }) }).catch(() => {}); return render(); }
    case 'sharecard': return shareSheet(window.__lastRecord);
    case 'savecard': return saveCard(window.__lastRecord);
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
    case 'copycode': try { await navigator.clipboard.writeText(S.code); toast('已複製房間號 '+S.code); } catch { prompt('房間號', S.code); } return;
    case 'register': return authDialog('register');
    case 'login': return authDialog('login');
    case 'logout': return doLogout();
    case 'cap': return act('capacity', { n: Number(el.dataset.n) });
    case 'sit': return act('sit', { seat: Number(el.dataset.seat) });
    case 'ready': { const me = (S.seats||[]).find(p => p && p.id === S.meId); return act('ready', { ready: !(me && me.ready) }); }
    case 'adv': return act('settings', { advanced: !S.settings.advanced });
    case 'seat': {
      const id = el.dataset.id;
      if (id === S.meId) {
        return openModal(`<h2>我的座位</h2><div class="center">${av(people().find(p=>p.id===id)||profile,56)}<div class="name">${esc(profile.name)}</div></div><button class="btn ghost" data-x="stand">離座</button><button class="btn" id="ok">關閉</button>`, el2 => {
          el2.querySelector('[data-x=stand]').onclick = () => { closeModal(); act('stand', {}); };
          $('#ok', el2).onclick = closeModal;
        });
      }
      const p = (S.seats||[]).find(x => x && x.id === id); if (!p) return;
      return openModal(`<h2>騎士名片</h2><div class="center namecard">${av(p,56)}<div class="name">${esc(p.name)}</div><div class="small muted">座位 ${p.seat}${p.isHost?' · 房主':''}${p.online?'':' · 離線'}</div></div>
        ${S.isHost?`<div class="btns"><button class="btn ghost" data-x="stand">請他離座</button><button class="btn ghost" data-x="tr">轉讓房主</button></div><button class="btn dark" data-x="kick" style="color:#ff8b9c">移出房間</button>`:''}
        <button class="btn" id="ok">關閉</button>`, el2 => {
          const bind = (sel, fn) => { const b=el2.querySelector(sel); if (b) b.onclick = fn; };
          bind('[data-x=stand]', () => { closeModal(); act('stand', { id }); });
          bind('[data-x=tr]', () => { if (confirm('把房主轉讓給 '+p.name+'？')) { closeModal(); act('transfer', { id }); } });
          bind('[data-x=kick]', () => { if (confirm('移出 '+p.name+'？')) { closeModal(); act('kick', { id }); } });
          $('#ok', el2).onclick = closeModal;
        });
    }
    case 'menu': { const live = S.game && S.game.phase !== 'end'; const row = (x, ic, ti, sub, cls = '') => `<button class="mrow ${cls}" data-x="${x}"><span class="mic">${ic}</span><span class="grow"><b>${ti}</b><span>${sub}</span></span><span class="chev">›</span></button>`;
      return openModal(`<h2>房間選單</h2><div class="mlist">
      ${row('rules', '📖', '查看規則', '遊戲流程、角色能力、擴展玩法')}
      ${row('ref', '🔄', '刷新房間', '畫面唔同步或卡住時，重新連線並向伺服器攞最新狀態')}
      ${S.isHost ? row('tr', '👑', '轉讓房主', '交俾另一位玩家，之後你可以離開') : ''}
      ${S.isHost && live ? row('early', '🏳️', '提前結束', '即時結束本局並公開所有身份，不計勝負', 'warn') : ''}
      ${S.isHost && !live ? row('dis', '⛔', '解散房間', '所有玩家會被移出房間', 'danger') : ''}
      </div><button class="btn ghost" id="ok">關閉</button>`, el2 => {
        el2.querySelector('[data-x=rules]').onclick = () => { closeModal(); go('rules'); };
        el2.querySelector('[data-x=ref]').onclick = () => { closeModal(); refreshRoom(); };
        const ee = el2.querySelector('[data-x=early]'); if (ee) ee.onclick = () => { if (confirm('確定提前結束本局？\n所有人身份會公開，今局記錄為「提前結束」，不計勝負、不計分、不派回避卡。')) { closeModal(); act('endearly'); } };
        const tr = el2.querySelector('[data-x=tr]'); if (tr) tr.onclick = () => {
          const others = (S.seats || []).filter(p => p && !p.empty && p.id !== S.meId);
          if (!others.length) return toast('還沒有其他已就座的玩家');
          openModal(`<h2>轉讓房主</h2><div class="small muted center">選擇一位已就座的玩家，房主權限會即時轉移</div><div class="pick">${others.map(p => `<button class="pick-i" data-id="${p.id}">${av(p, 40)}<div><b>${esc(p.name)}</b><div class="tiny muted">${p.seat}號座${p.online ? '' : ' · 離線'}</div></div></button>`).join('')}</div><button class="btn ghost" id="cc">取消</button>`, el3 => {
            $$('.pick-i', el3).forEach(b => b.onclick = async () => { const p = others.find(o => o.id === b.dataset.id); if (!confirm(`把房主轉讓給 ${p.name}？`)) return; closeModal(); const r = await act('transfer', { id: p.id }); if (r.ok) toast(`已轉讓房主給 ${p.name}`); });
            $('#cc', el3).onclick = closeModal;
          });
        };
        const dis = el2.querySelector('[data-x=dis]'); if (dis) dis.onclick = () => { if (confirm('確定解散房間？所有人將被移出。')) { closeModal(); act('dissolve'); } };
        $('#ok', el2).onclick = closeModal;
      });
    }
    case 'leave': { const r = await emit('leave'); S = null; if (r.stillSeated) toast('遊戲進行中，你的座位會保留'); return go('home'); }
    case 'veto': if (confirm('使用回避卡退出本支隊伍？本輪否決不增加，且你本輪不能再被選入。')) return act('veto'); return;
    case 'sword': { const id=[...selected][0]; if (id) { const r=await act('sword',{id}); if(r.ok) selected=new Set(); } return; }
    case 'swordflip': { const id=[...selected][0]; if (id && confirm('翻轉 '+P(id).name+' 的任務卡？')) { const r=await act('swordflip',{id}); if(r.ok) selected=new Set(); } return; }
    case 'swordskip': return act('swordflip', { skip: true });
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
      if (played < need) return toast(`再玩 ${need - played} 場${(ROLE[r]||{}).n||r}即可解鎖`); skinSel[r] = s; LS.setItem('cc.skins', JSON.stringify(skinSel)); api('/api/me',{method:'PUT',body:JSON.stringify({skins:skinSel})}).catch(()=>{}); return render(); }
    case 'rtab': rulesTab = el.dataset.v; if (rulesTab === 'round') demoStep = 0; return mountRules();
    case 'wk': wkRole = el.dataset.r; return mountRules();
    case 'wkrev': wkReveal = !wkReveal; return mountRules();
    case 'demo': demoStep = demoStep === DEMO.length - 1 && el.dataset.v === '1' ? 0 : Math.max(0, demoStep + Number(el.dataset.v)); return mountRules();
    case 'rolepeek': { const k = el.dataset.r; return openModal(`<div class="flip on" style="cursor:default"><div class="in"><div class="face back"></div><div class="face front">${roleFace(k)}</div></div></div><p class="center" style="margin-top:14px">${ROLE[k].d}</p><button class="btn" id="ok">關閉</button>`, (m) => $('#ok', m).onclick = closeModal); }
  }
});
render();
window.__av = { get S() { return S; }, makePoster, replayUrl, inviteUrl, showQuest, closeModal, go, showRole, knows: (r) => { rulesTab = 'knows'; wkRole = r; go('rules'); } };
})();
