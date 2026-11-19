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
console.log('total questions scanned:', questions.length);
console.log('flagged candidates:', flagged.length);
console.log(JSON.stringify(flagged, null, 1));
