// 2026-11-12 검토: 운행 중 고친 것이 보고서에 따로 나오는지(실제 화면) — 3단계 정류장 더하기 · 4단계 버스 옮기기 · 5단계 정류장 빼기, 1·2단계는 고치지 않음
//  · ‘내 계획 (출발할 때)’은 출발 계획 그대로, ‘운행 중 바꾼 것’ 줄에 시각·노선(버스)·고치기 전과 뒤 · 새로고침 → 이어하기 뒤에도 같음 · 1280×800·390×844 가로 넘침 없음 · 인쇄 미디어에서도 보임
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/report-midchange-browser.mjs  (브라우저 검사는 한 번에 하나 — D:\Works\.browser-test.lock)
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,SHOT=process.env.SHOT_DIR||'publicness/tests';
const toEnding=page=>page.evaluate(()=>{const A=PB.App,S=PB.Session;A.startGame();const s=A.s,done={};s.tutorialSeen=true;
 for(let p=1;p<=s.config.phases.length;p++){S.beginPlan(s);s.draft.buses.forEach(b=>b.routeNum=null);s.draft.routes=s.draft.routes.filter(r=>r.num<=2);
  s.draft.routes[0]?Object.assign(s.draft.routes[0],{nodes:['F','C','B','D'],stops:[true,true,true,true]}):s.draft.routes.push({num:1,nodes:['F','C','B','D'],stops:[true,true,true,true]});
  if(!s.draft.routes[1])s.draft.routes.push({num:2,nodes:[],stops:[]});Object.assign(s.draft.routes[1],{nodes:['A','G'],stops:[true,true]});
  s.draft.buses.forEach((b,i)=>b.routeNum=i===0?1:i===1?2:i===2?1:null);
  S.startRun(s);
  if(p===3)done[3]=S.midApply(s,{at:45,kind:'add',routeNum:1,node:'A',pos:2});
  if(p===4){const rest=s.draft.buses.filter(b=>b.routeNum==null)[0];done[4]=S.midApply(s,{at:50,kind:'move',busId:rest?rest.id:s.draft.buses[2].id,routeNum:2});}
  if(p===5)done[5]=S.midApply(s,{at:60,kind:'remove',routeNum:1,node:'C'});
  S.finishRun(s);A.go('result');
  if(!S.nextPhase(s))break;}
 A.go('ending');document.querySelectorAll('dialog[open]').forEach(d=>d.close());return {done,mid:s.midChanges,log:s.planLog};});
const read=page=>page.evaluate(()=>[...document.querySelectorAll('#report .report-stage[data-phase]')].map(sec=>({phase:+sec.dataset.phase,
 rows:[...sec.querySelectorAll('.report-row')].map(r=>({k:r.querySelector('.report-k').textContent,lines:[...r.querySelectorAll(':scope > ul > li, :scope > p.report-v')].map(n=>n.querySelector('.report-change-head')?[n.querySelector('.report-change-head').textContent,...[...n.querySelectorAll('.report-change-detail li')].map(x=>x.textContent)]:n.textContent)}))})));
