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
  var Evaluation = NODE ? require('./resident-evaluation.js') : root.PB.ResidentEvaluation; // 인물 대기 판정 한 곳(P0-3)

  var MAX_BUBBLES = 12;

  function batchim(word) {
    var c = String(word).charCodeAt(String(word).length - 1);
    if (c < 0xac00 || c > 0xd7a3) return false;
    return (c - 0xac00) % 28 !== 0;
  }
  // 동적 낱말 뒤 조사: josa('다은','은는') → '다은은', josa('고속버스터미널','이었') → '고속버스터미널이었'
  var PAIRS = { '은는': ['은', '는'], '이가': ['이', '가'], '을를': ['을', '를'], '과와': ['과', '와'], '이었': ['이었', '였'], '으로': ['으로', '로'], '이에요': ['이에요', '예요'] };
  function particle(word, kind) {
    var w = String(word), p = PAIRS[kind], c = w.charCodeAt(w.length - 1);
    if (!p) return '';
    if (kind === '으로' && c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 === 8) return '로'; // ㄹ 받침은 ‘로’
    return batchim(w) ? p[0] : p[1];
  }
  function josa(word, kind) { return String(word) + particle(word, kind); }
  // 괄호 풀이가 낱말 뒤에 붙을 때: 조사는 괄호 앞 낱말의 받침을 따른다 — josaNote('산업·일자리','20건 중 10건','과와') → '산업·일자리(20건 중 10건)와'
  function josaNote(word, note, kind) { return String(word) + '(' + note + ')' + particle(word, kind); }
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
      /* 2026-11-12 랜덤 검토 2번: 노선은 이어져 있지만 갈아타기가 두 번 넘게 필요한 이동 — ‘노선 없음’과 따로 */
      if (p.fail === 'TOO_MANY_TRANSFERS') push(p.t, p, p.o, 'transfers', fill(B.transfers.text, { stop: nodeName(config, p.d) }), 1);
      if (p.fail === 'NO_LINK' || p.fail === 'TOO_MANY_TRANSFERS') return; // 노선이 없어 떠나지 못한 사람은 ‘기다린’ 것이 아니다(노선 없음 말풍선만)
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
      var k = (b.kind === 'noLink' || b.kind === 'transfers') && !b.residentId ? b.kind + p.o + p.d : (b.pid || 'n' + b.node + b.t) + b.kind;
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

  /* 2026-11-05 P2: 엔딩 카드 ‘5일 중 5일 왕복’과 컷 ‘기준을 지켜 해낸 하루 4회’가 따로 나와 어긋나 보였다 — 왕복한 날과 기준을 지킨 날을 한 문장으로 */
  function dayKept(r) { return r.satisfied != null ? !!r.satisfied : r.dayStatus === 'complete'; }
  function dayLine(config, who, days, complete, kept) {
    var word = who.itineraries ? '일정' : '왕복', sv = config.service, rule = sv && sv.maxWait != null ? '기준(' + Demand.duration(config, sv.maxWait) + ' 이내)' : '기준';
    /* 2026-11-11 플레이테스트 4: 단위를 인물 카드(‘누적 0/1회’)와 같은 ‘회’로 — 전에는 엔딩만 ‘2일 중 일정 0일’이었다 */
    return (days === complete ? word + ' ' + complete + '회 중 ' : days + '회 중 ' + word + ' ' + complete + '회, 그중 ') + rule + '을 지킨 것은 ' + kept + '회예요.';
  }
  function residentStory(records, residentId, config) {
    if(config.day){
      var who=resident(config,residentId),evidence=records.map(function(r,i){return r?Object.assign({phase:i+1},r):null;}).filter(Boolean);
      if(!who||!evidence.length)return null;
      var lastDay=evidence[evidence.length-1],complete=evidence.filter(function(r){return r.dayStatus==='complete';}).length,kept=evidence.filter(dayKept).length,tally=dayLine(config,who,evidence.length,complete,kept);
      if(who.itineraries)return {residentId:residentId,name:who.name,role:who.role,conditionKey:'day.itinerary',evidence:evidence,drop:null,
        text:josa(who.name,'은는')+' '+tally+' 마지막 일정은 '+nodeName(config,lastDay.o)+' → '+nodeName(config,lastDay.d)+' → '+josa(nodeName(config,lastDay.finalDestination),'이었')+'어요.',
        closing:lastDay.dayStatus==='complete'?'마지막 목적지에 '+Demand.clock(config,lastDay.homeT)+' 도착했어요.':lastDay.dayStatus==='returnIncomplete'?'운동장에는 도착했지만 마지막 이동을 마치지 못했어요.':'운동장까지의 첫 이동을 마치지 못했어요.'};
      return {residentId:residentId,name:who.name,role:who.role,conditionKey:'day.roundTrip',evidence:evidence,drop:null,
        text:who.name+'의 '+nodeName(config,who.o)+' → '+nodeName(config,who.d)+' → '+nodeName(config,who.o)+' 일정은 '+tally,
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
    return [fill(H.line1.text, { buses: session.owned, requests: reqs }), empty?'아직 정해진 길은 없어요. 우리 마을의 첫 노선을 직접 연결해 보세요.':fill(throughF ? H.line2Served.text : H.line2.text, {})];
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
      var seen={},completed=0,days=0,finished=0;history.forEach(function(h){if(seen[h.phase]||h.phase<r.fromPhase||h.phase>config.phases.length)return;seen[h.phase]=true;var rec=h.residents&&h.residents[r.id];if(rec)days++;if(rec&&rec.dayStatus==='complete')finished++;if(rec&&(rec.satisfied!=null?rec.satisfied:rec.dayStatus==='complete'))completed++;});
      var satisfied=completed>=thresholds[r.id];
      var line=lines[r.id][satisfied?0:1];if(config.challengeApplied&&r.itineraries&&satisfied)line='운동장에서의 일정 뒤에도 다음 목적지까지 갈 수 있었어요. 돌아가는 길까지 함께 챙겨 줘서 고마워요!';
      return {id:r.id,name:r.name+' · '+(satisfied?'만족':'불만족'),satisfied:satisfied,completed:completed,threshold:thresholds[r.id],image:images[r.id],text:line+'\n'+dayLine(config,r,days,finished,completed)+' 만족 기준은 '+thresholds[r.id]+'회 이상이에요(누적 '+completed+'/'+thresholds[r.id]+'회).'};
    });
  }
  function won(n){var r=Math.round(n);return (n<0?'−':'')+(r===0&&n<0?'1':Math.abs(r).toLocaleString('ko-KR'))+'원'+(r===0&&n<0?' 미만':'');}
  function endingConclusion(reactions,history,end){
    var allSatisfied=reactions.length>0&&reactions.every(function(r){return r.satisfied;});
    var profit=history.reduce(function(total,h){return total+h.metrics.costs.total;},0);
    /* 2026-11-11 플레이테스트 13: 총평만 반말 평서체였다 — 다른 화면처럼 해요체로. 금액 이름은 다른 화면과 같은 ‘누적 잔액’(운영 종료 때는 ‘보유 잔액’ 그대로) */
    var verdict=allSatisfied?'다양한 사람들을 만족시켰어요.':'도시 노선을 나름 잘 설계했어요. 하지만 이게 최선이었을까요?';
    var happy=reactions.filter(function(r){return r.satisfied;}).length,who=reactions.length?'주요 인물 '+reactions.length+'명 중 '+happy+'명이 만족했지만, ':'';
    if(end&&end.cause==='bankrupt')verdict=who+'학기 말 잔액이 '+won(profit)+'이라 파산했어요. 주민의 이동은 지키면서 운영 비용을 다시 설계해 봐요.';
    else if(end&&end.cause==='contract')verdict='단계 적자가 누적 세 번 쌓여 운영 계약이 종료됐어요. 그동안 주민이 해낸 이동은 기록에 남아 있어요. 어디서 돈이 나갔는지부터 다시 봐요.';
    return {name:'솔잎마을의 한 학기',image:'intro-village.webp',allSatisfied:allSatisfied,profit:profit,verdict:verdict,text:verdict+'\n'+(end&&end.cause&&end.cause!=='complete'?'보유 잔액 ':'누적 잔액 ')+won(profit)+'\n지원금·운임에서 운영 비용을 뺀 '+history.length+'단계 합계'};
  }
  // 결과 카드: 판정(Session.residentVerdict — 출발 경고와 같은 기준)과 구간별 상태
  function residentResult(rd,r,passengers,window){
    var complete=r.dayStatus==='complete',first=complete||r.dayStatus==='returnIncomplete';
    if(r.satisfied!=null){
      var legsV=[{o:r.o||rd.o,d:r.d||rd.d,state:first?'도착':'아직 못 감'},{o:r.d||rd.d,d:r.finalDestination||rd.returnTo||rd.o,state:complete?'도착':first?'아직 못 감':'아직 시작하지 못함'}];
      var labelV=r.satisfied?(rd.itineraries?'일정 완료 · 기준 충족':'왕복 완료 · 기준 충족'):complete?'이동은 마쳤지만 기준 미충족':first?(rd.itineraries?'다음 목적지에 도착하지 못했어요':'집에 돌아오지 못했어요'):'첫 목적지에 도착하지 못했어요';
      return {complete:!!r.satisfied,label:labelV,reason:(r.reasons||[]).map(function(x){return x.text;}).join(' '),legs:legsV};
    }
    var p=passengers.filter(function(p){return p.residentId===rd.id&&p.leg===(first?'return':'outbound');})[0],reason='';
    if(!complete){
      if(first&&r.returnT!=null&&r.returnT>=window)reason='첫 목적지 도착 후 체류를 마치니 운행 시간이 끝나, 다음 이동을 시작하지 못했어요. 첫 목적지에 더 일찍 도착할 수 있는지 살펴보세요.';
      else if(p&&p.fail==='NO_LINK')reason='이 구간을 연결하는 운행 노선이 없었어요. 두 정류장을 잇는 노선과 버스 배정을 살펴보세요.';
      else if(p&&p.fail==='TOO_MANY_TRANSFERS')reason='노선은 이어져 있지만 갈아타기를 두 번 해야 해서 못 갔어요(갈아타기는 한 번까지). 한 번만 갈아타도 되게 노선을 이어 보세요.';
      else if(p&&p.deniedBoardings>0)reason='만차로 버스를 놓친 적이 있어요. 이것만이 원인이라고 단정할 수는 없지만, 차량 배정과 대기 시간을 살펴보세요.';
      else if(p&&p.status==='riding')reason='운행이 끝날 때도 버스 안에 있었어요. 이동 경로와 배차를 살펴보세요.';
      else if(p&&p.fail==='NO_TRIP_IN_WINDOW')reason='이동할 준비가 된 뒤에는 운행 시간 안에 도착할 수 있는 버스편이 없었어요.';
      else reason='운행 종료까지 이동을 마치지 못했어요. 연결 구간과 차량 배정을 살펴보세요.';
    }
    return {complete:complete,label:complete?(rd.itineraries?'일정 완료':'왕복 완료'):first?(rd.itineraries?'다음 목적지에 도착하지 못했어요':'집에 돌아오지 못했어요'):'첫 목적지에 도착하지 못했어요',reason:reason,
      legs:[{o:r.o||rd.o,d:r.d||rd.d,state:first?'도착':'아직 못 감'},{o:r.d||rd.d,d:r.finalDestination||rd.returnTo||rd.o,state:complete?'도착':first?'아직 못 감':'아직 시작하지 못함'}]};
  }
  // 운영 종료(파산·계약 종료) 화면의 재정 돌아보기 — 기록된 운행 수치만 쓴다(새 사건·추정 없음)
  // 사건 영향 = 돌발 수요 승객이 낸 운임(청원은 재정에 직접 영향 없음), 나머지 비용·운임은 노선과 버스 배치(선택)에서 나온다
  function financeReview(config,history){
    var F=config.finance,sum={holding:0,lease:0,op:0,fuel:0,fare:0,subsidy:0},noLink=0,transfers=0,notBoarded=0,resting=0,running=0,boardings=0,eventFare=0,eventPhases=[],eventUnknown=false;
    history.forEach(function(h){
      var k=Metrics.costParts(h.metrics.costs),m=h.metrics;Object.keys(sum).forEach(function(x){sum[x]+=k[x];});
      noLink+=m.noLink||0;transfers+=m.transfers||0;notBoarded+=m.notBoarded?m.notBoarded.count:0;boardings+=m.boardings||0;
      var buses=h.plan&&h.plan.buses||[];buses.forEach(function(b){if(b.route)running++;else resting++;});
      if(h.event&&h.event.type==='demand'){if(h.eventFare==null)eventUnknown=true;else{eventFare+=h.eventFare;eventPhases.push(h.phase);}}
    });
    var costs=[['holding','차량 보유비',sum.holding],['op','관제·운영비',sum.op],['fuel','연료·정비비(주행거리)',sum.fuel]].concat(sum.lease?[['lease','임차료',sum.lease]]:[]).sort(function(a,b){return b[2]-a[2];});
    // 한 노선에 몰아 넣은 버스 수(단계별 최댓값)
    var crowd=0;history.forEach(function(h){var n={};(h.plan&&h.plan.buses||[]).forEach(function(b){if(!b.route)return;var id=b.route.nodes.join('-');n[id]=(n[id]||0)+1;crowd=Math.max(crowd,n[id]);});});
    var perBus=running?boardings/running:0,need=F.holding/F.fare,tips=[];
    if(resting)tips.push({code:'resting',text:'쉬는 버스도 대당 '+won(F.holding)+'씩 보유비가 나가요'+(F.basePerBus?'(기본 지원 '+won(F.basePerBus)+'을 받아도 '+won(F.holding-F.basePerBus)+'이 남아요)':'')+'. 이번 운영에서 쉬게 한 버스가 단계별로 합쳐 '+resting+'대였어요.'+(notBoarded?' 운행 종료까지 버스를 못 탄 요청('+notBoarded+'건)이 남은 노선에 넣으면 운임으로 일부를 메울 수 있어요.':' 이동 요청이 있는 구간에 넣어 운임을 받을 수 있는지 살펴보세요.')});
    if(transfers)tips.push({code:'transfers',text:'갈아타기를 두 번 해야 해서 못 간 요청이 '+transfers+'건이에요(갈아타기는 한 번까지). 두 노선이 한 정류장에서 만나게 이어 보세요.'});
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
      tips.push({code:'overlap',text:costs[0][1]+'가 '+won(costs[0][2])+'로 가장 컸어요. '+segs.slice(0,3).map(function(k){return k.split('–').map(function(id){return nodeName(config,id);}).join('–');}).join(', ')+' 구간을 노선 여러 개가 함께 달렸어요(단계별 합계 '+shared.length+'회). 겹친 구간의 승객이 그만큼 많았는지 노선별 이용표와 비교해 보세요.'});}
    return {
      totals:sum,costs:costs,crowd:crowd,noLink:noLink,transfers:transfers,notBoarded:notBoarded,resting:resting,running:running,perBus:perBus,
      event:{fare:eventFare,phases:eventPhases,unknown:eventUnknown},
      tips:tips.slice(0,3),
      caution:'이용이 적은 외곽 노선을 없애는 것만이 답은 아니에요. 공공서비스 수행분은 외곽·병원 같은 곳에 실제로 버스를 보낼 때 받는 돈이고, 외곽 주민의 하루도 학기 결과에 들어가요.'
    };
  }
  /* ── 2026-11-01 단계 전 설명을 결과 화면으로: 순수 함수(화면 문장·판정만, 계산 규칙은 그대로) ── */
  // 학기 말 기준 상태: 이미 달성 / 남은 단계를 모두 해내도 못 채움(‘기준 달성 불가’) / 아직 가능
  // t = residentTally의 한 줄 {completed, threshold, remaining}(remaining = 아직 기록되지 않은 단계 수)
  /* 누적 횟수 표시(2026-11-12 랜덤 검토 10번): 목표를 넘으면 ‘7/6회’ 대신 ‘6/6회 달성(+1)’. short = 칩처럼 좁은 곳(‘6/6(+1)’) */
  function tallyText(done, need, short) {
    if (need == null) return String(done);
    if (done > need) return need + '/' + need + (short ? '(+' + (done - need) + ')' : '회 달성(+' + (done - need) + ')');
    return done + '/' + need + (short ? '' : '회');
  }
  function criterionState(t) {
    if (!t) return null;
    if (t.completed >= t.threshold) return 'done';
    if (t.completed + t.remaining < t.threshold) return 'impossible';
    return 'open';
  }
  // 연속으로 같은 항목을 하나로 합친다(‘운행 중 들린 말’의 같은 문장 반복 → ×N). keyFn이 같은 값을 내면 같은 항목
  function mergeRepeats(list, keyFn) {
    var out = [];
    (list || []).forEach(function (it) {
      var k = keyFn(it), last = out[out.length - 1];
      if (last && last.key === k) { last.count++; last.last = it; } else out.push({ key: k, item: it, last: it, count: 1 });
    });
    return out;
  }
  // 결과와 ‘생각해 보기’ 질문을 잇는 한 줄: 그 단계 질문이 다루는 곳(출발 또는 도착)의 이동 중 도착하지 못한 건수
  var THEME = { 1: ['F'], 2: ['C', 'D'], 3: ['I'], 4: ['H', 'J'], 5: ['K'], 6: ['L'], 7: ['D', 'K', 'F'], 8: ['N'] };
  /* P0-4(2026-11-02) + 2026-11-05 P0-3: 연결 문장은 이번 결과로 고른다.
   *  · 첫 줄 수치 = 목적지까지 못 간 이동이 가장 많은 출발 생활권. 결과 ‘자세히’의 ‘가장 많이 남은 곳’(#score-worst)과 같은 값 — mobility(Scores)를 넘기면 그 worst·zones를 그대로 쓴다.
   *    예전 저장본처럼 mobility가 없으면 승객 기록에서 같은 규칙(못 간 이동 건수 최다, 같으면 정류장 순서)으로 센다
   *  · 단계 주제 지역(THEME)은 유지. 주제 지역이 최다가 아니면 ‘가장 많이 남은 곳은 X · 이번 단계에서 살펴볼 곳은 Y’로 둘을 구분한다
   *  · 주제 지역 출발 도착률 90% 미만(또는 출발 이동 없음)이면 단계 고정 질문(phaseEthics)을 보이고(ethics: true), 90% 이상이면 보이지 않는다(ethics: false) */
  var FOCUS_RATE = 0.9, FOCUS_MIN_N = 5; // 2026-11-06 P1-4: 건수가 너무 적은 곳(1건 중 1건)이 비율로 앞서지 않게. 그런 곳뿐이면 그대로 쓴다
  /* 2026-11-11 교사 플레이테스트 1·10:
   *  · 목적지까지 못 간 이동이 0건인 곳은 ‘살펴볼 곳’으로 짚지 않는다(주제 지역이 여러 곳이면 못 간 이동이 있는 곳만). 짚을 곳이 없으면 그 문장을 뺀다.
   *  · 다만 AI가 못 본 곳(opts.unseen[id] = {seen: 0, real: n} — ‘AI가 본 이동과 실제 이동’ 카드와 같은 값)은 까닭을 적어 한 줄 남긴다(‘살펴볼 곳’이라 부르지 않음).
   *  · 문장 끝의 ‘다음에는 누구의 이동을 살필까요?’는 바로 아래 소제목과 겹쳐서 뺐다.
   *  · 괄호 뒤 조사(과/와·이에요/예요)는 괄호 앞 낱말의 받침을 따른다 */
  function thinkFocus(config, phase, passengers, mobility, opts) {
    var ids = (THEME[phase] || []).filter(function (id) { return config.nodes.some(function (n) { return n.id === id && (n.fromPhase || 1) <= phase; }); });
    if (!ids.length) return { bridge: '', ethics: true };
    var ps = passengers || [], names = ids.map(function (id) { return nodeName(config, id); }).join('·'), zones = mobility && mobility.zones, unseen = (opts && opts.unseen) || {};
    function stat(list) {
      var N = 0, arrived = 0;
      if (zones) list.forEach(function (id) { var z = zones[id]; if (z) { N += z.N; arrived += z.done; } });
      else ps.forEach(function (p) { if (list.indexOf(p.o) >= 0) { N++; if (p.status === 'arrived') arrived++; } });
      return { N: N, arrived: arrived, left: N - arrived, rate: N ? arrived / N : null };
    }
    /* 2026-11-06 P1-4: 데이터 줄은 남은 비율이 가장 큰 출발지 먼저(같으면 남은 건수), 비율까지 같은 둘째 곳도 함께. 주제 지역 줄은 그다음. 주제 지역이 가장 나쁠 때만 한 줄 */
    var t = stat(ids), pool = config.nodes.map(function (n) { var z = stat([n.id]); z.id = n.id; return z; }).filter(function (z) { return z.left > 0; });
    var enough = pool.filter(function (z) { return z.N >= FOCUS_MIN_N; }); if (enough.length) pool = enough;
    pool.sort(function (a, b) { return b.left / b.N - a.left / a.N || b.left - a.left; });
    var worst = pool[0] || null, tied = pool[1] && pool[1].left / pool[1].N === worst.left / worst.N ? pool[1] : null;
    /* 살펴볼 곳 = 주제 지역 가운데 못 간 이동이 있는 곳만 */
    var open = ids.filter(function (id) { return stat([id]).left > 0; }), f = stat(open), openNames = open.map(function (id) { return nodeName(config, id); }).join('·');
    var ethics = !t.N || t.rate < FOCUS_RATE, line = '', pick = null;
    /* 2026-11-12 랜덤 검토 11번: 다음 운행 목표는 한 곳만, 이유 한 줄. 이번 단계 주제 지역에 못 간 이동이 있으면 그곳(못 간 비율이 큰 곳, 같으면 건수) —
     * 단계가 챙기기로 한 곳이라서. 없으면 못 간 비율이 가장 큰 출발지(같으면 건수·정류장 순). 예전 ‘남은 비율이 가장 큰 곳은 … 살펴볼 곳은 …’(두 곳) 대신 */
    if (open.length) {
      pick = open.map(function (id) { var z = stat([id]); z.id = id; return z; }).sort(function (a, b) { return b.left / b.N - a.left / a.N || b.left - a.left; })[0];
      line = '다음 운행에서 살펴볼 곳은 ' + josa(nodeName(config, pick.id), '이에요') + '. 이번 단계가 챙기기로 한 곳인데 출발한 이동 ' + pick.N + '건 중 ' + pick.left + '건이 목적지까지 못 갔어요.';
    } else if (worst) {
      pick = worst;
      line = '다음 운행에서 살펴볼 곳은 ' + josa(nodeName(config, pick.id), '이에요') + '. 출발한 이동 가운데 목적지까지 못 간 비율이 가장 커요(' + pick.N + '건 중 ' + pick.left + '건).';
    }
    if (!t.N) line += (line ? ' ' : '') + '이번에는 ' + names + '에서 출발한 이동이 없었어요.';
    else if (!worst) line = names + '에서 출발한 이동 ' + t.N + '건이 모두 도착했어요.';
    /* 모두 도착했지만 AI가 못 본 주제 지역: 왜 짚는지 까닭을 적는다 */
    ids.forEach(function (id) {
      var u = unseen[id], z = stat([id]);
      if (!u || u.seen !== 0 || !(u.real > 0) || !z.N || z.left > 0) return;
      line += (line ? ' ' : '') + josa(nodeName(config, id), '은는') + (worst ? ' 출발 ' + z.N + '건이 모두 도착했지만,' : '') + ' AI가 본 이동 0건 · 실제 ' + u.real + '건이라 AI 제안에서 빠지기 쉬운 곳이에요.';
    });
    return { bridge: line, ethics: ethics, theme: t, worst: worst, focus: pick ? [pick.id] : [], pick: pick ? pick.id : null };
  }
  function bridgeLine(config, phase, passengers, mobility, opts) { return thinkFocus(config, phase, passengers, mobility, opts).bridge; }
  // 인물 결과 한 줄: 어느 이동인지, 어디서 얼마나 기다렸는지, 만차·노선 없음, 그 노선의 버스 수·간격
  // routeInfo(routeId) → {num, buses, headway} | null (화면이 운행 계획에서 찾아 넘긴다. 없으면 노선 정보 생략)
  function residentLine(config, rd, rec, passengers, routeInfo) {
    var name = function (id) { return nodeName(config, id); }, dur = function (t) { return Demand.duration(config, t); };
    var mine = (passengers || []).filter(function (p) { return p.residentId === rd.id; });
    var out = mine.filter(function (p) { return p.leg === 'outbound'; })[0], back = mine.filter(function (p) { return p.leg === 'return'; })[0];
    var o = (rec && rec.o) || rd.o, d = (rec && rec.d) || rd.d, home = (rec && rec.finalDestination) || rd.returnTo || rd.o;
    var outLabel = name(o) + '→' + name(d), backLabel = name(d) + '→' + name(home) + (home === o ? ' 귀가' : ' 이동');
    function routeText(p) {
      var leg = p.journey && p.journey[Math.min(p.legIndex || 0, p.journey.length - 1)], info = leg && routeInfo ? routeInfo(leg.routeId) : null;
      if (!info) return '';
      return ' (' + (root.PB && root.PB.Names ? root.PB.Names.route(info.num) : info.num + '번 노선') + ' 버스 ' + info.buses + '대' + (info.headway != null ? ', 간격 ' + dur(info.headway) : '') + ')';
    }
    function legText(p, label) {
      if (p.fail === 'NO_LINK') return label + ', 잇는 노선이 없었어요';
      if (p.fail === 'TOO_MANY_TRANSFERS') return label + ', '+'갈아타기를 두 번 해야 해서 못 갔어요(갈아타기는 한 번까지)';
      if (p.fail === 'NO_TRIP_IN_WINDOW') return label + ', 운행 시간 안에 탈 버스편이 없었어요';
      var at = (p.boardings || 0) <= 1 ? name(p.o) + '에서 ' : '갈아타는 곳까지 합쳐 ';
      var txt = label + ', ' + at + dur(p.waitTotal) + ' 대기';
      if (p.deniedBoardings > 0) txt += ' · 만차로 ' + p.deniedBoardings + '번 못 탐';
      if (p.status === 'riding') txt += ' · 버스 안에서 운행이 끝남';
      return txt + routeText(p);
    }
    var head = rd.name + ' · ';
    if (!rec) return head + '이번 단계에는 이동이 없었어요.';
    if (rec.satisfied) {
      var longest = rec.longestWait != null ? rec.longestWait : Evaluation.legWaits(passengers, rd.id).longest, svc = config.service || {};
      return head + outLabel + (back ? ', 돌아오는 길까지' : '') + ' 마쳤어요 (가장 긴 대기 ' + dur(longest) + (svc.maxWait != null ? ' / 기준 ' + dur(svc.maxWait) : '') + ')';
    }
    if (rec.dayStatus === 'outboundIncomplete' && out) return head + legText(out, outLabel);
    if (rec.dayStatus === 'returnIncomplete') {
      if (back) return head + legText(back, backLabel);
      return head + outLabel + ' 도착' + (out && out.arriveT != null ? ' ' + Demand.clock(config, out.arriveT) : '') + ', 머무는 시간을 채우니 운행이 끝나 ' + backLabel + '을 시작하지 못했어요';
    }
    // 이동은 마쳤지만 대기·소요 기준을 넘긴 경우: 기준을 넘긴 이동을 고른다
    var sv = config.service || {}, worst = [out, back].filter(Boolean).sort(function (a, b) { return b.waitTotal - a.waitTotal; })[0];
    if (worst) return head + legText(worst, worst === back ? backLabel : outLabel) + (Evaluation.overWait(config, worst.waitTotal) ? ', 기준 ' + dur(sv.maxWait) + ' 넘김' : '');
    return head + ((rec.reasons || [])[0] ? rec.reasons[0].text : '이동을 마치지 못했어요.');
  }
  var api = { tallyText: tallyText, criterionState: criterionState, mergeRepeats: mergeRepeats, bridgeLine: bridgeLine, thinkFocus: thinkFocus, residentLine: residentLine, THEME: THEME, won:won, financeReview:financeReview, josa:josa, josaNote:josaNote, residentResult:residentResult,satisfactionTargets:satisfactionTargets,satisfactionText:satisfactionText,residentTally:residentTally,endingReactions:endingReactions,endingConclusion:endingConclusion, fill: fill, bubbles: bubbles, residentStory: residentStory, zoneSubtitleText: zoneSubtitleText, hookLines: hookLines, nodeName: nodeName };
  root.PB = root.PB || {};
  root.PB.Narrative = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
