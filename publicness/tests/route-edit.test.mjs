import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),E=require('../js/route-edit.js');
const r={num:1,nodes:['A','B','F'],stops:[true,false,true]};
test('head extension and backtrack preserve order and stop flags without mutating input',()=>{
 const copy=JSON.stringify(r),a=E.visit(r,{end:'head'},'D');assert.deepEqual(a.nodes,['D','A','B','F']);
 assert.deepEqual(E.visit(a,{end:'head'},'A'),r);assert.equal(JSON.stringify(r),copy);
});
test('tail can chain and rewind; segment insertion preserves neighbours',()=>{
 let a=E.visit(r,{end:'tail'},'D');a=E.visit(a,{end:'tail'},'E');assert.deepEqual(a.nodes,['A','B','F','D','E']);
 assert.deepEqual(E.visit(a,{end:'tail'},'D').nodes,['A','B','F','D']);
 assert.deepEqual(E.visit(r,{index:0},'D').nodes,['A','D','B','F']);
 assert.deepEqual(E.visit(r,{index:0},'A'),r);
});
test('nearest end and explicit override agree with click semantics',()=>{
 const pts={A:{x:0,y:0},F:{x:10,y:0},D:{x:1,y:0}};
 assert.equal(E.end(r,'D',id=>pts[id]),'head');assert.equal(E.end(r,'D',id=>pts[id],'tail'),'tail');
});
test('closing a loop is deliberate and endpoints remain stopped',()=>{
 assert.deepEqual(E.visit(r,{end:'tail'},'A').nodes,['A','B','F','A']);
 const shortened=E.visit(r,{end:'head'},'B');assert.equal(shortened.stops[0],true);
});
// 2026-11-09 교사 플레이테스트: 대학교–산업·일자리에 구도심 시장을 ‘사이에’ 넣기 / 양 끝 어느 쪽에서나 잇기
test('link: a stop dropped on a segment goes between its two stops; already-there stops are refused', () => {
 const ab={num:1,nodes:['C','G'],stops:[true,true]};
 assert.deepEqual(E.link(ab,'E',{index:0}),{route:{num:1,nodes:['C','E','G'],stops:[true,true,true]},kind:'insert'});
 assert.deepEqual(E.link(r,'D',{index:1}).route.nodes,['A','B','D','F']);
 assert.deepEqual(E.link(r,'B',{index:1}),{fail:'already'});
 const loop={num:1,nodes:['A','B','F','A'],stops:[true,true,true,true]};
 assert.deepEqual(E.link(loop,'D',{index:2}).route.nodes,['A','B','F','D','A'],'loop keeps closing stop');
});
test('link: dragging from either end extends that end; end to other end closes a loop', () => {
 assert.deepEqual(E.link(r,'A',{node:'D'}),{route:{num:1,nodes:['D','A','B','F'],stops:[true,true,false,true]},kind:'head'});
 assert.deepEqual(E.link(r,'F',{node:'D'}).route.nodes,['A','B','F','D']);assert.equal(E.link(r,'F',{node:'D'}).kind,'tail');
 assert.deepEqual(E.link(r,'A',{node:'F'}).route.nodes,['F','A','B','F']);assert.equal(E.link(r,'A',{node:'F'}).kind,'loop');
 assert.deepEqual(E.link(r,'F',{node:'A'}).route.nodes,['A','B','F','A']);
 const two={num:1,nodes:['A','F'],stops:[true,true]};assert.equal(E.link(two,'A',{node:'F'}),null,'two-stop route cannot loop — caller keeps old behaviour');
 assert.equal(E.link(r,'B',{node:'D'}),null,'middle stop: caller keeps swap behaviour');
 assert.equal(E.link(r,'X',{node:'D'}),null,'stop not on route: caller decides (new route)');
 assert.equal(E.link({num:1,nodes:['A','B','A'],stops:[true,true,true]},'A',{node:'D'}),null,'loops have no ends');
 const copy=JSON.stringify(r);E.link(r,'A',{node:'D'});E.link(r,'D',{index:0});assert.equal(JSON.stringify(r),copy,'input not mutated');
});
