// 2026-11-10 공정성·포용 개편 Task 8: 정류장 수익성 — 이름표 남색 3단계·범례·결과 표
// 실행: PLAYWRIGHT_MODULE=… node publicness/tests/profit-labels-1110-browser.mjs
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';import {beginPlan} from './browser-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=`http://127.0.0.1:${server.address().port}/publicness/`,SHOT=process.env.SHOT_DIR||'publicness/tests';
const ROUTES=[[1,['F','C','D','A'],1],[2,['B','A','G','E'],1]];
const lay=(page)=>page.evaluate(R=>{const A=PB.App,S=PB.Session,s=A.s;S.beginPlan(s);s.draft.routes=[];s.draft.buses.forEach(b=>b.routeNum=null);
 R.forEach(([num,nodes,buses])=>{s.draft.routes.push({num,nodes:nodes.slice(),stops:nodes.map(()=>true),autoPlaced:true});s.draft.buses.filter(b=>b.routeNum==null).slice(0,buses).forEach(b=>b.routeNum=num);});},ROUTES);
const labels=(page)=>page.evaluate(()=>[...document.querySelectorAll('.net-label')].map(l=>({id:l.dataset.node,cls:[...l.classList].filter(c=>c.startsWith('net-profit-')),free:(l.querySelector('.net-free')||{}).textContent||null,aria:l.getAttribute('aria-label'),bg:getComputedStyle(l).backgroundColor,ink:getComputedStyle(l).color})));
const geom=(page)=>page.evaluate(()=>{const st=document.querySelector('#stage').getBoundingClientRect(),ls=[...document.querySelectorAll('.net-label')].filter(l=>l.getBoundingClientRect().width).map(l=>({id:l.dataset.node,r:l.getBoundingClientRect()}));
 const out=ls.filter(x=>x.r.right>st.right+1||x.r.left<st.left-1).map(x=>x.id),hit=[];
 for(let i=0;i<ls.length;i++)for(let j=i+1;j<ls.length;j++){const a=ls[i].r,b=ls[j].r;if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)hit.push(ls[i].id+'/'+ls[j].id);}
 return {doc:document.documentElement.scrollWidth>innerWidth+1,out,hit};});
const expected=(page)=>page.evaluate(()=>PB.Metrics.stopFares(PB.App.s.current.result));
const goPlan=async(page)=>{await page.goto(base+page.__q);await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.locator('#btn-start').click();while(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start').click();}
 if(await page.locator('#learning-dialog:modal').count())await page.locator('#btn-learning-continue').click();await beginPlan(page);};
try{for(const [w,h,q] of [[1280,800,'?no3d=1'],[390,844,'?no3d=1'],[1280,800,'']]){
 const tag=q?w:w+'-3d',page=await browser.newPage({viewport:{width:w,height:h},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.__q=q;
 await goPlan(page);await lay(page);
 await page.evaluate(()=>{PB.App.enterPlan();document.querySelectorAll('dialog[open]').forEach(d=>d.close());});
 // 계획 화면: 처음엔 없음 -> 켜면 생김 -> 끄면 사라짐
 await page.locator('#opt-profit').waitFor();assert.equal(await page.locator('#profit-legend').count(),0,'꺼짐: 범례 없음');
 await page.waitForTimeout(400);assert.equal((await labels(page)).filter(l=>l.cls.length).length,0,'계획 처음엔 수익성 이름표 0');
 await page.locator('#opt-profit').check();await page.waitForFunction(()=>document.querySelectorAll('.net-label[class*="net-profit-"]').length>0,null,{timeout:20000});
 await page.locator('#profit-legend').waitFor();assert.ok((await page.locator('#profit-legend').textContent()).includes('1명당 운임'));
 await page.locator('#opt-profit').uncheck();await page.waitForFunction(()=>document.querySelectorAll('.net-label[class*="net-profit-"]').length===0,null,{timeout:10000});
 assert.equal(await page.locator('#profit-legend').count(),0,'끄면 범례도 사라짐');
 // 운행 화면: 없음
 await page.evaluate(()=>{const A=PB.App,S=PB.Session;S.startRun(A.s);A.go('run');});await page.waitForTimeout(600);
 assert.equal((await labels(page)).filter(l=>l.cls.length).length,0,'운행 화면 0');
 // 결과 화면
 await page.evaluate(()=>{const A=PB.App,S=PB.Session;S.finishRun(A.s);A.go('result');});
 await page.waitForFunction(()=>document.querySelectorAll('.net-label[class*="net-profit-"]').length>0,null,{timeout:20000});await page.waitForTimeout(500);
 const sf=await expected(page),ls=await labels(page);
 assert.ok(ls.some(l=>l.cls.includes('net-profit-hi')),'hi 이름표 >=1');
 for(const l of ls){const z=sf[l.id];if(!z||!z.tier){assert.equal(l.cls.length,0);continue;}
  assert.deepEqual(l.cls,['net-profit-'+z.tier],l.id+' 단계');
  assert.ok(l.aria.includes('1명당 운임 '+{hi:'높음',mid:'중간',lo:'낮음'}[z.tier]),l.aria);
  if(z.tier==='lo'&&z.free>0)assert.equal(l.free,'무임 '+z.free+'명',l.id);else assert.equal(l.free,null,l.id+' 무임 글 없음');
  if(z.tier==='hi'){assert.equal(l.bg,'rgb(31, 46, 77)');assert.equal(l.ink,'rgb(255, 255, 255)');}
  if(z.tier==='mid'){assert.equal(l.bg,'rgb(201, 211, 227)');assert.equal(l.ink,'rgb(31, 46, 77)');}}
 assert.ok(await page.locator('#profit-legend').count()===1,'결과 범례');
 await page.evaluate(()=>{document.querySelector('#result-details').open=true;document.querySelector('#result-map-toggle').click();});await page.waitForTimeout(1500);
 const vis=await page.evaluate(()=>[...document.querySelectorAll('.net-label[class*="net-profit-"]')].filter(l=>l.getBoundingClientRect().width>0).length);assert.ok(vis>=3,'지도에 보이는 수익성 이름표 '+vis);
 if(q){const g=await geom(page);assert.deepEqual(g,{doc:false,out:[],hit:[]},'이름표 넘침·겹침 '+JSON.stringify(g));}
 // 결과 표
 await page.evaluate(()=>{const d=document.querySelector('#result-details, details');});
 const tbl=await page.evaluate(()=>{const t=document.querySelector('#stop-fares');return t?[...t.querySelectorAll('tbody tr')].map(r=>[...r.children].map(c=>c.textContent)):null;});
 assert.ok(tbl&&tbl.length>0,'표 있음');assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#stop-fares th[scope=col]')].map(x=>x.textContent)),['정류장','탑승','운임','무임']);
 const sum=tbl.reduce((a,r)=>a+Number(r[2].replace(/\D/g,'')),0),fare=await page.evaluate(()=>PB.App.s.current.result.costs.fare);assert.equal(sum,fare,'표 운임 합 = 정산');
 assert.ok(!/적자|손해/.test(await page.locator('#stop-fares-sec').textContent()));
 await page.screenshot({path:`${SHOT}/_shot-profit-labels-${tag}.png`});
 assert.deepEqual(errors,[]);await page.close();console.log('  ok',tag);
}console.log('PASS profit-labels-1110');}finally{await browser.close();server.close();}
