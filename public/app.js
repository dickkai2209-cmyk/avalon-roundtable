'use strict';
(() => {
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = {
  merlin: { n: '梅林', side: 'good', d: '你知道誰是壞人（莫德雷德除外）。小心別暴露自己，否則會被刺客刺殺。' },
  percival: { n: '派西維爾', side: 'good', d: '你看到兩個人：其中一個是梅林，另一個是假扮梅林的莫甘娜。保護真正的梅林。' },
  servant: { n: '亞瑟的忠臣', side: 'good', d: '你沒有特殊資訊。靠推理和投票找出壞人，讓任務成功。' },
  assassin: { n: '刺客', side: 'evil', d: '若好人完成 3 個任務，你有一次機會刺殺梅林，刺中即壞人勝利。' },
  morgana: { n: '莫甘娜', side: 'evil', d: '你在派西維爾眼中與梅林一模一樣，盡量迷惑他。' },
  mordred: { n: '莫德雷德', side: 'evil', d: '梅林看不見你。好好利用這個優勢。' },
  oberon: { n: '奧伯倫', side: 'evil', d: '你不知道其他壞人是誰，他們也不知道你。' },
  minion: { n: '莫德雷德的爪牙', side: 'evil', d: '你知道你的壞人同伴。破壞任務，讓 3 個任務失敗。' },
};
const EMOJIS = ['🙂','😎','🦊','🐼','🐯','🦁','🐸','🐙','🦄','🐲','🐧','🐨','🐻','🐰','🐱','🐶','🧙','🧝','🧛','🥷','🤴','👸','🛡️','⚔️','🏰','🌙','⭐','🍀','🔥','🍉','🍜','🧋'];
const PHASE = { team: '組隊階段', vote: '投票階段', quest: '任務進行中', assassin: '刺殺梅林', end: '遊戲結束' };

// ---------- identity ----------
const LS = window.localStorage;
let pid = LS.getItem('avalon.pid');
if (!pid) { pid = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2))).replace(/-/g, ''); LS.setItem('avalon.pid', pid); }
let profile = { name: LS.getItem('avalon.name') || '', avatar: LS.getItem('avalon.avatar') || EMOJIS[Math.floor(Math.random() * 16)] };
const saveProfile = () => { LS.setItem('avalon.name', profile.name); LS.setItem('avalon.avatar', profile.avatar); };

// ---------- state ----------
let S = null;            // room view from server
let view = 'home';       // home | room | history | stats | rules
let selected = new Set();
let roleHidden = false;
let seenEvent = Number(sessionStorage.getItem('avalon.seenEvent') || 0);
let pendingJoin = new URLSearchParams(location.search).get('room');
if (pendingJoin) history.replaceState(null, '', '/');

const socket = io({ transports: ['websocket', 'polling'] });
socket.on('connect', () => {
  $('#conn').classList.add('on');
  socket.emit('hello', { pid, name: profile.name, avatar: profile.avatar }, (r) => {
    if (r && r.room) { if (view === 'home' && !pendingJoin) {} }
    if (!r || !r.room) { S = null; if (view === 'room') go('home'); }
    if (pendingJoin) { const c = pendingJoin; pendingJoin = null; ensureName(() => joinRoom(c)); }
    render();
  });
});
socket.on('disconnect', () => $('#conn').classList.remove('on'));
socket.on('state', (st) => {
  const prevGid = S && S.game && S.game.gid;
  S = st;
  if (st.game && st.game.gid !== prevGid) { selected = new Set(); }
  if (st.game && ['vote', 'quest', 'end'].includes(st.game.phase)) selected = new Set();
  handleEvent(st);
  render();
});
socket.on('kicked', () => { S = null; toast('你已被房主移出房間'); go('home'); });

function emit(ev, data) {
  return new Promise((res) => socket.emit(ev, data, (r) => { if (r && r.error) toast(r.error); res(r || {}); }));
}
const act = (type, data) => emit('act', { type, data });

