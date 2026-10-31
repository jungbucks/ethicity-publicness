import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),S=require('../js/session.js'),D=require('../js/demand.js');
const route=nodes=>({nodes,stops:nodes.map(()=>true)});
test('stadium and its demand open in phase two in both modes',()=>{
 for(const mode of ['default','fixed']){const s=S.create(cfg,{mode,seed:42});assert.ok(!S.visibleNodeIds(s).includes('H'));assert.ok(!D.base(s.config,1,42).some(q=>q.o==='H'||q.d==='H'));s.phase=2;assert.ok(S.visibleNodeIds(s).includes('H'));assert.ok(D.base(s.config,2,42).some(q=>q.o==='H'||q.d==='H'));}
});
test('express route permits two or three unique stops and rejects four without changing draft',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});s.phase=6;
 S.addRoute(s,route(['A','B']));S.addRoute(s,route(['C','D']));
 assert.equal(S.addRoute(s,route(['A','B','C','D'])),null);
 const r=S.addRoute(s,route(['A','B']));assert.equal(r.num,5);
 assert.ok(S.updateRoute(s,5,route(['A','B','C'])));assert.ok(S.updateRoute(s,5,route(['A','B','C','A'])));
 const before=JSON.stringify(r);assert.equal(S.updateRoute(s,5,route(['A','B','C','D'])),null);assert.equal(JSON.stringify(r),before);
 S.assign(s,1,5);r.nodes=['A','B','C','D'];r.stops=[true,true,true,true];assert.ok(S.validate(s).some(e=>e.includes('최대 3')));
 assert.ok(S.updateRoute(s,1,route(['A','B','C','D'])));
});
test('recommendation puts 7호차 short route at number five and regular buses on 1–4 only (5번은 7호차 전용)',()=>{
 const s=S.create(cfg,{mode:'fixed',seed:42});s.phase=6;s.owned=7;s.draft.buses=Array.from({length:7},(_,i)=>({id:i+1,routeNum:null,offset:0}));
 const routes=[['A','B','C','D'],['B','C','D','E'],['C','D','E','F'],['D','E','F','G']];
 S.applyRecommendation(s,{plan:{buses:s.draft.buses.map((b,i)=>({id:b.id,route:route(b.id===7?['A','B']:routes[i%4]),offset:0}))}});
 assert.equal(s.draft.routes.length,5);assert.deepEqual(S.routeByNum(s,5).nodes,['A','B']);assert.ok(s.draft.buses.every(b=>b.routeNum!=null));
 assert.deepEqual(s.draft.buses.filter(b=>b.routeNum===5).map(b=>b.id),[7],'5번에는 7호차만');
 // 일반 버스를 직행 노선에 넣는 제안은 적용해도 그 버스는 쉰다(직행 노선에 들어가지 않는다)
 S.applyRecommendation(s,{plan:{buses:[{id:1,route:route(['A','B']),offset:0}]}});assert.notEqual(s.draft.buses.find(b=>b.id===1).routeNum,5);
});
