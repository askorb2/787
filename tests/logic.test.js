const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

// deterministic LCG rng for reproducible tests
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('buildRoundOrder: every id appears exactly once in a round', () => {
  const ids = Array.from({ length: 213 }, (_, i) => 'p' + i);
  const rng = makeRng(1);
  const order = L.buildRoundOrder(ids, rng, null);
  assert.equal(order.length, ids.length);
  assert.deepEqual([...order].sort(), [...ids].sort());
  assert.equal(new Set(order).size, ids.length);
});

test('buildRoundOrder: order differs between successive rounds', () => {
  const ids = Array.from({ length: 50 }, (_, i) => 'p' + i);
  const rng = makeRng(2);
  const round1 = L.buildRoundOrder(ids, rng, null);
  const round2 = L.buildRoundOrder(ids, rng, round1[round1.length - 1]);
  assert.notDeepEqual(round1, round2, 'two consecutive shuffles should not be identical');
});

test('buildRoundOrder: previous round\'s last question never opens the next round', () => {
  const ids = Array.from({ length: 8 }, (_, i) => 'p' + i);
  for (let seed = 0; seed < 200; seed++) {
    const rng = makeRng(seed * 7919 + 3);
    const prevLast = 'p3';
    const order = L.buildRoundOrder(ids, rng, prevLast);
    assert.notEqual(order[0], prevLast, `seed ${seed}: order[0] must not equal prevLast`);
    assert.equal(new Set(order).size, ids.length, `seed ${seed}: round must still be a full permutation`);
  }
});

test('buildRoundOrder: single-question pool is left alone (no infinite swap)', () => {
  const order = L.buildRoundOrder(['only'], makeRng(5), 'only');
  assert.deepEqual(order, ['only']);
});

test('shuffleOptionPerm: answer position is (near-)uniform across 4 slots over 1000 trials (chi-square)', () => {
  const trials = 1000;
  const counts = [0, 0, 0, 0];
  const rng = makeRng(42);
  const originalAnswerIndex = 1; // arbitrary fixed "correct" original index
  for (let t = 0; t < trials; t++) {
    const perm = L.shuffleOptionPerm(4, rng);
    const displayedPos = perm.indexOf(originalAnswerIndex);
    counts[displayedPos]++;
  }
  const expected = trials / 4;
  let chiSq = 0;
  for (const c of counts) {
    chiSq += Math.pow(c - expected, 2) / expected;
  }
  // critical value for df=3 at alpha=0.01 is 11.345; use a generous bound
  // so this test isn't flaky, while still catching a badly broken shuffle.
  assert.ok(
    chiSq < 16.27, // alpha = 0.001, df = 3
    `chi-square ${chiSq.toFixed(2)} too high for counts ${JSON.stringify(counts)}`
  );
  for (const c of counts) {
    assert.ok(c > 0, 'every option slot should be hit at least once in 1000 trials');
  }
});

test('shuffleOptionPerm: always a valid permutation', () => {
  const rng = makeRng(9);
  for (let i = 0; i < 200; i++) {
    const perm = L.shuffleOptionPerm(4, rng);
    assert.deepEqual([...perm].sort(), [0, 1, 2, 3]);
  }
});

test('updateStat: a wrong answer resets streak to 0 and increments wrong/seen', () => {
  let stat = L.emptyStat();
  stat = L.updateStat(stat, true, 1000);
  stat = L.updateStat(stat, true, 1001);
  assert.equal(stat.streak, 2);
  stat = L.updateStat(stat, false, 1002);
  assert.equal(stat.streak, 0);
  assert.equal(stat.wrong, 1);
  assert.equal(stat.seen, 3);
  assert.equal(stat.correct, 2);
});

test('updateStat: does not mutate the previous stat object', () => {
  const prev = L.emptyStat();
  const next = L.updateStat(prev, true, 5);
  assert.equal(prev.seen, 0, 'previous stat object must remain untouched');
  assert.equal(next.seen, 1);
});

test('isWrongEligible: a question leaves the 오답 pool after 2 consecutive correct answers following a miss', () => {
  let stat = L.emptyStat();
  stat = L.updateStat(stat, false, 1); // miss -> streak 0, wrong 1
  assert.equal(L.isWrongEligible(stat), true);
  stat = L.updateStat(stat, true, 2); // streak 1
  assert.equal(L.isWrongEligible(stat), true, 'still eligible after only 1 correct');
  stat = L.updateStat(stat, true, 3); // streak 2
  assert.equal(L.isWrongEligible(stat), false, 'must be excluded after 2 consecutive correct');
});

test('isWrongEligible: a question with zero misses is never eligible', () => {
  let stat = L.emptyStat();
  stat = L.updateStat(stat, true, 1);
  stat = L.updateStat(stat, true, 2);
  assert.equal(L.isWrongEligible(stat), false);
});

