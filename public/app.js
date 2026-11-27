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
// [key, name, unlock type, need]
const CARDBACKS = [['cardback', '經典', 'free', 0], ['cardback_xmas', '聖誕', 'free', 0], ['cardback_sakura', '櫻花', 'games', 2], ['cardback_halloween', '萬聖節', 'games', 3], ['cardback_lny', '農曆新年', 'games', 6],
  ['cardback_starry', '星空', 'wins', 3], ['cardback_neon', '旺角霓虹', 'wins', 5], ['cardback_amigos', "Amigos' Party 特別版", 'wins', 10]];
const unlockOk = (type, need) => type === 'free' || (type === 'games' ? playedTotal() : type === 'wins' ? winsTotal() : mvpTotal()) >= need;
const needText = (type, need) => type === 'wins' ? `勝 ${need} 場` : type === 'mvp' ? `${need} 次 MVP` : `玩 ${need} 場`;
const cbUnlocked = (k) => { const c = CARDBACKS.find(x => x[0] === k); return !!c && unlockOk(c[2], c[3]); };
const cardBackOf = () => { const k = (skinSel && skinSel._cardback) || 'cardback'; return cbUnlocked(k) ? k : 'cardback'; };
const shinyOn = () => !!(skinSel && skinSel._shiny) && mvpTotal() >= 10;
const OUTFIT_ROLES = ['merlin', 'percival', 'morgana', 'assassin', 'servant', 'mordred', 'oberon'];
const SERVANT_MALE = [
  { id: 'classic_male', n: '經典 · 男', need: 0, art: 'servant_male' },
  { id: 'casual_male', n: '日常便服 · 男', need: 0, art: 'servant_casual_male' },
];
const skinById = (id) => SKINS.find(k => k.id === id) || SERVANT_MALE.find(k => k.id === id);
const skinsFor = (role) => {
  const base = SKINS.filter(s => !s.outfit || OUTFIT_ROLES.includes(role));
  if (role !== 'servant') return base;
  const out = [];
  for (const s of base) {
    out.push(s);
    if (s.id === 'classic') out.push(SERVANT_MALE[0]);
    if (s.id === 'casual') out.push(SERVANT_MALE[1]);
  }
  return out;
};
const ROLE_ORDER = ['merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'oberon', 'minion'];
const img = (r) => `/img/${r}.webp`, thumb = (r) => `/img/${r}_t.webp`, thumbCb = (k) => `/img/${k}.webp`;
const SKINS = [
  { id: 'classic', n: '經典', need: 0 },
  { id: 'casual', n: '日常便服', need: 0, outfit: 1 },
  { id: 'festive', n: '節日盛裝', need: 2, outfit: 1 },
  { id: 'moon', n: '月影', need: 1 },
  { id: 'gold', n: '鎏金', need: 3 },
  { id: 'blood', n: '血月', need: 6 },
];
function skinLabel(role, skin) {
  if (role === 'servant' && (skin.id === 'classic' || skin.id === 'casual' || skin.id === 'festive')) return skin.n + ' · 女';
  return skin.n;
}
const ANIMALS = [
  ['fox','狐狸'],['panda','熊貓'],['duck','小鴨'],['squirrel','松鼠'],['hedgehog','刺蝟'],['bunny','兔子'],
  ['bear','棕熊'],['redpanda','小熊貓'],['otter','水獺'],['hamster','倉鼠'],['shiba','柴犬'],['dalmatian','斑點狗'],
  ['capybara','水豚'],['penguin','企鵝'],['koala','無尾熊'],['cat','貓咪'],['wolf','狼仔'],['lion','獅子'],['piglet','豬仔'],['guineapig','天竺鼠'],
  ['puffer','河豚'],['alien','外星人'],['wolfking','狼王'],['frog','青蛙'],['dragonet','小龍'],['tiger','老虎'],['hero','超人']
];
const EMOJI_MAP = {'🦊':'fox','🐼':'panda','🦆':'duck','🐿️':'squirrel','🦔':'hedgehog','🐰':'bunny','🐻':'bear','🦝':'redpanda','🦦':'otter','🐹':'hamster','🐕':'shiba','🐶':'shiba','🦫':'capybara','🐧':'penguin','🐨':'koala','🐱':'cat','🐺':'wolf','🦁':'lion','🐷':'piglet','🐖':'piglet','🐡':'puffer','👽':'alien','🐸':'frog','🐯':'tiger','🐉':'dragonet'};
const BGS = ['#ffffff', '#f3d9a4', '#f7c1c8', '#bfe3c9', '#bcd6ff', '#d9c6ff', '#ffe08a', '#c8eef0', '#ffcfa6', '#2b3a6e', '#3a2a1c'];
const FXS = [['none','無',0],['spot','聚光燈',0],['gold','金光',0],['snow','聖誕飄雪',0],['spark','星火',1],['petals','花瓣',3],['howl','狼人咆哮',4],['fire','火焰圈',6],['lightning','閃電',10]];
// [key, name, unlock type ('free'|'games'|'wins'), need, special?]
const PENDANTS = [
  ['wolf', '滿月狼人', 'free', 0], ['pumpkin', '南瓜燈先知', 'free', 0], ['devil', '搗蛋小惡魔', 'free', 0],
  ['crown', '小王冠', 'free', 0], ['bow', '花花蝴蝶結', 'free', 0],
  ['santa', '聖誕小帽', 'free', 0], ['holly', '冬青花環', 'free', 0],
  ['newmoon', '新月狼人', 'games', 1],
  ['halo', '星星光環', 'games', 2], ['egg', '雞蛋仔', 'games', 3], ['ghost', '床單幽靈', 'games', 4], ['witch', '月夜女巫', 'games', 5],
  ['bolo', '菠蘿油', 'games', 6], ['tram', '叮叮電車', 'games', 7], ['bat', '孤影蝙蝠', 'games', 8, 1], ['vampire', '午夜血族', 'games', 12, 1],
  ['plume', '圓桌騎士羽飾', 'wins', 1], ['taxi', '紅色的士', 'wins', 2], ['merlinhat', '梅林法師帽', 'wins', 3, 1],
  ['lotus', '湖中仙女蓮花', 'wins', 5, 1], ['neon', '港式霓虹', 'wins', 6], ['excal', '王者之劍徽章', 'wins', 10, 1],
  ['laurel', 'MVP金桂冠', 'mvp', 10, 1],
  ['foxqiu', '狐祈千秋', 'games', 9], ['foxheart', '狐祈同心', 'games', 15],
  ['starmoon', '星樓望月', 'games', 11], ['starplain', '星垂平野', 'wins', 4],
  ['whiteling', '瑞獸白靈', 'wins', 7], ['darkling', '瑞獸玄靈', 'wins', 8],
  ['skydragon', '龍吟九霄', 'games', 18], ['foxdance', '狐舞月華', 'wins', 9],
  ['frostmirror', '朔雪之映', 'free', 0, 1], ['icesword', '逆光之劍', 'free', 0, 1],
  ['fairylake', '妖精之湖', 'wins', 12], ['odineye', '奧丁之眼', 'wins', 14],
];
const PD_V = 6;
const pdSrc = (k, back) => `/img/pd/${k}${back ? '_b' : ''}.webp?v=${PD_V}`;
const MARK_CROWN = `<span class="mark crown" title="隊長"><span class="halo"></span><i class="glint a"></i><i class="glint b"></i><i class="glint c"></i><svg viewBox="0 0 64 44" width="30" height="20" aria-hidden="true"><path d="M6 36 L12 14 L24 26 L32 6 L40 26 L52 14 L58 36 Z" fill="#f6c445" stroke="#a86b08" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 36 h48 v6 h-48 z" fill="#e8a820" stroke="#a86b08" stroke-width="2"/><circle cx="32" cy="12" r="2.6" fill="#fff8dc"/><circle cx="16" cy="18" r="2.2" fill="#fff8dc"/><circle cx="48" cy="18" r="2.2" fill="#fff8dc"/></svg></span>`;
const MARK_WREATH = `<span class="mark wreath" title="湖中仙女"><span class="glow"></span><svg viewBox="0 0 78 40" width="54" height="26" aria-hidden="true"><path d="M8 34c8-16 18-24 31-24s23 8 31 24" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M8 34c8-16 18-24 31-24s23 8 31 24" fill="none" stroke="#0c7c74" stroke-width="4.2" stroke-linecap="round"/><ellipse cx="16" cy="28" rx="8" ry="4" fill="#b7f3df" stroke="#0c6b5c" stroke-width="1.3" transform="rotate(-32 16 28)"/><ellipse cx="62" cy="28" rx="8" ry="4" fill="#b7f3df" stroke="#0c6b5c" stroke-width="1.3" transform="rotate(32 62 28)"/><ellipse cx="26" cy="16" rx="7" ry="3.3" fill="#7de8c4" stroke="#0c6b5c" stroke-width="1.2" transform="rotate(-52 26 16)"/><ellipse cx="52" cy="16" rx="7" ry="3.3" fill="#7de8c4" stroke="#0c6b5c" stroke-width="1.2" transform="rotate(52 52 16)"/><circle cx="18" cy="22" r="6.2" fill="#fff" stroke="#0c7c74" stroke-width="1.6"/><circle cx="18" cy="22" r="3.1" fill="#ff8fb8"/><circle class="mid" cx="39" cy="8" r="6.6" fill="#fff" stroke="#0c7c74" stroke-width="1.6"/><circle class="mid" cx="39" cy="8" r="3.2" fill="#ff8fb8"/><circle cx="60" cy="22" r="6.2" fill="#fff" stroke="#0c7c74" stroke-width="1.6"/><circle cx="60" cy="22" r="3.1" fill="#ff8fb8"/></svg></span>`;
const MARK_SWORD = `<span class="mark sword" title="王者之劍"><svg viewBox="0 0 28 64" width="16" height="34" aria-hidden="true"><path d="M14 2 L18 10 L16 38 L14 42 L12 38 L10 10 Z" fill="#f4f7fb" stroke="#7d92aa" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 40 h18" stroke="#e0a820" stroke-width="4" stroke-linecap="round"/><rect x="11" y="42" width="6" height="12" rx="1.5" fill="#c4922a"/><circle cx="14" cy="57" r="3.2" fill="#f0c14a" stroke="#a86b08" stroke-width="1"/></svg></span>`;
const MARK_RING = `<span class="mark ring" title="隊員"></span>`;
const MARK_CAST = `<span class="mark cast" title="已投票"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
function markLegend() {
  return `<div class="markleg"><span><i class="crown">${MARK_CROWN}</i>隊長</span><span><i class="wreath">${MARK_WREATH}</i>湖中仙女</span><span><i class="sword">${MARK_SWORD}</i>王者之劍</span><span><i class="ring"></i>隊員</span><span><i class="cast">${MARK_CAST}</i>已投票</span></div>`;
}
const PD_BACK = { devil: 1, bat: 1, vampire: 1, foxqiu: 1, foxheart: 1, starmoon: 1, starplain: 1, whiteling: 1, darkling: 1, skydragon: 1, foxdance: 1, frostmirror: 1, icesword: 1, fairylake: 1, odineye: 1 };
const PD_ICE = { frostmirror: 1, icesword: 1 };
// Sheen theme for every original round frame. Ice keeps its own sweep.
const PD_FX = {
  foxqiu: 'qiu', foxheart: 'heart', starmoon: 'moon', starplain: 'plain',
  whiteling: 'white', darkling: 'dark', skydragon: 'dragon', foxdance: 'dance',
  frostmirror: 'ice', icesword: 'ice', fairylake: 'lake', odineye: 'eye',
};
// A companion only when the frame name names a creature. Stars, snow, sword and the eye stay plain.
const PD_PAL = { foxqiu: 'fox', foxheart: 'fox', foxdance: 'fox', skydragon: 'dragon', whiteling: 'white', darkling: 'dark', fairylake: 'fairy' };
function pdFxCls(k) {
  const fx = PD_FX[k];
  if (!fx) return '';
  return fx === 'ice' ? ' pd-round pd-ice' : ' pd-round pd-sheen pd-sheen-' + fx;
}
const PD_PAL_SVG = {
  fox: `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="tail" d="M12 42c-8 2-10 14-2 16 8 1 14-6 14-12" fill="#f0a04c" stroke="#7a4012" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><ellipse class="fur" cx="30" cy="46" rx="15" ry="11" fill="#f6b25a" stroke="#7a4012" stroke-width="4"/><circle class="fur" cx="44" cy="30" r="12" fill="#f6b25a" stroke="#7a4012" stroke-width="4"/><path class="fur" d="M34 24l2-12 8 10z" fill="#f6b25a" stroke="#7a4012" stroke-width="4" stroke-linejoin="round"/><path class="fur" d="M44 20l6-10 4 12z" fill="#f6b25a" stroke="#7a4012" stroke-width="4" stroke-linejoin="round"/><path class="ear" d="M37 20l1-6 5 6z" fill="#ffd8c4"/><path class="ear" d="M46 16l4-6 3 8z" fill="#ffd8c4"/><circle cx="41" cy="30" r="1.8" fill="#2a2118"/><circle cx="48" cy="30" r="1.8" fill="#2a2118"/><ellipse cx="50" cy="34" rx="3" ry="2.1" fill="#fff6ee"/><circle cx="51" cy="34.2" r="1.2" fill="#e07a86"/></svg>`,
  dragon: `<svg viewBox="0 0 64 64" aria-hidden="true"><path class="body" d="M14 46c2 10 14 12 22 6 6-4 4-12-2-14 8-2 16-10 14-18-3-9-16-10-22-2" fill="#f2c84a" stroke="#8a5c10" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><circle cx="44" cy="24" r="11" fill="#f6d56a" stroke="#8a5c10" stroke-width="4"/><path d="M38 16l-2-9 9 7z" fill="#e8a028" stroke="#8a5c10" stroke-width="3.5" stroke-linejoin="round"/><path d="M52 26c6 0 9 3 11 2" fill="none" stroke="#8a5c10" stroke-width="3" stroke-linecap="round"/><circle cx="47" cy="23" r="1.7" fill="#2a2118"/><path d="M24 44c3 4 10 4 12 0" fill="none" stroke="#fff6d8" stroke-width="3" stroke-linecap="round"/></svg>`,
  fairy: `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="20" cy="30" rx="11" ry="7" fill="#dffaf4" stroke="#1d7a72" stroke-width="3.5"/><ellipse cx="48" cy="30" rx="11" ry="7" fill="#dffaf4" stroke="#1d7a72" stroke-width="3.5"/><path d="M26 40c1 12 16 14 18 2 1-8-6-12-9-12s-10 4-9 10z" fill="#7fd0c8" stroke="#1d7a72" stroke-width="4" stroke-linejoin="round"/><circle cx="35" cy="24" r="11" fill="#ffe3d2" stroke="#1d7a72" stroke-width="4"/><path d="M30 16c2-6 8-6 10 0" fill="#ffe3d2" stroke="#1d7a72" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="24" r="1.6" fill="#1d3a36"/><circle cx="39" cy="24" r="1.6" fill="#1d3a36"/><path d="M33 28c1.2 1.2 3.2 1.2 4.2 0" fill="none" stroke="#c46a78" stroke-width="2" stroke-linecap="round"/></svg>`,
};
function beastSvg(tone) {
  const dark = tone === 'dark';
  const fill = dark ? '#314840' : '#f7f4ee';
  const stroke = dark ? '#101c18' : '#8a7040';
  const horn = dark ? '#8fd8b4' : '#e2b33a';
  const mane = dark ? '#1b2e28' : '#fff';
  const eye = dark ? '#e7fff4' : '#2a2118';
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 38c-6 8 0 16 8 12" fill="${mane}" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/><ellipse cx="32" cy="44" rx="16" ry="11" fill="${fill}" stroke="${stroke}" stroke-width="4"/><circle cx="46" cy="31" r="11" fill="${fill}" stroke="${stroke}" stroke-width="4"/><path d="M42 22l2-11 7 9z" fill="${horn}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/><path d="M18 48v8M26 50v8M36 50v8M44 47v7" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/><circle cx="49" cy="30" r="1.6" fill="${eye}"/><ellipse cx="52" cy="34" rx="2.5" ry="1.7" fill="${dark ? '#d7a0b4' : '#f3c1c8'}"/></svg>`;
}
function pdPalHtml(k) {
  const kind = PD_PAL[k];
  if (!kind) return '';
  const svg = kind === 'white' || kind === 'dark' ? beastSvg(kind) : PD_PAL_SVG[kind];
  return `<span class="pd-pal pd-pal-${kind}" data-pal="${kind}">${svg}</span>`;
}
const PD_IMG = Object.fromEntries(PENDANTS.map(x => [x[0], 1]));
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
if (!LS.getItem('cc.guest')) LS.setItem('cc.guest', pid);
const guestKey = () => LS.getItem('cc.guest') || LS.getItem('cc.pid') || pid;
let token = LS.getItem('cc.token') || '';
let account = null; // {username, guest}
function migrateAvatar(a) { if (!a) return 'fox'; if (EMOJI_MAP[a]) return EMOJI_MAP[a]; if (a === 'photo' || ANIMALS.some(([k]) => k === a) || String(a).startsWith('data:')) return a; return 'fox'; }
let profile = JSON.parse(LS.getItem('cc.profile') || 'null') || { name: LS.getItem('avalon.name') || '', avatar: 'fox', bg: '#ffffff', fx: 'spot', pendant: 'none' };
profile.avatar = migrateAvatar(profile.avatar);
profile.pendant = (profile.pendant && profile.pendant !== 'lion') ? profile.pendant : 'none';
if (profile.pendant && profile.pendant !== 'none' && !PENDANTS.some(x => x[0] === profile.pendant)) profile.pendant = 'none';
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const saveProfile = () => LS.setItem('cc.profile', JSON.stringify(profile));
let skinSel = JSON.parse(LS.getItem('cc.skins') || '{}');
let myStats = { played: 0, won: 0, roles: {}, mvp: 0 };
const authHdr = () => token ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
const api = (url, opt = {}) => fetch(url, { ...opt, headers: { ...authHdr(), ...(opt.headers || {}) } }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) { const err = new Error(j.error || '請求失敗'); err.status = r.status; throw err; } return j; });
function checkAch() { // one-time unlock celebration for 10次MVP
  if (!myStats || (myStats.mvp || 0) < 10 || LS.getItem('cc.ach.mvp10')) return; LS.setItem('cc.ach.mvp10', '1');
  queueModal(() => openModal(`<div class="achpop"><div class="ap-glow"></div><div class="ap-medal">🌈</div><div class="ap-t">成就解鎖</div><h2>10次MVP</h2><div class="small muted center">獎勵：<b>閃光卡牌特效</b> ✨ 同 <b>MVP金桂冠</b> 掛件<br>可以喺「角色皮膚」同「掛件」使用</div>
    <div class="holo-demo rcard good holo"><div class="rart" style="background-image:url(${img(cardBackOf())})"></div></div><button class="btn" id="ok">太好了！</button></div>`, el => { $('#ok', el).onclick = closeModal; }));
}
const refreshStats = () => api('/api/stats').then(s => { myStats = s; checkAch(); return s; }).catch(() => myStats);
const rolePlayed = (r) => isGM() ? 1e9 : (((myStats.roles || {})[r] || {}).played || 0);
const skinOf = (role) => { const s = skinById(skinSel[role]); const played = rolePlayed(role); return s && played >= s.need ? s.id : 'classic'; };
function applyUser(u, stats) {
  if (!u) return;
  const prevGuest = LS.getItem('cc.guest');
  const prevPid = LS.getItem('cc.pid');
  account = u; pid = u.id; LS.setItem('cc.pid', pid);
  if (!prevGuest) LS.setItem('cc.guest', prevPid || pid);
  profile = { id: u.id, name: u.name || profile.name, avatar: u.avatar || profile.avatar, photoUrl: u.photoUrl || null, bg: u.bg || profile.bg, fx: u.fx || profile.fx, pendant: (u.pendant && u.pendant !== 'lion') ? u.pendant : 'none' };
  if (u.skins) skinSel = { ...skinSel, ...u.skins };
  if (stats) { myStats = stats; setTimeout(checkAch, 600); }
  saveProfile(); LS.setItem('cc.skins', JSON.stringify(skinSel));
}
let sessionOk = null; // resolved once per page load; create/join no longer re-fetch /api/me every time
function ensureSession() { if (account && token && sessionOk) return sessionOk; sessionOk = ensureSession0().catch(e => { sessionOk = null; throw e; }); return sessionOk; }
function authIdentity() {
  const guest = guestKey();
  const userId = LS.getItem('cc.pid') || pid || '';
  return { guestKey: guest, userId };
}
async function ensureSession0() {
  if (token) {
    try { const r = await api('/api/me'); applyUser(r.user, r.stats); return r.user; }
    catch (e) {
      if (e.status && e.status !== 401) throw e;
      token = ''; LS.removeItem('cc.token');
    }
  }
  const r = await api('/api/auth/guest', { method: 'POST', body: JSON.stringify({ ...authIdentity(), profile }) });
  token = r.token; LS.setItem('cc.token', token); applyUser(r.user, r.stats); return r.user;
}

// ================= state & socket =================
let S = null, view = 'home', viewArg = null;
let heldRoom = null, waitingRoom = null;
try { heldRoom = JSON.parse(sessionStorage.getItem('cc.held') || 'null'); if (!heldRoom || !heldRoom.code) heldRoom = null; } catch (e) { heldRoom = null; }
function saveHeld() {
  try {
    if (heldRoom && heldRoom.code) sessionStorage.setItem('cc.held', JSON.stringify({ code: heldRoom.code, seated: !!heldRoom.seated }));
    else sessionStorage.removeItem('cc.held');
  } catch (e) {}
}
function clearHeld() { heldRoom = null; waitingRoom = null; saveHeld(); }
const browsingView = (v) => v === 'skins' || v === 'rules' || v === 'ach' || v === 'board' || v === 'history' || v === 'stats' || v === 'detail';
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

