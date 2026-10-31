// 지도 시각 위계 비교 캡처 — 같은 장면을 원본·흑백(grayscale 1)·흐림(blur 4px)으로. 작업 전후 비교용
//   node publicness/tests/visual-capture.mjs before|after   → publicness/docs/visual-hierarchy/<tag>-<장면>-<필터>.png
// 장면: plan = 기본 세팅 3단계, 노선 4개(버스 1대씩), plan-375 = 같은 장면 폰 폭, run = 같은 계획으로 출발해 첫 긴급 조정(10:06) 멈춤
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const tag=process.argv[2]||'before',out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs/visual-hierarchy');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ROUTES=[['F','C','B','A'],['I','D','A','G'],['E','H','A'],['B','E','G']];
async function setup(page){
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/`);
  await page.evaluate(routes=>{localStorage.clear();const S=PB.Session;PB.App.startGame();const s=PB.App.s;s.tutorialSeen=true;
    while(s.phase<3){S.beginPlan(s);S.startRun(s);s.current.metrics.costs.total=0;S.finishRun(s);S.nextPhase(s);}
    S.beginPlan(s);s.draft.routes=routes.map((ns,i)=>({num:i+1,nodes:ns,stops:ns.map(()=>true),autoPlaced:true}));s.draft.buses.forEach((b,i)=>{b.routeNum=i<routes.length?i+1:null;});
    PB.App._sceneKey=null;PB.App.go('plan');},ROUTES);
  await page.waitForTimeout(2500);
}
async function shoot(page,scene){
  for(const [name,filter] of [['color','none'],['gray','grayscale(1)'],['blur','blur(4px)']]){
    await page.evaluate(f=>{document.documentElement.style.filter=f;},filter);await page.waitForTimeout(150);
    await page.screenshot({path:path.join(out,`${tag}-${scene}-${name}.png`)});
  }
  await page.evaluate(()=>{document.documentElement.style.filter='';});
}
try{
  let page=await browser.newPage({viewport:{width:1280,height:860},reducedMotion:'reduce'});await setup(page);await shoot(page,'plan');
  // 운행: 출발 → ⏭ 다음 결정까지로 첫 긴급 조정(멈춤)까지
  await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
  for(let i=0;i<20&&!(await page.locator('#emergency-dialog[open]').count());i++){await page.locator('#run-next').click().catch(()=>{});await page.waitForTimeout(1500);}
  await page.waitForTimeout(800);await shoot(page,'run');await page.close();
  page=await browser.newPage({viewport:{width:375,height:812},deviceScaleFactor:2,reducedMotion:'reduce'});await setup(page);await shoot(page,'plan-375');await page.close();
  console.log('captured',tag,'→',out);
}finally{await browser.close();server.close();}
