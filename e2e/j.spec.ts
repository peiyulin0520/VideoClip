import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, exportFrame, isRed, openTab, project, samplePreview } from './helpers';

const SHOT = 'docs/screenshots/color';
type G = { look?: { id: string; amount: number }; adjust?: Record<string, number> };
const items = async (page: Page) =>
  (await project(page)).tracks.flatMap((t) => t.items) as unknown as (G & { type: string })[];
const isGray = (c: number[] | null) =>
  !!c && Math.abs(c[0]! - c[1]!) < 25 && Math.abs(c[1]! - c[2]!) < 25 && c[0]! > 20;

async function openColor(page: Page) {
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '調色', exact: true }).tap();
  await expect(page.getByTestId('color-panel')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
}

test('調色面板：色調組合 10 張卡片（原圖＋9 種）、卡片是這個素材的畫面套上預設；黑白卡片是灰的', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm']);
  await openColor(page);
  await expect(page.getByTestId('look-card')).toHaveCount(10);
  const pix = (look: string) =>
    page
      .locator(`[data-testid="look-card"][data-look="${look}"] canvas`)
      .evaluate((c) =>
        Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(24, 24, 1, 1).data),
      );
  await expect.poll(async () => isRed((await pix('none')) as [number, number, number, number])).toBe(true); // 原圖：紅色
  await expect.poll(async () => isGray(await pix('bw'))).toBe(true); // 黑白：灰
  const cool = await pix('cool');
  const warm = await pix('warm');
  expect(cool[2]!).toBeGreaterThan(warm[2]!); // 冷色調的藍比暖色調多
  await page.screenshot({ path: `${SHOT}/panel.png`, fullPage: true });
});

test('選「黑白」→ 預覽變灰、look 寫進專案；強度 0 回到原色；強度 50 介於中間；單格輸出一致；時間軸片段有「調」', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm']);
  await openColor(page);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await page.getByRole('radio', { name: '色調 黑白' }).tap();
  expect((await items(page))[0]!.look).toEqual({ id: 'bw', amount: 1 });
  await expect.poll(async () => isGray(await samplePreview(page, 0.5, 0.5))).toBe(true);
  const out = await exportFrame(page, 0.5, [[0.5, 0.5]]);
  expect(isGray(out.samples[0]!)).toBe(true); // 單格輸出跟預覽一樣
  await page.getByLabel('強度').fill('50');
  await expect
    .poll(async () => {
      const c = await samplePreview(page, 0.5, 0.5);
      return !!c && c[0] > c[1] + 40 && c[0] < 255 && c[1] > 10; // 紅，但沒那麼紅（飽和度減半）
    })
    .toBe(true);
  await page.getByLabel('強度').fill('0');
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await page.screenshot({ path: `${SHOT}/amount.png` });
});

test('調整滑桿疊在色調組合之上；曝光預覽與單格輸出一樣；「按住看原圖」暫時不調色；全部歸零', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm']);
  await openColor(page);
  await page.getByRole('radio', { name: '色調 黑白' }).tap();
  await expect.poll(async () => isGray(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 手動：飽和度 +100（預設 −100 → 手動 +100 相加＝0，回到原色）
  await page.getByLabel('飽和度', { exact: true }).fill('100');
  expect((await items(page))[0]!.adjust!.saturation).toBeCloseTo(1, 2);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await page.getByLabel('飽和度', { exact: true }).fill('0');
  await expect.poll(async () => isGray(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 曝光 −50：變暗；預覽與單格輸出同一點接近
  await page.getByLabel('曝光', { exact: true }).fill('-50');
  const prev = await samplePreview(page, 0.5, 0.5);
  const out = await exportFrame(page, 0.5, [[0.5, 0.5]]);
  expect(Math.abs(prev![0]! - out.samples[0]![0]!)).toBeLessThan(12);
  // 按住看原圖：回到紅色；放開恢復
  const peek = (await page.getByTestId('grade-peek').boundingBox())!;
  await page.mouse.move(peek.x + peek.width / 2, peek.y + peek.height / 2);
  await page.mouse.down();
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await page.mouse.up();
  await expect.poll(async () => isGray(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 全部歸零：look、adjust 都沒了、回到紅色
  await page.getByTestId('grade-reset').tap();
  const it = (await items(page))[0]!;
  expect(it.look).toBeUndefined();
  expect(it.adjust).toBeUndefined();
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
});

test('套用到全部同類：兩個影片都套上同一組；一步復原；時間軸片段有「調」', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm']);
  await openColor(page);
  await page.getByRole('radio', { name: '色調 復古' }).tap();
  await page.getByLabel('曝光', { exact: true }).fill('20');
  await page.getByTestId('grade-all').tap();
  const all = await items(page);
  expect(all.every((i) => i.look?.id === 'vintage')).toBe(true);
  expect(all.every((i) => (i.adjust?.exposure ?? 0) > 0.15)).toBe(true);
  await page.getByRole('button', { name: '完成' }).tap();
  await expect(page.locator('[data-testid="clip"] .clip-label').filter({ hasText: '· 調' })).toHaveCount(2);
  await page.getByRole('button', { name: '復原' }).tap();
  const after = await items(page);
  expect(after.filter((i) => i.look).length).toBe(1); // 只剩原本選的那個
});

test('字卡也能調色：文字分頁的「調色」→ 選黑白，look 寫進字卡', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByTestId('text-color-btn').tap();
  await expect(page.getByTestId('color-panel')).toBeVisible();
  await page.getByRole('radio', { name: '色調 黑白' }).tap();
  const text = (await items(page)).find((i) => i.type === 'text')!;
  expect(text.look).toEqual({ id: 'bw', amount: 1 });
});