ensureSession().then(() => { if (view === 'home') render(); }).catch(() => {}); // start auth in parallel with the socket handshake
// polling-first then upgrade: measured faster first connect through Render/Cloudflare (≈2 RTT vs ≈4 RTT for a direct WS handshake)
const socket = io({ transports: ['polling', 'websocket'], query: { diff: '1' } });
const helloProfile = () => ({ name: profile.name, avatar: profile.avatar, bg: profile.bg, fx: profile.fx, pendant: profile.pendant });
socket.on('connect', () => {
  $('#conn').classList.add('on');
  ensureSession().then(() => {
    socket.emit('hello', { token, ...authIdentity(), ...helloProfile() }, (r) => {
      if (r && r.user) applyUser(r.user);
      if (r && r.room) {
        heldRoom = { code: r.room, seated: !!r.seated };
        saveHeld();
        autoRoom = false;
        waitingRoom = r.room;
        if (!browsingView(view)) view = 'room';
        socket.emit('resync');
      } else if (r && !r.error) {
        clearHeld();
        S = null;
        if (view === 'room') view = 'home';
      }
      if (pendingJoin) { const c = pendingJoin; pendingJoin = null; ensureName(() => joinRoom(c)); }
      if (pendingGame) { const gid = pendingGame; pendingGame = null; return go('detail', { gid, from: 'home' }); }
      if (view === 'skins' || view === 'rules' || view === 'ach' || view === 'board') return; // keep selection UI / scroll
      render();
    });
  }).catch(e => toast(e.message || '無法連線至伺服器'));
});
socket.on('disconnect', () => { $('#conn').classList.remove('on'); if (window.AvalonVoice) AvalonVoice.roomOff(); });
if (window.AvalonVoice) AvalonVoice.attach(socket, {
  myId: () => (S && S.meId) || '',
  seated: () => !!(S && S.mySeat && !S.spectating),
  inRoom: () => !!(S && S.code),
  mode: () => !!(S && S.settings && S.settings.mic === true),
});
let wakeT = setTimeout(() => { if (!socket.connected) $('#wake').classList.remove('hidden'); }, 2500);
socket.on('connect', () => { clearTimeout(wakeT); $('#wake').classList.add('hidden'); });
function refreshRoom() {
  toast('重新同步中…'); sessionStorage.removeItem('cc.modalq');
  socket.once('state', () => toast('已同步最新房間狀態 ✓'));
  socket.disconnect(); setTimeout(() => socket.connect(), 250);
}
// ---- emotes ----
const EMOTES = ['1f602','1f62d','1f631','1f914','1f60e','1f621','1f64f','1f44d','1f44f','1f525','2764_fe0f','1f608','1f92b','1f440','1f389'];
const emoChar = (c) => String.fromCodePoint(...c.split('_').map(h => parseInt(h, 16)));
const emoImg = (c, sz) => `<img src="https://fonts.gstatic.com/s/e/notoemoji/latest/${c}/512.webp" alt="${emoChar(c)}" width="${sz}" height="${sz}" loading="lazy" decoding="async" onerror="this.replaceWith(document.createTextNode(this.alt))">`;
let emoLast = 0;
function closeEmotes() { const p = document.getElementById('emopop'); if (p) p.remove(); document.removeEventListener('pointerdown', emoOutside, true); }
function emoOutside(e) { const p = document.getElementById('emopop'); if (p && !p.contains(e.target) && !e.target.closest('.emote-btn')) closeEmotes(); }
function toggleEmotes(btn) {
  if (document.getElementById('emopop')) return closeEmotes();
  const r = btn.getBoundingClientRect(); const pop = document.createElement('div'); pop.id = 'emopop'; pop.className = 'emopop';
  pop.innerHTML = EMOTES.map(c => `<button data-e="${c}">${emoImg(c, 34)}</button>`).join('');
  pop.style.top = (r.bottom + 8) + 'px'; pop.style.right = Math.max(8, innerWidth - r.right) + 'px';
  document.body.appendChild(pop);
  pop.onclick = (e) => { const b = e.target.closest('[data-e]'); if (!b) return; const now = Date.now();
    if (now - emoLast < 2000) return toast('慢少少，2 秒後再發'); emoLast = now; socket.emit('emote', { e: b.dataset.e }); closeEmotes(); };
  setTimeout(() => document.addEventListener('pointerdown', emoOutside, true), 0);
}
socket.on('emote', ({ id, e } = {}) => {
  if (!EMOTES.includes(e)) return;
  const st = Array.from(document.querySelectorAll('.rt .st[data-sid]')).find(x => x.dataset.sid === id && x.offsetParent); if (!st) return;
  const a = (st.querySelector('.av') || st).getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'emofly'; el.innerHTML = emoImg(e, 52);
  el.style.left = (a.left + a.width / 2 - 26) + 'px'; el.style.top = (a.top - 50) + 'px';
  document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
});
socket.on('state', (st) => {
  if (st && st.__d) { // merge a diff into the current state
    if (!S || S.code !== st.code) return socket.emit('resync');
    const m = { ...S }; for (const k in st) if (k !== '__d' && k !== '__r' && k !== '__g') m[k] = st[k];
    (st.__r || []).forEach(k => delete m[k]);
    if (st.__g) { const g = { ...(m.game || {}) }; for (const k in st.__g) if (k !== '__r') g[k] = st.__g[k]; (st.__g.__r || []).forEach(k => delete g[k]); m.game = g; }
    st = m;
  }
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
  if (waitingRoom && st.code === waitingRoom) waitingRoom = null;
  if (st.code) {
    const seated = !st.spectating && !!(st.mySeat || (st.game && st.game.me));
    heldRoom = { code: st.code, seated };
    saveHeld();
  }
  if (window.AvalonVoice) AvalonVoice.sync(st);
  if (st && st.myAvoidResult && st.myAvoidResult.gid) {
    const prevR = prev && prev.myAvoidResult;
    if (!prevR || prevR.gid !== st.myAvoidResult.gid) {
      const r = st.myAvoidResult;
      const nm = (ROLE[r.role] && ROLE[r.role].n) || '';
      if (r.status === 'applied') toast(isGM() ? `已避開${nm}（GM 無限，冇扣減）` : `已避開${nm}，開局扣咗 1 張迴避卡`, 'ok');
      else if (r.status === 'conflict') toast(`今局避開唔到${nm}，冇扣卡`);
      else if (r.status === 'inactive') toast(`${nm}唔喺本局陣容，冇扣卡`);
      else if (r.status === 'insufficient') toast('冇迴避卡，今局冇套用');
    }
  }
  if (autoRoom && view === 'home' && st.code) { autoRoom = false; view = 'room'; }
  handleEvent(st);
  if (actConfirm && !actConfirm.busy && !confirmStillValid(actConfirm)) {
    toast(actConfirm.kind === 'lady' ? '查驗已經失效' : '刺殺已經失效', 'bad');
    closeModal();
  }
  if (abortAsk && !abortAsk.busy && (!st.game || st.game.phase === 'end' || !st.isHost)) closeModal();
  if (view === 'room' || view === 'home') render();
  if (cfgOpen && !st.game && !$('#modal').classList.contains('hidden')) $('#sheet').innerHTML = cfgSheetHtml();
  syncVoteRemind();
});
socket.on('kicked', () => { S = null; clearHeld(); toast('你已被房主移出房間'); go('home'); });
socket.on('dissolved', () => { S = null; clearHeld(); toast('房間已解散'); go('home'); });
const emit = (ev, data) => new Promise((res) => socket.emit(ev, data, (r) => {
  if (r && r.stillSeated && r.room) { heldRoom = { code: r.room, seated: true }; saveHeld(); }
  if (r && r.abandoned) clearHeld();
  if (r && r.error) toast(r.error);
  if (r && r.dissolved) { S = null; clearHeld(); go('home'); }
  res(r || {});
}));
const act = (type, data) => emit('act', { type, data });

