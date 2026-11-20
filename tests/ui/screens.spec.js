const { test, expect } = require('@playwright/test');
const questions = require('../../data/questions.json');
const {
  shotPath,
  assertNoHorizontalScroll,
  assertBottomBarDoesNotCoverOptions,
  answerWithOutcome,
} = require('./helpers');

// Picked from the data rather than hardcoded so the suite runs unchanged
// against any question bank (see README: 새 문제집 만들기).
const hasImg = (q) => q.exp.some((e) => e.t === 'img');
const IMG_EXP_ID = (questions.find(hasImg) || questions[0]).id; // prefers one with an image explanation
const TEXT_EXP_ID = (questions.find((q) => !hasImg(q) && q.exp.length > 0) || questions[0]).id; // plain html explanation
const TOTAL = questions.length;
const LONGEST_OPTION_IDS = questions
  .map((q) => ({ id: q.id, len: q.opts.reduce((a, o) => a + o.length, 0) }))
  .sort((a, b) => b.len - a.len)
  .slice(0, 5)
  .map((q) => q.id);
const IMG_EXP_IDS = questions.filter((q) => q.exp.some((e) => e.t === 'img')).map((q) => q.id);

test('홈 화면', async ({ page }, testInfo) => {
  await page.goto('/index.html');
  await page.waitForSelector('.home');
  await assertNoHorizontalScroll(page);
  await expect(page.locator('.mode-btn')).not.toHaveCount(0);
  await page.screenshot({ path: shotPath(testInfo, '01-home.png'), fullPage: true });
});

test('문제 화면 - 답하기 전', async ({ page }, testInfo) => {
  await page.goto(`/index.html?qid=${IMG_EXP_ID}`);
  await page.waitForSelector('.options');
  await expect(page.locator('.next-btn')).toBeDisabled();
  await expect(page.locator('[data-tab="exp"]')).toBeDisabled();
  await assertNoHorizontalScroll(page);
  await assertBottomBarDoesNotCoverOptions(page);
  await page.screenshot({ path: shotPath(testInfo, '02-quiz-unanswered.png') });
});

test('문제 화면 - 정답 선택', async ({ page }, testInfo) => {
  await answerWithOutcome(page, IMG_EXP_ID, true);
  await expect(page.locator('.option.correct')).toHaveCount(1);
  await expect(page.locator('.option.wrong')).toHaveCount(0);
  await expect(page.locator('.next-btn')).toBeEnabled();
  await assertNoHorizontalScroll(page);
  await page.screenshot({ path: shotPath(testInfo, '03-quiz-correct.png') });
});

test('문제 화면 - 오답 선택', async ({ page }, testInfo) => {
  await answerWithOutcome(page, IMG_EXP_ID, false);
  await expect(page.locator('.option.correct')).toHaveCount(1);
  await expect(page.locator('.option.wrong')).toHaveCount(1);
  await assertNoHorizontalScroll(page);
  await page.screenshot({ path: shotPath(testInfo, '04-quiz-wrong.png') });
});

test('해설 탭 - 텍스트', async ({ page }, testInfo) => {
  await answerWithOutcome(page, TEXT_EXP_ID, true);
  await page.click('[data-tab="exp"]');
  await expect(page.locator('.exp-html')).not.toHaveCount(0);
  await assertNoHorizontalScroll(page);
  await page.screenshot({ path: shotPath(testInfo, '05-exp-text.png') });
});

test('해설 탭 - 이미지', async ({ page }, testInfo) => {
  await answerWithOutcome(page, IMG_EXP_ID, true);
  await page.click('[data-tab="exp"]');
  await expect(page.locator('.exp-img')).not.toHaveCount(0);
  await assertNoHorizontalScroll(page);
  await page.screenshot({ path: shotPath(testInfo, '06-exp-image.png') });
});

test('이미지 뷰어 (전체화면)', async ({ page }, testInfo) => {
  await answerWithOutcome(page, IMG_EXP_ID, true);
  await page.click('[data-tab="exp"]');
  await page.click('.exp-img');
  await expect(page.locator('#viewer')).toBeVisible();
  await page.screenshot({ path: shotPath(testInfo, '07-viewer.png') });
  await page.click('#viewerClose');
  await expect(page.locator('#viewer')).toBeHidden();
});

