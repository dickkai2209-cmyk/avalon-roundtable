// New games award 3 points per completed quest. Saved breakdowns stay as written.
// The shared board order is MVP count, then exact win rate.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3497;
const DATA = '/tmp/score-rank-' + Date.now();
process.env.DATA_DIR = DATA;
process.env.DATABASE_URL = '';
process.env.PORT = String(PORT);
process.env.KEEPALIVE = '0';
process.env.PURGE_TEST_DATA = '0';
process.env.GM_EMAIL = '';
process.env.GM_USER_ID = '';

const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
fs.mkdirSync(DATA, { recursive: true });
const db = require('../db');
const { scoreGame, server } = require('../server');

function seat(id, name, role) {
  return { id, name, role };
}
function freshGame() {
  return {
    n: 5,
    winner: 'good',
    lanceSwitched: false,
    lanceLog: [],
    assassinTarget: null,
    seats: [
      seat('a', '甲', 'merlin'),
      seat('b', '乙', 'percival'),
      seat('c', '丙', 'servant'),
      seat('d', '丁', 'assassin'),
      seat('e', '戊', 'morgana'),
    ],
    quests: [
      { success: true, team: ['a', 'b'] },
      { success: true, team: ['a', 'c'] },
      { success: false, team: ['d', 'e'] },
      null,
      null,
    ],
    rounds: [
      [{ team: ['a', 'b'], approved: true, votes: { a: true, b: true, c: true, d: false, e: false } }],
      [{ team: ['a', 'c'], approved: true, votes: { a: true, b: true, c: true, d: false, e: false } }],
      [{ team: ['d', 'e'], approved: true, votes: { a: false, b: false, c: false, d: true, e: true } }],
      [],
      [],
    ],
  };
}
function item(scores, id, label) {
  return scores[id].items.find(it => it[0] === label || String(it[0]).startsWith(label));
}

function ready() {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not listen')), 8000);
    const ping = () => {
      const req = http.get('http://127.0.0.1:' + PORT + '/healthz', res => {
        res.resume();
        clearTimeout(t);
        resolve();
      });
      req.on('error', () => setTimeout(ping, 40));
    };
    ping();
  });
}

