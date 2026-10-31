/*
 * xorshift32 난수 (PRD §6) — 같은 seed면 같은 수열. 0은 1로 바꾼다.
 * 한 번 뽑을 때: x ^= x<<13, x ^= x>>>17, x ^= x<<5 → unsigned 32비트 → 2^32로 나눠 [0,1)
 */
(function (root) {
  'use strict';

  function create(seed) {
    var x = (Number(seed) >>> 0) || 1;
    return {
      next: function () {
        x ^= x << 13; x >>>= 0;
        x ^= x >>> 17;
        x ^= x << 5; x >>>= 0;
        return x / 4294967296;
      }
    };
  }

  var api = { create: create };
  root.PB = root.PB || {};
  root.PB.Rng = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
