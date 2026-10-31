// before/after 캡처를 나란히 한 장으로(docs/visual-hierarchy/compare-<장면>-<필터>.png)
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs/visual-hierarchy'),a=process.argv[2]||'before',b=process.argv[3]||'after',prefix=process.argv[4]||'compare';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage();
 for(const scene of ['plan','run','plan-375'])for(const f of ['color','gray','blur']){
  const A=path.join(dir,`${a}-${scene}-${f}.png`),B=path.join(dir,`${b}-${scene}-${f}.png`);if(!fs.existsSync(A)||!fs.existsSync(B))continue;
  const data=await page.evaluate(async([x,y,ta,tb])=>{const load=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+s;});const [i1,i2]=await Promise.all([load(x),load(y)]);
   const pad=12,top=34,c=document.createElement('canvas');c.width=i1.width+i2.width+pad*3;c.height=Math.max(i1.height,i2.height)+top+pad;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);
   g.font='bold 20px sans-serif';g.fillStyle='#1A1D24';g.fillText(ta,pad,24);g.fillText(tb,i1.width+pad*2,24);g.drawImage(i1,pad,top);g.drawImage(i2,i1.width+pad*2,top);return c.toDataURL('image/png').split(',')[1];},
   [fs.readFileSync(A).toString('base64'),fs.readFileSync(B).toString('base64'),a.toUpperCase()+' · '+scene+' · '+f,b.toUpperCase()+' · '+scene+' · '+f]);
  fs.writeFileSync(path.join(dir,`${prefix}-${scene}-${f}.png`),Buffer.from(data,'base64'));
 }console.log('compared →',dir);
}finally{await browser.close();}
