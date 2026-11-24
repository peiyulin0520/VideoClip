import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWith,
  finishLayout,
  fixture,
  isBlue,
  isRed,
  openLayerList,
  openTab,
  project,
  samplePreview,
  seekTo,
  selectFrame,
  showTimeline,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-13';
type It = {
  id: string;
  type: string;
  assetId?: string;
  start: number;
  duration: number;
  cell?: { x: number; y: number; w: number; h: number };
};
type Tr = {
  id: string;
  groupRole?: string;
  cellNo?: number;
  cell?: { x: number; y: number; w: number; h: number };
  items: It[];
};
const cellTracks = async (page: Page) =>
  ((await project(page)).tracks as unknown as Tr[]).filter((t) => t.groupRole === 'cell');
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

test('Y8 同一格再加一列：兩列疊在同一格、編號一樣；上面那列蓋住下面那列；圖層分頁可以上下換', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await twoCells(page);
  await showTimeline(page);
  await expect(page.getByTestId('cell-no')).toHaveText(['1', '2']);
  // 第 1 格 → 加一列
  await page.getByRole('button', { name: '第 1 格 軌道' }).tap();
  await page.getByTestId('cell-row-add').tap();
  await expect.poll(async () => (await cellTracks(page)).length).toBe(3);
  const tr = await cellTracks(page);
  expect(tr.map((t) => t.cellNo)).toEqual([1, 1, 2]);
  expect(tr[1]!.cell).toEqual(tr[0]!.cell);
  await page.getByRole('button', { name: '關閉', exact: true }).last().tap();
  await expect(page.getByTestId('cell-no')).toHaveText(['1', '1', '2']);

  // 新的那一列放藍色 → 同一時間第 1 格是藍色（蓋在紅色上面）
  await page.getByRole('button', { name: /^第 1 格 第 2 列 軌道/ }).tap();
  await page.getByTestId('cell-file').setInputFiles(fixture('solid-blue.webm')); // 空的一列：直接放入素材
  await expect.poll(async () => (await cellTracks(page))[1]!.items.length, { timeout: 30_000 }).toBe(1);
  await page.getByRole('button', { name: '關閉', exact: true }).last().tap();
  const c1 = tr[0]!.cell!;
  await seekTo(page, 1);
  await expect.poll(async () => isBlue(await samplePreview(page, ...mid(c1)))).toBe(true);
  await page.screenshot({ path: `${SHOT}/y8-two-rows-390.png` });

  // 圖層分頁：把藍色那列往下一層 → 紅色在上面
  const blueId = (await cellTracks(page))[1]!.items[0]!.id;
  await openLayerList(page);
  await page
    .getByTestId('layer-group')
    .getByRole('button', { name: /^展開版型/ })
    .tap();
  await page
    .locator(`[data-testid="layer-row"][data-item-id="${blueId}"]`)
    .getByRole('button', { name: /往下一層/ })
    .tap();
  const after = await cellTracks(page);
  expect(after[0]!.items[0]!.id).toBe(blueId);
  await seekTo(page, 1);
  await expect.poll(async () => isRed(await samplePreview(page, ...mid(c1)))).toBe(true);
});

test('Y8 改成第 N 格：這一列的素材搬到另一格（畫面照新格子蓋滿），空出來的列刪掉；最後一列不能刪', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await twoCells(page);
  await showTimeline(page);
  await page.getByRole('button', { name: '第 1 格 軌道' }).tap();
  await page.getByTestId('cell-row-add').tap();
  await expect.poll(async () => (await cellTracks(page)).length).toBe(3);
  // 只有一列的格子不能刪那一列
  await page.getByRole('button', { name: '關閉', exact: true }).last().tap();
  await page.getByRole('button', { name: '第 2 格 軌道' }).tap();
  await expect(page.getByTestId('cell-row-remove')).toBeDisabled();
  await page.getByRole('button', { name: '關閉', exact: true }).last().tap();
  // 第 1 格的第 1 列（紅色）改成第 2 格 → 第 2 格有兩個素材，第 1 格只剩空的那一列
  await page.getByRole('button', { name: /^第 1 格 第 1 列 軌道/ }).tap();
  await page.getByRole('button', { name: '改成第 2 格', exact: true }).tap();
  await expect.poll(async () => (await cellTracks(page)).length).toBe(2);
  const tr = await cellTracks(page);
  expect(tr.map((t) => [t.cellNo, t.items.length])).toEqual([
    [1, 0],
    [2, 2],
  ]);
});

test('Y9 預覽上拖格子大小：拖兩格之間的線，一格變大、另一格變小；套用後外框重畫、格子仍蓋滿；重置回原樣', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await twoCells(page);
  await selectFrame(page);
  await openTab(page, '版型');
  await page.getByTestId('layout-cell-resize').scrollIntoViewIfNeeded();
  const before = await cellTracks(page);
  const h0 = before[0]!.cell!.h;
  const h1 = before[1]!.cell!.h;
  await page.getByTestId('layout-cell-resize').tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByTestId('lc-cell')).toHaveCount(2);
  const hd = (await page.getByTestId('lc-handle-h').boundingBox())!;
  const x = hd.x + hd.width / 2;
  const y = hd.y + hd.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 60, { steps: 6 });
  await page.mouse.up();
  await page.screenshot({ path: `${SHOT}/y9-drag-390.png` });
  await page.getByTestId('cell-resize-apply').tap();
  await expect
    .poll(async () => (await cellTracks(page))[0]!.cell!.h, { timeout: 20_000 })
    .toBeGreaterThan(h0 + 0.02);
  const after = await cellTracks(page);
  expect(after[1]!.cell!.h).toBeLessThan(h1 - 0.02);
  // 第 1 格的素材仍蓋滿那一格（沒有預先裁切）
  expect(after[0]!.items[0]!.cell).toEqual(after[0]!.cell);
  // 重置
  await selectFrame(page);
  await openTab(page, '版型');
  await page.getByTestId('layout-cell-reset').tap();
  await expect.poll(async () => (await cellTracks(page))[0]!.cell!.h, { timeout: 20_000 }).toBeCloseTo(h0, 3);
});
