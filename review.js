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
        // Only a mission that was played and then ended before the inspection.
        // A mission that never happened, or a missing log, is not an unused use.
        unused: checks.filter(c => c.kind === 'ended'),
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

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SIDE = {
    merlin: 'good', percival: 'good', servant: 'good', lancelot_good: 'good',
    assassin: 'evil', morgana: 'evil', mordred: 'evil', oberon: 'evil', minion: 'evil', lancelot_evil: 'evil',
  };
  const LADY_MARK = '<svg class="lady-ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="6.2" r="3.15" fill="#1aa7a8"/><circle cx="17.8" cy="12" r="3.15" fill="#1aa7a8"/><circle cx="12" cy="17.8" r="3.15" fill="#1aa7a8"/><circle cx="6.2" cy="12" r="3.15" fill="#1aa7a8"/><circle cx="12" cy="12" r="2.15" fill="#d7f6f4"/></svg>';

  function campOf(p, reveal) {
    if (!reveal || !p) return '';
    if (p.side === 'good' || p.side === 'evil') return p.side;
    return SIDE[p.role] || '';
  }

  function ladyTitle() {
    return `<span class="lady-title">${LADY_MARK}<b>湖中仙女</b></span>`;
  }

  // Post-game avatar chain. Alignment is intentionally omitted: the faces stay clear,
  // and mid-game callers must not render this card at all.
  function ladyRecapHtml(card, seats, renderAv) {
    if (!card || card.type !== 'lady') return '';
    if (card.disabled) return '<article class="rev-card"><h4><span class="rev-k">湖中仙女</span> 本局未開啟</h4></article>';
    if (card.unknown) return '<article class="rev-card"><h4><span class="rev-k">湖中仙女</span></h4><p class="rev-miss">舊記錄未保存是否開啟湖中仙女，未有記錄。</p></article>';
    const list = seats || [];
    const checks = card.checks || [];
    const passed = checks.filter(c => c.kind === 'check');
    const ended = checks.filter(c => c.kind === 'ended');
    const chain = (card.chain || []).slice();
    const face = (id) => {
      const p = byId(list, id) || { id, name: '騎士', avatar: 'fox', bg: '#fff', pendant: 'none' };
      return typeof renderAv === 'function' ? renderAv(p, 64) : '<span class="av" style="width:64px;height:64px"></span>';
    };
    let head = `<div class="lady-head">${ladyTitle()}</div>`;
    if (ended.length) {
      const notes = ended.map(c => `<p class="lady-note">第 ${c.mission} 個任務結束後已分出勝負或進入刺殺，沒有查驗。</p>`).join('');
      head = `<details class="lady-fold"><summary class="lady-head">${ladyTitle()}<span class="lady-count">沒用的 ${ended.length}次<i class="lady-chev" aria-hidden="true"></i></span></summary>${notes}</details>`;
    }
    if (!chain.length) {
      return `<article class="rev-card lady-recap">${head}<p class="rev-miss">未有傳遞記錄。</p></article>`;
    }
    const bits = [];
    chain.forEach((id, i) => {
      const prev = i > 0 ? passed[i - 1] : null;
      if (prev) bits.push(`<div class="lady-seg"><span>任務 ${prev.mission} 後</span><i></i></div>`);
      const cap = i === 0 ? '開局持有' : `${seatNo(list, prev && prev.holder)}號驗`;
      const no = seatNo(list, id);
      bits.push(`<div class="lady-node" data-seat="${esc(no)}" role="listitem">${face(id)}<b class="lady-no">${esc(no)}號</b><span class="lady-cap">${cap}</span></div>`);
    });
    const usedNums = (card.used || []).map(id => seatNo(list, id)).filter(n => n !== '?');
    const foot = usedNums.length ? `<p class="lady-foot">當過湖仙的不能再被查驗：${usedNums.join('、')}號</p>` : '<p class="lady-foot rev-miss">曾持有名單：未有記錄</p>';
    return `<article class="rev-card lady-recap">${head}<div class="lady-pass" role="list">${bits.join('')}</div>${foot}</article>`;
  }

  function voteRecapHtml(proposals, seats, opts) {
    const rows = (proposals || []).filter(c => c && c.type === 'proposal');
    if (!rows.length) return '';
    const reveal = !opts || opts.reveal !== false;
    const list = (seats || []).slice().sort((a, b) => (a.seat || 0) - (b.seat || 0));
    const n = list.length;
    const byMission = new Map();
    rows.forEach(p => {
      const m = p.mission || 0;
      if (!byMission.has(m)) byMission.set(m, []);
      byMission.get(m).push(p);
    });
    const missions = [...byMission.keys()].sort((a, b) => b - a);
    const legend = reveal
      ? `<div class="vrec-leg"><span><i class="vkey good"></i>藍方隊員</span><span><i class="vkey evil"></i>紅方隊員</span><span><i class="vkey crown">👑</i>隊長</span><span><i class="vkey yes"></i>同意</span><span><i class="vkey no"></i>反對</span></div>`
      : `<div class="vrec-leg"><span><i class="vkey mem"></i>隊員</span><span><i class="vkey crown">👑</i>隊長</span><span><i class="vkey yes"></i>同意</span><span><i class="vkey no"></i>反對</span></div>`;
    const blocks = missions.map(m => {
      const props = byMission.get(m).slice().sort((a, b) => (a.attempt || 0) - (b.attempt || 0));
      const sized = props.find(p => p.team && p.team.length);
      const size = sized ? sized.team.length : 0;
      const two = n >= 7 && m === 4;
      const quest = (props.find(p => p.quest) || {}).quest;
      let badge = '<em class="go">進行中</em>';
      if (quest) badge = quest.success ? '<em class="ok">成功</em>' : `<em class="bad">失敗 · ${quest.fails == null ? '?' : quest.fails} 張失敗</em>`;
      const meta = `${size ? size + ' 人' : ''}${two ? (size ? ' · ' : '') + '需 2 張失敗' : ''}`;
      const lines = props.map(p => {
        const cells = list.map(s => {
          const on = (p.team || []).includes(s.id);
          const leader = p.leader === s.id;
          const v = p.votes ? p.votes[s.id] : undefined;
          const tone = v === true ? 'yes' : v === false ? 'no' : 'unk';
          const camp = on ? campOf(s, reveal) : '';
          const num = esc(s.seat || '?');
          const inner = on ? `<b class="dot${camp ? ' ' + camp : ''}">${num}</b>` : `<b>${num}</b>`;
          return `<span class="vrec-cell ${tone}${leader ? ' ld' : ''}" data-seat="${num}"${camp ? ` data-camp="${camp}"` : ''} data-vote="${tone}">${leader ? '<i class="crown" aria-hidden="true">👑</i>' : ''}${inner}</span>`;
        }).join('');
        const res = p.approved === true ? '<span class="vrec-res ok">通過</span>' : p.approved === false ? '<span class="vrec-res bad">否決</span>' : '<span class="vrec-res go">組隊中</span>';
        const attempt = p.attempt ? `第${p.attempt}次` : '提名';
        return `<div class="vrec-row" style="--n:${n}"><span class="vrec-try">${attempt}</span><span class="vrec-seats">${cells}</span>${res}</div>`;
      }).join('');
      return `<section class="vrec-mis" data-mission="${m}"><div class="vrec-mh"><b>第 ${m} 個任務</b>${meta ? `<span class="meta">${meta}</span>` : ''}${badge}</div><div class="vrec-scroll">${lines}</div></section>`;
    }).join('');
    return `<article class="rev-card vrec">${legend}${blocks}</article>`;
  }

  return { build, roleN, label, seatNo, byId, ladyRecapHtml, voteRecapHtml, campOf };
});
