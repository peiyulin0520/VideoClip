import { expect, test, type Page } from '@playwright/test';
import {
  addOverlays,
  createProjectWith,
  isBlue,
  isGreen,
  openTab,
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

test('軌道圖示按住上下拖＝換圖層順序（觸控）；點一下仍開選單；一步復原', async ({ page }) => {
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

test('軌道圖示：往下拖超過最底、往上拖超過字卡，都夾在同一種類的範圍內（影像、字卡不互相穿插）', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await addOverlays(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增文字/ }).tap();
  await showTimeline(page);
  const [red, green, blue, text] = await order(page); // 陣列由下到上：影像 ×3、字卡
  // 綠（中間那條影像軌）往下拖很遠：最多到影像區最底（紅的下面），不會掉到音訊或別處
  const g = await chipCenter(page, green!);
  await touchDrag(page, g, { x: g.x, y: g.y + 400 });
  await expect.poll(async () => (await order(page)).join(',')).toBe([green, red, blue, text].join(','));
  // 最上面的影像軌（藍）往上拖很遠：不能跑到字卡上面
  await showTimeline(page);
  const b = await chipCenter(page, blue!);
  await touchDrag(page, b, { x: b.x, y: b.y - 400 });
  expect((await order(page)).join(',')).toBe([green, red, blue, text].join(','));
  // 字卡只有一條：拖不動
  await showTimeline(page);
  const t = await chipCenter(page, text!);
  await touchDrag(page, t, { x: t.x, y: t.y + 300 });
  expect((await order(page)).join(',')).toBe([green, red, blue, text].join(','));
});
