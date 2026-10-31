// Existing editing/capacity regression scenarios begin from an explicit planned town.
// The actual empty application start is exercised by empty-start-browser.mjs.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),fixture=require('./planned-fixture.cjs');
export async function plannedTown(page){await page.evaluate(cfg=>{PB.App.s=PB.Session.create(cfg);PB.App._sceneKey=null;PB.Session.beginPlan(PB.App.s);PB.App.go('plan');},fixture);if(await page.locator('#plan-text-toggle').count())await page.locator('#plan-text-toggle').click();}

// 시작 직후 남은 Stage 카드·컷신·교육 모달을 닫고 '계획 시작'을 누른 뒤, 1단계 첫 노선 안내가 뜨면 닫는다.
export async function beginPlan(page,how='click'){
 for(let i=0;i<80;i++){
  if(await page.locator('#reflection-next').isVisible()){await page.locator('#reflection-next').click();continue;}
  if(await page.locator('#goal-intro').evaluate(d=>d.open)){if(await page.locator('#goal-intro').getAttribute('data-stage')==='true')await page.keyboard.press('Enter');else await page.locator('#btn-goal-start')[how]();continue;}
  if(await page.locator('#learning-dialog:modal').count()){await page.locator('#btn-learning-continue')[how]();continue;}
  if(await page.locator('#btn-begin-plan').count()&&await page.locator('#btn-begin-plan').isVisible())break;
  await page.waitForTimeout(100);
 }
 await page.locator('#btn-begin-plan')[how]();
 if(await page.locator('#tutorial-dialog:modal').count())await page.locator('#btn-tutorial-close')[how]();
 if(await page.locator('#plan-text-toggle').count())await page.locator('#plan-text-toggle').click();
}