// ---------- ui helpers ----------
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600); }
function openModal(html, onMount) { $('#sheet').innerHTML = html; $('#modal').classList.remove('hidden'); onMount && onMount($('#sheet')); }
function closeModal() { $('#modal').classList.add('hidden'); $('#sheet').innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !$('#sheet').dataset.lock) closeModal(); });
$('#backBtn').onclick = () => go('home');
function go(v) { view = v; window.scrollTo(0, 0); render(); }
const pname = (id) => { const p = (S && S.game ? S.game.seats : (S ? S.players : [])).find(x => x.id === id); return p ? p.name : '?'; };
const pav = (id) => { const p = (S && S.game ? S.game.seats : (S ? S.players : [])).find(x => x.id === id); return p ? p.avatar : '❔'; };
const chip = (id) => `<span class="chip"><span class="avatar xs">${esc(pav(id))}</span>${esc(pname(id))}</span>`;
const fmtTime = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const inviteUrl = (code) => `${location.origin}/r/${code}`;

// ---------- profile ----------
function editProfile(after) {
  let av = profile.avatar;
  openModal(`<h2>設定暱稱與頭像</h2>
    <input class="inp" id="nm" maxlength="12" placeholder="輸入暱稱（最多 12 字）" value="${esc(profile.name)}">
    <div class="emojis">${EMOJIS.map(e => `<button data-e="${e}" class="${e === av ? 'sel' : ''}">${e}</button>`).join('')}</div>
    <button class="btn" id="ok">確定</button>`, (el) => {
    el.querySelectorAll('.emojis button').forEach(b => b.onclick = () => { av = b.dataset.e; el.querySelectorAll('.emojis button').forEach(x => x.classList.toggle('sel', x === b)); });
    const nm = el.querySelector('#nm'); setTimeout(() => nm.focus(), 50);
    el.querySelector('#ok').onclick = () => {
      const n = nm.value.trim(); if (!n) return toast('請輸入暱稱');
      profile = { name: n.slice(0, 12), avatar: av }; saveProfile(); socket.emit('profile', profile); closeModal(); render(); after && after();
    };
  });
}
function ensureName(fn) { if (profile.name) fn(); else editProfile(fn); }

async function createRoom() { const r = await emit('create'); if (r.room) go('room'); }
async function joinRoom(code) { const r = await emit('join', { code }); if (r.room) { closeModal(); go('room'); } }
function joinDialog() {
  openModal(`<h2>加入房間</h2><input class="inp code-inp" id="cd" maxlength="4" placeholder="房間號" autocomplete="off">
  <p class="muted small center">輸入同桌朋友的 4 位房間號，或掃描他們的二維碼</p><button class="btn" id="ok">加入</button>`, (el) => {
    const cd = el.querySelector('#cd'); setTimeout(() => cd.focus(), 50);
    const go2 = () => { const c = cd.value.trim().toUpperCase(); if (c.length !== 4) return toast('房間號為 4 位'); joinRoom(c); };
    el.querySelector('#ok').onclick = go2; cd.onkeydown = (e) => { if (e.key === 'Enter') go2(); };
  });
}
function inviteDialog() {
  const url = inviteUrl(S.code);
  openModal(`<h2>邀請朋友</h2>
    <img class="qr" alt="QR" src="/api/qr?text=${encodeURIComponent(url)}">
    <p class="center muted small">同枱朋友用手機相機掃一掃，直接入房</p>
    <div class="center"><span class="muted small">房間號</span><div class="code">${S.code}</div></div>
    <div class="btns"><button class="btn ghost" id="cp">複製連結</button>${navigator.share ? '<button class="btn" id="sh">分享</button>' : ''}</div>`, (el) => {
    el.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('已複製：' + url); } catch { prompt('複製此連結', url); } };
    const sh = el.querySelector('#sh'); if (sh) sh.onclick = () => navigator.share({ title: '圓桌密令 · 阿瓦隆', text: `入房玩阿瓦隆！房間號 ${S.code}`, url }).catch(() => {});
  });
}

