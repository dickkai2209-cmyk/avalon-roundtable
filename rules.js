'use strict';
const TEAM_SIZES = {
  5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
  11: [3, 4, 4, 5, 5], 12: [3, 4, 5, 5, 5],
};
const EVIL_COUNT = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4, 11: 4, 12: 5 };
const ROLE_SIDE = {
  merlin: 'good', percival: 'good', servant: 'good', lancelot_good: 'good',
  assassin: 'evil', morgana: 'evil', mordred: 'evil', oberon: 'evil', minion: 'evil', lancelot_evil: 'evil',
};
const ROLE_NAME = {
  merlin: '梅林', percival: '派西維爾', servant: '亞瑟的忠臣', lancelot_good: '蘭斯洛特（正）',
  assassin: '刺客', morgana: '莫甘娜', mordred: '莫德雷德', oberon: '奧伯倫', minion: '莫德雷德的爪牙', lancelot_evil: '蘭斯洛特（邪）',
};
const PRESETS = {
  5:  { good: ['merlin', 'percival', 'servant'], evil: ['morgana', 'assassin'] },
  6:  { good: ['merlin', 'percival', 'servant', 'servant'], evil: ['morgana', 'assassin'] },
  7:  { good: ['merlin', 'percival', 'servant', 'servant'], evil: ['morgana', 'assassin', 'minion'] },
  8:  { good: ['merlin', 'percival', 'servant', 'servant', 'servant'], evil: ['morgana', 'assassin', 'minion'] },
  9:  { good: ['merlin', 'percival', 'servant', 'servant', 'servant', 'servant'], evil: ['morgana', 'assassin', 'minion'] },
  10: { good: ['merlin', 'percival', 'servant', 'servant', 'servant', 'servant'], evil: ['mordred', 'morgana', 'assassin', 'oberon'] },
  11: { good: ['merlin', 'percival', 'lancelot_good', 'servant', 'servant', 'servant', 'servant'], evil: ['mordred', 'morgana', 'assassin', 'lancelot_evil'] },
  12: { good: ['merlin', 'percival', 'lancelot_good', 'servant', 'servant', 'servant', 'servant', 'servant'], evil: ['mordred', 'morgana', 'assassin', 'lancelot_evil', 'oberon'] },
};

function defaultSettings(n) {
  return { lady: n >= 8, excalibur: false, lancelot: n >= 11, veto: false, mic: false, advanced: false,
    percival: true, morgana: true, mordred: n >= 10, oberon: n >= 10 };
}

// Each seated player faces the table centre. Seat 1 is index 0 at the top and
// seats increase clockwise, so that player's right hand points screen-left,
// toward the previous physical seat (seat 10 when there are 10 seats). The
// same inward-facing right hand is counterclockwise for every seat. Speaking
// starts at the first occupied seat in that direction and continues through
// the occupied seats, leader last, each seat at most once.
const SPEAK_MS = 90 * 1000;
function speakOrder(n, leaderIndex, present) {
  const order = [];
  for (let step = 1; step <= n; step++) {
    const idx = (leaderIndex - (step % n) + n) % n;
    if (present && !present[idx]) continue;
    order.push(idx);
  }
  return order;
}

function presetRoles(n, settings = {}) {
  let p = PRESETS[n] || PRESETS[8];
  let good = p.good.slice(), evil = p.evil.slice();
  if (n >= 11 && settings.lancelot === false) {
    good = good.map(r => r === 'lancelot_good' ? 'servant' : r);
    evil = evil.map(r => r === 'lancelot_evil' ? 'minion' : r);
  }
  if (settings.advanced) {
    // rebuild from toggles, keeping merlin+assassin, fill servants/minions
    good = ['merlin']; if (settings.percival !== false) good.push('percival');
    if (settings.lancelot && n >= 7) good.push('lancelot_good');
    evil = ['assassin'];
    if (settings.morgana !== false) evil.push('morgana');
    if (settings.mordred) evil.push('mordred');
    if (settings.oberon) evil.push('oberon');
    if (settings.lancelot && n >= 7) evil.push('lancelot_evil');
    const needE = EVIL_COUNT[n], needG = n - needE;
    if (evil.length > needE || good.length > needG) return { good, evil, overflow: true };
    while (evil.length < needE) evil.push('minion');
    while (good.length < needG) good.push('servant');
  }
  return { good, evil, overflow: false };
}

function currentSide(role, switched) {
  if (!switched) return ROLE_SIDE[role];
  if (role === 'lancelot_good') return 'evil';
  if (role === 'lancelot_evil') return 'good';
  return ROLE_SIDE[role];
}

function canPlayFail(role, switched) {
  const side = currentSide(role, switched);
  if (side === 'evil') return true;
  // The "Good Lancelot" character may play fail even while good
  if (role === 'lancelot_good' && !switched) return true;
  return false;
}

function needTwoFails(n, round) { return n >= 7 && round === 3; }

// Pregame role avoidance. `avoids[i]` is a role key or null, aligned with `roles`.
// Status:
//   none        — no choice
//   inactive    — chosen role is not in this deal (no effect)
//   applied     — player did not receive the chosen role
//   conflict    — the choice could not be honoured; player still has that role
// The returned assignment is always a permutation of `roles`.
function resolveAvoidance(avoids, roles) {
  const n = roles.length;
  const assign = roles.slice();
  const result = avoids.map(role => ({ role: role || null, status: role ? 'pending' : 'none' }));
  for (let i = 0; i < n; i++) {
    if (avoids[i] && !roles.includes(avoids[i])) result[i].status = 'inactive';
  }
  const active = i => !!(avoids[i] && result[i].status !== 'inactive');
  const violates = (i, role) => active(i) && role === avoids[i];
  let guard = n * n + 2;
  let moved = true;
  while (moved && guard--) {
    moved = false;
    for (let i = 0; i < n; i++) {
      if (!active(i) || assign[i] !== avoids[i]) continue;
      for (let j = 0; j < n; j++) {
        if (j === i || assign[j] === avoids[i] || violates(j, assign[i])) continue;
        const tmp = assign[i]; assign[i] = assign[j]; assign[j] = tmp;
        moved = true;
        break;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (!active(i)) continue;
    result[i].status = assign[i] === avoids[i] ? 'conflict' : 'applied';
  }
  return { assign, result };
}

function knowledge(seats, seat, switched) {
  // Use ORIGINAL roles (not switched sides) so mid-game swap doesn't rewrite opening info
  const role = seat.role; const out = [];
  for (const o of seats) {
    if (o.pid === seat.pid) continue;
    const os = ROLE_SIDE[o.role];
    if (role === 'merlin' && os === 'evil' && o.role !== 'mordred') out.push({ id: o.id, label: '壞人' });
    else if (role === 'percival' && (o.role === 'merlin' || o.role === 'morgana')) out.push({ id: o.id, label: '梅林或莫甘娜' });
    else if ((role === 'lancelot_good' || role === 'lancelot_evil') && (o.role === 'lancelot_good' || o.role === 'lancelot_evil'))
      out.push({ id: o.id, label: '蘭斯洛特' });
    else if (ROLE_SIDE[role] === 'evil' && role !== 'oberon' && os === 'evil' && o.role !== 'oberon')
      out.push({ id: o.id, label: '壞人同伴' });
  }
  return out;
}

module.exports = {
  TEAM_SIZES, EVIL_COUNT, ROLE_SIDE, ROLE_NAME, PRESETS,
  defaultSettings, presetRoles, currentSide, canPlayFail, needTwoFails, knowledge, resolveAvoidance,
  SPEAK_MS, speakOrder,
};
