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
const FXS = [['none','無',0],['spot','聚光燈',0],['gold','金光',0],['snow','聖誕飄雪',0],['spark','星火',1],['petals','花瓣',3],['howl','狼人咆哮',4],['fire','火焰圈',6],['lightning','閃電',10],['silver','銀白追光',0]];
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
  ['coffee', '一杯咖啡', 'support', 1],
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
// One original charm per round frame, tied to the distinctive word in the name.
const PD_PAL = {
  foxqiu: 'fox', foxheart: 'heart', starmoon: 'moon', starplain: 'stars',
  whiteling: 'white', darkling: 'dark', skydragon: 'dragon', foxdance: 'dance',
  frostmirror: 'snow', icesword: 'sword', fairylake: 'fairy', odineye: 'eye',
};
function pdFxCls(k) {
  const fx = PD_FX[k];
  if (!fx) return '';
  return fx === 'ice' ? ' pd-round pd-ice' : ' pd-round pd-sheen pd-sheen-' + fx;
}
const PD_PAL_SVG = {
  fox: `<svg viewBox="0 0 280 280" aria-hidden="true"><image href="data:image/webp;base64,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" width="280" height="280"/><path d="M8 8h12" fill="none" stroke="#000" stroke-width="3" opacity="0"/></svg>`,
  heart: `<svg viewBox="0 0 280 280" aria-hidden="true"><image href="data:image/webp;base64,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" width="280" height="280"/><path d="M8 8h12" fill="none" stroke="#000" stroke-width="3" opacity="0"/></svg>`,
  moon: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M48 4a26 26 0 1 0 .2 52A17 17 0 1 1 48 4z" fill="#f7fbff" stroke="#243656" stroke-width="4"/><path d="M4 28h24L16 12z" fill="#f0d060" stroke="#7a5810" stroke-width="3.5" stroke-linejoin="round"/><path d="M6 42h20L16 30z" fill="#e7c24a" stroke="#7a5810" stroke-width="3.5" stroke-linejoin="round"/><rect x="13" y="42" width="6" height="14" rx="1.2" fill="#9bb4cc" stroke="#243656" stroke-width="3"/><path d="M10 58h12" stroke="#243656" stroke-width="3.5" stroke-linecap="round"/></svg>`,
  stars: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 56 30 18" stroke="#fff6d0" stroke-width="9" stroke-linecap="round"/><path d="M8 56 30 18" stroke="#e2b028" stroke-width="4.5" stroke-linecap="round"/><path d="M36 4l5 16 18 2-13 11 4 17-14-9-14 9 4-17L16 22l16-2z" fill="#ffe36a" stroke="#6a4a08" stroke-width="3.6" stroke-linejoin="round"/><circle cx="54" cy="8" r="4.2" fill="#fff" stroke="#6a4a08" stroke-width="2.6"/><circle cx="56" cy="40" r="3.3" fill="#ffe36a" stroke="#6a4a08" stroke-width="2.6"/></svg>`,
  white: `<svg viewBox="0 0 280 280" aria-hidden="true"><image href="data:image/webp;base64,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" width="280" height="280"/><path d="M8 8h12" fill="none" stroke="#000" stroke-width="3" opacity="0"/></svg>`,
  dark: `<svg viewBox="0 0 280 280" aria-hidden="true"><image href="data:image/webp;base64,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" width="280" height="280"/><path d="M8 8h12" fill="none" stroke="#000" stroke-width="3" opacity="0"/></svg>`,
  dragon: `<svg viewBox="0 0 280 280" aria-hidden="true"><image href="data:image/webp;base64,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" width="280" height="280"/><path d="M8 8h12" fill="none" stroke="#000" stroke-width="3" opacity="0"/></svg>`,
  dance: `<svg viewBox="0 0 280 280" aria-hidden="true"><image href="data:image/webp;base64,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" width="280" height="280"/><path d="M8 8h12" fill="none" stroke="#000" stroke-width="3" opacity="0"/></svg>`,
  snow: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="#e7f7ff" stroke="#0f4e78" stroke-width="4" stroke-linejoin="round"><path d="M32 2 37 22 32 26 27 22z"/><path d="M32 62 27 42 32 38 37 42z"/><path d="M2 32 22 27 26 32 22 37z"/><path d="M62 32 42 37 38 32 42 27z"/><path d="M10 10 26 24 24 28 16 20z"/><path d="M54 54 38 40 40 36 48 44z"/><path d="M54 10 40 24 36 22 46 14z"/><path d="M10 54 24 40 28 42 18 50z"/></g><circle cx="32" cy="32" r="8" fill="#fff" stroke="#0f4e78" stroke-width="3.6"/><circle cx="32" cy="32" r="3.6" fill="#7ec8ee"/></svg>`,
  sword: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 1 43 18 38 40 32 47 26 40 21 18z" fill="#f5fcff" stroke="#14385a" stroke-width="4.2" stroke-linejoin="round"/><path d="M32 16v22" stroke="#6ebcea" stroke-width="3.4" stroke-linecap="round"/><path d="M8 45h48" stroke="#e7f4fc" stroke-width="8" stroke-linecap="round"/><path d="M10 45h44" stroke="#14385a" stroke-width="3.2" stroke-linecap="round"/><rect x="27" y="47" width="10" height="10" rx="2" fill="#2a6ea2" stroke="#14385a" stroke-width="3"/><circle cx="32" cy="60" r="4.2" fill="#eaf6ff" stroke="#14385a" stroke-width="3"/></svg>`,
  fairy: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M31 28C24 14 10 12 6 24c-2 8 4 14 12 15 2-2 6-6 10-8 1-1 2-2 3-3z" fill="#e9fff8" stroke="#0e665c" stroke-width="3" stroke-linejoin="round"/><path d="M30 31C22 33 12 40 15 49c3 5 11 4 16-4 1-3 1-8-1-14z" fill="#d7fff3" stroke="#0e665c" stroke-width="2.7" stroke-linejoin="round"/><path d="M33 28C40 14 54 12 58 24c2 8-4 14-12 15-2-2-6-6-10-8-1-1-2-2-3-3z" fill="#e9fff8" stroke="#0e665c" stroke-width="3" stroke-linejoin="round"/><path d="M34 31C42 33 52 40 49 49c-3 5-11 4-16-4-1-3-1-8 1-14z" fill="#d7fff3" stroke="#0e665c" stroke-width="2.7" stroke-linejoin="round"/><path d="M28 26c-8 3-14 8-16 12M36 26c8 3 14 8 16 12" fill="none" stroke="#8edfd2" stroke-width="1.45" stroke-linecap="round"/><ellipse cx="32" cy="59.2" rx="10" ry="2.8" fill="#17886a" stroke="#0c564c" stroke-width="2.1"/><path d="M32 56.6v4.8" stroke="#0c564c" stroke-width="1.2"/><path d="M23 22c.6-7 5.4-12 9-12s8.4 5 9 12c1 6-2 8-9 8s-10-2-9-8z" fill="#6b4632"/><path d="M40 24c5 2 8 7 6 13" fill="none" stroke="#6b4632" stroke-width="3.3" stroke-linecap="round"/><path d="M32 34c-2.2 0-4 2-4.2 4.6-6 4.6-8.6 11-6.6 16.4h21.6c2-5.4-.6-11.8-6.6-16.4-.2-2.6-2-4.6-4.2-4.6z" fill="#2ec4b6" stroke="#0c5c54" stroke-width="3.2" stroke-linejoin="round"/><path d="M25.5 40h13" stroke="#0e7a70" stroke-width="2" stroke-linecap="round"/><path d="M24.5 53.5c4.2 2.4 10.8 2.4 15 0" fill="none" stroke="#e7fff8" stroke-width="1.8" stroke-linecap="round"/><circle cx="32" cy="24" r="7.6" fill="#ffe4d4" stroke="#0c5c54" stroke-width="3"/><path d="M25.6 22.4c1.2-3 3.4-4.6 6.4-4.6s5.2 1.6 6.4 4.6c-1.6-1.3-3.8-2-6.4-2s-4.8.7-6.4 2z" fill="#6b4632"/><ellipse cx="29.2" cy="24.2" rx="1.2" ry="1.4" fill="#2a2420"/><ellipse cx="34.8" cy="24.2" rx="1.2" ry="1.4" fill="#2a2420"/><circle cx="29.6" cy="23.7" r=".4" fill="#fff"/><circle cx="35.2" cy="23.7" r=".4" fill="#fff"/><path d="M30.4 27c.9 1 2.3 1 3.2 0" fill="none" stroke="#e08090" stroke-width="1.25" stroke-linecap="round"/><ellipse cx="26.6" cy="26" rx="1.3" ry=".7" fill="#f3b0b0"/><ellipse cx="37.4" cy="26" rx="1.3" ry=".7" fill="#f3b0b0"/><path d="M28 38c-5 1.5-8 4.5-7.2 7.5" fill="none" stroke="#0c5c54" stroke-width="2" stroke-linecap="round"/><path d="M28.2 39c-4.2 1.2-6.8 3.6-6.2 6" fill="none" stroke="#ffe4d4" stroke-width="2.5" stroke-linecap="round"/><path d="M36.5 36.5c4-2 9-1 11.5 2" fill="none" stroke="#0c5c54" stroke-width="2" stroke-linecap="round"/><path d="M36.8 37.6c3.6-1.6 8-.6 10.2 2" fill="none" stroke="#ffe4d4" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="49" cy="37.2" rx="2" ry="2.7" fill="#e7f8ff" stroke="#0e665c" stroke-width="1.5"/><path d="M18 16c1.4-2.2 3.6-2 4.2.2-1.6.6-3.2.2-4.2-.2z" fill="#fff" stroke="#0e665c" stroke-width="1.2" stroke-linejoin="round"/><circle cx="20.2" cy="15.2" r="1.05" fill="#ffe07a" stroke="#0e665c" stroke-width="1"/></svg>`,
  eye: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M2 32C14 14 24 8 32 8s18 6 30 24c-12 18-22 24-30 24S14 50 2 32z" fill="#f6f7fc" stroke="#221c40" stroke-width="4.2" stroke-linejoin="round"/><circle cx="32" cy="32" r="13" fill="#6848d0" stroke="#221848" stroke-width="3.6"/><circle cx="32" cy="32" r="6.5" fill="#140c28"/><circle cx="37" cy="27" r="3.2" fill="#fff"/></svg>`,
};
function pdPalHtml(k, side) {
  const kind = PD_PAL[k];
  if (!kind) return '';
  const flip = side === 'right' ? ' pd-pal-right' : '';
  return `<span class="pd-pal pd-pal-${kind}${flip}" data-pal="${kind}">${PD_PAL_SVG[kind]}</span>`;
}
const PD_IMG = Object.fromEntries(PENDANTS.map(x => [x[0], 1]));
const PHASE = { team: '組隊', vote: '投票', sword: '授予王者之劍', quest: '任務', swordflip: '王者之劍', lady: '湖中仙女', assassin: '刺殺梅林', end: '遊戲結束' };
const TEAM_SIZES = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5], 11: [3, 4, 4, 5, 5], 12: [3, 4, 5, 5, 5] };
const LOGO = `<img class="logo merlin" src="/img/logo-merlin.webp" alt="" width="88" height="88" decoding="async">`;
const AMIGOS = `<img class="amigos-mark" src="/img/amigos.webp" alt="Amigos' Party" width="22" height="18" decoding="async">`;
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
if (profile.pendant === 'coffee') profile.pendant = 'none';
if (profile.fx === 'silver') profile.fx = 'spot';
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
const bootQ = new URLSearchParams(location.search);
let pendingJoin = bootQ.get('room');
let pendingSupport = bootQ.get('support') === 'pending' || bootQ.get('support') === 'cancel' ? bootQ.get('support') : null;
if (pendingJoin || pendingSupport) history.replaceState(null, '', pendingJoin ? '/?room=' + encodeURIComponent(pendingJoin) : '/');
if (pendingJoin) history.replaceState(null, '', '/');
let autoRoom = true;