// ---------- events (vote/quest results, start, end) ----------
function handleEvent(st) {
  if (sessionStorage.getItem('avalon.seenRoom') !== st.code) { sessionStorage.setItem('avalon.seenRoom', st.code); seenEvent = 0; }
  const ev = st.lastEvent; if (!ev || ev.seq <= seenEvent) return;
  const fresh = seenEvent !== 0 || ev.type === 'start';
  seenEvent = ev.seq; sessionStorage.setItem('avalon.seenEvent', String(seenEvent));
  if (!fresh && ev.type !== 'start') return; // after reload, don't replay old popups
  if (ev.type === 'start') { roleHidden = false; showRoleModal(st); }
  else if (ev.type === 'vote') showVoteResult(ev);
  else if (ev.type === 'quest') showQuestResult(ev);
  else if (ev.type === 'end') { if (ev.prev) showVoteResult(ev.prev, true); else showEnd(); }
  else if (ev.type === 'abort') toast('房主已結束本局');
}
function showRoleModal(st) {
  const me = st.game && st.game.me; if (!me) return;
  openModal(`<h2>你的身份</h2>${roleCardHtml(st.game, false)}<button class="btn" id="ok">記住了</button>`, (el) => el.querySelector('#ok').onclick = closeModal);
}
function showVoteResult(ev, thenEnd) {
  const ids = Object.keys(ev.votes);
  openModal(`<h2>${ev.approved ? '✅ 組隊通過' : '❌ 組隊被否決'}</h2>
    <p class="center muted">贊成 ${ev.yes} · 反對 ${ev.no}　隊長：${esc(pname(ev.leader))}</p>
    <div class="center">${ev.team.map(chip).join('')}</div>
    <div class="plist" style="margin-top:10px">${ids.map(id => `<div class="p"><span class="avatar xs">${esc(pav(id))}</span><span class="grow">${esc(pname(id))}</span><span class="tag ${ev.votes[id] ? 'yes' : 'no'}">${ev.votes[id] ? '贊成' : '反對'}</span></div>`).join('')}</div>
    <button class="btn" id="ok">${thenEnd ? '查看結果' : '知道了'}</button>`, (el) => el.querySelector('#ok').onclick = () => { closeModal(); if (thenEnd) showEnd(); });
}
function showQuestResult(ev) {
  openModal(`<h2>第 ${ev.round + 1} 個任務</h2>
    <div class="big">${ev.success ? '🏆' : '💥'}</div>
    <h2 class="${ev.success ? 'result-good' : 'result-evil'}">${ev.success ? '任務成功' : '任務失敗'}</h2>
    <p class="center muted">${ev.size} 張任務卡中有 ${ev.fails} 張失敗</p>
    <button class="btn" id="ok">${ev.then === 'end' ? '查看結果' : '繼續'}</button>`, (el) => el.querySelector('#ok').onclick = () => { closeModal(); if (ev.then === 'end') showEnd(); });
}
function showEnd() {
  const g = S && S.game; if (!g || g.phase !== 'end') return;
  const goodWin = g.winner === 'good';
  openModal(`<div class="big">${goodWin ? '🛡️' : '🗡️'}</div><h2 class="${goodWin ? 'result-good' : 'result-evil'}">${goodWin ? '好人陣營勝利' : '壞人陣營勝利'}</h2>
    <p class="center muted">${esc(g.reason)}</p>${rolesRevealHtml(g)}<button class="btn" id="ok">返回房間</button>`, (el) => el.querySelector('#ok').onclick = closeModal);
}
function rolesRevealHtml(g) {
  return `<div class="plist">${g.seats.map((s, i) => { const r = ROLE[s.role] || {}; return `<div class="p"><span class="seat">${i + 1}</span><span class="avatar sm">${esc(s.avatar)}</span><span class="grow">${esc(s.name)}${g.assassinTarget === s.id ? ' <span class="badge evil">被刺殺</span>' : ''}</span><span class="badge ${r.side}">${r.n || ''}</span></div>`; }).join('')}</div>`;
}
function roleCardHtml(g, allowHide) {
  const me = g.me; const r = ROLE[me.role];
  if (allowHide && roleHidden) return `<div class="rolecard hide" id="rc"><div class="small">我的身份（已隱藏）</div><div class="rn">🔒 點擊查看</div><div class="small">小心別讓旁邊的人看到</div></div>`;
  const knows = me.knows.length ? me.knows.map(k => `${esc(pav(k.id))} ${esc(pname(k.id))} — ${esc(k.label)}`).join('<br>') : '你沒有額外資訊';
  return `<div class="rolecard ${r.side}" id="rc"><div class="small">${r.side === 'good' ? '好人陣營 · 亞瑟' : '壞人陣營 · 莫德雷德'}${allowHide ? '　（點擊隱藏）' : ''}</div><div class="rn">${r.n}</div><div class="small">${r.d}</div><div class="know">${knows}</div></div>`;
}