test('오답 노트', async ({ page }, testInfo) => {
  await answerWithOutcome(page, IMG_EXP_ID, false);
  await page.click('[data-action="back"]'); // goHome(): clears the in-progress session, unlike a raw reload
  await page.waitForSelector('.home');
  await page.click('[data-action="open-wrongnote"]');
  await page.waitForSelector('.wrongnote-list, .wrongnote-empty');
  await expect(page.locator('.wrongnote-item')).not.toHaveCount(0);
  await assertNoHorizontalScroll(page);
  await page.screenshot({ path: shotPath(testInfo, '08-wrongnote.png') });
});

test('결과 화면', async ({ page }, testInfo) => {
  await answerWithOutcome(page, TEXT_EXP_ID, true); // single-question session -> next finishes it
  await page.click('[data-action="next"]');
  await page.waitForSelector('.result');
  await expect(page.locator('.score')).toContainText('1');
  await assertNoHorizontalScroll(page);
  await page.screenshot({ path: shotPath(testInfo, '09-result.png') });
});

test('메인 모드: 홈에 나갔다가 다시 들어와도 전체 진행률(분모)이 줄어들지 않는다', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('.home');
  await page.click('[data-action="start-main"]');
  await page.waitForSelector('.options');
  const total = (await page.locator('.counter').innerText()).split('/')[1].trim();

  for (let i = 0; i < 2; i++) {
    await page.locator('.option').first().click();
    await page.waitForSelector('.option.correct, .option.wrong');
    await page.click('[data-action="next"]');
    await page.waitForSelector('.options');
  }
  const counterBefore = await page.locator('.counter').innerText();

  await page.click('[data-action="back"]');
  await page.waitForSelector('.home');
  await page.click('[data-action="start-main"]');
  await page.waitForSelector('.options');
  const counterAfter = await page.locator('.counter').innerText();

  expect(counterAfter).toBe(counterBefore);
  expect(counterAfter.split('/')[1].trim()).toBe(total);
});

test('오답 모드: 홈에 나갔다가 다시 들어오면 같은 문항수/위치로 이어진다', async ({ page }) => {
  await answerWithOutcome(page, TEXT_EXP_ID, false); // make sure at least one question is wrong-eligible
  await page.click('[data-action="back"]'); // goHome(): leaves the single-session in place but switches the view
  await page.waitForSelector('.home');

  await page.click('[data-action="start-wrong"]');
  await page.waitForSelector('.options');
  const total = (await page.locator('.counter').innerText()).split('/')[1].trim();
  await page.click('[data-action="back"]');
  await page.waitForSelector('.home');

  await page.click('[data-action="start-wrong"]');
  await page.waitForSelector('.options');
  const totalAfter = (await page.locator('.counter').innerText()).split('/')[1].trim();
  expect(totalAfter).toBe(total);
});

test('즐겨찾기: 별표를 누르면 채워지고, 새로고침해도 유지된다', async ({ page }) => {
  await page.goto(`/index.html?qid=${TEXT_EXP_ID}`);
  await page.waitForSelector('.star-btn');
  await expect(page.locator('.star-btn')).not.toHaveClass(/active/);
  await expect(page.locator('.star-btn')).toHaveText('☆');

  await page.click('.star-btn');
  await expect(page.locator('.star-btn')).toHaveClass(/active/);
  await expect(page.locator('.star-btn')).toHaveText('★');

  await page.reload();
  await page.waitForSelector('.star-btn');
  await expect(page.locator('.star-btn')).toHaveClass(/active/);

  await page.click('.star-btn');
  await expect(page.locator('.star-btn')).not.toHaveClass(/active/);
});

test('이전 버튼: 확인 메시지가 뜨고, 아니오를 누르면 그대로 유지된다', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('.home');
  await page.click('[data-action="start-main"]');
  await page.waitForSelector('.options');
  await expect(page.locator('.prev-btn')).toHaveCount(0); // first question: nothing to go back to

  await page.locator('.option').first().click();
  await page.waitForSelector('.option.correct, .option.wrong');
  await page.click('[data-action="next"]');
  await page.waitForSelector('.options');
  await expect(page.locator('.prev-btn')).toHaveCount(1); // now on question 2

  await page.click('[data-action="prev"]');
  await expect(page.locator('.confirm-overlay')).toBeVisible();
  await expect(page.locator('.confirm-box .msg')).toHaveText('이전 문제로 돌아가시겠습니까?');

  await page.click('[data-action="confirm-no"]');
  await expect(page.locator('.confirm-overlay')).toBeHidden();
  await expect(page.locator('.counter')).toHaveText(`2 / ${TOTAL}`);
});

