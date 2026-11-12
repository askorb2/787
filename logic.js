/*
 * B787 Quiz — pure state/selection logic, free of DOM and localStorage access.
 * Loaded as a plain <script> in the browser (defines window.B787Logic) and
 * also require()-able from Node (tests/logic.test.js) via the UMD-ish export
 * at the bottom. Keeping this separate from app.js is what makes the quiz
 * logic testable without a browser or a build step.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.B787Logic = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Default RNG; every function below accepts an injectable `rng` (a
  // zero-arg function returning a float in [0,1)) so tests can be
  // deterministic or run statistical checks over many trials.
  function defaultRng() {
    return Math.random();
  }

  function shuffle(arr, rng) {
    rng = rng || defaultRng;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  // A fresh round order: all ids shuffled, with a guard against the
  // previous round's last question landing first in the new one (spec:
  // "직전 바퀴의 마지막 문제가 새 바퀴의 첫 문제가 되지 않게 한다").
  function buildRoundOrder(ids, rng, prevLastId) {
    rng = rng || defaultRng;
    if (ids.length === 0) return [];
    var order = shuffle(ids, rng);
    if (ids.length > 1 && prevLastId != null && order[0] === prevLastId) {
      // swap the offending first element with some other position
      var swapWith = 1 + Math.floor(rng() * (order.length - 1));
      var tmp = order[0];
      order[0] = order[swapWith];
      order[swapWith] = tmp;
    }
    return order;
  }

  // A permutation of option indices [0..n-1] describing display order:
  // displayed[i] = originalOptions[perm[i]].
  function shuffleOptionPerm(n, rng) {
    rng = rng || defaultRng;
    var idx = [];
    for (var i = 0; i < n; i++) idx.push(i);
    return shuffle(idx, rng);
  }

  function emptyStat() {
    return { seen: 0, wrong: 0, correct: 0, streak: 0, last: 0 };
  }

  // Returns a NEW stat entry (does not mutate the input) reflecting one
  // more attempt at a question.
  function updateStat(prevStat, wasCorrect, now) {
    var s = prevStat ? Object.assign({}, prevStat) : emptyStat();
    s.seen += 1;
    s.last = now == null ? Date.now() : now;
    if (wasCorrect) {
      s.correct += 1;
      s.streak += 1;
    } else {
      s.wrong += 1;
      s.streak = 0;
    }
    return s;
  }

  function wrongRate(stat) {
    if (!stat || stat.seen === 0) return 0;
    return stat.wrong / stat.seen;
  }

  // Eligible for the "wrong" (오답) queue: at least one miss, and not yet
  // re-answered correctly twice in a row since that miss.
  function isWrongEligible(stat) {
    return !!stat && stat.wrong >= 1 && stat.streak < 2;
  }

  function buildWrongQueue(stats, ids, rng) {
    rng = rng || defaultRng;
    var eligible = ids.filter(function (id) {
      return isWrongEligible(stats[id]);
    });
    var keyed = eligible.map(function (id) {
      var stat = stats[id];
      var weight = 0.2 + wrongRate(stat);
      var r = rng();
      // guard against r === 0 (Math.pow(0, x) === 0, which is fine, but
      // avoid r exactly 1 edge cases from custom rngs)
      if (r <= 0) r = 1e-9;
      if (r >= 1) r = 1 - 1e-9;
      var key = Math.pow(r, 1 / weight);
      return { id: id, key: key };
    });
    keyed.sort(function (a, b) {
      return b.key - a.key;
    });
    return keyed.map(function (k) {
      return k.id;
    });
  }

  // Top-N by wrong rate desc, tie-broken by raw wrong count desc, then
  // shuffled among the selected subset (so repeated "top" sessions aren't
  // always presented in the exact same order even if the pool is stable).
  function buildTopQueue(stats, ids, n, rng) {
    rng = rng || defaultRng;
    var candidates = ids.filter(function (id) {
      return stats[id] && stats[id].seen > 0;
    });
    candidates.sort(function (a, b) {
      var sa = stats[a], sb = stats[b];
      var ra = wrongRate(sa), rb = wrongRate(sb);
      if (rb !== ra) return rb - ra;
      if (sb.wrong !== sa.wrong) return sb.wrong - sa.wrong;
      return 0;
    });
    var top = candidates.slice(0, n);
    return shuffle(top, rng);
  }

  // Wraps a storage-like object (localStorage) so a throwing implementation
  // (private browsing quota errors, disabled storage, etc.) degrades to an
  // in-memory Map instead of crashing the app. Returns {get, set, remove,
  // available}.
  function createSafeStorage(backend) {
    var mem = {};
    var available = true;
    if (backend) {
      try {
        var testKey = '__b787quiz_test__';
        backend.setItem(testKey, '1');
        backend.removeItem(testKey);
      } catch (e) {
        available = false;
      }
    } else {
      available = false;
    }
    return {
      available: available,
      get: function (key) {
        if (available) {
          try {
            return backend.getItem(key);
          } catch (e) {
            available = false;
          }
        }
        return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
      },
      set: function (key, value) {
        if (available) {
          try {
            backend.setItem(key, value);
            return;
          } catch (e) {
            available = false;
          }
        }
        mem[key] = value;
      },
    };
  }

  return {
    shuffle: shuffle,
    buildRoundOrder: buildRoundOrder,
    shuffleOptionPerm: shuffleOptionPerm,
    emptyStat: emptyStat,
    updateStat: updateStat,
    wrongRate: wrongRate,
    isWrongEligible: isWrongEligible,
    buildWrongQueue: buildWrongQueue,
    buildTopQueue: buildTopQueue,
    createSafeStorage: createSafeStorage,
  };
});
