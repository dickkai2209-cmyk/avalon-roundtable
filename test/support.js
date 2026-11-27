// Branding strings, HK$15 support amount, webhook grant / no-grant, and privacy of supporter state.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const Stripe = require('stripe');
const support = require('../support');

const PORT = 3488;
const CDP = 9477;
const APP = 'http://127.0.0.1:' + PORT + '/';
const DATA = '/tmp/av-support-' + Date.now();
const OUT = '/opt/cursor/artifacts';
const root = path.join(__dirname, '..');
const WHSEC = 'whsec_test_mock';
const SKEY = 'sk_test_mock_do_not_charge';
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function pngRGB(buf) {
  let off = 8;
  const idats = [];
  let w = 0, h = 0, color = 0, depth = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; color = data[9]; }
    else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bpp = color === 2 ? 3 : 0;
  if (buf.readUInt32BE(0) !== 0x89504e47 || depth !== 8 || bpp !== 3) throw new Error('expected an 8-bit RGB PNG');
  const raw = require('zlib').inflateSync(Buffer.concat(idats));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let s = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[s++];
    const row = y * stride;
    const prev = y ? row - stride : -1;
    for (let i = 0; i < stride; i++) {
      const x = raw[s++];
      const a = i >= bpp ? out[row + i - bpp] : 0;
      const b = prev < 0 ? 0 : out[prev + i];
      const c = prev < 0 || i < bpp ? 0 : out[prev + i - bpp];
      let v = x;
      if (filter === 1) v = (x + a) & 255;
      else if (filter === 2) v = (x + b) & 255;
      else if (filter === 3) v = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } else if (filter !== 0) throw new Error('png filter ' + filter);
      out[row + i] = v;
    }
  }
  return { w, h, data: out };
}

function merlinIconStats(buf) {
  const img = pngRGB(buf);
  let navy = 0, skin = 0, white = 0, eye = 0;
  const n = img.w * img.h;
  for (let i = 0; i < n; i++) {
    const r = img.data[i * 3], g = img.data[i * 3 + 1], b = img.data[i * 3 + 2];
    if (r > 245 && g > 245 && b > 245) white++;
    if (b > 70 && b > r + 25 && b > g && r < 90 && g < 120) navy++;
    if (r > 190 && g > 150 && b > 140 && r > b + 8 && g + 5 > b) skin++;
    if (b > 140 && b > r + 30 && b > g + 10 && r > 40) eye++;
  }
  return { w: img.w, h: img.h, navy: navy / n, skin: skin / n, white: white / n, eye: eye / n, corner: img.data[0] };
}

function post(pathname, body, headers, raw, method) {
  const data = Buffer.from(raw != null ? raw : JSON.stringify(body || {}));
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: pathname, method: method || 'POST',
      headers: { 'content-type': 'application/json', 'content-length': data.length, ...(headers || {}) },
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        let json = null; try { json = JSON.parse(d); } catch (e) {}
        resolve({ status: res.statusCode, body: d, json });
      });
    });
    req.on('error', reject); req.end(data);
  });
}
function getJSON(pathname, token) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: PORT, path: pathname, headers: token ? { Authorization: 'Bearer ' + token } : {} }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        let json = null; try { json = JSON.parse(d); } catch (e) {}
        resolve({ status: res.statusCode, body: d, json });
      });
    }).on('error', reject);
  });
}
async function putMe(token, body) {
  const r = await post('/api/me', body, { Authorization: 'Bearer ' + token }, null, 'PUT');
  if (r.status >= 400) throw new Error('put ' + r.status + ' ' + r.body);
  return r.json.user;
}

const stripe = new Stripe(SKEY, { apiVersion: support.API_VERSION });
function sign(payload) {
  return stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
}
function event(type, object, id) {
  return { id: id || ('evt_' + type.replace(/\W/g, '_') + '_' + Math.random().toString(36).slice(2, 8)), type, data: { object } };
}
function session(userId, extra) {
  return Object.assign({
    id: 'cs_test_' + Math.random().toString(36).slice(2, 10),
    object: 'checkout.session',
    mode: 'payment',
    payment_status: 'paid',
    amount_total: 1500,
    currency: 'hkd',
    metadata: { userId, product: 'hk-avalon-support' },
  }, extra || {});
}
async function hook(objType, object, id) {
  const ev = event(objType, object, id);
  const payload = JSON.stringify(ev);
  return post('/api/stripe/webhook', null, { 'stripe-signature': sign(payload) }, payload);
}

