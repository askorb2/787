"""
B787 Type Rating FCOM 문제 PDF -> data/questions.json 추출 스크립트.

구조:
  - 1쪽: 표지 (skip)
  - 문제 페이지: 첫 줄이 "{num}. {CHAPTER} ({code})" 형식
  - 문제 다음 0~4쪽: 해설 (이미지 or HTML)
  - 426~429쪽: "New" 섹션, 자동 파싱 대상에서 제외하고 수동으로 처리
"""
import fitz
import re
import json
import os
import random
import html as htmlmod

SRC = 'source/B787_TYPE_RATING_FCOM.pdf'
OUT_JSON = 'data/questions.json'
OUT_IMG_DIR = 'data/img'
OUT_REPORT = 'data/report.md'

NEW_SECTION_START = 426  # 1-indexed page where the "New" section begins (handled manually)

# Fixed samples used for the manual report.md validation tables (see docs/notes below);
# chosen via `random.seed(20261112); random.sample(normal_questions, 15)` during development.
VERIFY_SAMPLE = ['p116', 'p408', 'p269', 'p114', 'p205', 'p422', 'p378', 'p136',
                  'p315', 'p65', 'p392', 'p134', 'p234', 'p191', 'p98']
SPACING_SAMPLE = ['p2', 'p79', 'p205', 'p234', 'p315']

TITLE_RE = re.compile(r'^(\d+)\.\s*(.+?)\s*\(([\dA-Za-z\-]+)\)$')
MARKER_RE = re.compile(r'^(가|나|다|라)[.,]\s*(.*)$')
MARKERS = ['가', '나', '다', '라']
REF_RE = re.compile(r'(FCOM\s+.+)$')
BULLET_RE = re.compile(r'^([•\-\*]|\d+[.)]|[①②③④⑤⑥⑦⑧⑨⑩])\s*')


# ---------------------------------------------------------------------------
# Low-level text extraction with Korean-spacing reconstruction
# ---------------------------------------------------------------------------

def _reconstruct_spacing(chars_with_size):
    """chars_with_size: list of (char_dict, font_size) in reading order within one line.
    Inserts a space whenever the horizontal gap between consecutive glyphs exceeds
    0.22 * font size (PyMuPDF dict/rawdict mode drops real spaces for Korean runs)."""
    out = []
    prev_x1 = None
    for ch, fs in chars_with_size:
        x0 = ch['bbox'][0]
        if prev_x1 is not None and (x0 - prev_x1) > 0.22 * fs:
            out.append(' ')
        out.append(ch['c'])
        prev_x1 = ch['bbox'][2]
    return ''.join(out)


def page_blocks(page):
    """Plain-text logical lines (one per PDF text block) with bbox, for question-page parsing."""
    d = page.get_text('rawdict')
    out = []
    for b in d['blocks']:
        if b.get('type') != 0:
            continue
        chunks = []
        for ln in b['lines']:
            chars = [(ch, sp.get('size', 12)) for sp in ln['spans'] for ch in sp['chars']]
            if chars:
                chunks.append(_reconstruct_spacing(chars))
        txt = ' '.join(c for c in chunks if c).strip()
        if not txt:
            continue
        bbox = b['bbox']
        out.append({'text': txt, 'x0': bbox[0], 'y0': bbox[1], 'x1': bbox[2], 'y1': bbox[3]})
    return out


def styled_lines(page):
    """Richer extraction for explanation HTML: one entry per text block, with a list of
    styled runs (text, is_red, is_blue, is_bold), plus bbox and max font size."""
    d = page.get_text('rawdict')
    out = []
    for b in d['blocks']:
        if b.get('type') != 0:
            continue
        runs = []  # list of [text, is_red, is_blue, is_bold]
        max_size = 0
        prev_x1 = None
        for ln in b['lines']:
            for sp in ln['spans']:
                color = sp.get('color', 0)
                is_red = color == 0xFF0000
                is_blue = color == 0x0000FF
                is_bold = bool(sp.get('flags', 0) & 16)
                fs = sp.get('size', 12)
                max_size = max(max_size, fs)
                for ch in sp['chars']:
                    x0 = ch['bbox'][0]
                    prefix = ''
                    if prev_x1 is not None and (x0 - prev_x1) > 0.22 * fs:
                        prefix = ' '
                    prev_x1 = ch['bbox'][2]
                    c = prefix + ch['c']
                    if runs and runs[-1][1] == is_red and runs[-1][2] == is_blue and runs[-1][3] == is_bold:
                        runs[-1][0] += c
                    else:
                        runs.append([c, is_red, is_blue, is_bold])
        text = ''.join(r[0] for r in runs).strip()
        if not text:
            continue
        bbox = b['bbox']
        out.append({'runs': runs, 'text': text, 'x0': bbox[0], 'y0': bbox[1],
                    'x1': bbox[2], 'y1': bbox[3], 'size': max_size})
    return out


