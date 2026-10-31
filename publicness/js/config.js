/*
 * 시나리오 설정 — PRD v2의 모든 초기 조정값을 한 곳에 모은다.
 * 이 값들은 플레이테스트로 바꿀 수 있는 게임 조정값이며 실제 교통·재정 모형이 아니다.
 * 값을 바꾸면 SCENARIO_VERSION을 올리고 node --test publicness/tests/ 를 다시 돌린다.
 */
(function (root) {
  'use strict';

  var T = true;
  function allStop(nodes) { return { nodes: nodes, stops: nodes.map(function () { return T; }) }; }

  var config = {
    SCENARIO_VERSION: 'pb-3.0.0',
    day: { start: 300, end: 1380 },
    progression: { routes: [2, 3, 4, 4, 4], buses: [2, 3, 4, 5, 6] },
    challenge: {
      phases: ['나들이의 계절','붐비는 도시','경계 너머의 하루'],
      targets: {haneul:6,narae:6,jun:6,sol:4,yuna:3,daeun:3,jinho:1},
      // 도전 모드에만 나오는 인물: 7단계 솔잎몰 개장 라이브 방송을 하러 가는 인플루언서(몰 방문 몰림 시각에 출발, 몰 귀가 시각에 돌아옴)
      residents: [{ id: 'jinho', name: '진호', role: '인플루언서', o: 'I', d: 'M', fromPhase: 7, depart: 47, returnAt: 91, stay: 20 }],
      nodes: [{id:'L',name:'호수공원',x:-4.6,y:-2.3,fromPhase:6},{id:'M',name:'솔잎몰',x:2.7,y:.2,fromPhase:7},{id:'N',name:'대도시',x:8.7,y:0,fromPhase:8}],
      demandRows: [{a:'B',b:'M',n:18,fromPhase:7},{a:'I',b:'M',n:16,fromPhase:7},{a:'E',b:'M',n:10,fromPhase:7},{a:'A',b:'M',n:8,fromPhase:7},{a:'J',b:'M',n:8,fromPhase:7},{a:'B',b:'N',n:18,fromPhase:8},{a:'I',b:'N',n:12,fromPhase:8},{a:'F',b:'N',n:6,fromPhase:8}],
      families: {fromPhase:6,destination:'L',origins:['B','F','I'],members:4,depart:45,returnAt:85,stay:20}
    },
    // Fixed design pixels, independent of viewport. All engine time values are seconds.
    map: { pixelsPerUnit: 110, pixelsPerSecond: 110 },

    // 생활권과 정류장 (PRD §4). x,y = 고정 카메라 배치용 평면 좌표(지도 1칸 = 1km). 2026-10-27 세로 ×1.3으로 펼침(옛 y × 1.3, 상대 위치 유지)
    nodes: [
      { id: 'A', name: '기차역', x: -0.6, y: -3.38, fromPhase: 1 },
      { id: 'B', name: '밀집 주거지', x: -2.4, y: -0.78, fromPhase: 1 },
      { id: 'C', name: '대학교', x: -2, y: 2.6, fromPhase: 1 },
      { id: 'D', name: '병원·공공서비스', x: 3, y: -2.34, fromPhase: 1 },
      { id: 'E', name: '구도심 시장', x: 1.2, y: 2.34, fromPhase: 1 },
      { id: 'F', name: '외곽 마을', x: -4.8, y: 3.64, fromPhase: 1 },
      { id: 'G', name: '산업·일자리', x: 4.4, y: 0.65, fromPhase: 1 },
      { id: 'H', name: '종합운동장', x: 0, y: -0.26, fromPhase: 2 },
      { id: 'I', name: '신도시', x: 4.8, y: -2.73, fromPhase: 3 },
      { id: 'J', name: '고속버스터미널', x: 4.4, y: 3.51, fromPhase: 4 },
      { id: 'K', name: '어린이·노인복지관', x: -4.4, y: 0.91, fromPhase: 5 }
    ],

    // 제어된 테스트용 기존 도로. 실제 지도에서는 map 거리 공식으로 모든 구간을 생성한다.
    roads: [
      { a: 'A', b: 'B', min: 2, fromPhase: 1 },
      { a: 'B', b: 'C', min: 2, fromPhase: 1 },
      { a: 'C', b: 'D', min: 2, fromPhase: 1 },
      { a: 'D', b: 'A', min: 2, fromPhase: 1 },
      { a: 'D', b: 'E', min: 2, fromPhase: 1 },
      { a: 'E', b: 'G', min: 2, fromPhase: 1 },
      { a: 'G', b: 'A', min: 2, fromPhase: 1 },
      { a: 'A', b: 'H', min: 2, fromPhase: 1 },
      { a: 'H', b: 'G', min: 3, fromPhase: 1 },
      { a: 'C', b: 'F', min: 3, fromPhase: 1 },
      { a: 'B', b: 'F', min: 4, fromPhase: 1 },
      { a: 'G', b: 'I', min: 3, fromPhase: 3 },
      { a: 'E', b: 'I', min: 4, fromPhase: 3 }
    ],

    // 기본 수요 (PRD §6) — 표 순서 그대로. 각 방향 n명
    demandRows: [
      { a: 'B', b: 'A', n: 12, fromPhase: 1 },
      { a: 'B', b: 'C', n: 10, fromPhase: 1 },
      { a: 'B', b: 'G', n: 10, fromPhase: 1 },
      { a: 'F', b: 'D', n: 6, fromPhase: 1 },
      { a: 'F', b: 'C', n: 6, fromPhase: 1 },
      { a: 'E', b: 'A', n: 8, fromPhase: 1 },
      { a: 'E', b: 'D', n: 6, fromPhase: 1 },
      { a: 'G', b: 'A', n: 10, fromPhase: 1 },
      { a: 'H', b: 'A', n: 6, fromPhase: 2 },
      { a: 'I', b: 'A', n: 8, fromPhase: 3 },
      { a: 'I', b: 'D', n: 8, fromPhase: 3 },
      { a: 'J', b: 'A', n: 6, fromPhase: 4 },
      { a: 'J', b: 'E', n: 4, fromPhase: 4 },
      { a: 'J', b: 'H', n: 4, fromPhase: 4 },
      { a: 'F', b: 'K', n: 3, fromPhase: 5 },
      { a: 'B', b: 'K', n: 3, fromPhase: 5 },
      { a: 'A', b: 'C', n: 3, fromPhase: 1, toPhase: 3 },
      { a: 'A', b: 'C', n: 2, fromPhase: 4 },
      { a: 'J', b: 'C', n: 1, fromPhase: 4 },
      // 신도시 성장(2026-10-22 결정): 4단계 일터·대학교, 5단계 시장·기차역 이동이 더해져 5단계에 밀집 주거지 수준이 된다.
      // 기존 행의 시각 배치(r 번호)가 바뀌지 않게 맨 뒤에 붙인다
      { a: 'I', b: 'G', n: 5, fromPhase: 4 },
      { a: 'I', b: 'C', n: 4, fromPhase: 4 },
      { a: 'I', b: 'E', n: 6, fromPhase: 5 },
      { a: 'I', b: 'A', n: 5, fromPhase: 5 }
    ],

    bus: { capacity: 12, window: 120, requestWindow: 90, offsets: [0], initialBuses: 2, maxBuses: 6, autoSpacing: true, depot: 'A', dwell: 1, transferMin: 1 },
    // 재정(2026-10-27 개편, 게임용 가상 수치) — 근거·대표 전략 비교는 tools/econ-review.cjs
    finance: {
      fare: 1000,              // 이동 요청당 첫 탑승 때 1번(환승 추가 요금 없음)
      basePerBus: 10000,       // 기본 지원: 기본 제공 차량 1대당(보유비의 절반 — 운행하지 않으면 남지 않는다)
      holding: 20000,          // 기본 제공 차량 보유비(쉬어도 듦)
      opPerMin: 100,           // 관제·운영비: 운행 배정 차량의 하루 근무 시간당(120 × 100 = 대당 12,000원)
      fuelPerKm: 150,          // 연료·정비비: 실제 주행거리 1km당(지도 좌표 1 = 1km)
      lease: { fee: 25000, perPhase: 2 }, // 추가 임차: 이번 단계 1대당(보유비 대신 — 쉬어도 듦), 단계당 최대 2대
      service: { amount: 20000, minStops: 6, stops: [{ id: 'F', label: '외곽 마을', fromPhase: 1 }, { id: 'D', label: '병원', fromPhase: 1 }, { id: 'K', label: '복지관', fromPhase: 5 }] }
    },
    events: { pNone: 0.60, pDemand: 0.85, timeBase: 35, timeSpan: 26, extraPerMin: 2, extraMinutes: 6 },
    defaultSeed: 42,
    rush: { share: 0.75, outbound: 8, inbound: 50, spread: 10, jitter: 4 },
    discontent: { w: [0.5, 0.3, 0.2], waitOver: 15, tripOver: 30 },
    trust: { initial: 50, keep: 0.7 },
    ending: { stableRate: 0.8, stableMaxWait: 20, improvePts: 0.15 },
    // 주요 인물 ‘해낸 하루’의 서비스 기준(2026-10-23): 각 이동에서 버스를 기다린 시간(환승 포함) 27단위(=243분, 약 4시간) 이하.
    // 근거(tools 없이 비교한 대표 설계): 버스 2~3대로 외곽까지 잇는 접근성 설계의 최장 대기 3~4시간, 모든 정류장을 도는 긴 순환은 7~11시간.
    // 3시간이면 성실한 접근성 설계도 6명 중 4명만 만족, 4시간이면 6명 모두·긴 순환은 3명 — 차이를 만들면서 초반 여유를 둔다
    service: { maxWait: 27 },
    essential: ['C', 'D'],
    // 두 점수(재정 건전성·이동 수요 충족, 2026-10-27) — 계산 js/scores.js, 근거 tools/score-review.cjs. 경제 수치(finance)와 별개인 평가 설정
    //   reservePhases: 기준 예비비 = 기본 제공 버스 × (보유비 + 기준 버스 하루 운행비 − 기본 지원) × 이 값(1 = 운임·수행분 없이 한 단계)
    //   outer: 외곽 지역(외곽 마을 F — 공공서비스 수행 조건의 그 정류장). 필수 목적지는 위 essential을 그대로 쓴다
    //   suggest: 다음 행동 제안의 근거 — 만차 fullMin번 이상인 노선 / 대당 승차가 운행 노선 평균의 lowUseRatio배 미만인 2대 이상 노선
    scores: { reservePhases: 1, outer: ['F'], suggest: { fullMin: 3, lowUseRatio: 0.5 } },
    reachInitial: ['F', 'E'],
    newZone: 'I',
    newTownPhase: 3,
    fourthFromPhase: 3,

    residents: [
      { id: 'haneul', name: '하늘', role: '대학생', o: 'B', d: 'C', fromPhase: 1, depart: 20, returnAt: 74, stay: 20 },
      { id: 'narae', name: '나래', role: '주민', o: 'F', d: 'D', fromPhase: 1, depart: 27, returnAt: 54, stay: 10 },
      { id: 'jun', name: '준', role: '근로자', o: 'A', d: 'G', fromPhase: 1, depart: 7, returnAt: 87, stay: 40 },
      { id: 'sol', name: '솔', role: '통근 주민', o: 'I', d: 'A', fromPhase: 3, depart: 14, returnAt: 87, stay: 40 },
      { id: 'yuna', name: '유나', role: '치어리더', o: 'J', d: 'H', fromPhase: 4, depart: 60, returnAt: 100, stay: 20, returnTo: 'B', itineraries: {5:{o:'B',d:'H',depart:40,returnAt:100,stay:35,returnTo:'J'}} },
      { id: 'daeun', name: '다은', role: '야구 팬', o: 'J', d: 'H', fromPhase: 4, depart: 60, returnAt: 100, stay: 20, returnTo: 'B', itineraries: {5:{o:'B',d:'H',depart:40,returnAt:100,stay:35,returnTo:'J'}} }
    ],

    phases: ['학기 초', '적응기', '변화기', '조정기', '학기 말'],

    // 예시 노선 (PRD §4) — 수정·삭제 가능한 출발점일 뿐 정답이 아니다
    exampleRoutes: [
      allStop(['F', 'C', 'D', 'A']),
      allStop(['B', 'A', 'G', 'E']),
      allStop(['H', 'A', 'D', 'E']),
      allStop(['B', 'C', 'D', 'A']),
      allStop(['H', 'A', 'G'])
    ],
    initialDraft: {
      routes: [allStop([]), allStop([])],
      // 새 버스는 모든 단계에서 ‘쉬기’(routeNum null)로 시작한다 — 노선을 만든 뒤 학생이 직접 배정
      buses: [{ id: 1, routeNum: null, offset: 0 }, { id: 2, routeNum: null, offset: 0 }]
    },

    ai: { maxCandidates: 30, maxIterations: 3 },
    // 지도 시각 토큰(2026-10-27 시각 위계 정리). 노선 색은 사용자가 정한 서울 지하철 계열, 의미 색(파랑=누를 수 있음, 주황=주의, 빨강=위험)은 css/tokens.css
    ui: {
      // 2026-10-27 사용자 결정: 서울 지하철 계열(1 신분당선·2~6호선, 채도 낮춘 값) 유지 — 시각 위계 지시서의 흑백 구분용 새 팔레트는 되돌림
      routeColors: ['#C4505E', '#3F9B6B', '#D98A45', '#4A9CC2', '#8D77AA', '#A97C52'],
      routeNames: ['빨강', '초록', '주황', '하늘', '보라', '갈색'],
      map: { line: 7, lineActive: 11, casing: 2.5, stop: 9, cap: 10 }, // 지도 px: 노선 굵기·선택 노선·흰 테두리·정류장 마커 반지름·번호 원 반지름
      wait: { caution: 10, danger: 20 } // 정류장 대기 pill: 10명 이상 주의(주황), 20명 이상 위험(빨강)
    },
    playback: { msPerMinute: 261.25 } // 이전 209ms 대비 이동 속도 0.8배. 1× 하루 약 31초, 2× 약 16초.
  };

  root.PB = root.PB || {};
  root.PB.config = config;
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
})(typeof window !== 'undefined' ? window : globalThis);
