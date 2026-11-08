import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const PB={Session:{},Metrics:{},UI:{},App:{won:n=>n+'원'}},context={window:{PB}};
vm.runInNewContext(fs.readFileSync(new URL('../js/ui-economy.js',import.meta.url),'utf8'),context);
const progress=PB.UI.Econ.serviceProgress;
test('service presentation uses supplied target/reward and distinguishes achievement from settlement',()=>{
 const c={label:'외곽',need:9,stops:12,amount:17000,met:true};
 assert.equal(progress(c,3,'pending').text,'외곽 · 3/9회 · 보상 17000원');
 assert.equal(progress(c,9,'pending').text,'외곽 · 9/9회 · 달성');
 assert.equal(progress(c,12,'paid').text,'외곽 · 9/9회 · +17000원 지급');
 assert.match(progress(c,12,'paid').title,/정차 12회/);
 assert.match(progress(c,12,'expected').text,/예상 9\/9회 · 보상 17000원 · 달성 예상/);
 assert.doesNotMatch(progress({...c,met:false},8,'paid').text,/지급/);
 assert.equal(c.stops,12);assert.equal(c.amount,17000);
});