const over=page=>page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
try{
 const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?no3d=1');await page.evaluate(()=>localStorage.clear());await page.reload();
 const st=await toEnding(page);assert.deepEqual(st.done,{3:true,4:true,5:true},'세 가지 고치기 적용 '+JSON.stringify(st.done));
 await page.locator('#btn-report').click();await page.locator('#report').waitFor();
 const first=await read(page),row=(ph,k)=>first.find(x=>x.phase===ph).rows.find(r=>r.k===k);
 console.log(JSON.stringify(first.map(x=>({phase:x.phase,rows:x.rows.filter(r=>/계획|바꾼/.test(r.k))})),null,1));
 // 1·2단계: 전과 같은 모양
 for(const ph of [1,2]){assert.ok(row(ph,'내 계획'),ph+'단계 내 계획');assert.equal(row(ph,'운행 중 바꾼 것'),undefined);assert.equal(row(ph,'내 계획 (출발할 때)'),undefined);}
 // 3단계: 정류장 더하기
 {const plan=row(3,'내 계획 (출발할 때)'),ch=row(3,'운행 중 바꾼 것');assert.ok(plan&&ch,'3단계 두 줄');
  assert.match(plan.lines[0],/^빨강 노선: 외곽 마을 → 대학교 → 밀집 주거지 → 병원·공공서비스 · 버스 \d대$/);assert.ok(!plan.lines.join('|').includes('→ 기차역 →'),'출발 계획에 고친 정류장 없음');
  assert.deepEqual(ch.lines[0],['11:45 노선 고침 · 빨강 노선에 기차역 더함','고치기 전: 외곽 마을 → 대학교 → 밀집 주거지 → 병원·공공서비스','고친 뒤: 외곽 마을 → 대학교 → 밀집 주거지 → 기차역 → 병원·공공서비스','그 뒤 이 노선 버스는 바뀐 정류장을 따랐어요(이번 운행만).']);
  assert.equal(ch.lines[1],'아래 결과는 이렇게 바꾼 운행으로 센 숫자예요.');}
 // 4단계: 버스 옮기기
 {const ch=row(4,'운행 중 바꾼 것');assert.ok(ch,'4단계');assert.match(ch.lines[0][0],/^12:30 노선 고침 · (대기|빨강) 버스 한 대를 초록 노선으로 옮김$/);
  assert.match(ch.lines[0][1],/^옮기기 전: (대기 버스|빨강 노선 버스) \d대 · 초록 노선 버스 1대$/);assert.match(ch.lines[0][2],/^옮긴 뒤: (대기 버스|빨강 노선 버스) \d대 · 초록 노선 버스 2대$/);
  assert.match(ch.lines[0][3],/^(\d\d:\d\d부터 초록 노선에서 달렸어요\.|운행이 끝날 때까지 옮겨 가지 못했어요\.)$/);}
 // 5단계: 정류장 빼기
 {const ch=row(5,'운행 중 바꾼 것');assert.ok(ch,'5단계');assert.match(ch.lines[0][0],/^\d\d:\d\d 노선 고침 · 빨강 노선에서 대학교 뺌$/);
  assert.deepEqual(ch.lines[0].slice(1,3),['고치기 전: 외곽 마을 → 대학교 → 밀집 주거지 → 병원·공공서비스','고친 뒤: 외곽 마을 → 밀집 주거지 → 병원·공공서비스']);}
 assert.equal(await over(page),false,'1280 가로 넘침 없음');
 await page.screenshot({path:`${SHOT}/_shot-report-mid-1280.png`});
 for(const ph of [2,3,4,5])await page.locator(`.report-stage[data-phase="${ph}"]`).screenshot({path:`${SHOT}/_shot-report-mid-1280-p${ph}.png`});
 await page.emulateMedia({media:'print'});
 assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.report-changes')].every(n=>getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().height>0)),'인쇄 미디어에서도 보임');
 await page.locator('.report-stage[data-phase="3"]').screenshot({path:`${SHOT}/_shot-report-mid-print-p3.png`});await page.emulateMedia({media:'screen'});
 // 저장 → 새로고침 → 이어하기: 같은 보고서
 await page.reload();await page.locator('#btn-continue').click();await page.locator('#btn-report').click();await page.locator('#report').waitFor();
 assert.deepEqual(await read(page),first,'이어하기 뒤 보고서가 같음');
 // 390×844
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>PB.App.render());await page.locator('#report').waitFor();
 assert.deepEqual(await read(page),first);assert.equal(await over(page),false,'390 가로 넘침 없음');
 for(const ph of [3,4])await page.locator(`.report-stage[data-phase="${ph}"]`).screenshot({path:`${SHOT}/_shot-report-mid-390-p${ph}.png`});
 await page.locator('.report-stage[data-phase="3"]').scrollIntoViewIfNeeded();await page.screenshot({path:`${SHOT}/_shot-report-mid-390.png`});
 assert.deepEqual(errors,[]);await page.close();
 console.log('PASS report-midchange');}finally{await browser.close();server.close();}
