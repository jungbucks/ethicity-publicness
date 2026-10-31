/*
 * 3D 모델 데이터 풀기 — fal.ai로 만든 버스(assets/models/bus.js의 PB.busModelData)·구역 건물(zone-<id>.js의 PB.zoneModelData).
 * decode: 압축(Uint16 양자화) 좌표·UV·삼각형 → Float32 배열(tools/glb-pack.mjs가 만든 형식).
 * recolor(버스 전용): 텍스처의 파란 띠를 노선 색으로(명암 유지), 생성 잡티인 청록 얼룩은 같은 밝기의 회색으로 바꾼다.
 */
(function (root) {
  'use strict';

  function bytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    var s = atob(b64), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function u16(b64) { var b = bytes(b64); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2); }
  function unpack(q, min, max) {
    var dim = min.length, out = new Float32Array(q.length);
    for (var i = 0; i < q.length; i++) { var k = i % dim; out[i] = min[k] + q[i] / 65535 * (max[k] - min[k]); }
    return out;
  }

  function decode(d) {
    return {
      position: unpack(u16(d.position), d.posMin, d.posMax),
      uv: unpack(u16(d.uv), d.uvMin, d.uvMax),
      index: d.indexType === 'u32' ? (function () { var b = bytes(d.index); return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4); })() : u16(d.index)
    };
  }

  function hsv(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn, h = 0;
    if (c) h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
    return { h: (h * 60 + 360) % 360, s: mx ? c / mx : 0, v: mx / 255 };
  }
  function hex(color) { var n = parseInt(String(color).replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

  // px: RGBA 바이트 배열(ImageData.data). 새 배열을 돌려준다. body가 있으면 흰 몸체(채도 낮고 밝은 칠)를 그 색으로(명암 유지)
  function recolor(px, color, body) {
    var out = new Uint8ClampedArray(px.length), rc = hex(color), bc = body ? hex(body) : null;
    for (var i = 0; i < px.length; i += 4) {
      var r = px[i], g = px[i + 1], b = px[i + 2], c = hsv(r, g, b);
      if (c.h >= 200 && c.h <= 245 && c.s >= 0.45 && c.v >= 0.3) {
        var f = Math.min(1.15, c.v / 0.8);
        out[i] = rc[0] * f; out[i + 1] = rc[1] * f; out[i + 2] = rc[2] * f;
      } else if (c.h >= 170 && c.h < 200 && c.s >= 0.35) {
        var y = 0.299 * r + 0.587 * g + 0.114 * b;
        out[i] = out[i + 1] = out[i + 2] = Math.min(255, y * 1.15);
      } else if (bc && c.s < 0.18 && c.v > 0.62) {
        var k = Math.min(1.1, c.v / 0.9);
        out[i] = bc[0] * k; out[i + 1] = bc[1] * k; out[i + 2] = bc[2] * k;
      } else { out[i] = r; out[i + 1] = g; out[i + 2] = b; }
      out[i + 3] = px[i + 3];
    }
    return out;
  }

  var api = { decode: decode, recolor: recolor };
  root.PB = root.PB || {};
  root.PB.ModelData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
