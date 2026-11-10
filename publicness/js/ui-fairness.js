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
  function field(s, kind) { return s[PB.Choices.KINDS[kind].field] || {}; }
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
      PB.Choices.set(s, kind, 'why', inp.value); App.save(); status.textContent = '저장했어요.';
      var n = document.getElementById('why-nudge'); if (n) n.remove();
    });
    p.appendChild(document.createTextNode('왜냐하면 ')); p.appendChild(inp); p.appendChild(document.createTextNode('.'));
    var wrap = document.createDocumentFragment(); wrap.appendChild(p);
    if (hooks.nudge === kind) wrap.appendChild(App.el('p', { id: 'why-nudge', 'class': 'note', role: 'status' }, '이유를 한 줄 적어 볼까요? 비워 두고 다시 누르면 그대로 출발해요.'));
    wrap.appendChild(status);
    return wrap;
  }
  function shell(App, id, title) {
    var c = App.el('section', { id: id, 'class': 'fair-card', 'aria-labelledby': id + '-h' });
    c.appendChild(App.el('h3', { id: id + '-h' }, title)); return c;
  }
  function petitionCard(App, s, hooks) {
    var fp = s.fixedPetition; hooks = hooks || {};
    if (!fp || s.phase !== PB.Choices.KINDS.petition.phase) return null;
    var zone = App.nodeName(fp.zone), c = shell(App, 'petition-card', zone + ' 주민 청원');
    c.appendChild(App.el('p', { id: 'petition-text', 'class': 'fair-fact' }, App.clock(fp.t) + ' ' + zone + ' 주민 청원: 그때까지 요청 ' + fp.total + '건 중 ' + fp.count + '건이 아직 도착하지 못했어요.'));
    c.appendChild(App.el('p', { 'class': 'fair-frame' }, zone + ' 주민의 청원을'));
    c.appendChild(options(App, s, 'petition', hooks, zone + ' 주민의 청원에 대한 답'));
    c.appendChild(whyLine(App, s, 'petition', hooks));
    return c;
  }
  function elderCard(App, s, hooks) {
    hooks = hooks || {};
    if (s.phase !== PB.Choices.KINDS.elder.phase || !(s.config && s.config.elderFree)) return null;
    var c = shell(App, 'elder-card', '어르신 무임승차를 유지할까요?'), h = s.history.filter(function (x) { return x.phase === 3; })[0];
    if (h && h.elder) c.appendChild(App.el('p', { id: 'elder-facts', 'class': 'fair-fact' }, '지난 3단계 무임 승객 ' + h.elder.free + '명 · 받지 않은 운임 ' + App.won(h.elder.unpaid)));
    c.appendChild(App.el('p', { 'class': 'note' }, '이 마을은 어르신 버스 요금이 무료예요(마을 정책).'));
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
  /* 출발 전에 골라야 할 것이 남았을 때 한 줄(없으면 null) */
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
  function petitionFollowup(App, s, h) {
    var fp = s.fixedPetition; if (h.phase !== 3 || !fp) return null;
    var h2 = histAt(s, 2), z = fp.zone, a = h2 && h2.rideLog && h2.rideLog[z], b = h.rideLog && h.rideLog[z]; if (!a || !b) return null;
    var name = App.nodeName(z), rep = s.petitionReply || {}, c = shell(App, 'petition-followup', name + ' 청원 그 뒤');
    if (rep.choice) c.appendChild(App.el('p', { id: 'petition-answer', 'class': 'fair-fact' }, name + ' 주민의 청원을 ' + (rep.choice === 'reflect' ? '반영한다' : '이번엔 못 한다') + '고 답했어요.' + (rep.why ? ' 왜냐하면 ' + rep.why + '.' : '')));
    c.appendChild(App.el('p', { id: 'petition-fail', 'class': 'fair-fact' }, name + '에서 출발한 이동 중 목적지까지 못 간 이동: 2단계 ' + a.requests + '건 중 ' + (a.requests - a.arrived) + '건 → 3단계 ' + b.requests + '건 중 ' + (b.requests - b.arrived) + '건'));
    c.appendChild(App.el('p', { id: 'petition-rode', 'class': 'fair-fact' }, name + ' 탑승 기록(다음 AI가 보는 자료): 2단계 ' + a.rode + '명 → 3단계 ' + b.rode + '명'));
    return c;
  }
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
  function seenGap(App, s, h) {
    var P = PB.RideLog, base = PB.Session.rideRequests(s, h.phase, null).ride.filter(function (q) { return q.kind === 'base' && q.leg !== 'return'; }), prev = histAt(s, h.phase - 1), prevLog = prev && prev.rideLog || null,
      seen = P.seenFor(s.config, h.phase, prevLog, base), real = {}, zones;
    base.forEach(function (q) { real[q.o] = (real[q.o] || 0) + 1; });
    zones = Object.keys(real); var rs = P.ratios(s.config, h.phase, prevLog, zones), low = null;
    zones.forEach(function (z) { if (rs[z] < 0.5 && (low === null || rs[z] < rs[low])) low = z; });
    if (low === null) return null;
    var c = shell(App, 'ai-seen-gap', 'AI가 본 이동과 실제 이동');
    c.appendChild(App.el('p', { 'class': 'fair-fact' }, App.nodeName(low) + ': AI가 본 이동 ' + (seen[low] || 0) + '건 · 실제 이동 ' + real[low] + '건'));
    return c;
  }
  function resultBlocks(App, s, h) { return [petitionFollowup(App, s, h), elderResult(App, s, h), seenGap(App, s, h)].filter(Boolean); }
  UI.fairness = { resultBlocks: resultBlocks, profitMap: profitMap, profitToggle: profitToggle, profitLegend: legend, stopTable: stopTable,  petitionCard: petitionCard, elderCard: elderCard, seenLine: seenLine, required: required, kindOf: function (s) { return s.phase === 3 && s.fixedPetition ? 'petition' : s.phase === 4 ? 'elder' : null; } };
})(typeof window !== 'undefined' ? window : globalThis);