(async () => {
  const scored = scoreGame(freshGame());
  const two = item(scored.scores, 'a', '完成任務');
  const one = item(scored.scores, 'd', '完成任務');
  assert(two && two[0] === '完成任務 ×2' && two[1] === 6, 'two qualifying quests on a new game award 6');
  assert(one && one[0] === '完成任務 ×1' && one[1] === 3, 'one qualifying quest on a new game awards 3');
  assert(!item(scored.scores, 'b', '完成任務') || item(scored.scores, 'b', '完成任務')[0] === '完成任務 ×1', 'a player only scores quests they actually joined');
  assert(item(scored.scores, 'b', '完成任務')[1] === 3, 'the single joined quest is still 3 points');
  assert(!item(scored.scores, 'e', '完成任務') || item(scored.scores, 'e', '完成任務')[0] !== '完成任務 ×2', 'an evil player does not score a successful quest');
  const evilQuest = item(scored.scores, 'e', '完成任務');
  assert(evilQuest && evilQuest[0] === '完成任務 ×1' && evilQuest[1] === 3, 'the failed quest the evil player joined is 3 points');
  assert(item(scored.scores, 'a', '勝利')[1] === 12, 'a win stays at 12');
  assert(item(scored.scores, 'a', '正確投票')[0] === '正確投票 ×3' && item(scored.scores, 'a', '正確投票')[1] === 6, 'correct votes stay at 2 points each');
  assert(!scored.scores.a.items.some(it => String(it[0]).includes('人局')), 'a 5 player game still has no headcount bonus');
  const bigger = freshGame();
  bigger.n = 8;
  assert(item(scoreGame(bigger).scores, 'a', '8 人局加成')[1] === 3, 'the headcount bonus stays n-5');
  const stabbed = freshGame();
  stabbed.winner = 'evil';
  stabbed.assassinTarget = 'a';
  assert(item(scoreGame(stabbed).scores, 'd', '一擊刺中梅林')[1] === 5, 'hitting Merlin stays at 5');
  const hidden = freshGame();
  hidden.assassinTarget = 'c';
  assert(item(scoreGame(hidden).scores, 'a', '梅林成功隱藏')[1] === 5, 'Merlin hiding stays at 5');
  assert(scored.mvp === 'a' && scored.scores.a.rank === 1, 'the new game MVP is still the highest total score');
  assert(scored.scores.a.total === 24, 'the new total adds the 6 quest points instead of 2');

  await ready();
  const user = await db.createGuest({ guestKey: 'histquestkey01', name: '舊局' });
  const oldScores = { a: { total: 14, items: [['勝利', 12], ['完成任務 ×2', 2]], rank: 1 } };
  const rec = {
    gid: 'hist-quest-1', room: 'HIST', startedAt: 1, endedAt: 2, n: 5, winner: 'good', reason: 'old',
    players: [{ id: 'a', name: '舊局', role: 'merlin', side: 'good' }],
    pids: [user.id], mvpPid: user.id, scores: oldScores, mvp: 'a', runnerUp: null, highlights: [],
  };
  await db.saveGame(rec);
  await db.saveGame({ ...rec, scores: { a: { total: 18, items: [['勝利', 12], ['完成任務 ×2', 6]], rank: 1 } } });
  db.flush();
  const loaded = await db.getGame('hist-quest-1');
  assert(loaded.scores.a.items[1][0] === '完成任務 ×2' && loaded.scores.a.items[1][1] === 2, 'a saved quest line stays at 1 point each');
  assert(JSON.stringify(loaded.scores) === JSON.stringify(oldScores), 'saving the same game again does not rewrite the breakdown');
  const onDisk = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
  assert(onDisk.games.find(g => g.gid === 'hist-quest-1').scores.a.items[1][1] === 2, 'the json copy keeps the historical 2 points');
  const body = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + PORT + '/api/game/hist-quest-1', res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
  assert(body.scores.a.items[1][1] === 2, 'reading an old game does not rescore the quest line');

  const whale = { id: 'm', played: 5, won: 1, mvp: 5 };
  const king = { id: 'r', played: 10, won: 9, mvp: 0 };
  const tiedHi = { id: 'a', played: 2, won: 2, mvp: 2 };
  const tiedLo = { id: 'b', played: 10, won: 2, mvp: 2 };
  const moreGames = { id: 'c', played: 4, won: 2, mvp: 1 };
  const fewerGames = { id: 'd', played: 2, won: 1, mvp: 1 };
  const idA = { id: 'aa', played: 4, won: 2, mvp: 1 };
  const idB = { id: 'bb', played: 4, won: 2, mvp: 1 };
  assert(db.cmpBoard(whale, king) < 0, 'cmpBoard puts more MVP before a higher win rate');
  assert(db.cmpBoard(king, whale) > 0, 'cmpBoard is the reverse when the higher win rate has fewer MVP');
  assert(db.cmpBoard(tiedHi, tiedLo) < 0, 'equal MVP keeps the win-rate cross-multiply');
  assert(db.cmpBoard(moreGames, fewerGames) < 0, 'equal MVP and rate still ranks more games first');
  assert(db.cmpBoard(idA, idB) < 0 && db.cmpBoard(idB, idA) > 0, 'the last tie still breaks by id');
  const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  const fn = dbSrc.slice(dbSrc.indexOf('async function boardRows'), dbSrc.indexOf('async function boardStanding'));
  assert((fn.match(/rows\.sort\(cmpBoard\)/g) || []).length === 1, 'postgres and json rows share one cmpBoard sort');
  assert(!/ORDER BY/i.test(fn), 'the board query does not sort ahead of cmpBoard');

  console.log('SCORE RANK TESTS PASSED');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
}).finally(() => {
  server.close();
  setTimeout(() => process.exit(process.exitCode || 0), 30);
});