// ---------- render ----------
function render() {
  const app = $('#app');
  const inRoom = S && S.code;
  if (view === 'room' && !inRoom) view = 'home';
  $('#backBtn').classList.toggle('hidden', view === 'home');
  $('#topTitle').textContent = { home: '圓桌密令', room: inRoom ? `房間 ${S.code}` : '房間', history: '歷史記錄', stats: '數據統計', rules: '規則介紹' }[view];
  if (view === 'home') app.innerHTML = homeHtml();
  else if (view === 'room') app.innerHTML = S.game ? gameHtml() : lobbyHtml();
  else if (view === 'rules') app.innerHTML = rulesHtml();
  else if (view === 'history') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadHistory(); }
  else if (view === 'stats') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadStats(); }
  bind();
}
function homeHtml() {
  const inRoom = S && S.code;
  return `
  <div class="card row" data-a="profile" style="cursor:pointer">
    <div class="avatar">${esc(profile.avatar)}</div>
    <div class="grow"><div class="name">${profile.name ? esc(profile.name) : '未設定暱稱'}</div><div class="muted small">點擊修改暱稱與頭像</div></div>
    <span class="muted">✎</span>
  </div>
  ${inRoom ? `<div class="card"><h3>我的房間</h3><div class="row between"><div><span class="code">${S.code}</span>${S.isHost ? '<span class="badge">房主</span>' : ''}<div class="muted small">${S.players.length} 位玩家 · ${S.game ? (S.game.phase === 'end' ? '已結束' : '遊戲中') : '等待開始'}</div></div><button class="btn sm" data-a="toroom">回到房間</button></div></div>` : ''}
  <div class="card">
    <div class="btns"><button class="btn" data-a="create" style="margin-top:0">建立房間</button><button class="btn ghost" data-a="join" style="margin-top:0">加入房間</button></div>
  </div>
  <div class="card menu">
    <div class="item" data-a="history"><span class="ic" style="background:#eef1ff">🕘</span><span class="grow">歷史記錄</span><span class="chev">›</span></div>
    <div class="item" data-a="stats"><span class="ic" style="background:#e7f6ef">📊</span><span class="grow">數據統計</span><span class="chev">›</span></div>
    <div class="item" data-a="rules"><span class="ic" style="background:#fff4e2">📖</span><span class="grow">規則介紹</span><span class="chev">›</span></div>
  </div>
  <div class="logo">圓桌密令 · 免安裝阿瓦隆助手<br>用瀏覽器開啟即可，同枱朋友掃碼入房</div>`;
}
function lobbyHtml() {
  const n = S.players.length; const s = S.settings; const host = S.isHost;
  const evilCount = S.evilCount; const ts = S.teamSizes;
  const toggles = [['percival', '派西維爾', '好人：看到梅林與莫甘娜'], ['morgana', '莫甘娜', '壞人：在派西維爾眼中像梅林'], ['mordred', '莫德雷德', '壞人：梅林看不見他'], ['oberon', '奧伯倫', '壞人：與其他壞人互不相識']];
  let comp = '';
  if (evilCount) {
    const evil = ['刺客'].concat(s.morgana ? ['莫甘娜'] : [], s.mordred ? ['莫德雷德'] : [], s.oberon ? ['奧伯倫'] : []);
    const good = ['梅林'].concat(s.percival ? ['派西維爾'] : []);
    const over = evil.length > evilCount;
    while (evil.length < evilCount) evil.push('爪牙'); while (good.length < n - evilCount) good.push('忠臣');
    comp = `<div class="small" style="margin-top:8px"><span class="badge good">好人 ${n - evilCount}</span> ${good.join('、')}<br><span class="badge evil">壞人 ${evilCount}</span> ${evil.join('、')}${over ? '<br><span class="result-evil">⚠️ 壞人角色多於壞人人數</span>' : ''}<br><span class="muted">每輪任務人數：${ts.join(' / ')}${n >= 7 ? '（第 4 輪需 2 張失敗）' : ''}</span></div>`;
  } else comp = `<div class="muted small" style="margin-top:8px">需要 5–10 位玩家（現在 ${n} 位）</div>`;
  return `
  <div class="card center">
    <div class="muted small">房間號</div><div class="code">${S.code}</div>
    <button class="btn" data-a="invite">邀請朋友（二維碼 / 連結）</button>
  </div>
  <div class="card"><h3>玩家 ${n}/10</h3><div class="plist">
    ${S.players.map((p, i) => `<div class="p ${p.online ? '' : 'off'}"><span class="seat">${i + 1}</span><span class="avatar sm">${esc(p.avatar)}</span><span class="grow">${esc(p.name)}${p.id === S.hostId ? '<span class="badge">房主</span>' : ''}${p.id === S.meId ? '<span class="badge blue">我</span>' : ''}${p.online ? '' : '<span class="badge grey">離線</span>'}</span>
      ${host ? `<button class="btn sm light" data-a="up" data-id="${p.id}">↑</button>${p.id !== S.meId ? `<button class="btn sm light" data-a="kick" data-id="${p.id}">移除</button>` : ''}` : ''}</div>`).join('')}
  </div><div class="muted small" style="margin-top:6px">座位次序即隊長輪替次序${host ? '，可按 ↑ 調整' : ''}</div></div>
  <div class="card"><h3>角色設定${host ? '' : '（由房主設定）'}</h3>
    <div class="toggle"><div><b>梅林</b>、<b>刺客</b><div class="muted small">必選</div></div><button class="sw on" disabled></button></div>
    ${toggles.map(([k, nm, d]) => `<div class="toggle"><div><b>${nm}</b><div class="muted small">${d}</div></div><button class="sw ${s[k] ? 'on' : ''}" data-a="tg" data-k="${k}" ${host ? '' : 'disabled'}></button></div>`).join('')}
    ${comp}
  </div>
  ${host ? `<button class="btn" data-a="start" ${n < 5 ? 'disabled' : ''}>開始遊戲${n < 5 ? `（還差 ${5 - n} 人）` : ''}</button>` : '<div class="card center muted">等待房主開始遊戲…</div>'}
  <button class="btn light" data-a="leave">離開房間</button>`;
}
function trackHtml(g) {
  return `<div class="track">${g.teamSizes.map((sz, i) => { const q = g.quests[i]; const cls = q ? (q.success ? 'ok' : 'bad') : (i === g.round && g.phase !== 'end' && g.phase !== 'assassin' ? 'cur' : '');
    return `<div class="q ${cls}">${q ? (q.success ? '✓' : '✕') : sz}${i === g.twoFailRound ? '<small>需2敗</small>' : (q ? `<small>${q.fails}敗</small>` : '')}</div>`; }).join('')}</div>
    <div class="rej small muted">否決次數 ${[0, 1, 2, 3, 4].map(i => `<i class="${i < g.rejects ? 'on' : ''}"></i>`).join('')}<span>（5 次壞人勝）</span></div>`;
}
function gameHtml() {
  const g = S.game; const me = g.me; const meId = S.meId;
  const need = g.teamSizes[g.round]; const isLeader = g.leaderId === meId;
  let panel = '';
  if (g.phase === 'team') {
    panel = isLeader
      ? `<div class="phase">👑 你是隊長，請選擇 ${need} 位隊員</div><div class="muted small">在下方玩家列表點選（已選 ${selected.size}/${need}），可以選自己</div><button class="btn" data-a="propose" ${selected.size === need ? '' : 'disabled'}>提交隊伍</button>`
      : `<div class="phase">等待隊長 ${chip(g.leaderId)} 組隊</div><div class="muted small">本輪需要 ${need} 位隊員，大家可以先討論</div>`;
  } else if (g.phase === 'vote') {
    panel = `<div class="phase">投票：是否同意此隊伍出任務？</div><div>${g.team.map(chip).join('')}</div><div class="muted small" style="margin-top:6px">已投票 ${g.voted.length}/${g.n}，全員投完後一起公開</div>` +
      (me && !me.voted ? `<div class="btns"><button class="btn good" data-a="vote" data-v="1">👍 贊成</button><button class="btn evil" data-a="vote" data-v="0">👎 反對</button></div>` : `<div class="center muted" style="margin-top:10px">你已投${me && me.myVote ? '「贊成」' : '「反對」'}，等待其他人…</div>`);
  } else if (g.phase === 'quest') {
    const onTeam = g.team.includes(meId);
    panel = `<div class="phase">任務進行中</div><div>${g.team.map(chip).join('')}</div><div class="muted small" style="margin-top:6px">已交任務卡 ${g.questDone}/${g.team.length}${g.twoFailRound === g.round ? '　本輪需 2 張失敗才算任務失敗' : ''}</div>` +
      (onTeam && !me.questSubmitted ? `<div class="btns"><button class="btn good" data-a="quest" data-v="1">✓ 成功</button><button class="btn evil" data-a="quest" data-v="0" ${me.side === 'good' ? 'disabled' : ''}>✕ 失敗</button></div>${me.side === 'good' ? '<div class="muted small center" style="margin-top:6px">好人只能出「成功」</div>' : ''}`
        : `<div class="center muted" style="margin-top:10px">${onTeam ? '你已交卡，等待其他隊員…' : '等待隊員出任務…'}</div>`);
  } else if (g.phase === 'assassin') {
    const amAssassin = me && me.role === 'assassin';
    const assassin = g.seats.find(s => s.assassin);
    panel = `<div class="phase">🗡️ 好人完成 3 個任務！刺客最後機會</div><div class="muted small">壞人可以公開討論，由刺客 ${assassin ? chip(assassin.id) : ''} 選出他認為的梅林</div>` +
      (amAssassin ? `<div class="muted small" style="margin-top:6px">在下方列表點選目標（已選：${selected.size ? esc(pname([...selected][0])) : '無'}）</div><button class="btn evil" data-a="assassinate" ${selected.size === 1 ? '' : 'disabled'}>確認刺殺</button>` : '');
  } else if (g.phase === 'end') {
    const goodWin = g.winner === 'good';
    panel = `<div class="phase ${goodWin ? 'result-good' : 'result-evil'}">${goodWin ? '🛡️ 好人陣營勝利' : '🗡️ 壞人陣營勝利'}</div><div class="muted small">${esc(g.reason)}</div>${rolesRevealHtml(g)}
      ${S.isHost ? '<button class="btn" data-a="lobby">再來一局（返回房間設定）</button>' : '<div class="center muted small" style="margin-top:10px">等待房主開新一局</div>'}`;
  }
  const selectable = (g.phase === 'team' && isLeader) || (g.phase === 'assassin' && me && me.role === 'assassin');
  const players = g.seats.map((s, i) => {
    const tags = [];
    if (s.id === g.leaderId && g.phase !== 'end') tags.push('<span class="tag lead">隊長</span>');
    if (g.team.includes(s.id)) tags.push('<span class="tag team">隊員</span>');
    if (g.phase === 'vote' && g.voted.includes(s.id)) tags.push('<span class="tag done">已投</span>');
    if (s.evil) tags.push('<span class="tag no">壞人</span>');
    const canSel = selectable && !(g.phase === 'assassin' && (s.id === meId || s.evil));
    return `<div class="p ${selected.has(s.id) ? 'sel' : ''} ${canSel ? 'click' : ''} ${s.online ? '' : 'off'}" ${canSel ? `data-a="sel" data-id="${s.id}"` : ''}><span class="seat">${i + 1}</span><span class="avatar sm">${esc(s.avatar)}</span><span class="grow">${esc(s.name)}${s.id === meId ? '<span class="badge blue">我</span>' : ''}${s.online ? '' : '<span class="badge grey">離線</span>'}</span>${tags.join('')}${selected.has(s.id) ? ' ✔️' : ''}</div>`;
  }).join('');
  return `
  <div class="card">${trackHtml(g)}<div class="muted small" style="margin-top:8px">第 ${Math.min(g.round + 1, 5)} 輪 · ${PHASE[g.phase]} · ${g.n} 人局</div></div>
  ${me ? roleCardHtml(g, true) : '<div class="card muted">你是觀眾</div>'}
  <div class="card">${panel}</div>
  <div class="card"><h3>玩家（座位次序）</h3><div class="plist">${players}</div></div>
  <div class="card"><h3>投票記錄</h3>${voteHistoryHtml(g)}</div>
  <div class="btns"><button class="btn light" data-a="invite">房間二維碼</button><button class="btn light" data-a="home">返回主頁</button></div>
  ${S.isHost && g.phase !== 'end' ? '<button class="btn light" data-a="abort" style="color:var(--evil)">強制結束本局</button>' : ''}`;
}
function voteHistoryHtml(g) {
  const rows = [];
  g.rounds.forEach((props, ri) => {
    if (!props.length && !g.quests[ri]) return;
    const q = g.quests[ri];
    rows.push(`<div class="r"><b>第 ${ri + 1} 輪</b> ${q ? `<span class="badge ${q.success ? 'good' : 'evil'}">${q.success ? '任務成功' : '任務失敗'} · ${q.fails} 張失敗</span>` : ''}
      ${props.map((p, k) => `<div style="margin-top:6px">${k + 1}. 隊長 ${esc(pname(p.leader))}：${p.team.map(id => esc(pname(id))).join('、')} — <span class="tag ${p.approved ? 'yes' : 'no'}">${p.approved ? '通過' : '否決'} ${p.yes}:${p.no}</span>
        <div class="muted">${Object.keys(p.votes).map(id => `${esc(pname(id))}${p.votes[id] ? '👍' : '👎'}`).join('　')}</div></div>`).join('')}</div>`);
  });
  return rows.length ? `<div class="hist">${rows.join('')}</div>` : '<div class="muted small">尚未有投票</div>';
}
async function loadHistory() {
  const list = await fetch('/api/history?pid=' + encodeURIComponent(pid)).then(r => r.json()).catch(() => []);
  if (view !== 'history') return;
  $('#app').innerHTML = list.length ? list.map(g => {
    const won = (ROLE[g.myRole] || {}).side === g.winner;
    return `<div class="card"><div class="row between"><div><b>${g.winner === 'good' ? '好人勝利' : '壞人勝利'}</b> <span class="badge ${won ? 'good' : 'evil'}">${won ? '勝' : '負'}</span></div><span class="muted small">${fmtTime(g.endedAt)} · 房間 ${esc(g.room)} · ${g.n} 人</span></div>
      <div class="small muted" style="margin:4px 0">${esc(g.reason)}　我的角色：<b>${(ROLE[g.myRole] || {}).n || ''}</b></div>
      <div class="small">任務：${g.quests.map(q => q ? (q.success ? '✅' : '❌') : '·').join(' ')}</div>
      <div class="small" style="margin-top:6px">${g.players.map(p => `<span class="chip"><span class="avatar xs">${esc(p.avatar)}</span>${esc(p.name)} <span class="badge ${(ROLE[p.role] || {}).side}">${(ROLE[p.role] || {}).n}</span></span>`).join('')}</div></div>`;
  }).join('') : '<div class="card center muted">還未有完成的對局</div>';
}
async function loadStats() {
  const st = await fetch('/api/stats?pid=' + encodeURIComponent(pid)).then(r => r.json()).catch(() => ({ played: 0, won: 0, roles: {} }));
  if (view !== 'stats') return;
  const pct = (w, p) => p ? Math.round(w * 100 / p) : 0;
  $('#app').innerHTML = `<div class="card center"><div class="muted small">總場數 / 勝率</div><div class="code" style="letter-spacing:1px">${st.played} 場 · ${pct(st.won, st.played)}%</div></div>
  <div class="card"><h3>各角色勝率</h3>${Object.keys(ROLE).map(k => { const r = st.roles[k] || { played: 0, won: 0 };
    return `<div style="margin:10px 0"><div class="row between"><span><span class="badge ${ROLE[k].side}">${ROLE[k].side === 'good' ? '好' : '壞'}</span> ${ROLE[k].n}</span><span class="muted small">${r.won}/${r.played} 勝 · ${pct(r.won, r.played)}%</span></div><div class="bar"><i style="width:${pct(r.won, r.played)}%;background:${ROLE[k].side === 'good' ? 'var(--good)' : 'var(--evil)'}"></i></div></div>`; }).join('')}</div>
  <div class="muted small center">數據跟隨此瀏覽器的玩家身份保存</div>`;
}
function rulesHtml() {
  return `<div class="card rules">
  <h4>🎯 遊戲目標</h4><p>玩家分為<b>好人（亞瑟的忠臣）</b>和<b>壞人（莫德雷德的爪牙）</b>兩個陣營。好人要完成 3 個任務；壞人要令 3 個任務失敗，或者在最後刺殺梅林。</p>
  <h4>👥 人數配置</h4><table><tr><th>人數</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th></tr><tr><td>好人</td><td>3</td><td>4</td><td>4</td><td>5</td><td>6</td><td>6</td></tr><tr><td>壞人</td><td>2</td><td>2</td><td>3</td><td>3</td><td>3</td><td>4</td></tr></table>
  <h4>🛡️ 每輪任務人數</h4><table><tr><th>人數</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th></tr><tr><td>5</td><td>2</td><td>3</td><td>2</td><td>3</td><td>3</td></tr><tr><td>6</td><td>2</td><td>3</td><td>4</td><td>3</td><td>4</td></tr><tr><td>7</td><td>2</td><td>3</td><td>3</td><td>4*</td><td>4</td></tr><tr><td>8–10</td><td>3</td><td>4</td><td>4</td><td>5*</td><td>5</td></tr></table><p class="small">* 7 人或以上時，第 4 個任務需要 <b>2 張失敗</b>才算失敗。</p>
  <h4>🔄 遊戲流程</h4><ol>
  <li><b>確認身份：</b>開局後每人在自己手機看身份，記得遮住螢幕。</li>
  <li><b>組隊：</b>隊長按座位次序輪流擔任，選出本輪人數的隊員（可以選自己）。</li>
  <li><b>投票：</b>所有人同時投「贊成」或「反對」，全部投完一起公開。過半數贊成才通過；票數相同算否決。</li>
  <li><b>否決：</b>隊長交給下一位重新組隊。同一輪<b>連續 5 次</b>被否決，壞人直接勝利。</li>
  <li><b>出任務：</b>隊員秘密交出「成功」或「失敗」。好人只能出成功，壞人可以自由選擇。只公開失敗張數。</li>
  <li><b>刺殺：</b>好人完成 3 個任務後，壞人可討論，由刺客指認梅林。刺中則壞人逆轉勝利，否則好人勝利。</li></ol>
  <h4>🎭 角色介紹</h4><ul>
  <li><b>梅林（好）</b>：知道所有壞人（莫德雷德除外），但要隱藏自己。</li>
  <li><b>派西維爾（好）</b>：看到梅林和莫甘娜，但分不清誰是誰。</li>
  <li><b>亞瑟的忠臣（好）</b>：沒有額外資訊。</li>
  <li><b>刺客（壞）</b>：遊戲最後負責刺殺梅林。</li>
  <li><b>莫甘娜（壞）</b>：在派西維爾眼中像梅林。</li>
  <li><b>莫德雷德（壞）</b>：梅林看不到他。</li>
  <li><b>奧伯倫（壞）</b>：看不到其他壞人，其他壞人也看不到他。</li>
  <li><b>莫德雷德的爪牙（壞）</b>：普通壞人，知道同伴是誰。</li></ul>
  <h4>📱 使用方法</h4><p>一人建立房間，其他人掃二維碼或輸入 4 位房間號加入。重新整理或斷線後會自動回到原本座位（請用同一部手機和瀏覽器）。</p>
  </div>`;
}