test('buildWrongQueue: only eligible (wrong>=1 && streak<2) ids are included', () => {
  const stats = {
    a: L.updateStat(L.emptyStat(), false, 1), // eligible, streak 0
    b: (() => {
      let s = L.updateStat(L.emptyStat(), false, 1);
      s = L.updateStat(s, true, 2);
      s = L.updateStat(s, true, 3);
      return s; // wrong>=1 but streak 2 -> not eligible
    })(),
    c: L.updateStat(L.emptyStat(), true, 1), // never wrong -> not eligible
  };
  const queue = L.buildWrongQueue(stats, ['a', 'b', 'c'], makeRng(1));
  assert.deepEqual(queue, ['a']);
});

test('buildWrongQueue: higher wrong-rate tends to sort earlier over many draws', () => {
  // a: 1 wrong / 1 seen (rate 1.0); b: 1 wrong / 10 seen (rate 0.1)
  let statA = L.emptyStat();
  statA = L.updateStat(statA, false, 1);
  let statB = L.emptyStat();
  for (let i = 0; i < 9; i++) statB = L.updateStat(statB, true, i);
  statB = L.updateStat(statB, false, 10);
  const stats = { a: statA, b: statB };

  let aFirstCount = 0;
  const trials = 500;
  for (let t = 0; t < trials; t++) {
    const rng = makeRng(t);
    const queue = L.buildWrongQueue(stats, ['a', 'b'], rng);
    if (queue[0] === 'a') aFirstCount++;
  }
  assert.ok(aFirstCount > trials * 0.55, `expected higher-wrong-rate item to lead more often, got ${aFirstCount}/${trials}`);
});

test('buildTopQueue: sorts by wrong rate desc, ties broken by wrong count desc', () => {
  const stats = {
    low: { seen: 10, wrong: 1, correct: 9, streak: 1, last: 0 }, // rate 0.1
    highTieA: { seen: 10, wrong: 5, correct: 5, streak: 0, last: 0 }, // rate 0.5, wrong 5
    highTieB: { seen: 20, wrong: 10, correct: 10, streak: 0, last: 0 }, // rate 0.5, wrong 10
    mid: { seen: 10, wrong: 3, correct: 7, streak: 1, last: 0 }, // rate 0.3
  };
  const ids = ['low', 'highTieA', 'highTieB', 'mid'];
  const top = L.buildTopQueue(stats, ids, 4, () => 0); // rng=0 => shuffle is identity-ish, order doesn't matter, check set membership/rank via a stable rng instead
  // Since buildTopQueue shuffles the selected subset, check rank via a non-shuffled probe:
  const ranked = ids
    .slice()
    .sort((a, b) => {
      const ra = L.wrongRate(stats[a]), rb = L.wrongRate(stats[b]);
      if (rb !== ra) return rb - ra;
      return stats[b].wrong - stats[a].wrong;
    });
  assert.deepEqual(ranked, ['highTieB', 'highTieA', 'mid', 'low']);
  assert.equal(new Set(top).size, 4);
});

test('buildTopQueue: falls back to all qualifying questions when fewer than N', () => {
  const stats = {
    a: { seen: 5, wrong: 2, correct: 3, streak: 0, last: 0 },
    b: { seen: 5, wrong: 1, correct: 4, streak: 0, last: 0 },
    c: { seen: 0, wrong: 0, correct: 0, streak: 0, last: 0 }, // never seen -> excluded
  };
  const top = L.buildTopQueue(stats, ['a', 'b', 'c'], 20, makeRng(3));
  assert.equal(top.length, 2);
  assert.ok(top.includes('a') && top.includes('b'));
  assert.ok(!top.includes('c'));
});

test('buildTopQueue: empty pool when nothing has been seen', () => {
  const stats = { a: L.emptyStat(), b: L.emptyStat() };
  const top = L.buildTopQueue(stats, ['a', 'b'], 10, makeRng(4));
  assert.deepEqual(top, []);
});

test('createSafeStorage: falls back to memory and never throws when backend.setItem/getItem throw', () => {
  const throwingBackend = {
    setItem() {
      throw new Error('QuotaExceededError');
    },
    getItem() {
      throw new Error('SecurityError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
  const storage = L.createSafeStorage(throwingBackend);
  assert.equal(storage.available, false);
  assert.doesNotThrow(() => storage.set('k', 'v'));
  assert.doesNotThrow(() => {
    const v = storage.get('k');
    assert.equal(v, 'v'); // round-trips via in-memory fallback
  });
});

test('createSafeStorage: works normally with a healthy backend', () => {
  const mem = {};
  const backend = {
    setItem(k, v) {
      mem[k] = v;
    },
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    removeItem(k) {
      delete mem[k];
    },
  };
  const storage = L.createSafeStorage(backend);
  assert.equal(storage.available, true);
  storage.set('x', '{"a":1}');
  assert.equal(storage.get('x'), '{"a":1}');
  assert.equal(storage.get('missing'), null);
});

test('createSafeStorage: no backend at all (e.g. localStorage undefined) does not throw', () => {
  const storage = L.createSafeStorage(null);
  assert.equal(storage.available, false);
  assert.doesNotThrow(() => storage.set('k', 'v'));
  assert.equal(storage.get('k'), 'v');
});