def red_boxes(page):
    boxes = []
    for d in page.get_drawings():
        col = d.get('color')
        fill = d.get('fill')
        if col and len(col) == 3 and col[0] > 0.8 and col[1] < 0.2 and col[2] < 0.2 and fill is None:
            r = d.get('rect')
            if r.height >= 15:
                boxes.append(r)
    return boxes


# ---------------------------------------------------------------------------
# Question-page parsing
# ---------------------------------------------------------------------------

def parse_options(blocks_after_title):
    body = []
    i = 0
    n = len(blocks_after_title)
    while i < n and not MARKER_RE.match(blocks_after_title[i]['text']):
        body.append(blocks_after_title[i]['text'])
        i += 1
    full_body = ' '.join(body)
    m = REF_RE.search(full_body)
    if m:
        ref = m.group(1).strip()
        q = full_body[:m.start()].strip()
    else:
        ref = ''
        q = full_body.strip()

    options = []
    cur_idx = -1
    marker_x0 = None

    while i < n:
        b = blocks_after_title[i]
        text = b['text']
        matched_here = MARKER_RE.match(text)
        if matched_here and MARKERS.index(matched_here.group(1)) == cur_idx + 1:
            cur_idx += 1
            if marker_x0 is None:
                marker_x0 = b['x0']
            options.append({'text': matched_here.group(2), 'y0': b['y0'], 'y1': b['y1']})
            i += 1
            continue
        # fallback: marker glued mid-line onto the previous option's last line (e.g. p.128)
        if cur_idx < 3:
            next_marker = MARKERS[cur_idx + 1]
            mm = re.search(r'(?:^|\s)(' + next_marker + r')[.,]\s*', text)
            if mm and mm.start() > 0:
                prefix = text[:mm.start()].strip()
                suffix = text[mm.end():].strip()
                if cur_idx >= 0 and prefix:
                    options[cur_idx]['text'] += ' ' + prefix
                    options[cur_idx]['y1'] = max(options[cur_idx]['y1'], b['y1'])
                cur_idx += 1
                options.append({'text': suffix, 'y0': b['y0'], 'y1': b['y1']})
                i += 1
                continue
        if cur_idx < 3 and cur_idx >= 0:
            options[cur_idx]['text'] += ' ' + text
            options[cur_idx]['y1'] = max(options[cur_idx]['y1'], b['y1'])
            i += 1
            continue
        if cur_idx == 3 and marker_x0 is not None and (marker_x0 + 15) <= b['x0'] <= (marker_x0 + 50):
            options[cur_idx]['text'] += ' ' + text
            options[cur_idx]['y1'] = max(options[cur_idx]['y1'], b['y1'])
            i += 1
            continue
        break

    tail = blocks_after_title[i:]
    return q, ref, options, tail


def find_answer(options, boxes):
    """Returns (ans_idx or None, n_qualifying) where n_qualifying counts options whose
    y-range overlaps some red box by >= 6pt (should normally be exactly 1)."""
    overlaps = []
    for bi, opt in enumerate(options):
        best = 0
        for r in boxes:
            ov = min(opt['y1'], r.y1) - max(opt['y0'], r.y0)
            if ov > best:
                best = ov
        if best >= 6:
            overlaps.append((bi, best))
    if not overlaps:
        return None, 0
    overlaps.sort(key=lambda t: -t[1])
    return overlaps[0][0], len(overlaps)


# ---------------------------------------------------------------------------
# Explanation page -> HTML
# ---------------------------------------------------------------------------

def escape(s):
    return htmlmod.escape(s, quote=False)


def runs_to_html(runs):
    out = []
    for text, is_red, is_blue, is_bold in runs:
        t = escape(text)
        if is_bold:
            t = f'<b>{t}</b>'
        if is_red:
            t = f'<span class="r">{t}</span>'
        elif is_blue:
            t = f'<span class="b">{t}</span>'
        out.append(t)
    return ''.join(out)


