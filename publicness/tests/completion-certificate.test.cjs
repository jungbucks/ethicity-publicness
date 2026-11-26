const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require(process.env.CERT_MODULE||'../js/completion-certificate.js');
function setup(){const map=new Map();let tail=Promise.resolve();const locks={request:(key,fn)=>{const next=tail.then(fn);tail=next.catch(()=>{});return next;}};let fail=false;
 const storage={getItem:k=>map.get(k)??null,setItem(k,v){if(fail)throw Error('quota');map.set(k,v);}};
 const options={game:'privacy',prefix:'PRV',title:'공유한 순간',storage,locks,crypto:require('node:crypto').webcrypto};
 return {map,options,make:()=>create(options),c:create(options),fail:()=>{fail=true;}};
}
test('cannot issue before completing',async()=>{const {c}=setup();await assert.rejects(async()=>c.issue('홍길동'),/완료/);});
test('completion and issuance are stable across reloads; first name wins',async()=>{const {c,make}=setup();const done=await c.complete(),a=await c.issue(' 홍길동 ');assert.equal(a.name,'홍길동');assert.equal(a.id,done.id);assert.deepEqual(await c.issue('다른 이름'),a);assert.deepEqual(await make().complete(),a);assert.deepEqual(await make().issue('다른 이름'),a);assert.match(a.id,/^PRV-[2-9A-HJ-NP-Z]{6}$/);});
test('new run needs completion and produces a different certificate',async()=>{const {c}=setup();await c.complete();const old=await c.issue('첫째');await c.begin();await assert.rejects(async()=>c.issue('둘째'),/완료/);await c.complete();assert.notEqual((await c.issue('둘째')).id,old.id);});
test('stale tabs cannot overwrite a new run',async()=>{const {c,make}=setup();await c.complete();const stale=make();await stale.get();await c.begin();assert.equal(stale.current(),false);await assert.rejects(async()=>stale.issue('옛 탭'),/다른 탭/);await assert.rejects(async()=>stale.complete(),/다른 탭/);});
test('tabs opened before first completion are pinned before reset',async()=>{const {c,make}=setup();const other=make();await Promise.all([c.get(),other.get()]);await c.begin();await assert.rejects(async()=>other.complete(),/다른 탭/);});
test('concurrent completion and name claims converge on first name',async()=>{const {c,make}=setup();const other=make();await Promise.all([c.complete(),other.complete()]);const [a,b]=await Promise.all([c.issue('첫 이름'),other.issue('둘째 이름')]);assert.equal(a.name,b.name);assert.equal(a.id,b.id);assert.equal((await other.complete()).name,a.name);});
test('all lifecycle mutations use shared serialization',async()=>{const s=setup();let calls=0;const request=s.options.locks.request;s.options.locks.request=(key,fn)=>{calls++;return request(key,fn);};const c=s.make();await c.get();await c.begin();await c.complete();await c.issue('이름');assert.ok(calls>=4);});
test('reject invisible, empty, controls and overlong names; keep plain Unicode text',async()=>{const {c}=setup();await c.complete();for(const n of ['', '  ','\u200b','\u3164','\u2800','\ufe0f','a\nb','a'.repeat(31)])await assert.rejects(async()=>c.issue(n),/이름/);assert.equal((await c.issue('<홍길동 & 친구>')).name,'<홍길동 & 친구>');});
test('storage corruption fails closed',async()=>{const {c,map}=setup();await c.complete();map.set('completion-certificate.privacy.v1','{broken');await assert.rejects(async()=>c.issue('이름'),/저장/);});
test('failed write never claims success',async()=>{const {c,fail}=setup();await c.complete();fail();await assert.rejects(async()=>c.issue('이름'),/저장/);assert.equal((await c.get()).name,null);});
test('unsupported locks fail closed without breaking startup',async()=>{const {options}=setup();options.locks={};const c=create(options);await assert.rejects(async()=>c.complete(),/HTTPS/);assert.equal(await c.begin(),null);});
test('failed game reset can explicitly block certificate',async()=>{const {c}=setup();await c.complete();await c.issue('이전 학생');c.block();await assert.rejects(async()=>c.get(),/저장/);});
