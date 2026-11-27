'use strict';
// Optional one-time support (HK$15) via Stripe Checkout.
// Secrets come only from the environment:
//   STRIPE_SECRET_KEY     restricted key (rk_) on the Yellowpayhk Stripe account, preferred over sk_
//   STRIPE_WEBHOOK_SECRET signing secret for POST /api/stripe/webhook
// STRIPE_MOCK=1 is for automated tests with an sk_test_/rk_test_ key. It never calls Stripe
// and never grants benefits. Do not set it in production.
const crypto = require('crypto');

const PRODUCT = 'hk-avalon-support';
const CURRENCY = 'hkd';
const UNIT_AMOUNT = 1500; // HK$15.00
const LABEL = 'HK$15';
const API_VERSION = '2026-11-18.endive';
const BENEFIT_IDS = ['coffee', 'badge', 'silver', 'emote'];
const CATALOG = [
  { id: 'coffee', name: '一杯咖啡', desc: '頭像掛件' },
  { id: 'badge', name: '支持者', desc: '名字旁邊的徽章，點開名片時大家都看得到' },
  { id: 'silver', name: '銀白追光', desc: '準備階段入座時，一束追光打在你的頭像上' },
  { id: 'emote', name: '支持者表情', desc: '房間裡點一下，頭像上冒出來的專屬表情' },
];
const SUPPORT_EMOTE = 'sup_coffee';

function normalizeBenefits(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw || '[]'); } catch (e) { list = []; }
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const id of list) if (BENEFIT_IDS.includes(id) && !out.includes(id)) out.push(id);
  return out;
}
function benefitsToAdd(owned) {
  const have = new Set(normalizeBenefits(owned));
  return BENEFIT_IDS.filter(id => !have.has(id));
}
function mergeBenefits(owned) {
  const added = benefitsToAdd(owned);
  return { owned: normalizeBenefits(normalizeBenefits(owned).concat(added)), added };
}

function moneyOk(amount, currency) {
  return Number(amount) === UNIT_AMOUNT && String(currency || '').toLowerCase() === CURRENCY;
}
function metaOk(obj) {
  const md = (obj && obj.metadata) || {};
  return md.product === PRODUCT && typeof md.userId === 'string' && md.userId.length >= 8 && md.userId.length <= 80;
}

// Grant only for a verified, paid, one-time support charge. Opening Checkout is not an event.
function decideEvent(event) {
  if (!event || typeof event !== 'object') return { grant: false, reason: 'empty' };
  const obj = event.data && event.data.object;
  if (!obj) return { grant: false, reason: 'no-object' };
  const type = event.type;
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    if (obj.mode && obj.mode !== 'payment') return { grant: false, reason: 'not-one-time' };
    if (obj.payment_status !== 'paid') return { grant: false, reason: 'unpaid' };
    if (!moneyOk(obj.amount_total, obj.currency)) return { grant: false, reason: 'amount' };
    if (!metaOk(obj)) return { grant: false, reason: 'metadata' };
    const ref = String(obj.id || '');
    if (!ref) return { grant: false, reason: 'no-ref' };
    return { grant: true, userId: obj.metadata.userId, ref, reason: 'paid' };
  }
  if (type === 'payment_intent.succeeded') {
    if (!moneyOk(obj.amount, obj.currency)) return { grant: false, reason: 'amount' };
    if (!metaOk(obj)) return { grant: false, reason: 'metadata' };
    const ref = String(obj.id || '');
    if (!ref) return { grant: false, reason: 'no-ref' };
    return { grant: true, userId: obj.metadata.userId, ref, reason: 'paid' };
  }
  return { grant: false, reason: 'ignored' };
}

function integrationId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(8);
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += alphabet[bytes[i] % 26];
  return 'hk_avalon_support_' + suffix;
}

function buildCheckoutParams({ userId, origin, integrationId: tag }) {
  const base = String(origin || '').replace(/\/$/, '');
  const id = String(userId);
  return {
    mode: 'payment',
    client_reference_id: id,
    metadata: { userId: id, product: PRODUCT },
    payment_intent_data: { metadata: { userId: id, product: PRODUCT } },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: UNIT_AMOUNT,
        product_data: {
          name: 'HK阿瓦隆 · 請開發者喝杯咖啡',
          description: '一杯咖啡頭像掛件、支持者徽章、銀白追光、支持者表情',
        },
      },
    }],
    success_url: base + '/?support=pending',
    cancel_url: base + '/?support=cancel',
    integration_identifier: tag || integrationId(),
  };
}

function testKey(key) {
  return typeof key === 'string' && (key.startsWith('sk_test_') || key.startsWith('rk_test_'));
}
function checkoutAvailable() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) return false;
  if (process.env.STRIPE_MOCK === '1') return testKey(key);
  return true;
}

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const Stripe = require('stripe');
  return new Stripe(key, { apiVersion: API_VERSION });
}

// Signature check only. Does not grant. Both env vars are required; nothing is logged.
function readWebhook(raw, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) return { status: 503, error: '收款尚未設定' };
  try {
    const stripe = stripeClient();
    const event = stripe.webhooks.constructEvent(raw, signature, secret);
    return { status: 200, event };
  } catch (e) {
    return { status: 400, error: '通知未能核對' };
  }
}

module.exports = {
  PRODUCT, CURRENCY, UNIT_AMOUNT, LABEL, API_VERSION, BENEFIT_IDS, CATALOG, SUPPORT_EMOTE,
  normalizeBenefits, benefitsToAdd, mergeBenefits, decideEvent, integrationId, buildCheckoutParams,
  checkoutAvailable, readWebhook, testKey,
};
