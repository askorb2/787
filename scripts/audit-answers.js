// Self-consistency check: does the marked `ans` option actually match the
// "key fact" highlighted (red spans) in that question's own explanation?
// This checks the PDF's internal consistency (question+answer vs. its own
// explanation text), not an external FCOM source.
const fs = require('fs');
const questions = JSON.parse(fs.readFileSync('data/questions.json', 'utf8'));

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in', 'on',
  'for', 'and', 'or', 'with', 'this', 'that', 'it', 'as', 'by', 'at', 'from',
  'when', 'can', 'will', 'has', 'have', 'not', 'no', '가', '나', '다', '라',
  '은', '는', '이', '가', '을', '를', '의', '에', '에서', '중', '것은',
]);

function tokenize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .split(/[^a-z0-9가-힣.%°]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function redText(exp) {
  var out = [];
  (exp || []).forEach((item) => {
    if (item.t !== 'html') return;
    var m = item.v.match(/<span class="r">(.*?)<\/span>/gs) || [];
    m.forEach((frag) => out.push(frag.replace(/<[^>]+>/g, ' ')));
  });
  return out.join(' ');
}

function similarity(optText, redTokens) {
  var optTokens = tokenize(optText);
  if (optTokens.length === 0) return 0;
  var redSet = new Set(redTokens);
  var hits = 0;
  optTokens.forEach((t) => { if (redSet.has(t)) hits++; });
  return hits / optTokens.length;
}

const NEG_RE = /틀린|아닌|잘못된|맞지\s*않|않는\s*것|옳지\s*않|NOT\b|incorrect/i;

const flagged = [];

for (const q of questions) {
  if (!Number.isInteger(q.ans)) continue;
  var rtext = redText(q.exp);
  if (!rtext.trim()) continue; // no red-highlighted key text to compare against
  var redTokens = tokenize(rtext);
  if (redTokens.length < 2) continue;

  var scores = q.opts.map((o) => similarity(o, redTokens));
  var maxScore = Math.max.apply(null, scores);
  var bestIdx = scores.indexOf(maxScore);
  var ansScore = scores[q.ans];
  var isNegative = NEG_RE.test(q.q);

  if (maxScore === 0) continue; // nothing matched anything; not informative

  if (!isNegative) {
    // positive question: the marked answer should be the best (or tied-best) match
    if (bestIdx !== q.ans && maxScore - ansScore >= 0.34) {
      flagged.push({ id: q.id, code: q.code, polarity: 'positive', ans: q.ans, bestIdx, ansScore, bestScore: maxScore, scores });
    }
  } else {
    // negative question: the marked (false) answer matching the true-fact
    // text best, by a clear margin over the others, is the suspicious case
    var others = scores.filter((_, i) => i !== q.ans);
    var maxOther = Math.max.apply(null, others);
    if (bestIdx === q.ans && ansScore - maxOther >= 0.34) {
      flagged.push({ id: q.id, code: q.code, polarity: 'negative', ans: q.ans, bestIdx, ansScore, bestScore: maxOther, scores });
    }
  }
}

flagged.sort((a, b) => (b.ansScore - b.bestScore) - (a.ansScore - a.bestScore));
console.log('=== same-question self-consistency (answer vs. its own red-highlighted explanation) ===');
console.log('total questions scanned:', questions.length);
console.log('flagged candidates:', flagged.length);
console.log(JSON.stringify(flagged, null, 1));

// --------------------------------------------------------------------------
// Pass 2: cross-check "variant" sibling questions (same chapter + base code,
// e.g. "10-3" vs "10-3-a", "13-7" vs "13-7-1") against each other. A real
// case this caught: p312/p313 and p283/p284 each mark opposite options as
// the "wrong" one for what is nearly the same underlying fact — one of the
// pair has to be broken. High lexical overlap between one question's marked
// answer and a non-answer option in its sibling is the signal; it still
// needs a human (or FCOM cross-check) to say which side is actually wrong,
// this only narrows down *candidates*.
function baseCode(code) {
  var parts = code.split('-');
  if (parts.length <= 2) {
    if (parts.length === 2 && /^[a-z]+$/i.test(parts[1])) return parts[0];
    return code;
  }
  return parts.slice(0, -1).join('-');
}
function normWords(s) {
  return (s || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9가-힣]+/g, ' ').trim();
}
function jaccard(a, b) {
  var A = new Set(normWords(a).split(' ').filter((w) => w.length >= 2));
  var B = new Set(normWords(b).split(' ').filter((w) => w.length >= 2));
  if (A.size === 0 || B.size === 0) return 0;
  var inter = 0;
  A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / new Set([...A, ...B]).size;
}

var groups = new Map();
questions.forEach((q) => {
  var key = q.ch + '|' + baseCode(q.code);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(q);
});
var siblingGroups = [...groups.values()].filter((g) => g.length >= 2);

var siblingFindings = [];
siblingGroups.forEach((group) => {
  for (var i = 0; i < group.length; i++) {
    for (var j = 0; j < group.length; j++) {
      if (i === j) continue;
      var qa = group[i], qb = group[j];
      qb.opts.forEach((optB, bi) => {
        if (bi === qb.ans) return;
        var sim = jaccard(qa.opts[qa.ans], optB);
        if (sim >= 0.55) {
          siblingFindings.push({
            a: qa.id, aCode: qa.code, aAnsText: qa.opts[qa.ans],
            b: qb.id, bCode: qb.code, bOptIdx: bi, bOptText: optB, bAnsText: qb.opts[qb.ans],
            sim: +sim.toFixed(2),
          });
        }
      });
    }
  }
});
var seen = new Set();
var uniqSibling = siblingFindings.filter((f) => {
  var k = [f.a, f.b].sort().join('|') + f.bOptText;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

console.log('\n=== sibling-variant cross-check (same chapter + base code) ===');
console.log('sibling groups found:', siblingGroups.length);
siblingGroups.forEach((g) => console.log(' ', g.map((q) => q.id + ':' + q.code).join(' , ')));
console.log('candidate contradictions:', uniqSibling.length, '(needs manual/FCOM review — see scripts output history for p283/p284, p312/p313 resolved 2026-11-19)');
console.log(JSON.stringify(uniqSibling, null, 1));
