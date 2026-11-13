import { expect, test, type Page } from '@playwright/test';
import { addOverlays, createProjectWith, project, showTimeline } from './helpers';

type Tr = { id: string; items: { assetId: string }[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];
const assetName = async (page: Page, assetId: string) =>
  ((await project(page)).assets as unknown as { id: string; name: string }[]).find((a) => a.id === assetId)!
    .name;
const order = async (page: Page) =>
  Promise.all((await tracks(page)).map(async (t) => assetName(page, t.items[0]!.assetId)));

/** 長按軌道圖示 600ms 不動（進入多選） */
async function longPress(page: Page, i: number) {
  const b = (await page.getByTestId('track-chip').nth(i).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test('長按軌道圖示進入多選：打勾幾條 → 一起上移、一起刪除（一步復原）', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await addOverlays(page, ['solid-blue.webm']);
  await showTimeline(page);
  const names = await order(page);
  expect(names[0]).toContain('red');
  // 由上到下的圖示：藍、綠、紅（最底層）。長按紅色那條（最下面）
  await expect(page.getByTestId('track-chip')).toHaveCount(3);
  await longPress(page, 2);
  await expect(page.getByTestId('multi-bar')).toBeVisible();
  await expect(page.getByTestId('multi-count')).toHaveText('已選 1 條');
  // 長按放開後不會又開出軌道選單
  await expect(page.getByRole('button', { name: '隱藏這條軌道' })).toHaveCount(0);
  await page.getByTestId('track-chip').nth(1).tap(); // 再選綠色
  await expect(page.getByTestId('multi-count')).toHaveText('已選 2 條');
  await page.screenshot({ path: 'docs/screenshots/feedback-8/multi-select.png' });
  // 紅＋綠一起上移一格 → 藍到最下面：[藍, 紅, 綠]
  await page.getByRole('button', { name: '選到的軌道上移' }).tap();
  const after = await order(page);
  expect(after[0]).toContain('blue');
  expect(after[1]).toContain('red');
  expect(after[2]).toContain('green');
  // 整併：三條都是影像、時間重疊 → 重疊的留在原軌道，提示
  await page.getByTestId('track-chip').nth(2).tap(); // 上移後由上到下是綠、紅、藍：再把藍（最下面）也選上
  await page.getByRole('button', { name: '整併選到的軌道' }).tap();
  await expect(page.locator('.toast').filter({ hasText: '時間重疊' })).toBeVisible();
  expect((await tracks(page)).length).toBe(3);
  // 整併後選取只剩合併的那一條 → 刪除它，剩 2 條
  await expect(page.getByTestId('multi-count')).toHaveText('已選 1 條');
  await page.getByRole('button', { name: '刪除選到的軌道' }).tap();
  expect((await tracks(page)).length).toBe(2);
  await expect(page.getByTestId('multi-bar')).toHaveCount(0);
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await tracks(page)).length).toBe(3);
});

test('點一下圖示照舊開軌道選單（不會進入多選）', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await showTimeline(page);
  await page.getByTestId('track-chip').first().tap();
  await expect(page.getByRole('button', { name: /隱藏這條軌道/ })).toBeVisible();
  await expect(page.getByTestId('multi-bar')).toHaveCount(0);
});