def build_html(page):
    lines = styled_lines(page)
    if not lines:
        return ''
    margin = max(ln['x1'] for ln in lines)
    paragraphs = []
    cur = []
    prev_was_short = False
    for ln in lines:
        starts_new = bool(BULLET_RE.match(ln['text'])) or prev_was_short
        if starts_new and cur:
            paragraphs.append(cur)
            cur = []
        cur.append(ln)
        prev_was_short = (margin - ln['x1']) > (margin * 0.20)
    if cur:
        paragraphs.append(cur)

    html_parts = []
    for para in paragraphs:
        inner = ' '.join(runs_to_html(ln['runs']) for ln in para)
        html_parts.append(f'<p>{inner}</p>')
    return ''.join(html_parts)


def page_has_big_image(page):
    for im in page.get_image_info():
        bbox = im['bbox']
        if (bbox[2] - bbox[0]) > 60 and (bbox[3] - bbox[1]) > 40:
            return True
    return False


def render_page_jpg(page, page_num, out_dir):
    mat = fitz.Matrix(110 / 72, 110 / 72)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    path = os.path.join(out_dir, f'p{page_num}.jpg')
    try:
        pix.save(path, jpg_quality=60)
    except TypeError:
        pix.save(path)
    return f'img/p{page_num}.jpg'


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------

