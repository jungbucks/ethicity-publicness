// 2026-10-19 검토 수정 1~5: 6단계 5번 직행 보장, AI 적용 시 번호 유지, 만족 기준 안내·누적, 인물 예상
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),N=require('../js/narrative.js');
const route=nodes=>({nodes,stops:nodes.map(()=>true)});
function toPhase(s,phase,beforeNext){while(s.phase<phase){s.stage='result';if(beforeNext)beforeNext(s);S.nextPhase(s);}}
test('phase six always opens route five as the express even when a lower number was deleted',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});
 toPhase(s,6,x=>{if(x.phase===5){x.draft.buses.forEach(b=>{if(b.routeNum===4)S.assign(x,b.id,1);});S.deleteRoute(x,4);}});
 assert.deepEqual(S.routesInOrder(s).map(r=>r.num),[1,2,3,5]);assert.equal(s.draft.buses.find(b=>b.id===7).routeNum,null);
 assert.equal(S.addRoute(s,route([])).num,4);
});
test('applying a recommendation keeps an existing short route number and gives five to the new short route',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});toPhase(s,6);
 const old=[['A','B'],['A','C','D','E'],['B','C','D','E'],['C','D','E','F']];
 s.draft.routes.slice(0,4).forEach((r,i)=>S.updateRoute(s,r.num,route(old[i])));S.updateRoute(s,5,route(['F','G']));
 const next=[...old,['I','L']];
 S.applyRecommendation(s,{plan:{buses:s.draft.buses.map((b,i)=>({id:b.id,route:route(next[i%5]),offset:0}))}});
 assert.deepEqual(S.routeByNum(s,1).nodes,['A','B']);assert.deepEqual(S.routeByNum(s,5).nodes,['I','L']);
});
test('satisfaction text and running tally follow the mode targets',()=>{
 const d=S.create(cfg,{mode:'default'}),c=S.create(cfg,{mode:'fixed',seed:3});
 assert.equal(N.satisfactionText(d.config),'하늘·나래·준 왕복 4회, 솔(3단계부터) 왕복 2회, 유나·다은(4단계부터) 일정 1회 이상 · 한 번 이동에 버스를 4시간 3분 넘게 기다리면 그날은 세지 않아요');
 assert.match(N.satisfactionText(c.config),/하늘·나래·준 왕복 6회, 솔\(3단계부터\) 왕복 4회, 유나·다은\(4단계부터\) 일정 3회, 진호\(7단계부터\) 왕복 1회 이상/);
 const h=[1,2,3].map(phase=>({phase,residents:{haneul:{dayStatus:phase===2?'returnIncomplete':'complete'},sol:phase===3?{dayStatus:'complete'}:null}}));
 const t=N.residentTally(d.config,h);
 assert.deepEqual(t.haneul,{completed:2,threshold:4,remaining:2});assert.deepEqual(t.sol,{completed:1,threshold:2,remaining:2});assert.deepEqual(t.yuna,{completed:0,threshold:1,remaining:2});
 assert.equal(N.residentTally(d.config,[]).sol.remaining,3);
});
test('plan expectation carries resident day records and family results',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});toPhase(s,6);
 s.draft.routes.forEach((r,i)=>S.updateRoute(s,r.num,route([['B','C','A'],['F','D','A'],['I','A','G'],['J','H','B'],['F','L','I']][i])));
 const m=S.expected(s);
 assert.ok(['complete','returnIncomplete','outboundIncomplete'].includes(m.residents.haneul.dayStatus));assert.equal(m.families.total,3);
});
