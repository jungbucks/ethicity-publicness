import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../js/metrics.js'),cfg=require('../js/config.js'),S=require('../js/session.js'),D=require('../js/demand.js');
test('route report credits final arrivals once and counts transfers as boardings',()=>{
 const result={log:[{type:'board',bus:1,pid:1},{type:'alight',bus:1,pid:1},{type:'board',bus:2,pid:1},{type:'arrive',bus:2,pid:1},{type:'board',bus:3,pid:2},{type:'full',bus:3,data:{left:4}}]};
 const rows=M.routeReport(result,[{num:1},{num:2},{num:3}],[{id:1,routeNum:1},{id:2,routeNum:2},{id:3,routeNum:1}]);
 assert.deepEqual(rows.map(r=>[r.buses,r.boardings,r.arrived,r.perBus,r.fulls]),[[2,2,0,1,1],[1,1,1,1,0],[0,0,0,null,0]]);
});
test('terminal unlocks in phase four with travel demand and reproducible random position',()=>{
 const s=S.create(cfg);s.phase=3;assert.ok(!S.visibleNodeIds(s).includes('J'));s.phase=4;assert.ok(S.visibleNodeIds(s).includes('J'));
 const j=cfg.nodes.find(n=>n.id==='J'),g=cfg.nodes.find(n=>n.id==='G');assert.ok(j.y>g.y);assert.ok(D.directional(cfg,4).some(r=>r.o==='J'));
 const a=S.create(cfg,{mode:'fixed',seed:42}),b=S.create(cfg,{mode:'fixed',seed:42});assert.deepEqual(a.config.nodes,b.config.nodes);
});
