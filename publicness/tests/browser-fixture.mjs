// Existing editing/capacity regression scenarios begin from an explicit planned town.
// The actual empty application start is exercised by empty-start-browser.mjs.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),fixture=require('./planned-fixture.cjs');
export async function plannedTown(page){await page.evaluate(cfg=>{PB.App.s=PB.Session.create(cfg);PB.App._sceneKey=null;PB.Session.beginPlan(PB.App.s);PB.App.go('plan');},fixture);if(await page.locator('#plan-text-toggle').count())await page.locator('#plan-text-toggle').click();}

// 시작 직후 남은 컷신(단계 사이 컷 포함)을 넘기고 지도 계획 화면이 될 때까지 기다린다. 2026-11-01부터 단계 전 안내 화면·‘계획 시작’ 버튼이 없다.
// 1단계 첫 노선 코치(지도 위 말풍선)가 떠 있으면 닫는다(예전 첫 노선 안내 모달을 닫던 자리). 예전 화면(#btn-begin-plan)이 있으면 그대로 누른다
export async function beginPlan(page,how='click'){
 for(let i=0;i<120;i++){
  if(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start')[how]();continue;}
  if(await page.locator('#btn-begin-plan').count()&&await page.locator('#btn-begin-plan').isVisible()){await page.locator('#btn-begin-plan')[how]();continue;}
  if(await page.locator('body').getAttribute('data-screen')==='plan')break;
  await page.waitForTimeout(100);
 }
 if(await page.locator('#tutorial-dialog:modal').count())await page.locator('#btn-tutorial-close')[how]();
 if(await page.locator('#first-coach-close').count())await page.locator('#first-coach-close')[how]();
 if(await page.locator('#plan-text-toggle').count())await page.locator('#plan-text-toggle').click();
}
