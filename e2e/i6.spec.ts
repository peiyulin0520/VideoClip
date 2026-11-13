import { expect, test, type Page } from '@playwright/test';
import { addOverlays, createProjectWith, openTab, samplePreview, isGreen } from './helpers';

const SHOT = 'docs/screenshots/feedback-9/i6';

async function setup(page: Page) {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await openTab(page, '剪輯');
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await page.getByRole('button', { name: '裁切' }).tap();
  await page.getByRole('switch', { name: '自由形狀' }).tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  const fr = (await page.getByTestId('crop-frame').boundingBox())!;
  const cx = fr.x + fr.width / 2;
  const cy = fr.y + fr.height / 2;
  await page.mouse.move(cx + fr.width * 0.45, cy);
  await page.mouse.down();
  for (let i = 1; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    await page.mouse.move(cx + fr.width * 0.45 * Math.cos(a), cy + fr.height * 0.45 * Math.sin(a));
  }
  await page.mouse.up();
  await expect(page.getByTestId('crop-polygon')).toBeVisible();
  await page.getByRole('switch', { name: '橡皮擦' }).tap();
  await expect(page.getByTestId('paint-bar')).toBeVisible();
}

const frame = async (page: Page) => (await page.getByTestId('crop-frame').boundingBox())!;
/** 紅色提示（被擦掉的地方）在框的比例位置有沒有顏色 */
const erasedAt = (page: Page, fx: number, fy: number) =>
  page.getByTestId('crop-tint').evaluate(
    (c, p) => {
      const cv = c as HTMLCanvasElement;
      const d = cv
        .getContext('2d')!
        .getImageData(Math.round(p[0]! * cv.width), Math.round(p[1]! * cv.height), 1, 1).data;
      return d[3]! > 20;
    },
    [fx, fy],
  );

test('距離 80px：手指在 y 畫一條線，被擦掉的是 y−80px 那一條；手指圓是白色實心、焦點圓（空心＋十字）在它上方 80px', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByLabel('粗細').fill('5');
  await expect(page.getByLabel('距離')).toHaveValue('70'); // 預設 70
  await page.getByLabel('距離').fill('80');
  const fr = await frame(page);
  const y = fr.y + fr.height * 0.8;
  await page.mouse.move(fr.x + fr.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(fr.x + fr.width * 0.35, y, { steps: 3 });
  // 兩個圓：手指圓（實心）在手指位置，焦點圓在上方 80px
  const a = (await page.getByTestId('brush-finger').boundingBox())!;
  const b = (await page.getByTestId('brush-cursor').boundingBox())!;
  expect(a.y + a.height / 2).toBeGreaterThan(b.y + b.height / 2);
  expect(a.y + a.height / 2 - (b.y + b.height / 2)).toBeGreaterThan(75);
  expect(a.y + a.height / 2 - (b.y + b.height / 2)).toBeLessThan(85);
  expect(Math.abs(a.x + a.width / 2 - (b.x + b.width / 2))).toBeLessThan(3);
  await page.screenshot({ path: `${SHOT}/two-circles.png` });
  await page.mouse.move(fr.x + fr.width * 0.75, y, { steps: 6 });
  await page.mouse.up();
  const fyFocus = 0.8 - 80 / fr.height;
  expect(await erasedAt(page, 0.5, fyFocus)).toBe(true);
  expect(await erasedAt(page, 0.5, 0.8)).toBe(false); // 手指底下沒有被擦
  expect(await erasedAt(page, 0.5, 0.2)).toBe(false);
});

test('距離 0：直接畫在手指下面；距離存在這台手機', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByLabel('粗細').fill('5');
  await page.getByLabel('距離').fill('0');
  const fr = await frame(page);
  const y = fr.y + fr.height * 0.6;
  await page.mouse.move(fr.x + fr.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(fr.x + fr.width * 0.7, y, { steps: 6 });
  await page.mouse.up();
  expect(await erasedAt(page, 0.5, 0.6)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('vc-brush-reach'))).toBe('0');
});

test('按下去先不畫：快速點一下不會留下一點；移動超過 4px 或按住 250ms 才開始畫', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByLabel('粗細').fill('8');
  await page.getByLabel('距離').fill('0');
  const fr = await frame(page);
  const x = fr.x + fr.width * 0.5;
  const y = fr.y + fr.height * 0.5;
  // 快速點一下：沒畫、也沒有可復原的筆畫
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  expect(await erasedAt(page, 0.5, 0.5)).toBe(false);
  await expect(page.getByRole('button', { name: '復原筆畫' })).toBeDisabled();
  // 按住不動 250ms 以上：開始畫（畫一個點）
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  expect(await erasedAt(page, 0.5, 0.5)).toBe(true);
  await expect(page.getByRole('button', { name: '復原筆畫' })).toBeEnabled();
  await page.screenshot({ path: `${SHOT}/hold-dot.png` });
});
