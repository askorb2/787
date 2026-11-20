# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

This repo converts a 429-page B787 Type Rating FCOM exam-prep PDF
(`source/B787_TYPE_RATING_FCOM.pdf`, 960×540pt slides exported to PDF) into a
JSON question bank, then (stage 2, not yet built) serves it as a static,
no-build-tool mobile quiz PWA. Work happens in two independent stages:

- **Stage 1 — extraction** (done): `scripts/extract.py` → `data/questions.json`,
  `data/img/*.jpg`, `data/report.md`.
- **Stage 2 — app** (not started): static `index.html` / `app.js` / `style.css` /
  `manifest.webmanifest` / `icon.svg` reading `data/questions.json` directly, no
  build step.

## Commands

```bash
# re-run extraction (regenerates data/questions.json, data/img/*.jpg, data/report.md)
python scripts/extract.py

# local server for manual QA of the app once it exists
python3 -m http.server
```

Notes on the Python environment on this machine: the `python3` shim under
`WindowsApps` is broken (prints garbage, exit code 49) — always invoke `python`
(3.12, the real install at `AppData/Local/Programs/Python/Python312`) instead.
`pymupdf` (imported as `fitz`) is a pip dependency, not stdlib — install with
`python -m pip install pymupdf` if missing. On this shell, Python's default
stdout codec is `cp949`, not UTF-8 — any ad-hoc debug script that prints Korean
text needs `PYTHONIOENCODING=utf-8` or it'll crash/mangle output; this does not
affect file I/O (`open(..., encoding='utf-8')` is already used everywhere in
`extract.py`).

## Stage 1 — extraction architecture (`scripts/extract.py`)

### PDF structure assumptions
- Page 1 is a cover page, skipped.
- A page is a **question page** iff its first text block matches
  `^(\d+)\.\s*(.+?)\s*\(([\dA-Za-z\-]+)\)$` → chapter name + code (e.g.
  `"1. ELECTRICAL (15-1)"`).
- Question body ends with an inline `FCOM x.y.z` reference (regex
  `(FCOM\s+.+)$`, searched across the joined body blocks) — split out into
  the `ref` field. ~1 question (p.114) has no ref at all.
- Options start with `가./나./다./라.` (occasionally a stray comma instead of
  a period, e.g. p.144 — the marker regex accepts both: `[.,]`).
- **Answer detection**: PyMuPDF `page.get_drawings()`, filtering for pure red
  stroke (`color == (1,0,0)`), no fill, height ≥ 15pt. The box's y-range is
  compared against each option's *full* y-range (union of all its wrapped
  lines, not just the first line's center) — some answer boxes wrap only an
  option's second line (e.g. p.312), so first-line-only comparison would miss
  it. Overlap ≥ 6pt ⇒ that option is the answer.

### Why text extraction doesn't use `get_text("text")` or `"dict"` directly
Both modes drop real spaces inside Korean runs. The actual approach
(`page_blocks` / `styled_lines` in `extract.py`) walks `get_text("rawdict")`
at the character level and re-inserts a space whenever the horizontal gap
between two glyphs exceeds `0.22 * font_size`. This was validated against
`pdftotext -enc UTF-8` (the normal CLI pdftotext output is correctly spaced
and was used throughout as the cross-check reference — note that plain
`pdftotext` run from this shell without `-enc UTF-8` silently drops non-ASCII
glyphs instead of mangling them, which looks deceptively like "no Korean
text on this page" if you forget the flag).

### Line/paragraph structural quirk
Each visual line in the source deck is its own separate PDF text **block**
(not grouped into paragraphs) — a side effect of how this PPT-derived PDF was
generated. `extract.py` relies on this: a block's left x0 reliably
distinguishes an option's marker line (x0 ≈ 46.8) from its wrapped
continuation lines (x0 ≈ 77.7, the hanging indent matching `"가. "`'s width).
A hand-wrapped short word that resets back to x0 ≈ 46.8 without a marker
(e.g. p.79 "한다", p.128 "있다") is still handled as plain continuation; a
marker glued mid-line onto the *previous* option's last line (p.128's
`"있다 라. 위 모두 맞다"`) is split via a secondary mid-string regex search,
only while fewer than 4 markers have been found yet (bounds the risk of a
false-positive split on incidental text).

### Exception handling implemented
- **Variant/re-issued pages** (e.g. p.96, 196, 238): title regex matches but
  no red box overlaps any option by ≥6pt ⇒ treated as a memo, not a new
  question. The trailing non-option text block is appended as a
  `"변형 출제: ..."` paragraph to the **immediately preceding** question's
  `exp` (not a separate JSON entry). p.370 (`14-10-a`) has a real answer box
  despite the `-a` suffix, so it's correctly kept as a normal question — the
  overlap check, not the code suffix, decides this.
- **p.426–429 "New" section**: different visual format (◆ bullets, no red
  box) — the title regex doesn't match `"New"`, so this range is walked
  separately and the two p.426 questions are hardcoded directly in
  `main()` (ids `p426-1`, `p426-2`), with their explanations pointing at
  rendered `img/p427.jpg` / `img/p428.jpg`. p.429 has no options and is
  skipped entirely.
- Stray single-digit artifacts trailing an option block (e.g. a leftover "0"
  on p.39) are discarded rather than appended to option text.

### Explanation pages
A non-question page between two question pages belongs to the preceding
question. If it contains an image larger than 60×40pt, the **whole page** is
rendered to `data/img/p{page}.jpg` at 110dpi / JPEG quality 60 and recorded
as `{"t":"img","v":"img/p{page}.jpg"}`. Otherwise its text is converted to
HTML (`{"t":"html","v":"..."}`): color 0xFF0000 → `<span class="r">`, color
0x0000FF → `<span class="b">`, bold flag → `<b>`. Paragraphs are grouped
line-by-line: a line starting a new paragraph is one that is itself a
bullet/numbered line, or the line immediately after one whose right edge
ended well short of the page's own text margin (i.e., the previous line was
short enough that it must have been the end of a paragraph, not a forced
wrap).

