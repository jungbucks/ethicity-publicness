// 유나·다은 초상(2026-10-27, tools/portrait-crop.mjs): 지도 얼굴·결과 카드·엔딩 카드가 다른 인물처럼 portrait-<id>-calm.webp를 쓰고 실제로 풀린다(이름 글자 대신)
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true});
const loaded=(page,sel)=>page.$$eval(sel,imgs=>imgs.map(i=>({src:i.getAttribute('src'),ok:i.complete&&i.naturalWidth===512})));
try{const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`);
 await page.evaluate(()=>{localStorage.clear();const S=PB.Session;PB.App.startGame();const s=PB.App.s;s.tutorialSeen=true;while(s.phase<4){S.beginPlan(s);S.startRun(s);S.finishRun(s);S.nextPhase(s);}S.beginPlan(s);PB.App.go('plan');});
 await page.waitForFunction(()=>[...document.querySelectorAll('#resident-map-yuna img,#resident-map-daeun img')].every(i=>i.complete&&i.naturalWidth>0));
 for(const id of ['yuna','daeun'])assert.deepEqual(await loaded(page,`#resident-map-${id} img`),[{src:`assets/art/portrait-${id}-calm.webp`,ok:true}],'지도 '+id);
 // 결과 카드
 await page.evaluate(()=>{const S=PB.Session,s=PB.App.s;S.startRun(s);S.finishRun(s);PB.App.go('result');});
 await page.waitForFunction(()=>[...document.querySelectorAll('.resident-face.yuna img,.resident-face.daeun img')].every(i=>i.complete&&i.naturalWidth>0));
 for(const id of ['yuna','daeun']){const l=await loaded(page,`#panel .resident-face.${id} img`);assert.ok(l.length>=1&&l.every(x=>x.ok&&x.src===`assets/art/portrait-${id}-calm.webp`),'결과 '+id+JSON.stringify(l));}
 // 엔딩 카드: 이름 글자 대신 그림
 await page.evaluate(()=>{const S=PB.Session,s=PB.App.s;while(s.stage!=='ending'){S.nextPhase(s);if(s.stage==='ending')break;S.beginPlan(s);S.startRun(s);S.finishRun(s);}PB.App.go('ending');});
 for(let i=0;i<20&&await page.locator('#goal-intro').evaluate(d=>d.open);i++){await page.keyboard.press('Escape');await page.waitForTimeout(50);}
 await page.waitForFunction(()=>[...document.querySelectorAll('.resident-card[data-id=yuna] .face img,.resident-card[data-id=daeun] .face img')].every(i=>i.complete&&i.naturalWidth>0));
 for(const id of ['yuna','daeun']){assert.deepEqual(await loaded(page,`.resident-card[data-id=${id}] .face img`),[{src:`assets/art/portrait-${id}-calm.webp`,ok:true}],'엔딩 '+id);
  assert.equal(await page.locator(`.resident-card[data-id=${id}] .face`).evaluate(f=>f.textContent.trim()),'','이름 글자 대신 그림');}
 await page.locator('.resident-card[data-id=yuna]').screenshot({path:'publicness/tests/_shot-portrait-ending.png'});
 assert.deepEqual(errors,[]);console.log('PASS portraits: map, result, ending for yuna·daeun');
}finally{await browser.close();server.close();}
