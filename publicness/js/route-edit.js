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
  var api={copy:copy,end:end,visit:visit};root.PB=root.PB||{};root.PB.RouteEdit=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
