// 2026-11-09 교사 플레이테스트 4: 같은 단계 지난 운행과 비교(이미 계산된 숫자만, 새 시뮬레이션 없음)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),C=require('../js/run-compare.js');
const f={duration:v=>Math.floor(v/60)+'시간'+(v%60?' '+v%60+'분':''),won:n=>Math.abs(n).toLocaleString('ko-KR')+'원',route:n=>({1:'빨강 노선',2:'초록 노선',3:'주황 노선'})[n],name:id=>({C:'대학교',E:'구도심 시장',G:'산업·일자리',F:'외곽 마을',D:'병원'})[id]||id};
const sum=(o)=>Object.assign({phase:2,maxWait:120,missed:12,N:100,arrived:88,total:3000,people:{ok:2,total:3},routes:[{num:1,nodes:['C','G'],buses:2},{num:2,nodes:['F','D'],buses:2}]},o);
test('summary: 결과 화면 기록(history)과 출발한 계획에서 숫자만 뽑는다', () => {
 const h={phase:3,metrics:{maxWait:90,N:50,arrived:41,costs:{total:-1200}},residents:{sky:{satisfied:true},nare:{satisfied:false},jun:null}};
 const draft={routes:[{num:1,nodes:['C','E','G'],stops:[true,true,true]},{num:2,nodes:[],stops:[]}],buses:[{id:1,routeNum:1},{id:2,routeNum:1},{id:3,routeNum:null}]};
 assert.deepEqual(C.summary(h,draft),{phase:3,maxWait:90,missed:9,N:50,arrived:41,total:-1200,people:{ok:1,total:2},routes:[{num:1,nodes:['C','E','G'],stops:[true,true,true],buses:2}]});
});
test('lines: 변화가 큰 숫자 2~3개 한 줄 + 달라진 계획 한 줄(버스 수·정류장)', () => {
 const prev=sum(),cur=sum({maxWait:210,missed:20,arrived:80,total:2000,routes:[{num:1,nodes:['C','G'],buses:2},{num:2,nodes:['F','D'],buses:1}]});
 const L=C.lines(prev,cur,f);
 assert.equal(L.numbers,'지난번 같은 단계와 비교: 최장 대기 2시간 → 3시간 30분 · 목적지까지 못 간 이동 12건 → 20건 · 이번 단계 수지 +3,000원 → +2,000원');
 assert.equal(L.plan,'달라진 계획: 초록 노선 버스 2대 → 1대');
});
test('lines: 같은 정류장 노선은 색이 달라도 같은 노선, 정류장 더함·뺌·새 노선·없앰', () => {
 const prev=sum({routes:[{num:1,nodes:['C','G'],buses:2},{num:3,nodes:['F','D'],buses:1}]});
 const cur=sum({routes:[{num:2,nodes:['C','G'],buses:2},{num:3,nodes:['F','E','D'],buses:1}]});
 assert.equal(C.lines(prev,cur,f).plan,'달라진 계획: 주황 노선에 구도심 시장 더함');
 assert.equal(C.lines(prev,sum({routes:[{num:1,nodes:['C','G'],buses:2}]}),f).plan,'달라진 계획: 주황 노선(외곽 마을–병원) 없앰');
 assert.equal(C.lines(sum({routes:[]}),sum({routes:[{num:1,nodes:['C','G','C'],buses:1}]}),f).plan,'달라진 계획: 빨강 노선 새로 만듦(대학교–산업·일자리, 버스 1대)');
 const same=C.lines(sum(),sum(),f);assert.deepEqual(same,{numbers:'지난번 같은 단계와 결과 숫자가 같아요.',plan:'계획은 지난번과 같아요.'});
});
test('lines: 주요 인물 기준 변화가 크면 앞에, 숫자는 최대 3개', () => {
 const L=C.lines(sum({people:{ok:3,total:3},maxWait:100}),sum({people:{ok:1,total:3},maxWait:110,missed:13,total:2900}),f);
 assert.ok(L.numbers.startsWith('지난번 같은 단계와 비교: 기준을 채운 주요 인물 3명 → 1명 · '),L.numbers);
 assert.equal(L.numbers.split(' · ').length,3);
});
test('previous/remember: 같은 조건·같은 단계·다른 게임만, 최근 것, 오래된 것은 밀려남, 저장소가 막혀도 조용히', () => {
 const mem={};const store={getItem:k=>mem[k]??null,setItem:(k,v)=>{mem[k]=v;}};
 const key=C.scenarioKey({mode:'default',seed:42},'v9');assert.equal(key,'default|42|v9');
 assert.equal(C.previous(store,key,2,'a'),null);
 C.remember(store,key,2,'a',sum({total:1}),100);C.remember(store,key,2,'b',sum({total:2}),200);C.remember(store,key,2,'b',sum({total:3}),300);
 assert.equal(C.previous(store,key,2,'b').sum.total,1,'같은 게임(b)은 빼고');assert.equal(C.previous(store,key,2,'c').sum.total,3,'같은 게임은 덮어씀·최근 것');
 assert.equal(C.previous(store,'random|7|v9',2,'c'),null,'다른 조건');assert.equal(C.previous(store,key,3,'c'),null,'다른 단계');
 for(let i=0;i<C.MAX+5;i++)C.remember(store,key,1,'r'+i,sum(),1000+i);assert.equal(JSON.parse(mem[C.KEY]).runs.length,C.MAX);
 const broken={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
 assert.equal(C.previous(broken,key,2,'a'),null);assert.equal(C.remember(broken,key,2,'a',sum(),1),false);
 mem[C.KEY]='{oops';assert.equal(C.previous(store,key,2,'a'),null,'손상된 기록은 없는 것처럼');
});
// 2026-11-10 검토 1번: 정류장 집합은 노선 짝 찾기에만 쓰고, 짝을 찾은 뒤 순서·정차 여부를 따로 본다
const one=(nodes,o)=>sum({routes:[Object.assign({num:1,nodes,buses:1},o)]});
const plan=(a,b)=>C.lines(a,b,f).plan;
test('순서: 같은 정류장·같은 버스라도 순서를 바꾸면 달라진 계획', () => {
 assert.equal(plan(one(['C','E','G']),one(['C','G','E'])),'달라진 계획: 빨강 노선 정류장 순서 바꿈');
 assert.equal(plan(one(['C','E','G']),one(['C','E','G'],{buses:2})),'달라진 계획: 빨강 노선 버스 1대 → 2대');
 assert.equal(plan(one(['C','E','G']),one(['C','G','E'],{buses:2})),'달라진 계획: 빨강 노선 정류장 순서 바꿈 · 빨강 노선 버스 1대 → 2대');
});
test('순서: 색 번호만 바꾼 같은 운행은 같은 계획, 색과 순서를 함께 바꾸면 순서 변경', () => {
 assert.equal(plan(one(['C','E','G']),one(['C','E','G'],{num:2})),'계획은 지난번과 같아요.');
 assert.equal(plan(one(['C','E','G']),one(['C','G','E'],{num:2})),'달라진 계획: 초록 노선 정류장 순서 바꿈');
 const swap=sum({routes:[{num:1,nodes:['C','G','E'],buses:1},{num:2,nodes:['C','E','G'],buses:2}]});
 assert.equal(plan(sum({routes:[{num:1,nodes:['C','E','G'],buses:2},{num:2,nodes:['C','G','E'],buses:1}]}),swap),'계획은 지난번과 같아요.','두 노선의 색만 맞바꿈');
});
test('순서: 거꾸로 이은 노선은 첫 출발 정류장이 달라진 다른 운행(엔진은 노선 첫 정류장에서 출발)', () => {
 assert.equal(plan(one(['C','E','G']),one(['G','E','C'])),'달라진 계획: 빨강 노선 첫 출발 정류장 바꿈(대학교 → 산업·일자리)');
 const cfg=require('../js/config.js'),G=require('../js/graph.js'),Sch=require('../js/schedule.js'),g=G.build(cfg,1);
 const tl=n=>Sch.timeline(g,cfg,1,{nodes:n,stops:n.map(()=>true)},0);
 assert.equal(tl(['F','C','D']).visits[0].node,'F');assert.equal(tl(['D','C','F']).visits[0].node,'D');
 assert.notDeepEqual(tl(['F','C','D']).visits.map(v=>v.t+v.node),tl(['D','C','F']).visits.map(v=>v.t+v.node),'같은 시각에 다른 정류장에 선다');
});
test('순서: 순환은 첫 출발·도는 방향·순환 여부를 따로 알린다', () => {
 assert.equal(plan(one(['C','E','G','C']),one(['E','G','C','E'])),'달라진 계획: 빨강 노선 첫 출발 정류장 바꿈(대학교 → 구도심 시장)');
 assert.equal(plan(one(['C','E','G','C']),one(['C','G','E','C'])),'달라진 계획: 빨강 노선 도는 방향 바꿈');
 assert.equal(plan(one(['C','E','G','F','C']),one(['C','G','E','F','C'])),'달라진 계획: 빨강 노선 정류장 순서 바꿈');
 assert.equal(plan(one(['C','E','G']),one(['C','E','G','C'])),'달라진 계획: 빨강 노선 순환으로 바꿈');
 assert.equal(plan(one(['C','E','G','C']),one(['C','E','G'])),'달라진 계획: 빨강 노선 순환을 풂');
 assert.equal(plan(one(['C','E','G','C']),one(['C','E','G','C'])),'계획은 지난번과 같아요.');
});
test('정차 여부: 요약에 남기고, 통과·정차가 바뀌면 알린다(정차 기록이 없는 예전 요약은 건너뜀)', () => {
 const all=[true,true,true],pass=[true,false,true];
 assert.equal(plan(one(['C','E','G'],{stops:all}),one(['C','E','G'],{stops:pass})),'달라진 계획: 빨강 노선 구도심 시장 정차 → 통과');
 assert.equal(plan(one(['C','E','G'],{stops:pass}),one(['C','E','G'],{stops:all,num:2})),'달라진 계획: 초록 노선 구도심 시장 통과 → 정차');
 assert.equal(plan(one(['C','E','G']),one(['C','E','G'],{stops:pass})),'계획은 지난번과 같아요.','예전 요약에는 정차 기록이 없다');
});
test('달라진 계획이 세 가지 이상이면 두 가지 뒤에 남은 개수를 적는다', () => {
 const prev=sum({routes:[{num:1,nodes:['C','E','G'],buses:1},{num:2,nodes:['F','D'],buses:2}]}),cur=sum({routes:[{num:1,nodes:['C','G','E'],buses:2},{num:2,nodes:['F','D'],buses:1}]});
 assert.equal(plan(prev,cur),'달라진 계획: 빨강 노선 정류장 순서 바꿈 · 초록 노선 버스 2대 → 1대 · 그 밖에 1가지');
});
