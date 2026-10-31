// 단계 시작 안내(첫 노선 안내 창)는 두 줄 — 버스 수·노선 한도는 그 단계 실제 값, 운행 시각은 설정 그대로. 예전 긴 문구(인물 예시·회수·배속 시간·조정 규칙)는 없다.
// 기본 1~5단계, 도전(세팅 7) 1~8단계를 도움말의 ‘다시 보기’로 열어 확인한다
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const q of ['','&seed=7']){
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1${q}`);
 await page.evaluate(()=>{localStorage.clear();PB.App.startGame();PB.App.s.tutorialSeen=true;PB.Session.beginPlan(PB.App.s);PB.App.go('plan');});
 const total=await page.evaluate(()=>PB.App.s.config.phases.length);
 for(let p=1;p<=total;p++){
  const want=await page.evaluate(()=>{const s=PB.App.s,c=s.config;const hm=m=>{const t=c.day.start+m*(c.day.end-c.day.start)/c.bus.window;return String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.round(t%60)).padStart(2,'0');};
   return {buses:s.owned,routes:PB.Session.routeLimit(s),start:hm(0),end:hm(c.bus.window),prog:c.progression?[c.progression.buses[s.phase-1],c.progression.routes[s.phase-1]]:null};});
  await page.locator('#btn-help').click();await page.locator('#btn-tutorial-replay').click();
  const text=(await page.$$eval('#tutorial-rule p',ps=>ps.map(p=>p.textContent))).join('\n'),all=await page.locator('#tutorial-dialog').innerText();
  assert.equal(text,`이번 단계는 버스 ${want.buses}대 · 노선 최대 ${want.routes}개로 운영해요.\n출발하면 ${want.start}~${want.end}의 하루 운행이 시작돼요.`,'단계 '+p);
  if(want.prog)assert.deepEqual([want.buses,want.routes],want.prog,'단계별 지급표와 같은 값 '+p);
  assert.equal(`${want.start}~${want.end}`,'05:00~23:00','설정의 하루 운행 시각');
  assert.doesNotMatch(all,/예:|누구의 길부터|대기로 돌리기|쉬어요|초에|2×|오전·오후|조정|결과를 보고/,'예전 긴 문구 없음 '+p);
  await page.locator('#btn-tutorial-close').click();
  if(p<total)await page.evaluate(()=>{const S=PB.Session,s=PB.App.s;S.startRun(s);s.current.metrics.costs.total=0;S.finishRun(s);S.nextPhase(s);S.beginPlan(s);PB.App.go('plan');});
  console.log(' ',q||'default',p,text.replace('\n',' / '));
 }
 assert.deepEqual(errors,[]);await page.close();
}console.log('PASS tutorial two lines match stage data');}finally{await browser.close();server.close();}
