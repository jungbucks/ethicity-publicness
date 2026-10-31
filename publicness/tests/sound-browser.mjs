// 효과음: 기본 켜짐, 운행 중 승객 등장 '톡'(간격 제한)·주요 인물 두 음·차임, 운행 화면 소리 버튼, 끈 상태 기억, 폰 폭에서 조작 버튼 안 넘침.
// 실제 소리 대신 가짜 AudioContext로 울린 음의 높이만 기록한다.
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';import {beginPlan} from './browser-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
const fakeAudio=()=>{window.__tones=[];class Param{setValueAtTime(){}exponentialRampToValueAtTime(){}}
 class Ctx{constructor(){this.currentTime=0;this.state='running';this.destination={};}resume(){}
  createOscillator(){const o={frequency:{value:0},type:'sine',connect(){},start(){window.__tones.push({f:o.frequency.value,at:performance.now()});},stop(){}};return o;}
  createGain(){return {gain:new Param(),connect(){}};}}
 window.AudioContext=Ctx;};
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const ctx=await browser.newContext({viewport:{width:1366,height:900}});await ctx.addInitScript(fakeAudio);
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`;
 await page.goto(url);assert.equal(await page.evaluate(()=>PB.App.sound),true,'sound on by default');assert.ok(await page.locator('#opt-sound').isChecked());
 await page.locator('#btn-start').click();await beginPlan(page);
 assert.equal(await page.evaluate(()=>window.__tones.length),0,'no sound while planning');
 // 나래 일정(F→D)과 2호차 쉬기, 2배속으로 몇 초 운행
 await page.evaluate(()=>{PB.App.onNodeClick('F');PB.App.onNodeClick('D');});await page.locator('#assign-route-1').click();
 await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
 assert.equal(await page.locator('#run-sound').getAttribute('aria-pressed'),'true');assert.match(await page.locator('#run-sound').textContent(),/🔊/);
 await page.locator('#speed-2').click();await page.waitForTimeout(12000);
 const t=await page.evaluate(()=>window.__tones.slice());
 const pops=t.filter(x=>x.f===1175),res=t.filter(x=>x.f===784),chime=t.filter(x=>x.f===659);
 assert.ok(pops.length>=3,'passenger pops '+pops.length);
 for(let i=1;i<pops.length;i++)assert.ok(pops[i].at-pops[i-1].at>=440,'pop spacing '+(pops[i].at-pops[i-1].at));
 assert.ok(res.length>=1,'resident appearance tone (준 06:03, 하늘 08:00, 나래 09:03 within 24 minutes of game time)');
 // 소리 끄기: 이후 소리 없음, 설정 체크와 기억 반영
 await page.locator('#run-sound').click();assert.equal(await page.locator('#run-sound').getAttribute('aria-pressed'),'false');assert.match(await page.locator('#run-sound').textContent(),/🔇/);
 const before=await page.evaluate(()=>window.__tones.length);await page.waitForTimeout(3000);assert.equal(await page.evaluate(()=>window.__tones.length),before,'muted');
 assert.equal(await page.evaluate(()=>localStorage.getItem('ethicity.publicness.sound')),'0');assert.equal(await page.locator('#opt-sound').isChecked(),false);
 // 다시 열어도 꺼진 채 시작, 설정에서 켜면 기억도 켜짐
 await page.goto(url);assert.equal(await page.evaluate(()=>PB.App.sound),false);assert.equal(await page.locator('#opt-sound').isChecked(),false);
 await page.evaluate(()=>document.querySelector('#settings').showModal());await page.locator('#opt-sound').check();assert.equal(await page.evaluate(()=>localStorage.getItem('ethicity.publicness.sound')),'1');
 console.log(`PASS sound: default on, ${pops.length} passenger pops ≥440ms apart, ${res.length} resident tones, ${chime.length} chimes, mute button, remembered off/on`);
 assert.deepEqual(errors,[]);await ctx.close();
 // 폰 폭: 조작 버튼 4개가 지도 안에
 const phone=await browser.newContext({viewport:{width:375,height:812},hasTouch:true});await phone.addInitScript(fakeAudio);const p=await phone.newPage();
 await p.goto(url);await p.locator('#btn-start').click();await beginPlan(p);await p.evaluate(()=>{PB.App.onNodeClick('F');PB.App.onNodeClick('D');});await p.locator('#assign-route-1').click();
 await p.locator('#btn-depart').click();await p.locator('#confirm-yes').click();await p.locator('#run-sound').waitFor();
 const fits=await p.evaluate(()=>[...document.querySelectorAll('#run-controls button')].every(b=>{const r=b.getBoundingClientRect(),s=document.querySelector('#stage').getBoundingClientRect();return r.left>=s.left-1&&r.right<=s.right+1;}));
 assert.ok(fits,'run controls stay inside the map at 375px');await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(300);await p.screenshot({path:'publicness/tests/_shot-sound-375.png'});
 console.log('PASS 375px: run controls including sound fit');await phone.close();
}finally{if(browser)await browser.close();server.close();}
