import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),N=require('../js/narrative.js'),cfg=require('../js/config.js');
const history=(counts)=>Array.from({length:5},(_,i)=>({phase:i+1,residents:Object.fromEntries(cfg.residents.filter(r=>r.fromPhase<=i+1).map(r=>[r.id,{dayStatus:i-r.fromPhase+1<(counts[r.id]||0)?'complete':'returnIncomplete'}]))}));
test('ending reactions use inclusive thresholds 4/4/4/2/1/1 (chances minus one spare)',()=>{
 const all={haneul:4,narae:4,jun:4,sol:2,yuna:1,daeun:1};
 assert.ok(N.endingReactions(cfg,history(all)).every(r=>r.satisfied));
 const low=Object.fromEntries(Object.entries(all).map(([id,n])=>[id,n-1]));assert.ok(N.endingReactions(cfg,history(low)).every(r=>!r.satisfied));
 assert.deepEqual(N.endingReactions(cfg,history(all)).map(r=>r.id),cfg.residents.map(r=>r.id));
});
test('incomplete outward or second trips do not count and duplicate phases count once',()=>{
 const hs=history({haneul:3,sol:1,yuna:0});hs.push(hs[0]);
 const rs=N.endingReactions(cfg,hs);assert.equal(rs.find(r=>r.id==='haneul').completed,3);assert.equal(rs.find(r=>r.id==='yuna').satisfied,false);assert.equal(rs.find(r=>r.id==='sol').satisfied,false);
 assert.equal(N.endingReactions(cfg,[]).length,6);assert.ok(N.endingReactions(cfg,[]).every(r=>r.completed===0&&!r.satisfied));
});
test('final verdict requires everyone satisfied and profit sums signed net totals',()=>{
 const hs=history({haneul:4,narae:4,jun:4,sol:2,yuna:2,daeun:1});hs.forEach((h,i)=>h.metrics={costs:{total:i===0?-5000:1000}});
 let c=N.endingConclusion(N.endingReactions(cfg,hs),hs);assert.equal(c.allSatisfied,true);assert.equal(c.profit,-1000);assert.match(c.text,/총 수익 −1,000원/);
 hs[3].residents.daeun.dayStatus='returnIncomplete';c=N.endingConclusion(N.endingReactions(cfg,hs),hs);assert.equal(c.allSatisfied,false);assert.equal(c.verdict,'도시 노선을 나름 잘 설계했다. 하지만 이게 최선이었을까?');
});
