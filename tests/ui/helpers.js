const fs = require('fs');
const path = require('path');

function shotPath(testInfo, name) {
  const dir = path.join('screenshots', testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

async function assertNoHorizontalScroll(page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (scrollWidth > clientWidth + 1) {
    throw new Error(`horizontal scroll detected: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
  }
}

async function assertBottomBarDoesNotCoverOptions(page) {
  // The bottom bar is position:fixed and the quiz body scrolls, so the only
  // moment overlap is actually possible is once the user has scrolled all
  // the way down — scroll there first before comparing rects.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const overlap = await page.evaluate(() => {
    const bar = document.querySelector('.bottom-bar');
    const options = Array.from(document.querySelectorAll('.option'));
    if (!bar || options.length === 0) return null;
    const barRect = bar.getBoundingClientRect();
    const last = options[options.length - 1].getBoundingClientRect();
    return { barTop: barRect.top, lastOptionBottom: last.bottom };
  });
  if (overlap && overlap.lastOptionBottom > overlap.barTop) {
    throw new Error(`bottom bar may cover last option even after scrolling to bottom: lastOptionBottom=${overlap.lastOptionBottom} barTop=${overlap.barTop}`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

// Loads a single-question session (?qid=) and clicks the exact position that
// will yield the desired outcome, using the app's test-only
// window.__b787Test.correctDisplayPos() hook. Deterministic: option order is
// reshuffled per session, so guessing-by-reload would be probabilistic.
async function answerWithOutcome(page, qid, wantCorrect) {
  await page.goto(`/index.html?qid=${qid}`);
  await page.waitForSelector('.options');
  const correctPos = await page.evaluate(() => window.__b787Test.correctDisplayPos());
  const optionCount = await page.locator('.option').count();
  const pos = wantCorrect ? correctPos : (correctPos + 1) % optionCount;
  await page.locator('.option').nth(pos).click();
  await page.waitForSelector('.option.correct, .option.wrong');
  return pos;
}

module.exports = { shotPath, assertNoHorizontalScroll, assertBottomBarDoesNotCoverOptions, answerWithOutcome };
