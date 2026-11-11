import { expect, test } from '@playwright/test';
import { clips, createProjectWith, fixture, project } from './helpers';

const SHOT = 'docs/screenshots/fix-safe-zone';

const thumbsOf = async (page: import('@playwright/test').Page) =>
  (await project(page)) as unknown as { assets: { name: string; thumbs: string[] }[] };

test('一般情況：匯入後時間軸有縮圖（不顯示檔名）', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']);
  // 機器忙的時候縮圖可能晚一點才到（匯入先放行、播放器補圖），所以用輪詢
  await expect
    .poll(async () => (await thumbsOf(page)).assets[0]!.thumbs[0] ?? '', { timeout: 15_000 })
    .toMatch(/^data:image\/jpeg/);
  await expect(page.getByTestId('clip-name')).toHaveCount(0);
});

test('模擬 iPhone：解碼器不能用、<video> 不觸發 loadeddata → 先顯示檔名，播放器拿到畫面後補上縮圖', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Mediabunny 沒有 WebCodecs 可用
    delete (window as unknown as { VideoDecoder?: unknown }).VideoDecoder;
    // 匯入時用的隱藏 <video>（不是預覽的影片池）聽不到 loadeddata（模擬 iOS 沒有手勢時不載入畫面）
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest: unknown[]) {
      if (
        type === 'loadeddata' &&
        this instanceof HTMLVideoElement &&
        !this.hasAttribute('webkit-playsinline')
      )
        return;
      return (orig as (...a: unknown[]) => void).call(this, type, ...rest);
    } as typeof orig;
  });
  test.setTimeout(60_000);
  // 匯入會先等 <video> 8 秒才放棄，所以等待時間要拉長（不用 createProjectWith）
  await page.addInitScript(() => {
    localStorage.setItem('vc-debug', '1');
    localStorage.setItem('vc-skip-onboarding', '1');
  });
  await page.goto('./');
  await page.getByRole('button', { name: '新增專案' }).tap();
  await page.getByTestId('new-project-files').setInputFiles(fixture('clip-a.webm'));
  await expect(page).toHaveURL(/#\/p\//, { timeout: 30_000 });
  await expect(clips(page)).toHaveCount(1, { timeout: 20_000 });
  // 補縮圖：播放器第一次畫出這支影片後，素材會有縮圖，時間軸不再顯示檔名
  await expect
    .poll(async () => (await thumbsOf(page)).assets[0]!.thumbs.length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  await expect(page.getByTestId('clip-name')).toHaveCount(0);
  await expect(clips(page)).toHaveCount(1);
  await page.screenshot({ path: `${SHOT}/after-thumb-fallback.png` });

  // 補上的縮圖有存起來：等自動儲存後重新整理仍然在
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(clips(page)).toHaveCount(1, { timeout: 20_000 });
  expect((await thumbsOf(page)).assets[0]!.thumbs.length).toBeGreaterThan(0);
});
