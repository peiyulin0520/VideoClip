import { expect, test, type Page } from '@playwright/test';
import {
  addOverlays,
  createProjectWith,
  exportFrame,
  isGreen,
  isRed,
  openTab,
  project,
  samplePreview,
  seekTo as rawSeekTo,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-9/i7';

/** 跳到某一秒，並等播放頭真的到了（機器忙時捲動事件會晚一點，定位會打在舊的時間） */
async function seekTo(page: Page, sec: number) {
  await rawSeekTo(page, sec);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { __videoclip: { time: () => number } }).__videoclip.time(),
        ),
      { timeout: 5000 },
    )
    .toBeGreaterThan(sec - 0.15);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { __videoclip: { time: () => number } }).__videoclip.time(),
        ),
      { timeout: 5000 },
    )
    .toBeLessThan(sec + 0.15);
}
type Kf = { t: number; x: number; y: number; scale: number; adjust?: Record<string, number> };
type Ov = {
  keyframes?: Kf[];
  transform: { x: number; y: number; scale: number };
  adjust?: Record<string, number>;
};
const overlay = async (page: Page) => (await project(page)).tracks[1]!.items[0] as unknown as Ov;

async function setup(page: Page) {
  await createProjectWith(page, ['solid-red.webm']); // 紅色 4 秒
  await addOverlays(page, ['solid-green.webm']); // 綠色疊在紅色上，置中、縮小一半
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
}

test('定位：開頭按「◇ 定位」→ 換時間用 X 位置滑桿（自動多一個定位）→ 時間軸有 2 個菱形；中間時間位置在兩者之間（線性），預覽與單格輸出一致', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  await expect(page.getByTestId('kf-btn')).toBeEnabled();
  await seekTo(page, 0.02);
  await page.getByTestId('kf-btn').tap();
  await expect.poll(async () => (await overlay(page)).keyframes?.length).toBe(1);
  await expect(page.getByTestId('kf-btn')).toHaveAttribute('aria-pressed', 'true');
  expect((await overlay(page)).keyframes![0]!.x).toBeCloseTo(0.5, 2);

  // 換到 3 秒、用圖層分頁的「X 位置」往右拉到 90%：沒有再按定位，自動新增第二個
  await seekTo(page, 3);
  await openTab(page, '圖層');
  await expect(page.getByTestId('kf-panel')).toBeVisible();
  await page.getByLabel('X 位置').fill('90');
  await expect.poll(async () => (await overlay(page)).keyframes?.length).toBe(2);
  const kfs = (await overlay(page)).keyframes!;
  expect(kfs[1]!.x).toBeCloseTo(0.9, 2);
  expect(kfs[1]!.t).toBeGreaterThan(2.5);
  await expect(page.getByTestId('kf-dot')).toHaveCount(2);
  await page.screenshot({ path: `${SHOT}/two-keyframes.png` });

  // 開頭：還在中間（綠色蓋住正中央、右邊是紅色）；結尾：往右移了（右邊綠、正中央邊緣）
  await page.evaluate(() => window.scrollTo(0, 0));
  await seekTo(page, 0.02);
  await expect.poll(async () => isRed(await samplePreview(page, 0.9, 0.5))).toBe(true);
  expect(isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 中間（約一半）：中心 x≈0.7 → 方框約 0.45～0.95：0.9 是綠、0.3 是紅
  const tMid = kfs[1]!.t / 2;
  await seekTo(page, tMid);
  await expect.poll(async () => isGreen(await samplePreview(page, 0.9, 0.5))).toBe(true);
  expect(isRed(await samplePreview(page, 0.3, 0.5))).toBe(true);
  // 單格輸出同一個時間，結果一樣
  const out = await exportFrame(page, tMid, [
    [0.9, 0.5],
    [0.3, 0.5],
  ]);
  expect(isGreen(out.samples[0] as [number, number, number, number])).toBe(true);
  expect(isRed(out.samples[1] as [number, number, number, number])).toBe(true);
});