### JSON schema (one question)
```json
{ "id": "p{page}", "ch": "ELECTRICAL", "code": "15-1", "q": "...",
  "ref": "FCOM 1.40.1", "opts": ["...", "...", "...", "..."], "ans": 2,
  "exp": [{"t":"html","v":"<p>...</p>"} | {"t":"img","v":"img/p5.jpg"}] }
```
`id` (page-based) is the only field guaranteed unique — `code` is **not**
globally unique (different chapters legitimately reuse the same code string,
e.g. `14-7` appears under both FUEL and GENERAL/DOORS).

## Reusing the app for a different question bank

The app is question-bank-agnostic: everything quiz-specific lives in
`config.js` (title, `storageKey`, `cachePrefix`, `optionLabels`, `versions`
changelog — loaded by `index.html` *and* by `sw.js` via `importScripts`),
plus the static `manifest.webmanifest` + icon files, plus `data/`.
`scripts/extract.py` is B787-PDF-specific; a different PDF needs its own
extractor whose only contract is the JSON schema above, checked by
`node scripts/validate-questions.js` (exit 1 on errors that would break
the app; 2..`optionLabels.length` options allowed). UI tests pick their
fixture ids/counts from `data/questions.json`, so they run on any bank.
When bumping the app version, add an entry to `config.js` `versions` and
bump the numeric suffix of `CACHE_VERSION` in `sw.js`.

## Stage 2 — app spec (for whenever it's built)

Static files only (`index.html`, `app.js`, `style.css`,
`manifest.webmanifest`, `icon.svg`), no build tooling, reading
`data/questions.json` at runtime.

- **State**: single JSON blob in `localStorage["b787quiz.v1"]`:
  `stats[id] = {seen, wrong, correct, streak, last}` (`streak` = consecutive
  correct answers since the last wrong one; 오답률 = `wrong/seen`); `main =
  {round, order, pos, history, roundTally}` (one "round" = one full pass
  through `order`; `roundTally = {correct, wrong}` accumulates for the round
  currently in progress and is reset/pushed into `history` as
  `{round, correct, wrong, total}` each time `rollMainRound()` fires —
  powers the 홈 → 상세 현황 screen's per-round breakdown); `session =
  {mode, queue, pos, records, score, wrongIds}` where `mode` is
  `"main"|"wrong"|"top"|"single"` and `records[pos] = {perm, choice}` holds
  each visited position's shuffled option order and answer (`choice === null`
  until answered) so back/forward navigation never re-shuffles or re-scores;
  `favorites = {[id]: true}`; `view` persists the last-shown screen
  (`'home'|'quiz'|'result'|'wrongnote'|'favorites'|'stats'|'version'`) so a
  refresh doesn't jump back into a stale quiz/session.
- **Mode logic**: `main` reshuffles `order` (Fisher–Yates) on wraparound,
  avoiding the previous round's last question landing first in the new one;
  `wrong` selects questions with `wrong ≥ 1 && streak < 2`, weighted by
  `0.2 + 오답률` via `random**(1/weight)` descending; `top` ranks by 오답률
  desc (tie-break: more `wrong` first) and takes the top N (falls back to
  however many qualify if fewer than N); `single` replays one chosen question
  from the 오답 노트. Every answer updates `stats` regardless of mode.
- **Screens**: Home (round count, round progress bar, lifetime accuracy,
  wrong-question count, mode buttons, N-selector segment [10/20/30/50], reset
  with in-app double confirm) → Quiz (top bar: back / mode name / x of n /
  thin progress bar; card with 문제|해설 segmented tabs, the 해설 tab unlocking
  only after answering; options lock on tap with green-check/red-X feedback
  plus this question's own seen/wrong tally; sticky bottom 다음 button,
  disabled until answered, respecting `env(safe-area-inset-bottom)`) → 오답
  노트 (user-selectable sort persisted in `state.prefs.wrongSort`: `'wrong'` =
  `wrong` count desc, tie-break 오답률 desc; `'num'` = source-deck order) and
  즐겨찾기 (always source-deck order). Tapping a list entry starts a `single`
  session with `source: 'wrongnote'|'favorites'` whose queue is a snapshot of
  the whole list starting at the tapped entry (`startPos`); 다음 walks the
  list, the last entry's button becomes 목록으로, and a 목록 button / ← both
  return to that list instead of a result screen.
- **Design constraints**: 412px-wide viewport baseline, ≥16px body text,
  1.6 line-height, `overflow-wrap: anywhere` (long English FCOM sentences
  must never cause horizontal scroll), light/dark via CSS vars +
  `prefers-color-scheme`, Korean system font stack only
  (`"Pretendard", "Noto Sans KR", system-ui` — no external font requests),
  animations limited to right/wrong feedback and gated on
  `prefers-reduced-motion`. If `localStorage` is unavailable, fall back to an
  in-memory store and show a persistent "기록이 저장되지 않음" banner.
