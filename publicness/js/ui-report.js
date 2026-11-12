/* 엔딩 ‘내 운영 보고서’ 화면(2026-11-09 테스터 6번). 내용은 js/report.js(순수), 여기는 그리기·인쇄만.
 * 투명성 편과 같은 방식: 보고서 화면 + ‘PDF로 저장하기’ = window.print(), 인쇄하는 동안만 문서 제목 = 파일 이름, @media print(css/report.css)가 보고서만 A4로.
 * 이름 칸은 저장하지 않는다 — 이 페이지 메모리(nameMem)에만 두어 화면을 다시 그려도 유지되고, 새로고침하면 사라진다. */
(function (root) {
  'use strict';
  var PB = root.PB, UI = PB.UI = PB.UI || {}, nameMem = '', baseTitle = null;
  function el(t, a, x) { return PB.App.el(t, a, x); }
  function fmt(App, s) {
    return { won: App.won, duration: App.duration, rate: PB.Metrics.fmtRate, name: App.nodeName, route: function (n) { return PB.Names.route(n, s); }, bus: function (id, from) { return PB.Names.bus(id, s, from); }, clock: App.clock, choices: PB.Session.CHOICES, date: new Date() };
  }
  function restoreTitle() { if (baseTitle != null) { document.title = baseTitle; baseTitle = null; } }
  function print() {
    if (baseTitle == null) baseTitle = document.title;
    document.title = PB.Report.fileName(nameMem);
    try { root.print(); } finally { restoreTitle(); }
  }
  root.addEventListener('afterprint', restoreTitle);
  function row(label, body) {
    var r = el('div', { 'class': 'report-row' });
    r.appendChild(el('p', { 'class': 'report-k' }, label));
    if (typeof body === 'string') r.appendChild(el('p', { 'class': 'report-v' }, body)); else r.appendChild(body);
    return r;
  }
  UI.report = function (App, panel) {
    var s = App.s, r = PB.Report.build(s, fmt(App, s));
    var art = el('article', { id: 'report', 'class': 'report', 'aria-labelledby': 'report-h' });
    var head = el('header', { 'class': 'report-head' });
    head.appendChild(el('p', { 'class': 'report-game' }, r.game));
    head.appendChild(el('h2', { id: 'report-h' }, r.title));
    head.appendChild(el('p', { 'class': 'report-meta', id: 'report-meta' }, r.meta.date + ' · ' + r.meta.mode + ' · ' + r.meta.stages));
    head.appendChild(el('p', { 'class': 'report-meta', id: 'report-end' }, r.meta.end));
    var who = el('label', { 'class': 'report-name', 'for': 'report-name' }, '이름 ');
    var name = el('input', { type: 'text', id: 'report-name', maxlength: '30', autocomplete: 'off', placeholder: '쓰지 않아도 돼요' });
    name.value = nameMem; name.addEventListener('input', function () { nameMem = name.value; });
    who.appendChild(name); head.appendChild(who);
    head.appendChild(el('p', { 'class': 'note no-print' }, '이름은 저장하지 않아요. 인쇄할 때만 보고서에 들어가요.'));
    art.appendChild(head);
    var act = el('div', { 'class': 'report-actions no-print' });
    act.appendChild(el('button', { type: 'button', 'class': 'btn btn-primary', id: 'btn-report-print', onclick: print }, 'PDF로 저장하기'));
    act.appendChild(el('button', { type: 'button', 'class': 'btn', id: 'btn-report-back', onclick: function () { App._reportFor = null; App._reviewFor = App._reportFrom === 'review' ? s : null; App.go('ending'); root.scrollTo(0, 0); } }, '돌아가기'));
    act.appendChild(el('p', { 'class': 'note' }, '인쇄 창에서 ‘PDF로 저장’을 고르면 파일로 남아요. 선생님께 낼 때 써요.'));
    art.appendChild(act);
    var bs = el('section', { id: 'report-badges', 'class': 'report-stage report-badges', 'aria-labelledby': 'report-badges-h' });
    bs.appendChild(el('h3', { id: 'report-badges-h' }, '금배지'));
    var bl = el('ul', { 'class': 'badge-list' });
    r.badges.forEach(function (b) {
      var li = el('li', { 'class': 'badge ' + (b.earned ? 'is-earned' : 'is-not'), 'data-badge': b.id });
      li.appendChild(el('span', { 'class': 'badge-star', 'aria-hidden': 'true' }, b.earned ? '★' : '☆'));
      li.appendChild(el('span', { 'class': 'badge-label' }, b.label));
      li.appendChild(el('b', { 'class': 'badge-state' }, b.earned ? '받음' : '아직'));
      if (b.rule) li.appendChild(el('span', { 'class': 'badge-rule' }, b.rule)); /* 2026-11-12: 받는 조건 한 줄 */
      bl.appendChild(li);
    });
    bs.appendChild(bl); art.appendChild(bs);
    var cs = el('section', { id: 'report-choices', 'class': 'report-stage' });
    cs.appendChild(el('h3', null, '내가 고른 것'));
    /* 2026-11-12 랜덤 검토 4번: 청원마다 한 줄(고정 청원 + 사건 청원) */
    if (r.choices.petitions && r.choices.petitions.length) r.choices.petitions.forEach(function (p) { cs.appendChild(row(p.phase + '단계 청원', p.text)); });
    else cs.appendChild(row('2단계 청원', r.choices.petition || '(해당 없음)'));
    cs.appendChild(row('4단계 무임승차', r.choices.elder || '(해당 없음)'));
    art.appendChild(cs);
    if (r.scope) art.appendChild(el('p', { id: 'report-scope', 'class': 'report-scope' }, r.scope)); /* 2026-11-10 검토 2번: 두 건수의 범위(실제로 생긴 요청 / 평가 대상) */
    r.stages.forEach(function (st) {
      var sec = el('section', { 'class': 'report-stage', 'data-phase': String(st.phase), 'aria-labelledby': 'report-stage-' + st.phase });
      sec.appendChild(el('h3', { id: 'report-stage-' + st.phase }, st.title));
      var ul = el('ul', { 'class': 'report-plan' }); st.plan.forEach(function (t) { ul.appendChild(el('li', null, t)); });
      sec.appendChild(row(st.planLabel || '내 계획', ul));
      if (st.changes && st.changes.length) { /* 2026-11-12: 운행 중 고친 것은 출발 계획과 따로 — 시각·무엇을·고치기 전과 뒤 */
        var cl = el('ul', { 'class': 'report-plan report-changes' });
        st.changes.forEach(function (c) {
          var li = el('li', { 'data-kind': c.kind }); li.appendChild(el('span', { 'class': 'report-change-head' }, c.head));
          if (c.detail.length) { var dl = el('ul', { 'class': 'report-change-detail' }); c.detail.forEach(function (t) { dl.appendChild(el('li', null, t)); }); li.appendChild(dl); }
          cl.appendChild(li);
        });
        if (st.changeNote) cl.appendChild(el('li', { 'class': 'report-change-note' }, st.changeNote));
        sec.appendChild(row('운행 중 바꾼 것', cl));
      }
      var nums = el('ul', { 'class': 'report-nums' });
      st.numbers.forEach(function (n) { var li = el('li', n[2] ? { 'class': 'is-' + n[2] } : null); var cut = n[2] ? n[1].indexOf(' (') : -1; /* 긴 줄(평가 대상)은 건수만 굵게, 괄호 속 풀이는 보통 굵기 */
        li.appendChild(el('span', null, n[0] + ' ')); li.appendChild(el('b', null, cut < 0 ? n[1] : n[1].slice(0, cut))); if (cut >= 0) li.appendChild(el('span', null, n[1].slice(cut))); nums.appendChild(li); });
      sec.appendChild(row('결과', nums));
      sec.appendChild(row('다음 운행 목표', st.goal));
      sec.appendChild(row('내 생각', st.mine));
      sec.appendChild(row('AI 제안에 대한 내 생각', st.ai));
      art.appendChild(sec);
    });
    var fin = el('section', { id: 'report-final', 'class': 'report-stage report-final', 'aria-labelledby': 'report-final-h' });
    fin.appendChild(el('h3', { id: 'report-final-h' }, '마지막 소감'));
    fin.appendChild(el('p', { 'class': 'report-k' }, r.final.prompt));
    fin.appendChild(el('p', { 'class': 'report-v' }, r.final.text));
    art.appendChild(fin);
    panel.appendChild(art);
    return {};
  };
  // 엔딩·돌아보기 화면에서 보고서 열기(from = 돌아갈 곳)
  UI.openReport = function (App, from) {
    App._reportFor = App.s; App._reportFrom = from; App._reviewFor = null; App.go('ending');
    var p = document.querySelector('#panel'); if (p) p.scrollTop = 0; root.scrollTo(0, 0);
  };
})(window);