test('이전 버튼: 예를 누르면 직전 문제의 답변 상태 그대로 돌아간다', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('.home');
  await page.click('[data-action="start-main"]');
  await page.waitForSelector('.options');

  const firstQuestionCode = await page.locator('.chip').first().innerText();
  await page.locator('.option').first().click();
  await page.waitForSelector('.option.correct, .option.wrong');
  const firstChoiceClass = await page.locator('.option').first().getAttribute('class');

  await page.click('[data-action="next"]');
  await page.waitForSelector('.options');
  await expect(page.locator('.counter')).toHaveText(`2 / ${TOTAL}`);

  await page.click('[data-action="prev"]');
  await page.click('[data-action="confirm-yes"]');
  await page.waitForSelector('.options');

  await expect(page.locator('.counter')).toHaveText(`1 / ${TOTAL}`);
  await expect(page.locator('.chip').first()).toHaveText(firstQuestionCode);
  // still shows the earlier answer (locked), not a fresh unanswered question
  await expect(page.locator('.option.correct, .option.wrong')).not.toHaveCount(0);
  await expect(page.locator('.option').first()).toHaveClass(new RegExp(firstChoiceClass.replace('option ', '')));
  await expect(page.locator('.next-btn')).toBeEnabled();

  // forward again should restore the same question 2, not reshuffle/reset it
  await page.click('[data-action="next"]');
  await page.waitForSelector('.options');
  await expect(page.locator('.counter')).toHaveText(`2 / ${TOTAL}`);
});

test('즐겨찾기 탭: 홈에서 즐겨찾기한 문제 목록을 볼 수 있고, 탭하면 그 문제로 이동한다', async ({ page }) => {
  await page.goto(`/index.html?qid=${TEXT_EXP_ID}`);
  await page.waitForSelector('.star-btn');
  await page.click('.star-btn');
  await expect(page.locator('.star-btn')).toHaveClass(/active/);

  await page.click('[data-action="back"]');
  await page.waitForSelector('.home');
  await expect(page.locator('[data-action="open-favorites"]')).toContainText('1개');

  await page.click('[data-action="open-favorites"]');
  await page.waitForSelector('.wrongnote-list, .wrongnote-empty');
  await expect(page.locator('.wrongnote-item')).toHaveCount(1);

  await page.click('.wrongnote-item');
  await page.waitForSelector('.options');
  await expect(page.locator('.star-btn')).toHaveClass(/active/);
});

test('내보내기→초기화→가져오기 후 즐겨찾기가 유지된다', async ({ page }) => {
  await page.goto(`/index.html?qid=${TEXT_EXP_ID}`);
  await page.waitForSelector('.star-btn');
  await page.click('.star-btn');
  await page.click('[data-action="back"]');
  await page.waitForSelector('.home');
  await expect(page.locator('[data-action="open-favorites"]')).toContainText('1개');

  await page.click('[data-action="export"]');
  const exported = await page.locator('[data-role="export-text"]').inputValue();
  expect(JSON.parse(exported).favorites).toEqual({ [TEXT_EXP_ID]: true });

  // 초기화 (이중 확인)
  await page.click('[data-action="reset"]');
  await page.click('[data-action="reset"]');
  await page.waitForSelector('.home');
  await expect(page.locator('[data-action="open-favorites"]')).not.toContainText('1개');

  await page.click('[data-action="import"]');
  await page.fill('#importText', exported);
  await page.click('[data-action="confirm-import"]');
  await page.waitForSelector('.home');
  await expect(page.locator('[data-action="open-favorites"]')).toContainText('1개');

  // 새로고침 후에도 유지
  await page.goto('/index.html');
  await page.waitForSelector('.home');
  await expect(page.locator('[data-action="open-favorites"]')).toContainText('1개');
  await page.click('[data-action="open-favorites"]');
  await expect(page.locator('.wrongnote-item')).toHaveCount(1);
});

test('즐겨찾기 없는 예전 내보내기 파일도 오류 없이 가져온다', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('.home');
  const legacy = JSON.stringify({ stats: { [TEXT_EXP_ID]: { seen: 2, wrong: 1, correct: 1, streak: 1, last: 1 } }, main: null });
  await page.click('[data-action="import"]');
  await page.fill('#importText', legacy);
  await page.click('[data-action="confirm-import"]');
  await page.waitForSelector('.home');
  await expect(page.locator('#importText')).toHaveCount(0); // panel closed = success
  await page.click('[data-action="open-wrongnote"]');
  await expect(page.locator('.wrongnote-item')).toHaveCount(1);
});

