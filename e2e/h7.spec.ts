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
} from './helpers';

const SHOT = 'docs/screenshots/feedback-8';
type Item = {
  crop?: { l: number; t: number; r: number; b: number };
  mask?: [number, number][];
  maskBitmap?: string;
};
const overlay = async (page: Page) => (await project(page)).tracks[1]!.items[0] as unknown as Item;

async function setup(page: Page) {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']); // 綠色疊在紅色上，置中、縮小一半
  await openTab(page, '剪輯');
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
}

/** 在裁切框上畫一條線（框的比例座標） */
async function stroke(page: Page, from: [number, number], to: [number, number]) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const fr = (await page.getByTestId('crop-frame').boundingBox())!;
  const at = (p: [number, number]) => [fr.x + fr.width * p[0], fr.y + fr.height * p[1]] as const;
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10);
  await page.mouse.up();
}

async function lassoCircle(page: Page) {
  await page.getByRole('switch', { name: '自由形狀' }).tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  const fr = (await page.getByTestId('crop-frame').boundingBox())!;
  const cx = fr.x + fr.width / 2;
  const cy = fr.y + fr.height / 2;
  const rx = fr.width * 0.45;
  const ry = fr.height * 0.45;
  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    await page.mouse.move(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  }
  await page.mouse.up();
  await expect(page.getByTestId('crop-polygon')).toBeVisible();
}

test('自由形狀圈完之後：橡皮擦擦掉中間一條（可調粗細）→ 完成後那一條透明；筆刷再補回來', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByRole('button', { name: '裁切' }).tap();
  await lassoCircle(page);

  // 橡皮擦：粗細調到 10%，在正中間橫畫一條
  await page.getByRole('switch', { name: '橡皮擦' }).tap();
  await expect(page.getByTestId('paint-bar')).toBeVisible();
  await page.getByLabel('粗細').fill('10');
  await stroke(page, [0.1, 0.5], [0.9, 0.5]);
  await expect(page.getByTestId('crop-tint')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/eraser.png` });
  await page.getByRole('button', { name: '完成' }).tap();
  const it = await overlay(page);
  expect(it.maskBitmap).toMatch(/^data:image\/png/);
  expect(it.mask).toBeUndefined(); // 點陣圖遮罩取代了多邊形
  // 中間被擦掉（露出底下的紅），上面還是綠
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
  expect(isGreen(await samplePreview(page, 0.5, 0.36))).toBe(true);
  expect(isGreen(await samplePreview(page, 0.5, 0.64))).toBe(true);

  // 再進裁切：用筆刷把中間補回來
  await page.getByRole('button', { name: '裁切' }).tap();
  await page.getByRole('switch', { name: '筆刷' }).tap();
  await page.getByLabel('粗細').fill('10');
  await stroke(page, [0.3, 0.5], [0.7, 0.5]);
  await page.getByRole('button', { name: '完成' }).tap();
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await page.screenshot({ path: `${SHOT}/brush-done.png` });

  // 一步復原：回到只有橡皮擦的那一版
  await page.getByRole('button', { name: '復原' }).tap();
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
});

test('粗細：同樣一筆，粗細不同、擦掉的範圍就不同；復原筆畫；重設去掉遮罩', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByRole('button', { name: '裁切' }).tap();
  await lassoCircle(page);
  await page.getByRole('switch', { name: '橡皮擦' }).tap();
  const tint = page.getByTestId('crop-tint');
  // 細的一筆
  await page.getByLabel('粗細').fill('2');
  await stroke(page, [0.3, 0.5], [0.7, 0.5]);
  const redCount = () =>
    tint.evaluate((c) => {
      const cv = c as HTMLCanvasElement;
      const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 20) n++;
      return n;
    });
  const thin = await redCount();
  // 粗的一筆（同一條線）
  await page.getByLabel('粗細').fill('12');
  await stroke(page, [0.3, 0.5], [0.7, 0.5]);
  const thick = await redCount();
  expect(thick).toBeGreaterThan(thin + 1000);
  // 復原筆畫：回到細的那一筆
  await page.getByRole('button', { name: '復原筆畫' }).tap();
  expect(await redCount()).toBe(thin);
  await page.getByRole('button', { name: '完成' }).tap();
  expect((await overlay(page)).maskBitmap).toBeDefined();
  // 重設：再進去按重設、完成 → 遮罩與裁切都沒了
  await page.getByRole('button', { name: '裁切' }).tap();
  await page.getByRole('button', { name: '重設' }).tap();
  await page.getByRole('button', { name: '完成' }).tap();
  const cleared = await overlay(page);
  expect(cleared.maskBitmap).toBeUndefined();
  expect(cleared.crop).toBeUndefined();
});

test('匯出：筆刷／橡皮擦畫的遮罩也套用（單格匯出中間是被擦掉露出的紅色）', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByRole('button', { name: '裁切' }).tap();
  await lassoCircle(page);
  await page.getByRole('switch', { name: '橡皮擦' }).tap();
  await page.getByLabel('粗細').fill('10');
  await stroke(page, [0.1, 0.5], [0.9, 0.5]);
  await page.getByRole('button', { name: '完成' }).tap();
  const out = await exportFrame(page, 0.5, [
    [0.5, 0.5],
    [0.5, 0.36],
  ]);
  expect(isRed(out.samples[0] as [number, number, number, number])).toBe(true);
  expect(isGreen(out.samples[1] as [number, number, number, number])).toBe(true);
});
