/*
 * 3D 마을 무대 — Three.js r149(vendor/three.min.js). 고정 직교 카메라, 회전·확대 없음.
 * SVG 지도(map2d.js)와 같은 StageView 인터페이스를 따른다. 조작은 오른쪽 패널(키보드)로도 모두 가능하고,
 * 여기서는 정류장 클릭(레이캐스트)만 받는다. WebGL을 만들 수 없으면 { ok:false }를 돌려주고 앱은 SVG로 간다.
 * 건물은 외부 모델 없이 상자·원기둥으로 만든 미니어처다(원작 게임 그래픽을 따라 하지 않음).
 */
(function (root) {
  'use strict';
  var K = 10;               // 지도 1칸 → 3D 10
  var BUS_SCALE = 0.85;     // 좁힌 왕복 도로의 차선 안에 들어오는 크기
  var PX = 110;             // SVG 1칸 = 110px (버스 차선 오프셋 변환용)
  var LANE = 2.4;           // 같은 길을 지나는 노선 사이 간격(3D) — 버스 폭(1.52×BUS_SCALE≈2.3)보다 넓게 해 버스가 겹치지 않게
  var CAMERA_ELEVATION = 55; // 지면 기준 고도각: 건물 옆면과 노선 가독성의 절충
  var C = {
    bg: 0xF5F5F4, ground: 0xA7BE86, soil: 0x9C7B57, soilDark: 0x6F5640, road: 0xA3A9B2, stop: 0xFFFFFF, ring: 0x1A1D24, accent: 0x2563EB, warn: 0x9A3412,
    wall: [0xE8E3DA, 0xDAD4C9, 0xCFD7DB, 0xE4D6C6, 0xD7DDD3], roof: [0x8E9AA6, 0xB0805A, 0x7C8A8C, 0x9B6B5B],
    green: 0x93AD8F, field: 0xC7B995, people: 0x8A5A44
  };

  function supported() {
    try {
      var c = document.createElement('canvas');
      return !!(root.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }

  function create(container, opts) {
    opts = opts || {};
    var T = root.THREE;
    if (!T || !supported()) return { ok: false, kind: '3d' };
    var renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return { ok: false, kind: '3d' }; }
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    // 2026-10-27 사용자 결정: 하늘·원경 배경과 흙 판 옆면은 산만해서 뺐다 — 화면 전체가 초록 풀밭(아주 큰 잔디 판), 그 위에 마을. 판 바깥이 보일 일은 없지만 CSS도 풀밭 색
    renderer.setClearColor(C.bg, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.domElement.classList.add('bg-canvas');
    container.appendChild(renderer.domElement);
    // 버스 층: 지도 네트워크층(노선 선, z 5) 위에 버스가 보이도록 버스만 그리는 투명 캔버스(z 6). 클릭은 받지 않는다
    var busRenderer = null;
    try { busRenderer = new T.WebGLRenderer({ antialias: true, alpha: true }); busRenderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2)); busRenderer.setClearColor(0x000000, 0); busRenderer.domElement.classList.add('bus-canvas'); container.appendChild(busRenderer.domElement); } catch (e) { busRenderer = null; }
    var labels = document.createElement('div');
    labels.className = 'labels-3d';
    labels.setAttribute('aria-hidden', 'true');
    container.appendChild(labels);

    var scene = new T.Scene();
    var camera = new T.OrthographicCamera(-50, 50, 30, -30, 1, 1000);
    scene.add(new T.HemisphereLight(0xffffff, 0xb3aa9e, 0.85));
    var sun = new T.DirectionalLight(0xffffff, 0.55);
    sun.position.set(-40, 80, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    var sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 250;
    scene.add(sun);

    var groups = { world: new T.Group(), routes: new T.Group(), buses: new T.Group(), people: new T.Group() };
    var busScene = new T.Scene();
    busScene.add(new T.HemisphereLight(0xffffff, 0xb3aa9e, 0.85)); var busSun = new T.DirectionalLight(0xffffff, 0.55); busSun.position.set(-40, 80, 50); busScene.add(busSun);
    Object.keys(groups).forEach(function (k) { (k === 'buses' && busRenderer ? busScene : scene).add(groups[k]); });
    var nodes = {}, stops = {}, hits = [], zoneGroups = {}, routeSegs = {}, busMesh = {}, lastBus = {};
    var labelEls = { stop: {}, wait: {}, bus: {} }, drivingSegments = null, drivingRoadKey = '';
    var frameBox = null, fullBox = null, animateNext = false, camAnim = null, reduced = false, dirty = true, bounds = null, board = null, rising = null, prevIds = null, waitingNow = {}, currentRoutes = [];

    // 3D 버스 모델(assets/models/bus.js, 없거나 실패하면 상자 버스). 노선 색마다 띠를 칠한 재질을 하나씩 만든다
    var busGeo = null, busTex = null, busMats = {};
    (function () {
      var d = root.PB && root.PB.busModelData, BM = root.PB && root.PB.ModelData;
      if (!d || !BM) return;
      try {
        var m = BM.decode(d), geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(m.position, 3));
        geo.setAttribute('uv', new T.BufferAttribute(m.uv, 2));
        geo.setIndex(new T.BufferAttribute(m.index, 1));
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
          var x = c.getContext('2d'); x.drawImage(img, 0, 0);
          geo.computeBoundingBox();
          geo.translate(0, -geo.boundingBox.min.y, 0);
          busTex = x.getImageData(0, 0, c.width, c.height); busGeo = geo; dirty = true;
        };
        img.src = d.texture;
      } catch (e) { busGeo = null; }
    })();
    var EXPRESS_BODY = '#4B2E5C'; // 직행 7호차 몸체(짙은 자두색) — 흰 일반 버스와 구분
    function busMat(color, body) {
      var key = color + '|' + (body || '');
      if (busMats[key]) return busMats[key];
      var c = document.createElement('canvas'); c.width = busTex.width; c.height = busTex.height;
      c.getContext('2d').putImageData(new ImageData(root.PB.ModelData.recolor(busTex.data, color, body), c.width, c.height), 0, 0);
      var t = new T.CanvasTexture(c); t.flipY = false; // glTF UV는 위가 0
      return (busMats[key] = new T.MeshLambertMaterial({ map: t, flatShading: true }));
    }

    var matCache = {};
    function mat(color, extra) {
      var key = color + JSON.stringify(extra || {});
      if (!matCache[key]) matCache[key] = new T.MeshLambertMaterial(Object.assign({ color: color }, extra || {}));
      return matCache[key];
    }
    function mesh(geo, color, x, y, z, parent, shadow) {
      var m = new T.Mesh(geo, mat(color));
      m.position.set(x, y, z);
      if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
      parent.add(m);
      return m;
    }
    function box(w, h, d, color, x, z, parent, y) { return mesh(new T.BoxGeometry(w, h, d), color, x, (y || 0) + h / 2, z, parent); }
    function house(x, z, parent, wall, roof) {
      box(3, 2.2, 3, wall, x, z, parent);
      var r = mesh(new T.ConeGeometry(2.5, 1.6, 4), roof, x, 2.2 + 0.8, z, parent);
      r.rotation.y = Math.PI / 4;
      box(.65,1.2,.1,0x6E837F,x-.6,z+1.55,parent);box(.75,.65,.1,0x89A9B2,x+.6,z+1.55,parent,1);
    }
    // Shared miniature vocabulary: slate roofs, blue-grey glazing and muted planting.
    function tree(x,z,g,size){size=size||1;box(.28,1.5*size,.28,0x8D7761,x,z,g);mesh(new T.IcosahedronGeometry(1.15*size,1),0x78967D,x,2*size,z,g);}
    function bench(x,z,g){box(1.8,.18,.65,0xA58C70,x,z,g,.65);box(1.8,.65,.16,0xA58C70,x,z-.3,g,.7);[-.6,.6].forEach(function(dx){box(.15,.65,.45,0x66746D,x+dx,z,g);});}
    function windows(x,z,width,height,g){for(var y=1.5;y<height-.5;y+=1.8){box(width*.75,.65,.08,0x7393A3,x,z,g,y);}}
    function building(x,z,width,depth,height,g,color){box(width,height,depth,color||0xDADFD8,x,z,g);box(width+.25,.28,depth+.25,0x71858A,x,z,g,height);windows(x,z+depth/2+.05,width,height,g);box(.8,1.35,.12,0x526F7B,x,z+depth/2+.08,g);}
    function garden(x,z,g){box(2.2,.25,1.1,0xC6CCBE,x,z,g);[-.65,0,.65].forEach(function(dx){mesh(new T.IcosahedronGeometry(.5,0),0x819B7D,x+dx,.65,z,g);});}
    // 마을 바탕(지브리풍, assets/models/env.js·tools/env-art.mjs): 지도 판 윗면 잔디 + 생활권마다 정류장 발밑 둥근 땅 조각.
    // 그림은 위치와 무관한 반복 타일이라 랜덤 배치에서도 그대로 쓴다. 그림이 없거나 늦게 풀리면 단색 판 → 풀린 뒤 장면을 다시 짓는다
    var NETWORK_OVERLAY = true; // 노선·정류장 표시는 오버레이 층이 맡는다(false면 예전 3D 노선 표시)
    var GRASS_TILE = 28, PATCH_TILE = 9, BOARD_MARGIN = 400, BOARD_DEPTH = 5; // 판 = 화면 틀보다 훨씬 넓은 풀밭(가장자리가 화면에 안 보이게)
    var PATCH_ART = { A: 'A', J: 'A', B: 'B', K: 'B', C: 'C', E: 'E', F: 'F', G: 'G', N: 'G', I: 'I', D: 'I', M: 'I', L: 'L' }; // H(운동장)는 잔디 그대로
    var envImg = {}, groundTex = null;
    (function () {
      var art = root.PB && root.PB.envArt; if (!art) return;
      var list = [['ground', art.ground]].concat(Object.keys(art.tiles || {}).map(function (k) { return [k, art.tiles[k]]; })), left = list.length;
      list.forEach(function (it) {
        var img = new Image();
        img.onload = function () { envImg[it[0]] = img; if (--left === 0 && lastScene) setScene(lastScene); };
        img.onerror = function () { if (--left === 0 && lastScene) setScene(lastScene); };
        img.src = it[1];
      });
    })();
    function boardMats(gw, gd) {
      var side = mat(C.soil), top = mat(C.ground);
      if (envImg.ground) {
        if (!groundTex) { groundTex = new T.Texture(envImg.ground); groundTex.wrapS = groundTex.wrapT = T.RepeatWrapping; groundTex.needsUpdate = true; }
        groundTex.repeat.set(gw / GRASS_TILE, gd / GRASS_TILE);
        top = new T.MeshLambertMaterial({ map: groundTex, color: 0xb4b4b4 });
      }
      return [side, side, top, mat(C.soilDark), side, side]; // BoxGeometry 면 순서 +x −x +y −y +z −z
    }
    // 땅 조각: 타일 무늬를 판 축척(PATCH_TILE 칸)으로 깔고, 가장자리를 물결진 원으로 부드럽게 지운 캔버스 한 장
    function patchTexture(key, r, seed) {
      var img = envImg[key]; if (!img) return null;
      var N = 512, c = document.createElement('canvas'); c.width = c.height = N;
      var x = c.getContext('2d'), k = N / (2 * r) * PATCH_TILE / img.naturalWidth, pat = x.createPattern(img, 'repeat');
      x.save(); x.scale(k, k); x.fillStyle = pat; x.fillRect(0, 0, N / k, N / k); x.restore();
      var m = document.createElement('canvas'); m.width = m.height = N;
      var y = m.getContext('2d'); y.filter = 'blur(' + Math.round(N * 0.025) + 'px)'; y.beginPath();
      for (var i = 0; i <= 72; i++) {
        var a = i / 72 * Math.PI * 2, rr = N / 2 * (0.84 + 0.05 * Math.sin(3 * a + seed) + 0.03 * Math.sin(5 * a + seed * 2.3));
        y[i ? 'lineTo' : 'moveTo'](N / 2 + Math.cos(a) * rr, N / 2 + Math.sin(a) * rr);
      }
      y.fillStyle = '#000'; y.fill();
      x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
      return new T.CanvasTexture(c);
    }
    function buildPatch(id, p, g, n) {
      var key = PATCH_ART[id], box3 = new T.Box3().setFromObject(g);
      if (!key || box3.isEmpty()) return;
      // 구역 건물 자리와 정류장을 함께 덮는 원: 둘의 가운데, 건물 자리 반 대각선과 정류장 거리 중 큰 쪽
      var bx = (box3.min.x + box3.max.x) / 2, bz = (box3.min.z + box3.max.z) / 2, cx = (bx + p.x) / 2, cz = (bz + p.z) / 2;
      var half = Math.hypot(box3.max.x - box3.min.x, box3.max.z - box3.min.z) / 2;
      var r = Math.min(20, Math.max(half * 0.8 + Math.hypot(bx - cx, bz - cz), Math.hypot(p.x - cx, p.z - cz) + 6));
      var tex = patchTexture(key, r, n * 1.7 + 0.4); if (!tex) return;
      var disc = new T.Mesh(new T.CircleGeometry(r, 48), new T.MeshLambertMaterial({ map: tex, color: 0xc4c4c4, transparent: true, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(cx, 0.004 + n * 0.0004, cz); disc.receiveShadow = true; disc.renderOrder = -1; disc.name = 'patch-' + id;
      groups.world.add(disc);
    }
    // 강 같은 띠 장식을 지도 판 안쪽으로 자른다(판 밖 하늘에 걸리지 않게)
    function clipSeg(a, b, box) {
      var t0 = 0, t1 = 1, d = { x: b.x - a.x, z: b.z - a.z };
      [['x', box.minX, box.maxX], ['z', box.minZ, box.maxZ]].forEach(function (q) {
        var k = q[0], lo = q[1], hi = q[2];
        if (!d[k]) { if (a[k] < lo || a[k] > hi) t1 = -1; return; }
        var u = (lo - a[k]) / d[k], v = (hi - a[k]) / d[k]; if (u > v) { var tmp = u; u = v; v = tmp; }
        t0 = Math.max(t0, u); t1 = Math.min(t1, v);
      });
      return t0 < t1 ? [{ x: a.x + d.x * t0, z: a.z + d.z * t0 }, { x: a.x + d.x * t1, z: a.z + d.z * t1 }] : null;
    }
    function w(i) { return C.wall[i % C.wall.length]; }
    function rf(i) { return C.roof[i % C.roof.length]; }

    // 생활권별 블록 묶음. (ox, oz)는 정류장에서 도로를 피한 쪽으로 옮긴 위치
    var ZONES = {
      N: function(g){
        box(26,.18,19,0xCAD3D5,0,-2,g);
        [[-9,-6,5,5,13],[-3,-7,5,5,19],[4,-7,5,5,16],[10,-5,4,5,12],[-8,1,4,4,8],[-2,0,4,4,11],[5,0,5,4,9]].forEach(function(p,i){building(p[0],p[1],p[2],p[3],p[4],g,[0xC8D5DC,0xDDE3E3,0xB6C9D5][i%3]);});
        box(14,.15,3,0x82979C,0,5,g);garden(-8,5,g);garden(8,5,g);
      },
      A: function (g) {
        box(9, 2.6, 4.5, 0xD9DEE3, 0, 0, g); box(10.5, 0.4, 5.6, 0x8E9AA6, 0, 0, g, 2.6); box(2.4, 5.5, 2.4, 0xCFD7DB, 3.6, -0.6, g);
        windows(0,2.3,8,2.6,g);box(3,.25,1.5,0x819B8A,0,3,g,2);
        var tracks = new T.Group(); tracks.name = 'station-rails'; g.add(tracks);
        [-5, -8].forEach(function(z) {
          box(23, .15, 2.4, 0xB8B5AF, 0, z, tracks);
          for(var x=-11;x<=11;x+=1.1)box(.35,.2,2,0x786B5C,x,z,tracks,.15);
          [-.65,.65].forEach(function(d){box(23,.24,.17,0x58636B,0,z+d,tracks,.35);});
        });
        box(16,.5,1.3,0xD6D8D8,0,-3.1,tracks);
      },
      B: function (g) {
        [[-3,-2,6],[1,-2,7.5],[-3,2,4.5],[1,2,5.5]].forEach(function(p,i){building(p[0],p[1],3,2.8,p[2],g,w(i));});garden(4,1,g);tree(4,-2,g,.8);
      },
      C: function (g) {
        box(11,.15,8,0xC9D3BE,0,0,g);building(0,-2,8,3,4,g,0xDBD5C5);building(4,.4,2.8,4,3,g,0xDBD5C5);
        box(3,.2,4,0xDFDCD0,-1,2,g);[-1,0,1].forEach(function(x){box(.22,2,.22,0xF0EBDD,x,-.35,g);});box(3.4,.35,1.3,0x71858A,0,-.2,g,2);tree(-4,2,g);bench(2,3,g);
      },
      D: function (g) {
        building(-2,0,4.6,4,6,g,0xE3E6DF);building(2.5,.4,4,3.2,3.6,g,0xD8E1DF);box(2.8,.25,1.5,0x749DA5,0,2.6,g,2.1);
        box(.35,1.5,.12,0x68908D,-2,2.08,g,4.1);box(1.25,.35,.13,0x68908D,-2,2.1,g,4.65);garden(3,3,g);
      },
      E: function (g) {
        box(12,.1,8,0xD9D1C3,0,1,g);[-3.8,0,3.8].forEach(function(x,i){building(x,-1.5,3.2,3,2.5,g,w(i));
          var canopy=box(3.5,.2,1.8,[0x829B86,0xBD9B79,0x7F99AB][i],x,.6,g,1.8);canopy.rotation.x=.12;
          [-1,0,1].forEach(function(dx){box(.22,.06,1.8,0xECE8D8,x+dx,.6,g,1.94);});
          box(2.5,.7,.8,0x9D8870,x,1.1,g);box(2.2,.15,.7,[0xB2BA81,0xCEAE7E,0x92AB8C][i],x,1.1,g,.7);
        });bench(0,4,g);tree(-5,3.5,g,.8);tree(5,3.5,g,.8);
      },
      F: function (g) {
        box(12,.1,8,0xBBC6A5,0,0,g);house(-3,-1.8,g,w(0),rf(0));house(2,-2.4,g,w(3),rf(2));
        box(1.3,.1,5,0xD8CEB9,-.5,1.2,g);box(3,.15,2,0xB09C76,3,2,g);[-.6,0,.6].forEach(function(d){box(2.6,.12,.18,0x7F9970,3,2+d,g,.15);});
        [-5,5].forEach(function(x){tree(x,-2,g,.9);});bench(-3,2,g);garden(-3,3.4,g);
      },
      G: function (g) {
        [-3,2].forEach(function(x){building(x,0,4,6,3.4,g,0xBCC8C8);box(3,.2,5,0x647C88,x,0,g,3.8);box(2,1.7,.15,0x829599,x,3.1,g);});
        box(2.5,1.1,1.7,0xB5A48A,5,2,g);mesh(new T.CylinderGeometry(.5,.6,5,10),0x7D8F94,5,2.5,-2,g);
      },
      H: function (g) {
        var turf=mesh(new T.CylinderGeometry(8.4,8.4,.16,48),0x79A879,0,.08,0,g,false);turf.scale.z=.82;
        // Open-front tiered stands surround a visible baseball field.
        for(var i=0;i<22;i++){var a=i/22*Math.PI*2;if(Math.sin(a)>.62)continue;
          for(var row=0;row<3;row++){var radius=7.2+row*.85,h=.65+row*.7;
            var stand=box(2.6,h,.9,0xC9D0D4,Math.cos(a)*radius,Math.sin(a)*radius*.82,g);stand.rotation.y=-a-Math.PI/2;
            var seat=box(2.4,.18,.55,row%2?0x809BB0:0xA3B6C4,Math.cos(a)*radius,Math.sin(a)*radius*.82,g,h);seat.rotation.y=stand.rotation.y;
          }
        }
        var infield=box(4.5,.1,4.5,0xC9A47B,0,1.1,g,.18);infield.rotation.y=Math.PI/4;
        var inner=box(3.2,.12,3.2,0x87AE7F,0,1.1,g,.25);inner.rotation.y=Math.PI/4;
        [[0,4.2],[-3.15,1.1],[0,-2.05],[3.15,1.1]].forEach(function(p){var base=box(.48,.12,.48,0xFFF9EA,p[0],p[1],g,.4);base.rotation.y=Math.PI/4;});
        [-1,1].forEach(function(sign){var line=box(.09,.04,8.5,0xF5F3DB,sign*3,1.2,g,.45);line.rotation.y=sign*Math.PI/4;});
        [[-9,-5],[9,-5],[-9,4],[9,4]].forEach(function(p){box(.35,7,.35,0x8A969D,p[0],p[1],g);box(2.7,1.1,.5,0x65727C,p[0],p[1],g,6.5);[-.8,0,.8].forEach(function(x){box(.55,.6,.12,0xFFF5C5,p[0]+x,p[1]+.3,g,6.8);});});
        box(4.8,2.4,.45,0x3F5964,0,-7.6,g,3);box(.3,3,.3,0x8A969D,-1.7,-7.6,g);box(.3,3,.3,0x8A969D,1.7,-7.6,g);
        garden(-6,5,g);garden(6,5,g);g.scale.setScalar(.75);
      },
      I: function (g) {
        box(12,.12,9,0xCFD7CA,0,0,g);[[-3,-2,8.5],[1,-2.5,10],[4,1,7]].forEach(function(p,i){building(p[0],p[1],2.8,3,p[2],g,i===1?0xD6DFE0:0xE4E5DD);
          box(.5,p[2],.12,0x93A8AD,p[0]-.9,p[1]+1.57,g);});
        building(-2,2.6,5,2,2,g,0xBFCABF);box(5.4,.22,1,0x819B8A,-2,3.9,g,1.7);tree(-5,2,g,.8);tree(4,-3,g,.9);bench(1,3,g);garden(2,3.7,g);
      },
      L: function(g){
        var lawn=mesh(new T.CylinderGeometry(7.4,7.4,.12,32),0xB5CBA4,0,.06,0,g,false);lawn.scale.z=.7;
        [[-2,0,3.3],[1,.6,3],[3,-.5,2]].forEach(function(p){var water=mesh(new T.CylinderGeometry(p[2],p[2],.08,32),0x91BBC8,p[0],.16,p[1],g,false);water.scale.z=.72;});
        [[-5,-2],[4,-3],[-4,3],[5,2]].forEach(function(p){box(.3,1.3,.3,0x9A8265,p[0],p[1],g);mesh(new T.ConeGeometry(1.2,2.5,7),0x7F9E78,p[0],2.2,p[1],g);});
        [-2,2].forEach(function(x){box(1.8,.18,1.1,0xB69871,x,3.5,g,.8);box(2.1,.15,.4,0xA88B65,x,4.4,g,.5);});
      },
      M: function(g){
        tree(-6,3,g,.85);tree(6,3,g,.85);bench(0,5,g);
        box(13,.15,9,0xD6D7D0,0,1,g);box(11,3,6,0xD4DDE0,0,0,g);box(9,2.2,5,0xE6E0D5,0,-.3,g,3);box(11.6,.35,6.5,0x8C9EAA,0,0,g,5.2);
        [-4,-2,0,2,4].forEach(function(x){box(1.5,1.7,.18,0x94BACB,x,3.1,g,.5);box(1.5,.8,.18,0xB2CDD5,x,2.3,g,3.7);});
        box(5,.35,1.3,0xA7B29D,0,3.5,g,2.3);box(2,.2,1.6,0xBED3D7,-2,-.3,g,5.6);box(2,.2,1.6,0xBED3D7,2,-.3,g,5.6);
      },
      K: function(g){
        tree(-4,-1,g,.8);garden(3,4,g);
        box(8,.16,7,0xBCD1AD,0,1,g);box(7,2.8,3.8,0xE7DFCD,0,-1,g);box(7.6,.35,4.4,0x789B8A,0,-1,g,2.8);
        [-2,0,2].forEach(function(x){box(1.1,1,.14,0xB3CFDC,x,1,g,1);});
        box(2,.15,3,0xCDD1CA,0,3,g);box(2.5,.4,.7,0x9E8665,-2.5,3,g,.6);
        var play=box(.9,.12,2,0xD9B574,2.5,3,g,.6);play.rotation.x=.4;box(.2,1.6,.2,0x8FAD9A,2.5,2.3,g);
      },
      J: function(g){
        windows(0,-.2,9,2.8,g);bench(-5,4,g);tree(6,-2,g,.8);
        box(12,.12,10,0xCCD2D5,0,1,g);box(10,2.8,3.5,0xD6DDE0,0,-2,g);box(11,.35,4.2,0x7F929E,0,-2,g,2.8);
        [-3.5,0,3.5].forEach(function(x,i){box(2.2,1.5,5,[0x789DB6,0x86A48C,0xB9A17B][i],x,3,g);box(1.8,.5,.16,0xE3F0F4,x,.45,g,.8);});
      }
    };
    // 구역 건물 모델(assets/models/zone-<id>.js, fal.ai nano-banana→Tripo, tools/zone-models.mjs). 목록(PB.zoneModelIds)에 있는 구역은
    // 스크립트를 미리 불러 두고, 풀리면 그 구역의 기본 도형을 모델로 바꾼다. 모델은 기본 도형이 차지하던 자리(가로·세로) 안에 맞춘다.
    // ZONE_KEEP: 모델과 함께 남겨 둘 기본 도형(기차역 선로). 모델이 없으면 지금까지의 기본 도형 그대로
    var ZONE_KEEP = { A: ['station-rails'] }, zoneModels = {};
    // 구역별 크기 비율(1 = 기본 도형 자리만큼). 종합운동장은 상징성은 살리되 화면을 덜 차지하게, 대도시도 살짝(90%) 줄인다(2026-10-23 사용자)
    var ZONE_SCALE = { H: 0.65, N: 0.9 }, BUILDING_SCALE = 0.8;
    function zoneModel(id) { return loadedModel(zoneModels, 'zoneModelData', id); }
    // 구역 건물·정류장 시설 공통: 풀린 모델 데이터 → 공유 형상·재질(한 번만 만든다). 아직 안 풀렸으면 null
    function loadedModel(cache, reg, id) {
      if (cache[id] !== undefined) return cache[id];
      var d = root.PB && root.PB[reg] && root.PB[reg][id], MD = root.PB && root.PB.ModelData;
      if (!d || !MD) return null;
      try {
        var m = MD.decode(d), geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(m.position, 3));
        geo.setAttribute('uv', new T.BufferAttribute(m.uv, 2));
        geo.setIndex(new T.BufferAttribute(m.index, 1));
        // 텍스처에 밝기가 이미 들어 있어, 하늘빛+햇빛(합 1.3 이상)에 그대로 받으면 하얗게 날아간다 → 재질 색으로 한 단계 눌러 준다
        var mat = new T.MeshLambertMaterial({ color: 0xcccccc, flatShading: true }), img = new Image();
        img.onload = function () { var t = new T.Texture(img); t.flipY = false; t.needsUpdate = true; mat.map = t; mat.needsUpdate = true; dirty = true; };
        img.src = d.texture;
        return (cache[id] = { geo: geo, mat: mat, w: d.posMax[0] - d.posMin[0], d: d.posMax[2] - d.posMin[2] });
      } catch (e) { return (cache[id] = false); }
    }
    function buildZone(id, g) {
      var tmp = new T.Group(); ZONES[id](tmp);
      var zm = zoneModel(id);
      if (!zm) { while (tmp.children.length) g.add(tmp.children[0]); g.scale.copy(tmp.scale); g.userData.model = false; return; }
      var keep = ZONE_KEEP[id] || [], kept = tmp.children.filter(function (c) { return keep.indexOf(c.name) >= 0; });
      kept.forEach(function (c) { tmp.remove(c); });
      tmp.updateMatrixWorld(true);
      var box = new T.Box3().setFromObject(tmp), bw = box.max.x - box.min.x, bd = box.max.z - box.min.z;
      var s = Math.min(Math.sqrt(bw * bd) * 1.1, Math.max(bw, bd)) / Math.max(zm.w, zm.d); // 기본 도형 자리의 넓이만큼(긴 변은 넘지 않게)
      s *= (ZONE_SCALE[id] || 1) * BUILDING_SCALE; // 건물은 정류장 마커 뒤 배경 그림 — 80%
      var mesh = new T.Mesh(zm.geo, zm.mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'zone-model';
      mesh.scale.setScalar(s); mesh.position.set((box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2);
      g.add(mesh); kept.forEach(function (c) { g.add(c); }); g.scale.set(1, g.scale.y, 1); g.userData.model = true;
    }
    (root.PB && root.PB.zoneModelIds || []).forEach(function (id) {
      var loading = root.PB._zoneLoading = root.PB._zoneLoading || {};
      if ((root.PB.zoneModelData && root.PB.zoneModelData[id]) || loading[id]) return;
      loading[id] = true;
      var sc = document.createElement('script'); sc.src = 'assets/models/zone-' + id + '.js'; sc.async = true;
      sc.onload = function () {
        var g = zoneGroups[id]; if (!g || g.userData.model) return;
        while (g.children.length) g.remove(g.children[0]);
        buildZone(id, g); dirty = true;
      };
      document.head.appendChild(sc);
    });
    // 정류장 시설 모델(stop-low/mid/high): 풀리면 장면을 다시 지어 기본 도형 시설을 바꾼다
    var stopModels = {}, lastScene = null;
    function stopModel(tier) { return loadedModel(stopModels, 'stopModelData', 'stop-' + tier); }
    (root.PB && root.PB.stopModelIds || []).forEach(function (id) {
      var loading = root.PB._zoneLoading = root.PB._zoneLoading || {};
      if ((root.PB.stopModelData && root.PB.stopModelData[id]) || loading[id]) return;
      loading[id] = true;
      var sc = document.createElement('script'); sc.src = 'assets/models/' + id + '.js'; sc.async = true;
      sc.onload = function () { if (lastScene) setScene(lastScene); };
      document.head.appendChild(sc);
    });

    // H(종합운동장)는 기차역 이름표 뒤에 깔리지 않도록 오른쪽 위로 비켜 둔다(2026-10-23 플레이테스트)
    // 큰 구역(H)은 후보 자리 중 다른 정류장과 그 이름표(정류장 앞쪽)에서 가장 먼 곳에 둔다 — 랜덤 배치에서도 이름표를 덮지 않게
    var OFFS_CAND = { H: [[0, -9], [0, 9], [9, 0], [-9, 0]] };
    function zoneOffset(id, p, ids) {
      var cands = OFFS_CAND[id]; if (!cands) return OFFS[id];
      var best = null, bestScore = -1;
      cands.forEach(function (c) {
        var cx = p.x + c[0], cz = p.z + c[1], score = Infinity;
        ids.forEach(function (o) { if (o === id) return; var q = wp(o); score = Math.min(score, Math.hypot(q.x - cx, q.z - cz), Math.hypot(q.x - cx, q.z + 4 - cz)); });
        if (score > bestScore + 0.5) { bestScore = score; best = c; }
      });
      return best;
    }
    var OFFS = { A: [-7, -7], B: [-7, -7], C: [0, 8], D: [0, 8.5], E: [1, 8], F: [-4, 8], G: [7, 7], H: [11, -9], I: [4, -6], J: [0, 9], K: [-7, 0], L:[0,6], M:[0,8], N:[0,-5] };

    function wp(id) { return { x: nodes[id].x * K, z: nodes[id].y * K }; }

    // 정류장 미니어처: 이번 단계 승차 요청 수(출발+도착) 등급에 따라 시설 규모만 달리한다.
    // 색·강조는 모든 등급이 같다(이용객 수이지 중요도가 아님). 붐비는 곳의 대기 인물은 장식이라 계획 화면에서만 보인다.
    var STOP_SIZE = { low: [3.0, 1.8], mid: [3.6, 2.0], high: [4.6, 2.4] }, PLAT = 0.35, STOP_SCALE = 1.6;
    function seat(x, z, g) { box(1.1, 0.1, 0.38, 0xA58C70, x, z, g, PLAT + 0.42); box(1.1, 0.4, 0.08, 0xA58C70, x, z - 0.17, g, PLAT + 0.52); [-0.42, 0.42].forEach(function (dx) { box(0.08, 0.42, 0.32, 0x66746D, x + dx, z, g, PLAT); }); }
    function buildStop(id, tier, p) {
      // 정류장 하나를 원점 기준으로 만들고 묶음째 키워 지도 축척에서도 시설이 읽히게 한다
      var g = new T.Group(), size = STOP_SIZE[tier], W = size[0], D = size[1], back = -D / 2 + 0.2;
      g.name = 'stop-' + id; g.position.set(p.x, 0, p.z); g.scale.setScalar(STOP_SCALE); groups.world.add(g);
      // 승강장: 어두운 연석 위 밝은 판, 앞쪽 노란 안전선
      box(W + 0.24, PLAT - 0.05, D + 0.24, 0x7D8792, 0, 0, g);
      var base = mesh(new T.BoxGeometry(W, PLAT, D), C.stop, 0, PLAT / 2 + 0.01, 0, g);
      base.material = new T.MeshLambertMaterial({ color: C.stop, transparent: true });
      box(W, 0.04, 0.14, 0xE2B93B, 0, D / 2 - 0.1, g, PLAT + 0.01);
      var sm = stopModel(tier), sign = null;
      if (sm) {
        // fal.ai 정류장 시설(표지판·의자·셸터·전광판 포함)을 승강장 위에 맞춰 놓는다
        var ms = Math.min(W * 0.94 / sm.w, D * 0.92 / sm.d), model = new T.Mesh(sm.geo, sm.mat);
        model.scale.setScalar(ms); model.position.set(0, PLAT, -D * 0.04); model.castShadow = true; model.name = 'stop-model'; g.add(model);
      }
      // 표지판 기둥과 둥근 정류장 표지
      var sx = W / 2 - 0.35, sz = D / 2 - 0.4;
      if (!sm) {
      box(0.14, 2.6, 0.14, 0x687782, sx, sz, g, PLAT);
      sign = mesh(new T.CylinderGeometry(0.42, 0.42, 0.1, 20), C.accent, sx, PLAT + 2.75, sz, g); sign.rotation.x = Math.PI / 2;
      if (tier === 'low') seat(-0.5, back + 0.25, g);
      else {
        // 셸터: 기둥·뒷유리·지붕, 칸마다 의자
        var bays = tier === 'high' ? 2 : 1, bw = 1.7, hw = bays * bw, cx = -0.35;
        for (var i = 0; i <= bays; i++) box(0.1, 2.0, 0.1, 0x5B6670, cx - hw / 2 + i * bw, back, g, PLAT);
        var glass = box(hw, 1.3, 0.05, 0x9CC3D5, cx, back, g, PLAT + 0.5); glass.material = mat(0x9CC3D5, { transparent: true, opacity: 0.55 });
        box(hw + 0.4, 0.1, 1.2, 0x46525C, cx, back + 0.45, g, PLAT + 2.0);
        for (var k = 0; k < bays; k++) seat(cx - hw / 2 + bw / 2 + k * bw, back + 0.35, g);
      }
      }
      var crowd = null;
      if (tier === 'high') {
        // 도착 안내 전광판(모델에는 이미 있다)
        if (!sm) {
        box(0.12, 2.2, 0.12, 0x5B6670, -W / 2 + 0.3, D / 2 - 0.4, g, PLAT);
        box(0.9, 0.42, 0.12, 0x1F2933, -W / 2 + 0.3, D / 2 - 0.4, g, PLAT + 2.1);
        box(0.7, 0.08, 0.13, 0xF2A33A, -W / 2 + 0.3, D / 2 - 0.4, g, PLAT + 2.28);
        }
        crowd = new T.Group(); crowd.name = 'crowd-' + id;
        [0x5A6B7B, 0x8C6E5D, 0x6E7F62, 0x7A6A8C].forEach(function (color, n) {
          var px = -W / 2 + 1.0 + n * 0.62, pz = D / 2 - 0.55 - (n % 2) * 0.3;
          mesh(new T.CylinderGeometry(0.17, 0.2, 0.72, 10), color, px, PLAT + 0.36, pz, crowd);
          mesh(new T.SphereGeometry(0.16, 12, 8), 0xE8C9A8, px, PLAT + 0.88, pz, crowd);
        });
        crowd.visible = crowdVisible; g.add(crowd);
      }
      // 강조 테두리는 평소 숨김. 지도 깜빡임(flash) 때만 바닥에 잠깐 비친다
      var halo = new T.Mesh(new T.RingGeometry(Math.max(W, D) * 0.6, Math.max(W, D) * 0.6 + 0.5, 40), new T.MeshBasicMaterial({ color: C.warn, transparent: true, opacity: 0.6, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.set(0, 0.04, 0); halo.visible = false; g.add(halo);
      return { group: g, base: base, ring: halo, sign: sign, crowd: crowd, tier: tier, front: (D / 2 + 0.12) * STOP_SCALE };
    }
    var crowdVisible = true;
    function setCrowd(v) { crowdVisible = !!v; Object.keys(stops).forEach(function (id) { if (stops[id].crowd) stops[id].crowd.visible = crowdVisible; }); dirty = true; }

    function clear(g) { while (g.children.length) { var c = g.children.pop(); if (c.geometry) c.geometry.dispose(); } }

    function setScene(sceneDef) {
      var sameScene = lastScene && lastScene.phase === sceneDef.phase && JSON.stringify(lastScene.nodes) === JSON.stringify(sceneDef.nodes);
      lastScene = sceneDef;
      if (!sameScene) drivingSegments = null;
      var ids = sceneDef.nodes.map(function (n) { return n.id; });
      clear(groups.world); hits = []; stops = {}; zoneGroups = {};
      nodes = {};
      sceneDef.nodes.forEach(function (n) { nodes[n.id] = n; });
      // 판·땅은 이 세팅의 모든 정류장(sceneDef.frame) 기준. 카메라는 2026-10-27부터 이번 단계 정류장(stageBox)에 맞춘다 —
      // 앞 단계는 가깝게, 새 정류장이 생기는 단계마다 조금씩 뒤로(도시가 커지는 느낌), 전환 0.6초. 지도 틀 비율은 전체(fullBox)로 정한다
      var frame = sceneDef.frame || sceneDef.nodes;
      var xs = frame.map(function (n) { return n.x * K; }), zs = frame.map(function (n) { return n.y * K; });
      fullBox = { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minZ: Math.min.apply(null, zs), maxZ: Math.max.apply(null, zs) };
      var sx2 = sceneDef.nodes.map(function (n) { return n.x * K; }), sz2 = sceneDef.nodes.map(function (n) { return n.y * K; });
      frameBox = { minX: Math.min.apply(null, sx2), maxX: Math.max.apply(null, sx2), minZ: Math.min.apply(null, sz2), maxZ: Math.max.apply(null, sz2) };
      animateNext = !!prevIds && !reduced;
      bounds = { minX: Math.min.apply(null, xs) - 20, maxX: Math.max.apply(null, xs) + 16, minZ: Math.min.apply(null, zs) - 18, maxZ: Math.max.apply(null, zs) + 18 };
      // 풀밭 판: 화면 틀보다 BOARD_MARGIN만큼 넓게, 윗면은 잔디 타일. 강은 판 안쪽까지 잘라 그린다
      board = { minX: bounds.minX - BOARD_MARGIN, maxX: bounds.maxX + BOARD_MARGIN, minZ: bounds.minZ - BOARD_MARGIN, maxZ: bounds.maxZ + BOARD_MARGIN };
      var gw = board.maxX - board.minX, gd = board.maxZ - board.minZ;
      var ground = new T.Mesh(new T.BoxGeometry(gw, BOARD_DEPTH, gd), boardMats(gw, gd));
      ground.position.set((board.minX + board.maxX) / 2, -BOARD_DEPTH / 2, (board.minZ + board.maxZ) / 2); ground.receiveShadow = true; ground.name = 'board';
      groups.world.add(ground);
      if(sceneDef.river && sceneDef.river.length){
        // Flat ribbons sit below roads and route markings, with softly coloured banks.
        [[.25,0xA3B784,.012],[.18,0x6B9AAE,.018]].forEach(function(style){
          var vertices=[],points=sceneDef.river,inner={minX:board.minX+style[0]*K,maxX:board.maxX-style[0]*K,minZ:board.minZ,maxZ:board.maxZ};
          for(var i=1;i<points.length;i++){
            var seg=clipSeg({x:points[i-1].x*K,z:points[i-1].y*K},{x:points[i].x*K,z:points[i].y*K},inner);if(!seg)continue;
            var a={x:seg[0].x/K,y:seg[0].z/K},b={x:seg[1].x/K,y:seg[1].z/K},dx=b.x-a.x,dz=b.y-a.y,len=Math.hypot(dx,dz);if(!len)continue;
            var ox=-dz/len*style[0],oz=dx/len*style[0];
            [[a.x+ox,a.y+oz],[a.x-ox,a.y-oz],[b.x+ox,b.y+oz],[a.x-ox,a.y-oz],[b.x-ox,b.y-oz],[b.x+ox,b.y+oz]].forEach(function(p){vertices.push(p[0]*K,style[2],p[1]*K);});
          }
          var geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
          var ribbon=new T.Mesh(geometry,mat(style[1],{side:T.DoubleSide}));ribbon.name='river';groups.world.add(ribbon);
        });
      }
      if(sceneDef.boundary){for(var dz=-3.5*K;dz<3.5*K;dz+=3){var dash=box(.27,.09,1.6,0x24292D,sceneDef.boundary.x*K,dz,groups.world,.04);dash.name='admin-boundary';}}
      sceneDef.roads.forEach(function (r) {
        var a = wp(r.a), b = wp(r.b), len = Math.hypot(b.x - a.x, b.z - a.z);
        var m = mesh(new T.BoxGeometry(len, 0.12, 2.6), C.road, (a.x + b.x) / 2, 0.06, (a.z + b.z) / 2, groups.world, false);
        m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        m.receiveShadow = true;
      });
      ids.forEach(function (id) {
        var p = wp(id), g = new T.Group();
        var off = zoneOffset(id, p, ids);
        g.position.set(p.x + off[0], 0, p.z + off[1]);
        g.name = 'zone-' + id;
        buildZone(id, g);
        groups.world.add(g);
        zoneGroups[id] = g;
        g.updateMatrixWorld(true); buildPatch(id, p, g, ids.indexOf(id));
        var tier = (sceneDef.load && sceneDef.load[id] && sceneDef.load[id].tier) || 'low';
        stops[id] = buildStop(id, tier, p);
        var hit = new T.Mesh(new T.CylinderGeometry(4, 4, 4, 12), new T.MeshBasicMaterial({ visible: false }));
        hit.position.set(p.x, 1.5, p.z); hit.userData.node = id;
        groups.world.add(hit); hits.push(hit);
      });
      // 새로 생긴 생활권은 솟아오르며 등장(움직임 줄이기면 바로)
      if (prevIds) ids.forEach(function (id) {
        if (prevIds.indexOf(id) < 0 && !reduced) { zoneGroups[id].scale.y = 0.02; rising = { id: id, t0: root.performance.now() }; }
      });
      prevIds = ids.slice();
      labels.innerHTML = ''; labelEls = { stop: {}, wait: {}, bus: {} };
      ids.forEach(function (id) {
        var l = document.createElement('div'), ld = sceneDef.load && sceneDef.load[id]; l.className = 'label-3d stop-name'; l.textContent = nodes[id].name; l.dataset.tier = ld ? ld.tier : 'low';
        if (ld) { var c = document.createElement('span'); c.className = 'stop-load'; c.textContent = ld.tier==='high'?'● ● ●':ld.tier==='mid'?'● ●':'●'; c.title = '출발·도착 '+ld.count+'건'; l.appendChild(c); }
        labels.appendChild(l); labelEls.stop[id] = l;
      });
      if (currentRoutes.length) setRoutes(currentRoutes);
      fit(); dirty = true;
    }

    function segKey(a, b) { return a < b ? a + b : b + a; }
    function laneWorld(a, b, num) {
      var list = routeSegs[segKey(a, b)] || [num], k = list.indexOf(num), n = list.length;
      var A = wp(a), B = wp(b), dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz) || 1;
      var sign = a < b ? 1 : -1, off = (k - (n - 1) / 2) * LANE * sign;
      return { x: -dz / len * off, z: dx / len * off };
    }

    // Physical roads are shared by routes; route colours remain thin map guides.
    // Both the driving path and this surface use BusMotion's map-unit dimensions.
    function drivingRoads(routes) {
      var spec = root.PB.BusMotion.road, edges = {}, junctions = {}, half = spec.halfWidth * K;
      root.PB.BusMotion.roadEdges(routes, drivingSegments, Object.keys(nodes).map(function(id){return nodes[id];})).forEach(function(edge){
        var a=edge[0],b=edge[1];edges[segKey(a,b)]=edge;
        (junctions[a]=junctions[a]||new Set()).add(b);
        (junctions[b]=junctions[b]||new Set()).add(a);
      });
      function strip(a,b,width,y,color) {
        var len=Math.hypot(b.x-a.x,b.z-a.z); if(len<.001)return;
        var m=new T.Mesh(new T.PlaneGeometry(len,width),mat(color));
        m.rotation.x=-Math.PI/2; m.rotation.z=-Math.atan2(b.z-a.z,b.x-a.x);
        m.position.set((a.x+b.x)/2,y,(a.z+b.z)/2);m.receiveShadow=true;m.name='driving-road';groups.routes.add(m);
      }
      Object.keys(edges).forEach(function(key){
        var a=wp(edges[key][0]),b=wp(edges[key][1]);
        strip(a,b,half*2+.32,.12,0xC5C5BA);
        strip(a,b,half*2,.15,0x59666A);
        var d={x:b.x-a.x,z:b.z-a.z},len=Math.hypot(d.x,d.z),trim=spec.junction*K;
        if(len>trim*2) [-1,1].forEach(function(sign){
          var ox=-d.z/len*(half-.28)*sign,oz=d.x/len*(half-.28)*sign;
          strip({x:a.x+d.x/len*trim+ox,z:a.z+d.z/len*trim+oz},
            {x:b.x-d.x/len*trim+ox,z:b.z-d.z/len*trim+oz},.07,.17,0xDDDCD0);
        });
      });
      Object.keys(stops).forEach(function(id){
        var stop=stops[id],p=wp(id),neighbours=junctions[id];
        stop.group.position.set(p.x,0,p.z);
        if(!neighbours)return;
        [[spec.junction*K+.16,.12,0xC5C5BA],[spec.junction*K,.15,0x59666A]].forEach(function(style){
          var disk=new T.Mesh(new T.CircleGeometry(style[0],48),mat(style[2]));disk.rotation.x=-Math.PI/2;
          disk.position.set(p.x,style[1],p.z);disk.receiveShadow=true;disk.name='driving-junction';groups.routes.add(disk);
        });
        var best = root.PB.BusMotion.shelterPosition(id, Object.keys(nodes).map(function(key){return nodes[key];}),
          Object.keys(edges).map(function(key){return edges[key];}),
          Object.keys(zoneGroups).map(function(key){var q=zoneGroups[key].position;return {x:q.x/K,y:q.z/K};}));
        stop.group.position.set(best.x*K,0,best.y*K);
      });
    }

    function setDrivingSegments(segments) {
      var key = segments.map(function (s) { return s.from + '>' + s.to; }).sort().join('|');
      if (drivingSegments && drivingRoadKey === key) return;
      drivingSegments = segments;
      drivingRoadKey = key;
      setRoutes(currentRoutes);
    }

    function setRoutes(routes) {
      currentRoutes = routes;
      clear(groups.routes);
      routeSegs = {};
      routes.forEach(function (r) {
        for (var i = 1; i < r.route.nodes.length; i++) {
          var k = segKey(r.route.nodes[i - 1], r.route.nodes[i]);
          (routeSegs[k] = routeSegs[k] || []).push(r.num);
        }
      });
      if (root.PB.BusMotion) drivingRoads(routes);
      routes.forEach(function (r, ri) {
        var color = new T.Color(r.color).getHex(), m = new T.MeshLambertMaterial({ color: color, transparent: !!r.dim, opacity: r.dim ? 0.24 : 1 });
        var dash = (r.dash || '').split(' ').filter(Boolean).map(function (x) { return Number(x) * K / PX; });
        var ns = r.route.nodes;
        for (var i = 1; i < ns.length; i++) {
          if (!nodes[ns[i - 1]] || !nodes[ns[i]]) continue;
          var a = wp(ns[i - 1]), b = wp(ns[i]), o = laneWorld(ns[i - 1], ns[i], r.num);
          var len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, ang = -Math.atan2(uz, ux);
          if (NETWORK_OVERLAY) continue;
          var lanes=(routeSegs[segKey(ns[i-1],ns[i])]||[r.num]).length,road=new T.Mesh(new T.BoxGeometry(len,0.10,2.6+(lanes-1)*LANE),mat(C.road));road.position.set((a.x+b.x)/2,0.08,(a.z+b.z)/2);road.rotation.y=ang;groups.routes.add(road);
          // 노선색 선·정차 점·통과 고리는 2026-10-27부터 지도 네트워크층(map-network.js, SVG)이 그린다 — 3D에는 회색 도로 띠(배경)만
          if (NETWORK_OVERLAY) continue;
          var pieces = [];
          if (!dash.length) pieces.push([1.8, len - 1.8]);
          else { var pos = 1.8, di = 0; while (pos < len - 1.8) { var on = Math.min(dash[di % dash.length], len - 1.8 - pos); pieces.push([pos, pos + on]); pos += on + (dash[(di + 1) % dash.length] || 0); di += 2; } }
          pieces.forEach(function (pc) {
            var L = pc[1] - pc[0]; if (L <= 0.05) return;
            var c = (pc[0] + pc[1]) / 2;
            var seg = new T.Mesh(new T.BoxGeometry(L, 0.18, r.dim ? 0.28 : 0.65), m);
            seg.position.set(a.x + ux * c + o.x, 0.22 + ri * 0.01, a.z + uz * c + o.z);
            seg.rotation.y = ang;
            groups.routes.add(seg);
          });
          // 실제 정차 표시: 노선 선이 정차 정류장에서 끝나는 자리에 노선색 테두리의 흰 점(지나가기만 하는 정류장과 구분)
          [[0, ns[i - 1], 1.8], [1, ns[i], len - 1.8]].forEach(function (e) {
            var idx = e[0] ? i : i - 1; if (!r.route.stops[idx] || r.dim || len < 4) return;
            var dot = new T.Mesh(new T.CylinderGeometry(0.62, 0.62, 0.22, 16), m); dot.position.set(a.x + ux * e[2] + o.x, 0.3, a.z + uz * e[2] + o.z); groups.routes.add(dot);
            var hole = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.24, 16), mat(0xffffff)); hole.position.set(dot.position.x, 0.32, dot.position.z); groups.routes.add(hole);
          });
        }
        ns.forEach(function (id, i) {
          if (NETWORK_OVERLAY || r.route.stops[i] || !nodes[id]) return;
          var o = laneWorld(ns[i - 1], id, r.num), p = wp(id);
          var ring = new T.Mesh(new T.TorusGeometry(0.55, 0.16, 6, 16), m);
          ring.rotation.x = Math.PI / 2; ring.position.set(p.x + o.x, 0.75, p.z + o.z);
          groups.routes.add(ring);
        });
      });
      dirty = true;
    }

    var selectable = [], selected = [];
    function paintStops() {
      Object.keys(stops).forEach(function (id) {
        var s = stops[id], isSel = selected.indexOf(id) >= 0, can = selectable.indexOf(id) >= 0;
        s.base.material.color.setHex(isSel ? C.accent : C.stop);
        s.base.material.opacity = selectable.length && !can && !isSel ? 0.4 : 1;
      });
      dirty = true;
    }
    function setSelectable(ids) { selectable = ids || []; paintStops(); }
    function setSelected(ids) { selected = ids || []; paintStops(); }

    var busContactMaterial = null;
    function contactMaterial() {
      if (busContactMaterial) return busContactMaterial;
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var ctx = c.getContext('2d'), gradient = ctx.createRadialGradient(32,32,5,32,32,32);
      gradient.addColorStop(0,'rgba(22,29,32,.48)'); gradient.addColorStop(.65,'rgba(22,29,32,.23)'); gradient.addColorStop(1,'rgba(22,29,32,0)');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
      busContactMaterial = new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false});
      return busContactMaterial;
    }

    function setBuses(list) {
      var seen = {};
      list.forEach(function (b) {
        seen[b.id] = true;
        var g = busMesh[b.id];
        if (g && g.userData.box && busGeo) { groups.buses.remove(g); g = null; } // 모델이 늦게 풀렸으면 상자 버스를 바꾼다
        if (!g && busGeo) {
          g = new T.Group();
          var model = new T.Mesh(busGeo, busMat(b.color, b.express ? EXPRESS_BODY : null)); model.castShadow = true; g.add(model);
          g.userData.model = model; g.userData.color = b.color + (b.express ? '|x' : '');
          groups.buses.add(g); busMesh[b.id] = g;
        }
        if (!g) {
          g = new T.Group();
          var body = new T.Mesh(new T.BoxGeometry(3.2, 1.6, 1.7), new T.MeshLambertMaterial({ color: 0xffffff }));
          body.position.y = 1.1; body.castShadow = true; g.add(body);
          var stripe = new T.Mesh(new T.BoxGeometry(3.25, 0.45, 1.75), new T.MeshLambertMaterial({ color: 0x6B7280 }));
          stripe.position.y = 0.95; g.add(stripe);
          var dome = new T.Mesh(new T.SphereGeometry(0.35, 10, 6), new T.MeshLambertMaterial({ color: 0x9AA1A9 }));
          dome.position.set(0.4, 2.0, 0); g.add(dome);
          g.userData.stripe = stripe; g.userData.box = true;
          groups.buses.add(g); busMesh[b.id] = g;
        }
        // 버스 위 이름표는 두지 않는다 — 탑승 인원(있을 때만)만 버스 위에 작게
        if (!labelEls.bus[b.id]) { var l = document.createElement('div'); l.className = 'label-3d bus-num'; labels.appendChild(l); labelEls.bus[b.id] = l; }
        if (g.userData.stripe) g.userData.stripe.material.color.set(b.color);
        else if (g.userData.color !== b.color + (b.express ? '|x' : '')) { g.userData.model.material = busMat(b.color, b.express ? EXPRESS_BODY : null); g.userData.color = b.color + (b.express ? '|x' : ''); }
        var x = b.x * K + (b.dx || 0) * K / PX, z = b.y * K + (b.dy || 0) * K / PX;
        var last = lastBus[b.id];
        if (Number.isFinite(b.heading)) g.rotation.y = -b.heading;
        else if (last && Math.hypot(x - last.x, z - last.z) > 0.05) g.rotation.y = -Math.atan2(z - last.z, x - last.x);
        lastBus[b.id] = { x: x, z: z };
        g.position.set(x, .18, z);
        if (!g.userData.contact) {
          var shadow = new T.Mesh(new T.PlaneGeometry(3.65, 1.9), contactMaterial());
          shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.005; shadow.renderOrder = -1;
          g.add(shadow); g.userData.contact = shadow;
        }
        g.visible = true;
        labelEls.bus[b.id].textContent = '';
        g.scale.set(BUS_SCALE*(b.regional?1.4:b.express?1.2:1), BUS_SCALE, BUS_SCALE);
        // 탑승 인원은 버스 위 작은 막대가 정원만큼 차오르는 정도로(숫자 배지 대신). 숫자·주요 인물 이름은 마우스를 올렸을 때(title)·aria-label로
        if(b.riders>0){var cap=b.regional?24:b.express?18:12,count=document.createElement('span');count.className='rider-count rider-fill';count.dataset.riders=b.riders;
          count.style.setProperty('--fill',Math.min(100,Math.round(b.riders/cap*100))+'%');count.title=(b.names&&b.names.length?b.names.join('·')+' 포함 ':'')+b.riders+'/'+cap+'명';labelEls.bus[b.id].appendChild(count);}
        labelEls.bus[b.id].setAttribute('aria-label',b.id+'호차'+(b.regional?' 광역 · 정원 24명':b.express?' 직행 · 정원 18명':'')+' · 탑승 '+(b.riders||0)+'명');
      });
      Object.keys(busMesh).forEach(function (id) { if (!seen[id]) { busMesh[id].visible = false; if (labelEls.bus[id]) {labelEls.bus[id].remove();delete labelEls.bus[id];} } else if (labelEls.bus[id]) labelEls.bus[id].style.display = ''; });
      dirty = true;
    }

    var personGeo = null;
    function setWaiting(map) {
      waitingNow = map || {};
      clear(groups.people);
      personGeo = personGeo || new T.CylinderGeometry(0.28, 0.28, 1.0, 8);
      // 숫자표는 지우고 다시 만들지 않는다 — 매 틱 새로 만들면 자리 잡기 전 한 프레임이 보여 깜빡였다
      Object.keys(labelEls.wait).forEach(function (id) { if (!waitingNow[id] || !nodes[id]) { labelEls.wait[id].remove(); delete labelEls.wait[id]; } });
      Object.keys(waitingNow).forEach(function (id) {
        var n = waitingNow[id];
        if (!n || !nodes[id]) return;
        var p = stops[id] ? stops[id].group.position : wp(id);
        for (var i = 0; i < Math.min(n, 12); i++) {
          var m = new T.Mesh(personGeo, mat(C.people));
          m.position.set(p.x + 2.4 + (i % 4) * 0.75, 0.5, p.z - 2.2 + Math.floor(i / 4) * 0.75);
          m.castShadow = true;
          groups.people.add(m);
        }
        var l = labelEls.wait[id];
        if (!l) { l = document.createElement('div'); l.className = 'label-3d wait-num'; labels.appendChild(l); labelEls.wait[id] = l; placeLabels(); }
        if (l.textContent !== String(n)) l.textContent = n;
      });
      dirty = true;
    }

    function flash(id) {
      if (reduced || !stops[id]) return;
      var s = stops[id], t0 = root.performance.now();
      s.flashT0 = t0; dirty = true;
    }

    function toScreen(x, y, z) {
      var v = new T.Vector3(x, y, z).project(camera);
      var r = container.getBoundingClientRect();
      return { left: (v.x + 1) / 2 * r.width, top: (1 - v.y) / 2 * r.height };
    }
    function project(x, y) { return toScreen(x * K, 2, y * K); }
    function laneOffset(a, b, num) { var o = laneWorld(a, b, num); return { dx: o.x * PX / K, dy: o.z * PX / K }; }

    function fit() {
      if (!bounds) return;
      var r = container.getBoundingClientRect(), wdt = Math.max(1, r.width), hgt = Math.max(1, r.height);
      renderer.setSize(wdt, hgt, false);
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      if (busRenderer) { busRenderer.setSize(wdt, hgt, false); busRenderer.domElement.style.width = '100%'; busRenderer.domElement.style.height = '100%'; }
      var cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
      // No sideways rotation: retain the map orientation while showing building height.
      camera.up.set(0, 1, 0);
      var elevation = CAMERA_ELEVATION * Math.PI / 180;
      var dir = new T.Vector3(0, Math.sin(elevation), Math.cos(elevation));
      camera.position.set(cx + dir.x * 300, dir.y * 300, cz + dir.z * 300);
      camera.lookAt(cx, 0, cz);
      camera.updateMatrixWorld();
      // 맞춤(2026-10-27 시각 위계): 정류장들(화면 틀)의 경계를 사방 같은 화면 여백(PAD px)으로. 이름표가 아래에 붙으니 아래만 조금 더.
      // 시계·운행 조작(opts.reserved) 밑에 정류장이 깔리면 위쪽 여백만 늘린다
      var inv = camera.matrixWorldInverse, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, fb = frameBox || bounds, pts = [];
      [fb.minX, fb.maxX].forEach(function (x) { [fb.minZ, fb.maxZ].forEach(function (z) { [0, 2].forEach(function (y) {
        var v = new T.Vector3(x, y, z).applyMatrix4(inv);
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }); }); });
      Object.keys(nodes).forEach(function (id) { pts.push(new T.Vector3(nodes[id].x, 2, nodes[id].z).applyMatrix4(inv)); });
      var vw = Math.max(1, maxX - minX), vh = Math.max(1, maxY - minY), PAD = Math.min(80, Math.max(54, Math.min(wdt, hgt) * 0.1)), top = PAD, bottom = PAD + 24;
      var areas = opts.reserved ? opts.reserved() : [], cr = container.getBoundingClientRect(), target = null, start = camStart;
      function place() {
        var aw = Math.max(1, wdt - 2 * PAD), ah = Math.max(1, hgt - top - bottom), s = Math.min(aw / vw, ah / vh);
        var cxp = PAD + aw / 2, cyp = top + ah / 2, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
        camera.left = mx - cxp / s; camera.right = camera.left + wdt / s; camera.top = my + cyp / s; camera.bottom = camera.top - hgt / s;
        camera.updateProjectionMatrix();
        target = { l: camera.left, r: camera.right, t: camera.top, b: camera.bottom };
        return function (v) { return { left: (v.x - camera.left) * s + cr.left, top: (camera.top - v.y) * s + cr.top }; };
      }
      for (var tries = 0; tries < 12; tries++) {
        var at = place(), hit = pts.some(function (v) { var p = at(v); return areas.some(function (a) { return p.left > a.left - 24 && p.left < a.right + 24 && p.top > a.top - 24 && p.top < a.bottom + 40; }); });
        if (!hit) break; top += 18;
      }
      // 단계가 바뀐 맞춤이면 이전 카메라에서 0.6초 동안 옮겨 간다(움직임 줄이기면 바로)
      if (animateNext && start && target && !reduced) { camAnim = { from: start, to: target, t0: root.performance.now() }; setCam(start); }
      animateNext = false; camStart = target; dirty = true; if (opts.onCamera) opts.onCamera();
    }

    var camStart = null;
    function setCam(c) { camera.left = c.l; camera.right = c.r; camera.top = c.t; camera.bottom = c.b; camera.updateProjectionMatrix(); }
    // 세팅 전체 정류장 틀의 화면 가로:세로(카메라 기울기 반영) — 지도 틀 크기를 정하는 데 쓴다(App.fitFrame)
    function contentAspect() {
      var fb = fullBox; if (!fb) return null; camera.updateMatrixWorld(); var inv = camera.matrixWorldInverse, xs = [], ys = [];
      [fb.minX, fb.maxX].forEach(function (x) { [fb.minZ, fb.maxZ].forEach(function (z) { var v = new T.Vector3(x, 0, z).applyMatrix4(inv); xs.push(v.x); ys.push(v.y); }); });
      return (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / Math.max(1, Math.max.apply(null, ys) - Math.min.apply(null, ys));
    }
    function placeLabels() {
      Object.keys(labelEls.stop).forEach(function (id) {
        if (!nodes[id]) return;
        var p = wp(id), s = toScreen(p.x, 0, p.z + (stops[id] ? stops[id].front : 1.5) + 0.3);
        var l = labelEls.stop[id]; l.style.left = s.left + 'px'; l.style.top = s.top + 'px';
      });
      Object.keys(labelEls.wait).forEach(function (id) {
        var p = wp(id), s = toScreen(p.x + 3.5, 2.2, p.z - 2.5);
        var l = labelEls.wait[id]; l.style.left = s.left + 'px'; l.style.top = s.top + 'px';
      });
      Object.keys(labelEls.bus).forEach(function (id) {
        var g = busMesh[id]; if (!g || !g.visible) return;
        var s = toScreen(g.position.x, 2.5 * BUS_SCALE, g.position.z);
        var l = labelEls.bus[id]; l.style.left = s.left + 'px'; l.style.top = s.top + 'px';
      });
    }

    function frame() {
      var now = root.performance.now();
      if (camAnim) {
        var k = Math.min(1, (now - camAnim.t0) / 600), e = 1 - Math.pow(1 - k, 3), a = camAnim.from, b = camAnim.to;
        setCam({ l: a.l + (b.l - a.l) * e, r: a.r + (b.r - a.r) * e, t: a.t + (b.t - a.t) * e, b: a.b + (b.b - a.b) * e });
        if (k >= 1) camAnim = null; dirty = true; if (opts.onCamera) opts.onCamera();
      }
      if (rising) {
        var f = Math.min(1, (now - rising.t0) / 800);
        if (zoneGroups[rising.id]) zoneGroups[rising.id].scale.y = 0.02 + 0.98 * (1 - Math.pow(1 - f, 3));
        dirty = true;
        if (f >= 1) rising = null;
      }
      Object.keys(stops).forEach(function (id) {
        var s = stops[id];
        if (s.flashT0 == null) return;
        var f = (now - s.flashT0) / 1200;
        s.ring.visible = f < 1; s.ring.material.opacity = 0.6 * (1 - f);
        if (f >= 1) s.flashT0 = null;
        dirty = true;
      });
      if (dirty && container.offsetParent !== null) {
        renderer.render(scene, camera);
        if (busRenderer) busRenderer.render(busScene, camera);
        placeLabels();
        dirty = false;
      }
    }
    (function loop() { frame(); root.requestAnimationFrame(loop); })();
    root.setInterval(frame, 100);

    if (root.ResizeObserver) new root.ResizeObserver(function () { fit(); frame(); }).observe(container);

    root.PB.RoutePointer.attach(renderer.domElement,function(x,y){return root.PB.RoutePointer.pick(renderer.domElement,project,nodes,currentRoutes,x,y,function(a,b,num){var o=laneWorld(a,b,num);return{x:o.x/K,y:o.z/K};});},opts);

    return {
      kind: '3d', ok: true, setScene: setScene, setRoutes: setRoutes, setSelectable: setSelectable, setSelected: setSelected,
      zoneInfo: function () { return Object.keys(zoneGroups).map(function (id) { return { id: id, model: !!zoneGroups[id].userData.model, offset: {x:zoneGroups[id].position.x-wp(id).x,z:zoneGroups[id].position.z-wp(id).z} }; }); },
      busInfo: function () { return Object.keys(busMesh).filter(function (id) { return busMesh[id].visible; }).map(function (id) { var u = busMesh[id].userData; return { id: Number(id), model: !!u.model, color: u.color || null }; }); },
      refit: function () { fit(); }, contentAspect: contentAspect, setBuses: setBuses, setWaiting: setWaiting, setCrowd: setCrowd, flash: flash, project: project, setDrivingSegments: setDrivingSegments,
      projectRoad: function (x, y) { return toScreen(x * K, .18, y * K); }, laneOffset: laneOffset,
      setReducedMotion: function (v) { reduced = !!v; },
      show: function (v) { container.hidden = !v; if (v) { fit(); dirty = true; frame(); } },
      dispose: function () { renderer.dispose(); },
      __nodeIds: function () { return Object.keys(zoneGroups); },
      __pickForTest: function (id) { if (opts.onNode) opts.onNode(id); }
    };
  }

  root.PB = root.PB || {};
  root.PB.View3D = { create: create, supported: supported };
})(window);
