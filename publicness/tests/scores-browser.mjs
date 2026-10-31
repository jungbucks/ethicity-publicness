// 두 점수 화면(헤드리스 Edge, 2D 지도) — 결과 화면 맨 위 두 칸·근거 문장·공공성 보조 정보·펼침 계산 내역,
// 무운행 단계의 ‘평가 보류’, 새로고침 뒤 같은 점수(중복 없음), 엔딩의 한 학기 두 점수(건수 합), 375px 가로 넘침 없음, 합산·순위·별점·움직임 없음
import {beginPlan} from './browser-fixture.mjs';
import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),server=await startServer(0);let browser;
const base=`http://127.0.0.1:${server.address().port}/publicness/?no3d=1`;
async function closeStory(page){for(let i=0;i<20&&await page.locator('#goal-intro').evaluate(d=>d.open);i++){await page.keyboard.press('Escape');await page.waitForTimeout(50);}}
async function setPlan(page,routes){await page.evaluate(rs=>{const s=PB.App.s,S=PB.Session;s.draft.routes=[];s.draft.buses.forEach(b=>{b.routeNum=null;});
  rs.forEach(([ns,ids])=>{const r=S.addRoute(s,{nodes:ns,stops:ns.map(()=>true)});ids.forEach(id=>S.assign(s,id,r.num));});PB.App.go('plan');},routes);}
async function run(page){await page.evaluate(()=>{window.__pbFast=true;PB.App.setSpeed(2);});
  await page.locator('#btn-depart').click();await page.locator('#confirm-yes').click();
  await page.locator('#run-skip').click({timeout:3000}).catch(()=>{});await page.locator('#skip-yes').click({timeout:1500}).catch(()=>{});
  await page.locator('#btn-next-phase').waitFor({timeout:90000});}
const scoresText=page=>page.locator('#scores').innerText();
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const ctx=await browser.newContext({viewport:{width:1366,height:900}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#btn-start').click();await page.locator('#btn-goal-start').click();await beginPlan(page);
  // 1단계: 외곽 마을·병원까지 잇는 두 노선
  await setPlan(page,[[['F','C','B','A'],[1]],[['D','A','G'],[2]]]);await run(page);
  const h=await page.evaluate(()=>{const h=PB.App.s.history[0];return {f:h.scores.finance,m:h.scores.mobility,bal:PB.Session.balance(PB.App.s)};});
  const first=await page.locator('#result-panel, #panel').first().evaluate(p=>{const s=p.querySelector('#scores');return s&&s.previousElementSibling&&s.previousElementSibling.tagName;});
  assert.equal(first,'H2','두 점수는 결과 제목 바로 아래');
  assert.equal(await page.locator('#score-finance .score-value').getAttribute('data-score'),String(h.f.score));
  assert.equal(await page.locator('#score-mobility .score-value').getAttribute('data-score'),String(h.m.score));
  assert.match(await page.locator('#score-mobility .score-basis').innerText(),new RegExp(h.m.N+'건 중 '+h.m.done+'건 완료'));
  assert.match(await page.locator('#score-finance .score-basis').innerText(),/누적 잔액 .*원 \/ 기준 예비비 .*원/);
  const line=await page.locator('#score-line').innerText();assert.ok(line.length>10,'놓친 이동 한 줄');
  assert.match(line,new RegExp(String(h.m.N-h.m.done)+'건|'+'남았어요'));
  assert.match(await page.locator('#score-outer').innerText(),/외곽 마을을 오가는 이동 \d+건 중 \d+건 완료/);
  assert.match(await page.locator('#score-essential').innerText(),/필수 목적지\(대학교·병원·공공서비스\)로 가는 이동/);
  assert.equal(await page.locator('#score-method').evaluate(d=>d.open),false,'계산 방법은 접혀 있다');
  assert.match(await page.locator('#score-method').innerText(),/계산 방법과 비용 내역/);
  const all=await scoresText(page);assert.doesNotMatch(all,/총점|종합 점수|순위|별점|★/);
  assert.equal(await page.locator('#scores *').evaluateAll(n=>n.filter(x=>getComputedStyle(x).animationName!=='none'||getComputedStyle(x).transitionDuration.split(',').some(d=>parseFloat(d)>0)).length),0,'점수에 움직임 없음');
  // 새로고침 뒤 같은 점수(정산·점수 중복 없음)
  await page.reload();await page.locator('#btn-continue').click();await page.locator('#scores').waitFor();
  assert.equal(await scoresText(page),all);assert.equal(await page.evaluate(()=>PB.App.s.history.length),1);
  // 375px: 가로 넘침 없음
  await page.setViewportSize({width:375,height:800});await page.waitForTimeout(200);
  assert.ok(await page.locator('#scores').evaluate(s=>s.scrollWidth<=s.clientWidth+1),'375px 가로 넘침 없음');
  await page.locator('#scores').screenshot({path:'publicness/tests/_shot-scores-375.png'});
  await page.setViewportSize({width:1366,height:900});
  await page.locator('#scores').screenshot({path:'publicness/tests/_shot-scores-result.png'});
  // 2단계: 버스를 모두 쉬게 함 → 재정 평가 보류(잔액은 그대로 표시), 이동은 정상 평가(0점)
  await page.locator('#btn-next-phase').click();await beginPlan(page);await setPlan(page,[]);await run(page);
  assert.match(await page.locator('#score-finance').innerText(),/서비스 미운영 — 재정 건전성 평가 보류[\s\S]*누적 잔액/);
  assert.doesNotMatch(await page.locator('#score-finance').innerText(),/우수|잘했어요|훌륭/,'보류에 칭찬 문구 없음');
  assert.equal(await page.locator('#score-mobility .score-value').getAttribute('data-score'),'0');
  // 3~5단계는 1단계와 같은 계획 → 엔딩의 한 학기 두 점수
  for(let p=3;p<=5;p++){await page.locator('#btn-next-phase').click();await beginPlan(page);await setPlan(page,[[['F','C','B','A'],[1]],[['D','A','G'],[2]]]);await run(page);}
  await page.locator('#btn-next-phase').click();await page.locator('#ending-title').waitFor();await closeStory(page);
  const o=await page.evaluate(()=>PB.Session.scoresOverall(PB.App.s));
  assert.equal(o.mobility.N,await page.evaluate(()=>PB.App.s.history.reduce((a,h)=>a+h.scores.mobility.N,0)),'전체 평가 수요 = 단계 합');
  assert.match(await page.locator('#final-scores #score-mobility .score-basis').innerText(),new RegExp(o.mobility.N+'건 중 '+o.mobility.done+'건 완료'));
  assert.match(await page.locator('#score-range').innerText(),/1~5단계 운행 기준\(전체 5단계\)/);
  assert.equal(await page.locator('#final-scores #score-finance .score-value').getAttribute('data-score'),o.finance.score==null?'':String(o.finance.score));
  assert.match(await page.locator('#score-phases').textContent(),/보류\(미운영\)/,'단계별 표에 2단계 보류');
  await page.locator('#final-scores').screenshot({path:'publicness/tests/_shot-scores-ending.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS scores-browser — 결과 두 점수·근거·보조 정보·접힘·움직임 없음·새로고침 동일·375 넘침 없음·보류·엔딩 건수 합',JSON.stringify({phase1:{fin:h.f.score,mob:h.m.score+' ('+h.m.done+'/'+h.m.N+')'},final:{fin:o.finance.score,mob:o.mobility.score+' ('+o.mobility.done+'/'+o.mobility.N+')'}}));
}finally{if(browser)await browser.close();server.close();}
