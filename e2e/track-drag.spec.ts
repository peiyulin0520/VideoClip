import { expect, test, type Page } from '@playwright/test';
import {
  addOverlays,
  createProjectWith,
  isBlue,
  isGreen,
  project,
  samplePreview,
  showTimeline,
  touchDrag,
} from './helpers';

const order = async (page: Page) => (await project(page)).tracks.map((t) => t.id);

async function chipCenter(page: Page, trackId: string) {
  const b = (await page
    .locator(`[data-testid="track"][data-track-id="${trackId}"] [data-testid="track-chip"]`)
    .boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('軌道圖示按住上下拖＝換圖層順序（觸控）；點一下仍開選單；主軌不能拖；一步復原', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await addOverlays(page, ['solid-blue.webm']); // 藍在最上面
  await showTimeline(page);
  const [main, green, blue] = await order(page);
  await expect.poll(async () => isBlue(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/feedback-5/track-drag-before.png' });

  // 最上面那列（藍）往下拖一列的高度 → 綠變成最上面
  const rows = await page
    .getByTestId('track')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  const from = await chipCenter(page, blue!);
  await touchDrag(page, from, { x: from.x, y: from.y + rows[0]! + 8 });
  await expect.poll(async () => (await order(page)).join(',')).toBe([main, blue, green].join(','));
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 拖完沒有跳出軌道選單
  await expect(page.getByRole('button', { name: '隱藏這條軌道' })).toHaveCount(0);
  await page.screenshot({ path: 'docs/screenshots/feedback-5/track-drag-after.png' });

  // 一步復原
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await order(page)).join(',')).toBe([main, green, blue].join(','));

  // 點一下（沒有拖）：開軌道選單
  await showTimeline(page);
  await page.getByTestId('track-chip').first().tap();
  await expect(page.getByRole('button', { name: /隱藏這條軌道|顯示這條軌道/ })).toBeVisible();
  await page.touchscreen.tap(5, 5);
});

test('軌道圖示：往上拖超過最上面、往下拖超過主軌，都夾在範圍內；主軌的圖示拖不動', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await addOverlays(page, ['solid-blue.webm']);
  await showTimeline(page);
  const [main, green, blue] = await order(page);
  // 綠（中間那列）往下拖很遠：不能跑到主軌下面
  const g = await chipCenter(page, green!);
  await touchDrag(page, g, { x: g.x, y: g.y + 300 });
  await expect.poll(async () => (await order(page))[0]).toBe(main);
  expect((await order(page)).join(',')).toBe([main, green, blue].join(',')); // 夾在最底的覆蓋層＝原位
  // 主軌圖示拖不動
  await showTimeline(page);
  const m = await chipCenter(page, main!);
  await touchDrag(page, m, { x: m.x, y: m.y - 200 });
  expect((await order(page)).join(',')).toBe([main, green, blue].join(','));
});
