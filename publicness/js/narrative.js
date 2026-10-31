/*
 * 주민 반응·이야기 — 조건 판정과 숫자 채우기만 한다. 문장은 stories.js에 있다.
 * 말풍선은 그 시각까지의 실제 로그가 뒷받침할 때만, 이야기는 해당 주민의 단계별 기록에서만 만든다.
 */
(function (root) {
  'use strict';
  var NODE = typeof require === 'function' && typeof module !== 'undefined';
  var stories = NODE ? require('./stories.js') : root.PB.stories;
  var Graph = NODE ? require('./graph.js') : root.PB.Graph;
  var Demand = NODE ? require('./demand.js') : root.PB.Demand;
  var Session = NODE ? require('./session.js') : root.PB.Session;
  var Metrics = NODE ? require('./metrics.js') : root.PB.Metrics;

  var MAX_BUBBLES = 12;

  function batchim(word) {
    var c = String(word).charCodeAt(String(word).length - 1);
    if (c < 0xac00 || c > 0xd7a3) return false;
    return (c - 0xac00) % 28 !== 0;
  }
  // 동적 낱말 뒤 조사: josa('다은','은는') → '다은은', josa('고속버스터미널','이었') → '고속버스터미널이었'
  var PAIRS = { '은는': ['은', '는'], '이가': ['이', '가'], '을를': ['을', '를'], '과와': ['과', '와'], '이었': ['이었', '였'], '으로': ['으로', '로'] };
  function josa(word, kind) {
    var w = String(word), p = PAIRS[kind], c = w.charCodeAt(w.length - 1);
    if (!p) return w;
    if (kind === '으로' && c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 === 8) return w + '로'; // ㄹ 받침은 ‘로’
    return w + (batchim(w) ? p[0] : p[1]);
  }
  // {이가}{은는}은 바로 앞에 채워진 낱말의 받침을 본다
  function fill(text, vars) {
    var out = '', re = /\{([^}]+)\}/g, last = 0, m, prev = '';
    while ((m = re.exec(text))) {
      out += text.slice(last, m.index);
      var k = m[1], v;
      if (k === '이가') v = batchim(prev || out) ? '이' : '가';
      else if (k === '은는') v = batchim(prev || out) ? '은' : '는';
      else v = vars[k] != null ? String(vars[k]) : m[0];
      out += v;
      prev = (k === '이가' || k === '은는') ? '' : v;
      last = re.lastIndex;
    }
    return out + text.slice(last);
  }

  function nodeName(config, id) {
    for (var i = 0; i < config.nodes.length; i++) if (config.nodes[i].id === id) return config.nodes[i].name;
    return id;
  }
  function resident(config, id) { return config.residents.filter(function (r) { return r.id === id; })[0]; }
  function residentOf(config, p) {
    if(!p)return null;
    if(config.day)return p.residentId||null;
    if (p.kind !== 'base' || p.key.slice(-2) !== '-0') return null;
    var r = config.residents.filter(function (x) { return x.o === p.o && x.d === p.d; })[0];
    return r ? r.id : null;
  }

  // 운행 중 말풍선 후보를 로그에서 만들고, 주민 우선·긴 대기 우선으로 최대 12개
  function bubbles(result, config, upToT) {
    var B = stories.bubbles, list = [];
    var byId = {};
    result.passengers.forEach(function (p) { byId[p.id] = p; });
    function push(t, p, node, kind, text, prio) {
      list.push({ t: t, pid: p.id, node: node, kind: kind, text: text, residentId: residentOf(config, p), prio: residentOf(config, p) ? 0 : prio });
    }
    result.passengers.forEach(function (p) {
      if (p.fail === 'NO_LINK') push(p.t, p, p.o, 'noLink', fill(B.noLink.text, { stop: nodeName(config, p.d) }), 1);
      if (p.fail === 'NO_LINK') return; // 노선이 없어 떠나지 못한 사람은 ‘기다린’ 것이 아니다(노선 없음 말풍선만)
      B.wait.forEach(function (w, k) {
        var t = p.t + w.minWait;
        if (t > config.bus.window) return;
        if (p.firstBoardT != null && p.firstBoardT <= t) return;
        push(t, p, p.o, 'wait', config.day?'지금까지 '+Demand.duration(config,w.minWait)+' 기다렸어요.':fill(w.text, { wait: w.minWait }), k === B.wait.length - 1 ? 2 : 4);
      });
    });
    result.log.forEach(function (e) {
      var p = e.pid != null ? byId[e.pid] : null;
      if (e.type === 'arrive' && residentOf(config, p)) push(e.t, p, e.node, 'arrive', fill(B.arrive.text, { stop: nodeName(config, e.node) }), 5);
      if (e.type === 'alight') push(e.t, p, e.node, 'transfer', B.transfer.text, 5);
    });
    result.log.forEach(function (e) {
      if (e.type !== 'full') return;
      list.push({ t: e.t, pid: null, node: e.node, kind: 'full', text: B.full.text, residentId: null, prio: 3 });
    });
    list.sort(function (a, b) { return a.prio - b.prio || a.t - b.t || (a.pid || 0) - (b.pid || 0); });
    // 같은 사람·같은 종류는 하나만
    var seen = {}, picked = [];
    list.forEach(function (b) {
      var p = b.pid != null ? byId[b.pid] : null;
      // 주민이 아닌 사람의 ‘노선 없음’은 같은 출발·목적지에서 한 번만
      var k = b.kind === 'noLink' && !b.residentId ? 'noLink' + p.o + p.d : (b.pid || 'n' + b.node + b.t) + b.kind;
      if (seen[k] || picked.length >= MAX_BUBBLES) return;
      seen[k] = true;
      picked.push(b);
    });
    return picked.filter(function (b) { return b.t <= upToT; }).sort(function (a, b) { return a.t - b.t || (a.pid || 0) - (b.pid || 0); })
      .map(function (b) { var o = {}; for (var k in b) if (k !== 'prio') o[k] = b[k]; return o; });
  }

  function observed(records) {
    var out = [];
    records.forEach(function (r, i) { if (r) out.push({ phase: i + 1, status: r.status, waitTotal: r.waitTotal, arriveT: r.arriveT, firstBoardT: r.firstBoardT, transfer: r.transfer }); });
    return out;
  }

  function residentStory(records, residentId, config) {
    if(config.day){
      var who=resident(config,residentId),evidence=records.map(function(r,i){return r?Object.assign({phase:i+1},r):null;}).filter(Boolean);
      if(!who||!evidence.length)return null;
      var lastDay=evidence[evidence.length-1],complete=evidence.filter(function(r){return r.dayStatus==='complete';}).length;
      if(who.itineraries)return {residentId:residentId,name:who.name,role:who.role,conditionKey:'day.itinerary',evidence:evidence,drop:null,
        text:josa(who.name,'은는')+' 관측한 '+evidence.length+'일 중 '+complete+'일의 두 이동을 모두 마쳤어요. 마지막 일정은 '+nodeName(config,lastDay.o)+' → '+nodeName(config,lastDay.d)+' → '+josa(nodeName(config,lastDay.finalDestination),'이었')+'어요.',
        closing:lastDay.dayStatus==='complete'?'마지막 목적지에 '+Demand.clock(config,lastDay.homeT)+' 도착했어요.':lastDay.dayStatus==='returnIncomplete'?'운동장에는 도착했지만 마지막 이동을 마치지 못했어요.':'운동장까지의 첫 이동을 마치지 못했어요.'};
      return {residentId:residentId,name:who.name,role:who.role,conditionKey:'day.roundTrip',evidence:evidence,drop:null,
        text:who.name+'의 '+nodeName(config,who.o)+' → '+nodeName(config,who.d)+' → '+nodeName(config,who.o)+' 일정은 '+evidence.length+'일 중 '+complete+'일 왕복을 마쳤어요.',
        closing:lastDay.dayStatus==='complete'?'마지막 운행에서는 '+Demand.clock(config,lastDay.homeT)+'에 돌아왔어요.':lastDay.dayStatus==='returnIncomplete'?'목적지에는 도착했지만 23:00까지 돌아오지 못했어요.':'23:00까지 외출 목적지에 도착하지 못했어요.'};
    }
    var rd = resident(config, residentId), ev = observed(records);
    if (!rd || !ev.length) return null;
    var first = ev[0], last = ev[ev.length - 1];
    var vars = { name: rd.name, stop: nodeName(config, rd.d), zone: nodeName(config, rd.o) };
    var own = stories.residents[residentId] || {}, key = null, drop = null;
    var waitDropped = ev.length >= 2 && first.status === 'arrived' && last.status === 'arrived' && first.waitTotal >= 15 && first.waitTotal - last.waitTotal >= 5;
    var checks = {
      'haneul.waitDropped': waitDropped,
      'jun.waitDropped': waitDropped,
      'narae.nowArrives': ev.length >= 3 && first.status !== 'arrived' && ev.slice(-2).every(function (e) { return e.status === 'arrived'; }),
      'jun.steady': ev.length >= 2 && ev.every(function (e) { return e.status === 'arrived'; }),
      'sol.neverBoarded': ev.every(function (e) { return e.firstBoardT == null; }),
      'sol.ridingAtEnd': last.firstBoardT != null && last.status !== 'arrived'
    };
    Object.keys(own).forEach(function (k) { if (!key && checks[k]) key = k; });
    var text;
    if (key) {
      text = fill(own[key].text, vars);
      if (/waitDropped$/.test(key)) drop = first.waitTotal - last.waitTotal;
    } else {
      var prev = ev[ev.length - 2];
      var diff = prev ? last.waitTotal - prev.waitTotal : 0;
      if (prev && prev.status === 'arrived' && last.status === 'arrived' && diff !== 0) {
        key = 'any.change';
        text = fill(stories.residents.any[key].text, Object.assign({ diff: Math.abs(diff), change: diff < 0 ? '줄었' : '늘었' }, vars));
      } else {
        key = 'any.current';
        text = fill(stories.residents.any[last.status === 'arrived' ? 'any.current.arrived' : 'any.current.open'].text, vars);
      }
    }
    var C = stories.closing;
    var closing = fill(last.status === 'arrived' ? C.arrived.text : last.firstBoardT != null ? C.riding.text : C.notBoarded.text, vars);
    return { residentId: residentId, name: rd.name, role: rd.role, conditionKey: key, text: text, closing: closing, evidence: ev, drop: drop };
  }

  function zoneSubtitleText(kind) { return stories.subtitles[kind]; }

  function hookLines(session) {
    var cfg = session.config, plan = Session.toPlan(session);
    var reqs = Demand.base(cfg, 1, session.seed).length;
    var throughF = plan.buses.some(function (b) { return b.route && b.route.nodes.indexOf('F') >= 0; });
    var H = stories.hook;
    var empty=!session.draft.routes.some(function(r){return r.nodes.length>=2;});
    return [fill(H.line1.text, { buses: session.owned, requests: reqs }), empty?'아직 정해진 길은 없습니다. 우리 마을의 첫 노선을 직접 연결해 보세요.':fill(throughF ? H.line2Served.text : H.line2.text, {})];
  }

  // 학기 말 만족 기준(‘해낸 하루’ 횟수) = 등장 후 남은 운행 수 − 여유 횟수. 기본 5단계는 여유 1번(한 번 놓쳐도 만회 가능),
  // 도전 8단계는 여유 2번. 늦게 등장한 유나·다은도 같은 규칙이라 기본에서는 2번 중 1번(2026-10-23 조정, 이전엔 2번 중 2번이라 한 번만 놓쳐도 회복 불가)
  function satisfactionTargets(config){
    if(config.satisfactionTargets)return config.satisfactionTargets;
    var spare=config.challengeApplied?2:1,out={};
    config.residents.forEach(function(r){out[r.id]=Math.max(1,config.phases.length-r.fromPhase+1-spare);});
    return out;
  }
  // "하늘·나래·준 왕복 4회, 솔(3단계부터) 왕복 2회, 유나·다은(4단계부터) 일정 2회 이상"
  function satisfactionText(config){
    var t=satisfactionTargets(config),groups=[];
    config.residents.forEach(function(r){
      if(t[r.id]==null)return;var kind=r.itineraries?'일정':'왕복',key=kind+t[r.id]+'|'+r.fromPhase,last=groups[groups.length-1];
      if(last&&last.key===key)last.names.push(r.name);else groups.push({key:key,names:[r.name],kind:kind,n:t[r.id],from:r.fromPhase});
    });
    var sv=config.service,rule=sv&&sv.maxWait!=null?' · 한 번 이동에 버스를 '+Demand.duration(config,sv.maxWait)+' 넘게 기다리면 그날은 세지 않아요':'';
    return groups.map(function(g){return g.names.join('·')+(g.from>1?'('+g.from+'단계부터)':'')+' '+g.kind+' '+g.n+'회';}).join(', ')+' 이상'+rule;
  }
  // 인물별 누적 완료·기준·남은 기회(아직 기록되지 않은 단계 수)
  function residentTally(config,history){
    var done=history.map(function(h){return h.phase;}),last=done.length?Math.max.apply(null,done):0,out={};
    endingReactions(config,history).forEach(function(r){var from=Math.max(last+1,resident(config,r.id).fromPhase);out[r.id]={completed:r.completed,threshold:r.threshold,remaining:Math.max(0,config.phases.length-from+1)};});
    return out;
  }
  function endingReactions(config,history){
    var thresholds=satisfactionTargets(config);
    var images={haneul:'intro-haneul.webp',narae:'intro-narae.webp',jun:'intro-jun.webp',sol:'interlude-sol.webp',yuna:'interlude-cheer.webp',daeun:'interlude-cheer.webp',jinho:'interlude-influencer.webp'};
    var lines={
      haneul:['대학교에 갔다가 집으로 돌아오는 길까지 이어졌어요. 제 하루를 생각해 줘서 고마워요.','대학교에 가는 길도, 집으로 돌아오는 길도 필요해요. 다음에는 제 하루를 끝까지 이어 줄 수 있을까요?'],
      narae:['병원에 다녀와서 우리 마을로 돌아올 수 있었어요. 멀리 사는 사람도 잊지 않았네요. 고마워요.','우리 마을은 멀리 있지만, 여기에도 버스를 기다리는 사람이 있어요. 병원에 다녀오는 길을 조금 더 챙겨 줬으면 해요.'],
      jun:['기차역에서 일터까지, 일을 마치고 다시 역까지. 오가는 길을 함께 챙겨 줘서 든든했어요.','기차역에 내렸다고 이동이 끝나는 건 아니에요. 일터에 가는 길과 돌아오는 길이 모두 필요해요.'],
      sol:['새로 온 동네에서도 기차역에 갔다 돌아올 수 있었어요. 이제 저도 이 마을의 주민이라는 느낌이 들어요.','집은 이곳에 생겼는데, 오가는 길은 아직 충분하지 않네요. 새로 이사 온 사람의 하루도 함께 생각해 주세요.'],
      yuna:['운동장에서 일을 마친 뒤 친구 집으로, 다음 날에는 터미널까지. 두 날의 일정을 모두 마칠 수 있었어요. 고마워요!','경기가 끝난 뒤에도 제 이동은 계속돼요. 친구 집과 터미널까지 이어지는 밤의 노선도 챙겨 줬으면 해요.'],
      jinho:['신도시에서 솔잎몰까지, 방송 끝나고 집까지 버스로 이어졌어요! 채팅창에서도 이 마을 버스 좋다고 난리였어요. 줄 서 있던 다른 분들도 다 탔으면 좋겠네요.','몰 앞은 사람이 너무 많았어요. 화면에 안 잡히는 곳에서 기다리는 사람도 많겠죠? 저도 집에 갈 버스는 필요해요.'],
      daeun:['운동장에 가는 길부터 친구 집, 마지막 터미널까지 두 날 모두 이어졌어요. 돌아갈 길까지 있는 노선이라 좋았어요!','운동장에 가는 버스만으로는 제 일정이 끝나지 않아요. 경기 뒤 친구 집과 터미널로 가는 길도 필요해요.']
    };
    return config.residents.filter(function(r){return thresholds[r.id]!=null;}).map(function(r){
      var seen={},completed=0;history.forEach(function(h){if(seen[h.phase]||h.phase<r.fromPhase||h.phase>config.phases.length)return;seen[h.phase]=true;var rec=h.residents&&h.residents[r.id];if(rec&&(rec.satisfied!=null?rec.satisfied:rec.dayStatus==='complete'))completed++;});
      var satisfied=completed>=thresholds[r.id];
      var line=lines[r.id][satisfied?0:1];if(config.challengeApplied&&r.itineraries&&satisfied)line='운동장에서의 일정 뒤에도 다음 목적지까지 갈 수 있었어요. 돌아가는 길까지 함께 챙겨 줘서 고마워요!';
      return {id:r.id,name:r.name+' · '+(satisfied?'만족':'불만족'),satisfied:satisfied,completed:completed,threshold:thresholds[r.id],image:images[r.id],text:line+'\n'+'기준을 지켜 해낸 하루 '+completed+'회 · 만족 기준 '+thresholds[r.id]+'회 이상'};
    });
  }
  function won(n){var r=Math.round(n);return (n<0?'−':'')+(r===0&&n<0?'1':Math.abs(r).toLocaleString('ko-KR'))+'원'+(r===0&&n<0?' 미만':'');}
  function endingConclusion(reactions,history,end){
    var allSatisfied=reactions.length>0&&reactions.every(function(r){return r.satisfied;});
    var profit=history.reduce(function(total,h){return total+h.metrics.costs.total;},0);
    var verdict=allSatisfied?'다양한 사람들을 만족시켰다.':'도시 노선을 나름 잘 설계했다. 하지만 이게 최선이었을까?';
    var happy=reactions.filter(function(r){return r.satisfied;}).length,who=reactions.length?'주요 인물 '+reactions.length+'명 중 '+happy+'명이 만족했지만, ':'';
    if(end&&end.cause==='bankrupt')verdict=who+'학기 말 잔액이 '+won(profit)+'이라 파산했다. 주민의 이동은 지키면서 운영 비용을 다시 설계해 보자.';
    else if(end&&end.cause==='contract')verdict='단계 적자가 누적 세 번 쌓여 운영 계약이 종료됐다. 그동안 주민이 해낸 이동은 기록에 남아 있다. 어디서 돈이 나갔는지부터 다시 보자.';
    return {name:'솔잎마을의 한 학기',image:'intro-village.webp',allSatisfied:allSatisfied,profit:profit,verdict:verdict,text:verdict+'\n'+(end&&end.cause&&end.cause!=='complete'?'보유 잔액 ':'총 수익 ')+won(profit)+'\n지원금·운임에서 운영 비용을 뺀 '+history.length+'단계 누적 금액'};
  }
  // 결과 카드: 판정(Session.residentVerdict — 출발 경고와 같은 기준)과 구간별 상태
  function residentResult(rd,r,passengers,window){
    var complete=r.dayStatus==='complete',first=complete||r.dayStatus==='returnIncomplete';
    if(r.satisfied!=null){
      var legsV=[{o:r.o||rd.o,d:r.d||rd.d,state:first?'도착':'미도착'},{o:r.d||rd.d,d:r.finalDestination||rd.returnTo||rd.o,state:complete?'도착':first?'미도착':'아직 시작하지 못함'}];
      var labelV=r.satisfied?(rd.itineraries?'일정 완료 · 기준 충족':'왕복 완료 · 기준 충족'):complete?'이동은 마쳤지만 기준 미충족':first?(rd.itineraries?'다음 목적지에 도착하지 못했어요':'집에 돌아오지 못했어요'):'첫 목적지에 도착하지 못했어요';
      return {complete:!!r.satisfied,label:labelV,reason:(r.reasons||[]).map(function(x){return x.text;}).join(' '),legs:legsV};
    }
    var p=passengers.filter(function(p){return p.residentId===rd.id&&p.leg===(first?'return':'outbound');})[0],reason='';
    if(!complete){
      if(first&&r.returnT!=null&&r.returnT>=window)reason='첫 목적지 도착 후 체류를 마치니 운행 시간이 끝나, 다음 이동을 시작하지 못했어요. 첫 목적지에 더 일찍 도착할 수 있는지 살펴보세요.';
      else if(p&&p.fail==='NO_LINK')reason='이 구간을 연결하는 운행 노선이 없었어요. 두 정류장을 잇는 노선과 버스 배정을 살펴보세요.';
      else if(p&&p.deniedBoardings>0)reason='만차로 버스를 놓친 적이 있어요. 이것만이 원인이라고 단정할 수는 없지만, 차량 배정과 대기 시간을 살펴보세요.';
      else if(p&&p.status==='riding')reason='운행이 끝날 때도 버스 안에 있었어요. 이동 경로와 배차를 살펴보세요.';
      else if(p&&p.fail==='NO_TRIP_IN_WINDOW')reason='이동할 준비가 된 뒤에는 운행 시간 안에 도착할 수 있는 버스편이 없었어요.';
      else reason='운행 종료까지 이동을 마치지 못했어요. 연결 구간과 차량 배정을 살펴보세요.';
    }
    return {complete:complete,label:complete?(rd.itineraries?'일정 완료':'왕복 완료'):first?(rd.itineraries?'다음 목적지에 도착하지 못했어요':'집에 돌아오지 못했어요'):'첫 목적지에 도착하지 못했어요',reason:reason,
      legs:[{o:r.o||rd.o,d:r.d||rd.d,state:first?'도착':'미도착'},{o:r.d||rd.d,d:r.finalDestination||rd.returnTo||rd.o,state:complete?'도착':first?'미도착':'아직 시작하지 못함'}]};
  }
  // 운영 종료(파산·계약 종료) 화면의 재정 돌아보기 — 기록된 운행 수치만 쓴다(새 사건·추정 없음)
  // 사건 영향 = 돌발 수요 승객이 낸 운임(청원은 재정에 직접 영향 없음), 나머지 비용·운임은 노선과 버스 배치(선택)에서 나온다
  function financeReview(config,history){
    var F=config.finance,sum={holding:0,lease:0,op:0,fuel:0,fare:0,subsidy:0},noLink=0,notBoarded=0,resting=0,running=0,boardings=0,eventFare=0,eventPhases=[],eventUnknown=false;
    history.forEach(function(h){
      var k=Metrics.costParts(h.metrics.costs),m=h.metrics;Object.keys(sum).forEach(function(x){sum[x]+=k[x];});
      noLink+=m.noLink||0;notBoarded+=m.notBoarded?m.notBoarded.count:0;boardings+=m.boardings||0;
      var buses=h.plan&&h.plan.buses||[];buses.forEach(function(b){if(b.route)running++;else resting++;});
      if(h.event&&h.event.type==='demand'){if(h.eventFare==null)eventUnknown=true;else{eventFare+=h.eventFare;eventPhases.push(h.phase);}}
    });
    var costs=[['holding','차량 보유비',sum.holding],['op','관제·운영비',sum.op],['fuel','연료·정비비(주행거리)',sum.fuel]].concat(sum.lease?[['lease','임차료',sum.lease]]:[]).sort(function(a,b){return b[2]-a[2];});
    // 한 노선에 몰아 넣은 버스 수(단계별 최댓값)
    var crowd=0;history.forEach(function(h){var n={};(h.plan&&h.plan.buses||[]).forEach(function(b){if(!b.route)return;var id=b.route.nodes.join('-');n[id]=(n[id]||0)+1;crowd=Math.max(crowd,n[id]);});});
    var perBus=running?boardings/running:0,need=F.holding/F.fare,tips=[];
    if(resting)tips.push({code:'resting',text:'쉬는 버스도 대당 '+won(F.holding)+'씩 보유비가 나가요'+(F.basePerBus?'(기본 지원 '+won(F.basePerBus)+'을 받아도 '+won(F.holding-F.basePerBus)+'이 남아요)':'')+'. 이번 운영에서 쉬게 한 버스가 단계별로 합쳐 '+resting+'대였어요.'+(notBoarded?' 운행 종료까지 버스를 못 탄 요청('+notBoarded+'건)이 남은 노선에 넣으면 운임으로 일부를 메울 수 있어요.':' 이동 요청이 있는 구간에 넣어 운임을 받을 수 있는지 살펴보세요.')});
    if(noLink)tips.push({code:'noLink',text:'잇는 노선이 없어 떠나지 못한 요청이 '+noLink+'건이에요. 한 건을 이으면 운임 '+won(F.fare)+'이 생겨요. 정류장 연결부터 살펴보세요.'});
    if(running&&perBus<need)tips.push({code:'perBus',text:'운행한 버스 한 대가 단계마다 평균 '+(Math.round(perBus*10)/10)+'회 태웠어요. 보유비를 운임만으로 메우려면 대당 '+need+'회가 필요해요.'+(crowd>=3?' 한 노선에 버스를 최대 '+crowd+'대까지 넣은 단계가 있었어요. 버스를 여러 노선에 나눠 요청이 있는 정류장을 더 지나게 하면 대당 승차가 늘 수 있어요.':' 노선별 이용표에서 승차가 적은 노선의 버스를 요청이 남은 노선으로 옮길 수 있는지 살펴보세요.')});
    // 중복 구간: 서로 다른 노선 둘 이상이 같은 두 정류장 사이를 달린 단계(계획 기록에서 확인되는 것만)
    var shared=[];history.forEach(function(h){
      var seen={},count={};(h.plan&&h.plan.buses||[]).forEach(function(b){if(!b.route)return;var id=b.route.nodes.join('-');if(seen[id])return;seen[id]=true;
        var segs={};for(var i=0;i+1<b.route.nodes.length;i++){var a=b.route.nodes[i],c=b.route.nodes[i+1];segs[a<c?a+'–'+c:c+'–'+a]=true;}
        Object.keys(segs).forEach(function(k){count[k]=(count[k]||0)+1;});});
      Object.keys(count).forEach(function(k){if(count[k]>1)shared.push({phase:h.phase,seg:k});});
    });
    if(shared.length&&costs[0][0]!=='holding'){var segs=shared.map(function(x){return x.seg;}).filter(function(k,i,a){return a.indexOf(k)===i;});
      tips.push({code:'overlap',text:costs[0][1]+'가 '+won(costs[0][2])+'로 가장 컸어요. '+segs.slice(0,3).map(function(k){return k.split('–').map(function(id){return nodeName(config,id);}).join('–');}).join(', ')+' 구간을 노선 여러 개가 함께 달렸어요(단계별 합계 '+shared.length+'번). 겹친 구간의 승객이 그만큼 많았는지 노선별 이용표와 비교해 보세요.'});}
    return {
      totals:sum,costs:costs,crowd:crowd,noLink:noLink,notBoarded:notBoarded,resting:resting,running:running,perBus:perBus,
      event:{fare:eventFare,phases:eventPhases,unknown:eventUnknown},
      tips:tips.slice(0,3),
      caution:'이용이 적은 외곽 노선을 없애는 것만이 답은 아니에요. 공공서비스 수행분은 외곽·병원 같은 곳에 실제로 버스를 보낼 때 받는 돈이고, 외곽 주민의 하루도 학기 결과에 들어가요.'
    };
  }
  var api = { won:won, financeReview:financeReview, josa:josa, residentResult:residentResult,satisfactionTargets:satisfactionTargets,satisfactionText:satisfactionText,residentTally:residentTally,endingReactions:endingReactions,endingConclusion:endingConclusion, fill: fill, bubbles: bubbles, residentStory: residentStory, zoneSubtitleText: zoneSubtitleText, hookLines: hookLines, nodeName: nodeName };
  root.PB = root.PB || {};
  root.PB.Narrative = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