test('오답 노트: 틀린 횟수 많은 순, 같으면 오답률 높은 순', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('.home');
  const st = (seen, wrong) => ({ seen, wrong, correct: seen - wrong, streak: 0, last: 1 });
  const ids = questions.slice(0, 3).map((q) => q.id);
  // A: 1/1 (100%), B: 3/10 (30%), C: 3/4 (75%) → 기대 순서 C, B, A
  const stats = { [ids[0]]: st(1, 1), [ids[1]]: st(10, 3), [ids[2]]: st(4, 3) };
  await page.click('[data-action="import"]');
  await page.fill('#importText', JSON.stringify({ stats, main: null }));
  await page.click('[data-action="confirm-import"]');
  await page.waitForSelector('.home');
  await page.click('[data-action="open-wrongnote"]');
  await page.waitForSelector('.wrongnote-item');
  const order = await page.locator('.wrongnote-item').evaluateAll((els) => els.map((e) => e.dataset.id));
  expect(order).toEqual([ids[2], ids[1], ids[0]]);
});

async function importState(page, payload) {
  await page.goto('/index.html');
  await page.waitForSelector('.home');
  await page.click('[data-action="import"]');
  await page.fill('#importText', JSON.stringify(payload));
  await page.click('[data-action="confirm-import"]');
  await page.waitForSelector('.home');
}

async function answerCurrent(page) {
  await page.locator('.option').first().click();
  await page.waitForSelector('.option.correct, .option.wrong');
}

test('즐겨찾기: 번호순 목록, 다음으로 이어서 풀기, 목록 버튼', async ({ page }) => {
  const ids = [questions[40].id, questions[5].id, questions[20].id];
  const favorites = Object.fromEntries(ids.map((id) => [id, true]));
  await importState(page, { stats: {}, main: null, favorites });

  await page.click('[data-action="open-favorites"]');
  await page.waitForSelector('.wrongnote-item');
  const order = await page.locator('.wrongnote-item').evaluateAll((els) => els.map((e) => e.dataset.id));
  expect(order).toEqual([questions[5].id, questions[20].id, questions[40].id]);

  // 첫 항목 → 다음 → 두 번째 항목 (단일 결과 화면이 아님)
  await page.locator('.wrongnote-item').first().click();
  await page.waitForSelector('.options');
  await expect(page.locator('.mode-name')).toHaveText('즐겨찾기');
  await expect(page.locator('.counter')).toHaveText('1 / 3');
  await expect(page.locator('[data-action="to-list"]')).toBeVisible();
  await answerCurrent(page);
  await page.click('[data-action="next"]');
  await page.waitForSelector('.options');
  await expect(page.locator('.counter')).toHaveText('2 / 3');
  await expect(page.locator('.result')).toHaveCount(0);

  // 목록 버튼 → 즐겨찾기 목록
  await page.click('[data-action="to-list"]');
  await expect(page.locator('.wrongnote-item')).toHaveCount(3);

  // 마지막 항목: 다음 버튼이 '목록으로'가 되고 누르면 목록으로 돌아감
  await page.locator('.wrongnote-item').last().click();
  await page.waitForSelector('.options');
  await expect(page.locator('.counter')).toHaveText('3 / 3');
  await expect(page.locator('[data-action="prev"]')).toHaveCount(0);
  await answerCurrent(page);
  await expect(page.locator('.next-btn')).toHaveText('목록으로');
  await page.click('[data-action="next"]');
  await expect(page.locator('.wrongnote-item')).toHaveCount(3);
});