test('定位：色調漸變——第二個定位的飽和度 −100，開頭還是綠色、結尾變灰；色調滑桿也自動新增定位', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  await seekTo(page, 0.02);
  await page.getByTestId('kf-btn').tap();
  await seekTo(page, 3);
  await openTab(page, '剪輯'); // 調色在 剪輯 › 調色
  await page.getByRole('button', { name: '調色', exact: true }).tap();
  await page.getByLabel('飽和度', { exact: true }).fill('-100');
  await expect.poll(async () => (await overlay(page)).keyframes?.length).toBe(2);
  const kfs = (await overlay(page)).keyframes!;
  expect(kfs[1]!.adjust!.saturation).toBeCloseTo(-1, 2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await seekTo(page, 0.02);
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await seekTo(page, 3.2); // 最後一個定位之後：灰色（紅綠藍差不多）
  await expect
    .poll(async () => {
      const c = await samplePreview(page, 0.5, 0.5);
      return !!c && Math.abs(c[0] - c[1]) < 30 && Math.abs(c[1] - c[2]) < 30 && c[1] > 60;
    })
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/tone-gray.png` });
});

test('定位：預覽上拖物件（有定位時換時間拖，自動多一個定位）；「清除全部定位」停在這個時間的樣子；一步復原', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  await seekTo(page, 0.02);
  await page.getByTestId('kf-btn').tap();
  await seekTo(page, 2);
  await openTab(page, '圖層');
  await page.getByLabel('Y 位置').fill('80');
  await expect.poll(async () => (await overlay(page)).keyframes?.length).toBe(2);
  await expect(page.getByTestId('kf-dot')).toHaveCount(2);
  // 清除全部：定位沒了，物件停在播放頭這個時間（Y 80%）的樣子
  await page.getByTestId('kf-clear').tap();
  const o = await overlay(page);
  expect(o.keyframes).toBeUndefined();
  expect(o.transform.y).toBeCloseTo(0.8, 1);
  await expect(page.getByTestId('kf-dot')).toHaveCount(0);
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await overlay(page)).keyframes?.length).toBe(2);
});

test('定位：分割後兩段的定位接得起來；在定位的時間再按一次「◆ 定位」就刪除它', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await seekTo(page, 0.02);
  await page.getByTestId('kf-btn').tap();
  await seekTo(page, 3);
  await openTab(page, '圖層');
  await page.getByLabel('X 位置').fill('90');
  await expect.poll(async () => (await overlay(page)).keyframes?.length).toBe(2);
  // 刪除第二個：把播放頭放到那個定位上（點菱形），按 ◆
  await page.getByTestId('kf-dot').nth(1).tap();
  await expect(page.getByTestId('kf-btn')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('kf-btn').tap();
  await expect.poll(async () => (await overlay(page)).keyframes?.length).toBe(1);
});

test('版型：定位打在外框＝整組一起動（各格不用單獨打）；時間軸只有外框那一條有菱形', async ({ page }) => {
  test.setTimeout(150_000);
  const { fixture } = await import('./helpers');
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 九宮格', exact: true }).tap();
  await page.getByTestId('layout-input').setInputFiles([fixture('solid-green.webm')]);
  await expect(page.getByTestId('layout-sheet')).toHaveCount(0, { timeout: 30_000 });
  type Tr = { groupRole?: string; items: { keyframes?: Kf[]; transform: { x: number } }[] };
  const tracks = async () => (await project(page)).tracks as unknown as Tr[];
  const cellsX = async () =>
    (await tracks()).filter((t) => t.groupRole === 'cell').map((t) => t.items[0]!.transform.x);
  const before = await cellsX();
  await seekTo(page, 0.02);
  await page.getByTestId('kf-btn').tap();
  await expect
    .poll(async () => (await tracks()).find((t) => t.groupRole === 'frame')!.items[0]!.keyframes?.length)
    .toBe(1);
  await seekTo(page, 2);
  await openTab(page, '圖層');
  const cur = Number(await page.getByLabel('X 位置').inputValue());
  await page.getByLabel('X 位置').fill(String(cur + 40));
  await expect
    .poll(async () => (await tracks()).find((t) => t.groupRole === 'frame')!.items[0]!.keyframes?.length)
    .toBe(2);
  expect(await cellsX()).toEqual(before); // 各格本身的位置沒動（由外框算出來）
  await expect(page.getByTestId('kf-dot')).toHaveCount(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  // 第二個定位之後整組往右移了 0.4：左邊露出底下的紅色；開頭左邊還是格子
  await seekTo(page, 2.5);
  await expect.poll(async () => isRed(await samplePreview(page, 0.08, 0.5))).toBe(true);
  await seekTo(page, 0.02);
  await expect.poll(async () => isRed(await samplePreview(page, 0.08, 0.5))).toBe(false);
});
