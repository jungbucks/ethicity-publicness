import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const N=createRequire(import.meta.url)('../js/narrative.js');
test('resident result distinguishes failed first trip, late return and confirmed transport failures',()=>{
 const rd={id:'narae',o:'F',d:'D'},r={dayStatus:'returnIncomplete',arriveT:112,returnT:122};
 assert.match(N.residentResult(rd,r,[],120).reason,/체류/);
 const out={residentId:'narae',leg:'outbound',fail:'NO_LINK'};
 const first=N.residentResult(rd,{dayStatus:'outboundIncomplete'},[out],120);assert.equal(first.legs[1].state,'아직 시작하지 못함');assert.match(first.reason,/연결/);
 const back={residentId:'narae',leg:'return',status:'waiting',deniedBoardings:2};
 assert.match(N.residentResult(rd,{...r,returnT:90},[back],120).reason,/만차/);
 assert.equal(N.residentResult({...rd,itineraries:{}},r,[],120).label,'다음 목적지에 도착하지 못했어요');
 assert.equal(N.residentResult(rd,{dayStatus:'complete'},[],120).label,'왕복 완료');
});
