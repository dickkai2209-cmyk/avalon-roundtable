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
  assert(html.includes('style.css?v=62') && html.includes('app.js?v=70') && html.includes('review.js?v=2') && html.includes('voice.js?v=5'), 'cache bust past live main');
  assert(fs.existsSync(path.join(root, 'public/img/logo-merlin.webp')) && fs.existsSync(path.join(root, 'public/img/logo-merlin.png')), 'logo asset is webp and png');
  const logo = fs.readFileSync(path.join(root, 'public/img/logo-merlin.webp'));
  assert(logo.slice(0, 4).toString() === 'RIFF' && logo.slice(8, 12).toString() === 'WEBP', 'merlin logo is webp');

  const ui = app.slice(app.indexOf('function supportHtml'), app.indexOf('const ACHS'));
  for (const s of ['請開發者喝杯咖啡', '熬夜改 bug 的時候，這杯咖啡很管用。謝謝你！', '一杯咖啡', '頭像掛件', '支持者', '名字旁邊的徽章，點開名片時大家都看得到', '銀白追光', '準備階段入座時，一束追光打在你的頭像上', '支持者表情', '房間裡點一下，頭像上冒出來的專屬表情', '可以重複支持：第一次送下面這些，之後每次只補上你還沒有的，已經有的不會再送一次。', 'HK$15 支持', '支持我哋']) {
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
  const params = support.buildCheckoutParams({ userId: 'user-12345678', origin: 'https://example.test', integrationId: 'hk_avalon_support_abcdefgh' });
  assert(params.mode === 'payment' && !params.payment_method_types && params.line_items[0].price_data.unit_amount === 1500 && params.line_items[0].price_data.currency === 'hkd', 'checkout is a one-time HKD 1500 session');
  assert(params.integration_identifier === 'hk_avalon_support_abcdefgh' && /_[a-z]{8}$/.test(support.integrationId()), 'integration id ends in 8 letters');
  assert(params.success_url.includes('support=pending'), 'return URL does not grant by itself');

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
  assert(fresh.pendant !== 'coffee' && fresh.fx !== 'silver', 'creating an account cannot claim support cosmetics');
  const tokens = {};
  for (const u of [fresh, mvp, gm, partial, other]) tokens[u.id] = await db.createSession(u.id);
  db.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
  saved.stats = saved.stats || {};
  saved.stats[fresh.id] = { played: 0, won: 0, mvp: 0, roles: {} };
  saved.stats[mvp.id] = { played: 12, won: 10, mvp: 10, roles: {} };
  saved.stats[gm.id] = { played: 30, won: 20, mvp: 0, roles: {} };
  saved.users.find(u => u.id === partial.id).support_benefits = ['coffee'];
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
  assert(me.json.owned.length === 0, 'a new player owns nothing');
  assert(!me.body.includes(SKEY) && !me.body.includes(WHSEC) && !me.body.includes('去廣告'), 'support API hides secrets and ad removal');

  const checkout = await post('/api/support/checkout', {}, { Authorization: 'Bearer ' + tokens[fresh.id] });
  assert(checkout.status === 200 && checkout.json.url && checkout.json.id === 'cs_test_mock', 'checkout can be opened');
  const afterOpen = await getJSON('/api/support', tokens[fresh.id]);
  assert(afterOpen.json.owned.length === 0, 'opening checkout does not grant');
  const claim = await post('/api/support/claim', { benefits: ['coffee', 'badge', 'silver', 'emote'] }, { Authorization: 'Bearer ' + tokens[fresh.id] });
  assert(claim.status === 404, 'there is no client claim route');
  const forged = await putMe(tokens[fresh.id], { benefits: ['coffee', 'badge', 'silver', 'emote'], pendant: 'coffee', fx: 'silver' });
  assert(forged.pendant !== 'coffee' && forged.fx !== 'silver' && (!forged.benefits || !forged.benefits.length), 'a client payload cannot grant benefits');

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
  assert((await getJSON('/api/support', tokens[fresh.id])).json.owned.length === 0, 'benefits stay empty after unpaid');
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
  const again = await hook('checkout.session.completed', session(fresh.id, { id: 'cs_test_fresh' }), 'evt_replay');
  assert(again.json.granted === false, 'replaying the same payment does not grant again');
  const second = await hook('payment_intent.succeeded', { id: 'pi_test_second', amount: 1500, currency: 'hkd', metadata: { userId: fresh.id, product: 'hk-avalon-support' } });
  assert(second.json.granted === false, 'a later payment adds nothing already owned');
  const still = (await getJSON('/api/me', tokens[fresh.id])).json.user.benefits;
  assert(still.join() === 'coffee,badge,silver,emote' && still.filter(x => x === 'coffee').length === 1, 'benefits stay a set of four');
  assert((await getJSON('/api/me', tokens[fresh.id])).body.includes('coffee') && !(await getJSON('/api/me', tokens[fresh.id])).body.includes('cs_test_fresh'), 'owner sees benefits, not the Stripe ref');

  const filled = await hook('checkout.session.completed', session(partial.id, { id: 'cs_test_partial' }));
  assert(filled.json.granted === true, 'a partial owner receives the missing benefits');
  const part = (await getJSON('/api/support', tokens[partial.id])).json.owned;
  assert(part.join() === 'coffee,badge,silver,emote', 'partial coffee plus the rest, without a duplicate');

  assert((await putMe(tokens[fresh.id], { pendant: 'coffee', fx: 'silver' })).pendant === 'coffee', 'coffee pendant equips after payment');
  assert((await putMe(tokens[fresh.id], { fx: 'silver' })).fx === 'silver', 'silver spotlight equips after payment');
  assert((await putMe(tokens[other.id], { pendant: 'coffee', fx: 'silver' })).pendant !== 'coffee', 'someone else still cannot equip them');

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
  for (const secret of [SKEY, WHSEC, 'cs_test_fresh', 'pi_test_second', 'support_benefits', '"benefits"', 'customer', 'payment_intent']) {
    assert(!blob.includes(secret), 'room state hides ' + secret);
  }
  const board = await getJSON('/api/leaderboard', tokens[other.id]);
  for (const secret of [SKEY, WHSEC, 'cs_test', 'support_benefits', 'benefits', 'badge']) {
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
  const shoot = async (name, w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: APP });
    const ready = await evalj(`new Promise(r => { const t=setInterval(()=>{ const title=document.querySelector('#topTitle'); const img=document.querySelector('.tlogo.merlin'); const row=document.querySelector('.card.menu [data-a="go"][data-v="support"]'); if(title && title.textContent==='HK阿瓦隆' && img && img.complete && img.naturalWidth>0 && row && !document.querySelector('.support-entry')){ clearInterval(t); r(1);} }, 40); setTimeout(()=>r(0), 8000); })`);
    assert(ready === 1, name + ' home header is ready');
    const menu = await evalj(`(() => { const items=[...document.querySelectorAll('.card.menu .item .grow')].map(el => el.textContent.trim()); const row=document.querySelector('.card.menu [data-a="go"][data-v="support"]'); const rules=items.indexOf('規則介紹'); const sup=items.indexOf('支持我哋'); const ver=items.indexOf('版本'); return { items, blue: !!document.querySelector('.support-entry') || !!document.querySelector('button.support-entry'), coffee: row && row.querySelector('.ic') ? row.querySelector('.ic').textContent : '', chev: !!(row && row.querySelector('.chev')), orderOk: rules >= 0 && sup === rules + 1 && ver === sup + 1 }; })()`);
    assert(!menu.blue && menu.orderOk && menu.coffee === '☕' && menu.chev, name + ' menu has 支持我哋 under 規則介紹 and no blue button ' + JSON.stringify(menu));
    const head = await evalj(`(() => { const img=document.querySelector('.tlogo.merlin'); const title=document.querySelector('#topTitle'); const ir=img.getBoundingClientRect(); const tr=title.getBoundingClientRect(); return { src: img.getAttribute('src'), title: title.textContent, w: Math.round(ir.width), h: Math.round(ir.height), overlap: !(ir.right < tr.left || tr.right < ir.left) }; })()`);
    assert(head.src.includes('logo-merlin') && head.title === 'HK阿瓦隆' && head.w >= 24 && head.h >= 24, name + ' header is Merlin + HK阿瓦隆');
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'header-' + w + '.png'), Buffer.from(data, 'base64'));
    const pageBox = await evalj(`({ w: document.documentElement.clientWidth, h: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) })`);
    const homeShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: pageBox.w, height: pageBox.h, scale: 1 } });
    fs.writeFileSync(path.join(OUT, 'home-menu-' + w + '.png'), Buffer.from(homeShot.data, 'base64'));
    await evalj(`document.querySelector('.card.menu [data-a="go"][data-v="support"]').click()`);
    const shown = await evalj(`new Promise(r => { const t=setInterval(()=>{ const h=document.querySelector('.support h1'); if(h && h.textContent.includes('請開發者喝杯咖啡') && document.querySelector('.support-pay')){ clearInterval(t); r(document.body.innerText); } }, 40); setTimeout(()=>r(''), 4000); })`);
    assert(shown.includes('HK$15 支持') && shown.includes('一杯咖啡') && shown.includes('支持者表情') && !shown.includes('去廣告') && !shown.includes('¥'), name + ' support screen copy');
    const layout = await evalj(`(() => { const rows=[...document.querySelectorAll('.support-row')].map(r => r.getBoundingClientRect()); const btn=document.querySelector('.support-pay').getBoundingClientRect(); const h1=document.querySelector('.support h1').getBoundingClientRect(); return { n: rows.length, w: Math.round(document.documentElement.clientWidth), h1: Math.round(h1.top), btn: Math.round(btn.bottom), vh: window.innerHeight, covers: rows.some(r => r.top < 52) }; })()`);
    assert(layout.n === 4 && layout.w === w && layout.h1 >= 48 && !layout.covers, name + ' support list sits under the header ' + JSON.stringify(layout));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'support-' + w + '.png'), Buffer.from(shot.data, 'base64'));
  };
  await shoot('375', 375, 812);
  await shoot('390', 390, 844);
  ws.close();
  stopChrome();
  stop();
  console.log('SUPPORT TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });
