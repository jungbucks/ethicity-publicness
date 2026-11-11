// 2026-11-10 검토 3번: 저장에 실패했는데 ‘저장했어요’라고 하지 않는다
//  · Storage.writeSave는 접근 거부·용량 초과에서 false, 저장소가 돌아오면 다시 true · Storage.canSave(시작 화면 문구용)는 흔적을 남기지 않는다
//  · App.save가 그 결과를 돌려주고(상태 한 곳 #save-status 갱신), ‘저장했어요.’는 App.savedText 한 곳에서만 만든다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),St=require('../js/storage.js'),read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const mem=()=>{const m={};return {m,getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v);},removeItem:k=>{delete m[k];}};};
const err=name=>{const e=new Error(name);e.name=name;return e;};
const denied={getItem(){throw err('SecurityError');},setItem(){throw err('SecurityError');},removeItem(){throw err('SecurityError');}};
const full=()=>{const s=mem();s.setItem=()=>{throw err('QuotaExceededError');};return s;};
const data={version:'pb-x',savedAt:1,session:{phase:1}};
test('writeSave: 정상 true · 접근 거부 false · 용량 초과 false · 저장소 없음 false', () => {
  const ok=mem();assert.equal(St.writeSave(data,ok),true);assert.deepEqual(JSON.parse(ok.m[St.SAVE_KEY]),data);
  assert.equal(St.writeSave(data,denied),false);
  const q=full();assert.equal(St.writeSave(data,q),false);assert.equal(q.m[St.SAVE_KEY],undefined);
  assert.equal(St.writeSave(data),false,'Node에는 localStorage가 없다');
});
test('writeSave: 저장소가 돌아오면 다시 true', () => {
  const s=mem(),set=s.setItem;let block=true;s.setItem=(k,v)=>{if(block)throw err('QuotaExceededError');set(k,v);};
  assert.equal(St.writeSave(data,s),false);block=false;assert.equal(St.writeSave(data,s),true);assert.ok(s.m[St.SAVE_KEY]);
});
test('canSave: 쓸 수 있을 때만 true, 시험 값은 남기지 않는다', () => {
  const ok=mem();assert.equal(St.canSave(ok),true);assert.deepEqual(Object.keys(ok.m),[]);
  assert.equal(St.canSave(denied),false);assert.equal(St.canSave(full()),false);assert.equal(St.canSave(),false);
});
test('화면 연결: App.save가 결과를 돌려주고, 성공 문구는 한 곳에서만 만든다', () => {
  const app=read('js/app.js');
  assert.match(app,/var ok = PB\.Storage\.writeSave\(/,'App.save가 writeSave 결과를 받는다');
  assert.match(app,/App\.savedText = function/);
  for(const f of ['js/ui-fairness.js','js/ui-transition.js','js/ui-ending.js'])assert.doesNotMatch(read(f),/저장했어요/,f+' — 성공 문구를 직접 쓰지 않는다');
  assert.match(read('js/ui-fairness.js'),/status\.textContent = App\.savedText\(App\.save\(\)\)/);
  assert.match(read('js/ui-transition.js'),/noteSaved\(box,PB\.App\.save\(\)\)/);
  const html=read('index.html');
  assert.match(html,/id="save-status"[^>]*role="status"[^>]*hidden/,'상태 한 곳');
  assert.match(html,/<p class="note" id="save-note">/,'첫 화면 저장 안내는 바꿀 수 있게 id를 둔다');
});
