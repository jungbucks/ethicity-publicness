/*
 * 기본 수요와 사건 (PRD §6).
 * 각 요청자는 그 단계에 한 번 이동하는 고유 가상 인물이다.
 * 요청 id: 기본 phase*100000 + r*100 + i, 사건 추가분 phase*100000 + 90000 + k
 */
(function (root) {
  'use strict';
  var Rng = (typeof require === 'function' && typeof module !== 'undefined') ? require('./rng.js') : root.PB.Rng;

  // 표의 행을 위에서부터, 각 행의 앞→뒤·뒤→앞 순으로 펼친다. r = 펼친 행 번호
  function directional(config, phase) {
    var out = [];
    config.demandRows.forEach(function (row, k) {
      if (row.fromPhase > phase || (row.toPhase != null && row.toPhase < phase)) return;
      out.push({ r: 2 * k, o: row.a, d: row.b, n: row.n });
      out.push({ r: 2 * k + 1, o: row.b, d: row.a, n: row.n });
    });
    return out;
  }

  function sortReqs(list) {
    return list.sort(function (a, b) { return a.t - b.t || a.id - b.id; });
  }

  function residents(config,phase){return config.residents.filter(function(r){return r.fromPhase<=phase;}).map(function(r){return Object.assign({},r,r.itineraries&&r.itineraries[phase]||{});});}
  function base(config, phase, seed) {
    var W = config.bus.requestWindow, out = [];
    var active = config.day ? residents(config,phase).filter(function(r){return !r.itineraries;}) : [];
    directional(config, phase).forEach(function (od) {
      for (var i = 0; i < od.n; i++) {
        var t = (Math.floor(W * i / od.n) + seed + 11 * od.r + 7 * phase) % W;
        if (config.rush) {
          var rush = config.rush, peak = Math.ceil(od.n * rush.share);
          if (i < peak) t = (od.r % 2 === 0 ? rush.outbound : rush.inbound) + (seed + phase * 7 + od.r) % rush.jitter + Math.floor(rush.spread * i / peak);
          t = Math.min(W - 1, t);
        }
        var rd = active.filter(function(r){return r.o===od.o&&r.d===od.d;})[0];
        if(config.day){
          // Independent trips follow destination roles; only named residents have a linked return.
          var rng=Rng.create((seed ^ (phase*7919+od.r*131+i*104729))>>>0),home=['B','F','I'];
          var lo=10,hi=108;
          if(od.d==='D'||od.d==='E'){lo=34;hi=74;}
          else if(home.indexOf(od.d)>=0){lo=74;hi=113;}
          else if(od.d==='H'){lo=67;hi=101;}
          else if(od.d==='A'||od.d==='C'||od.d==='G'){lo=7;hi=34;}
          if((od.o==='G'||od.o==='C')&&(od.d==='A'||od.d==='J')){lo=74;hi=101;}
          if((od.o==='D'||od.o==='E')&&home.indexOf(od.d)>=0){lo=48;hi=87;}
          if(od.o==='H'){lo=90;hi=116;}
          if(od.o==='J'&&od.d==='H'){lo=60;hi=80;}
          if(od.o==='H'&&od.d==='J'){lo=100;hi=113;}
          if(od.d==='K'){lo=34;hi=60;}
          if(od.o==='K'){lo=60;hi=86;}
          if(od.d==='M'){lo=46;hi=54;}
          if(od.o==='M'){lo=90;hi=98;}
          if(od.d==='N'){lo=8;hi=25;}
          if(od.o==='N'){lo=80;hi=96;}
          t=Math.floor(lo+(hi-lo)*((i+rng.next())/od.n));
          if(i===0&&active.some(function(r){return r.d===od.o&&r.o===od.d;}))continue;
        }
        var q={ id: phase * 100000 + od.r * 100 + i, key: 'P' + phase + '-R' + od.r + '-' + i, o: od.o, d: od.d, t: t, kind: 'base', row: od.r, i: i };
        if(rd&&i===0){q.t=rd.depart;q.residentId=rd.id;q.leg='outbound';q.returnTrip={earliest:rd.returnAt,stay:rd.stay};}
        out.push(q);
      }
    });
    if(config.day)residents(config,phase).filter(function(r){return r.itineraries;}).forEach(function(r,i){
      out.push({id:phase*100000+80000+i,key:'P'+phase+'-guest-'+r.id,o:r.o,d:r.d,t:r.depart,kind:'base',residentId:r.id,leg:'outbound',returnTrip:{earliest:r.returnAt,stay:r.stay,destination:r.returnTo}});
    });
    var family=config.familyTrips;
    if(config.day&&family&&phase>=family.fromPhase)family.origins.forEach(function(origin,index){
      for(var member=0;member<family.members;member++)out.push({id:phase*100000+70000+index*100+member,key:'P'+phase+'-family-'+index+'-'+member,o:origin,d:family.destination,t:family.depart+index*4+(seed%3),kind:'base',familyId:'P'+phase+'-family-'+index,familySize:family.members,leg:'outbound',returnTrip:{earliest:family.returnAt,stay:family.stay,destination:origin}});
    });
    return sortReqs(out);
  }

  // 세션 시작 시 단계 순서대로 유형→시각→OD를 한 번씩 추첨(무사건도 세 값을 모두 소비)
  function drawEvents(config, seed) {
    var r = Rng.create(seed), E = config.events, out = [];
    for (var p = 1; p <= config.phases.length; p++) {
      var u1 = r.next(), u2 = r.next(), u3 = r.next();
      out.push({
        phase: p,
        type: u1 < E.pNone ? 'none' : u1 < E.pDemand ? 'demand' : 'petition',
        t: E.timeBase + Math.floor(E.timeSpan * u2),
        odIndex: Math.floor(directional(config, p).length * u3)
      });
    }
    return out;
  }

  // 추가 수요: 사건 시각부터 0~5초 사이에 매 초 2명(총 12명)
  function extra(config, phase, ev) {
    if (!ev || ev.type !== 'demand') return [];
    var od = directional(config, phase)[ev.odIndex], E = config.events, out = [], k = 0;
    for (var m = 0; m < E.extraMinutes; m++) {
      for (var j = 0; j < E.extraPerMin; j++, k++) {
        out.push({ id: phase * 100000 + 90000 + k, key: 'P' + phase + '-E-' + k, o: od.o, d: od.d, t: ev.t + m, kind: 'extra', row: od.r, i: k });
      }
    }
    return out;
  }

  function clock(config,t){if(!config.day)return Math.round(t)+'초';var m=Math.round(config.day.start+Math.max(0,Math.min(config.bus.window,t))*(config.day.end-config.day.start)/config.bus.window);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
  function duration(config,t){if(!config.day)return Math.round(t)+'초';var m=Math.round(t*(config.day.end-config.day.start)/config.bus.window);return m<60?m+'분':Math.floor(m/60)+'시간'+(m%60?' '+m%60+'분':'');}
  function period(config,t){var h=config.day?(config.day.start+t*(config.day.end-config.day.start)/config.bus.window)/60:0;return h<7?'이른 아침':h<10?'출근·등교':h<16?'낮 생활 이동':h<20?'퇴근·귀가':'늦은 귀가';}
  // 정류장별 이번 단계 기본 승차 요청(출발+도착)과 이용 등급. 지도에서 시설 규모만 바꾸며 중요도를 뜻하지 않는다
  var LOAD_TIERS = { high: 55, mid: 30 };
  function stopLoad(config, phase, seed) {
    var out = {};
    base(config, phase, seed).forEach(function (q) { out[q.o] = (out[q.o] || 0) + 1; out[q.d] = (out[q.d] || 0) + 1; });
    Object.keys(out).forEach(function (id) { var n = out[id]; out[id] = { count: n, tier: n >= LOAD_TIERS.high ? 'high' : n >= LOAD_TIERS.mid ? 'mid' : 'low' }; });
    return out;
  }
  // 안내에 쓰는 이번 단계 이동 요청 구성. planned = 미리 정해진 이동, followUps = 목적지에 도착하면 생기는 다음 이동(주요 인물·가족)의 최대 수
  function requestPlan(config, phase, seed) { var b = base(config, phase, seed); return { planned: b.length, followUps: b.filter(function (q) { return q.returnTrip; }).length }; }
  var api = { requestPlan:requestPlan, residents:residents, clock:clock,duration:duration,period:period,directional: directional, base: base, drawEvents: drawEvents, extra: extra, sortReqs: sortReqs, stopLoad: stopLoad, LOAD_TIERS: LOAD_TIERS };
  root.PB = root.PB || {};
  root.PB.Demand = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