// ---------- bindings ----------
function bind() {
  document.querySelectorAll('#app [data-a]').forEach(el => el.onclick = (e) => onAction(el.dataset.a, el, e));
  const rc = $('#rc'); if (rc && view === 'room') rc.onclick = () => { roleHidden = !roleHidden; render(); };
}
async function onAction(a, el) {
  switch (a) {
    case 'profile': return editProfile();
    case 'create': return ensureName(createRoom);
    case 'join': return ensureName(joinDialog);
    case 'toroom': return go('room');
    case 'history': case 'stats': case 'rules': case 'home': return go(a);
    case 'invite': return inviteDialog();
    case 'tg': return act('settings', { [el.dataset.k]: !S.settings[el.dataset.k] });
    case 'kick': if (confirm('移除這位玩家？')) act('kick', { id: el.dataset.id }); return;
    case 'up': return act('move', { id: el.dataset.id, dir: -1 });
    case 'start': return act('start');
    case 'leave': { const r = await emit('leave'); S = null; if (r.stillSeated) toast('遊戲進行中，你的座位會保留'); return go('home'); }
    case 'abort': if (confirm('確定強制結束本局？（不會計入記錄）')) act('abort'); return;
    case 'lobby': return act('lobby');
    case 'sel': {
      const id = el.dataset.id; const g = S.game;
      if (g.phase === 'assassin') { selected = new Set(selected.has(id) ? [] : [id]); }
      else { if (selected.has(id)) selected.delete(id); else if (selected.size < g.teamSizes[g.round]) selected.add(id); else toast(`最多選 ${g.teamSizes[g.round]} 人`); }
      return render();
    }
    case 'propose': { const r = await act('propose', { team: [...selected] }); if (r.ok) selected = new Set(); return; }
    case 'vote': return act('vote', { approve: el.dataset.v === '1' });
    case 'quest': return act('quest', { success: el.dataset.v === '1' });
    case 'assassinate': { const id = [...selected][0]; if (id && confirm(`確定刺殺 ${pname(id)}？`)) { const r = await act('assassinate', { id }); if (r.ok) selected = new Set(); } return; }
  }
}

// open room view automatically when we have one and just loaded
socket.on('state', () => { if (view === 'home' && !window.__autoRoomDone) { window.__autoRoomDone = true; go('room'); } });
render();
})();
