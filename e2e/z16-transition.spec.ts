import { expect, test } from '@playwright/test';
import { closePanel, createProjectWith, pressPlay, samplePreview, seekTo, waitHook } from './helpers';

// feedback-16 Z16：轉場時不空白。用「讓影片一段時間 readyState 回報還沒準備好」模擬 iPhone 上後一段（B）晚到：
// 轉場中接縫那一格不能是黑的（B 還沒畫面時用縮圖頂著）。各種前後分配、長度都要過。
type Hook = {
  setSeam: (d: number, b?: number, a?: number) => void;
  time: () => number;
  stats: () => { transition: { hardSeeks: number } };
};
const CASES: [string, number, number | undefined, number | undefined][] = [
  ['各一半 1 秒', 1, undefined, undefined],
  ['全在前段 1 秒', 1, 1, 0],
  ['全在後段 1 秒', 1, 0, 1],
  ['前 0.5 後 1.5', 2, 0.5, 1.5],
  ['很短 0.4 秒', 0.4, undefined, undefined],
];
for (const [name, d, before, after] of CASES)
  test(`Z16 B 晚到時轉場不黑：${name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      const w = window as unknown as { __notReadyFrom: number; __notReadyUntil: number };
      w.__notReadyFrom = 0;
      w.__notReadyUntil = 0;
      const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState')!;
      Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
        get() {
          const n = performance.now();
          return n >= w.__notReadyFrom && n < w.__notReadyUntil ? 1 : desc.get!.call(this);
        },
      });
    });
    await createProjectWith(page, ['solid-red.webm', 'solid-green.webm']);
    await waitHook(page);
    await page.evaluate(
      ([dd, b, a]) =>
        (window as unknown as { __videoclip: Hook }).__videoclip.setSeam(
          dd as number,
          b as number | undefined,
          a as number | undefined,
        ),
      [d, before, after],
    );
    await closePanel(page);
    const cut = 4; // 兩段各 4 秒
    const b0 = before ?? d / 2;
    await seekTo(page, cut - b0 - 1.5);
    await page.waitForTimeout(600);
    // 轉場開始前 0.2 秒起，影片「還沒準備好」1.5 秒
    await page.evaluate(
      (ms) => {
        const w = window as unknown as { __notReadyFrom: number; __notReadyUntil: number };
        w.__notReadyFrom = performance.now() + ms;
        w.__notReadyUntil = w.__notReadyFrom + 1500;
      },
      (1.5 - 0.2) * 1000,
    );
    await pressPlay(page);
    const bad: string[] = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 3600) {
      const [c, time] = await Promise.all([
        samplePreview(page, 0.5, 0.5),
        page.evaluate(() => (window as unknown as { __videoclip: Hook }).__videoclip.time()),
      ]);
      // 疊化：進度 p 時應該有 p 的綠（後一段）；後一段沒畫面就只剩前一段淡出（綠＝0、或整個黑）
      const p = (time - (cut - b0)) / d;
      if (c && p > 0.3 && p < 0.9 && c[1] < 255 * p * 0.5)
        bad.push(`${time.toFixed(2)} p=${p.toFixed(2)} ${JSON.stringify(c)}`);
      await page.waitForTimeout(50);
    }
    expect(bad, '轉場中後一段（綠）要有畫面').toEqual([]);
  });
