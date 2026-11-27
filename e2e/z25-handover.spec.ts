import { expect, test } from '@playwright/test';
import { closePanel, createProjectWith, pressPlay, samplePreview, seekTo, waitHook } from './helpers';

// feedback-17 Z25：轉場畫面（預先解好的 ImageBitmap）直接當貼圖，顏色要對；轉場前後換手時不黑、不跳、換回影片時時間對得上。
type Hook = {
  setSeam: (d: number, b?: number, a?: number) => void;
  time: () => number;
  framesState: () => { ready: number; total: number };
  stats: () => { transition: { handCached: number; handBack: number; handDiff: number; cached: number } };
};
const hook = <T>(page: import('@playwright/test').Page, f: (h: Hook) => T) =>
  page.evaluate(
    (src) =>
      new Function('h', `return (${src})(h)`)((window as unknown as { __videoclip: Hook }).__videoclip),
    f.toString(),
  );

async function setup(page: import('@playwright/test').Page) {
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
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm']); // 各 4 秒
  await waitHook(page);
  await hook(page, (h) => h.setSeam(1)); // 疊化 1 秒、置中：3.5–4.5
  await closePanel(page);
  await expect
    .poll(() => hook(page, (h) => h.framesState().ready), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
}

test('Z25 預解圖直接當貼圖：疊化中間是紅綠混色、不黑；轉場後換手時間對得上', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await seekTo(page, 2.8);
  await page.waitForTimeout(500);
  await pressPlay(page);
  const mixed: string[] = [];
  const black: string[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 3200) {
    const [c, time] = await Promise.all([samplePreview(page, 0.5, 0.5), hook(page, (h) => h.time())]);
    const p = time - 3.5;
    if (c && p > 0.35 && p < 0.65 && c[0] > 60 && c[1] > 60) mixed.push(time.toFixed(2));
    if (c && p > 0.1 && p < 0.9 && c[0] < 30 && c[1] < 30 && c[2] < 30)
      black.push(`${time.toFixed(2)} ${JSON.stringify(c)}`);
    await page.waitForTimeout(40);
  }
  expect(black, '轉場中不能黑').toEqual([]);
  expect(mixed.length, '疊化中間要有紅綠混色').toBeGreaterThan(0);
  const s = await hook(page, (h) => h.stats().transition);
  expect(s.cached, '轉場用了預解圖').toBeGreaterThan(5);
  expect(s.handDiff, '換回影片時兩邊差不到 3 格').toBeLessThanOrEqual(0.105);
});

test('Z25 轉場後 B 的影片還沒準備好：換手範圍裡繼續用預解圖（不黑、不露出下面）', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await seekTo(page, 3.0);
  await page.waitForTimeout(600);
  await pressPlay(page);
  // 轉場結束（4.5 秒）前 0.2 秒起，影片「還沒準備好」0.8 秒
  await page.evaluate(() => {
    const w = window as unknown as { __notReadyFrom: number; __notReadyUntil: number };
    w.__notReadyFrom = performance.now() + 1300;
    w.__notReadyUntil = w.__notReadyFrom + 800;
  });
  const bad: string[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    const [c, time] = await Promise.all([samplePreview(page, 0.5, 0.5), hook(page, (h) => h.time())]);
    if (c && time > 4.6 && time < 5.6 && !(c[1] > 200 && c[0] < 70))
      bad.push(`${time.toFixed(2)} ${JSON.stringify(c)}`);
    await page.waitForTimeout(40);
  }
  expect(bad, '轉場後 1 秒內要一直是綠色（預解圖頂著）').toEqual([]);
  const s = await hook(page, (h) => h.stats().transition);
  expect(s.handCached, '換手範圍裡用了預解圖').toBeGreaterThan(0);
});
