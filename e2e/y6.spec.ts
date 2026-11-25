import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWith,
  finishLayout,
  fixture,
  isGray,
  isGreen,
  isRed,
  openTab,
  openTool,
  project,
  samplePreview,
  seekTo,
  selectedItemId,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-13';
type It = {
  id: string;
  type: string;
  assetId?: string;
  start: number;
  duration: number;
  group?: string;
  crop?: unknown;
  look?: { id: string };
  cell?: { x: number; y: number; w: number; h: number };
};
type Tr = { id: string; groupRole?: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];
const cells = async (page: Page) => (await tracks(page)).filter((t) => t.groupRole === 'cell');
const mid = (c: { x: number; y: number; w: number; h: number }): [number, number] => [
  c.x + c.w / 2,
  c.y + c.h / 2,
];

async function twoCells(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
}

test('Y6 格子裡的影像不預先裁切（整張蓋滿格子，畫面被格子範圍遮住）', async ({ page }) => {
  test.setTimeout(120_000);
  await twoCells(page);
  for (const t of await cells(page)) for (const it of t.items) expect(it.crop).toBeUndefined();
  const c = (await cells(page))[0]!.items[0]!.cell!;
  await seekTo(page, 1);
  await expect.poll(async () => isRed(await samplePreview(page, ...mid(c)))).toBe(true);
  // 格子外面（兩格之間的框線）不會露出影像
  const c2 = (await cells(page))[1]!.items[0]!.cell!;
  const gapY = (c.y + c.h + c2.y) / 2;
  await expect.poll(async () => isRed(await samplePreview(page, c.x + c.w / 2, gapY))).toBe(false);
});

test('Y6 這一格視窗：選哪一段就換哪一段的素材（標題「換第 N 段的素材」）', async ({ page }) => {
  test.setTimeout(150_000);
  await twoCells(page);
  await openTool(page, 'layout.cells');
  await page.getByTestId('cc-open').first().tap();
  await page.getByRole('button', { name: '＋ 加素材' }).tap();
  await page.getByTestId('cell-add-file').setInputFiles(fixture('solid-green.webm'));
  await expect.poll(async () => (await cells(page))[0]!.items.length, { timeout: 30_000 }).toBe(2);
  const before = (await cells(page))[0]!.items.map((i) => i.assetId);
  const dlg = page.getByTestId('cell-sheet');
  await expect(dlg.getByText('換第 1 段的素材')).toBeVisible();
  await dlg.getByRole('button', { name: /^第 2 段/ }).tap();
  await expect(dlg.getByText('換第 2 段的素材')).toBeVisible();
  await dlg.getByRole('button', { name: '換成 solid-blue.webm' }).tap();
  await dlg.getByTestId('cell-apply').tap();
  await expect.poll(async () => (await cells(page))[0]!.items[1]!.assetId).not.toBe(before[1]);
  const after = (await cells(page))[0]!.items.map((i) => i.assetId);
  expect(after[0]).toBe(before[0]); // 第 1 段沒動
  await page.screenshot({ path: `${SHOT}/y6-replace-segment-390.png` });
});

test('Y6 各格各影像單獨調色：選到第 2 格調成黑白，第 1 格不受影響', async ({ page }) => {
  test.setTimeout(150_000);
  await twoCells(page);
  const [c1, c2] = (await cells(page)).map((t) => t.items[0]!);
  await openTool(page, 'layout.cells');
  await page.getByTestId('cc-open').nth(1).tap();
  await page.getByRole('button', { name: '關閉', exact: true }).last().tap();
  expect(await selectedItemId(page)).toBe(c2!.id);
  await openTab(page, '色調');
  await openTool(page, 'color.look');
  await page.getByRole('radio', { name: '色調 黑白' }).tap();
  const now = await cells(page);
  expect(now[1]!.items[0]!.look?.id).toBe('bw');
  expect(now[0]!.items[0]!.look).toBeUndefined();
  await seekTo(page, 1);
  await expect.poll(async () => isRed(await samplePreview(page, ...mid(c1!.cell!)))).toBe(true);
  await expect.poll(async () => isGray(await samplePreview(page, ...mid(c2!.cell!)))).toBe(true);
  expect(isGreen(await samplePreview(page, ...mid(c2!.cell!)))).toBe(false);
  await page.screenshot({ path: `${SHOT}/y6-cell-grade-390.png` });
});

test('首頁：專案卡片右上角的「⋯」看得清楚', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await page.goto('./');
  const menu = page.getByTestId('project-card').first().locator('.card-menu');
  await expect(menu).toBeVisible();
  // 「⋯」按鈕底色跟字色（主題的背景色／文字色）要有明顯差距
  const [bg, fg] = await menu.evaluate((el) => {
    const cs = getComputedStyle(el);
    return [cs.backgroundColor, cs.color];
  });
  const lum = (c: string) => {
    const n = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    return (0.2126 * n[0]! + 0.7152 * n[1]! + 0.0722 * n[2]!) / 255;
  };
  expect(Math.abs(lum(bg) - lum(fg))).toBeGreaterThan(0.5);
  await page.screenshot({ path: `${SHOT}/y6-home-menu-390.png` });
});