// ================= helpers =================
let toastT;
function toast(msg, kind) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (kind ? ' ' + kind : ''); t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), kind ? 2800 : 2200); }
let modalLock = false;
let actConfirm = null;
let abortAsk = null;
let actKeyHandler = null;
function openModal(html, onMount, lock) { modalLock = !!lock; $('#sheet').innerHTML = html; $('#modal').classList.remove('hidden'); onMount && onMount($('#sheet')); }
let cfgOpen = false;
function closeModal() {
  cfgOpen = false;
  if (actKeyHandler) { document.removeEventListener('keydown', actKeyHandler, true); actKeyHandler = null; }
  actConfirm = null;
  abortAsk = null;
  const more = document.querySelector('.top-more');
  if (more) more.setAttribute('aria-expanded', 'false');
  $('#modal').classList.add('hidden'); $('#sheet').innerHTML = ''; modalLock = false; modalQueueNext();
}
function confirmStillValid(c) {
  const g = S && S.game; const me = g && g.me;
  if (!g || !me || !c || g.phase !== c.phase) return false;
  const target = g.seats.find(s => s && s.id === c.id);
  if (!target || target.id === S.meId) return false;
  if (c.kind === 'lady') return g.phase === 'lady' && g.ladyId === S.meId && !(g.ladyUsed || []).includes(target.id);
  return g.phase === 'assassin' && me.role === 'assassin' && !target.evil;
}
function openActConfirm(kind) {
  const g = S && S.game;
  const id = [...selected][0];
  if (!g || !id) return;
  const draft = { kind, id, phase: g.phase, busy: false };
  if (!confirmStillValid(draft)) return toast(kind === 'lady' ? '現在不能查驗這位騎士' : '現在不能刺殺這位騎士', 'bad');
  const target = g.seats.find(s => s.id === id);
  const seatNo = target.seat || (g.seats.findIndex(s => s.id === id) + 1);
  const lady = kind === 'lady';
  actConfirm = draft;
  openModal(`<div class="actconf ${lady ? 'lake' : 'slay'}" id="actconf" role="dialog" aria-modal="true" aria-labelledby="actconf-title">
    <h2 id="actconf-title">${lady ? '查驗這位騎士？' : '刺殺這位騎士？'}</h2>
    <div class="actconf-who">${av(target, 84)}<div class="actconf-meta"><b>${esc(target.name)}</b><span>${seatNo}號</span></div></div>
    <p class="actconf-note" id="actconf-note">${lady ? '只有你會看到陣營。取消不會查驗。' : '刺中梅林紅方勝，刺錯藍方勝。取消不會刺殺。'}</p>
    <div class="actconf-btns"><button type="button" class="btn ghost" id="act-cancel">取消</button><button type="button" class="btn ${lady ? '' : 'evil'}" id="act-ok">${lady ? '確認查驗' : '確認刺殺'}</button></div>
  </div>`, (el) => {
    const cancel = $('#act-cancel', el);
    const ok = $('#act-ok', el);
    const stop = (e) => { if (actConfirm && actConfirm.busy) { e.preventDefault(); return; } e.preventDefault(); closeModal(); };
    cancel.onclick = () => { if (actConfirm && actConfirm.busy) return; closeModal(); };
    ok.onclick = async () => {
      if (!actConfirm || actConfirm.busy || ok.disabled) return;
      if (!confirmStillValid(actConfirm)) { toast(lady ? '查驗已經失效' : '刺殺已經失效', 'bad'); closeModal(); return; }
      actConfirm.busy = true; ok.disabled = true; cancel.disabled = true; modalLock = true;
      const idNow = actConfirm.id;
      const r = await act(lady ? 'lady' : 'assassinate', { id: idNow });
      if (r && r.ok) selected = new Set();
      closeModal();
    };
    actKeyHandler = (e) => {
      if (!$('#actconf')) return;
      if (e.key === 'Escape') return stop(e);
      if (e.key !== 'Tab') return;
      const items = [cancel, ok].filter(b => !b.disabled);
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    };
    document.addEventListener('keydown', actKeyHandler, true);
    if (cancel.focus) cancel.focus();
  });
}
function trapSheetKeys(el, onEsc) {
  if (actKeyHandler) { document.removeEventListener('keydown', actKeyHandler, true); actKeyHandler = null; }
  actKeyHandler = (e) => {
    if (!el.isConnected) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEsc(e); return; }
    if (e.key !== 'Tab') return;
    const items = [...el.querySelectorAll('button, a[href], input, [tabindex]')].filter(b => !b.disabled && b.tabIndex !== -1);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i < 0 || i >= items.length - 1 ? 0 : i + 1);
    items[next].focus();
  };
  document.addEventListener('keydown', actKeyHandler, true);
}
function openAbortConfirm() {
  if (!S || !S.isHost || !S.game || S.game.phase === 'end') return;
  abortAsk = { busy: false };
  openModal(`<div class="actconf abort" id="actconf" role="dialog" aria-modal="true" aria-labelledby="abort-title">
    <h2 id="abort-title">強制結束本局？</h2>
    <p class="actconf-note">這會立刻中止進行中的對局，不計入記錄、不計分、不派回避卡。取消不會結束。</p>
    <div class="actconf-btns"><button type="button" class="btn ghost" id="act-cancel">取消</button><button type="button" class="btn evil" id="act-ok">確認結束</button></div>
  </div>`, (el) => {
    const cancel = $('#act-cancel', el);
    const ok = $('#act-ok', el);
    const dismiss = () => { if (abortAsk && abortAsk.busy) return; closeModal(); };
    cancel.onclick = (e) => { e.preventDefault(); dismiss(); };
    ok.onclick = async (e) => {
      e.preventDefault();
      if (!abortAsk || abortAsk.busy || ok.disabled) return;
      if (!S || !S.isHost || !S.game || S.game.phase === 'end') { closeModal(); return; }
      abortAsk.busy = true; ok.disabled = true; cancel.disabled = true; modalLock = true;
      const r = await act('abort');
      closeModal();
      if (r && r.ok) toast('本局已結束，不計入記錄');
    };
    trapSheetKeys(el, dismiss);
    if (cancel.focus) cancel.focus();
  });
}
function openReleaseList() {
  if (!S || !S.isHost) return;
  const live = !!(S.game && S.game.phase !== 'end');
  const people = ((live ? S.game.seats : S.seats) || []).filter(p => p && !p.empty && !p.claimable && p.id);
  if (!people.length) return toast('沒有可釋出的座位');
  openModal(`<div class="actconf release" role="dialog" aria-modal="true" aria-labelledby="rel-list-title">
    <h2 id="rel-list-title">釋出座位</h2>
    <p class="actconf-note">選擇一個座位。不會公開身份。</p>
    <div class="pick">${people.map(p => `<button type="button" class="pick-i" data-id="${p.id}">${av(p, 40)}<div><b>${esc(p.name)}</b><div class="tiny muted">${p.seat || ''}號座${p.online === false ? ' · 離線' : ''}</div></div></button>`).join('')}</div>
    <button type="button" class="btn ghost" id="rel-list-x">取消</button>
  </div>`, (el) => {
    el.querySelectorAll('.pick-i').forEach(b => b.onclick = (e) => { e.preventDefault(); const id = b.dataset.id; closeModal(); openReleaseConfirm(id); });
    $('#rel-list-x', el).onclick = (e) => { e.preventDefault(); closeModal(); };
  });
}
function openReleaseConfirm(id) {
  if (!S || !S.isHost || !id) return;
  const pool = (S.game && S.game.phase !== 'end' ? S.game.seats : S.seats) || [];
  const p = pool.find(x => x && !x.empty && x.id === id) || (S.seats || []).find(x => x && !x.empty && x.id === id);
  if (!p) return;
  const self = id === S.meId;
  const live = !!(S.game && S.game.phase !== 'end');
  const note = self
    ? '釋出後你會離開這個座位。若還有其他已就座玩家，房主會交給下一位。'
    : (live
      ? '這位玩家會離開座位，但本局身份與進度留在座位上，其他人可以接手。確認畫面不會公開身份。'
      : '釋出後這個座位會空出來。對方仍留在房間，可以再坐其他空位。');
  const ask = { busy: false };
  openModal(`<div class="actconf release" id="actconf" role="dialog" aria-modal="true" aria-labelledby="rel-title">
    <h2 id="rel-title">釋出座位？</h2>
    <div class="actconf-who">${av(p, 72)}<div class="actconf-meta"><b>${esc(p.name)}</b><span>${p.seat || ''}號</span></div></div>
    <p class="actconf-note">${note}</p>
    <div class="actconf-btns"><button type="button" class="btn ghost" id="rel-cancel">取消</button><button type="button" class="btn" id="rel-ok">釋出座位</button></div>
  </div>`, (el) => {
    const cancel = $('#rel-cancel', el);
    const ok = $('#rel-ok', el);
    const dismiss = () => { if (ask.busy) return; closeModal(); };
    cancel.onclick = (e) => { e.preventDefault(); dismiss(); };
    ok.onclick = async (e) => {
      e.preventDefault();
      if (ask.busy || ok.disabled) return;
      if (!S || !S.isHost) { closeModal(); return; }
      ask.busy = true; ok.disabled = true; cancel.disabled = true; modalLock = true;
      await act('release', { id });
      closeModal();
    };
    trapSheetKeys(el, dismiss);
    if (cancel.focus) cancel.focus();
  });
}
function openSeizeConfirm() {
  if (!S || !S.code || S.isHost || !isGM()) return;
  const host = (S.seats || []).find(p => p && !p.empty && (p.isHost || p.id === S.hostId))
    || ((S.game && S.game.seats) || []).find(p => p && p.id === S.hostId);
  const ask = { busy: false };
  const who = host ? `<div class="actconf-who">${av(host, 72)}<div class="actconf-meta"><b>${esc(host.name)}</b><span>${host.seat ? host.seat + '號 · 現任房主' : '現任房主'}</span></div></div>` : '';
  openModal(`<div class="actconf release" id="actconf" role="dialog" aria-modal="true" aria-labelledby="seize-title">
    <h2 id="seize-title">搶房主？</h2>
    ${who}
    <p class="actconf-note">你會成為房主，原本的房主會失去開始、結束同房間設定等權限。座位、身份同對局不會改變。</p>
    <div class="actconf-btns"><button type="button" class="btn ghost" id="seize-cancel">取消</button><button type="button" class="btn" id="seize-ok">搶房主</button></div>
  </div>`, (el) => {
    const cancel = $('#seize-cancel', el);
    const ok = $('#seize-ok', el);
    const dismiss = () => { if (ask.busy) return; closeModal(); };
    cancel.onclick = (e) => { e.preventDefault(); dismiss(); };
    ok.onclick = async (e) => {
      e.preventDefault();
      if (ask.busy || ok.disabled) return;
      if (!S || !S.code || S.isHost || !isGM()) { closeModal(); return; }
      ask.busy = true; ok.disabled = true; cancel.disabled = true; modalLock = true;
      const r = await act('seize', {});
      closeModal();
      if (r && r.error) toast(r.error);
      else if (r && r.ok) toast('你現在是房主');
    };
    trapSheetKeys(el, dismiss);
    if (cancel.focus) cancel.focus();
  });
}
function openRoomMenu() {
  if (!S || !S.code) return;
  const live = !!(S.game && S.game.phase !== 'end');
  const inGame = !!S.game;
  const row = (x, ic, ti, sub, cls = '') => `<button type="button" class="mrow ${cls}" data-x="${x}"><span class="mic" aria-hidden="true">${ic}</span><span class="grow"><b>${ti}</b><span>${sub}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
  const more = document.querySelector('.top-more');
  if (more) more.setAttribute('aria-expanded', 'true');
  openModal(`<div class="room-menu" role="dialog" aria-modal="true" aria-labelledby="room-menu-title">
    <h2 id="room-menu-title">房間選單</h2><div class="mlist">
    ${row('rules', '📖', '查看規則', '遊戲流程、角色能力、擴展玩法')}
    ${row('ref', '🔄', '刷新房間', '畫面唔同步或卡住時，重新連線並向伺服器攞最新狀態')}
    ${isGM() && !S.isHost ? row('seize', '👑', '搶房主', '接手房主權限，座位同對局保持不變') : ''}
    ${inGame ? row('qr', '▣', '房間二維碼', '出示房間號同二維碼，朋友掃碼入房') : ''}
    ${inGame ? row('home', '‹', '返回主頁', '回到主頁，座位同房間仍然保留') : ''}
    ${S.isHost ? row('tr', '👑', '轉讓房主', '交俾另一位玩家，之後你可以離開') : ''}
    ${S.isHost && live ? row('early', '🏳️', '提前結束', '即時結束本局並公開所有身份，不計勝負', 'warn') : ''}
    ${S.isHost && live ? row('abort', '⛔', '強制結束本局', '立刻中止，不計入記錄', 'danger') : ''}
    ${S.isHost && !live ? row('dis', '⛔', '解散房間', '所有玩家會被移出房間', 'danger') : ''}
    </div><button type="button" class="btn ghost" id="room-menu-close">關閉</button></div>`, (el) => {
    const bind = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fn(); }; };
    bind('[data-x=rules]', () => { closeModal(); go('rules'); });
    bind('[data-x=ref]', () => { closeModal(); refreshRoom(); });
    bind('[data-x=seize]', () => openSeizeConfirm());
    bind('[data-x=qr]', () => { closeModal(); inviteDialog(); });
    bind('[data-x=home]', () => { closeModal(); go('home'); });
    bind('[data-x=abort]', () => openAbortConfirm());
    const ee = el.querySelector('[data-x=early]'); if (ee) ee.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (confirm('確定提前結束本局？\n所有人身份會公開，今局記錄為「提前結束」，不計勝負、不計分、不派回避卡。')) { closeModal(); act('endearly'); } };
    const tr = el.querySelector('[data-x=tr]'); if (tr) tr.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const others = (S.seats || []).filter(p => p && !p.empty && p.id !== S.meId);
      if (!others.length) return toast('還沒有其他已就座的玩家');
      openModal(`<h2>轉讓房主</h2><div class="small muted center">選擇一位已就座的玩家，房主權限會即時轉移</div><div class="pick">${others.map(p => `<button class="pick-i" data-id="${p.id}">${av(p, 40)}<div><b>${esc(p.name)}</b><div class="tiny muted">${p.seat}號座${p.online ? '' : ' · 離線'}</div></div></button>`).join('')}</div><button class="btn ghost" id="cc">取消</button>`, el3 => {
        $$('.pick-i', el3).forEach(b => b.onclick = async () => { const p = others.find(o => o.id === b.dataset.id); if (!confirm(`把房主轉讓給 ${p.name}？`)) return; closeModal(); const r = await act('transfer', { id: p.id }); if (r.ok) toast(`已轉讓房主給 ${p.name}`); });
        $('#cc', el3).onclick = closeModal;
      });
    };
    const dis = el.querySelector('[data-x=dis]'); if (dis) dis.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (confirm('確定解散房間？所有人將被移出。')) { closeModal(); act('dissolve'); } };
    $('#room-menu-close', el).onclick = (e) => { e.preventDefault(); closeModal(); };
    trapSheetKeys(el, () => closeModal());
    const first = el.querySelector('.mrow');
    if (first && first.focus) first.focus({ preventScroll: true });
  });
}
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
  if (p._photo && p.avatar === 'photo') return p._photo;
  if (p.photoUrl && (p.avatar === 'photo' || !p.avatar)) return p.photoUrl;
  if (p.avatar === 'photo' || (p.avatar && String(p.avatar).startsWith('data:'))) return p.avatar.startsWith('data:') ? p.avatar : '/api/avatar/' + (p.id || '');
  const key = migrateAvatar(p.avatar);
  return key === 'photo' ? (p.photoUrl || '') : `/img/av/${key}.webp`;
}
function pendantHtml(p) {
  const k = (p && p.pendant) || 'none'; if (!PD_IMG[k]) return '';
  // All pendant art is a sibling overlay IN FRONT of the clipped photo (never inside .av).
  return `<img class="pov${PD_ICE[k] ? ' ice' : ''}" src="${pdSrc(k)}" alt="" loading="lazy" decoding="async">`;
}
const pendantBack = (p) => { const k = (p && p.pendant) || 'none'; return PD_BACK[k] ? `<img class="pov back" src="${pdSrc(k, 1)}" alt="" loading="lazy" decoding="async">` : ''; };
function faceCirc(p) {
  return `<span class="pdcirc"><img src="${esc(photoSrc(p))}" alt=""></span>`;
}
function av(p, size = 36) {
  const src = esc(photoSrc(p));
  const bg = esc((p && p.bg) || '#ffffff');
  const k = (p && p.pendant) || 'none';
  // Photo/circle is clipped inside .av only. Pendant overlays and the companion sit higher in an unclipped wrapper.
  return `<span class="av-wrap${pdFxCls(k)}">${pendantBack(p)}<span class="av s${size}" style="width:${size}px;height:${size}px;background:${bg}"><img src="${src}" alt="" width="${size}" height="${size}" decoding="async"></span>${pendantHtml(p)}${pdPalHtml(k)}</span>`;
}
const chip = (id, list) => { const p = P(id, list); return `<span class="chip">${av(p, 22)}${esc(p.name)}</span>`; };
function voteTeamHtml(ids) {
  return `<div class="vote-team">${(ids || []).map(id => {
    const p = P(id);
    const no = p.seat || '?';
    return `<span class="chip">${av(p, 22)}<b class="seatno">${esc(String(no))}號</b>${esc(p.name)}</span>`;
  }).join('')}</div>`;
}
const fmtTime = (t) => { const d = new Date(t); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
let PUBLIC_ORIGIN = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) ? 'https://avalon-roundtable-10t9.onrender.com' : location.origin;
fetch('/api/config').then(r => r.json()).then(c => { if (c.publicUrl && PUBLIC_ORIGIN !== location.origin) PUBLIC_ORIGIN = c.publicUrl; }).catch(() => {});
const inviteUrl = (code) => `${PUBLIC_ORIGIN}/r/${code}`;
const pct = (w, p) => p ? Math.round(w * 100 / p) : 0;
const isGM = () => !!(account && account.gm);
const playedTotal = () => isGM() ? 1e9 : (myStats.played || 0);
const winsTotal = () => isGM() ? 1e9 : (myStats.won || 0);
const mvpTotal = () => (myStats.mvp || 0); // even GM must earn 10 real MVPs for 桂冠 / 閃光特效
const vetoAmt = (n) => (isGM() || n >= 999) ? '∞' : (n == null ? '–' : String(n));

// ================= profile =================
function fxUnlocked(k) { const item = FXS.find(x => x[0] === k); return playedTotal() >= (item ? item[2] : 0); }
function pdUnlocked(k) { if (k === 'none') return true; const it = PENDANTS.find(x => x[0] === k); if (!it) return false; return unlockOk(it[2], it[3]); }
const pdNeed = (it) => it[2] === 'wins' ? `勝 ${it[3]} 場解鎖` : it[2] === 'mvp' ? `MVP ${Math.min(mvpTotal(), it[3])}/${it[3]} 解鎖` : `玩 ${it[3]} 場解鎖`;
function pdCell(k, n, sel, locked, sp, sub) {
  const fx = pdFxCls(k);
  return `<button class="pdc ${sel ? 'sel' : ''} ${locked ? 'off' : ''}" data-pd="${k}">${sp ? '<span class="sp">✨</span>' : ''}${sel ? '<span class="ck">✓</span>' : ''}${locked ? '<span class="lk">🔒</span>' : ''}<div class="pdv${fx}">${k === 'none' ? '<span class="pdx">不佩戴</span>' : `${PD_BACK[k] ? `<img class="pov back" src="${pdSrc(k, 1)}" alt="">` : ''}${faceCirc(profile)}<img class="pov${PD_ICE[k] ? ' ice' : ''}" src="${pdSrc(k)}" alt="">${pdPalHtml(k)}`}</div><b>${n}</b>${sub ? `<i>${sub}</i>` : ''}</button>`;
}
function pdPickerHtml(d) {
  const have = PENDANTS.filter(x => pdUnlocked(x[0])), lack = PENDANTS.filter(x => !pdUnlocked(x[0]));
  return `<div class="pdgrid">${pdCell('none', '不佩戴', !d.pendant || d.pendant === 'none')}${have.map(x => pdCell(x[0], x[1], d.pendant === x[0], false, x[4])).join('')}</div>
    ${lack.length ? `<div class="pdh">還未拿到</div><div class="pdgrid">${lack.map(x => pdCell(x[0], x[1], false, true, x[4], pdNeed(x))).join('')}</div>` : ''}`;
}
function previewHtml(d) {
  return `<div class="preview-stage ${d.fx && d.fx !== 'none' ? 'enter fx-' + d.fx : ''}">${av(d, 56)}<div class="nm gold" style="position:absolute;bottom:10px">${esc(d.name || '騎士')}</div></div>`;
}

// Circular photo crop (before upload). Gestures stay on the crop stage only.
async function loadOrientedBitmap(file) {
  const url = URL.createObjectURL(file);
  const bake = (src, w, h) => {
    const max = 2048, k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    if (src.close) try { src.close(); } catch (e) {}
    return c;
  };
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        URL.revokeObjectURL(url);
        return bake(bmp, bmp.width, bmp.height);
      } catch (e) { /* fall through */ }
    }
    const im = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('img'));
      i.src = url;
    });
    URL.revokeObjectURL(url);
    // Fallback JPEG EXIF orientation when createImageBitmap is unavailable
    let ori = 1;
    try {
      const buf = await file.slice(0, 64 * 1024).arrayBuffer();
      const v = new DataView(buf);
      if (v.getUint16(0) === 0xFFD8) {
        let off = 2;
        while (off + 4 < v.byteLength) {
          const mark = v.getUint16(off); off += 2;
          if (mark === 0xFFDA) break;
          const len = v.getUint16(off); off += 2;
          if (mark === 0xFFE1 && off + 8 < v.byteLength && v.getUint32(off) === 0x45786966 && v.getUint16(off + 4) === 0) {
            const tiff = off + 6;
            const le = v.getUint16(tiff) === 0x4949;
            const u16 = (o) => le ? v.getUint16(o, true) : v.getUint16(o, false);
            const u32 = (o) => le ? v.getUint32(o, true) : v.getUint32(o, false);
            const ifd = tiff + u32(tiff + 4);
            const n = u16(ifd);
            for (let i = 0; i < n; i++) {
              const e = ifd + 2 + i * 12;
              if (u16(e) === 0x0112) { ori = u16(e + 8); break; }
            }
          }
          off += len - 2;
        }
      }
    } catch (e) { ori = 1; }
    if (ori === 1) return bake(im, im.naturalWidth, im.naturalHeight);
    const w = im.naturalWidth, h = im.naturalHeight;
    const swap = ori >= 5 && ori <= 8;
    const src = document.createElement('canvas');
    src.width = swap ? h : w; src.height = swap ? w : h;
    const x = src.getContext('2d');
    const map = { 2: [ -1, 0, 0, 1, w, 0 ], 3: [ -1, 0, 0, -1, w, h ], 4: [ 1, 0, 0, -1, 0, h ], 5: [ 0, 1, 1, 0, 0, 0 ], 6: [ 0, 1, -1, 0, h, 0 ], 7: [ 0, -1, -1, 0, h, w ], 8: [ 0, -1, 1, 0, 0, w ] };
    const m = map[ori];
    if (m) { x.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); }
    x.drawImage(im, 0, 0);
    return bake(src, src.width, src.height);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function openPhotoCrop(bitmap, opts) {
  const prev = document.getElementById('cropov');
  if (prev) prev.remove();
  const iw = bitmap.width, ih = bitmap.height;
  const ov = document.createElement('div');
  ov.id = 'cropov';
  ov.className = 'crop-ov';
  ov.innerHTML = `<div class="crop-sheet" role="dialog" aria-modal="true" aria-labelledby="croptitle">
    <h2 id="croptitle">裁剪頭像</h2>
    <p class="crop-hint">拖動調整位置；雙指或下方滑桿縮放。圓圈入面就係最後頭像。</p>
    <div class="crop-stage" id="cropstage">
      <img class="crop-img" id="cropimg" alt="">
      <div class="crop-mask" id="cropmask"></div>
      <div class="crop-ring" id="cropring"></div>
    </div>
    <div class="crop-zoom">
      <button type="button" id="cropzout" aria-label="縮小">−</button>
      <input type="range" id="cropzoom" min="0" max="100" value="0" aria-label="縮放">
      <button type="button" id="cropzin" aria-label="放大">+</button>
    </div>
    <div class="crop-btns">
      <button type="button" class="btn ghost" id="cropcancel">取消</button>
      <button type="button" class="btn" id="cropok">確定</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  const stage = $('#cropstage', ov);
  const imgEl = $('#cropimg', ov);
  const ring = $('#cropring', ov);
  const slider = $('#cropzoom', ov);
  imgEl.src = bitmap.toDataURL('image/jpeg', 0.92);
  const pend = (opts && opts.pendant) || 'none';
  if (pend && pend !== 'none' && PD_IMG[pend]) {
    ring.className = 'crop-ring' + pdFxCls(pend);
    ring.innerHTML = `${PD_BACK[pend] ? `<img class="pov back" src="${pdSrc(pend, 1)}" alt="">` : ''}<img class="pov${PD_ICE[pend] ? ' ice' : ''}" src="${pdSrc(pend)}" alt="">${pdPalHtml(pend)}`;
  }
  const layout = () => {
    const wr = stage.getBoundingClientRect();
    const S = Math.min(wr.width, wr.height);
    const D = S * 0.6; // crop circle = 60% of overlay, same as worn pendant math
    return { S, D, R: D / 2 };
  };
  const minScale = () => {
    const { D } = layout();
    return Math.max(D / iw, D / ih);
  };
  const maxScale = () => minScale() * 4;
  let scale = minScale();
  let px = 0, py = 0; // image centre offset from circle centre
  const clampPan = () => {
    const { D } = layout();
    const W = iw * scale, H = ih * scale, R = D / 2;
    const maxX = Math.max(0, W / 2 - R), maxY = Math.max(0, H / 2 - R);
    px = Math.min(maxX, Math.max(-maxX, px));
    py = Math.min(maxY, Math.max(-maxY, py));
  };
  const apply = () => {
    const { S, D } = layout();
    const cx = S / 2, cy = S / 2;
    const W = iw * scale, H = ih * scale;
    imgEl.style.width = W + 'px';
    imgEl.style.height = H + 'px';
    imgEl.style.left = (cx + px - W / 2) + 'px';
    imgEl.style.top = (cy + py - H / 2) + 'px';
    const t = ((scale - minScale()) / (maxScale() - minScale() || 1)) * 100;
    slider.value = String(Math.round(Math.min(100, Math.max(0, t))));
  };
  const setScale = (next, around) => {
    const { S } = layout();
    const old = scale;
    scale = Math.min(maxScale(), Math.max(minScale(), next));
    if (around && old > 0) {
      const cx = S / 2, cy = S / 2;
      const ax = around.x - cx, ay = around.y - cy;
      // keep the image point under `around` stable
      const k = scale / old;
      px = ax - (ax - px) * k;
      py = ay - (ay - py) * k;
    }
    clampPan();
    apply();
  };
  const onResize = () => { scale = Math.max(scale, minScale()); clampPan(); apply(); };
  requestAnimationFrame(() => { scale = minScale(); px = 0; py = 0; apply(); });
  window.addEventListener('resize', onResize);

  // Pointer gestures isolated to the stage (touch-action:none there only)
  const ptrs = new Map();
  let lastPinch = 0, lastMid = null, dragging = false, lastX = 0, lastY = 0;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
    if (ptrs.size === 2) {
      dragging = false;
      const [a, b] = [...ptrs.values()];
      lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
      const r = stage.getBoundingClientRect();
      lastMid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && lastPinch) {
      const [a, b] = [...ptrs.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = stage.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
      if (dist > 0 && lastPinch > 0) setScale(scale * (dist / lastPinch), mid);
      lastPinch = dist;
      lastMid = mid;
    } else if (dragging && ptrs.size === 1) {
      px += e.clientX - lastX;
      py += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      clampPan(); apply();
    }
  });
  const endPtr = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) lastPinch = 0;
    if (ptrs.size === 0) dragging = false;
    try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
  };
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setScale(scale * factor, { x: e.clientX - r.left, y: e.clientY - r.top });
  }, { passive: false });

  slider.addEventListener('input', () => {
    const t = Number(slider.value) / 100;
    setScale(minScale() + t * (maxScale() - minScale()));
  });
  $('#cropzin', ov).onclick = () => setScale(scale * 1.12);
  $('#cropzout', ov).onclick = () => setScale(scale / 1.12);

  const close = () => {
    window.removeEventListener('resize', onResize);
    ov.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const confirm = () => {
    const { D } = layout();
    const R = D / 2;
    const W = iw * scale, H = ih * scale;
    const sx = (W / 2 - px - R) / scale;
    const sy = (H / 2 - py - R) / scale;
    const sw = D / scale;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(bitmap, sx, sy, sw, sw, 0, 0, 256, 256);
    const data = c.toDataURL('image/jpeg', 0.82);
    c.width = c.height = 0;
    close();
    opts && opts.onConfirm && opts.onConfirm(data);
  };
  const cancel = () => { close(); opts && opts.onCancel && opts.onCancel(); };
  $('#cropok', ov).onclick = confirm;
  $('#cropcancel', ov).onclick = cancel;
  ov.addEventListener('click', (e) => { if (e.target === ov) cancel(); });
  function onKey(e) {
    if (!document.body.contains(ov)) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    else if (e.key === 'Enter' && e.target && e.target.id !== 'cropzoom') { e.preventDefault(); confirm(); }
  }
  document.addEventListener('keydown', onKey, true);
}

function editProfile(after, startTab) {
  const d = { ...profile, bg: profile.bg || '#ffffff' }; let tab = startTab === 'fx' ? 'avatar' : (startTab || 'avatar');
  const FX_IC = { none:'—', spot:'💡', gold:'✨', snow:'❄️', spark:'🌟', petals:'🌸', howl:'🐺', fire:'🔥', lightning:'⚡' };
  const peek = (el) => {
    const avHost = el.querySelector('.pe-av');
    if (!avHost) return;
    if (d._photo && d.avatar === 'photo') d.photoUrl = d._photo;
    const avHtml = av(d, 64);
    const old = avHost.querySelector('.av-wrap');
    if (old) old.outerHTML = avHtml;
    else avHost.insertAdjacentHTML('afterbegin', avHtml);
    const face = avHost.querySelector('.av img');
    if (face && d._photo && d.avatar === 'photo') face.src = d._photo;
    replayEntrancePreview(el, d._fxPreview);
  };
  const replayEntrancePreview = (root, key) => {
    const wrap = root.querySelector('.pe-av .av-wrap');
    if (!wrap) return;
    const body = root.querySelector('.pe-body');
    const sheet = root.closest('.sheet');
    const keep = { b: body ? body.scrollTop : 0, s: sheet ? sheet.scrollTop : 0, x: window.scrollX, y: window.scrollY };
    const row = root.querySelector('.pe-top');
    if (row) row.className = 'pe-top';
    FXS.forEach(([k]) => wrap.classList.remove('fx-' + k));
    wrap.classList.remove('enter');
    // Restart the demonstration on the player's own avatar. Do not rebuild the modal.
    void wrap.offsetWidth;
    if (key && key !== 'none' && FXS.some(x => x[0] === key)) wrap.classList.add('fx-' + key);
    if (body) body.scrollTop = keep.b;
    if (sheet) sheet.scrollTop = keep.s;
    if (window.scrollX !== keep.x || window.scrollY !== keep.y) window.scrollTo(keep.x, keep.y);
  };
  const markSel = (root, sel, btn) => { $$(sel, root).forEach(x => { x.classList.toggle('sel', x === btn); const ck = x.querySelector('.ck'); if (x === btn) { if (!ck) x.insertAdjacentHTML('beforeend', '<span class="ck">✓</span>'); } else if (ck) ck.remove(); }); };
  const pickMsg = (name) => toast(`已選擇：${name}，按保存套用`);
  const bodyHtml = () => {
    if (tab === 'pendant') {
      const cells = [`<button type="button" class="pdc ${!d.pendant || d.pendant==='none'?'sel':''}" data-pd="none"><div class="pdv"><span class="pdx">不佩戴</span></div><b>不佩戴</b></button>`]
        .concat(PENDANTS.map(x => {
          const locked = !pdUnlocked(x[0]);
          const sel = d.pendant === x[0];
          const fx = pdFxCls(x[0]);
          return `<button type="button" class="pdc ${sel?'sel':''} ${locked?'off':''}" data-pd="${x[0]}">${sel?'<span class="ck">✓</span>':''}${x[4]?'<span class="sp">✨</span>':''}${locked?'<span class="lk">🔒</span>':''}<div class="pdv${fx}">${PD_BACK[x[0]]?`<img class="pov back" src="${pdSrc(x[0],1)}" alt="">`:''}${faceCirc(d)}<img class="pov${PD_ICE[x[0]] ? ' ice' : ''}" src="${pdSrc(x[0])}" alt="">${pdPalHtml(x[0])}</div><b>${x[1]}</b>${locked?`<i>${pdNeed(x)}</i>`:''}</button>`;
        }));
      return `<div class="pe-grid">${cells.join('')}</div>`;
    }
    const photoOn = d.avatar === 'photo' || (d.avatar && String(d.avatar).startsWith('data:')) || d._forceSub === 'photo';
    const tiles = [`<button type="button" class="${photoOn?'sel':''}" data-upload="1"><div class="cell pe-camcell">📷</div><div class="lb">上載相片</div>${photoOn?'<span class="ck">✓</span>':''}</button>`]
      .concat(ANIMALS.map(([k,n]) => `<button type="button" data-e="${k}" class="${k===d.avatar?'sel':''}"><div class="cell" style="background:${d.bg}"><img src="/img/av/${k}.webp" alt=""></div><div class="lb">${n}</div>${k===d.avatar?'<span class="ck">✓</span>':''}</button>`));
    const sw = `<div class="swatches">${BGS.map(c => `<button type="button" data-c="${c}" class="${c===d.bg?'sel':''}" style="background:${c}"></button>`).join('')}</div>`;
    const fxs = `<div class="pe-fxlab">入場特效</div><div class="pe-fx">${FXS.map(([k,n,need]) => `<button type="button" data-fx="${k}" class="${d.fx===k?'sel':''} ${fxUnlocked(k)?'':'off'}">${FX_IC[k]||''} ${n}${fxUnlocked(k)?'':` 🔒${need}場`}</button>`).join('')}</div>`;
    return `${sw}<div class="pe-grid">${tiles.join('')}</div>${fxs}`;
  };
  const draw = (el) => {
    const n = d.name || '';
    el.innerHTML = `<div class="pe">
      <h2>編輯檔案</h2>
      <div class="pe-top">
        <div class="pe-av" data-cam="1">${av(d, 64)}<span class="pe-cam" title="上載相片">📷</span></div>
        <div class="pe-nick">
          <div class="pe-lab">暱稱</div>
          <input class="inp" id="nm" maxlength="10" placeholder="輸入暱稱" value="${esc(n)}" autocomplete="off">
          <div class="pe-hint">點入輸入框即可更改暱稱</div>
          <span class="pe-cnt"><i id="nlen">${Array.from(n).length}</i>/10</span>
        </div>
      </div>
      <div class="seg pe-tabs"><button type="button" data-t="avatar" class="${tab==='avatar'?'sel':''}">頭像</button><button type="button" data-t="pendant" class="${tab==='pendant'?'sel':''}">掛件</button></div>
      <div class="pe-body">${bodyHtml()}</div>
      <input id="file" type="file" accept="image/*" hidden>
      <div class="pe-bot"><button type="button" class="btn pe-save" id="ok">保存</button></div>
    </div>`;
    bind(el);
    if (d._photo && d.avatar === 'photo') { const img = el.querySelector('.pe-av .av img'); if (img) img.src = d._photo; }
  };
  const bind = (el) => {
    const nm = $('#nm', el);
    if (nm) nm.oninput = () => { d.name = nm.value; const nlen = $('#nlen', el); if (nlen) nlen.textContent = Array.from(d.name||'').length; };
    $$('[data-t]', el).forEach(b => b.onclick = () => { tab = b.dataset.t; const body = el.querySelector('.pe-body'); if (body) body.innerHTML = bodyHtml(); $$('.pe-tabs [data-t]', el).forEach(x => x.classList.toggle('sel', x.dataset.t === tab)); bindBody(el); });
    bindBody(el);
    const pickFile = () => { const f = $('#file', el); if (f) f.click(); };
    $$('[data-cam]', el).forEach(b => b.onclick = (ev) => { ev.preventDefault(); pickFile(); });
    const f = $('#file', el); if (f) f.onchange = async () => { const file = f.files[0]; f.value = ''; if (!file) return;
      try {
        const bmp = await loadOrientedBitmap(file);
        openPhotoCrop(bmp, {
          pendant: d.pendant,
          onConfirm: (data) => {
            d.avatar = 'photo'; d._photo = data; d.photoUrl = data; d._forceSub = 'photo';
            peek(el);
            const up = el.querySelector('[data-upload]');
            if (up) { $$('.pe-grid [data-e], .pe-grid [data-upload]', el).forEach(x => { x.classList.toggle('sel', x === up); const ck = x.querySelector('.ck'); if (x === up) { if (!ck) x.insertAdjacentHTML('beforeend', '<span class="ck">✓</span>'); } else if (ck) ck.remove(); }); }
            pickMsg('上載相片');
          },
          onCancel: () => {}
        });
      } catch (e) { toast('讀唔到呢張相，請揀另一張', 'bad'); }
    };
    $('#ok', el).onclick = async () => {
      const n = Array.from((d.name || '').trim()).slice(0, 10).join(''); if (!n) return toast('請輸入暱稱');
      try {
        await ensureSession();
        const body = { name: n, bg: d.bg, fx: d.fx, pendant: d.pendant, skins: skinSel };
        if (d._photo && d.avatar === 'photo') body.photo = d._photo;
        else body.avatar = migrateAvatar(d.avatar) === 'photo' ? undefined : migrateAvatar(d.avatar);
        const r = await api('/api/me', { method: 'PUT', body: JSON.stringify(body) });
        applyUser(r.user); socket.emit('profile', {}); closeModal(); if (view === 'home' || view === 'room') render(); after && after(); toast('已永久保存', 'ok');
      } catch (e) { toast(e.message || '儲存失敗', 'bad'); }
    };
  };
  const bindBody = (el) => {
    $$('[data-upload]', el).forEach(b => b.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); $('#file', el) && $('#file', el).click(); });
    $$('[data-e]', el).forEach(b => b.onclick = () => {
      d.avatar = b.dataset.e; d._forceSub = 'animal';
      markSel(el, '.pe-grid [data-e], .pe-grid [data-upload]', b);
      peek(el);
      const it = ANIMALS.find(x => x[0] === d.avatar);
      pickMsg(it ? it[1] : '頭像');
    });
    $$('[data-c]', el).forEach(b => b.onclick = () => {
      d.bg = b.dataset.c;
      $$('[data-c]', el).forEach(x => x.classList.toggle('sel', x === b));
      $$('.pe-grid .cell[style]', el).forEach(c => { if (!c.classList.contains('pe-camcell')) c.style.background = d.bg; });
      const avEl = el.querySelector('.pe-av .av'); if (avEl) avEl.style.background = d.bg;
      pickMsg('背景顏色');
    });
    $$('[data-fx]', el).forEach(b => {
      b.onpointerdown = (ev) => { ev.preventDefault(); };
      b.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const k = b.dataset.fx;
        const it = FXS.find(x => x[0] === k);
        if (!it) return;
        const unlocked = fxUnlocked(k);
        // Preview never grants the effect. Only an unlocked choice is sent on 保存.
        if (unlocked) {
          d.fx = k;
          $$('[data-fx]', el).forEach(x => x.classList.toggle('sel', x.dataset.fx === k));
        }
        d._fxPreview = k;
        $$('[data-fx]', el).forEach(x => x.classList.toggle('prev', x.dataset.fx === k));
        replayEntrancePreview(el, k);
        if (unlocked) pickMsg(it[1]);
        else toast(`預覽：${it[1]}（未解鎖，不會套用）`);
      };
    });
    $$('[data-pd]', el).forEach(b => b.onclick = () => {
      const k = b.dataset.pd;
      if (k !== 'none' && !pdUnlocked(k)) { const it = PENDANTS.find(x => x[0] === k); return toast(`「${it[1]}」：${pdNeed(it)}`); }
      d.pendant = k;
      $$('[data-pd]', el).forEach(x => { x.classList.toggle('sel', x === b); const ck = x.querySelector('.ck'); if (x === b) { if (!ck) x.insertAdjacentHTML('afterbegin', '<span class="ck">✓</span>'); } else if (ck) ck.remove(); });
      peek(el);
      const it = k === 'none' ? null : PENDANTS.find(x => x[0] === k);
      pickMsg(it ? it[1] : '不佩戴');
    });
  };
  openModal('', draw);
}

