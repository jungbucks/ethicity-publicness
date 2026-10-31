import fs from 'node:fs';
import {createRequire} from 'node:module';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require('D:/Works/token_economy/node_modules/playwright');
const server=await startServer(0),browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),samples=[];
const after=process.argv.includes('--after'),suffix=after?'after':'before';page.on('pageerror',e=>console.error(e.message));
async function read(name,selector){
 await page.waitForTimeout(180);
 const rows=await page.evaluate(selector=>{
  const roots=[...document.querySelectorAll(selector)],groups=new Map();
  for(const root of roots){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let t;
   while(t=walker.nextNode()){
    if(!t.textContent.trim()||t.parentElement.closest('script,style,svg,option,.story-sr,.sr-only'))continue;
    const e=t.parentElement.closest('p,li,button,summary,label,h1,h2,h3,h4,td,th,dt,dd,legend,small')||t.parentElement;
    if(!groups.has(e))groups.set(e,[]);groups.get(e).push(t);
   }
  }
  return [...groups].map(([e,nodes])=>{
   const text=nodes.map(n=>n.textContent).join(' ').replace(/\s+/g,' ').trim();
   const shown=nodes.filter(n=>{if(getComputedStyle(n.parentElement).fontSize==='0px')return false;for(let a=n.parentElement;a;a=a.parentElement){if(getComputedStyle(a).display==='none'||getComputedStyle(a).visibility==='hidden'||(a.tagName==='DETAILS'&&!a.open&&!a.querySelector(':scope > summary')?.contains(n)))return false;}const range=document.createRange();range.selectNodeContents(n);return [...range.getClientRects()].some(r=>r.width&&r.height);}),shownText=shown.map(n=>n.textContent).join(' ').replace(/\s+/g,' ').trim(),visible=shown.length>0;
   return {text,chars:[...text].length,shownText,shownChars:[...shownText].length,visible,button:!!e.closest('button,summary,select'),map:!!e.closest('#stage'),selector:e.id?'#'+e.id:e.className?e.tagName.toLowerCase()+'.'+String(e.className).trim().replace(/\s+/g,'.'):e.tagName.toLowerCase()};
  }).filter(r=>r.text);
 },selector);
 const role=r=>/예상 수지|수행분|기본 지원|보유비|임차료|연료|운영비|손익|정산|누적 잔액|재정 상세/.test(r.text)?'c 회계 상세':/책임|소외|공공성|효율|기준|정답|생각|누구|AI.*목표|누군가|판단|살필까요/.test(r.text)?'d 학습 메시지':/했어요|중이에요|일시정지|예정|도착|운행 중|학기 초|계획 중|기다리|미도착|만차/.test(r.text)?'e 상태 알림':/누르|드래그|끌어|키보드|클릭|자동|하면|한 번|수 있어|저장|최대|다음|간격|정원|배속|건너뛰/.test(r.text)?'b 규칙 설명':'a 결정 정보';
 rows.forEach(r=>r.role=role(r));
 samples.push({name,rows,visible:rows.reduce((n,r)=>n+r.shownChars,0),prose:rows.filter(r=>r.visible&&!r.button&&!r.map).reduce((n,r)=>n+[...r.shownText.replace(/[\d,.:%×+−→\/₩]+/g,'')].length,0),all:rows.reduce((n,r)=>n+r.chars,0)});
}
async function setup(phase=1){
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1&minimal=${after?1:0}`);
 await page.evaluate(phase=>{localStorage.clear();PB.App.startGame();document.querySelector('#btn-goal-start').click();document.querySelectorAll('dialog[open]').forEach(d=>d.close());const S=PB.Session,s=PB.App.s;s.tutorialSeen=true;
  while(s.phase<phase){S.beginPlan(s);S.startRun(s);s.current.metrics.costs.total=0;S.finishRun(s);S.nextPhase(s);}S.beginPlan(s);PB.App.go('plan');
 },phase);
}
async function plan(){await page.evaluate(()=>{const s=PB.App.s,S=PB.Session;s.draft.routes=[];s.draft.buses.forEach(b=>b.routeNum=null);[['F','C','B','A'],['D','A','G']].forEach(ns=>{const r=S.addRoute(s,{nodes:ns,stops:ns.map(()=>true)});S.assign(s,s.draft.buses.find(b=>b.routeNum==null).id,r.num);});PB.App.render();});}
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1&minimal=${after?1:0}`);
 await read('타이틀','#screen-title');
 for(const kind of ['intro','sol','baseball','mall']){
  await page.evaluate(kind=>PB.Cutscene.play(kind,()=>{}),kind);
  for(let i=0;i<4;i++){if(!await page.locator('#goal-intro').evaluate(e=>e.open))break;await read('컷신 '+kind+' '+(i+1),'#goal-intro');await page.locator('#story-next').click();}
 }
 await setup();await read('노선 설계 · 첫 시작','#topbar,#screen-game');
 await plan();await read('노선 설계 · 노선 2개','#topbar,#screen-game');
 await page.locator('#plan-text-toggle').click();await read('노선 설계 · 텍스트 펼침','#topbar,#screen-game');await page.locator('#plan-text-toggle').click();
 await page.evaluate(()=>{PB.Session.startRun(PB.App.s);PB.App.go('run');document.querySelector('#run-pause').click();});await read('운행 · 05:00','#topbar,#screen-game');
 await page.evaluate(()=>{PB.UI.stopRun();PB.Session.finishRun(PB.App.s);PB.App.go('result');});await read('결과 · 기본','#topbar,#screen-game');
 await page.evaluate(()=>document.querySelectorAll('#minimal-result-details,#result-details').forEach(e=>e.open=true));await read('결과 · 자세히','#topbar,#screen-game');
 await page.evaluate(()=>{PB.Session.nextPhase(PB.App.s);PB.App.go('reflect');});await read('성찰 · 2단계','#topbar,#panel');
 await page.evaluate(()=>{document.querySelector('#reflection-next').click();});await read('단계 전환 · 2단계','#topbar,#panel');
 await setup(3);await plan();await page.evaluate(()=>{const A=PB.App;PB.Session.startRun(A.s);A.s.runCursor=PB.Session.EMERGENCY_AT[0]-.01;A.go('run');});
 await page.waitForSelector('#emergency-dialog[open]',{timeout:10000});await read('긴급 조정 · 3단계','#emergency-dialog');
 fs.writeFileSync('publicness/tests/_text-audit-'+suffix+'.json',JSON.stringify(samples,null,2));
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>화면 문구 실측 목록</title><style>body{font:16px/1.7 system-ui,sans-serif;color:#1a1d24;max-width:1150px;margin:40px auto;padding:0 24px}table{border-collapse:collapse;width:100%;margin-bottom:32px}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}td:nth-child(2){min-width:65px}code{font-size:12px}h2{margin-top:48px}.fold{color:#667085}nav{position:sticky;top:0;background:white;padding:8px}a{color:#2563eb}</style><h1>화면 문구 실측 목록</h1><p>2026-10-31 · 수정 전 · 1280×900 · 기본 모드. 공백·문장부호 포함, 유니코드 코드포인트 수. 화면별 실행 상태와 현재 노선에 따른 표본이며 모든 랜덤 사건의 전수 조합은 아님. 접힌/숨은 문구를 별도로 포함. 역할은 1차 분류이며 복합 역할은 아래 계획에서 구분한다. 버튼·정류장·숫자를 모두 포함한 ‘표시 글자’와 예산 검사용 문장 수는 서로 다르다.</p><table><tr><th>화면</th><th>표시 글자</th><th>숨은/접힌 글 포함</th></tr>${samples.map((s,i)=>`<tr><td><a href="#s${i}">${esc(s.name)}</a></td><td>${s.visible}</td><td>${s.all}</td></tr>`).join('')}</table>${samples.map((s,i)=>`<h2 id="s${i}">${esc(s.name)}</h2><table><tr><th>현재 문구</th><th>글자</th><th>역할</th><th>표시</th><th>위치</th></tr>${s.rows.map(r=>`<tr class="${r.visible?'':'fold'}"><td>${esc(r.text)}</td><td>${r.chars}</td><td>${esc(r.role)}</td><td>${r.visible?'표시':'접힘/숨김'}</td><td><code>${esc(r.selector)}</code></td></tr>`).join('')}</table>`).join('')}</html>`;
 fs.writeFileSync('publicness/tests/_text-audit-'+suffix+'.html',html.replace('수정 전',after?'수정 후':'수정 전'));
 console.log(JSON.stringify(samples.map(({name,visible,all,prose})=>({name,visible,all,prose})),null,2));
}finally{await browser.close();server.close();}
