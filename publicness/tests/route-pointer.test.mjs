import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const window={};vm.runInNewContext(fs.readFileSync(new URL('../js/route-pointer.js',import.meta.url),'utf8'),{window});
test('shared routes hit their visible lane instead of first route centerline',()=>{
  const surface={getBoundingClientRect:()=>({left:0,top:0})};
  const nodes={A:{x:0,y:0},B:{x:100,y:0}},routes=[{num:1,route:{nodes:['A','B']}},{num:3,route:{nodes:['A','B']}}];
  const project=(x,y)=>({left:x,top:y}),offset=(a,b,num)=>({x:0,y:num===1?-6:6});
  assert.equal(window.PB.RoutePointer.pick(surface,project,nodes,routes,50,6,offset).route,3);
  assert.equal(window.PB.RoutePointer.pick(surface,project,nodes,routes,50,-6,offset).route,1);
});
