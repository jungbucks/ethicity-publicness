// 기본 수요와 사건 추첨 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('./planned-fixture.cjs');
const D = require('../js/demand.js');
const Rng = require('../js/rng.js');

test('base demand counts and ranges (AC9)', () => {
  for (const p of [1, 2]) assert.equal(D.base(cfg, p, 42).length, 148);
  for (const p of [3, 4, 5]) assert.equal(D.base(cfg, p, 42).length, 180);
  for (const p of [1, 2, 3, 4, 5]) {
    const reqs = D.base(cfg, p, 42);
    assert.ok(reqs.every((r) => r.t >= 0 && r.t <= 89 && Number.isInteger(r.t)));
    for (const row of cfg.demandRows.filter((x) => x.fromPhase <= p)) {
      const fwd = reqs.filter((r) => r.o === row.a && r.d === row.b).length;
      const back = reqs.filter((r) => r.o === row.b && r.d === row.a).length;
      assert.equal(fwd, row.n); assert.equal(back, row.n);
    }
  }
  assert.equal(D.base(cfg, 1, 42).filter((r) => r.o === 'I' || r.d === 'I').length, 0);
});

test('directional expansion order', () => {
  const dir = D.directional(cfg, 1);
  assert.equal(dir.length, 18);
  assert.deepEqual(dir[0], { r: 0, o: 'B', d: 'A', n: 12 });
  assert.deepEqual(dir[1], { r: 1, o: 'A', d: 'B', n: 12 });
  assert.equal(D.directional(cfg, 3).length, 22);
});

test('request time formula and ids', () => {
  const legacy = structuredClone(cfg); delete legacy.rush;
  const reqs = D.base(legacy, 1, 42);
  const ba0 = reqs.find((r) => r.row === 0 && r.i === 0);
  const ab0 = reqs.find((r) => r.row === 1 && r.i === 0);
  assert.equal(ba0.t, 49);
  assert.equal(ab0.t, 60);
  assert.equal(ba0.id, 100000);
  assert.equal(ba0.key, 'P1-R0-0');
  assert.equal(ba0.kind, 'base');
  const ba5 = reqs.find((r) => r.row === 0 && r.i === 5); // floor(90*5/12)=37
  assert.equal(ba5.t, (37 + 42 + 7) % 90);
  for (let k = 1; k < reqs.length; k++) {
    const a = reqs[k - 1], b = reqs[k];
    assert.ok(a.t < b.t || (a.t === b.t && a.id < b.id), '시각→id 정렬');
  }
});

test('rush waves preserve population but concentrate arrivals by direction', () => {
  for (const seed of [0, 7, 42, 999]) {
    const reqs = D.base(cfg, 1, seed);
    assert.equal(reqs.length, 148);
    assert.deepEqual(reqs, D.base(cfg, 1, seed));
    for (const row of D.directional(cfg, 1)) {
      const times = reqs.filter(r => r.row === row.r).map(r => r.t);
      const start = row.r % 2 === 0 ? 8 : 50;
      assert.ok(times.filter(t => t >= start && t < start + 14).length >= Math.ceil(row.n * .75));
    }
  }
});

test('events deterministic and follow PRNG order', () => {
  const ev = D.drawEvents(cfg, 42);
  assert.deepEqual(ev, D.drawEvents(cfg, 42));
  assert.equal(ev.length, 5);
  const r = Rng.create(42);
  for (let p = 1; p <= 5; p++) {
    const u1 = r.next(), u2 = r.next(), u3 = r.next();
    const type = u1 < 0.6 ? 'none' : u1 < 0.85 ? 'demand' : 'petition';
    assert.deepEqual(ev[p - 1], { phase: p, type, t: 35 + Math.floor(26 * u2), odIndex: Math.floor(D.directional(cfg, p).length * u3) });
    assert.ok(ev[p - 1].t >= 35 && ev[p - 1].t <= 60);
  }
});

test('extra demand adds 12 over t..t+5', () => {
  const ev = { phase: 2, type: 'demand', t: 40, odIndex: 3 };
  const extra = D.extra(cfg, 2, ev);
  const od = D.directional(cfg, 2)[3];
  assert.equal(extra.length, 12);
  for (let t = 40; t <= 45; t++) assert.equal(extra.filter((x) => x.t === t).length, 2);
  assert.ok(extra.every((x) => x.o === od.o && x.d === od.d && x.kind === 'extra'));
  assert.equal(extra[0].id, 290000);
  assert.equal(extra[0].key, 'P2-E-0');
});

test('petition and none produce no extra', () => {
  assert.equal(D.extra(cfg, 1, { phase: 1, type: 'petition', t: 40, odIndex: 0 }).length, 0);
  assert.equal(D.extra(cfg, 1, { phase: 1, type: 'none', t: 40, odIndex: 0 }).length, 0);
});
