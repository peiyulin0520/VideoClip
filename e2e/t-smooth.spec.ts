import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, samplePreview, seekTo } from './helpers';

const SHOT = 'docs/screenshots/feedback-9/t-smooth';

async function setup(page: Page) {
  // 兩支 4 秒的純色影片（都沒修剪：B 入點是 0、A 用到素材最後），接縫在 4 秒；疊化 1 秒＝3.5～4.5 秒
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm']);
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 疊化' }).tap();
  await page.getByLabel('轉場長度').fill('10');
  await page.evaluate(() => window.scrollTo(0, 0));
}

test('B 的入點是 0：接縫前 0.3 秒 B 已經慢慢淡入（用第一格），不是到接縫才突然跳出來', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await seekTo(page, 3.3); // 轉場還沒開始：純紅
  await expect.poll(async () => (await samplePreview(page, 0.5, 0.5))?.[1]).toBeLessThan(10);
  await seekTo(page, 3.8); // 轉場前半：紅裡已經有綠（B 淡入 30%）
  await expect
    .poll(async () => {
      const c = await samplePreview(page, 0.5, 0.5);
      return !!c && c[0] > 100 && c[1] > 40 && c[1] < 160;
    })
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/before-seam.png` });
});

test('A 用到素材最後：接縫後 A 停在最後一格慢慢淡出（不會從頭重播或消失）', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await seekTo(page, 4.2); // 轉場後半：綠為主，還有一點紅（A 停在最後一格）
  await expect
    .poll(async () => {
      const c = await samplePreview(page, 0.5, 0.5);
      return !!c && c[1] > 150 && c[0] > 20 && c[0] < 120;
    })
    .toBe(true);
  await seekTo(page, 4.7); // 轉場結束：純綠
  await expect.poll(async () => (await samplePreview(page, 0.5, 0.5))?.[0]).toBeLessThan(10);
});

test('播放通過轉場：每支影片的 currentTime 不會突然跳回前面（A 放完不會從頭播），效能框有轉場統計', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('vc-perf', '1'));
  await setup(page);
  await seekTo(page, 3.0);
  await page.getByRole('button', { name: '播放' }).tap();
  const jumps = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const last = new Map<HTMLVideoElement, number>();
        const worst = new Map<HTMLVideoElement, number>();
        const id = setInterval(() => {
          for (const v of Array.from(document.querySelectorAll('video'))) {
            const prev = last.get(v);
            if (prev !== undefined) worst.set(v, Math.max(worst.get(v) ?? 0, prev - v.currentTime));
            last.set(v, v.currentTime);
          }
        }, 30);
        setTimeout(() => {
          clearInterval(id);
          resolve(Array.from(worst.values()));
        }, 2600);
      }),
  );
  expect(jumps.length).toBeGreaterThan(0);
  for (const j of jumps) expect(j).toBeLessThan(0.5); // 沒有任何一支「往回跳」超過 0.5 秒
  await expect(page.getByTestId('perf-overlay')).toContainText('最近轉場');
  await page.screenshot({ path: `${SHOT}/perf.png` });
});
