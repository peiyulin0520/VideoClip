import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, isRed, openTab, project, samplePreview, seekTo } from './helpers';

const SHOT = 'docs/screenshots/feedback-9/i5';
type Fx = { kind: string; duration: number };
type It = { id: string; duration: number; inEffect?: Fx; outEffect?: Fx; transitionIn?: Fx };
const first = async (page: Page) => ((await project(page)).tracks[0] as unknown as { items: It[] }).items[0]!;
const dark = (c: number[] | null) => !!c && c[0]! < 40 && c[1]! < 40 && c[2]! < 40;

test('單一素材進場：選「捲簾放下」3 秒 → 開頭看不到、中途上半有下半沒有、之後完整；時間軸有代表字圓圈；影片照常播', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']); // 紅色 4 秒
  await clips(page).first().tap();
  await openTab(page, '特效');
  await expect(page.locator('.fx-legend .lg.seam')).toHaveText('雙影片銜接');
  await expect(page.locator('.fx-legend .lg.single')).toHaveText('單影片進出場');
  await expect(page.getByTestId('fx-part-in')).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('radio', { name: '進場 捲簾放下' }).tap();
  await page.getByLabel('進場幾秒').fill('30'); // 3.0 秒
  const it = await first(page);
  expect(it.inEffect).toMatchObject({ kind: 'rollDown' });
  expect(it.inEffect!.duration).toBeCloseTo(3, 1);

  await page.evaluate(() => window.scrollTo(0, 0));
  // 開頭：還沒放下，整個是黑的
  await seekTo(page, 0.05);
  await expect.poll(async () => dark(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 1.5 秒（p=0.5）：上半紅、下半黑
  await seekTo(page, 1.5);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.2))).toBe(true);
  await expect.poll(async () => dark(await samplePreview(page, 0.5, 0.85))).toBe(true);
  // 3.5 秒：完整
  await seekTo(page, 3.5);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.85))).toBe(true);

  // 時間軸：片段開頭有代表字「下」（沒選取＝#7F8C6A）
  const circle = page.getByTestId('fx-circle-in');
  await expect(circle).toHaveText('下');
  await page.screenshot({ path: `${SHOT}/in-effect.png` });
});

test('單一素材可以同時有進場與出場（不同特效）：出場「左移」→ 結尾往左移出去；時間軸兩個圓圈顏色跟接縫的不同', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await clips(page).first().tap();
  await openTab(page, '特效');
  await page.getByRole('radio', { name: '進場 疊化' }).tap();
  await page.getByTestId('fx-part-out').tap();
  await page.getByRole('radio', { name: '出場 左移' }).tap();
  await page.getByLabel('出場幾秒').fill('20'); // 2.0 秒：從 2 秒開始
  const it = await first(page);
  expect(it.inEffect).toMatchObject({ kind: 'dissolve' });
  expect(it.outEffect).toMatchObject({ kind: 'moveL' });
  expect(it.outEffect!.duration).toBeCloseTo(2, 1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await seekTo(page, 1.5); // 進場結束（0.8 秒），出場還沒開始
  await expect.poll(async () => isRed(await samplePreview(page, 0.9, 0.5))).toBe(true);
  await seekTo(page, 3.05); // 出場進行到一半：往左移了半個畫面 → 左半紅、右半黑
  await expect.poll(async () => isRed(await samplePreview(page, 0.2, 0.5))).toBe(true);
  await expect.poll(async () => dark(await samplePreview(page, 0.85, 0.5))).toBe(true);
  await expect(page.getByTestId('fx-circle-in')).toHaveText('溶');
  await expect(page.getByTestId('fx-circle-out')).toHaveText('左');
  // 選取中＝#1E3B2F（出場這塊正在編輯），沒選的進場＝#7F8C6A
  const bg = (id: string) => page.getByTestId(id).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg('fx-circle-out')).toBe('rgb(30, 59, 47)');
  expect(await bg('fx-circle-in')).toBe('rgb(127, 140, 106)');
  await page.screenshot({ path: `${SHOT}/in-out.png` });
  // 點進場圓圈 → 切到進場、顏色對調
  await page.getByTestId('fx-circle-in').tap();
  await expect(page.getByTestId('fx-part-in')).toHaveAttribute('aria-selected', 'true');
  expect(await bg('fx-circle-in')).toBe('rgb(30, 59, 47)');
});

test('兩段銜接的圓圈寫類型代表字：米色、選取中橘棕；影片和照片是同一類，可以互相銜接', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm', 'photo.png']);
  await expect(page.getByTestId('tr-circle')).toHaveCount(1);
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 左移' }).tap();
  const c = page.getByTestId('tr-circle');
  await expect(c).toHaveText('左');
  expect(await c.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(184, 85, 58)'); // 選取中＝橘棕
  await page.getByTestId('fx-part-in').tap(); // 切到進場：接縫的圓圈變成沒選取的米色
  expect(await c.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(234, 219, 200)');
});
