import { expect, test } from '@playwright/test';
import { createProjectWith, finishLayout, fixture, openTab, pressPlay, seekTo, waitHook } from './helpers';

// feedback-15 Z13：預覽變順
// ①播放中畫面沒變（螢幕 60 格、影片只有 30 格）的那一格不重畫；②多支影片同時播放時，影片不會一直被硬 seek（聲音才不會斷）
type Hook = { stats: () => { renders: number; skipped: number; fps: number } };
test('Z13 播放中沒變的格子不重畫；多支影片同時播放不反覆 seek', async ({ page }) => {
  test.setTimeout(180_000);
  await createProjectWith(page, ['big-1080p.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('clip-a.webm'), fixture('clip-b.webm')]);
  await waitHook(page);
  await seekTo(page, 0.1);
  await page.evaluate(() => {
    const w = window as unknown as { __seeks: number };
    w.__seeks = 0;
    document.querySelectorAll('video').forEach((v) => v.addEventListener('seeking', () => w.__seeks++));
  });
  const s0 = await page.evaluate(() => (window as unknown as { __videoclip: Hook }).__videoclip.stats());
  await pressPlay(page);
  await page.waitForTimeout(2500);
  const s1 = await page.evaluate(() => (window as unknown as { __videoclip: Hook }).__videoclip.stats());
  const seeks = await page.evaluate(() => (window as unknown as { __seeks: number }).__seeks);
  await page.getByRole('button', { name: '暫停', exact: true }).tap();
  expect(s1.skipped - s0.skipped).toBeGreaterThan(10); // 有跳過沒變的格子
  expect(s1.renders - s0.renders).toBeGreaterThan(10); // 但有變的格子都畫了
  expect(seeks).toBeLessThanOrEqual(8); // 只有開始、素材放完停在最後一格那幾次；沒有一直硬 seek
});
