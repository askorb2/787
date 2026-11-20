// questions.json 형식 검사기 — 앱이 읽을 수 있는 데이터인지 확인한다.
// 어떤 PDF에서 어떤 방법으로 추출했든, 이 검사를 통과하면 앱은 수정 없이 동작한다.
//
//   node scripts/validate-questions.js [data/questions.json]
//
// 오류(앱이 깨지는 문제)가 있으면 exit 1, 경고(앱은 돌지만 확인 필요)만 있으면 exit 0.
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || 'data/questions.json';
const dataDir = path.dirname(file);
const configSrc = fs.existsSync('config.js') ? fs.readFileSync('config.js', 'utf8') : '';
const sandbox = {};
if (configSrc) new Function('self', configSrc)(sandbox);
const maxOpts = ((sandbox.APP_CONFIG && sandbox.APP_CONFIG.optionLabels) || ['가', '나', '다', '라', '마']).length;

const errors = [];
const warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);
const isStr = (v) => typeof v === 'string';

let questions;
try {
  questions = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`읽기/파싱 실패: ${file}\n${e.message}`);
  process.exit(1);
}
if (!Array.isArray(questions) || questions.length === 0) {
  console.error('최상위가 비어 있지 않은 배열이어야 합니다.');
  process.exit(1);
}

const ids = new Set();
questions.forEach((q, i) => {
  const id = q && isStr(q.id) && q.id ? q.id : `#${i}`;
  if (!q || typeof q !== 'object') return err(id, '객체가 아님');

  if (!isStr(q.id) || !q.id) err(id, 'id 없음');
  else if (ids.has(q.id)) err(id, 'id 중복');
  else ids.add(q.id);
  if (isStr(q.id) && !/^[A-Za-z0-9_-]+$/.test(q.id)) err(id, 'id는 영문/숫자/-/_ 만 사용 (HTML 속성에 그대로 들어감)');

  for (const f of ['ch', 'code', 'q']) {
    if (!isStr(q[f]) || !q[f].trim()) err(id, `${f} 없음/빈 문자열`);
  }
  if (q.ref != null && !isStr(q.ref)) err(id, 'ref는 문자열 또는 생략');

  if (!Array.isArray(q.opts)) {
    err(id, 'opts가 배열이 아님');
  } else {
    if (q.opts.length < 2 || q.opts.length > maxOpts) err(id, `보기 개수 ${q.opts.length} (2~${maxOpts}개 허용, config.js optionLabels 길이 기준)`);
    q.opts.forEach((o, j) => { if (!isStr(o) || !o.trim()) err(id, `opts[${j}] 비어 있음`); });
    if (!Number.isInteger(q.ans) || q.ans < 0 || q.ans >= q.opts.length) err(id, `ans=${q.ans} 범위 밖`);
    const uniq = new Set(q.opts.map((o) => String(o).trim()));
    if (uniq.size !== q.opts.length) warn(id, '같은 내용의 보기가 있음');
  }

  if (!Array.isArray(q.exp)) {
    err(id, 'exp가 배열이 아님 (해설 없으면 [])');
  } else {
    if (q.exp.length === 0) warn(id, '해설 없음');
    q.exp.forEach((e, j) => {
      if (!e || (e.t !== 'html' && e.t !== 'img') || !isStr(e.v)) return err(id, `exp[${j}] 형식 오류 ({t:'html'|'img', v:string})`);
      if (e.t === 'img' && !fs.existsSync(path.join(dataDir, e.v))) err(id, `이미지 파일 없음: ${path.join(dataDir, e.v)}`);
      if (e.t === 'html' && /<script|on\w+\s*=/i.test(e.v)) err(id, `exp[${j}]에 스크립트/이벤트 속성 포함`);
    });
  }

  const text = [q.q, ...(q.opts || [])].join(' ');
  if (/�|Ã.|â€./.test(text)) warn(id, '깨진 글자 의심');
});

console.log(`문항 ${questions.length}개 검사 — 오류 ${errors.length}, 경고 ${warnings.length}`);
if (errors.length) console.log('\n[오류]\n' + errors.map((s) => '- ' + s).join('\n'));
if (warnings.length) console.log('\n[경고]\n' + warnings.slice(0, 50).map((s) => '- ' + s).join('\n') + (warnings.length > 50 ? `\n… 외 ${warnings.length - 50}건` : ''));
process.exit(errors.length ? 1 : 0);
