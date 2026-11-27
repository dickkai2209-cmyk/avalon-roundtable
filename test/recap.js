// Post-game 湖中仙女 avatar chain and the compact vote grid.
// Camp colors are a finished-game fact. Mid-game history must not grow them.
const fs = require('fs');
const path = require('path');
const { build, ladyRecapHtml, voteRecapHtml } = require('../review');

const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const face = (p) => `<img class="lady-face" data-id="${p.id}" alt="">`;

const ROLES = ['servant', 'minion', 'percival', 'assassin', 'morgana', 'servant', 'mordred', 'servant', 'servant', 'merlin'];
const SIDE = { servant: 'good', percival: 'good', merlin: 'good', minion: 'evil', assassin: 'evil', morgana: 'evil', mordred: 'evil' };

function players(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: 'p' + (i + 1),
    name: ['匪徒2餅', 'Howard', 'iFo', 'Akito', 'Dickson', 'kk', 'Wson', 'Serena', '騎士', 'Ryan'][i] || ('騎士' + (i + 1)),
    seat: i + 1,
    avatar: ['fox', 'bunny', 'cat', 'panda', 'hedgehog', 'bear', 'otter', 'shiba', 'koala', 'duck'][i] || 'fox',
    bg: '#ffffff',
    pendant: 'none',
    role: ROLES[i] || 'servant',
    side: SIDE[ROLES[i] || 'servant'],
  }));
}

function votes(list, yes) {
  const v = {};
  list.forEach(p => { v[p.id] = yes.includes(p.id); });
  return v;
}

function story(opts) {
  const n = opts.n || 10;
  const list = players(n);
  const id = (seat) => list[seat - 1].id;
  const rounds = opts.rounds || [
    [
      { leader: id(6), team: [id(5), id(6), id(7)], votes: votes(list, [id(1), id(5), id(6), id(7), id(10)]), approved: false, yes: 5, no: n - 5, attempt: 1 },
      { leader: id(7), team: [id(1), id(7), id(10)], votes: votes(list, list.map(p => p.id)), approved: true, yes: n, no: 0, attempt: 2 },
    ],
    [
      { leader: id(8), team: [id(2), id(4), id(8), id(9)], votes: votes(list, list.filter(p => p.side === 'good').map(p => p.id)), approved: true, yes: 6, no: n - 6, attempt: 1 },
    ],
    [
      { leader: id(9), team: [id(1), id(3), id(9), id(10)], votes: votes(list, [id(1), id(3), id(6), id(8), id(9), id(10)]), approved: false, yes: 6, no: n - 6, attempt: 1 },
      { leader: id(10), team: [id(3), id(6), id(8), id(10)], votes: votes(list, list.map(p => p.id)), approved: true, yes: n, no: 0, attempt: 2 },
    ],
    [
      { leader: id(1), team: [id(1), id(3), id(5), id(6), id(10)], votes: votes(list, [id(2), id(4), id(5), id(7)]), approved: false, yes: 4, no: n - 4, attempt: 1 },
      { leader: id(2), team: [id(1), id(6), id(8), id(9), id(10)], votes: votes(list, list.map(p => p.id)), approved: true, yes: n, no: 0, attempt: 2 },
    ],
  ];
  return {
    players: list,
    settings: { lady: true },
    quests: opts.quests,
    rounds: opts.rounds ? rounds.slice(0, opts.rounds.length) : rounds,
    ladyStartId: opts.ladyStartId === undefined ? id(2) : opts.ladyStartId,
    ladyLog: opts.ladyLog === undefined ? [
      { round: 1, holder: id(2), target: id(10), side: 'evil' },
      { round: 2, holder: id(10), target: id(5), side: 'evil' },
    ] : opts.ladyLog,
    ladyUsed: opts.ladyUsed,
    winner: 'good',
  };
}

function ladyOf(record) {
  const card = build(record).cards.find(c => c.type === 'lady');
  return { card, html: ladyRecapHtml(card, record.players, face), props: build(record).cards.filter(c => c.type === 'proposal') };
}

