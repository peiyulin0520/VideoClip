import { test } from '@playwright/test';
import { createProjectWith, waitHook } from './helpers';

// 動態字卡每一式畫一張要多久（不是一般測試：要設 KINETIC_BENCH=1 才會跑；結果印在終端機）
// Chromium 軟體繪圖，不等於 iPhone；只用來找特別慢的式子（>8 ms 的要留意）。
test('動態字卡每一式的繪製時間（1080×1920）', async ({ page }) => {
  test.skip(!process.env.KINETIC_BENCH, '設 KINETIC_BENCH=1 才跑');
  test.setTimeout(300_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await waitHook(page);
  const rows = (await page.evaluate(() =>
    (
      window as unknown as {
        __videoclip: { kineticBench: (w: number, h: number) => { id: string; ms: number }[] };
      }
    ).__videoclip.kineticBench(1080, 1920),
  )) as { id: string; ms: number }[];
  rows.sort((a, b) => b.ms - a.ms);
  console.log('BENCH ' + rows.map((r) => `${r.id}=${r.ms.toFixed(1)}`).join(' '));
});
