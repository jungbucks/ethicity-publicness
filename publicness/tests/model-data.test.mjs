import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),BM=require('../js/model-data.js');require('../assets/models/bus.js');require('../assets/models/zones.js');
const d=globalThis.PB.busModelData;
test('bus model decodes to a 3.2-long bus facing +x on the ground',()=>{
 const m=BM.decode(d),n=m.position.length/3,mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
 for(let i=0;i<m.position.length;i++){mn[i%3]=Math.min(mn[i%3],m.position[i]);mx[i%3]=Math.max(mx[i%3],m.position[i]);}
 assert.ok(Math.abs(mx[0]-mn[0]-3.2)<0.01,'length 3.2');assert.ok(Math.abs(mn[1])<0.01,'floor at y=0');
 assert.ok(Math.abs(mx[0]+mn[0])<0.01&&Math.abs(mx[2]+mn[2])<0.01,'centered');assert.ok(mx[2]-mn[2]<mx[0]-mn[0],'longer than wide');
 assert.equal(m.uv.length/2,n);assert.ok(m.index.length%3===0&&Math.max(...m.index)<n);
 assert.match(d.texture,/^data:image\/webp;base64,/);
});
test('recolor paints the blue stripe in the route color and removes cyan blotches',()=>{
 const px=new Uint8ClampedArray([30,90,210,255, 245,245,245,255, 40,200,210,255, 25,25,30,255]);
 const out=BM.recolor(px,'#00A84D');
 assert.ok(out[1]>out[0]&&out[1]>out[2]&&out[1]>120,'blue → green');
 assert.deepEqual([...out.slice(4,8)],[245,245,245,255],'white kept');
 assert.ok(out[8]===out[9]&&out[9]===out[10],'cyan → gray');
 assert.deepEqual([...out.slice(12,16)],[25,25,30,255],'dark kept');
});
test('every listed zone model decodes to a unit-size diorama on the ground',()=>{
 const ids=globalThis.PB.zoneModelIds;assert.ok(ids.length>=11,'zones listed: '+ids);
 for(const id of ids){require('../assets/models/zone-'+id+'.js');const d=globalThis.PB.zoneModelData[id],m=BM.decode(d),n=m.position.length/3;
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<m.position.length;i++){mn[i%3]=Math.min(mn[i%3],m.position[i]);mx[i%3]=Math.max(mx[i%3],m.position[i]);}
  assert.ok(Math.abs(Math.max(mx[0]-mn[0],mx[2]-mn[2])-1)<0.01,id+' unit footprint');assert.ok(Math.abs(mn[1])<0.01,id+' floor');
  assert.ok(n<10000&&m.index.length/3<=8000,id+' small mesh');assert.ok(Math.max(...m.index)<n,id+' index range');
  assert.match(d.texture,/^data:image\/webp;base64,/);}
});
