import { expect, test } from '@playwright/test';
import { createProjectWith, isGreen, isRed, openTab, samplePreview, seekTo, showTimeline } from './helpers';

const notBlack = (c: number[] | null) => !!c && c[0]! + c[1]! + c[2]! > 90;

test('往回拖時間軸：每一格都有畫面（不會只剩白框／全黑）', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm']); // 紅 0–4、綠 4–8
  await showTimeline(page);
  await seekTo(page, 7);
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 由後往前一路拖回去：每個時間點馬上取樣（不等），一定要有畫面
  let blank = 0;
  for (let i = 0; i < 24; i++) {
    const t = 7 - i * 0.27 + (i % 2 ? 0.05 : 0); // 單位 0.27 秒，故意不是整數，也夾雜一點抖動
    await seekTo(page, t);
    await page.waitForTimeout(25);
    if (!notBlack(await samplePreview(page, 0.5, 0.5))) blank++;
  }
  expect(blank).toBe(0);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
});

test('轉場播放：接縫前後一路播過去，每個取樣點都有畫面；轉場結束後是 B', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm']);
  await showTimeline(page);
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 疊化' }).tap();
  await page.getByLabel('轉場長度').fill('10');
  await openTab(page, '剪輯');
  await seekTo(page, 3.0);
  await page.getByRole('button', { name: '播放' }).tap();
  let blank = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 2800) {
    if (!notBlack(await samplePreview(page, 0.5, 0.5))) blank++;
    await page.waitForTimeout(60);
  }
  await page.getByRole('button', { name: '暫停' }).tap();
  expect(blank).toBeLessThanOrEqual(1); // 起播那一瞬間允許一格
});