function ensureName(fn) { if (profile.name) fn(); else editProfile(fn); }
function confirmAbandon() {
  const code = (S && S.code) || (heldRoom && heldRoom.code);
  if (!code) return;
  openModal(`<div class="actconf" id="actconf" role="dialog" aria-modal="true" aria-labelledby="abandon-title"><h2 id="abandon-title">放棄座位？</h2>
    <p class="actconf-note">房間 ${esc(code)} 的座位會空出來。本局身份留在座位上，其他人可以接手。之後你可以建立或加入另一個房間。</p>
    <div class="actconf-btns"><button type="button" class="btn ghost" id="ab-no">取消</button><button type="button" class="btn" id="ab-yes">放棄座位</button></div></div>`, (el) => {
    $('#ab-no', el).onclick = (e) => { e.preventDefault(); closeModal(); };
    $('#ab-yes', el).onclick = async (e) => {
      e.preventDefault();
      closeModal();
      const r = await emit('leave', { abandon: true });
      if (r && (r.abandoned || r.ok) && !r.error) {
        clearHeld(); waitingRoom = null; S = null;
        toast('已放棄座位');
        go('home');
      }
    };
  });
}
async function createRoom() {
  await ensureSession();
  const r = await emit('create');
  if (r.room) { clearHeld(); go('room'); }
  else if (r.stillSeated) go('home');
}
async function joinRoom(code) {
  await ensureSession();
  const r = await emit('join', { code });
  if (r.room) { closeModal(); waitingRoom = null; go('room'); if (r.spectating) toast('已進入觀戰'); }
  else if (r.stillSeated) { closeModal(); go('home'); }
  else if (r.error && heldRoom && heldRoom.code === String(code || '').toUpperCase() && /找不到/.test(r.error)) { clearHeld(); render(); }
}
let discoverOn = false, sitPend = 0, sitGen = 0;
function clearSitPreview() {
  document.querySelectorAll('.rt .st.sit-preview').forEach(el => {
    el.classList.remove('sit-preview');
    el.style.transition = '';
    el.style.transform = '';
    el.style.zIndex = '';
  });
}
function previewSit(emptyEl) {
  clearSitPreview();
  if (!S || !S.meId || !emptyEl || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const me = document.querySelector('.rt .st[data-id="' + (window.CSS && CSS.escape ? CSS.escape(S.meId) : S.meId) + '"]');
  if (!me || me === emptyEl) return;
  const a = me.getBoundingClientRect();
  const b = emptyEl.getBoundingClientRect();
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  if (Math.abs(dx) + Math.abs(dy) < 2) return;
  me.classList.add('sit-preview');
  me.style.transition = 'none';
  me.style.transform = `translate(${dx}px, ${dy}px)`;
  me.style.zIndex = '6';
}
function requestPosition() {
  return new Promise((resolve) => {
    if (!window.isSecureContext) return resolve({ ok: false, msg: '需要 HTTPS 先可以搜尋附近房間' });
    if (!navigator.geolocation) return resolve({ ok: false, msg: '此瀏覽器不支援定位' });
    let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => finish({ ok: false, msg: '定位逾時，請再試。仍可用房間號加入。' }), 9000);
    navigator.geolocation.getCurrentPosition((pos) => {
      clearTimeout(timer);
      const lat = pos && pos.coords && pos.coords.latitude, lng = pos && pos.coords && pos.coords.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') finish({ ok: false, msg: '無法取得位置。仍可用房間號加入。' });
      else finish({ ok: true, lat, lng });
    }, (err) => {
      clearTimeout(timer);
      const c = err && err.code;
      finish({ ok: false, msg: c === 1 ? '未允許位置權限。仍可用 4 位房間號加入。' : (c === 2 ? '暫時無法取得位置。仍可用房間號加入。' : '定位逾時，請再試。仍可用房間號加入。') });
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 });
  });
}
function joinDialog() {
  openModal(`<h2>加入房間</h2><input class="inp code-inp" id="cd" maxlength="4" placeholder="····" autocomplete="off" aria-label="4 位房間號">
  <p class="muted small center">輸入同枱朋友的 4 位房間號，或用相機掃描他們的二維碼。未就座的玩家在遊戲進行中會以觀戰進入；你自己的座位會保留。</p><button class="btn" id="ok">進入圓桌</button>
  <button type="button" class="btn ghost" id="near">搜尋附近房間</button>
  <p class="tiny muted center">搜尋半徑 5 公里。要按一下先會問位置。</p><div id="nearbox"></div>`, (el) => {
    const cd = $('#cd', el); setTimeout(() => cd.focus(), 60);
    const go2 = () => { const c = cd.value.trim().toUpperCase(); if (c.length !== 4) return toast('房間號為 4 位'); joinRoom(c); };
    $('#ok', el).onclick = go2; cd.onkeydown = (e) => { if (e.key === 'Enter') go2(); };
    const box = $('#nearbox', el), nearBtn = $('#near', el);
    const runNear = async () => {
      nearBtn.disabled = true; box.innerHTML = '<div class="near-status" role="status">正在取得位置…</div>';
      const loc = await requestPosition();
      if (!loc.ok) { nearBtn.disabled = false; box.innerHTML = `<div class="near-status bad" role="status">${esc(loc.msg)}</div>`; return; }
      box.innerHTML = '<div class="near-status" role="status">正在搜尋 5 公里內的房間…</div>';
      const r = await emit('nearby', { lat: loc.lat, lng: loc.lng });
      nearBtn.disabled = false;
      if (!r || r.error) { box.innerHTML = `<div class="near-status bad" role="status">${esc((r && r.error) || '搜尋失敗')}</div>`; return; }
      const rooms = r.rooms || [];
      if (!rooms.length) box.innerHTML = '<div class="near-status" role="status">附近 5 公里內沒有開放搜尋的房間。</div>';
      else box.innerHTML = `<div class="near-list">${rooms.map(rm => `<button type="button" class="near-item" data-code="${esc(rm.code)}" data-playing="${rm.playing ? '1' : '0'}">${av({ name: rm.hostName || '房主', avatar: rm.hostAvatar || 'fox', bg: rm.hostBg || '#f3d9a4', photoUrl: rm.hostPhoto }, 40)}<span class="near-copy"><b>${esc(rm.name || ('房間 ' + rm.code))}${rm.playing ? '<em class="near-live">觀戰</em>' : ''}</b><span>${esc(rm.hostName || '房主')}</span><span>${Number(rm.capacity) || 0}人局 · ${Number(rm.seated) || 0}/${Number(rm.capacity) || 0}人${rm.playing ? ' · 進行中' : ''} · ${esc(rm.distance || '')}</span></span></button>`).join('')}</div>`;
      $$('.near-item', box).forEach(b => b.onclick = () => joinRoom(b.dataset.code));
    };
    nearBtn.onclick = () => runNear();
  });
}
function inviteDialog() {
  const url = inviteUrl(S.code);
  openModal(`<h2>召集騎士</h2>
    <img class="qr" alt="QR" src="/api/qr?text=${encodeURIComponent(url)}">
    <p class="center muted small">同枱朋友用手機相機掃一掃，直接入房。遊戲開始後，未就座的朋友會以觀戰加入。</p>
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
        const r = await api(mode==='login'?'/api/auth/login':'/api/auth/register', { method:'POST', body: JSON.stringify({ username: $('#un',el).value, password: $('#pw',el).value, guestKey: guestKey() }) });
        token = r.token; LS.setItem('cc.token', token); applyUser(r.user, r.stats);
        socket.emit('hello', { token, ...authIdentity(), ...helloProfile() }, () => {});
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
async function doLogout() { try { await api('/api/auth/logout', { method:'POST' }); } catch(e){} token=''; LS.removeItem('cc.token'); account=null; await ensureSession(); socket.emit('hello', { token, ...authIdentity(), ...helloProfile() }, ()=>{}); render(); toast('已登出，現為訪客'); }

// ================= components =================
function roomHead() {
  if (!S) return '';
  // Invite / ⋯ live in the sticky topbar. Seated count lives in the table centre only.
  const left = [];
  if (!S.game && S.readyCount != null) left.push(`準備 ${S.readyCount}/${S.seated || 0}`);
  const rightBits = [S.mySeat ? `${S.mySeat}號座` : (S.spectating ? '觀戰' : ''), S.isHost ? '房主' : ''].filter(Boolean);
  const right = rightBits.join(' · ');
  if (!left.length && !right) return '';
  return `<div class="rhead compact"><div class="rh-sub">${left.join(' · ')}${(left.length || right) && right ? '<span class="grow"></span>' : ''}${right}</div></div>`;
}
function avoidBtn() {
  if (!S || (S.game && S.game.phase !== 'end')) return '';
  const vc = S.myVetoCards == null ? (account && account.vetoCards) : S.myVetoCards;
  const picked = S.myAvoid && ROLE[S.myAvoid] ? ROLE[S.myAvoid].n : '';
  const label = '迴避卡' + (picked ? '，已選' + picked : '');
  return `<button type="button" class="avoid-btn" data-a="avoid" aria-label="${esc(label)}"><img src="/img/veto_t.webp" alt="" width="24" height="32"><b>${vetoAmt(vc)}</b></button>`;
}
function openAvoidSheet() {
  const vc = S && S.myVetoCards != null ? S.myVetoCards : (account && account.vetoCards);
  const broke = !isGM() && !(Number(vc) > 0);
  const pr = (S && S.preset) || { good: [], evil: [] };
  const uniq = (arr) => [...new Set(arr || [])].filter(k => ROLE[k]);
  const groups = { good: uniq(pr.good), evil: uniq(pr.evil) };
  let pick = (S && S.myAvoid) || '';
  const tile = (k) => `<button type="button" class="avoid-tile${pick === k ? ' sel' : ''}" data-role="${k}" aria-pressed="${pick === k ? 'true' : 'false'}">${roleFace(k, 'classic', true)}</button>`;
  openModal(`<div class="avoid-sheet"><h2>這局避開誰？</h2>
    <div class="avoid-inv">迴避卡 <b>${vetoAmt(vc)}</b>${isGM() ? '' : '<span>/10</span>'}</div>
    <p class="avoid-note">私人選擇，其他玩家同觀戰者睇唔到。</p>
    <p class="avoid-note">開局時先扣 1 張。關閉或取消唔會扣。</p>
    <div class="avoid-side good">藍方</div><div class="avoid-grid">${groups.good.map(tile).join('') || '<div class="avoid-note">沒有可選角色</div>'}</div>
    <div class="avoid-side evil">紅方</div><div class="avoid-grid">${groups.evil.map(tile).join('') || '<div class="avoid-note">沒有可選角色</div>'}</div>
    <button type="button" class="btn" id="avoid-ok" ${broke ? 'disabled' : ''}>${broke ? '沒有迴避卡' : '請揀一個角色'}</button>
    ${pick ? '<button type="button" class="btn ghost" id="avoid-clear">取消今局選擇</button>' : ''}
    <button type="button" class="btn ghost" id="avoid-x">關閉</button></div>`, (el) => {
    const paint = () => {
      el.querySelectorAll('.avoid-tile').forEach(b => {
        const on = b.dataset.role === pick;
        b.classList.toggle('sel', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const ok = $('#avoid-ok', el);
      if (broke) { ok.disabled = true; ok.textContent = '沒有迴避卡'; return; }
      ok.disabled = !pick;
      ok.textContent = pick ? `確認避開${ROLE[pick].n}` : '請揀一個角色';
    };
    paint();
    el.querySelectorAll('.avoid-tile').forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      pick = b.dataset.role;
      paint();
    }));
    $('#avoid-ok', el).addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!pick || broke) return;
      const r = await act('avoid', { role: pick });
      if (r && r.ok) { closeModal(); toast('已選擇，開局時先扣卡', 'ok'); }
    });
    const clr = $('#avoid-clear', el);
    if (clr) clr.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = await act('avoid', { role: '' });
      if (r && r.ok) { closeModal(); toast('已取消選擇'); }
    });
    $('#avoid-x', el).addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeModal(); });
  });
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
function skinArt(role, skin = 'classic') {
  if (role === 'servant' && skin === 'classic_male') return 'servant_male';
  if (role === 'servant' && skin === 'casual_male') return 'servant_casual_male';
  let art = ROLE_ART[role] || role;
  if (OUTFIT_ROLES.includes(role) && (skin === 'casual' || skin === 'festive')) art = `${role}_${skin}`;
  return art;
}
function roleFace(role, skin = 'classic', small) {
  const r = ROLE[role] || { n: RN[role], side: (role||'').includes('evil')?'evil':'good', en: '' };
  const cap = small
    ? `<div class="rn">${r.n || RN[role] || ''}</div>`
    : `<div class="side">${r.side === 'good' ? '亞瑟的忠誠陣營' : '莫德雷德的爪牙陣營'}</div><div class="rn">${r.n || RN[role] || ''}</div><div class="en">${r.en || ''}</div>`;
  return `<div class="rc ${r.side || 'good'} sk-${skin}"><div class="art" style="background-image:url(${img(skinArt(role, skin))})"></div><div class="cap">${cap}</div></div>`;
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
function canonicalSlots(seats) {
  // Seat 1 is always index 0 (top of the table), then clockwise. Placement uses the
  // seat id, never the viewer's own seat and never the order of occupied players.
  const n = seats.length;
  const slots = Array.from({ length: n }, (_, i) => ({ empty: true, seat: i + 1 }));
  seats.forEach((s, i) => {
    const seatNo = Math.round((s && s.seat) || (i + 1));
    if (seatNo < 1 || seatNo > n) return;
    slots[seatNo - 1] = (s && !s.empty && s.id) ? { ...s, seat: seatNo } : { empty: true, seat: seatNo };
  });
  return slots;
}
function roundTable(seats, o = {}) {
  const n = seats.length;
  // Large ring: icon centres sit near the card edge so the middle stays open (5–12 seats).
  const R = n >= 12 ? 39 : n >= 10 ? 40 : 42;
  // One numeral radius for every seat: 0.55 of the avatar-centre ring (target ~190/350).
  // Same angle as the icon, so avatar-centre to number-centre distance is identical.
  const numR = Math.round(R * 0.55 * 10) / 10;
  const avSize = o.avSize || (n >= 12 ? 46 : n >= 10 ? 52 : 58);
  const nums = [];
  const st = canonicalSlots(seats).map((s, i) => {
    const seatNo = i + 1;
    const a = (-90 + i * 360 / n) * Math.PI / 180;
    const x = 50 + R * Math.cos(a), y = 50 + R * Math.sin(a);
    const nx = 50 + numR * Math.cos(a), ny = 50 + numR * Math.sin(a);
    // Numbers are siblings of the seats, fixed to the physical slot. The seat node
    // is what the move animation translates, so the numeral must not live inside it.
    nums.push(`<span class="no" data-seat="${seatNo}" style="left:${nx}%;top:${ny}%">${seatNo}</span>`);
    const pos = `left:${x}%;top:${y}%;--av:${avSize}px`;
    if (!s || s.empty) {
      return `<div class="st empty click" style="${pos}" data-a="sit" data-seat="${seatNo}"><div class="av-empty">+</div><div class="nm">空位</div></div>`;
    }
    if (s.claimable) {
      return `<div class="st claim click" style="${pos}" data-sid="${s.id}" data-id="${s.id}" data-seat="${seatNo}" data-a="sit"><div class="av-empty">+</div><div class="nm">${esc(s.name || '可接手')}</div><div class="st-pills"><span class="claimpill">可接手</span></div></div>`;
    }
    const cls = (o.cls ? o.cls(s, i) : '') + (o.click && o.click(s, i) ? ' click' : '') + (enterIds.has(s.id) ? ` enter fx-${s.fx || 'spot'}` : '');
    const action = o.action || 'sel';
    const actAttr = o.click && o.click(s, i) ? `data-a="${action}"` : (o.seatClick ? `data-a="${o.seatClick}"` : '');
    const mic = (window.AvalonVoice && AvalonVoice.glyph(s.id)) || '';
    const pres = (window.AvalonVoice && AvalonVoice.presence(!!s.online)) || '';
    const speakCls = (S && S.settings && S.settings.mic === true && S.floor && S.floor.speaker === s.id) ? ' is-speak' : '';
    const sparks = String(cls).includes('gold-pick') ? '<i class="gspark a" aria-hidden="true"></i><i class="gspark b" aria-hidden="true"></i><i class="gspark c" aria-hidden="true"></i>' : '';
    return `<div class="st ${cls}${speakCls}" style="${pos}" data-sid="${s.id}" data-id="${s.id}" data-seat="${seatNo}" ${actAttr}>
      <div class="mk">${o.marker ? o.marker(s, i) : ''}</div>${o.marks ? o.marks(s, i) : ''}${av(s, avSize)}${sparks}${mic}${pres}${o.badge ? o.badge(s, i) : ''}${o.label ? o.label(s, i) : ''}<div class="st-meta"><div class="nm">${esc(s.name)}</div>${o.sub ? `<div class="st-pills">${o.sub(s, i)}</div>` : ''}</div></div>`;
  }).join('');
  return `<div class="rt">${o.emote ? '<button class="emote-btn" data-a="emote" aria-label="表情"><svg viewBox="0 0 24 24" width="20" height="20"><circle cx="11" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8.2" cy="10.3" r="1.2" fill="currentColor"/><circle cx="13.8" cy="10.3" r="1.2" fill="currentColor"/><path d="M7.6 14q3.4 3.2 6.8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M19.5 2.5v5M17 5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>' : ''}<div class="table"><div class="ctr">${o.center || ''}</div></div>${nums.join('')}${st}</div>`;
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
function teamHistoryHtml(g) {
  const seats = (g.seats || []).slice().sort((a, b) => (a.seat || 0) - (b.seat || 0));
  const n = seats.length || g.n || 0;
  const rounds = g.rounds || [];
  const quests = g.quests || [];
  const sizes = g.teamSizes || [];
  const idxs = [];
  for (let i = 0; i < Math.max(rounds.length, quests.length); i++) {
    if ((rounds[i] && rounds[i].length) || quests[i]) idxs.push(i);
  }
  idxs.reverse();
  const legend = `<div class="th-leg"><span><i class="mem"></i>隊員</span><span><i class="ld">👑</i>隊長</span><span><i class="yes"></i>同意</span><span><i class="no"></i>反對</span></div>`;
  if (!idxs.length) return `<h3>組隊記錄</h3>${legend}<div class="th-empty muted small">完成一次組隊投票後會顯示在這裡</div>`;
  const blocks = idxs.map(ri => {
    const props = rounds[ri] || [];
    const q = quests[ri];
    const two = ri === g.twoFailRound;
    const known = props.find(p => p.approved) || props[0];
    const size = sizes[ri] || (known && known.team ? known.team.length : '');
    const head = q ? (q.success ? '<em class="ok">成功</em>' : `<em class="bad">失敗 · ${q.fails || 0}張失敗</em>`) : '';
    const rows = props.map((p, k) => {
      const cells = seats.map((s, i) => {
        const num = s.seat || (i + 1);
        const on = (p.team || []).includes(s.id);
        const leader = p.leader === s.id;
        const v = p.votes ? p.votes[s.id] : undefined;
        const tone = v === true ? 'yes' : v === false ? 'no' : '';
        return `<span class="th-seat ${tone}${on ? ' mem' : ''}${leader ? ' ld' : ''}"><b>${num}</b>${leader ? '<i aria-hidden="true">👑</i>' : ''}</span>`;
      }).join('');
      return `<div class="th-row"><span class="th-try">第${k + 1}次</span><span class="th-seats" style="--n:${n}">${cells}</span><span class="th-res ${p.approved ? 'ok' : 'bad'}">${p.approved ? '通過' : '否決'}</span></div>`;
    }).join('');
    return `<section class="th-mis"><div class="th-mh"><b>第${ri + 1}個任務</b><span>${size}人${two ? ' · 需2張失敗' : ''}</span>${head}</div>${rows}</section>`;
  }).join('');
  return `<h3>組隊記錄</h3>${legend}${blocks}`;
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
// One in-app reminder per actionable vote. Not a push notification, and not repeated on every state tick.
const voteRemindSeen = new Set();
let voteRemindTimer;
function voteAction(g, meId, spectating) {
  if (!g || spectating || !g.me || !meId) return null;
  const team = (g.team || []).slice().sort().join(',');
  if (g.phase === 'vote') {
    if (g.me.voted) return null;
    const attempt = ((g.rounds && g.rounds[g.round]) || []).length;
    return { key: g.gid + '|vote|' + g.round + '|' + attempt + '|' + team, text: '輪到你投票', kind: 'vote' };
  }
  if (g.phase === 'quest') {
    if (g.me.questSubmitted || !(g.team || []).includes(meId)) return null;
    return { key: g.gid + '|quest|' + g.round + '|' + team, text: '請提交任務票', kind: 'quest' };
  }
  return null;
}
function hideVoteRemind() {
  clearTimeout(voteRemindTimer);
  const el = document.querySelector('.vote-remind');
  if (el) el.remove();
}
function showVoteRemind(action) {
  hideVoteRemind();
  const el = document.createElement('div');
  el.className = 'vote-remind';
  el.dataset.key = action.key;
  el.dataset.kind = action.kind;
  el.setAttribute('role', 'status');
  el.innerHTML = `<button type="button" class="vote-remind-go" data-a="votego"><b>${esc(action.text)}</b><span>點一下去投票</span></button><button type="button" class="vote-remind-x" data-a="voteremind-x" aria-label="關閉提醒">×</button>`;
  document.body.appendChild(el);
  voteRemindTimer = setTimeout(hideVoteRemind, 7000);
}
function syncVoteRemind() {
  const action = voteAction(S && S.game, S && S.meId, !!(S && S.spectating));
  const cur = document.querySelector('.vote-remind');
  if (!action) { hideVoteRemind(); return; }
  if (cur && cur.dataset.key === action.key) return;
  if (voteRemindSeen.has(action.key)) return;
  voteRemindSeen.add(action.key);
  showVoteRemind(action);
}
window.__voteAction = voteAction;
function focusVoteControls() {
  const kind = (document.querySelector('.vote-remind') || {}).dataset && document.querySelector('.vote-remind').dataset.kind;
  if (view !== 'room') go('room');
  requestAnimationFrame(() => {
    const target = document.querySelector(kind === 'quest' ? '.qpick, [data-a="quest"]' : '[data-a="vote"]');
    if (!target) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  });
}
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
  else if (ev.type === 'veto') queueModal(() => openModal(`<div class="vuse"><img src="/img/veto.webp" alt="回避卡" width="150" height="200"></div><h2>${esc(ev.name||'一位騎士')} 使用咗回避卡</h2><p class="center small muted">已退出隊伍，本輪否決不增加，隊長需重新組隊。</p><button class="btn" id="ok">知道了</button>`, el => $('#ok',el).onclick=closeModal));
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
  const special = !['servant', 'minion'].includes(me.role);
  const sk = skinOf(me.role);
  const art = skinArt(me.role, sk);
  const cb = cardBackOf();
  openModal(`<div class="reveal ${side} ${special ? 'special' : ''}"><div class="rv-h">你的身份是</div>
    <div class="rv-stage"><div class="rays"></div><canvas class="fxc" id="fxc"></canvas>
    <div class="flip" id="flip"><div class="in"><div class="face back" style="background-image:url(${img(cb)})"><div class="hint">👉 點擊卡片翻開</div></div>
      <div class="face front"><div class="rcard ${side} ${shinyOn() ? 'holo' : ''}"><div class="strip"></div><div class="rart" style="background-image:url(${img(art)})"></div>
        <div class="rname">${r.n || me.roleName}</div><span class="teampill ${side}">${side === 'good' ? '藍方' : '紅方'}</span></div></div></div></div></div>
    <div id="kn" class="hidden">
      <div class="rinfo">${ROLE_INFO[me.role] || r.d || ''}${g.lanceSwitched !== undefined && me.side !== r.side ? '<br><b>注意：蘭斯洛特已互換陣營</b>' : ''}</div>
      ${mates ? `<div class="matepanel"><div class="mp-h">${side === 'evil' ? '可看到的隊友' : '可看到的人物'}</div>${mates}</div>` : ''}
      ${ladyMine ? `<div class="matepanel"><div class="mp-h">🌊 湖中仙女查驗結果</div>${ladyMine}</div>` : ''}
    </div>
    <div class="cover" id="cov">翻開前請確認旁邊沒有人偷看</div>
    ${!first && me.role === 'assassin' && !['end', 'assassin'].includes(g.phase) ? '<button class="btn evil big" id="early">🗡️ 提前刺殺</button>' : ''}
    <button class="btn big" id="ok">我記住了</button></div>`, (el) => {
    const eb = $('#early', el); if (eb) eb.onclick = () => { if (!confirm('確定提前刺殺？\n紅方會即時亮明身份（奧伯倫除外），你要喺圓桌上揀一位玩家刺殺：刺中梅林紅方即勝，刺錯藍方即勝。')) return; closeModal(); act('earlyassassin'); };
    const f = $('#flip', el); const rv = $('.reveal', el);
    f.onclick = () => {
      const on = !f.classList.contains('on');
      f.classList.toggle('on', on);
      f.classList.toggle('shut', !on);
      rv.classList.toggle('opened', on);
      $('#kn', el).classList.toggle('hidden', !on);
      $('#cov', el).classList.toggle('hidden', on);
      if (on) burst($('#fxc', el), side);
    };
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
function qBurst(host, ok) { // gold sparkles (success) / red embers (fail); transform+opacity only
  const n = 10; let h = '';
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.random() * .5, d = 34 + Math.random() * 26;
    h += `<i style="--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d - (ok ? 0 : 14))}px;animation-delay:${Math.round(Math.random() * 120)}ms"></i>`; }
  const b = document.createElement('div'); b.className = 'qburst ' + (ok ? 'ok' : 'ng'); b.innerHTML = h; host.appendChild(b); setTimeout(() => b.remove(), 1400);
}
function showQuest(ev) {
  const cards = Array(ev.size).fill(true); for (let i = 0; i < ev.fails; i++) cards[i] = false;
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  const sub = ev.fails === 0 ? '全部係成功牌' : `${ev.fails} 張失敗牌${ev.success ? '（本輪需要 2 張失敗先算失敗）' : ''}`;
  openModal(`<div class="qreveal"><div class="qr-h">第 ${ev.round + 1} 個任務 · 結果揭曉</div><div class="qr-sub">牌已打亂，睇唔到係邊個出</div>
    <div class="qr-cards">${cards.map(c => `<div class="qc"><div class="qci"><div class="f b"><span>?</span></div><div class="f fr ${c ? 'ok' : 'ng'}"><img src="/img/${c ? 'q_success' : 'q_fail'}_t.webp?v=2" alt="${c ? '成功' : '失敗'}"></div></div></div>`).join('')}</div>
    <div class="qr-res ${ev.success ? 'ok' : 'ng'}" id="tl"><div class="t">${ev.success ? '任務成功' : '任務失敗'}</div><div class="s">${sub}</div></div>
    <button class="btn big" id="ok">繼續</button></div>`, async (el) => {
    $('#ok', el).onclick = closeModal;
    const cs = $$('.qc', el); await sleep(700);
    for (let i = 0; i < cs.length; i++) {
      const last = i === cs.length - 1;
      if (last && cs.length > 1) { cs[i].classList.add('tense'); await sleep(1100); cs[i].classList.remove('tense'); }
      cs[i].classList.add('on'); qBurst(cs[i], cards[i]); if (navigator.vibrate && !cards[i]) navigator.vibrate(60);
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
    <div class="flip" id="flip" style="width:min(56vw,200px)"><div class="in"><div class="face back"><div class="hint">點擊查看陣營</div></div><div class="face front"><div class="rc ${mine.side} lady-reveal"><div class="art" style="background-image:url(${img('lady')})"></div><div class="cap"><div class="rn" style="font-size:20px">${mine.side === 'good' ? '好人陣營' : '壞人陣營'}</div></div></div></div></div></div>
    <p class="center small muted">只有你看到這個結果，你可以選擇說真話或說謊。</p><button class="btn" id="ok">知道了</button>`, (el) => { const f = $('#flip', el); f.onclick = () => f.classList.add('on'); $('#ok', el).onclick = closeModal; }, true);
}
function factionText(s) {
  return String(s || '')
    .replace(/亞瑟陣營勝利/g, '藍方勝利')
    .replace(/莫德雷德陣營勝利/g, '紅方勝利')
    .replace(/好人勝利/g, '藍方勝利')
    .replace(/壞人逆轉勝利/g, '紅方逆轉勝利')
    .replace(/壞人勝利/g, '紅方勝利')
    .replace(/好人勝/g, '藍方勝利')
    .replace(/壞人勝/g, '紅方勝利');
}
function winTitle(winner) {
  if (winner === 'good') return '藍方勝利';
  if (winner === 'evil') return '紅方勝利';
  return '提前結束';
}
function outcomeText(r) {
  const seats = r.players || r.seats || [];
  if (r.winner === 'none') return '不計勝負、不計分';
  const merlin = seats.find(s => s && s.role === 'merlin');
  const at = r.assassinTarget && seats.find(s => s && s.id === r.assassinTarget);
  if (at && at.role === 'merlin') return `刺客刺中梅林（${at.seat || ''}號 ${at.name || ''}）`;
  if (at && merlin) return `刺客刺中的是 ${at.seat || ''}號${(ROLE[at.role] || {}).n || ''}，梅林（${merlin.seat || ''}號）安然無恙`;
  return factionText(r.reason || '');
}
function endMeta(r) {
  const bits = [];
  if (r.mineHost) bits.push('我開的房');
  else if (r.room) bits.push('房間 ' + r.room);
  if (r.n) bits.push(`${r.n} 人局`);
  if (r.endedAt) {
    const d = new Date(r.endedAt);
    if (!Number.isNaN(d.getTime())) bits.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  }
  if (r.startedAt && r.endedAt) {
    const ms = new Date(r.endedAt) - new Date(r.startedAt);
    if (ms >= 0 && ms < 60000) bits.push('用時不到 1 分鐘');
    else if (ms >= 60000) bits.push(`用時 ${Math.round(ms / 60000)} 分鐘`);
  }
  return bits.join(' · ');
}
function settleParts(r) {
  const players = (r.players || r.seats || []).filter(p => p && p.id);
  const sc = r.scores || {};
  const myId = r.myId || (S && S.meId) || null;
  const early = r.winner === 'none' || !Object.keys(sc).length;
  const rows = players.map(p => {
    const s = sc[p.id] || { total: 0, items: [], rank: players.length };
    const items = s.items || [];
    return { p, total: s.total || 0, items, rank: s.rank || 0, side: p.side || (ROLE[p.role] && ROLE[p.role].side) || '' };
  }).sort((a, b) => (a.rank || 99) - (b.rank || 99) || (b.total - a.total));
  const mvp = !early && rows.find(x => x.p.id === r.mvp);
  const me = rows.find(x => x.p.id === myId);
  const losers = !early && r.winner && r.winner !== 'none' ? rows.filter(x => x.side && x.side !== r.winner) : [];
  const loseMvp = losers.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99) || b.total - a.total)[0] || null;
  return { rows, mvp, me, early, myId, loseMvp };
}
function youHtml(me, r) {
  if (!me) return '觀戰 · 不計個人分數';
  const role = esc((ROLE[me.p.role] || {}).n || '');
  const result = r.winner === 'none' ? '不計勝負' : (me.side === r.winner ? '勝利' : '落敗');
  return `你是 ${esc(me.p.seat || '')}號 <span class="role">${role}</span> · ${result}`;
}
const ICO_SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm8 1.5V10h4.5L13 5.5zM12 11l-4 4h3v4h2v-4h3l-4-4z"/></svg>';
const ICO_POSTER = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v7.2l3.1-3.1 2.2 2.2 3.4-4L19 13.8V7H5zM8 10.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z"/></svg>';
function settleBody(r) {
  const { rows, mvp, me, early, myId, loseMvp } = settleParts(r);
  const title = winTitle(r.winner);
  const reason = outcomeText(r);
  const you = youHtml(me, r);
  const honor = loseMvp && me && loseMvp.p.id === me.p.id ? '<div class="settle-honor">你是敗方 MVP · 雖敗猶榮</div>' : '';
  const mvpCard = mvp ? `<div class="settle-mvp"><span class="settle-crown" aria-hidden="true"></span><span class="k">本局 MVP</span>${av(mvp.p, 28)}<div class="mv-mid"><b>${esc(mvp.p.name)}</b><span>${esc((ROLE[mvp.p.role] || {}).n || '')}</span></div><strong class="mv-pts">${mvp.total} 分</strong></div>` : '';
  const list = early ? '<p class="settle-none">本局不計分，沒有排名。</p>' : `<ol class="settle-list">${rows.map(x => {
    const role = (ROLE[x.p.role] || {}).n || '';
    const sum = x.items.reduce((a, it) => a + it[1], 0);
    const crown = x.p.id === r.mvp ? '<span class="settle-crown sm" aria-hidden="true"></span>' : '';
    return `<li class="settle-row ${x.p.id === r.mvp ? 'is-mvp' : ''}" data-rank="${x.rank}" data-id="${esc(x.p.id)}"><details><summary>${av(x.p, 24)}<span class="who"><span class="ln"><b>${esc(x.p.name)}</b>${crown}${x.p.id === myId ? '<i class="me">我</i>' : ''}</span><em class="${x.side}">${esc(role)}</em></span><strong class="pts">${x.total}</strong></summary><ul class="settle-break" data-sum="${sum}" data-total="${x.total}">${x.items.map(([l, v]) => `<li data-label="${esc(l)}" data-pts="${v}"><span>${esc(l)}</span><b>+${v}</b></li>`).join('')}<li class="sum"><span>合計</span><b>${x.total}</b></li></ul></details></li>`;
  }).join('')}</ol>`;
  return { title, reason, you, honor, mvpCard, list, cls: r.winner || 'none', me, mvp, loseMvp, early };
}
function endSummaryHtml(r) {
  const body = settleBody(r);
  const artRole = (body.me && body.me.p.role) || (body.mvp && body.mvp.p.role) || '';
  const art = artRole && ROLE[artRole] ? `<img class="endsum-art" src="${img(artRole)}" alt="">` : '';
  let personal = '';
  if (!body.early && body.me) {
    const mineLose = body.loseMvp && body.loseMvp.p.id === body.me.p.id;
    const title = mineLose ? '你是敗方 MVP · 雖敗猶榮' : (body.mvp && body.mvp.p.id === body.me.p.id ? '你是本局 MVP' : '我的分數');
    const role = esc((ROLE[body.me.p.role] || {}).n || '');
    personal = `<div class="endsum-me ${mineLose ? 'is-lose' : ''}"><div class="endsum-me-h"><span class="k">${mineLose ? '<span class="settle-crown" aria-hidden="true"></span>' : ''}${title}</span><button type="button" class="endsum-link" data-a="scores">積分詳情</button></div><div class="endsum-me-b">${av(body.me.p, 28)}<div class="mid"><b>${esc(body.me.p.name)}</b><span>${esc(body.me.p.seat)}號 · ${role} · 第 ${body.me.rank} 名</span></div><div class="sc"><b>${body.me.total}</b><i>分</i></div></div></div>`;
  } else if (!body.early) {
    personal = `<div class="endsum-me"><div class="endsum-me-h"><span class="k">本局分數</span><button type="button" class="endsum-link" data-a="scores">積分詳情</button></div></div>`;
  }
  const mvpRow = body.mvp ? `<div class="endsum-mvp"><span class="settle-crown" aria-hidden="true"></span><span class="k">本局 MVP</span>${av(body.mvp.p, 22)}<span class="nm">${esc(body.mvp.p.name)} · ${esc((ROLE[body.mvp.p.role] || {}).n || '')}</span><b>${body.mvp.total} 分</b></div>` : '';
  const acts = r.winner === 'none' ? '' : `<div class="endsum-acts"><button type="button" class="endsum-act" data-a="sharecard">${ICO_SHARE}分享戰績</button><button type="button" class="endsum-act" data-a="poster">${ICO_POSTER}生成海報</button></div>`;
  return `<section class="endsum ${body.cls}"><div class="endsum-hero ${body.cls}">${art}<div><h2>${body.title}</h2><p class="endsum-reason">${esc(body.reason)}</p><p class="endsum-you">${body.you}</p></div></div>${acts}<p class="endsum-meta">${esc(endMeta(r))}</p>${personal}${mvpRow}</section>`;
}
function openScoreSheet(rec) {
  if (!rec) return;
  window.__lastRecord = rec;
  const body = settleBody(rec);
  const root = document.scrollingElement || document.documentElement;
  const backY = root ? root.scrollTop : 0;
  if (root && backY) root.scrollTop = 0;
  openModal(`<div class="settle ${body.cls}"><div class="settle-scroll"><header class="settle-head ${body.cls}"><button type="button" class="settle-x" id="settle-x" aria-label="關閉">×</button><h2>${body.title}</h2><p>${esc(body.reason)}</p><div class="settle-you">${body.you}</div>${body.honor}</header>${body.mvpCard}${body.list}</div><div class="settle-foot"><button type="button" class="btn" id="settle-poster">生成海報</button><button type="button" class="btn ghost" id="settle-ok">知道了</button></div></div>`, (el) => {
    const poster = $('#settle-poster', el);
    if (rec.winner === 'none') poster.disabled = true;
    poster.onclick = () => saveCard(rec, true);
    const close = () => { closeModal(); if (root) root.scrollTop = backY; };
    $('#settle-ok', el).onclick = close;
    const x = $('#settle-x', el); if (x) x.onclick = close;
  });
}
function showEnd() {
  const g = S && S.game; if (!g || g.phase !== 'end') return;
  refreshStats();
  openScoreSheet(liveRecord(g));
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
  if (view !== 'skins') app.dataset.v = view || '';
  if (view === 'room' && !inRoom && !waitingRoom) view = 'home';
  $('#backBtn').classList.toggle('hidden', view === 'home');
  const titles = { home: '旺角阿瓦隆', room: inRoom ? null : '房間', history: '歷史記錄', stats: '數據統計', rules: '規則介紹', skins: '角色皮膚', detail: '對局詳情', ach: '成就', board: '排行榜' };
  const acts = $('#topRoomActs');
  if (acts) {
    const show = !!(view === 'room' && inRoom);
    acts.classList.toggle('hidden', !show);
    if (show) acts.innerHTML = `<button type="button" class="rbtn top-inv" data-a="invite">邀請</button><button type="button" class="rbtn top-more" data-a="menu" aria-label="更多" aria-haspopup="dialog" aria-expanded="${document.querySelector('.room-menu') ? 'true' : 'false'}">⋯</button>`;
    else acts.innerHTML = '';
  }
  const titleEl = $('#topTitle');
  if (view === 'room' && inRoom) {
    titleEl.innerHTML = `圓桌 <button type="button" class="top-code" data-a="copycode" title="複製房間號">${esc(S.code)}</button>`;
  } else {
    titleEl.textContent = titles[view] || '旺角阿瓦隆';
  }
  if (view !== 'home' && view !== 'room') app._html = null;
  if (view === 'home') setHTML(app, homeHtml());
  else if (view === 'room' && !inRoom) setHTML(app, `<div class="card resume-card center"><b>正在返回房間 ${esc(waitingRoom || '')}</b><div class="muted small">座位同身份會保留</div></div>`);
  else if (view === 'room') {
    const scroller = document.scrollingElement;
    const mainEl = document.querySelector('main');
    const keepScroll = { w: scroller ? scroller.scrollTop : 0, m: mainEl ? mainEl.scrollTop : 0 };
    const before = {};
    if (!S.game) $$('.rt .st[data-id]').forEach(e => { const r = e.getBoundingClientRect(); before[e.dataset.id] = [r.left, r.top]; });
    const faces = new Map();
    const nextHtml = S.game ? gameHtml() : lobbyHtml();
    // setHTML leaves the DOM alone when the markup string is unchanged. Lifting
    // avatars first would then find no placeholder to swap back onto, and the
    // next identical render would have nothing left to save.
    if (app._html !== nextHtml) $$('.rt .st[data-id] .av-wrap').forEach(wrap => { const id = wrap.closest('.st').dataset.id; if (id && !faces.has(id)) { faces.set(id, wrap); wrap.remove(); } });
    setHTML(app, nextHtml); enterIds.clear();
    faces.forEach((wrap, id) => {
      const st = document.querySelector('.rt .st[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
      if (!st) return;
      const cur = st.querySelector('.av-wrap');
      if (!cur) {
        const meta = st.querySelector('.st-meta');
        if (meta) st.insertBefore(wrap, meta); else st.appendChild(wrap);
        return;
      }
      const a = wrap.querySelector('img'), b = cur.querySelector('img');
      if (a && b && a.getAttribute('src') === b.getAttribute('src') && a.getAttribute('width') === b.getAttribute('width')) cur.replaceWith(wrap);
    });
    if (scroller) scroller.scrollTop = keepScroll.w;
    if (mainEl) mainEl.scrollTop = keepScroll.m;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!S.game && !reduceMotion) $$('.rt .st[data-id]').forEach(e => {
      const b = before[e.dataset.id]; if (!b) return; const r = e.getBoundingClientRect(); const dx = b[0] - r.left, dy = b[1] - r.top;
      if (Math.abs(dx) + Math.abs(dy) < 24) return;
      e.style.transition = 'none'; e.style.transform = `translate(${dx}px, ${dy}px)`; e.style.zIndex = 5;
      requestAnimationFrame(() => { e.style.transition = 'transform .05s ease-out'; e.style.transform = ''; setTimeout(() => { e.style.zIndex = ''; e.style.transition = ''; }, 70); });
    });
    if (window.AvalonVoice) {
      if (!(S && S.settings && S.settings.mic === true)) AvalonVoice.stripIcons();
      else AvalonVoice.afterRender();
    }
  }
  else if (view === 'rules') { app.innerHTML = rulesHtml(); mountRules(); }
  else if (view === 'history') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadHistory(); }
  else if (view === 'stats') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadStats(); }
  else if (view === 'ach') { app.innerHTML = '<div class="card center muted">載入中…</div>'; refreshStats().catch(() => {}).then(() => { if (view === 'ach') app.innerHTML = achHtml(); }); }
  else if (view === 'board') loadBoard();
  else if (view === 'skins') {
    if (app.dataset.v === 'skins' && app.querySelector('.skinrow')) return; // already mounted — never flash/rebuild
    app.dataset.v = 'skins';
    app.innerHTML = '<div class="card center muted">載入中…</div>';
    refreshStats().then(() => { if (view === 'skins') { app.dataset.v = 'skins'; app.innerHTML = skinsHtml(); } });
  }
  else if (view === 'detail') { app.innerHTML = '<div class="card center muted">載入中…</div>'; loadDetail(viewArg.gid); }
}
function resumeCard() {
  const liveS = S && S.code ? S : null;
  const code = liveS ? liveS.code : (heldRoom && heldRoom.code);
  if (!code) return '';
  const playing = liveS ? !!(liveS.game && liveS.game.phase !== 'end') : true;
  const seated = liveS ? (!liveS.spectating && !!(liveS.mySeat || (liveS.game && liveS.game.me))) : !!heldRoom.seated;
  const spectating = liveS ? !!liveS.spectating : !seated;
  const note = seated && playing ? '遊戲進行中，你的座位仍然保留'
    : (liveS && liveS.game ? (liveS.game.phase === 'end' ? '已結束，可以返回房間' : (spectating ? '你正在觀戰，房間仍然保留' : '遊戲中')) : (liveS ? '等待開局' : '房間仍然保留'));
  const sub = liveS ? `<div class="muted small">就座 ${liveS.seated}/${liveS.capacity} · ${note}</div>` : `<div class="muted small">${note}</div>`;
  const leaveBtn = seated && playing
    ? '<button type="button" class="btn ghost" data-a="abandonseat">放棄座位並離開</button>'
    : (spectating && playing ? '<button type="button" class="btn ghost" data-a="leave">離開此房間</button>' : '');
  return `<div class="card resume-card" data-held="${esc(code)}"><div class="resume-copy"><span class="code">${esc(code)}</span>${liveS && liveS.isHost ? '<span class="badge host">房主</span>' : ''}${sub}</div><button type="button" class="btn" data-a="toroom">返回房間</button>${leaveBtn}</div>`;
}
function homeHtml() {
  const inRoom = (S && S.code) || (heldRoom && heldRoom.code);
  const vc = account ? account.vetoCards : null;
  return `  <div class="card prof-head">
    <div class="prof-row">
    <div class="row" data-a="profile" style="cursor:pointer;flex:1;min-width:0">${av(profile, 60)}
      <div class="grow"><div class="name">${profile.name ? esc(profile.name) : '未設定暱稱'}${isGM() ? '<span class="gmb" title="Game Master">GM</span>' : ''}</div>${account ? `<div class="muted small">${myStats.played || 0} 場 · 勝率 ${pct(myStats.won, myStats.played)}%</div>` : '<div class="skel" style="width:110px"></div><div class="skel" style="width:80px;margin-top:6px"></div>'}${vc != null ? `<div class="vchip" data-a="vetoinfo"><img src="/img/veto_t.webp" alt="" width="18" height="24">回避卡 <b>${vetoAmt(vc)}</b>${isGM()?'':'/10'}</div>` : ''}</div></div>
    <div class="prof-actions"><button type="button" class="btn sm ghost pa" data-a="profile">✎ 編輯檔案</button><button type="button" class="btn sm ghost pa" data-a="ptab" data-t="pendant">🎀 頭像掛件</button></div>
    </div>
    <div class="acct">${account && (account.username || account.google) ? `<div class="row between acct-row"><div class="acct-status">已登入${account.google ? '<span class="badge">Google</span>' : ''}</div><button type="button" class="btn sm dark acct-out" data-a="logout">登出</button></div>` : `<div class="tiny muted">目前是訪客。註冊或用 Google 登入後，資料永久保存、換機也能找回。</div><div class="btns"><button class="btn sm" data-a="register">註冊帳號</button><button class="btn sm ghost" data-a="login">登入</button></div>`}</div>
  </div>
  ${inRoom ? resumeCard() : ''}
  ${inRoom ? '' : `<div class="bigcards">
    <div class="bigcard create" data-a="create"><div class="ic">⚔️</div><b>建立房間</b><span>我做房主</span></div>
    <div class="bigcard join" data-a="join"><div class="ic">🛡️</div><b>加入房間</b><span>輸入 4 位房間號</span></div>
  </div>`}
  <div class="card menu" style="margin-top:14px">
    <div class="item" data-a="go" data-v="history"><span class="ic">📜</span><span class="grow">歷史記錄</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="stats"><span class="ic">📊</span><span class="grow">數據統計</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="skins"><span class="ic">🎴</span><span class="grow">角色皮膚</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="board"><span class="ic">🏆</span><span class="grow">排行榜</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="rules"><span class="ic">📖</span><span class="grow">規則介紹</span><span class="chev">›</span></div>
    <div class="item" data-a="about"><span class="ic">ℹ️</span><span class="grow">版本</span><span class="muted small">v3.1</span><span class="chev">›</span></div>
  </div>
  <div class="footer"><span class="credit">旺角阿瓦隆 · by Amigosparty · v3.1</span><br><span class="credit2">Design by Teddy Design Limited</span><br><span class="credit2"><a href="/privacy" target="_blank" rel="noopener">私隱政策</a> · <a href="/terms" target="_blank" rel="noopener">使用條款</a></span></div>`;
}
const ACHS = [
  ['first', '初入圓桌', '完成第 1 場遊戲', s => s.played >= 1],
  ['ten', '圓桌常客', '完成 10 場遊戲', s => s.played >= 10],
  ['win1', '首勝', '贏得第 1 場', s => s.won >= 1],
  ['win10', '常勝騎士', '累積 10 場勝利', s => s.won >= 10],
  ['mvp', '全場最佳', '獲得一次 MVP', s => (s.mvp || 0) >= 1],
  ['mvp10', '10次MVP', '累積 10 次 MVP · 獎勵：閃光卡牌特效、MVP金桂冠掛件', s => (s.mvp || 0) >= 10, s => [Math.min(s.mvp || 0, 10), 10]],
  ['merlin', '智者', '以梅林身份獲勝', s => ((s.roles || {}).merlin || {}).won >= 1],
  ['assassin', '暗影之刃', '以刺客身份獲勝', s => ((s.roles || {}).assassin || {}).won >= 1],
  ['allroles', '千面騎士', '玩過 6 種不同角色', s => Object.keys(s.roles || {}).length >= 6],
];
function boardPin(me) {
  if (!me || typeof me !== 'object') {
    return `<section class="lb-me" data-state="signedout" aria-label="你的排名，尚未登入"><div class="lb-me-k">你的排名</div><p class="lb-me-out">登入後即可查看你的排名</p></section>`;
  }
  const played = Math.max(0, Math.trunc(Number(me.played) || 0));
  const won = Math.max(0, Math.trunc(Number(me.won) || 0));
  const mvp = Math.max(0, Math.trunc(Number(me.mvp) || 0));
  const rank = Number(me.rank);
  const ranked = played > 0 && Number.isInteger(rank) && rank > 0;
  const rate = pct(won, played);
  const nick = me.name || '未設定暱稱';
  const rankText = ranked ? String(rank) : '未上榜';
  const rankCls = ranked ? (rankText.length >= 3 ? 'long' : '') : 'off';
  const label = ranked
    ? `你的排名，第 ${rank} 名，${nick}，勝率 ${rate}%，${won} 勝 / ${played} 場，MVP ${mvp} 次`
    : `你的排名，未上榜，${nick}，勝率 ${rate}%，${won} 勝 / ${played} 場，MVP ${mvp} 次`;
  return `<section class="lb-me" data-state="${ranked ? 'ranked' : 'unranked'}" data-rank="${ranked ? rank : ''}" aria-label="${esc(label)}"><div class="lb-me-k">你的排名</div><div class="lb-me-row"><div class="lb-me-rank ${rankCls}">${esc(rankText)}</div>${av(me, 56)}<div class="lb-me-main"><div class="lb-me-top"><b class="nm">${esc(nick)}</b><strong class="lb-me-rate">${rate}<span>%</span></strong></div><div class="lb-me-sub">${won}勝/${played}場</div><div class="lb-me-sub">MVP 次數 ${mvp}</div></div></div></section>`;
}
function boardHtml(data) {
  const rows = (data && data.players) || [];
  const pin = boardPin(data && data.me);
  const body = !rows.length
    ? `<div class="center muted lb-empty">暫時未有完成對局可以排名</div>`
    : `<ol class="lb">${rows.map(p => {
      const rate = pct(p.won, p.played);
      const mvp = Math.max(0, Math.trunc(Number(p.mvp) || 0));
      const nick = p.name || '未設定暱稱';
      const label = `第 ${p.rank} 名，${nick}，MVP ${mvp} 次，勝率 ${rate}%，${p.won} 勝 / ${p.played} 場`;
      return `<li data-rank="${p.rank}" aria-label="${esc(label)}"><span class="lb-rank" aria-hidden="true">${p.rank}</span>${av(p, 44)}<div class="lb-main"><div class="nm">${esc(nick)}</div></div><div class="lb-rec"><div class="lb-rate"><span class="lb-mvp">MVP ${mvp}</span><b>${rate}%</b></div><span class="lb-wl">${p.won}勝/${p.played}場</span></div></li>`;
    }).join('')}</ol>`;
  return `<div class="card"><h3>排行榜</h3>${pin}${body}</div>`;
}
let boardReq = 0;
async function loadBoard() {
  const req = ++boardReq;
  const app = $('#app');
  app.innerHTML = '<div class="card center muted" role="status">載入中…</div>';
  try {
    await ensureSession().catch(() => {});
    if (view !== 'board' || req !== boardReq) return;
    const data = await api('/api/leaderboard');
    if (view !== 'board' || req !== boardReq) return;
    app.innerHTML = boardHtml(data);
  } catch (e) {
    if (view !== 'board' || req !== boardReq) return;
    app.innerHTML = '<div class="card center" role="alert"><div class="muted">排行榜載入失敗</div><button type="button" class="btn sm" data-a="reloadboard" style="margin-top:12px">重試</button></div>';
  }
}
function achHtml() {
  const s = isGM() ? { played: 1e9, won: 1e9, mvp: (myStats.mvp || 0), roles: Object.fromEntries(ROLE_ORDER.map(k => [k, { played: 1e9, won: 1e9 }])) } : (myStats || {}); const got = ACHS.filter(a => a[3](s)).length;
  return `<div class="card"><h3>成就 ${got}/${ACHS.length}</h3><div class="bar"><i style="width:${pct(got, ACHS.length)}%"></i></div></div>` +
    `<div class="card ach">${ACHS.map(([k, n, d, f, prog]) => `<div class="ach-i ${f(s) ? 'on' : ''}"><span class="medal">${f(s) ? (k === 'mvp10' ? '🌈' : '🏅') : '🔒'}</span><div class="grow"><b>${n}</b><div class="tiny muted">${d}</div>${prog && !isGM() ? `<div class="bar sm"><i style="width:${pct(prog(s)[0], prog(s)[1])}%"></i></div><div class="tiny muted">${prog(s)[0]}/${prog(s)[1]}</div>` : ''}</div></div>`).join('')}</div>`;
}
function expStatus(s) {
  return [['蘭斯洛特', s.lancelot], ['湖中仙女', s.lady], ['王者之劍', s.excalibur], ['回避卡', s.veto], ['麥克風模式', s && s.mic]]
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
    ${tg('mic', '麥克風模式', '預設關閉。開啟後，已就座的玩家先各自點自己頭像右下角的咪，不會自動開咪。關閉時頭像上不會有咪圖示。', '')}
    ${host ? `<button type="button" class="disc-row" data-a="discover" aria-pressed="${discoverOn ? 'true' : 'false'}"><b>讓附近玩家搜尋到此房間</b><span class="tiny muted">${discoverOn ? '已開放 · 約 5 公里內，不公開精確位置。開局後仍可觀戰加入' : '預設關閉 · 開啟先會問你的位置。開局後已開放的房間仍可被搜尋'}</span></button>` : ''}
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
  const specBar = S.spectating ? `<div class="specbar">👁 觀戰中${(S.spectators||[]).length ? ' · ' + S.spectators.length + ' 人' : ''}</div>${(S.spectators||[]).length ? `<div class="speclist">${S.spectators.map(p => `<span class="spec-i">${av(p,22)}<i>${esc(p.name)}</i></span>`).join('')}</div>` : ''}` : ((S.spectators||[]).length ? `<div class="speclist">${S.spectators.map(p => `<span class="spec-i">${av(p,22)}<i>${esc(p.name)}</i></span>`).join('')}</div>` : '');
  return `${roomHead()}${(window.AvalonVoice && AvalonVoice.barHtml()) || ''}${specBar}
  <div class="card tbl">${roundTable(S.seats, {
      seatClick: 'seat', emote: true,
      marker: p => (p.ready ? '✅' : ''),
      cls: p => (p.isHost || p.id === S.hostId ? 'host' : ''),
      sub: p => (p.isHost || p.id === S.hostId ? '<span class="hostpill">房主</span>' : '') + (p.id === S.meId ? '<span class="mepill">我</span>' : ''),
      center: `<div class="seatcount"><b>${x}<small>/${n}</small></b><span>已就座</span></div>` })}
    ${host ? '<button type="button" class="btn ghost release-open" data-a="releaselist">釋出座位</button>' : ''}
    </div>
  <div class="card cfgcard" data-a="cfg">
    <div class="row between"><h3 style="margin:0">${n} 人局</h3><span class="small gold">${host ? '調整 ›' : '查看 ›'}</span></div>
    ${presetCard(S.preset)}
    <div class="xps">${expStatus(s)}</div>
  </div>
  <div class="bottombar">${avoidBtn()}
    ${host ? `<button class="btn" data-a="start" ${x === n ? '' : 'disabled'}>開始遊戲（${x}/${n}）</button>` :
      S.mySeat ? `<button class="btn ${me && me.ready ? 'ghost' : ''}" data-a="ready">${me && me.ready ? '已準備 ✓' : '準備'}</button>` : `<button class="btn ghost" disabled>觀戰中 · 點空位即可就座</button>`}
  </div>`;
}
function gameHtml() {
  const g = S.game; const me = g.me; const meId = S.meId;
  const need = g.teamSizes[g.round]; const isLeader = g.leaderId === meId; const isLady = g.ladyId === meId;
  let panel = '', center = '';
  const selCount = selected.size;
  let pickLive = false;
  if (g.phase === 'team') {
    const micOn = !!(S.settings && S.settings.mic === true);
    const picking = micOn && S.floor && S.floor.status === 'select';
    const talking = micOn && S.floor && S.floor.status !== 'select';
    const skipped = picking && S.floor.skipped;
    pickLive = picking && isLeader;
    center = `<b>第 ${g.round + 1} 輪</b>隊長 ${esc(P(g.leaderId).name)}<br>需要 ${need} 人`;
    if (isLeader && skipped) panel = `<div class="phase pick-team">請選擇隊伍</div><div class="small skip-note">已連續兩次派隊不通過，直接由隊長選隊</div><div class="small muted">在圓桌上點選 ${need} 位隊員（已選 ${selCount}/${need}），可以選自己</div><button class="btn" data-a="propose" ${selCount === need ? '' : 'disabled'}>提交隊伍</button>`;
    else if (isLeader && picking) panel = `<div class="phase pick-team">請選擇隊伍</div><div class="small muted">在圓桌上點選 ${need} 位隊員（已選 ${selCount}/${need}），可以選自己</div><button class="btn" data-a="propose" ${selCount === need ? '' : 'disabled'}>提交隊伍</button>`;
    else if (isLeader && talking) panel = `<div class="phase">👑 你是隊長</div><div class="small muted">全員發言後先可以選擇隊伍</div><button class="btn" data-a="propose" disabled>提交隊伍</button>`;
    else if (isLeader) panel = `<div class="phase">👑 你是隊長</div><div class="small muted">在圓桌上點選 ${need} 位隊員（已選 ${selCount}/${need}），可以選自己</div><button class="btn" data-a="propose" ${selCount === need ? '' : 'disabled'}>提交隊伍</button>`;
    else if (skipped) panel = `<div class="phase">已連續兩次派隊不通過，直接由隊長選隊</div>`;
    else if (picking) panel = `<div class="phase">隊長正在選擇隊伍</div>`;
  } else if (g.phase === 'vote') {
    center = `<b>投票中</b>${g.voted.length}/${g.n} 已投`;
    panel = `<div class="phase">是否同意此隊伍出任務？</div>${voteTeamHtml(g.team)}<div class="small muted" style="margin-top:6px">全員投完後同時公開</div>` +
      (me && !me.voted ? `<div class="btns"><button class="btn good" data-a="vote" data-v="1">✓ 贊成</button><button class="btn evil" data-a="vote" data-v="0">✕ 反對</button></div>` : `<div class="center muted" style="margin-top:10px">${me ? '你已投' + (me.myVote ? '「贊成」' : '「反對」') + '，等待其他騎士…' : '觀戰中，等待投票結果'}</div>`);
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
      (onTeam && !me.questSubmitted ? `<div class="small muted" style="margin-top:6px">秘密選擇你的任務卡：</div><div class="qpick"><button class="qcard ok" data-a="quest" data-v="1"><img src="/img/q_success.webp?v=2" alt="任務成功" width="240" height="320" decoding="async"></button><button class="qcard ng" data-a="quest" data-v="0" ${me.canFail ? '' : 'disabled'}><img src="/img/q_fail.webp?v=2" alt="任務失敗" width="240" height="320" decoding="async"></button></div>${me.canFail ? '' : '<div class="small muted center" style="margin-top:6px">你只能出「成功」</div>'}`
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
    center = `<b>${winTitle(g.winner)}</b>${g.quests.map(q => q ? (q.success ? '🔵' : '🔴') : '⚪').join('')}`;
    // The next round lives in a fixed dock. An in-flow button sits under the
    // sticky header once the result is scrolled up, and off-screen at the top.
    panel = '';
  }
  const teamOpen = g.phase === 'team' && isLeader && (!(S.settings && S.settings.mic === true) || (S.floor && S.floor.status === 'select'));
  const selectable = (s) => teamOpen || (g.phase === 'assassin' && me && me.role === 'assassin' && s.id !== meId && !s.evil) || (g.phase === 'lady' && isLady && s.id !== meId && !g.ladyUsed.includes(s.id)) || (g.phase === 'sword' && isLeader && g.team.includes(s.id) && s.id !== meId) || (g.phase === 'swordflip' && g.sword === meId && g.team.includes(s.id) && s.id !== meId);
  const ended = g.phase === 'end';
  const liveMark = (s) => {
    if (ended) return '';
    const front = (s.id === g.leaderId ? MARK_CROWN : '')
      + (g.ladyId && s.id === g.ladyId ? MARK_WREATH : '')
      + (g.sword && s.id === g.sword ? MARK_SWORD : '')
      + (g.phase === 'vote' && (g.voted || []).includes(s.id) ? MARK_CAST : '');
    return ((g.team || []).includes(s.id) ? MARK_RING : '') + (front ? `<span class="mfront">${front}</span>` : '');
  };
  const floorCard = floorBar();
  const table = roundTable(g.seats, { emote: true,
    click: selectable,
    cls: s => [
      selected.has(s.id) ? 'sel' : '',
      selected.has(s.id) && teamOpen ? 'gold-pick' : '',
      !ended && (g.team || []).includes(s.id) ? 'team' : '',
      s.online ? '' : 'off',
      !ended && s.id === g.leaderId ? 'is-lead' : '',
      !ended && g.ladyId && s.id === g.ladyId ? 'is-lady' : '',
      !ended && g.sword && s.id === g.sword ? 'is-sword' : '',
      !ended && g.phase === 'vote' && (g.voted || []).includes(s.id) ? 'is-cast' : '',
    ].filter(Boolean).join(' '),
    marks: liveMark,
    marker: s => ended && s.id === g.assassinTarget ? '🗡️' : '',
    label: s => ended ? `<span class="lbl ${ROLE[s.role].side === 'good' ? 'g' : 'e'}">${ROLE[s.role].n}</span>` : (s.evil ? '<span class="lbl e">壞人</span>' : ''),
    center,
  });
  return `${(window.AvalonVoice && AvalonVoice.barHtml()) || ''}${floorCard}${S.isHost ? `<div class="card micmode"><div class="toggle"><div class="grow"><b>麥克風模式</b><div class="muted small">${S.settings && S.settings.mic ? '已開啟。每人要自己點頭像右下角。' : '未開啟。頭像上不會顯示咪。'}</div></div><button type="button" class="sw ${S.settings && S.settings.mic ? 'on' : ''}" data-a="tg" data-k="mic" aria-label="麥克風模式"></button></div></div>` : ''}${!me ? '<div class="specbar" data-spec="live">👁 觀戰中 · 唔會看到隱藏身分</div>' : ''}<div class="card">${trackHtml(g)}</div>
  <div class="card${pickLive ? ' pick-live' : ''}" style="padding:42px 10px 16px">${table}${ended ? '' : markLegend()}${S.isHost && !ended ? '<button type="button" class="btn ghost release-open" data-a="releaselist">釋出座位</button>' : ''}</div>
  <div class="card thist" id="teamhist">${teamHistoryHtml(g)}</div>
  ${ladyChainHtml(g.ladyLog, g.seats, ended) ? `<div class="card">${ladyChainHtml(g.ladyLog, g.seats, ended)}</div>` : ''}
  ${panel ? `<div class="card${pickLive ? ' pick-ready' : ''}${g.phase === 'vote' ? ' vote-panel' : ''}">${panel}</div>` : ''}
  ${ended ? `<div id="detail">${detailHtml(liveRecord(g))}</div>` : ''}
  ${ended ? `<div class="end-next">${S.isHost ? '<button type="button" class="btn" data-a="lobby">🔁 再來一局（保留座位）</button>' : '<p class="end-wait">等待房主開新一局（座位保留）</p>'}</div>` : ''}
  ${me && !ended ? `<button type="button" class="myrole-fab" data-a="role" aria-label="我的身份"><span class="mini-back" style="background-image:url(${thumb(cardBackOf())})"></span><span>我的身份</span></button>` : ''}`;
}
function floorClock(msLeft) {
  const sec = Math.max(0, Math.ceil(msLeft / 1000));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function floorBar() {
  if (!S || !S.game || S.game.phase !== 'team' || !S.settings || S.settings.mic !== true) return '';
  const f = S.floor;
  if (!f || f.status === 'select') return f && f.status === 'select' ? '' : (S.isHost ? '<div class="card floorbar"><button type="button" class="btn sm" data-a="floorrestart">開始發言</button></div>' : '');
  const who = (S.game.seats || []).find(s => s.id === f.speaker);
  const mine = S.meId === f.speaker;
  const paused = !!f.paused;
  const label = f.ms === 90000 ? '1 分 30 秒' : (Math.round(f.ms / 1000) + ' 秒');
  const clock = paused ? floorClock(f.remainingMs || 0) : floorClock((f.deadline || 0) - Date.now());
  return `<div class="card floorbar" data-floor="${f.id}" data-token="${f.token}">
    <div class="floor-who"><b>${esc(who ? who.name : '發言')}</b> · ${f.seat}號座 · <span class="floor-time" role="timer" data-deadline="${paused ? 0 : f.deadline}">${clock}</span>${paused ? '<span class="floor-pause">已暫停</span>' : ''}</div>
    <div class="tiny muted">隊長面向圓心，右手邊先講，沿座位逆時針，隊長最後。每人 ${label}。</div>
    <div class="floor-acts">${mine && !paused ? `<button type="button" class="btn sm" data-a="floorend" data-token="${f.token}">結束發言</button>` : ''}${S.isHost ? `<button type="button" class="btn ghost sm" data-a="${paused ? 'floorresume' : 'floorpause'}" data-token="${f.token}">${paused ? '繼續' : '暫停'}</button><button type="button" class="btn ghost sm" data-a="floorskip" data-token="${f.token}">跳過</button><button type="button" class="btn ghost sm" data-a="floorrestart">重新開始發言</button>` : ''}</div>
  </div>`;
}
function ladyChainHtml(log, seats, reveal) {
  if (!log || !log.length) return '';
  // The public row never shows 好/壞 while the game is still going, even on the
  // inspector's own screen. They reopen that result from the private card.
  // reveal is only the finished game, when roles are already public.
  const bits = log.map(l => {
    const pass = `${esc(P(l.holder, seats).name)} → ${esc(P(l.target, seats).name)}`;
    if (reveal && l.side) return `${pass} <span class="badge ${l.side}">${l.side === 'good' ? '好' : '壞'}</span>`;
    return pass;
  });
  return `<div class="small lady-chain" style="margin-top:12px"><span class="gold">🌊 湖中仙女：</span>${bits.join('　')}</div>`;
}

function reviewOf(r) {
  if (r && r.review && r.review.cards) return r.review;
  if (typeof AvalonReview !== 'undefined') {
    return AvalonReview.build({
      players: r.players, quests: r.quests, rounds: r.rounds, ladyLog: r.ladyLog,
      ladyStartId: r.ladyStartId, ladyUsed: r.ladyUsed, settings: r.settings, winner: r.winner,
    });
  }
  return { cards: [] };
}
function reviewHtml(r) {
  const built = reviewOf(r);
  const seats = r.players || [];
  if (!built.cards || !built.cards.length) {
    return `<div class="card"><h3>覆盤重點</h3><p class="rev-miss">此對局未有足夠記錄可重播。</p></div>`;
  }
  const proposals = [];
  const cards = built.cards.map(c => {
    if (c.type === 'lady') {
      if (typeof AvalonReview !== 'undefined' && AvalonReview.ladyRecapHtml) return AvalonReview.ladyRecapHtml(c, seats, (p, size) => av(p, size || 64));
      if (c.disabled) return `<article class="rev-card"><h4><span class="rev-k">湖中仙女</span> 本局未開啟</h4></article>`;
      if (c.unknown) return `<article class="rev-card"><h4><span class="rev-k">湖中仙女</span></h4><p class="rev-miss">舊記錄未保存是否開啟湖中仙女，未有記錄。</p></article>`;
      return '';
    }
    if (c.type === 'proposal') { proposals.push(c); return ''; }
    return '';
  }).join('');
  const grid = proposals.length && typeof AvalonReview !== 'undefined' && AvalonReview.voteRecapHtml
    ? AvalonReview.voteRecapHtml(proposals, seats, { reveal: true })
    : '';
  return `<div class="card"><h3>覆盤重點</h3><div class="rev">${cards}${grid}</div></div>`;
}
function liveRecord(g) {
  return { gid: g.gid, winner: g.winner, reason: g.reason, n: g.n, settings: g.settings,
    players: g.seats.map((s, i) => ({ ...s, seat: i + 1 })), quests: g.quests, rounds: g.rounds,
    ladyLog: g.ladyLog, ladyStartId: g.ladyStartId, ladyUsed: g.ladyUsed,
    assassinTarget: g.assassinTarget, scores: g.scores || {}, mvp: g.mvp, runnerUp: g.runnerUp,
    highlights: g.highlights || [], review: g.review, myId: S.meId, room: S.code,
    startedAt: g.startedAt || null, endedAt: g.endedAt || Date.now(), mineHost: !!(S && S.isHost) };
}
function detailHtml(r) {
  const seats = r.players;
  const goodWin = r.winner === 'good';
  window.__lastRecord = r;
  const settled = settleBody(r);
  return `${endSummaryHtml(r)}
  <div class="card settle-page">${settled.list}</div>
  <div class="card"><h3>全員身份</h3>${roundTable(seats, { label: s => `<span class="lbl ${ROLE[s.role].side === 'good' ? 'g' : 'e'}">${ROLE[s.role].n}</span>`, marker: s => (s.id === r.assassinTarget ? '🗡️' : '') + (s.id === r.mvp ? '🏅' : '') + (s.id === r.myId ? '⭐' : ''), center: `<b>${r.winner === 'none' ? '提前結束' : goodWin ? '藍方勝利' : '紅方勝利'}</b>🗡️ 被刺殺　🏅 MVP` })}</div>
  ${reviewHtml(r)}
  ${r.highlights && r.highlights.length ? `<div class="card"><h3>精彩時刻</h3><ul class="hl">${r.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul></div>` : ''}
  <div class="card"><h3>組隊 / 投票全記錄</h3>${voteGrid(seats, r.rounds || [], r.quests, r.myId)}</div>
  <button class="btn story" data-a="story">📸 分享到 IG 限時動態 / Threads</button>
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
      <div class="small muted">${g.n} 人局 · 座位 ${me.seat || '-'} · ${winTitle(g.winner)}</div><div class="tiny muted">${fmtTime(g.endedAt)}　${g.quests.map(q => q ? (q.success ? '🔵' : '🔴') : '⚪').join('')}</div></div><span class="gold">›</span></div>`;
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
  <button class="btn story" data-a="storystats">📸 分享戰績到 IG 限時動態 / Threads</button>
  <div class="footer">數據跟隨此瀏覽器的玩家身份保存</div>`;
}
function skinsHtml() {
  const cbk = cardBackOf();
  return `<div class="card"><h3 style="margin:0 0 8px">卡背</h3><div class="skinrow">${CARDBACKS.map(([k, n, ty, need]) => `<div class="skin ${unlockOk(ty, need) ? '' : 'lock'} ${cbk === k ? 'sel' : ''}" data-a="cardback" data-k="${k}"><div class="rc"><div class="art" style="background-image:url(${thumbCb(k)})"></div></div><div style="margin-top:4px">${n}${unlockOk(ty, need) ? '' : `<div class="tiny muted">🔒 ${needText(ty, need)}</div>`}</div></div>`).join('')}</div></div>
    <div class="card shiny-card"><div class="toggle"><div class="grow"><b>✨ 閃光卡牌特效</b><div class="muted small" id="shiny-lock">${mvpTotal() >= 10 ? (shinyOn() ? '已裝備。下面係實際效果。' : '已解鎖，可以裝備。') : `預覽中，未裝備。裝備要 10 次真實 MVP（${Math.min(myStats.mvp || 0, 10)}/10），GM 都一樣。預覽唔會解鎖。`}</div></div><button class="sw ${shinyOn() ? 'on' : ''}" data-a="shiny" ${mvpTotal() >= 10 ? '' : 'disabled'} aria-label="裝備閃光卡牌特效"></button></div>
      <button type="button" class="shiny-stage" data-a="shinyprev" aria-label="預覽閃光卡牌特效，不會裝備">
        <div class="rcard good holo" id="shiny-sample"><div class="strip"></div><div class="rart" style="background-image:url(${img('merlin')})"></div><div class="rname">梅林</div></div>
        <div class="shiny-status">預覽中 · 未裝備 · 撳卡再播一次</div>
      </button>
    </div><div class="card"><div class="small muted">主要角色有不同服裝（日常便服、節日盛裝）及特效皮膚。玩得越多解鎖越多，揭曉身份時會顯示你所選的皮膚，並保存到帳號。</div></div>` + ROLE_ORDER.map(k => {
    const played = rolePlayed(k); const cur = skinOf(k); const mine = skinsFor(k); const next = mine.find(s => s.need > played);
    return `<div class="card"><div class="row between"><h3 style="margin:0">${ROLE[k].n}</h3><span class="small muted">已玩 ${played} 場</span></div>
      <div class="skinrow" style="margin-top:10px">${skinsFor(k).map(s => `<div class="skin ${played >= s.need ? '' : 'lock'} ${cur === s.id ? 'sel' : ''}" data-a="skin" data-r="${k}" data-s="${s.id}">${roleFace(k, s.id, true)}<div style="margin-top:4px">${skinLabel(k, s)}${played >= s.need ? '' : ` 🔒${s.need}場`}</div></div>`).join('')}</div>
      ${next ? `<div class="tiny muted" style="margin-top:6px">下一款「${skinLabel(k, next)}」：${played}/${next.need} 場</div><div class="bar"><i style="width:${pct(played, next.need)}%"></i></div>` : '<div class="tiny gold" style="margin-top:6px">已解鎖全部皮膚 ✦</div>'}</div>`;
  }).join('');
}
function equipSkin(role, skinId) {
  const sk = skinById(skinId);
  const played = rolePlayed(role);
  if (!sk || played < sk.need) return Promise.reject(new Error('locked'));
  if (skinOf(role) === skinId) return Promise.resolve(false);
  const prev = { ...skinSel };
  skinSel[role] = skinId;
  $$(`.skin[data-a="skin"][data-r="${role}"]`).forEach(x => x.classList.toggle('sel', x.dataset.s === skinId));
  const label = `${(ROLE[role] || {}).n || role} · ${skinLabel(role, sk)}`;
  return saveSkins(prev).then(() => { toast(`已換上：${label}`, 'ok'); return true; })
    .catch((err) => {
      skinSel = prev;
      $$(`.skin[data-a="skin"][data-r="${role}"]`).forEach(x => x.classList.toggle('sel', x.dataset.s === (prev[role] || 'classic')));
      toast('儲存失敗，已恢復原先選擇', 'bad');
      throw err;
    });
}
function openSkinPreview(role, skinId) {
  const sk = skinById(skinId);
  const meta = ROLE[role] || { n: RN[role] || role, en: '', side: 'good' };
  if (!sk) return;
  const played = rolePlayed(role);
  const locked = played < sk.need;
  const equipped = skinOf(role) === skinId;
  const rows = [...document.querySelectorAll('.skinrow')].map(el => el.scrollLeft);
  const y = window.scrollY;
  const prev = document.querySelector('.skinprev');
  if (prev) prev.remove();
  const req = locked ? `再玩 ${sk.need - played} 場${meta.n}即可解鎖` : '';
  const ov = document.createElement('div');
  ov.className = 'skinprev';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', `${meta.n} ${sk.n}`);
  ov.innerHTML = `<div class="sp-sheet">
      <div class="sp-frame">
        <img class="sp-img sk-${sk.id}" src="${img(skinArt(role, skinId))}" alt="${esc(meta.n)} ${esc(sk.n)}">
        <div class="cap"><div class="rn">${esc(meta.n)}</div>${meta.en ? `<div class="en">${esc(meta.en)}</div>` : ''}</div>
      </div>
      <div class="sp-sub">${esc(meta.n)} · ${esc(skinLabel(role, sk))}</div>
      <button type="button" class="btn" id="sp-eq" ${locked || equipped ? 'disabled' : ''}>${esc(equipped ? '使用中' : (locked ? req : '換上'))}</button>
      <button type="button" class="btn ghost" id="sp-x">關閉</button>
    </div>`;
  document.body.appendChild(ov);
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    if (ov.parentNode) ov.remove();
    const live = document.querySelectorAll('.skinrow');
    rows.forEach((v, i) => { if (live[i]) live[i].scrollLeft = v; });
    window.scrollTo(0, y);
  };
  function onKey(e) {
    if (e.key !== 'Escape' || !document.body.contains(ov)) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }
  document.addEventListener('keydown', onKey, true);
  $('#sp-x', ov).onclick = (e) => { e.preventDefault(); e.stopPropagation(); close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  const eq = $('#sp-eq', ov);
  if (eq && !eq.disabled) eq.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    equipSkin(role, skinId).then(() => { eq.disabled = true; eq.textContent = '使用中'; }).catch(() => {});
  };
  const x = $('#sp-x', ov);
  if (x && x.focus) x.focus({ preventScroll: true });
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
        ${roundTable(DEMO_SEATS.slice(0, 5), { cls: x => s.team.includes(x.id) ? 'team' : '', marks: x => (s.team.includes(x.id) ? MARK_RING : '') + (x.id === s.leader ? `<span class="mfront">${MARK_CROWN}</span>` : ''), center: s.center || '' })}
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
    case 'ext': return P_(`<h4>🌊 湖中仙女 Lady of the Lake <span class="badge ok">本 App 已支援</span></h4><p>開局時交給首位隊長右手邊的玩家，即座號少一號嗰位（例如 3 號做首位隊長，仙女交 2 號；1 號做隊長就交最大號）。隊長由系統每輪自動指定：首位隨機抽，之後按座號順時針（1→2→3…）輪替。第 2、3、4 個任務結束後，持有者查驗一位玩家的陣營（只有自己看到），然後把仙女交給被查驗者。曾持有仙女的人不能被查驗。建議 8 人以上使用，可在房間設定開啟。</p>
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


// Shared canvas avatar: clip/draw the photo FIRST as a circle, then ALL pendant art in front (never behind).
async function canvasDrawAv(x, load, p, cx, cy, rad) {
  const ov = rad * 2 / 0.6;
  x.save();
  x.beginPath();
  x.arc(cx, cy, rad, 0, Math.PI * 2);
  x.fillStyle = (p && p.bg) || '#ffffff';
  x.fill();
  x.clip();
  const im = await load(photoSrc(p));
  if (im) {
    const s = Math.min(im.naturalWidth || im.width, im.naturalHeight || im.height);
    const sx = ((im.naturalWidth || im.width) - s) / 2, sy = ((im.naturalHeight || im.height) - s) / 2;
    x.drawImage(im, sx, sy, s, s, cx - rad, cy - rad, rad * 2, rad * 2);
  }
  x.restore();
  const k = p && p.pendant;
  if (k && k !== 'none') {
    if (PD_BACK[k]) { const bi = await load(pdSrc(k, 1)); if (bi) x.drawImage(bi, cx - ov / 2, cy - ov / 2, ov, ov); }
    if (PD_IMG[k]) { const pi = await load(pdSrc(k)); if (pi) x.drawImage(pi, cx - ov / 2, cy - ov / 2, ov, ov); }
  }
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
  const drawAv = async (p, cx, cy, rad, ring) => canvasDrawAv(x, load, p, cx, cy, rad);

  if (hero) await drawAv(hero, pad + 92, 150, 58, accent);
  else { x.fillStyle = '#eef0f4'; x.beginPath(); x.arc(pad + 92, 150, 58, 0, Math.PI * 2); x.fill(); x.font = '56px sans-serif'; x.textAlign = 'center'; x.fillText('🏳️', pad + 92, 170); }
  if (logo) x.drawImage(logo, W - pad - 108, 46, 90, 72);
  x.textAlign = 'left'; x.fillStyle = accent; x.font = 'bold 54px sans-serif'; x.fillText(early ? '提前結束' : good ? '藍方勝利' : '紅方勝利', pad + 176, 150);
  x.font = '20px sans-serif'; x.fillStyle = C.sub;
  const merlin = ps.find(p => p.role === 'merlin'); const at = r.assassinTarget && ps.find(p => p.id === r.assassinTarget);
  const sub = early ? '房主提前結束本局 · 不計勝負' : at ? (at.role === 'merlin' ? `刺客刺中梅林（${at.seat}號 ${at.name}）` : `刺客刺中的是 ${at.seat}號${roleN(at.role)}，梅林（${merlin ? merlin.seat : '?'}號）安然無恙`) : factionText(r.reason);
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
  const c = await makePoster(r, true); const blob = await new Promise(res => c.toBlob(res, 'image/png')); c.width = c.height = 0;
  if (window.__posterUrl) URL.revokeObjectURL(window.__posterUrl); const url = window.__posterUrl = URL.createObjectURL(blob);
  const fname = `mongkok-avalon-${(r.gid || 'game').slice(0, 8)}.png`;
  openModal(`<h2>戰報海報</h2><img src="${url}" style="width:100%;border-radius:12px;border:1px solid var(--line)"><p class="center small muted">長按圖片可儲存，或按下方儲存</p>
    <div class="btns"><button type="button" class="btn" id="dl">💾 儲存圖片</button><button type="button" class="btn ghost" id="sh">📤 分享</button></div>`, el => {
    $('#sh', el).onclick = () => shareSheet(r);
    $('#dl', el).onclick = async () => { const f = new File([blob], fname, { type: 'image/png' });
      if (IS_IOS && navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); } catch (e) {} return; }
      if (IS_IOS) return toast('長按上面張圖 →「加入相片」即可儲存');
      const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); };
  });
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
      if (IS_IOS) { closeModal(); return saveCard(r, true); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mongkok-avalon.png'; document.body.appendChild(a); a.click(); a.remove();
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

// ================= 9:16 story share image (IG Story / Threads) =================
async function makeStory(r) {
  const load = (src) => new Promise(res => { if (!src) return res(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const W = 1080, H = 1920; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const st = myStats || {}; const me = r && r.myId ? (r.players || []).find(p => p.id === r.myId) : null;
  const meP = me || { ...profile, id: profile.id }; const early = r && r.winner === 'none';
  const won = !!(r && me && !early && sideOf(me) === r.winner); const good = r ? r.winner === 'good' : true;
  const accent = !r ? '#7b5cff' : early ? '#7a808c' : good ? '#2f6fe8' : '#e23a52';
  const rr = (X, Y, w, h, rad) => { x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, rad) : x.rect(X, Y, w, h); };
  const ctr = (s, y, font, col) => { x.font = font; x.fillStyle = col; x.textAlign = 'center'; x.fillText(s, W / 2, y); };
  // background
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, !r ? '#efe9ff' : good && !early ? '#e7efff' : early ? '#eef0f4' : '#ffe9ec'); g.addColorStop(.55, '#ffffff'); g.addColorStop(1, '#fff7e6');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.save(); x.globalAlpha = .55; for (let i = 0; i < 70; i++) { const sx = (i * 397) % W, sy = (i * 761) % H, s = 3 + (i % 5) * 2; x.fillStyle = i % 3 ? '#ffd76a' : '#c9b8ff'; x.beginPath(); x.moveTo(sx, sy - s * 2); x.lineTo(sx + s / 2, sy - s / 2); x.lineTo(sx + s * 2, sy); x.lineTo(sx + s / 2, sy + s / 2); x.lineTo(sx, sy + s * 2); x.lineTo(sx - s / 2, sy + s / 2); x.lineTo(sx - s * 2, sy); x.lineTo(sx - s / 2, sy - s / 2); x.fill(); } x.restore();
  // header
  const [logo, qr] = await Promise.all([load('/img/amigos.webp'), load('/api/qr?text=' + encodeURIComponent(r ? replayUrl(r) : (PUBLIC_ORIGIN || location.origin)))]);
  if (logo) x.drawImage(logo, W / 2 - 230, 80, 120, 96);
  x.textAlign = 'left'; x.font = '900 72px sans-serif'; x.fillStyle = '#1f2633'; x.fillText('旺角阿瓦隆', W / 2 - 92, 150);
  x.font = '600 26px sans-serif'; x.fillStyle = '#8a909c'; x.fillText('M O N G K O K   A V A L O N', W / 2 - 88, 190);
  // result banner
  let y = 260;
  x.save(); x.shadowColor = 'rgba(30,40,80,.12)'; x.shadowBlur = 40; x.shadowOffsetY = 10; x.fillStyle = '#fff'; rr(70, y, W - 140, r ? 1000 : 820, 48); x.fill(); x.restore();
  x.save(); rr(70, y, W - 140, 170, 48); x.clip(); const bg2 = x.createLinearGradient(70, 0, W - 70, 0); bg2.addColorStop(0, accent); bg2.addColorStop(1, !r ? '#b18cff' : good && !early ? '#6aa0ff' : early ? '#a3a8b3' : '#ff7a8c'); x.fillStyle = bg2; x.fillRect(70, y, W - 140, 170); x.restore();
  ctr(!r ? '我的戰績' : early ? '提前結束' : good ? '藍方勝利' : '紅方勝利', y + 100, '900 76px sans-serif', '#fff');
  ctr(!r ? `${st.played || 0} 場 · 勝率 ${pct(st.won, st.played)}%` : `${r.n} 人局${r.room ? ' · 房間 ' + r.room : ''}`, y + 148, '600 30px sans-serif', 'rgba(255,255,255,.92)');
  y += 230;
  // avatar + pendant (photo first, all pendant art in front)
  const rad = 130, cx = W / 2, cy = y + rad + 30;
  await canvasDrawAv(x, load, meP, cx, cy, rad);
  y = cy + rad + 70; ctr(String(meP.name || '騎士').slice(0, 10), y, '800 54px sans-serif', '#1f2633');
  if (r && me) {
    y += 64; const rn = roleN(me.role); const side = sideOf(me);
    x.font = '700 34px sans-serif'; const tw = x.measureText(rn).width + 60; x.fillStyle = side === 'good' ? '#e6efff' : '#ffe6ea'; rr(W / 2 - tw / 2 - 90, y - 44, tw, 60, 30); x.fill();
    x.fillStyle = side === 'good' ? '#2f6fe8' : '#e23a52'; x.textAlign = 'center'; x.fillText(rn, W / 2 - 90, y - 3);
    const tag = early ? '不計勝負' : won ? '勝利' : '落敗'; x.fillStyle = early ? '#eef0f4' : won ? '#fff3cf' : '#f1f2f5'; rr(W / 2 + tw / 2 - 70, y - 44, 160, 60, 30); x.fill();
    x.fillStyle = early ? '#7a808c' : won ? '#b07a00' : '#7a808c'; x.fillText(tag, W / 2 + tw / 2 + 10, y - 3);
    if (r.mvp === me.id) { y += 70; ctr('🏅 本局 MVP', y, '800 40px sans-serif', '#d29a00'); }
    // mission timeline
    y += 90; ctr('任務結果', y, '700 30px sans-serif', '#8a909c'); y += 40;
    const qs = (r.quests || []).slice(0, 5); const gap = 150, x0 = W / 2 - gap * 2;
    for (let i = 0; i < 5; i++) { const q = qs[i]; const qx = x0 + i * gap, qy = y + 60;
      if (i < 4) { x.strokeStyle = '#e3e6ef'; x.lineWidth = 6; x.beginPath(); x.moveTo(qx + 50, qy); x.lineTo(qx + gap - 50, qy); x.stroke(); }
      x.beginPath(); x.arc(qx, qy, 48, 0, 6.2832); x.fillStyle = !q ? '#f1f2f5' : q.success ? '#2f6fe8' : '#e23a52'; x.fill();
      x.font = '900 42px sans-serif'; x.fillStyle = q ? '#fff' : '#b9bdc8'; x.textAlign = 'center'; x.fillText(!q ? String(i + 1) : q.success ? '✓' : '✗', qx, qy + 15); }
    y += 150;
  }
  // stats box
  y = Math.max(y + 40, r ? 1330 : 1150);
  const kp = [['總場數', String(st.played || 0)], ['勝率', pct(st.won, st.played) + '%'], ['MVP', String(st.mvp || 0)]];
  const bw = (W - 140 - 40) / 3;
  kp.forEach(([k, v], i) => { const bx = 70 + i * (bw + 20); x.fillStyle = '#ffffff'; x.save(); x.shadowColor = 'rgba(30,40,80,.08)'; x.shadowBlur = 24; rr(bx, y, bw, 170, 32); x.fill(); x.restore();
    x.textAlign = 'center'; x.font = '900 60px sans-serif'; x.fillStyle = i === 2 ? '#d29a00' : accent; x.fillText(v, bx + bw / 2, y + 90); x.font = '600 28px sans-serif'; x.fillStyle = '#8a909c'; x.fillText(k, bx + bw / 2, y + 138); });
  // footer: QR + url + credit
  const fy = H - 300; if (qr) { x.fillStyle = '#fff'; rr(110, fy, 210, 210, 24); x.fill(); x.drawImage(qr, 125, fy + 15, 180, 180); }
  x.textAlign = 'left'; x.font = '800 40px sans-serif'; x.fillStyle = '#1f2633'; x.fillText(r ? '掃碼睇完整覆盤' : '一齊嚟玩阿瓦隆！', 360, fy + 80);
  x.font = '600 28px sans-serif'; x.fillStyle = '#5d6472'; x.fillText((PUBLIC_ORIGIN || location.origin).replace(/^https?:\/\//, ''), 360, fy + 130);
  x.font = '600 26px sans-serif'; x.fillStyle = '#a0a6b2'; x.fillText('by Amigosparty', 360, fy + 180);
  return c;
}
async function storySheet(r) {
  openModal('<h2>分享到 IG / Threads</h2><div class="center muted">生成圖片中…</div>');
  const c = await makeStory(r); const blob = await new Promise(res => c.toBlob(res, 'image/png')); c.width = c.height = 0;
  if (window.__storyUrl) URL.revokeObjectURL(window.__storyUrl); const url = window.__storyUrl = URL.createObjectURL(blob);
  const file = new File([blob], 'mongkok-avalon-story.png', { type: 'image/png' });
  const link = r ? replayUrl(r) : (PUBLIC_ORIGIN || location.origin);
  const text = r ? `旺角阿瓦隆｜${r.winner === 'none' ? '提前結束' : r.winner === 'good' ? '藍方勝利' : '紅方勝利'}！${r.n} 人局戰報` : `我喺旺角阿瓦隆玩咗 ${myStats.played || 0} 場，勝率 ${pct(myStats.won, myStats.played)}%！`;
  const canFiles = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  openModal(`<h2>分享到 IG / Threads</h2><img src="${url}" alt="" style="display:block;width:62%;margin:0 auto;border-radius:14px;box-shadow:0 6px 20px rgba(30,40,80,.15)">
    <div class="share-grid" style="margin-top:12px">
      <button type="button" class="sh-i" id="s_ig"><span style="background:linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)">IG</span>Instagram 限時動態</button>
      <button type="button" class="sh-i" id="s_th"><span style="background:#111">@</span>Threads</button>
      <button type="button" class="sh-i" id="s_sys"><span style="background:#b8892f">⋯</span>分享…</button>
      <button type="button" class="sh-i" id="s_dl"><span style="background:#2b3a6e">💾</span>儲存圖片</button></div>
    <button type="button" class="btn ghost" id="cc">關閉</button>`, el => {
    const save = () => { if (IS_IOS && canFiles) return navigator.share({ files: [file] }).catch(() => {}); if (IS_IOS) return toast('長按上面張圖 →「加入相片」'); const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); toast('圖片已儲存'); };
    $('#cc', el).onclick = closeModal;
    $('#s_dl', el).onclick = save;
    $('#s_sys', el).onclick = async () => { if (canFiles) { try { await navigator.share({ files: [file], title: '旺角阿瓦隆', text: text + ' ' + link }); } catch (e) {} } else if (navigator.share) navigator.share({ title: '旺角阿瓦隆', text, url: link }).catch(() => {}); else save(); };
    $('#s_ig', el).onclick = async () => { // share sheet with the PNG → user picks Instagram (Story); else save + open the IG story camera
      if (canFiles) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      save(); toast('圖片已儲存，喺 Instagram 限時動態揀返呢張相'); setTimeout(() => { location.href = 'instagram-stories://share'; }, 600); };
    $('#s_th', el).onclick = async () => {
      if (canFiles) { try { await navigator.share({ files: [file], text: text + ' ' + link }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      window.open(`https://www.threads.net/intent/post?text=${encodeURIComponent(text + ' ' + link)}`, '_blank', 'noopener'); };
  });
}
async function posterDialog() { return saveCard(window.__lastRecord, true); }

// ================= actions =================
function saveSkins(prev) {
  LS.setItem('cc.skins', JSON.stringify(skinSel));
  return api('/api/me', { method: 'PUT', body: JSON.stringify({ skins: skinSel }) }).then((r) => {
    if (r && r.user && r.user.skins) { skinSel = r.user.skins; LS.setItem('cc.skins', JSON.stringify(skinSel)); }
    return r;
  }).catch((err) => {
    if (prev) { skinSel = prev; LS.setItem('cc.skins', JSON.stringify(skinSel)); }
    throw err;
  });
}
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-a]'); if (!el || !document.body.contains(el)) return;
  if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.closest('form')) e.preventDefault();
  const a = el.dataset.a;
  switch (a) {
    case 'profile': return editProfile();
    case 'ptab': return editProfile(null, el.dataset.t);
    case 'about': return openModal(`<h2>關於</h2><div class="center">${LOGO}<div class="name" style="margin-top:6px">旺角阿瓦隆</div><div class="small muted">版本 3.1 · 網頁版阿瓦隆多人遊戲</div><div class="small" style="margin-top:10px">by <b class="gold">Amigosparty</b></div><div class="tiny muted">Design by Teddy Design Limited</div><div class="tiny muted" style="margin-top:8px">原創美術 · 角色立繪、動物頭像、掛件皆為本作原創</div></div><button class="btn" id="ok">關閉</button>`, el2 => $('#ok', el2).onclick = closeModal);
    case 'cfg': cfgOpen = true; openModal(cfgSheetHtml()); cfgOpen = true; return;
    case 'cfgclose': return closeModal();
    case 'emote': return toggleEmotes(el);
    case 'avoid': return openAvoidSheet();
    case 'vetoinfo': { const vc = S && S.myVetoCards != null ? S.myVetoCards : (account && account.vetoCards); return openModal(`<div class="vuse"><img src="/img/veto.webp" alt="回避卡" width="150" height="200"></div><div class="center name">${isGM() ? '∞' : vetoAmt(vc) + ' / 10'}</div><p class="small muted center">${isGM() ? 'GM 回避卡為無限（∞），使用時唔會扣減，但仍要喺投票階段且身為隊員，每局只可以用一次。' : '每贏一局 +1 張（上限 10 張），永久保存在帳號。房間開啟「回避卡」時，投票階段身為隊員可用一張退出隊伍，本次組隊作廢且不計否決。'}</p><button type="button" class="btn" id="ok">知道了</button>`, el2 => $('#ok', el2).onclick = closeModal); }
    case 'shinyprev': {
      const y = window.scrollY;
      const card = document.querySelector('#shiny-sample');
      if (!card) return;
      card.classList.remove('holo');
      void card.offsetWidth;
      card.classList.add('holo');
      const status = document.querySelector('.shiny-status');
      if (status) status.textContent = mvpTotal() >= 10 ? (shinyOn() ? '已裝備 · 再播預覽' : '預覽中 · 未裝備') : `預覽中 · 未裝備 · ${Math.min(myStats.mvp || 0, 10)}/10 MVP`;
      window.scrollTo(0, y);
      return;
    }
    case 'shiny': {
      if (mvpTotal() < 10) return toast('達成「10次MVP」即可解鎖');
      const prev = { ...skinSel }; const on = !skinSel._shiny;
      skinSel._shiny = on; el.classList.toggle('on', on);
      saveSkins(prev).then((r) => {
        const saved = r && r.user && r.user.skins;
        if (saved && !!saved._shiny !== on) {
          skinSel = saved;
          LS.setItem('cc.skins', JSON.stringify(skinSel));
          el.classList.toggle('on', !!saved._shiny);
          return toast('未夠 10 次 MVP，未有裝備', 'bad');
        }
        toast(on ? '已開啟：閃光卡牌特效' : '已關閉：閃光卡牌特效', 'ok');
      }).catch(() => { el.classList.toggle('on', !!skinSel._shiny); toast('儲存失敗，已恢復原先選擇', 'bad'); });
      return;
    }
    case 'cardback': {
      const k = el.dataset.k; const c = CARDBACKS.find(x => x[0] === k);
      if (!unlockOk(c[2], c[3])) return toast(`${needText(c[2], c[3])}即可解鎖`);
      if (skinSel._cardback === k) return;
      const prev = { ...skinSel }; skinSel._cardback = k;
      $$('.skin[data-a="cardback"]').forEach(x => x.classList.toggle('sel', x.dataset.k === k));
      saveSkins(prev).then(() => toast(`已換上：${c[1]}`, 'ok'))
        .catch(() => { $$('.skin[data-a="cardback"]').forEach(x => x.classList.toggle('sel', x.dataset.k === (prev._cardback || 'cardback'))); toast('儲存失敗，已恢復原先選擇', 'bad'); });
      return;
    }
    case 'sharecard': return shareSheet(window.__lastRecord);
    case 'savecard': return saveCard(window.__lastRecord);
    case 'create': return ensureName(createRoom);
    case 'join': return ensureName(joinDialog);
    case 'toroom': {
      if (S && S.code) return go('room');
      if (heldRoom && heldRoom.code) return joinRoom(heldRoom.code);
      return;
    }
    case 'abandonseat': return confirmAbandon();
    case 'go': return go(el.dataset.v);
    case 'reloadboard': return loadBoard();
    case 'invite': return inviteDialog();
    case 'role': return showRole(false);
    case 'tg': {
      const k = el.dataset.k; const next = !S.settings[k];
      if (k === 'mic' && !next && window.AvalonVoice) AvalonVoice.roomOff();
      return act('settings', { [k]: next });
    }
    case 'releaselist': return openReleaseList();
    case 'release': return openReleaseConfirm(el.dataset.id);
    case 'kick': if (confirm('移除這位玩家？')) act('kick', { id: el.dataset.id }); return;
    case 'swap': { const id = el.dataset.id; if (selected.has(id)) selected.delete(id); else selected.add(id);
      if (selected.size === 2) { const [x, y] = [...selected]; selected = new Set(); await act('swap', { a: x, b: y }); } return render(); }
    case 'start': return act('start');
    case 'copycode': try { await navigator.clipboard.writeText(S.code); toast('已複製房間號 '+S.code); } catch { prompt('房間號', S.code); } return;
    case 'register': return authDialog('register');
    case 'login': return authDialog('login');
    case 'logout': return doLogout();
    case 'cap': return act('capacity', { n: Number(el.dataset.n) });
    case 'sit': {
      const seat = Number(el.dataset.seat); const gen = ++sitGen; sitPend = seat;
      el.classList.add('pend');
      previewSit(el);
      const r = await act('sit', { seat });
      if (gen !== sitGen) return;
      if (!r || !r.ok) { sitPend = 0; el.classList.remove('pend'); clearSitPreview(); }
      return;
    }
    case 'mic': e.stopPropagation(); if (window.AvalonVoice) AvalonVoice.toggle(); return;
    case 'listen': e.stopPropagation(); if (window.AvalonVoice) AvalonVoice.listen(); return;
    case 'floorend': return act('floor', { op: 'end', token: Number(el.dataset.token) });
    case 'floorpause': return act('floor', { op: 'pause', token: Number(el.dataset.token) });
    case 'floorresume': return act('floor', { op: 'resume', token: Number(el.dataset.token) });
    case 'floorskip': return act('floor', { op: 'skip', token: Number(el.dataset.token) });
    case 'floorrestart': return act('floor', { op: 'restart' });
    case 'discover': {
      if (!S || !S.isHost) return;
      if (discoverOn) { discoverOn = false; render(); await act('discover', { on: false }); return; }
      const loc = await requestPosition();
      if (!loc.ok) { toast(loc.msg); return; }
      const r = await act('discover', { on: true, lat: loc.lat, lng: loc.lng });
      if (r && r.ok) { discoverOn = true; render(); toast('已讓附近玩家搜尋到這個房間'); }
      return;
    }
    case 'ready': { const me = (S.seats||[]).find(p => p && p.id === S.meId); return act('ready', { ready: !(me && me.ready) }); }
    case 'adv': return act('settings', { advanced: !S.settings.advanced });
    case 'seat': {
      const id = el.dataset.id;
      if (id === S.meId) {
        return openModal(`<h2>我的座位</h2><div class="center">${av(people().find(p=>p.id===id)||profile,56)}<div class="name">${esc(profile.name)}</div></div><button class="btn ghost" data-x="stand">離座</button><button class="btn" id="ok">關閉</button>`, el2 => {
          el2.querySelector('[data-x=stand]').onclick = () => { closeModal(); if (S && S.isHost) openReleaseConfirm(id); else act('stand', {}); };
          $('#ok', el2).onclick = closeModal;
        });
      }
      const p = (S.seats||[]).find(x => x && x.id === id); if (!p) return;
      return openModal(`<h2>騎士名片</h2><div class="center namecard">${av(p,56)}<div class="name">${esc(p.name)}</div><div class="small muted">座位 ${p.seat}${p.isHost?' · 房主':''}${p.online?'':' · 離線'}</div></div>
        ${S.isHost?`<div class="btns"><button class="btn ghost" data-x="stand">請他離座</button><button class="btn ghost" data-x="tr">轉讓房主</button></div><button class="btn dark" data-x="kick" style="color:#ff8b9c">移出房間</button>`:''}
        <button class="btn" id="ok">關閉</button>`, el2 => {
          const bind = (sel, fn) => { const b=el2.querySelector(sel); if (b) b.onclick = fn; };
          bind('[data-x=stand]', () => { closeModal(); openReleaseConfirm(id); });
          bind('[data-x=tr]', () => { if (confirm('把房主轉讓給 '+p.name+'？')) { closeModal(); act('transfer', { id }); } });
          bind('[data-x=kick]', () => { if (confirm('移出 '+p.name+'？')) { closeModal(); act('kick', { id }); } });
          $('#ok', el2).onclick = closeModal;
        });
    }
    case 'menu': return openRoomMenu();
    case 'leave': {
      const r = await emit('leave');
      waitingRoom = null;
      if (r.stillSeated && r.room) {
        heldRoom = { code: r.room, seated: true };
        saveHeld();
        S = null;
        toast('遊戲進行中，你的座位會保留。可以返回房間。');
        return go('home');
      }
      clearHeld();
      S = null;
      return go('home');
    }
    case 'veto': if (confirm('使用回避卡退出本支隊伍？本輪否決不增加，且你本輪不能再被選入。')) return act('veto'); return;
    case 'sword': { const id=[...selected][0]; if (id) { const r=await act('sword',{id}); if(r.ok) selected=new Set(); } return; }
    case 'swordflip': { const id=[...selected][0]; if (id && confirm('翻轉 '+P(id).name+' 的任務卡？')) { const r=await act('swordflip',{id}); if(r.ok) selected=new Set(); } return; }
    case 'swordskip': return act('swordflip', { skip: true });
    case 'abort': return openAbortConfirm();
    case 'lobby': return act('lobby');
    case 'sel': {
      const id = el.dataset.id; const g = S.game;
      if (g.phase === 'team') { if (selected.has(id)) selected.delete(id); else if (selected.size < g.teamSizes[g.round]) selected.add(id); else toast(`最多選 ${g.teamSizes[g.round]} 人`); }
      else selected = new Set(selected.has(id) ? [] : [id]);
      return render();
    }
    case 'propose': { const r = await act('propose', { team: [...selected] }); if (r.ok) selected = new Set(); return; }
    case 'vote': hideVoteRemind(); return act('vote', { approve: el.dataset.v === '1' });
    case 'quest': hideVoteRemind(); return act('quest', { success: el.dataset.v === '1' });
    case 'votego': return focusVoteControls();
    case 'voteremind-x': return hideVoteRemind();
    case 'lady': return openActConfirm('lady');
    case 'assassinate': return openActConfirm('assassinate');
    case 'detail': return go('detail', { gid: el.dataset.g, from: 'history' });
    case 'poster': return posterDialog();
    case 'scores': return openScoreSheet(window.__lastRecord);
    case 'story': return storySheet(window.__lastRecord);
    case 'storystats': return storySheet(null);
    case 'skin': return openSkinPreview(el.dataset.r, el.dataset.s);
    case 'rtab': rulesTab = el.dataset.v; if (rulesTab === 'round') demoStep = 0; return mountRules();
    case 'wk': wkRole = el.dataset.r; return mountRules();
    case 'wkrev': wkReveal = !wkReveal; return mountRules();
    case 'demo': demoStep = demoStep === DEMO.length - 1 && el.dataset.v === '1' ? 0 : Math.max(0, demoStep + Number(el.dataset.v)); return mountRules();
    case 'rolepeek': { const k = el.dataset.r; return openModal(`<div class="flip on" style="cursor:default"><div class="in"><div class="face back"></div><div class="face front">${roleFace(k)}</div></div></div><p class="center" style="margin-top:14px">${ROLE[k].d}</p><button class="btn" id="ok">關閉</button>`, (m) => $('#ok', m).onclick = closeModal); }
  }
});
render();
window.__av = { av, makeStory, storySheet, get S() { return S; }, render, makePoster, replayUrl, inviteUrl, showQuest, closeModal, go, showRole, reviewHtml, knows: (r) => { rulesTab = 'knows'; wkRole = r; go('rules'); } };
})();
