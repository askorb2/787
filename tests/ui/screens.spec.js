const { test, expect } = require('@playwright/test');
const questions = require('../../data/questions.json');
const {
  shotPath,
  assertNoHorizontalScroll,
  assertBottomBarDoesNotCoverOptions,
  answerWithOutcome,
} = require('./helpers');

const IMG_EXP_ID = 'p104'; // has an image explanation AND is one of the longest-options questions
const TEXT_EXP_ID = 'p2'; // plain html explanation, no image
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
  await expect(page.locator('.counter')).toHaveText('2 / 213');
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
  await expect(page.locator('.counter')).toHaveText('2 / 213');

  await page.click('[data-action="prev"]');
  await page.click('[data-action="confirm-yes"]');
  await page.waitForSelector('.options');

  await expect(page.locator('.counter')).toHaveText('1 / 213');
  await expect(page.locator('.chip').first()).toHaveText(firstQuestionCode);
  // still shows the earlier answer (locked), not a fresh unanswered question
  await expect(page.locator('.option.correct, .option.wrong')).not.toHaveCount(0);
  await expect(page.locator('.option').first()).toHaveClass(new RegExp(firstChoiceClass.replace('option ', '')));
  await expect(page.locator('.next-btn')).toBeEnabled();

  // forward again should restore the same question 2, not reshuffle/reset it
  await page.click('[data-action="next"]');
  await page.waitForSelector('.options');
  await expect(page.locator('.counter')).toHaveText('2 / 213');
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
