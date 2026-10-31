/* Shared service verdicts for forecasts, AI and actual results. */
(function(root){
  'use strict';
  var NODE=typeof require==='function'&&typeof module!=='undefined';
  var Graph=NODE?require('./graph.js'):root.PB.Graph;
  var Demand=NODE?require('./demand.js'):root.PB.Demand;
  function residentVerdict(config, rd, rec, passengers) {
    if (!rec) return { ok: false, reasons: [] };
    var reasons = [], legs = passengers.filter(function (p) { return p.residentId === rd.id; });
    var out = legs.filter(function (p) { return p.leg === 'outbound'; })[0], back = legs.filter(function (p) { return p.leg === 'return'; })[0];
    var name = function (id) { var n = config.nodes.filter(function (x) { return x.id === id; })[0]; return n ? n.name : id; };
    function legReason(p, label) {
      if (!p) return null;
      if (p.fail === 'NO_LINK') return { code: 'noLink', text: label + '(' + name(p.o) + ' → ' + name(p.d) + ')을 잇는 운행 노선이 없어요.' };
      if (p.fail === 'NO_TRIP_IN_WINDOW') return { code: 'noTrip', text: label + ' 준비가 된 뒤에는 운행 시간 안에 도착하는 버스편이 없어요.' };
      if (p.status === 'riding') return { code: 'riding', text: label + ' 중 운행이 끝나 버스 안에 남아요.' };
      if (p.status !== 'arrived' && p.deniedBoardings > 0) return { code: 'full', text: label + '에서 만차로 버스를 놓쳐 운행 시간 안에 도착하지 못해요.' };
      if (p.status !== 'arrived') return { code: 'late', text: label + '을 운행 시간 안에 마치지 못해요.' };
      return null;
    }
    if (rec.dayStatus === 'outboundIncomplete') reasons.push(legReason(out, '첫 이동') || { code: 'late', text: '첫 이동을 마치지 못해요.' });
    else if (rec.dayStatus === 'returnIncomplete') {
      if (!back) reasons.push({ code: 'tooLate', text: '첫 목적지 도착과 체류가 늦어 운행 시간 안에 다음 이동을 시작하지 못해요.' });
      else reasons.push(legReason(back, '다음 이동') || { code: 'late', text: '다음 이동을 마치지 못해요.' });
    }
    var sv = config.service;
    if (sv && rec.dayStatus === 'complete') [[out, '첫 이동'], [back, '다음 이동']].forEach(function (x) {
      var p = x[0]; if (!p) return;
      if (sv.maxWait != null && p.waitTotal > sv.maxWait) reasons.push({ code: 'longWait', text: x[1] + '에서 버스를 ' + Demand.duration(config, p.waitTotal) + ' 기다렸어요(기준 ' + Demand.duration(config, sv.maxWait) + ' 이하).' });
      if (sv.maxTripFactor != null) {
        var limit = tripLimit(config, p.o, p.d);
        if (p.arriveT - p.t > limit) reasons.push({ code: 'slowTrip', text: x[1] + '에 ' + Demand.duration(config, p.arriveT - p.t) + ' 걸렸어요(기준 ' + Demand.duration(config, limit) + ' 이하).' });
      }
    });
    return { ok: !reasons.length, reasons: reasons };
  }
  // 이동 시간 기준 = 두 정류장을 바로 잇는 도로 시간 × 배수(짧은 거리는 최소값)
  function tripLimit(config, a, b) {
    var sv = config.service, g = Graph.build(config, 99), t = g.time(a, b) || 1;
    return Math.max(sv.minTrip || 0, Math.round(sv.maxTripFactor * t));
  }

  function records(config, phase, result) {
    var s = {config: config, phase: phase};
    var out = {};
    s.config.residents.forEach(function (rd) {
      if (rd.fromPhase > s.phase) { out[rd.id] = null; return; }
      var p = result.passengers.filter(function (x) { return s.config.day ? x.residentId===rd.id&&x.leg==='outbound' : x.kind === 'base' && x.o === rd.o && x.d === rd.d && x.key.slice(-2) === '-0'; })[0];
      if(s.config.day){
        var back=result.passengers.filter(function(x){return x.residentId===rd.id&&x.leg==='return';})[0];
        out[rd.id]=p?{o:p.o,d:p.d,finalDestination:p.returnTrip&&p.returnTrip.destination||p.o,multiStop:!!rd.itineraries,t:p.t,status:p.status,waitTotal:p.waitTotal+(back?back.waitTotal:0),arriveT:p.arriveT,firstBoardT:p.firstBoardT,transfer:p.boardings>1||(back&&back.boardings>1),
          returnT:back?back.t:p.returnReadyT,homeT:back?back.arriveT:null,returnStatus:back?back.status:null,dayStatus:p.status!=='arrived'?'outboundIncomplete':back&&back.status==='arrived'?'complete':'returnIncomplete'}:null;
        if(out[rd.id]){var v=residentVerdict(s.config,rd,out[rd.id],result.passengers);out[rd.id].satisfied=v.ok;out[rd.id].reasons=v.reasons;}
        return;
      }
      out[rd.id] = p ? { t: p.t, status: p.status, waitTotal: p.waitTotal, arriveT: p.arriveT, firstBoardT: p.firstBoardT, boardings: p.boardings,
        transfer: !!(p.journey && p.journey.length === 2), fail: p.fail } : null;
    });
    return out;
  }

  function count(records){var rows=Object.keys(records||{}).map(function(k){return records[k];}).filter(Boolean);return {completed:rows.filter(function(r){return r.dayStatus==='complete';}).length,satisfied:rows.filter(function(r){return r.satisfied===true;}).length,total:rows.length};}
  var api={records:records,verdict:residentVerdict,tripLimit:tripLimit,count:count};
  root.PB=root.PB||{};root.PB.ResidentEvaluation=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
