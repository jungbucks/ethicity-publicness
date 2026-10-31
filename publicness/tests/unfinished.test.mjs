import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Sim=require('../js/sim.js'),S=require('../js/session.js'),cfg=require('./planned-fixture.cjs');
test('unfinished groups are exclusive and ignore passengers who eventually arrived',()=>{
 const res={passengers:[{o:'A',status:'waiting',fail:'NO_LINK'},{o:'A',status:'waiting',deniedBoardings:2},{o:'B',status:'riding'},{o:'B',status:'arrived',deniedBoardings:3}]};
 assert.deepEqual(Sim.unfinishedReasons(res),{A:{noLink:1,full:1,time:0},B:{noLink:0,full:0,time:1}});
});
test('real passenger denial evidence agrees with aggregated full events',()=>{
 const s=S.create(cfg);S.beginPlan(s);const r=S.startRun(s);
 assert.equal(r.passengers.reduce((n,p)=>n+(p.deniedBoardings||0),0),r.log.filter(e=>e.type==='full').reduce((n,e)=>n+e.data.left,0));
 const groups=Sim.unfinishedReasons(r);assert.equal(Object.values(groups).reduce((n,g)=>n+g.noLink+g.full+g.time,0),r.passengers.filter(p=>p.status!=='arrived').length);
});
