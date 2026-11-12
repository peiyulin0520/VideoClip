import { expect, test, type Page } from '@playwright/test';
import { addOverlays, clips, createProjectWith, fixture, openTab, project, showTimeline } from './helpers';

const SHOT = 'docs/screenshots/feedback-7/g2';
const tlHeight = async (page: Page) => (await page.locator('.timeline').boundingBox())!.height;
const tracks = (page: Page) => page.locator('[data-testid="track"]');

async function buildBusyProject(page: Page) {
  await createProjectWith(page, ['clip-a.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await addOverlays(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole('button', { name: /新增文字/ })
      .first()
      .tap();
    await page.getByLabel('文字內容').fill(`字${i}`);
  }
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.locator('[data-testid="clip"][data-kind="audio"]')).toHaveCount(1, { timeout: 20_000 });
  // 回到預設（收合）：清掉測試預設的「展開」再重新整理
  await page.waitForTimeout(1300);
  await page.evaluate(() => localStorage.setItem('vc-tl-expanded', '0'));
  await page.reload();
  await expect(page.getByTestId('timeline-scroll')).toBeVisible();
}

test('時間軸預設收合：只看最下面的影像軌＋每一類一條摘要列；按「圖層」展開全部（記住）；選取的軌道一定顯示', async ({
  page,
}) => {
  await buildBusyProject(page);
  const total = (await project(page)).tracks.length; // 影像 ×3、字卡 ×3、音訊 ×1 = 7
  expect(total).toBe(7);
  await showTimeline(page);
  // 收合：1 條軌道（影像 1）＋3 條摘要列（影像、字卡、音訊）
  await expect(tracks(page)).toHaveCount(1);
  const summaries = page.getByTestId('track-summary');
  await expect(summaries).toHaveCount(3);
  await expect(page.getByRole('button', { name: '展開字卡（3 個）' })).toBeVisible();
  await expect(page.getByRole('button', { name: '展開影像（2 個）' })).toBeVisible();
  const collapsedH = await tlHeight(page);
  await page.screenshot({ path: `${SHOT}/collapsed.png` });

  // 展開全部：7 條軌道、沒有摘要列；其他軌道高 32、最下面的影像軌 44；比收合高
  await page.getByTestId('layers-toggle').tap();
  await expect(tracks(page)).toHaveCount(7);
  await expect(summaries).toHaveCount(0);
  const heights = await tracks(page).evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().height)),
  );
  expect(heights.filter((h) => h === 32)).toHaveLength(6);
  expect(heights.filter((h) => h === 44)).toHaveLength(1);
  expect(await tlHeight(page)).toBeGreaterThan(collapsedH * 1.5);
  await page.screenshot({ path: `${SHOT}/expanded.png` });

  // 重新整理：記住展開
  await page.reload();
  await expect(tracks(page)).toHaveCount(7);

  // 收合回去，點「字卡×3」只展開字卡；點一個字卡片段選取 → 再按收合：選取的那條字卡軌還在
  await page.getByTestId('layers-toggle').tap();
  await expect(tracks(page)).toHaveCount(1);
  await page.getByRole('button', { name: '展開字卡（3 個）' }).tap();
  await expect(tracks(page)).toHaveCount(4); // 影像 1 ＋ 3 條字卡
  await expect(page.getByTestId('track-summary')).toHaveCount(2);
  const textClip = page.locator('[data-testid="clip"][data-kind="text"]').first();
  await textClip.tap();
  const selectedTrack = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="clip"][data-selected="true"]')!;
    return el.closest('[data-testid="track"]')!.getAttribute('data-track-id');
  });
  await page.getByTestId('layers-toggle').tap(); // 展開
  await page.getByTestId('layers-toggle').tap(); // 再收合
  await expect(page.locator(`[data-testid="track"][data-track-id="${selectedTrack}"]`)).toBeVisible();
});

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
