/* Pure route edits shared by pointer gestures and map clicks. */
(function(root){
  'use strict';
  function copy(r){return Object.assign({},r,{nodes:r.nodes.slice(),stops:r.stops.slice()});}
  function end(r,id,point,chosen){
    if(chosen==='head'||chosen==='tail')return chosen;
    if(r.nodes.length<2)return 'tail';
    var p=point(id),a=point(r.nodes[0]),b=point(r.nodes[r.nodes.length-1]);
    return Math.hypot(p.x-a.x,p.y-a.y)<Math.hypot(p.x-b.x,p.y-b.y)?'head':'tail';
  }
  function visit(route,mode,id){
    var r=copy(route),n=r.nodes.length,head=mode.end==='head';
    if(mode.index!=null){if(r.nodes.indexOf(id)<0){r.nodes.splice(mode.index+1,0,id);r.stops.splice(mode.index+1,0,true);}return r;}
    if(!n){r.nodes.push(id);r.stops.push(true);return r;}
    var i=head?0:n-1,j=head?1:n-2;
    if(id===r.nodes[i])return r;
    if(n>1&&id===r.nodes[j]){r.nodes.splice(i,1);r.stops.splice(i,1);r.stops[head?0:r.stops.length-1]=true;return r;}
    if(r.nodes.indexOf(id)>=0&&!(n>=3&&id===r.nodes[head?n-1:0]&&r.nodes[0]!==r.nodes[n-1]))return r;
    if(head){r.nodes.unshift(id);r.stops.unshift(true);}else{r.nodes.push(id);r.stops.push(true);}
    return r;
  }
  /* 지도 끌기 한 번의 뜻(2026-11-09 교사 플레이테스트 — ‘대학교–산업·일자리에 구도심 시장을 사이에 못 넣음’).
   *  · 정류장을 노선 선(target.index 구간) 위에 놓기 → 그 두 정류장 사이에 끼움(순환도 닫는 정류장은 그대로). 이미 노선에 있으면 {fail:'already'}
   *  · 열린 노선의 머리·꼬리 정류장에서 끌기 → 그쪽 끝으로 이음, 반대쪽 끝에 놓으면(3곳+) 순환
   *  · 그 밖(가운데 정류장·노선 밖 정류장·순환·두 곳 노선의 끝↔끝)은 null — 부르는 쪽이 예전 규칙(교체·순서·새 노선)대로 */
  function link(route,from,target){
    if(!route||!target)return null;var n=route.nodes.length;
    if(target.index!=null){if(route.nodes.indexOf(from)>=0)return {fail:'already'};if(target.index<0||target.index>=n-1)return null;return {route:visit(route,{index:target.index},from),kind:'insert'};}
    var i=route.nodes.indexOf(from),to=target.node;if(i<0||!to||n<2||route.nodes[0]===route.nodes[n-1])return null;
    var end=i===0?'head':i===n-1?'tail':null;if(!end)return null;
    var other=route.nodes[end==='head'?n-1:0];
    if(route.nodes.indexOf(to)<0)return {route:visit(route,{end:end},to),kind:end};
    if(to===other&&n>=3)return {route:visit(route,{end:end},to),kind:'loop'};
    return null;
  }
  var api={copy:copy,end:end,visit:visit,link:link};root.PB=root.PB||{};root.PB.RouteEdit=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