test('오답 노트: 정렬 선택(틀린 횟수순/번호순) + 다음으로 이어서 풀기', async ({ page }) => {
  const st = (seen, wrong) => ({ seen, wrong, correct: seen - wrong, streak: 0, last: 1 });
  const a = questions[2].id, b = questions[10].id, c = questions[30].id;
  // 틀린 횟수: a=1, b=3, c=2 → 틀린 횟수순 b,c,a / 번호순 a,b,c
  await importState(page, { stats: { [a]: st(2, 1), [b]: st(5, 3), [c]: st(3, 2) }, main: null });

  await page.click('[data-action="open-wrongnote"]');
  await page.waitForSelector('.wrongnote-item');
  const getOrder = () => page.locator('.wrongnote-item').evaluateAll((els) => els.map((e) => e.dataset.id));
  expect(await getOrder()).toEqual([b, c, a]);

  await page.click('[data-sort="num"]');
  expect(await getOrder()).toEqual([a, b, c]);

  // 정렬 선택은 새로고침 후에도 유지
  await page.goto('/index.html');
  await page.waitForSelector('.wrongnote-item, .home');
  if (await page.locator('.home').count()) await page.click('[data-action="open-wrongnote"]');
  await expect(page.locator('[data-sort="num"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await getOrder()).toEqual([a, b, c]);

  await page.locator('.wrongnote-item').first().click();
  await page.waitForSelector('.options');
  await expect(page.locator('.mode-name')).toHaveText('오답 노트');
  await answerCurrent(page);
  await page.click('[data-action="next"]');
  await page.waitForSelector('.options');
  await expect(page.locator('.counter')).toHaveText('2 / 3');

  // ← 뒤로도 목록으로
  await page.click('[data-action="back"]');
  await expect(page.locator('.list-sort')).toBeVisible();
});

test('회차 표시 및 상세 현황: 홈에 현재 회차가 보이고, 클릭하면 회차별 기록을 볼 수 있다', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('.home');
  await expect(page.locator('.stat-compact-item .round')).toHaveText('1회차');

  await page.click('[data-action="start-main"]');
  await page.waitForSelector('.options');
  await page.locator('.option').first().click();
  await page.waitForSelector('.option.correct, .option.wrong');
  await page.click('[data-action="back"]');
  await page.waitForSelector('.home');

  await page.click('[data-action="open-stats"]');
  await page.waitForSelector('.stats-round-row');
  await expect(page.locator('.stats-round-row')).toHaveCount(1);
  await expect(page.locator('.stats-round-row .r-num')).toContainText('1회차');
  await expect(page.locator('.stats-round-row .r-detail')).toContainText('1문항');

  await page.click('[data-action="back"]');
  await page.waitForSelector('.home');
});

test('버전 탭: 홈에서 버전 히스토리를 볼 수 있다', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForSelector('.home');
  const versionLabel = await page.locator('.version-pill').innerText();
  expect(versionLabel).toMatch(/^v\d+\.\d+$/);

  await page.click('[data-action="open-version"]');
  await page.waitForSelector('.version-row');
  await expect(page.locator('.version-row')).not.toHaveCount(0);
  await expect(page.locator('.version-row .v-num').first()).toHaveText(versionLabel);

  await page.click('[data-action="back"]');
  await page.waitForSelector('.home');
});

test.describe('레이아웃 점검: 보기 텍스트가 가장 긴 상위 5문항', () => {
  for (const id of LONGEST_OPTION_IDS) {
    test(`긴 보기 레이아웃 - ${id}`, async ({ page }) => {
      await page.goto(`/index.html?qid=${id}`);
      await page.waitForSelector('.options');
      await expect(page.locator('.option')).toHaveCount(4);
      await assertNoHorizontalScroll(page);
      await assertBottomBarDoesNotCoverOptions(page);
      await page.click('.option >> nth=0');
      await page.waitForSelector('.option.correct, .option.wrong');
      await assertNoHorizontalScroll(page);
    });
  }
});

test.describe('레이아웃 점검: 해설 이미지가 있는 모든 문항', () => {
  for (const id of IMG_EXP_IDS) {
    test(`해설 이미지 레이아웃 - ${id}`, async ({ page }) => {
      await page.goto(`/index.html?qid=${id}`);
      await page.waitForSelector('.options');
      await page.click('.option >> nth=0');
      await page.waitForSelector('.option.correct, .option.wrong');
      await page.click('[data-tab="exp"]');
      const img = page.locator('.exp-img').first();
      await expect(img).toHaveCount(1);
      await img.evaluate((el) => (el.complete ? Promise.resolve() : new Promise((res, rej) => {
        el.addEventListener('load', res, { once: true });
        el.addEventListener('error', rej, { once: true });
      })));
      const naturalWidth = await img.evaluate((el) => el.naturalWidth);
      expect(naturalWidth).toBeGreaterThan(0); // image actually loaded (not broken src)
      await assertNoHorizontalScroll(page);
    });
  }
});
