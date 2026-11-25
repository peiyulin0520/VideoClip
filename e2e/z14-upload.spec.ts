import { expect, test } from '@playwright/test';
import { closePanel, createProjectWith, pressPlay, samplePreview, waitHook } from './helpers';

// feedback-16 Z14：Safari 對看不到的影片 requestVideoFrameCallback 會不觸發 → 預覽停在舊畫面（卡頓）。
// 這裡把 rVFC 停掉（註冊了但永遠不呼叫）模擬，播放時預覽畫面還是要一直更新、「凍住」要是 0。
type Hook = {
  stats: () => { frozen: number; renders: number };
};

test('Z14 rVFC 不觸發時，播放中預覽畫面還是會更新', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    (
      HTMLVideoElement.prototype as unknown as { requestVideoFrameCallback: () => number }
    ).requestVideoFrameCallback = () => 1;
  });
  await createProjectWith(page, ['clip-a.webm']); // testsrc2：畫面一直在動
  await waitHook(page);
  await closePanel(page);
  await pressPlay(page);
  const seen = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 1700) {
    const cs = await Promise.all(
      [0.2, 0.4, 0.6, 0.8].flatMap((x) => [0.3, 0.5, 0.7].map((y) => samplePreview(page, x, y))),
    );
    seen.add(JSON.stringify(cs));
    await page.waitForTimeout(40);
  }
  const s = await page.evaluate(() => (window as unknown as { __videoclip: Hook }).__videoclip.stats());
  expect(seen.size, '取樣點的顏色有在變（畫面有更新）').toBeGreaterThan(4);
  expect(s.frozen, '沒有凍住').toBe(0);
});