ensureSession().then(() => {
  if (pendingSupport) {
    supportNote = pendingSupport === 'cancel' ? '已取消付款，未有解鎖。' : '付款確認緊。解鎖只會喺伺服器核對到 Stripe 通知之後先出現。';
    const watch = pendingSupport === 'pending';
    pendingSupport = null;
    view = 'support';
    if (watch) {
      let n = 0;
      const t = setInterval(async () => {
        n += 1;
        try {
          const r = await api('/api/me');
          applyUser(r.user, r.stats);
          if ((r.user.benefits || []).length) supportNote = '';
          if (view === 'support') render();
          if ((r.user.benefits || []).length || n > 8) clearInterval(t);
        } catch (e) { if (n > 8) clearInterval(t); }
      }, 1500);
    }
  }
  if (view === 'home' || view === 'support') render();
}).catch(() => {}); // start auth in parallel with the socket handshake
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
const SUPPORT_EMOTE = 'sup_coffee';
function supportEmoSvg(sz) {
  return `<svg class="sup-emo" width="${sz}" height="${sz}" viewBox="0 0 64 64" aria-label="支持者表情"><circle cx="32" cy="32" r="30" fill="#fff6ea" stroke="#e2b56a" stroke-width="3"/><circle cx="24" cy="28" r="3" fill="#3a2a1c"/><circle cx="40" cy="28" r="3" fill="#3a2a1c"/><path d="M22 38c3 6 17 6 20 0" fill="none" stroke="#e07a3a" stroke-width="3" stroke-linecap="round"/><path d="M44 44h8c2 4 1 8-3 8h-6" fill="none" stroke="#6a4324" stroke-width="2.4" stroke-linecap="round"/><path d="M46 42h7v6c0 2-2 3-3.5 3H46z" fill="#fff" stroke="#6a4324" stroke-width="2"/></svg>`;
}
const emoChar = (c) => String.fromCodePoint(...c.split('_').map(h => parseInt(h, 16)));
const emoImg = (c, sz) => `<img src="https://fonts.gstatic.com/s/e/notoemoji/latest/${c}/512.webp" alt="${emoChar(c)}" width="${sz}" height="${sz}" loading="lazy" decoding="async" onerror="this.replaceWith(document.createTextNode(this.alt))">`;
let emoLast = 0;
function closeEmotes() { const p = document.getElementById('emopop'); if (p) p.remove(); document.removeEventListener('pointerdown', emoOutside, true); }
function emoOutside(e) { const p = document.getElementById('emopop'); if (p && !p.contains(e.target) && !e.target.closest('.emote-btn')) closeEmotes(); }
function toggleEmotes(btn) {
  if (document.getElementById('emopop')) return closeEmotes();
  const r = btn.getBoundingClientRect(); const pop = document.createElement('div'); pop.id = 'emopop'; pop.className = 'emopop';
  const list = hasBenefit('emote') ? EMOTES.concat(SUPPORT_EMOTE) : EMOTES;
  pop.innerHTML = list.map(c => `<button data-e="${c}">${c === SUPPORT_EMOTE ? supportEmoSvg(34) : emoImg(c, 34)}</button>`).join('');
  pop.style.top = (r.bottom + 8) + 'px'; pop.style.right = Math.max(8, innerWidth - r.right) + 'px';
  document.body.appendChild(pop);
  pop.onclick = (e) => { const b = e.target.closest('[data-e]'); if (!b) return; const now = Date.now();
    if (now - emoLast < 2000) return toast('慢少少，2 秒後再發'); emoLast = now; socket.emit('emote', { e: b.dataset.e }); closeEmotes(); };
  setTimeout(() => document.addEventListener('pointerdown', emoOutside, true), 0);
}
socket.on('emote', ({ id, e } = {}) => {
  if (e !== SUPPORT_EMOTE && !EMOTES.includes(e)) return;
  const st = Array.from(document.querySelectorAll('.rt .st[data-sid]')).find(x => x.dataset.sid === id && x.offsetParent); if (!st) return;
  const a = (st.querySelector('.av') || st).getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'emofly'; el.innerHTML = e === SUPPORT_EMOTE ? supportEmoSvg(52) : emoImg(e, 52);
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
const COFFEE_SVG = `<svg class="pov coffee" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="56" rx="14" ry="3.5" fill="#edd9b8"/><path d="M16 28h24c1 9-.5 16-5 20-6 5-14 5-19 0-4-4-5-11-5-20z" fill="#fffdf8" stroke="#6a4324" stroke-width="3" stroke-linejoin="round"/><path d="M20 28c1-7 5-10 8-10 2 0 3 2 3 2" fill="#7a4a28"/><path d="M40 32h5c4 0 7 3 7 6.5S49 45 45 45h-5" fill="none" stroke="#6a4324" stroke-width="3" stroke-linecap="round"/><path d="M24 18c1-5 0-7 3-9" fill="none" stroke="#d5dee8" stroke-width="2.2" stroke-linecap="round"/><path d="M33 16c1-4 0-6 3-8" fill="none" stroke="#d5dee8" stroke-width="2.2" stroke-linecap="round"/></svg>`;
function pendantHtml(p) {
  const k = (p && p.pendant) || 'none'; if (!PD_IMG[k]) return '';
  if (k === 'coffee') return COFFEE_SVG;
  // All pendant art is a sibling overlay IN FRONT of the clipped photo (never inside .av).
  return `<img class="pov${PD_ICE[k] ? ' ice' : ''}" src="${pdSrc(k)}" alt="" loading="lazy" decoding="async">`;
}
const pendantBack = (p) => { const k = (p && p.pendant) || 'none'; return PD_BACK[k] ? `<img class="pov back" src="${pdSrc(k, 1)}" alt="" loading="lazy" decoding="async">` : ''; };
function faceCirc(p) {
  return `<span class="pdcirc"><img src="${esc(photoSrc(p))}" alt=""></span>`;
}
function av(p, size = 36, palSide = '') {
  const src = esc(photoSrc(p));
  const bg = esc((p && p.bg) || '#ffffff');
  const k = (p && p.pendant) || 'none';
  // Photo/circle is clipped inside .av only. Pendant overlays and the charm sit higher in an unclipped wrapper.
  return `<span class="av-wrap${pdFxCls(k)}">${pendantBack(p)}<span class="av s${size}" style="width:${size}px;height:${size}px;background:${bg}"><img src="${src}" alt="" width="${size}" height="${size}" decoding="async"></span>${pendantHtml(p)}${pdPalHtml(k, palSide)}</span>`;
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
const hasBenefit = (id) => !!(account && Array.isArray(account.benefits) && account.benefits.includes(id));
const playedTotal = () => isGM() ? 1e9 : (myStats.played || 0);
const winsTotal = () => isGM() ? 1e9 : (myStats.won || 0);
const mvpTotal = () => (myStats.mvp || 0); // even GM must earn 10 real MVPs for 桂冠 / 閃光特效
const vetoAmt = (n) => (isGM() || n >= 999) ? '∞' : (n == null ? '–' : String(n));

// ================= profile =================
function fxUnlocked(k) {
  if (k === 'silver') return hasBenefit('silver');
  const item = FXS.find(x => x[0] === k); return playedTotal() >= (item ? item[2] : 0);
}
function pdUnlocked(k) { if (k === 'none') return true; const it = PENDANTS.find(x => x[0] === k); if (!it) return false; if (it[2] === 'support') return hasBenefit('coffee'); return unlockOk(it[2], it[3]); }
const pdNeed = (it) => it[2] === 'support' ? '支持解鎖' : it[2] === 'wins' ? `勝 ${it[3]} 場解鎖` : it[2] === 'mvp' ? `MVP ${Math.min(mvpTotal(), it[3])}/${it[3]} 解鎖` : `玩 ${it[3]} 場解鎖`;
function pdCell(k, n, sel, locked, sp, sub) {
  const fx = pdFxCls(k);
  return `<button class="pdc ${sel ? 'sel' : ''} ${locked ? 'off' : ''}" data-pd="${k}">${sp ? '<span class="sp">✨</span>' : ''}${sel ? '<span class="ck">✓</span>' : ''}${locked ? '<span class="lk">🔒</span>' : ''}<div class="pdv${fx}">${k === 'none' ? '<span class="pdx">不佩戴</span>' : `${PD_BACK[k] ? `<img class="pov back" src="${pdSrc(k, 1)}" alt="">` : ''}${faceCirc(profile)}${k === 'coffee' ? COFFEE_SVG : `<img class="pov${PD_ICE[k] ? ' ice' : ''}" src="${pdSrc(k)}" alt="">`}${pdPalHtml(k)}`}</div><b>${n}</b>${sub ? `<i>${sub}</i>` : ''}</button>`;
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
  const FX_IC = { none:'—', spot:'💡', gold:'✨', snow:'❄️', spark:'🌟', petals:'🌸', howl:'🐺', fire:'🔥', lightning:'⚡', silver:'✦' };
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
          const art = x[0] === 'coffee' ? COFFEE_SVG : `<img class="pov${PD_ICE[x[0]] ? ' ice' : ''}" src="${pdSrc(x[0])}" alt="">`;
          return `<button type="button" class="pdc ${sel?'sel':''} ${locked?'off':''}" data-pd="${x[0]}">${sel?'<span class="ck">✓</span>':''}${x[4]?'<span class="sp">✨</span>':''}${locked?'<span class="lk">🔒</span>':''}<div class="pdv${fx}">${PD_BACK[x[0]]?`<img class="pov back" src="${pdSrc(x[0],1)}" alt="">`:''}${faceCirc(d)}${art}${pdPalHtml(x[0])}</div><b>${x[1]}</b>${locked?`<i>${pdNeed(x)}</i>`:''}</button>`;
        }));
      return `<div class="pe-grid">${cells.join('')}</div>`;
    }
    const photoOn = d.avatar === 'photo' || (d.avatar && String(d.avatar).startsWith('data:')) || d._forceSub === 'photo';
    const tiles = [`<button type="button" class="${photoOn?'sel':''}" data-upload="1"><div class="cell pe-camcell">📷</div><div class="lb">上載相片</div>${photoOn?'<span class="ck">✓</span>':''}</button>`]
      .concat(ANIMALS.map(([k,n]) => `<button type="button" data-e="${k}" class="${k===d.avatar?'sel':''}"><div class="cell" style="background:${d.bg}"><img src="/img/av/${k}.webp" alt=""></div><div class="lb">${n}</div>${k===d.avatar?'<span class="ck">✓</span>':''}</button>`));
    const sw = `<div class="swatches">${BGS.map(c => `<button type="button" data-c="${c}" class="${c===d.bg?'sel':''}" style="background:${c}"></button>`).join('')}</div>`;
    const fxs = `<div class="pe-fxlab">入場特效</div><div class="pe-fx">${FXS.map(([k,n,need]) => `<button type="button" data-fx="${k}" class="${d.fx===k?'sel':''} ${fxUnlocked(k)?'':'off'}">${FX_IC[k]||''} ${n}${fxUnlocked(k)?'':` 🔒${k==='silver'?'支持':need+'場'}`}</button>`).join('')}</div>`;
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
    const sh = $('#sh', el); if (sh) sh.onclick = () => navigator.share({ title: 'HK阿瓦隆', text: `入房玩HK阿瓦隆！房間號 ${S.code}`, url }).catch(() => {});
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
    const palSide = x < 40 ? 'right' : '';
    if (!s || s.empty) {
      return `<div class="st empty click" style="${pos}" data-a="sit" data-seat="${seatNo}"><div class="av-empty">+</div><div class="nm">空位</div></div>`;
    }
    if (s.claimable) {
      return `<div class="st claim click" style="${pos}" data-sid="${s.id}" data-id="${s.id}" data-seat="${seatNo}" data-a="sit"><div class="av-empty">+</div><div class="nm">${esc(s.name || '可接手')}</div><div class="st-pills"><span class="claimpill">可接手</span></div></div>`;
    }
    const enterFx = s.spotlight ? 'silver' : (s.fx || 'spot');
    const cls = (o.cls ? o.cls(s, i) : '') + (o.click && o.click(s, i) ? ' click' : '') + (enterIds.has(s.id) ? ` enter fx-${enterFx}` : '');
    const action = o.action || 'sel';
    const actAttr = o.click && o.click(s, i) ? `data-a="${action}"` : (o.seatClick ? `data-a="${o.seatClick}"` : '');
    const mic = (window.AvalonVoice && AvalonVoice.glyph(s.id)) || '';
    const pres = (window.AvalonVoice && AvalonVoice.presence(!!s.online)) || '';
    const speakCls = (S && S.settings && S.settings.mic === true && S.floor && S.floor.speaker === s.id) ? ' is-speak' : '';
    const sparks = String(cls).includes('gold-pick') ? '<i class="gspark a" aria-hidden="true"></i><i class="gspark b" aria-hidden="true"></i><i class="gspark c" aria-hidden="true"></i>' : '';
    return `<div class="st ${cls}${speakCls}" style="${pos}" data-sid="${s.id}" data-id="${s.id}" data-seat="${seatNo}" ${actAttr}>
      <div class="mk">${o.marker ? o.marker(s, i) : ''}</div>${o.marks ? o.marks(s, i) : ''}${av(s, avSize, palSide)}${sparks}${mic}${pres}${o.badge ? o.badge(s, i) : ''}${o.label ? o.label(s, i) : ''}<div class="st-meta"><div class="nm">${esc(s.name)}</div>${o.sub ? `<div class="st-pills">${o.sub(s, i)}</div>` : ''}</div></div>`;
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
  const titles = { home: 'HK阿瓦隆', support: '支持我哋', room: inRoom ? null : '房間', history: '歷史記錄', stats: '數據統計', rules: '規則介紹', skins: '角色皮膚', detail: '對局詳情', ach: '成就', board: '排行榜' };
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
    titleEl.textContent = titles[view] || 'HK阿瓦隆';
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
  else if (view === 'support') { app.innerHTML = supportHtml(); }
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
      <div class="grow"><div class="name">${profile.name ? esc(profile.name) : '未設定暱稱'}${isGM() ? '<span class="gmb" title="Game Master">GM</span>' : ''}${hasBenefit('badge') ? '<span class="supb">支持者</span>' : ''}</div>${account ? `<div class="muted small">${myStats.played || 0} 場 · 勝率 ${pct(myStats.won, myStats.played)}%</div>` : '<div class="skel" style="width:110px"></div><div class="skel" style="width:80px;margin-top:6px"></div>'}${vc != null ? `<div class="vchip" data-a="vetoinfo"><img src="/img/veto_t.webp" alt="" width="18" height="24">回避卡 <b>${vetoAmt(vc)}</b>${isGM()?'':'/10'}</div>` : ''}</div></div>
    <div class="prof-actions"><button type="button" class="btn sm ghost pa" data-a="profile">✎ 編輯檔案</button><button type="button" class="btn sm ghost pa" data-a="ptab" data-t="pendant">🎀 頭像掛件</button></div>
    </div>
    <div class="acct">${account && (account.username || account.google) ? `<div class="row between acct-row"><div class="acct-status">已登入${account.google ? '<span class="badge">Google</span>' : ''}</div><button type="button" class="btn sm dark acct-out" data-a="logout">登出</button></div>` : `<div class="tiny muted">目前是訪客。註冊或用 Google 登入後，資料永久保存、換機也能找回。</div><div class="btns"><button class="btn sm" data-a="register">註冊帳號</button><button class="btn sm ghost" data-a="login">登入</button></div>`}</div>
  </div>
  ${inRoom ? resumeCard() : ''}
  ${inRoom ? '' : `<div class="bigcards">
    <div class="bigcard create" data-a="create"><div class="ic">⚔️</div><b>建立房間</b><span>我做房主</span></div>
    <div class="bigcard join" data-a="join"><div class="ic">🛡️</div><b>加入房間</b><span>輸入 4 位房間號</span></div>
  </div>`}
  <button type="button" class="support-entry" data-a="go" data-v="support">支持我哋</button>
  <div class="card menu" style="margin-top:14px">
    <div class="item" data-a="go" data-v="support"><span class="ic">☕</span><span class="grow">支持我哋</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="history"><span class="ic">📜</span><span class="grow">歷史記錄</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="stats"><span class="ic">📊</span><span class="grow">數據統計</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="skins"><span class="ic">🎴</span><span class="grow">角色皮膚</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="board"><span class="ic">🏆</span><span class="grow">排行榜</span><span class="chev">›</span></div>
    <div class="item" data-a="go" data-v="rules"><span class="ic">📖</span><span class="grow">規則介紹</span><span class="chev">›</span></div>
    <div class="item" data-a="about"><span class="ic">ℹ️</span><span class="grow">版本</span><span class="muted small">v3.1</span><span class="chev">›</span></div>
  </div>
  <div class="footer"><span class="credit">HK阿瓦隆 · by Amigosparty · v3.1</span><br><span class="credit2 sponsor">${AMIGOS} Amigosparty · Teddy Design Limited</span><br><span class="credit2"><a href="/privacy" target="_blank" rel="noopener">私隱政策</a> · <a href="/terms" target="_blank" rel="noopener">使用條款</a></span></div>`;
}
function supportIcon(kind) {
  if (kind === 'coffee') return `<span class="support-ic cup">${COFFEE_SVG}</span>`;
  if (kind === 'heart') return `<span class="support-ic heart"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 38s-12-7.2-12-16a7 7 0 0 1 12-4 7 7 0 0 1 12 4c0 8.8-12 16-12 16z" fill="#1aa58a"/></svg></span>`;
  if (kind === 'spark') return `<span class="support-ic spark"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6l3.2 10.2L38 18l-8.2 6.2L32 36 24 29.2 16 36l2.2-11.8L10 18l10.8-1.8z" fill="#f0a04a"/></svg></span>`;
  return `<span class="support-ic emo">${supportEmoSvg(40)}</span>`;
}
function supportHtml() {
  const rows = [
    ['coffee', 'coffee', '一杯咖啡', '頭像掛件'],
    ['badge', 'heart', '支持者', '名字旁邊的徽章，點開名片時大家都看得到'],
    ['silver', 'spark', '銀白追光', '準備階段入座時，一束追光打在你的頭像上'],
    ['emote', 'emo', '支持者表情', '房間裡點一下，頭像上冒出來的專屬表情'],
  ];
  const owned = (id) => hasBenefit(id);
  return `<section class="support">
    <h1>請開發者喝杯咖啡</h1>
    <p class="support-intro">熬夜改 bug 的時候，這杯咖啡很管用。謝謝你！</p>
    ${supportNote ? `<p class="support-status">${esc(supportNote)}</p>` : ''}
    <div class="support-list">${rows.map(([id, icon, name, desc]) => `<div class="support-row" data-benefit="${id}" data-owned="${owned(id) ? '1' : '0'}">${supportIcon(icon)}<div><b>${name}</b><span>${desc}</span></div>${owned(id) ? '<em>已有</em>' : ''}</div>`).join('')}</div>
    <p class="support-note">可以重複支持：第一次送下面這些，之後每次只補上你還沒有的，已經有的不會再送一次。</p>
    <button type="button" class="btn support-pay" data-a="supportpay">HK$15 支持</button>
  </section>`;
}
let supportNote = '';
async function startSupport() {
  try {
    const r = await api('/api/support/checkout', { method: 'POST', body: '{}' });
    if (r && r.url) { location.href = r.url; return; }
    toast('暫時未能開始付款');
  } catch (e) { toast(e.message || '暫時未能開始付款'); }
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
  const [logo, amigos] = await Promise.all([load('/img/logo-merlin.webp'), load('/img/amigos.webp')]);
  const hero = early ? null : (ps.find(p => p.id === r.mvp && sideOf(p) === r.winner) || ps.find(p => sideOf(p) === r.winner));
  const drawAv = async (p, cx, cy, rad, ring) => canvasDrawAv(x, load, p, cx, cy, rad);

  if (hero) await drawAv(hero, pad + 92, 150, 58, accent);
  else { x.fillStyle = '#eef0f4'; x.beginPath(); x.arc(pad + 92, 150, 58, 0, Math.PI * 2); x.fill(); x.font = '56px sans-serif'; x.textAlign = 'center'; x.fillText('🏳️', pad + 92, 170); }
  if (logo) { x.save(); x.beginPath(); x.arc(W - pad - 62, 82, 36, 0, Math.PI * 2); x.clip(); x.drawImage(logo, W - pad - 98, 46, 72, 72); x.restore(); }
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
  x.textAlign = 'left'; x.fillStyle = C.ink; x.font = 'bold 32px sans-serif'; x.fillText('HK阿瓦隆', pad + 214, y + 66);
  x.fillStyle = C.mute; x.font = 'bold 15px sans-serif'; x.fillText('HK AVALON', pad + 214, y + 92);
  x.fillStyle = C.sub; x.font = '18px sans-serif'; x.fillText('掃碼查看對局回放', pad + 214, y + 132);
  x.fillStyle = C.mute; x.font = '14px sans-serif'; x.fillText(replayUrl(r).replace(/^https?:\/\//, ''), pad + 214, y + 158);
  if (amigos) x.drawImage(amigos, pad + 214, y + 166, 26, 20);
  x.fillText('Amigosparty · Teddy Design Limited', pad + 246, y + 182);
  if (logo) { x.save(); x.beginPath(); x.arc(W - pad - 78, y + 104, 36, 0, Math.PI * 2); x.clip(); x.drawImage(logo, W - pad - 114, y + 68, 72, 72); x.restore(); }
  return c;
}
async function cardBlob(r) { const c = await makePoster(r, true); return new Promise(res => c.toBlob(b => res(b), 'image/png')); }
async function saveCard(r, show) {
  if (!r) return;
  openModal('<h2>戰報海報</h2><div class="center muted">生成中…</div>');
  const c = await makePoster(r, true); const blob = await new Promise(res => c.toBlob(res, 'image/png')); c.width = c.height = 0;
  if (window.__posterUrl) URL.revokeObjectURL(window.__posterUrl); const url = window.__posterUrl = URL.createObjectURL(blob);
  const fname = `hk-avalon-${(r.gid || 'game').slice(0, 8)}.png`;
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
  const url = replayUrl(r); const text = `HK阿瓦隆｜${r.winner === 'none' ? '提前結束' : r.winner === 'good' ? '藍方勝利' : '紅方勝利'}！${r.n} 人局戰報`;
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
      const b = await cardBlob(r); const f = new File([b], 'hk-avalon.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: 'HK阿瓦隆', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      if (IS_IOS) { closeModal(); return saveCard(r, true); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'hk-avalon.png'; document.body.appendChild(a); a.click(); a.remove();
      toast('海報已儲存，請打開 Instagram 發佈（限時動態或貼文）');
    };
    $('#sys', el).onclick = async () => {
      try {
        const b = await cardBlob(r); const f = new File([b], 'hk-avalon.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: 'HK阿瓦隆', text, url });
        else if (navigator.share) await navigator.share({ title: 'HK阿瓦隆', text, url });
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
  const [logo, amigos, qr] = await Promise.all([load('/img/logo-merlin.webp'), load('/img/amigos.webp'), load('/api/qr?text=' + encodeURIComponent(r ? replayUrl(r) : (PUBLIC_ORIGIN || location.origin)))]);
  if (logo) { x.save(); x.beginPath(); x.arc(W / 2 - 180, 128, 48, 0, Math.PI * 2); x.clip(); x.drawImage(logo, W / 2 - 228, 80, 96, 96); x.restore(); }
  x.textAlign = 'left'; x.font = '900 72px sans-serif'; x.fillStyle = '#1f2633'; x.fillText('HK阿瓦隆', W / 2 - 92, 150);
  x.font = '600 26px sans-serif'; x.fillStyle = '#8a909c'; x.fillText('HK AVALON', W / 2 - 88, 190);
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
  if (amigos) x.drawImage(amigos, 360, fy + 158, 28, 22);
  x.font = '600 26px sans-serif'; x.fillStyle = '#a0a6b2'; x.fillText('Amigosparty · Teddy Design Limited', 396, fy + 176);
  return c;
}
async function storySheet(r) {
  openModal('<h2>分享到 IG / Threads</h2><div class="center muted">生成圖片中…</div>');
  const c = await makeStory(r); const blob = await new Promise(res => c.toBlob(res, 'image/png')); c.width = c.height = 0;
  if (window.__storyUrl) URL.revokeObjectURL(window.__storyUrl); const url = window.__storyUrl = URL.createObjectURL(blob);
  const file = new File([blob], 'hk-avalon-story.png', { type: 'image/png' });
  const link = r ? replayUrl(r) : (PUBLIC_ORIGIN || location.origin);
  const text = r ? `HK阿瓦隆｜${r.winner === 'none' ? '提前結束' : r.winner === 'good' ? '藍方勝利' : '紅方勝利'}！${r.n} 人局戰報` : `我喺HK阿瓦隆玩咗 ${myStats.played || 0} 場，勝率 ${pct(myStats.won, myStats.played)}%！`;
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
    $('#s_sys', el).onclick = async () => { if (canFiles) { try { await navigator.share({ files: [file], title: 'HK阿瓦隆', text: text + ' ' + link }); } catch (e) {} } else if (navigator.share) navigator.share({ title: 'HK阿瓦隆', text, url: link }).catch(() => {}); else save(); };
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
    case 'about': return openModal(`<h2>關於</h2><div class="center">${LOGO}<div class="name" style="margin-top:6px">HK阿瓦隆</div><div class="small muted">版本 3.1 · 網頁版阿瓦隆多人遊戲</div><div class="small" style="margin-top:10px">by <b class="gold">Amigosparty</b></div><div class="tiny muted sponsor">${AMIGOS} Design by Teddy Design Limited</div><div class="tiny muted" style="margin-top:8px">原創美術 · 角色立繪、動物頭像、掛件皆為本作原創</div></div><button class="btn" id="ok">關閉</button>`, el2 => $('#ok', el2).onclick = closeModal);
    case 'supportpay': return startSupport();
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
        return openModal(`<h2>我的座位</h2><div class="center namecard">${av(people().find(p=>p.id===id)||profile,56)}<div class="name">${esc(profile.name)}${hasBenefit('badge') ? '<span class="supb">支持者</span>' : ''}</div></div><button class="btn ghost" data-x="stand">離座</button><button class="btn" id="ok">關閉</button>`, el2 => {
          el2.querySelector('[data-x=stand]').onclick = () => { closeModal(); if (S && S.isHost) openReleaseConfirm(id); else act('stand', {}); };
          $('#ok', el2).onclick = closeModal;
        });
      }
      const p = (S.seats||[]).find(x => x && x.id === id); if (!p) return;
      return openModal(`<h2>騎士名片</h2><div class="center namecard">${av(p,56)}<div class="name">${esc(p.name)}${p.badge ? '<span class="supb">支持者</span>' : ''}</div><div class="small muted">座位 ${p.seat}${p.isHost?' · 房主':''}${p.online?'':' · 離線'}</div></div>
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
window.__av = { av, roundTable, makeStory, storySheet, get S() { return S; }, render, makePoster, replayUrl, inviteUrl, showQuest, closeModal, go, showRole, reviewHtml, knows: (r) => { rulesTab = 'knows'; wkRole = r; go('rules'); } };
})();
