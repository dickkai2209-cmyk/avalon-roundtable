/* Shared post-game 覆盤重點 builder (Node + browser). Factual events only; never invent motives. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AvalonReview = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const RN = {
    merlin: '梅林', percival: '派西維爾', servant: '忠臣', lancelot_good: '蘭斯洛特（正）',
    assassin: '刺客', morgana: '莫甘娜', mordred: '莫德雷德', oberon: '奧伯倫', minion: '爪牙', lancelot_evil: '蘭斯洛特（邪）',
  };
  const roleN = (k) => RN[k] || k || '未知身份';
  const seatsOf = (r) => r.players || r.seats || [];
  const byId = (seats, id) => seats.find(s => s && s.id === id) || null;
  const seatNo = (seats, id) => {
    const p = byId(seats, id);
    if (!p) return '?';
    if (p.seat) return p.seat;
    const i = seats.findIndex(s => s && s.id === id);
    return i >= 0 ? i + 1 : '?';
  };
  const label = (seats, id) => {
    const p = byId(seats, id);
    return p ? `${seatNo(seats, id)}號 ${p.name || '騎士'}` : '未有記錄';
  };

  function missionTerminal(quests, qi) {
    let good = 0, evil = 0;
    for (let i = 0; i <= qi; i++) {
      const q = quests[i];
      if (!q) continue;
      if (q.success) good++; else evil++;
    }
    return { good, evil, ended: good >= 3 || evil >= 3 };
  }

  function build(r) {
    const seats = seatsOf(r);
    const quests = r.quests || [];
    const rounds = r.rounds || [];
    const cards = [];
    const settings = r.settings || {};
    const ladyOn = settings.lady === true || r.ladyStartId || (r.ladyLog && r.ladyLog.length) || (Array.isArray(r.ladyUsed) && r.ladyUsed.length);

    if (settings.lady === true || ladyOn) {
      const log = r.ladyLog || [];
      const startId = r.ladyStartId || (log[0] && log[0].holder) || null;
      const startKnown = !!(r.ladyStartId || log[0]);
      const used = Array.isArray(r.ladyUsed) && r.ladyUsed.length
        ? r.ladyUsed.slice()
        : (startId ? [startId].concat(log.map(l => l.target)) : log.reduce((a, l) => a.concat([l.holder, l.target]), []));
      const uniqUsed = [];
      used.forEach(id => { if (id && !uniqUsed.includes(id)) uniqUsed.push(id); });

      const checks = [];
      for (const qi of [1, 2, 3]) { // after missions 2, 3, 4
        const q = quests[qi];
        const mission = qi + 1;
        const entry = log.find(l => l.round === qi);
        if (!q) {
          checks.push({ mission, kind: 'notplayed' });
          continue;
        }
        const term = missionTerminal(quests, qi);
        if (term.ended && !entry) {
          checks.push({ mission, kind: 'ended', good: term.good, evil: term.evil });
        } else if (entry) {
          checks.push({
            mission, kind: 'check',
            holder: entry.holder, target: entry.target,
            side: entry.side, // may be undefined on old / hidden mid-game; caller must respect postgame
          });
        } else {
          checks.push({ mission, kind: 'missing' });
        }
      }

      const chain = [];
      if (startKnown && startId) chain.push(startId);
      log.forEach(l => { if (l.target) chain.push(l.target); });

      cards.push({
        type: 'lady',
        title: '湖中仙女',
        startId: startKnown ? startId : null,
        startKnown,
        checks,
        chain,
        used: uniqUsed,
        unused: checks.filter(c => c.kind === 'ended' || c.kind === 'missing' || c.kind === 'notplayed'),
      });
    } else if (settings.lady === false) {
      cards.push({ type: 'lady', title: '湖中仙女', disabled: true });
    } else if (settings.lady == null && !(r.ladyLog && r.ladyLog.length)) {
      // old record, unknown whether lady was on and no log
      cards.push({ type: 'lady', title: '湖中仙女', unknown: true });
    }

    quests.forEach((q, qi) => {
      const props = rounds[qi] || [];
      if (!q && !props.length) return;
      props.forEach((prop, pi) => {
        const team = prop.team || [];
        const merlin = team.map(id => byId(seats, id)).find(p => p && p.role === 'merlin');
        const morgana = team.map(id => byId(seats, id)).find(p => p && p.role === 'morgana');
        const sameMM = !!(merlin && morgana);
        const isLast = pi === props.length - 1;
        const questOnThis = !!(q && prop.approved && isLast);
        cards.push({
          type: 'proposal',
          mission: qi + 1,
          attempt: prop.attempt || (pi + 1),
          approved: !!prop.approved,
          yes: prop.yes, no: prop.no,
          leader: prop.leader,
          team,
          votes: prop.votes || {},
          sameMerlinMorgana: sameMM,
          quest: questOnThis ? { success: !!q.success, fails: q.fails != null ? q.fails : null } : null,
        });
      });
      // quest happened but no proposal records (old / truncated)
      if (q && !props.length) {
        cards.push({
          type: 'proposal',
          mission: qi + 1,
          attempt: null,
          approved: true,
          leader: null,
          team: q.team || [],
          votes: null,
          sameMerlinMorgana: false,
          quest: { success: !!q.success, fails: q.fails != null ? q.fails : null },
          missingVotes: true,
        });
      }
    });

    return { version: 1, cards };
  }

  return { build, roleN, label, seatNo, byId };
});