(async () => {
  const html = read('public/index.html');
  const app = read('public/app.js');
  const server = read('server.js');
  const css = read('public/style.css');
  const manifest = read('public/manifest.webmanifest');
  const privacy = read('public/privacy.html');
  const terms = read('public/terms.html');
  const supportSrc = read('support.js');
  for (const src of [html, app, manifest, privacy, terms, read('README.md'), read('package.json')]) {
    assert(!src.includes('旺角阿瓦隆'), 'product name is HK阿瓦隆');
    assert(!src.includes('MONGKOK'), 'English product name is HK AVALON');
  }
  assert(html.includes('HK阿瓦隆') && html.includes('HK AVALON'), 'splash and title use HK');
  assert(html.includes('/img/logo-merlin.webp') && html.includes('class="tlogo merlin"'), 'header logo is Merlin');
  assert(!html.includes('tlogo" src="/img/amigos.webp"') && !html.includes('class="tlogo" src="/img/amigos.webp"'), 'Amigos is not the header mark');
  assert(app.includes('class="amigos-mark"') && app.includes('Amigosparty') && app.includes('Teddy Design Limited'), 'Amigos stays a sponsor credit');
  assert(app.includes('旺角霓虹'), 'card-back name 旺角霓虹 is left as venue flavour');
  assert(html.includes('style.css?v=68') && html.includes('app.js?v=76') && html.includes('review.js?v=2') && html.includes('voice.js?v=5'), 'cache bust past live main');
  assert(!html.includes('style.css?v=67') && !html.includes('app.js?v=75'), 'live cache versions are not reused');
  assert(!app.includes("if (profile.pendant === 'coffee') profile.pendant = 'none'"), 'a saved coffee pendant is kept on load');
  assert(app.includes("if (it[2] === 'support') return hasBenefit('coffee')"), 'coffee still unlocks only with the support benefit');
  assert(app.includes('const COFFEE_PLACE = { left: 0.21, top: -0.46, size: 0.58 }'), 'coffee placement is centred on the crown');
  assert(css.includes('.av-wrap>.pov.coffee,\n.pdv>.pov.coffee,\n.crop-ring>.pov.coffee{left:21%;right:auto;top:-46%;bottom:auto;width:58%;height:58%;z-index:4}'), 'picker, seat, and crop ring share the crown placement');
  assert(css.includes('.support-ic .pov.coffee{position:static;width:34px;height:34px;left:auto;right:auto;top:auto;bottom:auto}'), 'support page keeps a small static cup');
  const cropFn = app.slice(app.indexOf('const pend = (opts && opts.pendant)'), app.indexOf('const layout = () =>'));
  assert(cropFn.includes("pend === 'coffee' ? COFFEE_SVG"), 'crop ring draws the coffee svg on the crown');
  const drawFn = app.slice(app.indexOf('async function canvasDrawAv'), app.indexOf('// ================= poster'));
  assert(drawFn.includes("if (k === 'coffee')") && drawFn.includes('coffeeCupUrl()') && drawFn.includes('COFFEE_PLACE') && drawFn.indexOf("k === 'coffee'") < drawFn.indexOf('pdSrc(k)'), 'poster draws the cup on the crown instead of a missing image');
  assert(!read('.env.example').includes('STRIPE_MOCK'), 'production env sample does not set STRIPE_MOCK');
  assert(fs.existsSync(path.join(root, 'public/img/logo-merlin.webp')) && fs.existsSync(path.join(root, 'public/img/logo-merlin.png')), 'logo asset is webp and png');
  const logo = fs.readFileSync(path.join(root, 'public/img/logo-merlin.webp'));
  assert(logo.slice(0, 4).toString() === 'RIFF' && logo.slice(8, 12).toString() === 'WEBP', 'merlin logo is webp');
  assert(html.includes('rel="icon" href="/img/icon-192.png?v=68"'), 'favicon is the Merlin icon');
  assert(html.includes('rel="apple-touch-icon" href="/img/icon-192.png?v=68"'), 'apple touch icon is the Merlin icon');
  assert(html.includes('property="og:image" content="https://avalon-roundtable-10t9.onrender.com/img/icon-512.png?v=68"'), 'share image is the absolute Merlin icon');
  assert(manifest.includes('/img/icon-192.png?v=68') && manifest.includes('/img/icon-512.png?v=68') && manifest.includes('/img/icon.svg?v=68'), 'manifest icons point at Merlin');
  const svg = read('public/img/icon.svg');
  const embedded = Buffer.from((svg.match(/base64,([A-Za-z0-9+/=]+)/) || ['', ''])[1], 'base64');
  assert(svg.includes('<title>HK阿瓦隆</title>') && !svg.includes('M32 8l18') && embedded.equals(logo), 'icon.svg embeds the header Merlin artwork');
  for (const [file, size] of [['public/img/icon-192.png', 192], ['public/img/icon-512.png', 512]]) {
    const stats = merlinIconStats(fs.readFileSync(path.join(root, file)));
    assert(stats.w === size && stats.h === size && stats.navy > 0.04 && stats.skin > 0.1 && stats.eye > 0.004 && stats.white < 0.4 && stats.corner > 250, file + ' is the Merlin portrait on a light square');
  }

  const ui = app.slice(app.indexOf('function supportHtml'), app.indexOf('const ACHS'));
  for (const s of ['請開發者喝杯咖啡', '熬夜改 bug 的時候，這杯咖啡很管用。謝謝你！', '一杯咖啡', '頭像掛件', '支持者', '名字旁邊的徽章，點開名片時大家都看得到', '銀白追光', '準備階段入座時，一束追光打在你的頭像上', '支持者表情', '房間裡點一下，頭像上冒出來的專屬表情', '可以重複支持：第一次送下面這些，並隨機解鎖六款圓框掛件。之後每次只補上你還沒有的，已經有的不會再送一次，抽過的圓框也不會再抽。', 'HK$15 支持', '支持我哋', '購買會隨機解鎖六款圓框掛件', '購買前不會公布是哪六款', '朔雪之映、逆光之劍人人可用，不計入這六款']) {
    assert(ui.includes(s) || app.includes(s), 'support copy has ' + s);
  }
  assert(!ui.includes('去廣告') && !ui.includes('去广告') && !supportSrc.includes('去廣告') && !app.includes('去广告'), 'ad removal is not sold');
  assert(!ui.includes('¥') && !ui.includes('请开发者') && !ui.includes('头像挂件'), 'support UI is Traditional Chinese and not CNY');
  const home = app.slice(app.indexOf('function homeHtml'), app.indexOf('function supportIcon'));
  assert(!home.includes('support-entry'), 'home has no full-width support button');
  const menuSrc = home.slice(home.indexOf('class="card menu"'), home.indexOf('class="footer"'));
  const labels = [...menuSrc.matchAll(/class="grow">([^<]+)</g)].map(m => m[1]);
  assert(labels.join(',') === '歷史記錄,數據統計,角色皮膚,排行榜,規則介紹,支持我哋,版本', 'support row sits under 規則介紹 (' + labels.join(',') + ')');
  assert(menuSrc.includes('<div class="item" data-a="go" data-v="support"><span class="ic">☕</span><span class="grow">支持我哋</span><span class="chev">›</span></div>'), 'support menu row keeps the coffee emoji and chevron');
  assert(!css.includes('.support-entry'), 'unused support-entry CSS is removed');

  assert(support.UNIT_AMOUNT === 1500 && support.CURRENCY === 'hkd' && support.LABEL === 'HK$15', 'amount is HK$15');
  assert(support.BENEFIT_IDS.join() === 'coffee,badge,silver,emote', 'four benefits');
  assert(support.benefitsToAdd([]).join() === 'coffee,badge,silver,emote', 'first payment grants all four');
  assert(support.benefitsToAdd(['coffee']).join() === 'badge,silver,emote', 'later payment fills only what is missing');
  assert(support.benefitsToAdd(['coffee', 'badge', 'silver', 'emote']).length === 0, 'owned benefits are not granted again');
  assert(support.FRAME_POOL.length === 10 && support.FREE_FRAME_IDS.join() === 'frostmirror,icesword', 'the random pool is the ten locked frames');
  for (const id of ['frostmirror', 'icesword', 'coffee', 'wolf', 'pumpkin', 'bolo', 'laurel', 'santa', 'halo', 'bat', 'vampire', 'excal']) {
    assert(!support.FRAME_POOL.includes(id), id + ' stays outside the support frame pool');
  }
  for (const c of support.FRAME_CHARMS) assert(server.includes(`${c.id}: ['${c.rule}', ${c.need}]`), 'PD_RULE matches ' + c.id);
  assert(server.includes('function sanitizeProfile') && server.includes('hasSupportFrame'), 'sanitizeProfile honors persisted support frames');
  const unlockFn = app.slice(app.indexOf('const supportFrameIds'), app.indexOf('const pdNeed'));
  assert(unlockFn.includes('account.supportFrames') && unlockFn.includes('supportFrameIds().includes(k)'), 'pdUnlocked honors persisted support frames');
  assert(supportSrc.includes('crypto.randomInt'), 'frame pick uses a cryptographic shuffle');
  assert(support.framesState(undefined) === null && support.framesState(null) === null, 'a missing frame set is not persisted');
  assert(support.framesState(['foxqiu', 'frostmirror', 'coffee', 'bolo', 'foxqiu']).join() === 'foxqiu', 'persisted ids stay inside the locked pool');
  const rolls = new Set();
  for (let i = 0; i < 8; i++) {
    const got = support.pickSupportFrames({ played: 0, won: 0 });
    assert(got.length === 6 && new Set(got).size === 6, 'a fresh roll is six unique locked frames');
    for (const id of got) assert(support.FRAME_POOL.includes(id), 'roll stays in the pool');
    rolls.add(got.join());
  }
  assert(rolls.size > 1, 'the cryptographic shuffle does not repeat one order');
  const mid = support.pickSupportFrames({ played: 11, won: 4 });
  assert(mid.length === 6, 'ladder unlocks shrink the pool before the roll');
  for (const id of ['foxqiu', 'starmoon', 'starplain']) assert(!mid.includes(id), id + ' is already unlocked by the ladder');
  const few = support.pickSupportFrames({ played: 18, won: 8 });
  assert(few.length === 3 && ['foxdance', 'fairylake', 'odineye'].every(id => few.includes(id)), 'fewer than six grants every remaining locked frame');
  assert(support.pickSupportFrames({ played: 40, won: 20 }).length === 0, 'a full ladder leaves nothing to roll');
  const params = support.buildCheckoutParams({ userId: 'user-12345678', origin: 'https://example.test', integrationId: 'hk_avalon_support_abcdefgh' });
  assert(params.mode === 'payment' && !params.payment_method_types && params.line_items[0].price_data.unit_amount === 1500 && params.line_items[0].price_data.currency === 'hkd', 'checkout is a one-time HKD 1500 session');
  assert(params.integration_identifier === 'hk_avalon_support_abcdefgh' && /_[a-z]{8}$/.test(support.integrationId()), 'integration id ends in 8 letters');
  assert(params.success_url.includes('support=pending'), 'return URL does not grant by itself');
  assert(params.line_items[0].price_data.product_data.description.includes('隨機解鎖六款圓框掛件'), 'checkout describes the six random charms');

  const uid = 'user-12345678';
  const paid = support.decideEvent(event('checkout.session.completed', session(uid)));
  assert(paid.grant && paid.userId === uid, 'paid checkout.session.completed grants');
  assert(!support.decideEvent(event('checkout.session.completed', session(uid, { payment_status: 'unpaid' }))).grant, 'unpaid session does not grant');
  assert(support.decideEvent(event('checkout.session.async_payment_succeeded', session(uid))).grant, 'async payment success grants when paid');
  assert(support.decideEvent(event('payment_intent.succeeded', { id: 'pi_test_1', amount: 1500, currency: 'hkd', metadata: { userId: uid, product: 'hk-avalon-support' } })).grant, 'payment_intent.succeeded grants');
  assert(!support.decideEvent(event('payment_intent.succeeded', { id: 'pi_other', amount: 1500, currency: 'hkd', metadata: { userId: uid, product: 'other' } })).grant, 'another product on the same Stripe account does not grant');
  assert(!support.decideEvent(event('payment_intent.succeeded', { id: 'pi_cny', amount: 1500, currency: 'cny', metadata: { userId: uid, product: 'hk-avalon-support' } })).grant, 'non-HKD does not grant');
  assert(!support.decideEvent(event('payment_intent.succeeded', { id: 'pi_12', amount: 1200, currency: 'hkd', metadata: { userId: uid, product: 'hk-avalon-support' } })).grant, 'HK$12 does not grant');
  assert(!support.decideEvent(event('checkout.session.completed', session(uid, { mode: 'subscription' }))).grant, 'subscription does not grant');
  assert(!support.decideEvent(event('checkout.session.expired', session(uid))).grant, 'opening or expiring checkout does not grant');

  const savedKey = process.env.STRIPE_SECRET_KEY;
  const savedWh = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET;
  assert(support.readWebhook('{}', '').status === 503, 'missing secrets do not grant');
  if (savedKey == null) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = savedKey;
  if (savedWh == null) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = savedWh;

  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  process.env.DATA_DIR = DATA;
  process.env.DATABASE_URL = '';
  delete require.cache[require.resolve('../db')];
  const db = require('../db');
  await db.init();
  const stamp = Date.now().toString(36);
  const fresh = await db.createGuest({ guestKey: 'simsupfresh' + stamp, name: '新客', pendant: 'coffee', fx: 'silver' });
  const mvp = await db.createGuest({ guestKey: 'simsupmvp' + stamp, name: '十冠' });
  const gm = await db.createGuest({ guestKey: 'simsupgm' + stamp, name: '主持' });
  const partial = await db.createGuest({ guestKey: 'simsuppart' + stamp, name: '半杯' });
  const other = await db.createGuest({ guestKey: 'simsupoth' + stamp, name: '路人' });
  const veteran = await db.createGuest({ guestKey: 'simsupvet' + stamp, name: '舊支持' });
  const vetHook = await db.createGuest({ guestKey: 'simsupvhook' + stamp, name: '舊通知' });
  const ladder = await db.createGuest({ guestKey: 'simsuplad' + stamp, name: '半階' });
  const rich = await db.createGuest({ guestKey: 'simsuprich' + stamp, name: '滿階' });
  assert(fresh.pendant !== 'coffee' && fresh.fx !== 'silver', 'creating an account cannot claim support cosmetics');
  const tokens = {};
  for (const u of [fresh, mvp, gm, partial, other, veteran, vetHook, ladder, rich]) tokens[u.id] = await db.createSession(u.id);
  db.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
  saved.stats = saved.stats || {};
  saved.stats[fresh.id] = { played: 0, won: 0, mvp: 0, roles: {} };
  saved.stats[mvp.id] = { played: 12, won: 10, mvp: 10, roles: {} };
  saved.stats[gm.id] = { played: 30, won: 20, mvp: 0, roles: {} };
  saved.stats[veteran.id] = { played: 0, won: 0, mvp: 0, roles: {} };
  saved.stats[vetHook.id] = { played: 0, won: 0, mvp: 0, roles: {} };
  saved.stats[ladder.id] = { played: 18, won: 8, mvp: 0, roles: {} };
  saved.stats[rich.id] = { played: 40, won: 20, mvp: 0, roles: {} };
  saved.users.find(u => u.id === partial.id).support_benefits = ['coffee'];
  saved.users.find(u => u.id === veteran.id).support_benefits = ['coffee', 'badge', 'silver', 'emote'];
  saved.users.find(u => u.id === vetHook.id).support_benefits = ['coffee', 'badge', 'silver', 'emote'];
  delete saved.users.find(u => u.id === veteran.id).support_frames;
  delete saved.users.find(u => u.id === vetHook.id).support_frames;
  fs.writeFileSync(path.join(DATA, 'db.json'), JSON.stringify(saved));

  const srv = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: DATA, DATABASE_URL: '', PURGE_TEST_DATA: '0',
      GM_USER_ID: gm.id, GM_EMAIL: 'nobody-gm@example.invalid',
      STRIPE_SECRET_KEY: SKEY, STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_MOCK: '1',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let srvLog = '';
  srv.stdout.on('data', d => { srvLog += d; });
  const stop = () => { try { srv.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', stop);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server ' + srvLog)), 8000);
    srv.stdout.on('data', d => { if (/on :/.test(String(d))) { clearTimeout(t); res(); } });
  });
  assert(!srvLog.includes(SKEY) && !srvLog.includes(WHSEC), 'server log does not print secrets');

  const me = await getJSON('/api/support', tokens[fresh.id]);
  assert(me.json.unitAmount === 1500 && me.json.currency === 'hkd' && me.json.label === 'HK$15', 'support API amount is HK$15');
  assert(me.json.owned.length === 0 && me.json.frames == null, 'a new player owns nothing and has no frame roll');
  assert(!me.body.includes(SKEY) && !me.body.includes(WHSEC) && !me.body.includes('去廣告'), 'support API hides secrets and ad removal');

  const checkout = await post('/api/support/checkout', {}, { Authorization: 'Bearer ' + tokens[fresh.id] });
  assert(checkout.status === 200 && checkout.json.url && checkout.json.id === 'cs_test_mock', 'checkout can be opened');
  const afterOpen = await getJSON('/api/support', tokens[fresh.id]);
  assert(afterOpen.json.owned.length === 0 && afterOpen.json.frames == null, 'opening checkout does not grant');
  const claim = await post('/api/support/claim', { benefits: ['coffee', 'badge', 'silver', 'emote'] }, { Authorization: 'Bearer ' + tokens[fresh.id] });
  assert(claim.status === 404, 'there is no client claim route');
  const forged = await putMe(tokens[fresh.id], { benefits: ['coffee', 'badge', 'silver', 'emote'], pendant: 'coffee', fx: 'silver' });
  assert(forged.pendant !== 'coffee' && forged.fx !== 'silver' && (!forged.benefits || !forged.benefits.length), 'a client payload cannot grant benefits');
  const forgedFrames = await putMe(tokens[fresh.id], { supportFrames: support.FRAME_POOL.slice(), pendant: 'foxheart' });
  assert(forgedFrames.pendant === 'none' && !Array.isArray(forgedFrames.supportFrames), 'a client payload cannot choose the six frames');

  assert((await putMe(tokens[fresh.id], { pendant: 'frostmirror' })).pendant === 'frostmirror', 'ice frames stay free');
  assert((await putMe(tokens[fresh.id], { pendant: 'laurel' })).pendant === 'none', 'laurel still needs 10 MVP');
  assert((await putMe(tokens[fresh.id], { pendant: 'foxqiu' })).pendant === 'none', 'play frames stay locked at 0 games');
  assert((await putMe(tokens[mvp.id], { pendant: 'laurel', skins: { _shiny: true } })).pendant === 'laurel', '10 earned MVPs still unlock laurel');
  const gmUser = await putMe(tokens[gm.id], { pendant: 'laurel', skins: { _shiny: true }, fx: 'silver' });
  assert(gmUser.gm === true && gmUser.pendant === 'none' && gmUser.skins._shiny === false && gmUser.fx !== 'silver', 'GM with 0 MVP cannot wear laurel, shiny, or silver');
  assert((await putMe(tokens[gm.id], { pendant: 'coffee' })).pendant !== 'coffee', 'GM cannot wear the coffee pendant without paying');
  assert((await putMe(tokens[gm.id], { pendant: 'foxqiu' })).pendant === 'foxqiu', 'GM bypass still covers the play ladder');
  assert((await putMe(tokens[gm.id], { pendant: 'frostmirror' })).pendant === 'frostmirror', 'GM can still wear a free ice frame');

  const unpaid = await hook('checkout.session.completed', session(fresh.id, { payment_status: 'unpaid', id: 'cs_test_unpaid' }));
  assert(unpaid.status === 200 && unpaid.json.granted === false, 'unpaid webhook does not grant');
  assert((await getJSON('/api/support', tokens[fresh.id])).json.owned.length === 0 && (await getJSON('/api/support', tokens[fresh.id])).json.frames == null, 'benefits and frames stay empty after unpaid');
  const badSig = await post('/api/stripe/webhook', null, { 'stripe-signature': 't=1,v1=deadbeef' }, JSON.stringify(event('checkout.session.completed', session(fresh.id))));
  assert(badSig.status === 400, 'bad signature is rejected');
  assert((await getJSON('/api/support', tokens[fresh.id])).json.owned.length === 0, 'bad signature does not grant');
  const wrong = await hook('payment_intent.succeeded', { id: 'pi_test_wrong', amount: 1200, currency: 'hkd', metadata: { userId: fresh.id, product: 'hk-avalon-support' } });
  assert(wrong.json.granted === false, 'wrong amount does not grant');
  const foreign = await hook('payment_intent.succeeded', { id: 'pi_test_foreign', amount: 1500, currency: 'hkd', metadata: { userId: fresh.id, product: 'yellowpay-other' } });
  assert(foreign.json.granted === false, 'unrelated payment_intent does not grant');

  const paidHook = await hook('checkout.session.completed', session(fresh.id, { id: 'cs_test_fresh' }));
  assert(paidHook.json.granted === true, 'paid checkout.session.completed grants');
  const owned = (await getJSON('/api/support', tokens[fresh.id])).json;
  assert(owned.owned.join() === 'coffee,badge,silver,emote', 'first payment grants the four benefits once');
  assert(Array.isArray(owned.frames) && owned.frames.length === 6 && new Set(owned.frames).size === 6, 'paid webhook rolls six frames');
  for (const id of owned.frames) assert(support.FRAME_POOL.includes(id) && id !== 'frostmirror' && id !== 'icesword', 'rolled frame stays in the locked pool');
  const six = owned.frames.slice();
  const missed = support.FRAME_POOL.filter(id => !six.includes(id));
  assert(missed.length === 4, 'four locked frames stay outside this roll');
  const again = await hook('checkout.session.completed', session(fresh.id, { id: 'cs_test_fresh' }), 'evt_replay');
  assert(again.json.granted === false, 'replaying the same payment does not grant again');
  const second = await hook('payment_intent.succeeded', { id: 'pi_test_second', amount: 1500, currency: 'hkd', metadata: { userId: fresh.id, product: 'hk-avalon-support' } });
  assert(second.json.granted === false, 'a later payment adds nothing already owned');
  const stillUser = (await getJSON('/api/me', tokens[fresh.id])).json.user;
  const still = stillUser.benefits;
  assert(still.join() === 'coffee,badge,silver,emote' && still.filter(x => x === 'coffee').length === 1, 'benefits stay a set of four');
  assert(stillUser.supportFrames.join() === six.join(), 'later login and later webhooks keep the same six');
  assert((await putMe(tokens[fresh.id], { pendant: six[0] })).pendant === six[0], 'a granted frame equips below the ladder');
  assert((await putMe(tokens[fresh.id], { pendant: missed[0] })).pendant === 'none', 'a frame outside the six stays locked');
  assert((await putMe(tokens[fresh.id], { pendant: 'frostmirror' })).pendant === 'frostmirror', 'ice frames stay free after the roll');
  assert((await getJSON('/api/me', tokens[fresh.id])).body.includes('coffee') && !(await getJSON('/api/me', tokens[fresh.id])).body.includes('cs_test_fresh'), 'owner sees benefits, not the Stripe ref');

  const partialBefore = (await getJSON('/api/support', tokens[partial.id])).json;
  assert(partialBefore.owned.join() === 'coffee' && partialBefore.frames == null, 'a partial owner is not rolled before a verified payment');
  const filled = await hook('checkout.session.completed', session(partial.id, { id: 'cs_test_partial' }));
  assert(filled.json.granted === true, 'a partial owner receives the missing benefits');
  const partBody = (await getJSON('/api/support', tokens[partial.id])).json;
  const part = partBody.owned;
  assert(part.join() === 'coffee,badge,silver,emote', 'partial coffee plus the rest, without a duplicate');
  assert(Array.isArray(partBody.frames) && partBody.frames.length === 6, 'the completing webhook also rolls six frames once');
  const partAgain = await hook('payment_intent.succeeded', { id: 'pi_test_partial_again', amount: 1500, currency: 'hkd', metadata: { userId: partial.id, product: 'hk-avalon-support' } });
  assert(partAgain.json.granted === false, 'repeat support adds nothing new');
  const partKept = (await getJSON('/api/me', tokens[partial.id])).json.user.supportFrames;
  assert(partKept.join() === partBody.frames.join(), 'repeat support does not roll a new set');

  const backfill = (await getJSON('/api/me', tokens[veteran.id])).json.user;
  assert(backfill.benefits.join() === 'coffee,badge,silver,emote' && backfill.supportFrames.length === 6, 'an existing supporter is rolled once when benefits load');
  const backfillAgain = (await getJSON('/api/support', tokens[veteran.id])).json;
  assert(backfillAgain.frames.join() === backfill.supportFrames.join(), 'loading benefits again does not re-roll');
  const vetPaid = await hook('checkout.session.completed', session(vetHook.id, { id: 'cs_test_vethook' }));
  assert(vetPaid.json.granted === false, 'a supporter who already has the four benefits is not granted twice');
  const vetFrames = (await getJSON('/api/me', tokens[vetHook.id])).json.user.supportFrames;
  assert(vetFrames.length === 6, 'a webhook backfills the frame set for an existing supporter');
  const vetReplay = await hook('checkout.session.completed', session(vetHook.id, { id: 'cs_test_vethook' }), 'evt_vet_replay');
  assert(vetReplay.json.granted === false, 'replaying an old supporter payment does not roll again');
  assert((await getJSON('/api/me', tokens[vetHook.id])).json.user.supportFrames.join() === vetFrames.join(), 'the webhook backfill stays put');

  const ladderPaid = await hook('checkout.session.completed', session(ladder.id, { id: 'cs_test_ladder' }));
  assert(ladderPaid.json.granted === true, 'a ladder player can still buy support');
  const ladderFrames = (await getJSON('/api/me', tokens[ladder.id])).json.user.supportFrames;
  assert(ladderFrames.length === 3 && ['foxdance', 'fairylake', 'odineye'].every(id => ladderFrames.includes(id)), 'only frames still locked by the ladder are rolled');
  assert((await putMe(tokens[ladder.id], { pendant: 'foxqiu' })).pendant === 'foxqiu', 'a ladder unlock still equips when it was not in the six');
  assert((await putMe(tokens[ladder.id], { pendant: 'fairylake' })).pendant === 'fairylake', 'a granted frame equips before its win ladder');
  const richPaid = await hook('checkout.session.completed', session(rich.id, { id: 'cs_test_rich' }));
  assert(richPaid.json.granted === true, 'a fully unlocked player can still buy support');
  const richFrames = (await getJSON('/api/me', tokens[rich.id])).json.user.supportFrames;
  assert(Array.isArray(richFrames) && richFrames.length === 0, 'no locked frames means the persisted set is empty');
  assert((await putMe(tokens[rich.id], { pendant: 'odineye' })).pendant === 'odineye', 'the win ladder still unlocks when support has nothing left to give');
  const richAgain = await hook('payment_intent.succeeded', { id: 'pi_test_rich_again', amount: 1500, currency: 'hkd', metadata: { userId: rich.id, product: 'hk-avalon-support' } });
  assert(richAgain.json.granted === false && (await getJSON('/api/me', tokens[rich.id])).json.user.supportFrames.length === 0, 'an empty persisted set is not rolled again');

  assert((await putMe(tokens[fresh.id], { pendant: 'coffee', fx: 'silver' })).pendant === 'coffee', 'coffee pendant equips after payment');
  assert((await putMe(tokens[fresh.id], { fx: 'silver' })).fx === 'silver', 'silver spotlight equips after payment');
  assert((await putMe(tokens[other.id], { pendant: 'coffee', fx: 'silver' })).pendant !== 'coffee', 'someone else still cannot equip them');
  await sleep(800);
  const disk = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
  const diskOf = (id) => disk.users.find(u => u.id === id).support_frames;
  assert(diskOf(fresh.id).join() === six.join(), 'the six are stored on the user record');
  assert(diskOf(veteran.id).join() === backfill.supportFrames.join(), 'the backfill is stored on the user record');
  assert(Array.isArray(diskOf(rich.id)) && diskOf(rich.id).length === 0, 'an empty roll is stored so it cannot be rolled later');

  function bot(key, name) {
    const s = io(APP, { transports: ['websocket'], forceNew: true });
    const c = { s, st: null, emotes: [] };
    s.on('state', st => { c.st = st; });
    s.on('emote', msg => c.emotes.push(msg));
    c.emit = (ev, d) => new Promise(r => s.emit(ev, d, r));
    c.ready = new Promise((res, rej) => s.on('connect', async () => {
      const h = await c.emit('hello', { guestKey: key, name });
      if (!h || h.error) rej(new Error('hello')); else res(h);
    }));
    return c;
  }
  const A = bot('simsupfresh' + stamp, '新客');
  const B = bot('simsupoth' + stamp, '路人');
  await Promise.all([A.ready, B.ready]);
  const created = await A.emit('create');
  assert(created && created.room, 'room created');
  await B.emit('join', { code: created.room });
  await sleep(200);
  A.s.emit('emote', { e: 'sup_coffee' });
  await sleep(250);
  assert(B.emotes.some(e => e.e === 'sup_coffee'), 'supporter emote is relayed after payment');
  const before = B.emotes.length;
  B.s.emit('emote', { e: 'sup_coffee' });
  await sleep(250);
  assert(B.emotes.length === before, 'a non-supporter emote is not relayed');
  const blob = JSON.stringify(B.st);
  assert(B.st && B.st.seats.some(s => s && s.badge && s.name === '新客'), 'badge is on the profile payload');
  for (const secret of [SKEY, WHSEC, 'cs_test_fresh', 'pi_test_second', 'support_benefits', 'support_frames', 'supportFrames', '"benefits"', 'customer', 'payment_intent']) {
    assert(!blob.includes(secret), 'room state hides ' + secret);
  }
  const board = await getJSON('/api/leaderboard', tokens[other.id]);
  for (const secret of [SKEY, WHSEC, 'cs_test', 'support_benefits', 'support_frames', 'supportFrames', 'benefits', 'badge']) {
    assert(!board.body.includes(secret), 'leaderboard hides ' + secret);
  }
  const mine = await getJSON('/api/me', tokens[other.id]);
  assert(!(mine.json.user.benefits || []).length, 'another account does not inherit benefits');
  A.s.close(); B.s.close();

  // Stills: header (Merlin + HK阿瓦隆) and the support screen at 375 and 390.
  const chrome = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + CDP, '--user-data-dir=/tmp/chrome-support-' + Date.now(), '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  const stopChrome = () => { try { chrome.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', stopChrome);
  const cdpList = () => new Promise((resolve, reject) => http.get('http://127.0.0.1:' + CDP + '/json/list', res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); }).on('error', reject));
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    try { page = JSON.parse(await cdpList()).find(t => t.type === 'page'); } catch (e) { await sleep(150); }
  }
  if (!page) throw new Error('no chrome');
  const ws = new (require('ws'))(page.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let msgId = 0; const pending = new Map();
  ws.on('message', raw => { const msg = JSON.parse(raw); if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId; const t = setTimeout(() => reject(new Error('cdp ' + method)), 15000);
    pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalj = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result && r.result.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  const openSupport = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: APP });
    const ready = await evalj(`new Promise(r => { const t=setInterval(()=>{ const title=document.querySelector('#topTitle'); const img=document.querySelector('.tlogo.merlin'); const row=document.querySelector('.card.menu [data-a="go"][data-v="support"]'); if(title && title.textContent==='HK阿瓦隆' && img && img.complete && img.naturalWidth>0 && row && !document.querySelector('.support-entry')){ clearInterval(t); r(1);} }, 40); setTimeout(()=>r(0), 8000); })`);
    assert(ready === 1, w + ' home header is ready');
    return evalj(`(() => { const img=document.querySelector('.tlogo.merlin'); const title=document.querySelector('#topTitle'); const ir=img.getBoundingClientRect(); const tr=title.getBoundingClientRect(); return { src: img.getAttribute('src'), title: title.textContent, w: Math.round(ir.width), h: Math.round(ir.height), overlap: !(ir.right < tr.left || tr.right < ir.left) }; })()`);
  };
  const supportReady = (extra) => `new Promise(r => { const t=setInterval(()=>{ const h=document.querySelector('.support h1'); const charms=[...document.querySelectorAll('.support-charm')]; const imgs=[...document.querySelectorAll('.support-charm img')]; const pals=[...document.querySelectorAll('.support-charm .pd-pal')]; if(h && h.textContent.includes('請開發者喝杯咖啡') && document.querySelector('.support-pay') && charms.length===12 && pals.length===12 && imgs.length>=24 && imgs.every(i=>i.complete && i.naturalWidth>0) && ${extra}){ clearInterval(t); r(document.body.innerText);} }, 40); setTimeout(()=>r(''), 8000); })`;
  const fullShot = async (file, w) => {
    const metrics = await send('Page.getLayoutMetrics');
    const height = Math.ceil(metrics.cssContentSize.height);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height, deviceScaleFactor: 2, mobile: true });
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: w === 375 ? 812 : 844, deviceScaleFactor: 2, mobile: true });
  };
  const shootBefore = async (w, h) => {
    const head = await openSupport(w, h);
    assert(head.src.includes('logo-merlin') && head.title === 'HK阿瓦隆' && head.w >= 24 && head.h >= 24, w + ' header is Merlin + HK阿瓦隆');
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'header-' + w + '.png'), Buffer.from(data, 'base64'));
    const menu = await evalj(`(() => { const items=[...document.querySelectorAll('.card.menu .item .grow')].map(el => el.textContent.trim()); const row=document.querySelector('.card.menu [data-a="go"][data-v="support"]'); const rules=items.indexOf('規則介紹'); const sup=items.indexOf('支持我哋'); const ver=items.indexOf('版本'); return { items, blue: !!document.querySelector('.support-entry'), coffee: row && row.querySelector('.ic') ? row.querySelector('.ic').textContent : '', chev: !!(row && row.querySelector('.chev')), orderOk: rules >= 0 && sup === rules + 1 && ver === sup + 1 }; })()`);
    assert(!menu.blue && menu.orderOk && menu.coffee === '☕' && menu.chev, w + ' menu has 支持我哋 under 規則介紹 and no blue button ' + JSON.stringify(menu));
    await fullShot('home-menu-' + w + '.png', w);
    await evalj(`document.querySelector('.card.menu [data-a="go"][data-v="support"]').click()`);
    const shown = await evalj(supportReady(`document.body.innerText.includes('購買會隨機解鎖六款圓框掛件')`));
    assert(shown.includes('HK$15 支持') && shown.includes('一杯咖啡') && shown.includes('支持者表情') && shown.includes('購買會隨機解鎖六款圓框掛件') && shown.includes('購買前不會公布是哪六款') && !shown.includes('去廣告') && !shown.includes('¥') && !shown.includes('已有'), w + ' support screen offers six charms before purchase');
    const icon = await evalj(`(() => { const el = document.querySelector('.support-ic .pov.coffee'); const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return { pos: cs.position, w: Math.round(r.width), h: Math.round(r.height) }; })()`);
    assert(icon.pos === 'static' && icon.w >= 30 && icon.w <= 40 && icon.h >= 30 && icon.h <= 40, w + ' support icon stays a small static cup ' + JSON.stringify(icon));
    for (const [, name] of [['foxqiu', '狐祈千秋'], ['foxheart', '狐祈同心'], ['starmoon', '星樓望月'], ['starplain', '星垂平野'], ['whiteling', '瑞獸白靈'], ['darkling', '瑞獸玄靈'], ['skydragon', '龍吟九霄'], ['foxdance', '狐舞月華'], ['frostmirror', '朔雪之映'], ['icesword', '逆光之劍'], ['fairylake', '妖精之湖'], ['odineye', '奧丁之眼']]) {
      assert(shown.includes(name), w + ' shows ' + name);
    }
    const layout = await evalj(`(() => { const rows=[...document.querySelectorAll('.support-row')]; const charms=[...document.querySelectorAll('.support-charm')]; const offer=document.querySelector('.support-offer').getBoundingClientRect(); const h1=document.querySelector('.support h1').getBoundingClientRect(); const marks=charms.map(el => ({ id: el.dataset.frame, mark: (el.querySelector('em')||{}).textContent || '' })); return { n: rows.length, charms: charms.length, w: Math.round(document.documentElement.clientWidth), h1: Math.round(h1.top), offerTop: Math.round(offer.top), offerVisible: offer.top >= 48 && offer.top < window.innerHeight, wide: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, covers: rows.some(r => r.getBoundingClientRect().top < 52), visible: charms.filter(el => { const b=el.getBoundingClientRect(); return b.bottom > 60 && b.top < window.innerHeight; }).length, marks }; })()`);
    assert(layout.n === 4 && layout.charms === 12 && layout.w === w && layout.h1 >= 48 && layout.offerVisible && !layout.covers && !layout.wide && layout.visible >= 4, w + ' offer sits under the header ' + JSON.stringify(layout));
    assert(layout.marks.filter(m => m.mark === '免費').map(m => m.id).sort().join() === 'frostmirror,icesword', w + ' marks only the free ice frames before purchase');
    assert(layout.marks.every(m => m.mark !== '已有'), w + ' does not reveal a buyer\'s six before purchase');
    await fullShot('support-before-' + w + '.png', w);
  };
  await shootBefore(375, 812);
  await shootBefore(390, 844);
  const paidFrames = backfill.supportFrames.slice();
  const paidMissed = support.FRAME_POOL.filter(id => !paidFrames.includes(id));
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('cc.token',${JSON.stringify(tokens[veteran.id])})}catch(e){}` });
  const shootAfter = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: APP });
    const ready = await evalj(`new Promise(r => { const t=setInterval(()=>{ const name=document.querySelector('.prof-head .name'); const row=document.querySelector('.card.menu [data-a="go"][data-v="support"]'); if(name && name.textContent.includes('舊支持') && name.textContent.includes('支持者') && row && !document.querySelector('.support-entry')){ clearInterval(t); r({ok:1});} }, 40); setTimeout(()=>r({ok:0, token:(localStorage.getItem('cc.token')||'').slice(0,8), text:(document.body.innerText||'').slice(0,280)}), 8000); })`);
    assert(ready && ready.ok === 1, w + ' paid home is ready ' + JSON.stringify(ready));
    await evalj(`document.querySelector('.card.menu [data-a="go"][data-v="support"]').click()`);
    const shown = await evalj(supportReady(`document.body.innerText.includes('你抽到的六款圓框掛件')`));
    assert(shown.includes('你抽到的六款圓框掛件') && shown.includes('再次支持不會重新抽取') && shown.includes('一杯咖啡') && shown.includes('已有'), w + ' support screen names the six after purchase');
    const marks = await evalj(`(() => [...document.querySelectorAll('.support-charm')].map(el => ({ id: el.dataset.frame, mark: (el.querySelector('em')||{}).textContent || '' })))()`);
    const got = marks.filter(m => m.mark === '已有').map(m => m.id);
    assert(got.slice().sort().join() === paidFrames.slice().sort().join(), w + ' marks the persisted six as 已有');
    for (const id of paidMissed) assert(marks.find(m => m.id === id).mark === '', w + ' leaves ' + id + ' unmarked');
    assert(marks.filter(m => m.mark === '免費').map(m => m.id).sort().join() === 'frostmirror,icesword', w + ' still marks ice as free');
    const layout = await evalj(`(() => { const offer=document.querySelector('.support-offer').getBoundingClientRect(); return { w: Math.round(document.documentElement.clientWidth), offerTop: Math.round(offer.top), wide: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, visible: [...document.querySelectorAll('.support-charm.got')].filter(el => { const b=el.getBoundingClientRect(); return b.bottom > 60 && b.top < window.innerHeight; }).length }; })()`);
    assert(layout.w === w && layout.offerTop >= 48 && !layout.wide, w + ' granted offer fits the phone ' + JSON.stringify(layout));
    await fullShot('support-after-' + w + '.png', w);
  };
  await shootAfter(375, 812);
  await shootAfter(390, 844);
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await evalj(`document.querySelector('#backBtn').click()`);
  const homeAgain = await evalj(`new Promise(r => { const t=setInterval(()=>{ if(document.querySelector('[data-a="ptab"]')){ clearInterval(t); r(1);} }, 40); setTimeout(()=>r(0), 4000); })`);
  assert(homeAgain === 1, 'back from support returns home');
  await evalj(`document.querySelector('[data-a="ptab"]').click()`);
  const picker = await evalj(`new Promise(r => { const t=setInterval(()=>{ const got=document.querySelector('[data-pd="${paidFrames[0]}"]'); const miss=document.querySelector('[data-pd="${paidMissed[0]}"]'); if(got && miss){ clearInterval(t); r({ gotOff: got.classList.contains('off'), missOff: miss.classList.contains('off') }); } }, 40); setTimeout(()=>r(null), 4000); })`);
  assert(picker && picker.gotOff === false && picker.missOff === true, 'picker unlocks the granted frame and keeps the others locked ' + JSON.stringify(picker));
  await evalj(`document.querySelector('[data-pd="${paidFrames[0]}"]').scrollIntoView({block:'center'})`);
  await sleep(200);
  const pickerShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'support-picker-375.png'), Buffer.from(pickerShot.data, 'base64'));

  const STORE = '/cursor/stores/self/t267-coffee';
  fs.mkdirSync(STORE, { recursive: true });
  const saveShot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(OUT, name + '.png'), buf);
    fs.writeFileSync(path.join(STORE, name + '.png'), buf);
  };
  const bootAs = async (token, guest, profile) => {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('cc.token',${JSON.stringify(token)});localStorage.setItem('cc.guest',${JSON.stringify(guest)});localStorage.setItem('cc.profile',${JSON.stringify(JSON.stringify(profile))});}catch(e){}` });
    await evalj(`localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('cc.token', ${JSON.stringify(token)});
      localStorage.setItem('cc.guest', ${JSON.stringify(guest)});
      localStorage.setItem('cc.profile', ${JSON.stringify(JSON.stringify(profile))});`);
    await send('Page.navigate', { url: APP });
    const ready = await evalj(`new Promise(r => { const t = setInterval(() => { if (document.querySelector('#topTitle') && window.__av) { clearInterval(t); r(1); } }, 40); setTimeout(() => r(0), 8000); })`);
    assert(ready === 1, 'coffee ui booted');
  };
  const waitFor = async (expr, label) => {
    const ok = await evalj(`new Promise(r => { const t = setInterval(() => { try { if (${expr}) { clearInterval(t); r(1); } } catch (e) {} }, 50); setTimeout(() => r(0), 8000); })`);
    assert(ok === 1, label);
  };
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await bootAs(tokens[other.id], 'simsupoth' + stamp, { name: '路人', avatar: 'fox', bg: '#fff7ea', fx: 'none', pendant: 'none' });
  await evalj(`window.__av.go('home')`);
  await waitFor(`document.querySelector('[data-a="ptab"]')`, 'home pendant button');
  await evalj(`document.querySelector('[data-a="ptab"]').click()`);
  await waitFor(`document.querySelector('[data-pd="coffee"].off')`, 'locked coffee cell');
  const locked = await evalj(`(() => { const b = document.querySelector('[data-pd="coffee"]'); b.scrollIntoView({ block: 'center' }); const face = b.querySelector('.pdcirc').getBoundingClientRect(); const cup = b.querySelector('.pov.coffee').getBoundingClientRect(); return { off: b.classList.contains('off'), sub: (b.querySelector('i') || {}).textContent || '', svg: !!b.querySelector('svg.pov.coffee'), img: !!b.querySelector('img.pov'), dx: Math.abs((cup.left + cup.width / 2) - (face.left + face.width / 2)), dip: (cup.bottom - face.top) / face.width, size: cup.width / face.width, above: face.top - cup.top }; })()`);
  assert(locked.off && locked.sub === '支持解鎖' && locked.svg && !locked.img, 'locked picker shows the cup and 支持解鎖 ' + JSON.stringify(locked));
  assert(locked.dx < 3 && locked.size > 0.5 && locked.size < 0.7 && locked.dip > 0.04 && locked.dip < 0.22 && locked.above > 8, 'locked cup sits on the crown ' + JSON.stringify(locked));
  await sleep(80);
  await saveShot('coffee-locked-375');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(80);
  await saveShot('coffee-locked-390');

  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await bootAs(tokens[fresh.id], 'simsupfresh' + stamp, { name: '新客', avatar: 'fox', bg: '#fff7ea', fx: 'none', pendant: 'coffee' });
  await waitFor(`document.querySelector('.rt .st .pov.coffee') && document.querySelector('.rt .st .nm') && document.querySelector('.rt .st .nm').textContent.includes('新客')`, 'seated coffee pendant');
  await sleep(120);
  const seat = await evalj(`(() => { const st = [...document.querySelectorAll('.rt .st')].find(s => (s.querySelector('.nm') || {}).textContent === '新客'); const face = st.querySelector('.av').getBoundingClientRect(); const cup = st.querySelector('.pov.coffee').getBoundingClientRect(); const nm = st.querySelector('.nm').getBoundingClientRect(); const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1; return { text: st.querySelector('.nm').textContent, dx: Math.abs((cup.left + cup.width / 2) - (face.left + face.width / 2)), dip: (cup.bottom - face.top) / face.width, size: cup.width / face.width, onName: overlap(cup, nm), faceMid: cup.bottom < face.top + face.height * 0.42 }; })()`);
  assert(seat.text === '新客' && seat.dx < 3 && seat.size > 0.5 && seat.size < 0.7 && seat.dip > 0.04 && seat.dip < 0.22 && seat.faceMid && !seat.onName, 'seated cup is on the crown and clear of the name ' + JSON.stringify(seat));
  await saveShot('coffee-seat-375');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(100);
  await saveShot('coffee-seat-390');

  const crowd = await evalj(`(async () => {
    const cupImg = await new Promise((resolve, reject) => {
      const probe = document.querySelector('.pov.coffee');
      const xml = new XMLSerializer().serializeToString(probe);
      const svg = xml.includes('xmlns=') ? xml : xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('cup'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    const host = document.createElement('div');
    host.className = 'card tbl';
    host.style.cssText = 'position:fixed;left:0;top:70px;width:' + document.documentElement.clientWidth + 'px;z-index:60;background:#fff';
    document.body.appendChild(host);
    const bad = [];
    for (const n of [5, 8, 10, 12]) {
      const seats = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, seat: i + 1, name: i % 2 ? '咖啡友' : '新客', pendant: (i === 0 || i === 3) ? 'coffee' : 'none', avatar: 'fox', bg: '#fff7ea', online: true }));
      host.innerHTML = window.__av.roundTable(seats);
      const box = host.getBoundingClientRect();
      const c = document.createElement('canvas');
      const sc = 2;
      c.width = Math.max(1, Math.ceil(box.width * sc));
      c.height = Math.max(1, Math.ceil(box.height * sc));
      const x = c.getContext('2d');
      host.querySelectorAll('.pov.coffee').forEach((cup) => {
        const cr = cup.getBoundingClientRect();
        x.drawImage(cupImg, (cr.left - box.left) * sc, (cr.top - box.top) * sc, cr.width * sc, cr.height * sc);
      });
      const data = x.getImageData(0, 0, c.width, c.height).data;
      const hits = (rect, pred) => {
        let n = 0;
        const x0 = Math.max(0, Math.floor((rect.left - box.left) * sc));
        const y0 = Math.max(0, Math.floor((rect.top - box.top) * sc));
        const x1 = Math.min(c.width, Math.ceil((rect.right - box.left) * sc));
        const y1 = Math.min(c.height, Math.ceil((rect.bottom - box.top) * sc));
        for (let y = y0; y < y1; y++) for (let px = x0; px < x1; px++) {
          if (data[(y * c.width + px) * 4 + 3] <= 28) continue;
          if (!pred || pred(box.left + px / sc, box.top + y / sc)) n++;
        }
        return n;
      };
      host.querySelectorAll('.rt .st .av').forEach((faceEl) => {
        if (!faceEl.parentElement.querySelector('.pov.coffee')) return;
        const f = faceEl.getBoundingClientRect();
        const cx = f.left + f.width / 2, cy = f.top + f.height / 2, rad = f.width * 0.36;
        const inner = hits(f, (px, py) => Math.hypot(px - cx, py - cy) < rad);
        if (inner) bad.push('face ' + n + ' ' + inner);
      });
      host.querySelectorAll('.nm').forEach((el) => {
        const hit = hits(el.getBoundingClientRect());
        if (hit) bad.push('name ' + el.textContent + ' n=' + n + ' ' + hit);
      });
    }
    host.remove();
    return bad.slice(0, 8);
  })()`);
  assert(!crowd.length, 'coffee ink stays off the face and every seat name ' + JSON.stringify(crowd));

  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await evalj(`window.__av.go('home')`);
  await waitFor(`document.querySelector('[data-a="ptab"]')`, 'supporter home');
  await evalj(`document.querySelector('[data-a="ptab"]').click()`);
  await waitFor(`document.querySelector('[data-pd="coffee"].sel') && !document.querySelector('[data-pd="coffee"]').classList.contains('off')`, 'selected coffee cell');
  await evalj(`document.querySelector('[data-pd="coffee"]').scrollIntoView({ block: 'center' })`);
  await sleep(80);
  const picked = await evalj(`(() => { const b = document.querySelector('[data-pd="coffee"]'); const face = b.querySelector('.pdcirc').getBoundingClientRect(); const cup = b.querySelector('.pov.coffee').getBoundingClientRect(); const prev = document.querySelector('.pe-av .pov.coffee').getBoundingClientRect(); const pf = document.querySelector('.pe-av .av').getBoundingClientRect(); return { sel: b.classList.contains('sel'), dx: Math.abs((cup.left + cup.width / 2) - (face.left + face.width / 2)), dip: (cup.bottom - face.top) / face.width, pdx: Math.abs((prev.left + prev.width / 2) - (pf.left + pf.width / 2)), pdip: (prev.bottom - pf.top) / pf.width }; })()`);
  assert(picked.sel && picked.dx < 3 && picked.dip > 0.04 && picked.dip < 0.22 && picked.pdx < 3 && picked.pdip > 0.04 && picked.pdip < 0.22, 'selected cell and editor preview put the cup on the crown ' + JSON.stringify(picked));
  await saveShot('coffee-selected-375');
  const previewTop = await evalj(`(() => { const r = document.querySelector('.pe-top').getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height }; })()`);
  await send('Page.captureScreenshot', { format: 'png', clip: { x: previewTop.x, y: previewTop.y, width: previewTop.width, height: previewTop.height, scale: 2 } }).then(({ data }) => {
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(OUT, 'coffee-editor-375.png'), buf);
    fs.writeFileSync(path.join(STORE, 'coffee-editor-375.png'), buf);
  });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(80);
  await saveShot('coffee-selected-390');
  const previewTop390 = await evalj(`(() => { const r = document.querySelector('.pe-top').getBoundingClientRect(); return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height }; })()`);
  await send('Page.captureScreenshot', { format: 'png', clip: { x: previewTop390.x, y: previewTop390.y, width: previewTop390.width, height: previewTop390.height, scale: 2 } }).then(({ data }) => {
    const buf = Buffer.from(data, 'base64');
    fs.writeFileSync(path.join(OUT, 'coffee-editor-390.png'), buf);
    fs.writeFileSync(path.join(STORE, 'coffee-editor-390.png'), buf);
  });

  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const faceFile = path.join(root, 'public/img/av/fox.webp');
  const doc = await send('DOM.getDocument', { depth: 0 });
  const input = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#file' });
  assert(input && input.nodeId, 'crop file input is in the editor');
  await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [faceFile] });
  await waitFor(`document.querySelector('#cropring .pov.coffee')`, 'crop ring coffee cup');
  await sleep(150);
  const crop = await evalj(`(() => { const ring = document.querySelector('#cropring'); const cup = ring.querySelector('.pov.coffee'); const rr = ring.getBoundingClientRect(); const cr = cup.getBoundingClientRect(); return { img: !!ring.querySelector('img.pov'), dx: Math.abs((cr.left + cr.width / 2) - (rr.left + rr.width / 2)), dip: (cr.bottom - rr.top) / rr.width, size: cr.width / rr.width }; })()`);
  assert(!crop.img && crop.dx < 3 && crop.size > 0.5 && crop.size < 0.7 && crop.dip > 0.04 && crop.dip < 0.22, 'crop ring cup sits on the crown ' + JSON.stringify(crop));
  await saveShot('coffee-crop-375');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(100);
  await saveShot('coffee-crop-390');

  const drawn = await evalj(`(async () => {
    const paint = async (pendant) => {
      const c = document.createElement('canvas'); c.width = c.height = 240;
      const x = c.getContext('2d');
      const load = (src) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
      await window.__av.canvasDrawAv(x, load, { pendant, avatar: 'fox', bg: '#fff7ea' }, 120, 130, 70);
      return x.getImageData(0, 0, 240, 240).data;
    };
    const a = await paint('coffee'), b = await paint('none');
    const differ = (i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]) > 48;
    let crown = 0, inner = 0;
    for (let y = 0; y < 240; y++) for (let px = 0; px < 240; px++) {
      if (!differ((y * 240 + px) * 4)) continue;
      const d = Math.hypot(px - 120, y - 130);
      if (d < 46) inner++;
      else if (y < 60) crown++;
    }
    return { crown, inner };
  })()`);
  assert(drawn.crown > 20 && drawn.inner === 0, 'canvas poster paints the cup above the face ' + JSON.stringify(drawn));

  ws.close();
  stopChrome();
  stop();
  console.log('SUPPORT TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });
