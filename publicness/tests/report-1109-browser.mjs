// 2026-11-09 테스터 6번: 엔딩 ‘내 운영 보고서’ — 엔딩·돌아보기 화면 버튼 → 보고서(단계별 계획·숫자·목표·문장 틀 답·마지막 소감)
//  · 이름 칸은 저장 안 함(localStorage 어디에도 없음, 다시 그려도 이 페이지에선 유지) · PDF로 저장 = window.print(인쇄 동안 제목 = 파일 이름)
//  · 인쇄 미디어: 보고서만, A4 PDF(page.pdf) · 375 버튼 닿음·가로 넘침 없음 · file:// 에서도 열림 · AI 제안 문장은 보고서에 없음
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/report-1109-browser.mjs
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,SHOT=process.env.SHOT_DIR||'publicness/tests';
// 다섯 단계를 결과 화면을 거쳐(계획 기록) 끝까지. 1·3단계에만 생각 쓰기
const toEnding=page=>page.evaluate(()=>{const A=PB.App,S=PB.Session,NT=PB.StageNotes;A.startGame();const s=A.s;s.tutorialSeen=true;
 for(let p=1;p<=s.config.phases.length;p++){S.beginPlan(s);s.draft.buses.forEach(b=>b.routeNum=null);s.draft.routes=s.draft.routes.filter(r=>r.num<=2);
  s.draft.routes[0]?Object.assign(s.draft.routes[0],{nodes:['F','C','B','D'],stops:[true,true,true,true]}):s.draft.routes.push({num:1,nodes:['F','C','B','D'],stops:[true,true,true,true]});
  if(!s.draft.routes[1])s.draft.routes.push({num:2,nodes:[],stops:[]});Object.assign(s.draft.routes[1],{nodes:['A','G'],stops:[true,true]});
  s.draft.buses.forEach((b,i)=>b.routeNum=i===0?1:i===1?2:i===2?1:null);
  S.startRun(s);s.current.metrics.costs.total=Math.max(0,s.current.metrics.costs.total);S.finishRun(s);A.go('result');
  if(p===1){NT.set(s,1,'kept','외곽 마을');NT.set(s,1,'lost','수지');NT.set(s,1,'aiWhat','노선');NT.set(s,1,'aiView','diff');NT.set(s,1,'aiWhy','사람이 남아서');s.choices={1:'longest'};}
  if(p===3)NT.set(s,3,'aiView','same');
  if(!S.nextPhase(s))break;}
 s.finalReflection='순자 할머니의 이동을 더 살피게 됐어요.';A.go('ending');document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
const allStorage=p=>p.evaluate(()=>{let t='';for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);t+=k+'='+localStorage.getItem(k)+'\n';}return t;});
try{
 // 1280: 엔딩 → 보고서
 {const page=await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?no3d=1');await page.evaluate(()=>localStorage.clear());await page.reload();await toEnding(page);
  await page.locator('#btn-report').waitFor();assert.ok(await page.locator('.review-actions #btn-report').isVisible(),'엔딩 버튼');
  await page.screenshot({path:`${SHOT}/_shot-report-ending-1280.png`});
  await page.locator('#btn-report').click();await page.locator('#report').waitFor();
  const info=await page.evaluate(()=>{const r=document.querySelector('#report');return {open:document.body.classList.contains('report-open'),h:r.querySelector('h2').textContent,stages:r.querySelectorAll('.report-stage[data-phase]').length,hist:PB.App.s.history.length,
   s1:r.querySelector('.report-stage[data-phase="1"]').textContent,s2:r.querySelector('.report-stage[data-phase="2"]').textContent,fin:r.querySelector('#report-final').textContent,all:r.textContent};});
  assert.equal(info.open,true);assert.equal(info.h,'내 운영 보고서');assert.equal(info.stages,info.hist);
  assert.match(info.s1,/빨강 노선: 외곽 마을 → 대학교 → 밀집 주거지 → 병원·공공서비스 · 버스 1대/);assert.match(await page.locator('.report-stage[data-phase="3"]').textContent(),/빨강 노선: .* · 버스 2대/);assert.match(info.s1,/초록 노선: 기차역 → 산업·일자리 · 버스 1대/);
  assert.match(info.s1,/도착률/);assert.match(info.s1,/목적지까지 못 간 이동/);assert.match(info.s1,/최장 대기/);assert.match(info.s1,/단계 수지/);assert.match(info.s1,/주요 인물 기준 충족/);
  assert.match(info.s1,/오래 기다린 사람부터/);assert.match(info.s1,/이번에 나는 외곽 마을을 먼저 챙겼다\. 그 대신 수지가 손해를 봤다\./);assert.match(info.s1,/AI는 노선을 바꾸자고 했다\. 나는 다른 생각이다\. 왜냐하면 사람이 남아서\./);
  assert.match(info.s2,/\(고르지 않음\)/);assert.equal((info.s2.match(/\(쓰지 않음\)/g)||[]).length,2,'빈 답 두 개');
  assert.match(info.fin,/순자 할머니의 이동을 더 살피게 됐어요\./);assert.doesNotMatch(info.all,/추천해요|AI 비교/,'AI 제안 문장 없음');
  // 금배지: 5개·고정 순서·받음/아직 글자
  const bd=await page.evaluate(()=>[...document.querySelectorAll('#report-badges .badge')].map(l=>({id:l.dataset.badge,state:l.querySelector('.badge-state').textContent,text:l.textContent})));
  assert.deepEqual(bd.map(b=>b.id),['residents','petition','record','reasons','solvent']);bd.forEach(b=>assert.match(b.state,/^(받음|아직)$/));
  assert.match(info.all,/내가 고른 것/);
  await page.locator('#report-badges').screenshot({path:`${SHOT}/_shot-report-badges-1280.png`});
  // 이름: 저장 안 함, 다시 그려도 이 페이지에선 유지
  await page.fill('#report-name','김하늘');await page.evaluate(()=>PB.App.render());
  assert.equal(await page.inputValue('#report-name'),'김하늘','다시 그려도 유지');assert.doesNotMatch(await allStorage(page),/김하늘/,'저장소에 이름 없음');
  // PDF로 저장 = window.print, 인쇄 동안만 제목 바꿈
  const t0=await page.title();await page.evaluate(()=>{window.__printed=null;window.print=()=>{window.__printed=document.title;};});
  await page.locator('#btn-report-print').click();const printed=await page.evaluate(()=>window.__printed);
  assert.match(printed,/^공정성포용성_보고서_김하늘_\d{8}$/);assert.equal(await page.title(),t0,'제목 되돌림');
  await page.screenshot({path:`${SHOT}/_shot-report-1280.png`,fullPage:true});
  // 인쇄 미디어: 보고서만 보이고, 버튼·지도·머리말은 숨김
  await page.emulateMedia({media:'print'});
  const pr=await page.evaluate(()=>{const vis=sel=>{const n=document.querySelector(sel);return !!n&&getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().height>0;};
   return {report:vis('#report'),topbar:vis('#topbar'),stage:vis('.stage-col'),print:vis('#btn-report-print'),back:vis('#btn-report-back'),name:vis('#report-name')};});
  assert.deepEqual(pr,{report:true,topbar:false,stage:false,print:false,back:false,name:true});
  const pb=await page.evaluate(()=>[...document.querySelectorAll('#report-badges .badge-state')].map(n=>({v:getComputedStyle(n).display!=='none'&&n.getBoundingClientRect().height>0,t:n.textContent})));
  assert.equal(pb.length,5);assert.ok(pb.every(x=>x.v&&/^(받음|아직)$/.test(x.t)),'인쇄에서 배지 글자 보임');
  await page.screenshot({path:`${SHOT}/_shot-report-print-1280.png`,fullPage:true});
  await page.pdf({path:`${SHOT}/_report-1109.pdf`,format:'A4',printBackground:false,preferCSSPageSize:true});
  await page.emulateMedia({media:'screen'});
  // 돌아가기 → 엔딩
  await page.locator('#btn-report-back').click();await page.locator('#btn-report').waitFor();assert.equal(await page.evaluate(()=>document.body.classList.contains('report-open')),false);
  // 돌아보기 화면에도 보고서 버튼(마지막 소감을 쓴 뒤 바로)
  await page.locator('#btn-game-review').click();await page.locator('#btn-review-report').click();await page.locator('#report').waitFor();
  await page.locator('#btn-report-back').click();await page.locator('#final-reflection').waitFor();
  // 새로고침하면 이름은 사라짐
  await page.reload();await page.locator('#btn-continue').click();await page.locator('#btn-report').click();assert.equal(await page.inputValue('#report-name'),'','새로고침 뒤 이름 없음');
  assert.deepEqual(errors,[]);await page.close();console.log('  ok 1280');}
 // 375: 버튼이 닿고 가로 넘침 없음
 {const page=await browser.newPage({viewport:{width:375,height:812},reducedMotion:'reduce',hasTouch:true,isMobile:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'?no3d=1');await page.evaluate(()=>localStorage.clear());await page.reload();await toEnding(page);
  await page.locator('#btn-report').scrollIntoViewIfNeeded();await page.locator('#btn-report').tap();await page.locator('#report').waitFor();
  const m=await page.evaluate(()=>{const b=document.querySelector('#btn-report-print').getBoundingClientRect();return {over:document.documentElement.scrollWidth>innerWidth+1,b:{top:b.top,bottom:b.bottom,left:b.left,right:b.right,h:b.height}};});
  assert.equal(m.over,false,'가로 넘침 없음');assert.ok(m.b.h>=44&&m.b.left>=0&&m.b.right<=375,'버튼 크기·폭 '+JSON.stringify(m.b));
  await page.locator('#btn-report-print').scrollIntoViewIfNeeded();await page.evaluate(()=>{window.print=()=>{window.__printed=document.title;};});await page.locator('#btn-report-print').tap();
  assert.match(await page.evaluate(()=>window.__printed),/^공정성포용성_보고서_\d{8}$/);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('#report-badges .badge').length),5);
  await page.locator('#report-badges').screenshot({path:`${SHOT}/_shot-report-badges-375.png`});
  await page.screenshot({path:`${SHOT}/_shot-report-375.png`});await page.screenshot({path:`${SHOT}/_shot-report-375-full.png`,fullPage:true});
  assert.deepEqual(errors,[]);await page.close();console.log('  ok 375');}
 // file://
 {const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('publicness/index.html')).href+'?no3d=1');await toEnding(page);await page.locator('#btn-report').click();await page.locator('#report .report-stage').first().waitFor();
  await page.evaluate(()=>{window.print=()=>{window.__printed=document.title;};});await page.locator('#btn-report-print').click();assert.match(await page.evaluate(()=>window.__printed),/^공정성포용성_보고서_/);
  assert.deepEqual(errors,[]);await page.close();console.log('  ok file://');}
 console.log('PASS report-1109');}finally{await browser.close();server.close();}
