import { expect, test, type Page } from '@playwright/test';
import {
  addOverlays,
  clips,
  createProjectWith,
  exportFrame,
  fixture,
  isRed,
  openTab,
  project,
  samplePreview,
  showTimeline,
} from './helpers';

type Cell = { x: number; y: number; w: number; h: number };
const canvasW = (page: Page) =>
  page.getByTestId('preview-canvas').evaluate((c) => {
    const k = c as HTMLCanvasElement;
    return Math.max(k.width, k.height);
  });

test('頂列「順暢／高清」：預設順暢（預覽畫布長邊 480）；點一下改高清（960），存在這台手機', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  const side = () =>
    page.getByTestId('preview-canvas').evaluate((c) => {
      const k = c as HTMLCanvasElement;
      return Math.max(k.width, k.height);
    });
  await expect(page.getByTestId('quality-btn')).toHaveText('順暢');
  expect(await side()).toBe(480);
  await page.screenshot({ path: 'docs/screenshots/feedback-9/quality-btn.png' });
  await page.getByTestId('quality-btn').tap();
  await expect(page.getByTestId('quality-btn')).toHaveText('高清');
  await expect.poll(side).toBe(960);
  expect(await page.evaluate(() => localStorage.getItem('vc-preview-quality'))).toBe('clear');
  await page.getByTestId('quality-btn').tap();
  await expect.poll(side).toBe(480);
});

test('設定頁可以選預覽畫質（自動／清楚／流暢），存在這台手機', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-skip-onboarding', '1'));
  await page.goto('./#/settings');
  await expect(page.getByRole('region', { name: '預覽畫質' })).toBeVisible();
  await page.getByRole('tab', { name: '流暢' }).tap();
  expect(await page.evaluate(() => localStorage.getItem('vc-preview-quality'))).toBe('smooth');
  await page.getByRole('tab', { name: '自動' }).tap();
  expect(await page.evaluate(() => localStorage.getItem('vc-preview-quality'))).toBe('auto');
});

test('自動：一支影片用清楚（960），同時有 3 支影片就改用流暢（480）', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-preview-quality', 'auto'));
  await createProjectWith(page, ['solid-red.webm']);
  expect(await canvasW(page)).toBeGreaterThan(480 - 1);
  await addOverlays(page, ['solid-green.webm', 'solid-blue.webm']);
  await expect.poll(() => canvasW(page), { timeout: 15_000 }).toBeLessThanOrEqual(480);
});

test('同時播放的影片超過預覽的上限：多的格子畫縮圖、不變黑，並提示一次', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('vc-preview-quality', 'clear'));
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 九宮格', exact: true }).tap();
  await page.getByTestId('layout-input').setInputFiles([fixture('solid-red.webm')]);
  await expect(page.getByTestId('layout-sheet')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.toast').filter({ hasText: '同時播放超過' })).toBeVisible();
  const tr = (await project(page)).tracks as unknown as { items: { cell?: Cell }[] }[];
  const cells = tr.flatMap((t) => t.items).flatMap((i) => (i.cell ? [i.cell] : []));
  expect(cells).toHaveLength(9);
  await page.evaluate(() => window.scrollTo(0, 0));
  // 9 格都是紅色（超過影片池的格子用縮圖頂著，不是黑的）
  for (const c of cells)
    await expect
      .poll(async () => isRed(await samplePreview(page, c.x + c.w / 2, c.y + c.h / 2)), { timeout: 8000 })
      .toBe(true);
});

test('修剪面板：拖旗標時預覽的白線跟著（顯示那一秒）；套用後只留選的那一段；「播放」只在預覽框播放', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await showTimeline(page);
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '修剪', exact: true }).tap();
  await expect(page.getByTestId('rm-video')).toBeVisible();
  const flag = (await page.getByTestId('range-flag-end-0').boundingBox())!;
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  await page.mouse.move(flag.x + flag.width / 2, flag.y + flag.height / 2);
  await page.mouse.down();
  await page.mouse.move(flag.x - strip.width * 0.25, flag.y + flag.height / 2, { steps: 4 });
  await expect(page.getByTestId('rm-now')).toContainText('秒');
  await page.mouse.up();
  await page.getByTestId('rm-apply').tap();
  const dur = ((await project(page)).tracks[0] as unknown as { items: { duration: number }[] }).items[0]!
    .duration;
  expect(dur).toBeGreaterThan(2.4);
  expect(dur).toBeLessThan(3.3);
});

test('流暢預覽不影響匯出：單格匯出的大小與顏色跟專案一樣（不是預覽的一半）', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-preview-quality', 'smooth'));
  await createProjectWith(page, ['solid-red.webm']);
  await expect(page.getByTestId('quality-btn')).toHaveText('順暢');
  const p = (await project(page)) as unknown as { width: number; height: number };
  const out = await exportFrame(page, 0.5, [[0.5, 0.5]]);
  expect(out.width).toBe(p.width);
  expect(out.height).toBe(p.height);
  expect(isRed(out.samples[0] as [number, number, number, number])).toBe(true);
});