const simplified = /号|张|没用|反对|蓝方|红方|进行中|组队/;

const screenshot = story({
  quests: [
    { success: true, fails: 0 },
    { success: false, fails: 1 },
    { success: true, fails: 0 },
    { success: true, fails: 0 },
  ],
});
const shot = ladyOf(screenshot);
assert(shot.card.unused.length === 1 && shot.card.unused[0].mission === 4, 'mission 4 with no inspection is the one unused use');
assert(shot.html.includes('lady-pass') && (shot.html.match(/lady-node/g) || []).length === 3, 'three-holder avatar chain');
assert(shot.html.includes('data-seat="2"') && shot.html.includes('data-seat="10"') && shot.html.includes('data-seat="5"'), 'chain uses this game\'s seats');
assert(shot.html.includes('2號') && shot.html.includes('10號') && shot.html.includes('5號'), 'seat numbers use 號');
assert(shot.html.includes('開局持有') && shot.html.includes('2號驗') && shot.html.includes('10號驗'), 'captions name the pass');
assert(shot.html.includes('任務 2 後') && shot.html.includes('任務 3 後'), 'segment labels');
assert(shot.html.includes('沒用的 1次'), 'unused count');
assert(shot.html.includes('第 4 個任務結束後已分出勝負或進入刺殺，沒有查驗。'), 'unused note names the skipped mission');
assert(shot.html.includes('當過湖仙的不能再被查驗：2、10、5號'), 'footer lists holders once');
assert(shot.html.includes('data-id="p2"') && shot.html.includes('data-id="p10"') && shot.html.includes('data-id="p5"'), 'avatars are the holders');
assert(!/[好壞]|陣營|查驗同傳遞|起始持有者/.test(shot.html), 'chain drops the prose and does not print alignment');
assert(!simplified.test(shot.html), 'lady copy stays Traditional');
assert(!shot.html.includes('evil') && !shot.html.includes('good'), 'lady html does not leak the stored side');

const early = story({
  quests: [
    { success: true, fails: 0 },
    { success: true, fails: 0 },
    { success: true, fails: 0 },
    null,
  ],
  ladyLog: [{ round: 1, holder: 'p2', target: 'p10', side: 'good' }],
});
const earlyHtml = ladyOf(early).html;
assert(earlyHtml.includes('沒用的 1次') && !earlyHtml.includes('沒用的 2次'), 'a mission that never happened is not an unused use');
assert(earlyHtml.includes('第 3 個任務結束後') && !earlyHtml.includes('第 4 個任務結束後'), 'the note is only the skipped inspection');

const full = story({
  quests: [
    { success: true, fails: 0 },
    { success: false, fails: 1 },
    { success: true, fails: 0 },
    { success: false, fails: 2 },
    { success: true, fails: 0 },
  ],
  ladyLog: [
    { round: 1, holder: 'p2', target: 'p10', side: 'evil' },
    { round: 2, holder: 'p10', target: 'p5', side: 'evil' },
    { round: 3, holder: 'p5', target: 'p8', side: 'good' },
  ],
});
const fullHtml = ladyOf(full).html;
assert((fullHtml.match(/lady-node/g) || []).length === 4, 'three inspections make a four-holder chain');
assert(!fullHtml.includes('沒用的'), 'unused line hides when every played inspection happened');
assert(fullHtml.includes('當過湖仙的不能再被查驗：2、10、5、8號'), 'footer follows the real holders');
assert(!/[好壞]/.test(fullHtml), 'a full chain still has no alignment mark');

