import { expect, test } from '@playwright/test';
import { clips, createProjectWith, openTab, showTimeline } from './helpers';

const SHOT = 'docs/screenshots/feedback-7/g2';

test('片段命名：剪輯分頁「命名」、時間軸顯示「序號 名稱」＋長度；連點兩下片段也能改；可復原；軌道可以改名', async ({
  page,
}) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm']);
  await showTimeline(page);
  await expect(clips(page).first()).toContainText('1 影片');
  await expect(clips(page).nth(1)).toContainText('2 影片');
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '命名', exact: true }).tap();
  await page.getByLabel('片段名稱').fill('開場・揮手');
  await page.getByRole('button', { name: '確定' }).tap();
  await expect(clips(page).first()).toContainText('1 開場・揮手');
  await expect(clips(page).first()).toContainText('2.0s');
  await page.screenshot({ path: `${SHOT}/named.png` });
  // 圖層清單（預覽右上「圖層」）也用這個名字
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: '查看圖層' }).tap();
  await expect(page.getByTestId('peek-row').first()).toContainText('開場・揮手');
  await page.getByRole('button', { name: '關閉圖層清單' }).tap();

  // 重新整理還在；再改一次名字、復原 → 回到「開場・揮手」
  await page.waitForTimeout(1300);
  await page.reload();
  await showTimeline(page);
  await expect(clips(page).first()).toContainText('1 開場・揮手');
  await clips(page).first().tap();
  await page.getByRole('button', { name: '命名', exact: true }).tap();
  await page.getByLabel('片段名稱').fill('');
  await page.getByRole('button', { name: '確定' }).tap();
  await expect(clips(page).first()).toContainText('1 影片'); // 空白＝預設名稱
  await page.getByRole('button', { name: '復原' }).tap();
  await expect(clips(page).first()).toContainText('1 開場・揮手');

  // 連點兩下片段 → 命名面板
  // 第一下選取並把播放頭移到片段開頭（時間軸跟著捲動，片段滑到播放頭位置）；第二下點在播放頭右邊一點＝還是同一個片段
  const box = (await clips(page).nth(1).boundingBox())!;
  const playhead = (await page.locator('.playhead').boundingBox())!;
  await page.touchscreen.tap(box.x + 10, box.y + box.height / 2);
  await page.waitForTimeout(120);
  await page.touchscreen.tap(playhead.x + 30, box.y + box.height / 2);
  await page.getByLabel('片段名稱').fill('蛋糕前');
  await page.getByRole('button', { name: '確定' }).tap();
  await expect(clips(page).nth(1)).toContainText('2 蛋糕前');

  // 軌道改名
  await page.getByTestId('track-chip').first().tap();
  await page.getByRole('button', { name: '改名', exact: true }).tap();
  await page.getByLabel('軌道名稱').fill('主畫面');
  await page.getByRole('button', { name: '確定' }).tap();
  await expect(page.getByRole('button', { name: '主畫面 軌道設定' })).toBeVisible();
});