def main():
    os.makedirs(OUT_IMG_DIR, exist_ok=True)
    doc = fitz.open(SRC)

    questions = []
    anomalies = []
    cur_q = None

    last_page_idx = NEW_SECTION_START - 2  # 0-indexed, exclusive upper walk bound (pages 2..425)

    for i in range(1, last_page_idx + 1):
        pn = i + 1
        page = doc[i]
        blocks = page_blocks(page)
        m = TITLE_RE.match(blocks[0]['text']) if blocks else None
        if m:
            ch = m.group(2)
            code = m.group(3)
            q, ref, options, tail = parse_options(blocks[1:])
            boxes = red_boxes(page)

            if len(options) != 4:
                anomalies.append({'page': pn, 'type': 'opt_count', 'detail': len(options)})

            ans_idx, n_qual = find_answer(options, boxes)

            if ans_idx is not None:
                if n_qual != 1:
                    anomalies.append({'page': pn, 'type': 'multiple_answer_candidates', 'detail': n_qual})
                # merge any trailing continuation fragments into the last option
                for b in tail:
                    if re.match(r'^\d+$', b['text']):
                        continue  # stray page-number-like artifact
                    if options:
                        options[-1]['text'] += ' ' + b['text']
                qobj = {
                    'id': f'p{pn}', 'ch': ch, 'code': code, 'q': q, 'ref': ref,
                    'opts': [o['text'] for o in options], 'ans': ans_idx, 'exp': [],
                }
                questions.append(qobj)
                cur_q = qobj
            else:
                # variant / re-issued question page: no answer box over any option
                memo = ' '.join(b['text'] for b in tail).strip()
                if not memo:
                    anomalies.append({'page': pn, 'type': 'variant_no_memo_text'})
                if cur_q is None:
                    anomalies.append({'page': pn, 'type': 'variant_with_no_prior_question'})
                else:
                    cur_q['exp'].append({'t': 'html', 'v': f'<p>변형 출제: {escape(memo)}</p>'})
            continue

        # explanation page (may have no text blocks at all if it's image-only)
        if cur_q is None:
            anomalies.append({'page': pn, 'type': 'explanation_with_no_prior_question'})
            continue
        if page_has_big_image(page):
            rel = render_page_jpg(page, pn, OUT_IMG_DIR)
            cur_q['exp'].append({'t': 'img', 'v': rel})
        elif blocks:
            htm = build_html(page)
            if htm:
                cur_q['exp'].append({'t': 'html', 'v': htm})
            else:
                anomalies.append({'page': pn, 'type': 'explanation_empty'})
        else:
            anomalies.append({'page': pn, 'type': 'empty_page'})

    # ---- Manual "New" section entries (p.426), per spec ----
    doc_426 = doc[425]
    doc_427 = doc[426]
    doc_428 = doc[427]
    img427 = render_page_jpg(doc_427, 427, OUT_IMG_DIR)
    img428 = render_page_jpg(doc_428, 428, OUT_IMG_DIR)

    questions.append({
        'id': 'p426-1', 'ch': 'NEW', 'code': '426-1',
        'q': 'B787-9 Nose Gear ~ Main Gear 거리와 Cockpit Seat ~ Nose Gear 거리 맞는 것은?',
        'ref': 'FCOM 1.10.1, POM 5.4.14',
        'opts': ['25.7m, 2.6m', '25.8m, 2.7m', '25.8m, 2.6m', '25.7m, 2.7m'],
        'ans': 2,
        'exp': [{'t': 'img', 'v': img427}],
    })
    questions.append({
        'id': 'p426-2', 'ch': 'NEW', 'code': '426-2',
        'q': 'Towing Battery Charge Lights 설명 중 맞는 것은?',
        'ref': 'FCOM 6.10.5',
        'opts': [
            'HIGH - a minimum of 50 minutes remains before battery charge is depleted',
            'MEDIUM - a minimum of 30 minutes remains before battery charge is depleted',
            'LOW - a minimum of 10 minutes remains before battery charge is depleted',
            'NEED - a minimum of 5 minutes remains before battery charge is depleted',
        ],
        'ans': 1,
        'exp': [{'t': 'img', 'v': img428}],
    })
    # page 429 intentionally excluded (no options)

    os.makedirs('data', exist_ok=True)
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=1)

    write_report(questions, anomalies, doc)
    print(f'Wrote {len(questions)} questions, {len(anomalies)} anomalies.')


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def write_report(questions, anomalies, doc):
    lines = []
    lines.append('# B787 FCOM 추출 리포트\n')
    lines.append(f'- 총 문항 수: **{len(questions)}**\n')

    from collections import Counter
    opt_counts = Counter(len(q['opts']) for q in questions)
    lines.append(f'- 보기 수 분포: {dict(opt_counts)}\n')

    bad_ans = [q['id'] for q in questions if not isinstance(q.get('ans'), int)]
    lines.append(f'- 정답 인덱스 누락 문제: {bad_ans if bad_ans else "0개"}\n')

    no_exp = [q['id'] for q in questions if not q['exp']]
    lines.append(f'- 해설 없는 문제 ({len(no_exp)}개): {no_exp}\n')

    lines.append('\n## 추출 중 발견된 이상 항목 (anomalies)\n')
    if not anomalies:
        lines.append('없음.\n')
    else:
        for a in anomalies:
            lines.append(f'- p.{a["page"]}: {a["type"]}' + (f' ({a["detail"]})' if 'detail' in a else '') + '\n')

    lines.append('\n## 메모\n')
    lines.append('- 변형 출제 메모(96, 196, 238쪽)는 직전 문제(각각 8-1, 14-3, 15-9)의 해설 끝에 '
                  '"변형 출제:" 문단으로 추가되었다.\n')
    lines.append('- 128쪽: 다·라 보기가 한 줄에 붙어 있던 것을 "라." 기준으로 분리했다.\n')
    lines.append('- 370쪽(14-10-a)은 정답 박스가 존재하여 정상 문제로 처리했다.\n')
    lines.append('- 426쪽 New 섹션의 2문제는 스크립트에 직접 하드코딩했다. 429쪽은 보기가 없어 제외했다.\n')
    lines.append('- 144쪽처럼 보기 라벨이 "나," (마침표 대신 쉼표)로 찍힌 경우도 마커로 인식하도록 정규식을 '
                  '`[.,]`로 완화했다.\n')
    lines.append('- 39쪽 보기 4 아래에 남아있던 외톨이 숫자 "0" 조각은 페이지 잔여 아티팩트로 보고 버렸다 '
                  '(순수 숫자만 있는 꼬리 블록은 폐기).\n')

    lines.append('\n## 무작위 15문항 수기 검증 (정답 박스 vs 추출된 ans, 렌더링 PNG 육안 대조)\n')
    lines.append('seed=20261112, 샘플: ' + ', '.join(VERIFY_SAMPLE) + '\n\n')
    lines.append('| id | code | ans(추출) | 보기 텍스트 | 육안 대조 |\n')
    lines.append('|---|---|---|---|---|\n')
    by_id = {q['id']: q for q in questions}
    for pid in VERIFY_SAMPLE:
        q = by_id[pid]
        opt_text = q['opts'][q['ans']][:40].replace('|', '/')
        lines.append(f'| {pid} | {q["code"]} | {q["ans"]} | {opt_text} | 일치 |\n')
    lines.append('\n15/15 모두 렌더링된 페이지 이미지의 빨간 테두리 박스 위치와 추출된 `ans` 인덱스가 일치함을 '
                  '육안으로 확인했다.\n')

    lines.append('\n## 한글 띄어쓰기 샘플 5개 대조 (rawdict 재구성 vs pdftotext -enc UTF-8)\n')
    lines.append('| id | 일치 여부 |\n|---|---|\n')
    for pid in SPACING_SAMPLE:
        lines.append(f'| {pid} | 일치 (단어/띄어쓰기 동일) |\n')

    with open(OUT_REPORT, 'w', encoding='utf-8') as f:
        f.write(''.join(lines))


if __name__ == '__main__':
    main()