const grid = voteRecapHtml(shot.props, screenshot.players, { reveal: true });
assert(grid.includes('藍方隊員') && grid.includes('紅方隊員') && grid.includes('隊長') && grid.includes('同意') && grid.includes('反對'), 'post-game legend');
assert(grid.includes('vkey good') && !/class="sw/.test(grid), 'legend marks are not the room toggle');
assert(grid.includes('第 4 個任務') && grid.includes('5 人') && grid.includes('需 2 張失敗'), 'mission 4 shows size and the two-fail rule');
assert(grid.includes('失敗 · 1 張失敗') && grid.includes('成功'), 'fail count and success both render');
assert(grid.includes('通過') && grid.includes('否決'), 'passed and rejected rows');
assert(grid.indexOf('第 4 個任務') < grid.indexOf('第 1 個任務'), 'latest mission is first');
const rowAt = grid.indexOf('<div class="vrec-row"');
const firstRow = grid.slice(rowAt, grid.indexOf('</div>', rowAt));
assert((firstRow.match(/vrec-cell/g) || []).length === 10, 'a row has one cell per seated player');
assert(grid.includes('data-camp="good"') && grid.includes('data-camp="evil"'), 'team circles use post-game camps');
assert(grid.includes('class="crown"'), 'the leader keeps a crown');
assert(!grid.includes('rev-v') && !grid.includes('贊成') && !grid.includes('梅林') && !grid.includes('忠臣'), 'the prose list and role names are gone');
assert(!simplified.test(grid), 'vote copy stays Traditional');
assert(!grid.includes('>11<') && !grid.includes('data-seat="11"'), 'no fake eleventh seat');

const hidden = voteRecapHtml(shot.props, screenshot.players, { reveal: false });
assert(!/藍方|紅方|data-camp|dot good|dot evil|梅林|刺客|忠臣/.test(hidden), 'hiding camp removes colors and roles');
assert(hidden.includes('隊員') && hidden.includes('同意') && hidden.includes('反對') && hidden.includes('通過') && hidden.includes('否決'), 'a hidden grid still shows votes, leader and result');
assert(hidden.includes('class="dot"'), 'team members stay marked without a camp color');

const small = story({
  n: 5,
  quests: [{ success: false, fails: 1 }, null, null, null, null],
  rounds: [[{ leader: 'p1', team: ['p1', 'p2'], votes: votes(players(5), ['p1', 'p2', 'p3']), approved: true, yes: 3, no: 2, attempt: 1 }]],
  ladyLog: [],
  ladyStartId: 'p1',
});
const smallGrid = voteRecapHtml(ladyOf(small).props, small.players, { reveal: true });
assert((smallGrid.match(/vrec-cell/g) || []).length === 5, 'a 5-player room renders five cells');
assert(!smallGrid.includes('需 2 張失敗'), 'five players do not get the two-fail line');

const live = voteRecapHtml([
  { type: 'proposal', mission: 4, attempt: 1, approved: null, leader: 'p1', team: ['p1'], votes: null },
], players(8), { reveal: true });
assert(live.includes('進行中') && live.includes('組隊中') && live.includes('需 2 張失敗'), 'an open nomination can say it is still being picked');
assert(live.includes('data-camp="good"'), 'post-game open row may color a known team seat');

const liveHidden = voteRecapHtml([
  { type: 'proposal', mission: 2, attempt: 1, approved: false, leader: 'p2', team: ['p2', 'p4'], votes: { p1: true, p2: false }, attemptOk: true },
], players(8).map(p => ({ ...p, role: undefined, side: undefined })), { reveal: false });
assert(!/藍方|紅方|dot good|dot evil|data-camp/.test(liveHidden), 'mid-game shaped row has no camp');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const hist = app.slice(app.indexOf('function teamHistoryHtml'), app.indexOf('function voteGrid'));
assert(!/藍方|紅方|data-camp/.test(hist), 'live below-table history does not learn camp colors');
assert(hist.includes('同意') && hist.includes('反對'), 'live history keeps public vote colors');
const chainFn = app.slice(app.indexOf('function ladyChainHtml'), app.indexOf('function reviewOf'));
assert(chainFn.includes('reveal && l.side'), 'mid-game public lady row still gates alignment on reveal');
assert(app.includes('ladyRecapHtml') && app.includes('voteRecapHtml') && !app.includes('查驗同傳遞'), 'the recap uses the chain and grid');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
assert(html.includes('style.css?v=66') && html.includes('app.js?v=74') && html.includes('review.js?v=2') && html.includes('voice.js?v=5'), 'cache versions bumped only for changed assets');

console.log('RECAP TESTS PASSED');
