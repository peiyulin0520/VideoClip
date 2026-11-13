import { expect, test } from '@playwright/test';
import { addOverlays, createProjectWith, openTab, seekTo, showTimeline } from './helpers';

test('圖層分頁跟著播放頭：從沒有素材的空白移到有素材的時間，清單馬上出現圖層', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await showTimeline(page);
  await openTab(page, '圖層');
  await expect(page.getByTestId('layer-list').locator('li')).toHaveCount(2);
  // 播放頭移到結尾之後的空白（總長 4 秒，捲到最右邊）
  await seekTo(page, 3.99);
  await expect(page.getByTestId('layer-list').locator('li')).toHaveCount(2);
  await seekTo(page, 0.5);
  await expect(page.getByTestId('layer-list').locator('li')).toHaveCount(2);
});

test('橫向可滑的分類膠囊列上下留空，框線不會被切掉', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '素材');
  const row = page.getByRole('tablist', { name: '貼圖分類' });
  const pb = await row.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  const pt = await row.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  expect(pb).toBeGreaterThanOrEqual(8);
  expect(pt).toBeGreaterThanOrEqual(4);
});
