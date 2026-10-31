import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import fs from 'node:fs';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0),run=JSON.parse(fs.readFileSync('publicness/tests/_play-review.json')).find(r=>r.seed===42);let browser;
try{browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/publicness/?seed=42`);await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();await page.evaluate(()=>window.__pbFast=true);
for(const day of run.days){
 if(day.phase>1){await page.locator('#btn-next-phase').click();while(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}}
 if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);
 await page.evaluate(d=>{const s=PB.App.s;for(const r of d.routes)PB.Session.updateRoute(s,r.num,r);for(const b of d.buses)PB.Session.assign(s,b.id,b.routeNum);PB.App.render();},day);
 await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();await page.locator('#resident-summary').waitFor();
 // 기준 기록(로컬 _play-review.json, 진호 추가 전)에 있는 인물만 비교 — 진호(7단계~)는 따로 출력
 const ids=Object.keys(day.residents);
 assert.deepEqual(await page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,PB.App.s.history.at(-1).residents[id]?.dayStatus])),ids),Object.fromEntries(ids.map(id=>[id,day.residents[id]?.dayStatus])));
 if(day.phase>=7)console.log('jinho phase',day.phase,await page.evaluate(()=>PB.App.s.history.at(-1).residents.jinho?.dayStatus));
 if(day.phase===8){await page.screenshot({path:'publicness/tests/_shot-review-stage8.png'});console.log('metro',await page.evaluate(()=>PB.App.s.current.result.passengers.filter(p=>p.o==='N'||p.d==='N').reduce((a,p)=>(a[p.status]=(a[p.status]||0)+1,a),{})));}
}
await page.locator('#btn-next-phase').click();await page.locator('#btn-goal-start').click();assert.ok(await page.evaluate(()=>PB.Narrative.endingReactions(PB.App.s.config,PB.App.s.history).filter(r=>r.id!=='jinho').every(r=>r.satisfied)));console.log('end',await page.evaluate(()=>[PB.App.s.end,PB.App.s.deficits]));assert.deepEqual(errors,[]);console.log('PASS: 3D UI actual eight phase reference plan matches engine and six satisfied ending');
}finally{if(browser)await browser.close();server.close();}
