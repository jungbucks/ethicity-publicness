/* 공정성·포용 개편(2026-11-10) 계획 화면 조각: 청원 카드(3단계)·무임 정책 카드(4단계)·'AI가 본 자료' 줄·출발 전 선택 안내.
 * 저장은 PB.Choices(petitionReply·elderPolicy). 입력은 다시 그리지 않고 바로 저장하고, 고르기만 hooks.rerender(포커스 선택자)로 다시 그린다.
 * hooks = { rerender(sel), nudge: 이유 안내를 보일 kind('petition'|'elder'|null), onWhy(kind) } */
(function (root) {
  'use strict';
  var PB = root.PB = root.PB || {}, UI = PB.UI = PB.UI || {};
  var LABELS = {
    petition: { id: 'petition', values: { reflect: '반영한다', 'not-now': '이번엔 못 한다' }, ids: { reflect: 'petition-reflect', 'not-now': 'petition-not-now' }, need: '청원에 답을 골라야 출발할 수 있어요.' },
    elder: { id: 'elder', values: { keep: '유지한다', abolish: '폐지한다' }, ids: { keep: 'elder-keep', abolish: 'elder-abolish' }, need: '무임승차 유지·폐지를 골라야 출발할 수 있어요.' }
  };
  function field(s, kind) { return PB.Choices.get(s, kind) || {}; } /* 2026-11-12: 사건 청원 답은 s.petitionReplies[단계] — Choices.get이 지금 단계 답을 고른다 */
  function options(App, s, kind, hooks, legend) {
    var L = LABELS[kind], cur = field(s, kind).choice, box = App.el('div', { 'class': 'fair-options', role: 'group', 'aria-label': legend });
    PB.Choices.KINDS[kind].values.forEach(function (v) {
      var b = App.el('button', { type: 'button', id: L.ids[v], 'class': 'btn fair-option', 'data-choice': v, 'aria-pressed': String(cur === v) }, L.values[v]);
      b.addEventListener('click', function () { PB.Choices.set(s, kind, 'choice', v); App.save(); hooks.rerender('#' + L.ids[v]); });
      box.appendChild(b);
    });
    return box;
  }
  function whyLine(App, s, kind, hooks) {
    var id = LABELS[kind].id, p = App.el('p', { 'class': 'fair-why' }), status = App.el('span', { id: id + '-saved', 'class': 'note note-saved', role: 'status' }),
      inp = App.el('input', { type: 'text', id: id + '-why', 'class': 'note-blank note-reason', maxlength: '200', autocomplete: 'off', 'aria-label': '그렇게 고른 까닭', placeholder: '짧게' });
    inp.value = field(s, kind).why || '';
    inp.addEventListener('input', function () {
      PB.Choices.set(s, kind, 'why', inp.value); status.textContent = App.savedText(App.save());
      var n = document.getElementById('why-nudge'); if (n) n.remove();
    });
    /* 2026-11-11 플레이테스트 12: ‘왜냐하면’은 줄바꿈 없이 한 덩어리, 입력 칸 뒤 마침표는 뺀다(좁은 칸에서 ‘왜냐하 / 면’, 마침표만 따로 떨어지던 것) */
    p.appendChild(App.el('span', { 'class': 'fair-why-label' }, '왜냐하면')); p.appendChild(inp);
    var wrap = document.createDocumentFragment(); wrap.appendChild(p);
    if (hooks.nudge === kind) wrap.appendChild(App.el('p', { id: 'why-nudge', 'class': 'note', role: 'status' }, '이유를 한 줄 적어 볼까요? 비워 두고 다시 누르면 그대로 출발해요.'));
    /* 2026-11-11 플레이테스트 3: ‘…골라야 출발할 수 있어요’ 줄은 카드 맨 아래 한 줄(저장 상태와 같은 줄) 안에 둔다 — 따로 떨어진 줄이 넓은 화면 격자에 새 줄을 만들어
     * 노선 탭을 지도 밑으로 밀던 것. 이 줄은 늘 한 줄 높이를 차지하므로(css .fair-foot) 고르기 전후로 카드 높이가 바뀌지 않는다 */
    var foot = App.el('div', { 'class': 'fair-foot' }), req = required(App, s);
    if (req) foot.appendChild(req); foot.appendChild(status); wrap.appendChild(foot);
    return wrap;
  }
  function shell(App, id, title) {
    var c = App.el('section', { id: id, 'class': 'fair-card', 'aria-labelledby': id + '-h' });
    c.appendChild(App.el('h3', { id: id + '-h' }, title)); return c;
  }
  function petitionCard(App, s, hooks) {
    var fp = PB.Choices.petitionFor(s, s.phase); hooks = hooks || {};
    if (!fp) return null; /* 2026-11-12 랜덤 검토 4번: 고정 청원(2단계 → 3단계 답)과 사건 청원(생긴 다음 단계에 답)을 같은 카드로 */
    var zone = App.nodeName(fp.zone), c = shell(App, 'petition-card', zone + ' 주민 청원');
    c.appendChild(App.el('p', { id: 'petition-text', 'class': 'fair-fact' }, App.clock(fp.t) + ' ' + zone + ' 주민 청원: 그때까지 요청 ' + fp.total + '건 중 ' + fp.count + '건이 아직 도착하지 못했어요.'));
    c.appendChild(App.el('p', { 'class': 'fair-frame' }, zone + ' 주민의 청원을'));
    c.appendChild(options(App, s, 'petition', hooks, zone + ' 주민의 청원에 대한 답'));
    c.appendChild(whyLine(App, s, 'petition', hooks));
    return c;
  }
  var ruleOpen = false; /* 규칙 설명을 펼쳐 둔 채 유지·폐지를 눌러도(카드를 다시 그려도) 그대로 */
  function elderCard(App, s, hooks) {
    hooks = hooks || {};
    if (s.phase !== PB.Choices.KINDS.elder.phase || !(s.config && s.config.elderFree)) return null;
    var c = shell(App, 'elder-card', '어르신 무임승차를 유지할까요?'), h = s.history.filter(function (x) { return x.phase === 3; })[0];
    if (h && h.elder) c.appendChild(App.el('p', { id: 'elder-facts', 'class': 'fair-fact' }, '지난 3단계 무임 승객 ' + h.elder.free + '명 · 받지 않은 운임 ' + App.won(h.elder.unpaid)));
    c.appendChild(App.el('p', { 'class': 'note' }, '이 마을은 어르신 버스 요금이 무료예요(마을 정책).'));
    /* 2026-11-10 검토 5번: 폐지 효과는 이 게임의 가정 — 고르기 전에 한 줄(늘 보임) + 접는 규칙 설명(수치는 설정값, js/elder.js rule). 어느 쪽이 나은지는 말하지 않는다.
     * 가정 한 줄이 곧 접기 줄(summary)이다 — 카드 높이를 덜 쓰려고(넓은 화면의 오른쪽 칸은 높이가 빠듯하다) */
    var R = PB.Elder.rule(s.config, s.phase, { name: App.nodeName, won: App.won }), d = App.el('details', { id: 'elder-rule', 'class': 'fair-rule' }), sm = App.el('summary'), ul = App.el('ul');
    sm.appendChild(App.el('span', { id: 'elder-assume' }, R.assume)); sm.appendChild(document.createTextNode(' ')); sm.appendChild(App.el('span', { 'class': 'fair-rule-more' }, '규칙 보기'));
    d.open = ruleOpen; d.addEventListener('toggle', function () { ruleOpen = d.open; });
    d.appendChild(sm); R.lines.forEach(function (t) { ul.appendChild(App.el('li', null, t)); }); d.appendChild(ul); c.appendChild(d);
    c.appendChild(options(App, s, 'elder', hooks, '어르신 무임승차 정책'));
    c.appendChild(whyLine(App, s, 'elder', hooks));
    return c;
  }
  /* 'AI가 본 자료' 한 줄(AI 제안 카드 안) */
  function seenLine(App, s) {
    var v = PB.Session.aiView(s), hid = v.hidden.map(function (z) { return App.nodeName(z) + ' 0건'; }).join(' · '),
      head = s.phase === 1 ? '예전 노선의 탑승 기록' : '지난 운행 탑승 기록 ' + v.records + '건';
    return App.el('p', { id: 'rec-seen', 'class': 'note' }, 'AI가 본 자료: ' + head + (hid ? ' · ' + hid : ''));
  }
  /* 출발 전에 골라야 할 것이 남았을 때 한 줄(없으면 null). 카드가 있으면 카드 안 맨 아래 줄에 들어간다(whyLine) — 카드 없이 이 줄만 따로 쓰는 것은 예외 상황뿐 */
  function required(App, s) {
    var req = PB.Choices.required(s); if (!req.length) return null;
    return App.el('p', { id: 'choice-required', 'class': 'note fair-required', role: 'status' }, LABELS[req[0]].need);
  }

  /* 정류장 수익성(2026-11-10): 이름표 남색 3단계 + 범례 + 결과 표. 켜짐 상태는 localStorage ethicity.publicness.profit('1'/'0', 기본 끔) */
  var PKEY = 'ethicity.publicness.profit', memo = { key: '', map: null };
  function profitOn() { try { return root.localStorage.getItem(PKEY) === '1'; } catch (e) { return false; } }
  function setProfitOn(v) { try { root.localStorage.setItem(PKEY, v ? '1' : '0'); } catch (e) {} }
  /* 지도에 줄 정류장 맵: 결과 화면은 늘, 계획 화면은 토글이 켜졌을 때(예상 운행), 그 밖엔 null */
  function profitMap(s) {
    if (s.stage === 'result' && s.current && s.current.result) return PB.Metrics.stopFares(s.current.result);
    if (s.stage !== 'plan' || !profitOn()) return null;
    var key = s.mode + ':' + s.seed + ':' + s.phase + JSON.stringify(s.draft.routes) + JSON.stringify(s.draft.buses) + JSON.stringify(s.elderPolicy || null);
    if (memo.key !== key) { var run = null; try { run = PB.Session.expectedRun(s); } catch (e) {} memo = { key: key, map: run && run.result ? PB.Metrics.stopFares(run.result) : null }; }
    return memo.map;
  }
  function legend(App) {
    var p = App.el('p', { id: 'profit-legend', 'class': 'note profit-legend' });
    p.appendChild(document.createTextNode('1명당 운임: '));
    [['hi', '높음'], ['mid', '중간'], ['lo', '낮음']].forEach(function (x) { p.appendChild(App.el('span', { 'class': 'profit-chip ' + x[0] }, x[1])); p.appendChild(document.createTextNode(' ')); });
    p.appendChild(document.createTextNode('(그 정류장에서 처음 탄 승객 기준 · 무임은 이름 옆에 적어요)'));
    return p;
  }
  /* 계획 화면 토글 + (켜졌을 때) 범례 */
  function profitToggle(App, s, hooks) {
    var on = profitOn(), box = App.el('div', { id: 'profit-opt', 'class': 'profit-opt-box' }),
      lab = App.el('label', { 'class': 'profit-opt' }), cb = App.el('input', { type: 'checkbox', id: 'opt-profit' });
    cb.checked = on;
    cb.addEventListener('change', function () { setProfitOn(cb.checked); if (App.net) App.net.setOptions({ profit: profitMap(s) }); if (hooks && hooks.rerender) hooks.rerender('#opt-profit'); });
    lab.appendChild(cb); lab.appendChild(document.createTextNode('정류장별 1명당 운임 보기(예상)'));
    box.appendChild(lab); if (on) box.appendChild(legend(App));
    return box;
  }
  /* 결과 '자세히' 표: 정류장 · 탑승 · 운임 · 무임 */
  function stopTable(App, s, result) {
    var sf = PB.Metrics.stopFares(result), ids = Object.keys(sf).filter(function (k) { return sf[k].riders > 0; }).sort(function (a, b) { return sf[b].perRider - sf[a].perRider || sf[b].riders - sf[a].riders; });
    var sec = App.el('section', { id: 'stop-fares-sec', 'aria-labelledby': 'stop-fares-h' }), tb = App.el('table', { id: 'stop-fares' });
    sec.appendChild(App.el('h3', { id: 'stop-fares-h' }, '정류장별 처음 탄 승객'));
    var tr = App.el('tr'); ['정류장', '탑승', '운임', '무임'].forEach(function (h) { tr.appendChild(App.el('th', { scope: 'col' }, h)); });
    tb.appendChild(App.el('thead')).appendChild(tr); var body = App.el('tbody'); tb.appendChild(body);
    ids.forEach(function (k) { var r = sf[k], row = App.el('tr', { 'data-node': k, 'data-tier': r.tier || '' });
      [App.nodeName(k), r.riders + '명', App.won(r.fare), r.free + '명'].forEach(function (c, i) { row.appendChild(App.el(i ? 'td' : 'th', i ? null : { scope: 'row' }, c)); }); body.appendChild(row); });
    sec.appendChild(tb);
    sec.appendChild(App.el('p', { 'class': 'note' }, '무임은 요금을 내지 않는 어르신 승객이에요. 정류장은 승객이 처음 버스를 탄 곳으로 셌어요.'));
    return sec;
  }
  /* 결과 화면 묶음(2026-11-10): 청원 확인(3단계) · 무임 정책 결과(4단계~) · 'AI가 본 이동' 차이. 평가·칭찬 문장 없이 숫자만. */
  function histAt(s, phase) { return (s.history || []).filter(function (x) { return x.phase === phase; })[0] || null; }
  /* 출발한 계획의 모양(노선 정류장 순서·정차 + 그 노선 버스 수) — 두 단계의 노선이 같은지 비교용 */
  function planKey(h) { return ((h.plan && h.plan.buses) || []).map(function (b) { return b.route ? b.route.nodes.join('-') + '#' + b.route.stops.join('') : ''; }).filter(Boolean).sort().join('|'); }
  /* 2026-11-12 랜덤 검토 4번: 청원 지표를 하루 끝 기준 하나로 — ‘그 동네에서 출발해 목적지까지 못 간 이동’(Choices.outcome = 보고서·금배지와 같은 값).
   * 청원 시각에 아직 도착 전이던 이동(버스 안 포함)은 ‘참고’ 줄로만. ‘반영한다’를 골랐으면 판정 한 줄. 고정·사건 청원 모두 */
  function petitionFollowup(App, s, h) {
    var fp = PB.Choices.list(s).filter(function (p) { return p.answer === h.phase; })[0]; if (!fp) return null;
    var o = PB.Choices.outcome(s, fp); if (!o) return null;
    var h2 = histAt(s, fp.phase), z = fp.zone, a = h2.rideLog[z] || { requests: 0, arrived: 0, rode: 0 }, b = h.rideLog[z] || { requests: 0, arrived: 0, rode: 0 };
    var name = App.nodeName(z), rep = fp.reply || {}, c = shell(App, 'petition-followup', name + ' 청원 그 뒤');
    if (rep.choice) c.appendChild(App.el('p', { id: 'petition-answer', 'class': 'fair-fact' }, name + ' 주민의 청원을 ' + (rep.choice === 'reflect' ? '반영한다' : '이번엔 못 한다') + '고 답했어요.' + (rep.why ? ' 왜냐하면 ' + rep.why + '.' : '')));
    /* 2026-11-11 플레이테스트 8: ① ‘반영한다’고 했는데 2단계와 같은 노선·버스 수로 출발했고 운행 중에도 안 고쳤으면 사실 한 줄.
     * ② 청원이 말한 이동과 같은 기준(그 시각까지 그 구역에서 생긴 요청 중 그때까지 도착하지 못한 이동)으로 2단계와 3단계를 나란히 — 전에는 하루가 끝났을 때 기준만 보여서 청원 숫자(3건 중 3건)와 결과 숫자(0건 → 0건)가 어긋나 보였다.
     * ③ 하루가 끝났을 때 기준은 그 아래 줄로 남긴다(보고서·금배지가 쓰는 값) */
    var mids = (s.midChanges || []).some(function (m) { return m.phase === h.phase; });
    var P1 = fp.phase + '단계', P2 = h.phase + '단계';
    if (rep.choice === 'reflect' && h2 && planKey(h2) === planKey(h) && !mids) c.appendChild(App.el('p', { id: 'petition-same', 'class': 'fair-fact' }, '노선은 바뀌지 않았어요(' + P1 + '와 같은 노선·버스 수로 출발했어요).'));
    c.appendChild(App.el('p', { id: 'petition-fail', 'class': 'fair-fact' }, '하루가 끝났을 때 ' + name + '에서 출발해 목적지까지 못 간 이동: ' + P1 + ' ' + o.before.failed + '건(출발 ' + o.before.requests + '건 중) → ' + P2 + ' ' + o.after.failed + '건(출발 ' + o.after.requests + '건 중)'));
    if (rep.choice === 'reflect') c.appendChild(App.el('p', { id: 'petition-verdict', 'class': 'fair-fact petition-verdict is-' + o.verdict }, verdictText(o)));
    var now = h.petitionCheck || (s.current && s.current.result && s.phase === h.phase ? PB.Session.petitionZoneAt(s.current.result.passengers, fp.t, fp.zone) : null);
    if (now && fp.total != null) c.appendChild(App.el('p', { id: 'petition-then', 'class': 'note' }, '참고 · 청원 시각(' + App.clock(fp.t) + ')에 아직 도착 전이던 이동(버스 안에 있던 사람 포함): ' + P1 + ' ' + fp.total + '건 중 ' + fp.count + '건 → ' + P2 + ' ' + now.total + '건 중 ' + now.count + '건'));
    c.appendChild(App.el('p', { id: 'petition-rode', 'class': 'fair-fact' }, name + ' 탑승 기록(다음 AI가 보는 자료): ' + P1 + ' ' + a.rode + '명 → ' + P2 + ' ' + b.rode + '명'));
    return c;
  }
  // ‘반영한다’ 판정 한 줄(하루 끝 기준 못 간 이동)
  function verdictText(o) {
    var a = o.before.failed, b = o.after.failed;
    return o.verdict === 'zero' ? '반영했어요 · 못 간 이동 0건 유지' : o.verdict === 'down' ? '반영했어요 · 못 간 이동 ' + a + '건 → ' + b + '건으로 줄었어요' :
      o.verdict === 'up' ? '반영했지만 ' + a + '건 → ' + b + '건으로 늘었어요' : '반영했지만 못 간 이동이 ' + a + '건 그대로예요';
  }
  UI.petitionVerdict = verdictText;
  function elderResult(App, s, h) {
    var ch = PB.Session.elderChoice(s), k = (((h.scores || {}).mobility || {}).reasons || {}).stayHome || 0;
    if (h.phase < 4 || ch !== 'abolish' && ch !== 'keep') return null;
    var c = shell(App, 'elder-result', '어르신 무임승차 정책 결과'), prev = histAt(s, 3);
    if (h.phase === 4) {
      c.appendChild(App.el('p', { id: 'elder-chose', 'class': 'fair-fact' }, '어르신 무임승차를 ' + (ch === 'keep' ? '유지' : '폐지') + '했어요.'));
      if (ch === 'keep') c.appendChild(App.el('p', { id: 'elder-money', 'class': 'fair-fact' }, '무임 승객 ' + ((h.elder || {}).free || 0) + '명 · 받지 않은 운임 ' + App.won((h.elder || {}).unpaid || 0)));
      else if ((h.elder || {}).paid != null) c.appendChild(App.el('p', { id: 'elder-money', 'class': 'fair-fact' }, '폐지로 어르신이 낸 운임 ' + App.won(h.elder.paid * s.config.finance.fare)));
    }
    if (ch === 'abolish') c.appendChild(App.el('p', { id: 'elder-stay', 'class': 'fair-fact' }, '무임 폐지로 버스를 타지 않은 이동 ' + k + '건 — 이동 수요 충족 점수에서 목적지까지 못 간 이동으로 셌어요.'));
    return c.querySelector('p') ? c : null;
  }
  /* 그 단계에 AI가 본 기본 이동과 실제 기본 이동(출발 구역별) — 'AI가 본 이동과 실제 이동' 카드와 「다음 운행 목표」 연결 문장(Narrative.thinkFocus의 unseen)이 같은 값을 쓴다 */
  function seenStats(s, h) {
    var P = PB.RideLog, base = PB.Session.rideRequests(s, h.phase, null).ride.filter(function (q) { return q.kind === 'base' && q.leg !== 'return'; }), prev = histAt(s, h.phase - 1), prevLog = prev && prev.rideLog || null,
      seen = P.seenFor(s.config, h.phase, prevLog, base), real = {}, zones, out = {};
    base.forEach(function (q) { real[q.o] = (real[q.o] || 0) + 1; });
    zones = Object.keys(real); var rs = P.ratios(s.config, h.phase, prevLog, zones);
    zones.forEach(function (z) { out[z] = { seen: seen[z] || 0, real: real[z], ratio: rs[z] }; });
    return out;
  }
  function seenGap(App, s, h) {
    var st = seenStats(s, h), low = null;
    Object.keys(st).forEach(function (z) { if (st[z].ratio < 0.5 && (low === null || st[z].ratio < st[low].ratio)) low = z; });
    if (low === null) return null;
    var c = shell(App, 'ai-seen-gap', 'AI가 본 이동과 실제 이동');
    c.appendChild(App.el('p', { 'class': 'fair-fact' }, App.nodeName(low) + ': AI가 본 이동 ' + st[low].seen + '건 · 실제 이동 ' + st[low].real + '건'));
    return c;
  }
  function resultBlocks(App, s, h) { return [petitionFollowup(App, s, h), elderResult(App, s, h), seenGap(App, s, h)].filter(Boolean); }
  UI.fairness = { resultBlocks: resultBlocks, seenStats: seenStats, profitMap: profitMap, profitToggle: profitToggle, profitLegend: legend, stopTable: stopTable,  petitionCard: petitionCard, elderCard: elderCard, seenLine: seenLine, required: required, kindOf: function (s) { return PB.Choices.petitionFor(s, s.phase) ? 'petition' : s.phase === 4 ? 'elder' : null; } };
})(typeof window !== 'undefined' ? window : globalThis);
