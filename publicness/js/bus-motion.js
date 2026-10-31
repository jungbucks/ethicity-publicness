/* Render-only driving paths. Timetables, boarding and costs remain authoritative.
 * Map units; clockwise/right-hand lanes in the x/y map plane. Poses are sampled
 * from absolute playback time, so pausing, scrubbing and changing speed never lag.
 */
(function (root) {
  'use strict';
  var ROAD = { lane: 0.11, halfWidth: 0.19, turn: 0.28, junction: 0.32 };
  function clamp(v) { return Math.max(0, Math.min(1, v)); }
  function dir(a, b) { var d = Math.hypot(b.x - a.x, b.y - a.y); return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; }
  function offset(p, d, along, side) { return { x: p.x + d.x * along - d.y * side, y: p.y + d.y * along + d.x * side }; }
  function curve(p, u) {
    var v = 1 - u;
    return { x: v*v*v*p[0].x + 3*v*v*u*p[1].x + 3*v*u*u*p[2].x + u*u*u*p[3].x,
      y: v*v*v*p[0].y + 3*v*v*u*p[1].y + 3*v*u*u*p[2].y + u*u*u*p[3].y };
  }
  function tangent(p, u) {
    var v = 1 - u;
    return { x: 3*v*v*(p[1].x-p[0].x)+6*v*u*(p[2].x-p[1].x)+3*u*u*(p[3].x-p[2].x),
      y: 3*v*v*(p[1].y-p[0].y)+6*v*u*(p[2].y-p[1].y)+3*u*u*(p[3].y-p[2].y) };
  }
  function integral(u) { return u*u*u - u*u*u*u/2; }
  function progress(u, start, end) {
    var a = start ? .18 : 0, b = end ? .18 : 0, total = 1 - (a+b)/2;
    if (a && u < a) return a*integral(u/a)/total;
    if (b && u > 1-b) return 1-b*integral((1-u)/b)/total;
    return (u-a/2)/total;
  }
  function compile(timeline, nodes) {
    var byId = {}, clearance = {}, compiled = [];
    nodes.forEach(function (n) { byId[n.id] = n; clearance[n.id] = ROAD.turn; });
    var segs = (timeline.segments || []).filter(function (s) {
      var a=byId[s.from], b=byId[s.to];
      return a && b && s.t1>s.t0 && Math.hypot(a.x-b.x,a.y-b.y)>1e-6;
    });
    segs.forEach(function (s) {
      var a=byId[s.from], b=byId[s.to], r=Math.hypot(a.x-b.x,a.y-b.y)*.22;
      clearance[s.from]=Math.min(clearance[s.from],r); clearance[s.to]=Math.min(clearance[s.to],r);
    });
    segs.forEach(function (s, i) {
      var a=byId[s.from], b=byId[s.to], d=dir(a,b), prev=compiled[i-1], next=segs[i+1];
      var connected=prev && prev.to===s.from, incoming=connected?prev.direction:d;
      var r=clearance[s.from], side=Math.min(ROAD.lane,r*.6,clearance[s.to]*.6), endSide=side;
      var p0=connected?prev.end:offset(a,d,-r,side), p3=offset(a,d,r,side);
      var reversing=incoming.x*d.x+incoming.y*d.y<-.8;
      // A semicircular turnaround scales with lane separation. Using the
      // approach length here makes a narrow lane into a pinched hairpin.
      var reach=reversing?side*4/3:r*1.1;
      var points=[p0,offset(p0,incoming,reach,0),offset(p3,d,-reach,0),p3];
      var end=offset(b,d,-clearance[s.to],endSide), table=[{u:0,length:0}], length=0, last=p0;
      for(var j=1;j<=48;j++) { var p=curve(points,j/48); length+=Math.hypot(p.x-last.x,p.y-last.y); table.push({u:j/48,length:length}); last=p; }
      var straight=Math.hypot(end.x-p3.x,end.y-p3.y);
      compiled.push({from:s.from,to:s.to,t0:s.t0,t1:s.t1,points:points,table:table,curveLength:length,
        length:length+straight,end:end,direction:d,startStop:!connected||s.t0>prev.t1+1e-6,
        endStop:!next||next.from!==s.to||next.t0>s.t1+1e-6});
    });
    return compiled;
  }
  function pose(s, distance) {
    var p, d;
    if(distance<s.curveLength) {
      var table=s.table, lo=0, hi=table.length-1;
      while(hi-lo>1){var mid=(lo+hi)>>1;if(table[mid].length<distance)lo=mid;else hi=mid;}
      var f=(distance-table[lo].length)/(table[hi].length-table[lo].length||1);
      var u=table[lo].u+(table[hi].u-table[lo].u)*f;
      p=curve(s.points,u);d=tangent(s.points,u);
    } else {
      var f2=clamp((distance-s.curveLength)/(s.length-s.curveLength||1)), from=s.points[3];
      p={x:from.x+(s.end.x-from.x)*f2,y:from.y+(s.end.y-from.y)*f2};d=s.direction;
    }
    return {x:p.x,y:p.y,heading:Math.atan2(d.y,d.x)};
  }
  function sample(compiled, t) {
    if(!compiled.length)return null;
    var previous=null;
    for(var i=0;i<compiled.length;i++){
      var s=compiled[i];
      if(t<s.t0)return previous?pose(previous,previous.length):pose(s,0);
      if(t<s.t1)return pose(s,s.length*progress(clamp((t-s.t0)/(s.t1-s.t0)),s.startStop,s.endStop));
      previous=s;
    }
    return pose(previous,previous.length);
  }
  function roadEdges(routes, segments, nodes) {
    var known={},seen={},out=[];
    nodes.forEach(function(n){known[n.id]=true;});
    function add(a,b){
      if(a===b||!known[a]||!known[b])return;
      var key=JSON.stringify([a,b].sort());if(seen[key])return;
      seen[key]=true;out.push([a,b]);
    }
    routes.forEach(function(r){if(r.preview)return;for(var i=1;i<r.route.nodes.length;i++)add(r.route.nodes[i-1],r.route.nodes[i]);});
    (segments||[]).forEach(function(s){if(s.deadhead)add(s.from,s.to);});
    return out;
  }
  // Keep the shelter footprint clear of every physical street, not just its own
  // incident roads (two routes can cross close to a third stop).
  function shelterPosition(id, nodes, edges, obstacles) {
    var byId={},active={},xs=[],ys=[];
    nodes.forEach(function(n){byId[n.id]=n;xs.push(n.x);ys.push(n.y);});
    edges=edges.filter(function(e){return byId[e[0]]&&byId[e[1]];});
    edges.forEach(function(e){active[e[0]]=active[e[1]]=true;});
    var p=byId[id],best=p,bestScore=-Infinity;
    var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
    [.46,.76,1.06].forEach(function(extra){
      var radius=ROAD.junction+extra;
      for(var k=0;k<32;k++){
        var a=k*Math.PI/16,x=p.x+Math.cos(a)*radius,y=p.y+Math.sin(a)*radius,space=Infinity;
        edges.forEach(function(e){var u=byId[e[0]],v=byId[e[1]],dx=v.x-u.x,dy=v.y-u.y;
          var f=clamp(((x-u.x)*dx+(y-u.y)*dy)/(dx*dx+dy*dy||1));
          space=Math.min(space,Math.hypot(x-u.x-f*dx,y-u.y-f*dy)-ROAD.halfWidth);
        });
        Object.keys(active).forEach(function(key){var n=byId[key];space=Math.min(space,Math.hypot(x-n.x,y-n.y)-ROAD.junction);});
        (obstacles||[]).forEach(function(n){space=Math.min(space,Math.hypot(x-n.x,y-n.y)-.3);});
        var outside=Math.max(0,minX-x,x-maxX)+Math.max(0,minY-y,y-maxY);
        // Clearance dominates; among safe places prefer near, inward positions.
        var score=Math.min(space,.46)*20-outside*.8-extra*.5;
        if(score>bestScore){bestScore=score;best={x:x,y:y};}
      }
    });
    return best;
  }
  var api={compile:compile,sample:sample,roadEdges:roadEdges,shelterPosition:shelterPosition,road:ROAD};
  root.PB=root.PB||{};root.PB.BusMotion=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
