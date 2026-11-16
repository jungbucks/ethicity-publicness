import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {startServer} from './serve.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await startServer(0);
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 for (const width of [1366,375]) for (const minimal of [true,false]) {
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let release;
  const gate=new Promise(resolve=>release=resolve);
  // Hold the first game script: the title has painted, but no game code has run.
  await page.route('**/js/config.js',async route=>{await gate;await route.continue();});
  const navigation=page.goto(`http://127.0.0.1:${server.address().port}/publicness/?no3d=1${minimal?'':'&minimal=0'}`);
  try {
   await page.locator('#btn-start').waitFor({state:'visible'});
   const visible=await page.locator('#title-sub').isVisible();
   assert.equal(visible,true,'머리말(윤리시티 · …)은 초기화 전부터 늘 보인다 — 2026-11-12 css/title-type.css #title-sub{display:block}(옛 기대 = 간단 화면에서는 숨김)');
   assert.equal(await page.locator('#hook-1').count(),0,'No bus/request count line on the title (2026-11-12)');assert.ok((await page.locator('#hook-2').textContent()).trim(),'Intro is present on first paint');
   assert.equal(await page.getByRole('button',{name:'설명 보기',exact:true}).count(),1);
   /* 2026-11-14: 웹 글꼴(css/pretendard.css, font-display: swap)이 다 온 뒤에 잰다 — 이 검사가 보는 것은 '게임 초기화가 버튼을 밀지 않는다'이다.
      글꼴이 바뀌는 순간의 밀림(대체 글꼴 → Pretendard, 이 PC에서 약 10px)은 따로 fontShift로 적어 둔다(실패로 치지 않음) */
   const early=await page.locator('#btn-start').boundingBox();
   await page.evaluate(()=>document.fonts.ready);
   const before=await page.locator('#btn-start').boundingBox();
   const fontShift=Math.round((before.y-early.y)*10)/10;
   const intro=await page.locator('#hook-2').textContent();
   release();await navigation;
   const after=await page.locator('#btn-start').boundingBox();
   assert.equal(await page.locator('#hook-2').textContent(),intro,'Initial intro agrees with game data');
   /* 2026-11-12 사용자 지시: 기본·랜덤 원 크기와 글 시작 위치가 같게(긴 설명에서 원이 눌려 작아지던 것) */
   const radios=await page.$$eval('.setting .radio',ls=>ls.map(l=>{const i=l.querySelector('input').getBoundingClientRect(),b=l.querySelector('b').getBoundingClientRect();return{w:Math.round(i.width),h:Math.round(i.height),x:Math.round(i.left),tx:Math.round(b.left)};}));
   assert.equal(radios.length,2);assert.deepEqual(radios[1],radios[0],'Same radio circle size and text start for both modes '+JSON.stringify(radios));
   assert.ok(Math.abs(after.y-before.y)<1,'Start button does not jump after initialization '+JSON.stringify({before:before.y,after:after.y}));
   assert.equal(await page.locator('#title-sub').isVisible(),true,'머리말은 늘 보인다(2026-11-12)');
   assert.equal(await page.getByRole('button',{name:'설명 보기',exact:true}).count(),1);
   if(minimal){
    await page.getByRole('button',{name:'설명 보기',exact:true}).click();
    assert.equal(await page.locator('#title-sub').isVisible(),true);
    await page.getByRole('button',{name:'설명 보기',exact:true}).click();
    assert.equal(await page.locator('#title-sub').isVisible(),true,'설명을 접어도 머리말은 남는다');
   }
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px minimal=${minimal}: first paint, stable start button, explanation toggle (font swap shift ${fontShift}px)`);
  } finally {release();await navigation.catch(()=>{});await page.close();}
 }
} finally {await browser.close();server.close();}
