import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, finishLayout, fixture, openTab, selectFrame, showTimeline } from './helpers';

const SHOT = 'docs/screenshots/feedback-13';

async function layout(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  await showTimeline(page);
}

test('Y4 播放軸填滿播放列到功能列之間，下面不留白；收合分類後也一樣', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['clip-a.webm']);
  const gap = async () => {
    const tl = (await page.locator('.timeline').boundingBox())!;
    const bar = (await page.locator('.bottombar').boundingBox())!;
    return Math.abs(tl.y + tl.height - bar.y);
  };
  expect(await gap()).toBeLessThanOrEqual(2);
  await page.getByTestId('cat-toggle').first().tap(); // 收合「影像」
  expect(await gap()).toBeLessThanOrEqual(2);
});

test('Y4 標題列往右捲也留在左邊：分類標題、版型標題、版型裡的分類標題', async ({ page }) => {
  test.setTimeout(120_000);
  await layout(page);
  const scroller = page.getByTestId('timeline-scroll');
  await scroller.evaluate((el) => (el.scrollLeft = 500));
  await page.waitForTimeout(200);
  const view = (await scroller.boundingBox())!;
  for (const id of ['cat-head', 'group-head', 'sub-head']) {
    const heads = page.getByTestId(id);
    const n = await heads.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const b = (await heads.nth(i).locator('.head-inner').boundingBox())!;
      expect(b.x, `${id} #${i}`).toBeGreaterThanOrEqual(view.x - 1);
      expect(b.x, `${id} #${i}`).toBeLessThan(view.x + 40); // 黏在左邊，不是被捲到畫面外
    }
  }
  await page.screenshot({ path: `${SHOT}/y4-sticky-heads-390.png` });
});

test('Y4 版型的進出場特效：版型標題旁有代表字圓圈（點了到特效分頁）；選取的片段外框看得出來', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await layout(page);
  await selectFrame(page);
  await openTab(page, '特效');
  await page.getByRole('radio', { name: '進場 疊化' }).tap();
  await expect(page.getByTestId('group-fx-in')).toHaveText('溶');
  await expect(page.getByTestId('group-fx-out')).toHaveCount(0);
  await page.getByTestId('group-fx-in').tap();
  await expect(page.getByRole('radio', { name: '進場 疊化' })).toBeVisible();
  // 選取中的片段：有主題色外框＋白色內框
  const sel = page.locator('[data-testid="clip"].selected').first();
  const css = await sel.evaluate((el) => {
    const c = getComputedStyle(el);
    return { border: c.borderTopColor, shadow: c.boxShadow };
  });
  expect(css.shadow).toContain('rgb(255, 255, 255)');
  expect(css.border).not.toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({ path: `${SHOT}/y4-selected-390.png` });
});
