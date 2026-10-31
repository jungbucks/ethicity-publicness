import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),cfg=require('../js/config.js'),D=require('../js/demand.js'),S=require('../js/session.js');
test('welfare opens only at phase five and has twelve daytime requests',()=>{
 const s=S.create(cfg);s.phase=4;assert.ok(!S.visibleNodeIds(s).includes('K'));s.phase=5;assert.ok(S.visibleNodeIds(s).includes('K'));
 const qs=D.base(cfg,5,42).filter(p=>p.o==='K'||p.d==='K');assert.equal(qs.length,12);assert.ok(qs.filter(p=>p.d==='K').every(p=>p.t>=34&&p.t<60));assert.ok(qs.filter(p=>p.o==='K').every(p=>p.t>=60&&p.t<86));
 const k=cfg.nodes.find(n=>n.id==='K'),f=cfg.nodes.find(n=>n.id==='F'),b=cfg.nodes.find(n=>n.id==='B');assert.ok(k.y> b.y&&k.y<f.y&&k.x>f.x&&k.x<b.x);
});
test('six university trips split station 2 plus terminal 1 each way from phase four',()=>{
 for(const phase of [1,3,4,5]){const qs=D.base(cfg,phase,42),out=qs.filter(p=>['A','J'].includes(p.o)&&p.d==='C'),back=qs.filter(p=>p.o==='C'&&['A','J'].includes(p.d));assert.equal(out.length,3);assert.equal(back.length,3);assert.equal(out.filter(p=>p.o==='A').length,phase<4?3:2);assert.equal(back.filter(p=>p.d==='J').length,phase<4?0:1);assert.ok(out.every(p=>p.t>=7&&p.t<34));assert.ok(back.every(p=>p.t>=74&&p.t<101));}
});
