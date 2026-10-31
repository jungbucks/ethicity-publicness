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
