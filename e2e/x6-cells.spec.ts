import { expect, test, type Page } from '@playwright/test';
import {
  closePanel,
  createProjectWith,
  finishLayout,
  fixture,
  isRed,
  openTab,
  openTool,
  project,
  samplePreview,
  seekTo,
  selectFrame,
  showTimeline,
  trimClipEnd,
  type RGBA,
  undo,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-12';
type It = {
  id: string;
  type: string;
  assetId?: string;
  start: number;
  duration: number;
  cell?: { x: number; y: number; w: number; h: number };
  group?: string;
  layoutPlay?: string;
  gapMode?: string;
};
type Tr = { id: string; kind: string; groupRole?: string; group?: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];
const cells = async (page: Page) => (await tracks(page)).filter((t) => t.groupRole === 'cell');
const frame = async (page: Page) =>
  (await tracks(page)).flatMap((t) => t.items).find((i) => i.group && !i.cell && i.layoutPlay !== undefined)!;
const row = async (page: Page, n: number) => {
  const list = (await cells(page))[n]!.items.slice().sort((x, y) => x.start - y.start);
  return list.map((i) => [Math.round(i.start * 10) / 10, Math.round(i.duration * 10) / 10]);
};
const isYellow = (c: RGBA | null) => !!c && c[0] > 200 && c[1] > 170 && c[2] < 120;
const center = (c: { x: number; y: number; w: number; h: number }) => [c.x + c.w / 2, c.y + c.h / 2] as const;

async function twoCellLayout(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]); // 各 4 秒、版型 5 秒
}

async function addColorTo(page: Page, n: number) {
  const before = (await cells(page))[n - 1]!.items.length;
  await showTimeline(page);
  await page.getByRole('button', { name: `第 ${n} 格 加素材` }).tap();
  await page.getByTestId('cell-add-color').tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(async () => (await cells(page))[n - 1]!.items.length, { timeout: 20_000 })
    .toBe(before + 1);
}

test('X6 一格多素材：列尾 ＋ 加色塊、加照片；格子編號；空檔停格／色塊／透明', async ({ page }) => {
  test.setTimeout(180_000);
  await twoCellLayout(page);
  expect((await frame(page)).gapMode).toBe('hold');
  // 格子列的圖示是編號
  await showTimeline(page);
  await expect(page.getByTestId('cell-no')).toHaveText(['1', '2']);

  // 第 1 格接一段黃色色塊（預設 2 秒、接在紅色 0–4 後面 → 4–6），版型拉長到 6 秒
  await addColorTo(page, 1);
  expect(await row(page, 0)).toEqual([
    [0, 4],
    [4, 2],
  ]);
  expect((await frame(page)).duration).toBeCloseTo(6, 1);
  const box = (await cells(page))[0]!.items[0]!.cell!;
  const [cx, cy] = center(box);
  await seekTo(page, 5);
  await expect.poll(async () => isYellow(await samplePreview(page, cx, cy))).toBe(true);
  await page.screenshot({ path: `${SHOT}/x6-color-block-390.png` });

  // 第 1 格再加一個影片（綠 4 秒）→ 接在色塊後面 6–10
  await page.getByRole('button', { name: '第 1 格 加素材' }).tap();
  await page.getByTestId('cell-add-file').setInputFiles(fixture('solid-green.webm'));
  await expect.poll(async () => (await row(page, 0)).length, { timeout: 30_000 }).toBe(3);
  expect((await row(page, 0))[2]).toEqual([6, 4]);

  // 刪掉色塊 → 4–6 是空檔：預設「停格」停在紅色最後一格
  await showTimeline(page);
  const colorItem = (await cells(page))[0]!.items.find((i) => i.start > 3.9 && i.start < 4.1)!;
  await closePanel(page);
  await page.locator(`[data-testid="clip"][data-item-id="${colorItem.id}"]`).tap();
  await openTab(page, '剪輯');
  await page.getByTestId('tool-edit.delete').first().tap();
  expect(await row(page, 0)).toEqual([
    [0, 4],
    [6, 4],
  ]);
  await seekTo(page, 5);
  await expect.poll(async () => isRed(await samplePreview(page, cx, cy))).toBe(true);

  // 空檔改成「透明」→ 不再畫紅色（要先選到整個版型，版型分頁才有它的設定）
  await selectFrame(page);
  await openTab(page, '版型');
  await openTool(page, 'layout.play');
  await page.getByRole('radio', { name: '空檔 透明' }).tap();
  await expect.poll(async () => isRed(await samplePreview(page, cx, cy))).toBe(false);
  await openTool(page, 'layout.play');
  await page.getByRole('radio', { name: '空檔 停格' }).tap();
  await expect.poll(async () => isRed(await samplePreview(page, cx, cy))).toBe(true);
});

test('X6 同步／依序：排好各格素材、版型長度跟著；依序時改尾端後面各格往後推；復原', async ({ page }) => {
  test.setTimeout(180_000);
  await twoCellLayout(page);
  await addColorTo(page, 1); // 第 1 格 0–4 紅、4–6 黃
  await openTab(page, '版型');
  await openTool(page, 'layout.play');
  await page.getByRole('radio', { name: '播放方式 依序' }).tap();
  // 依序：第 1 格 0–4、4–6；第 2 格接在後面 6–10；版型 10 秒
  expect(await row(page, 0)).toEqual([
    [0, 4],
    [4, 2],
  ]);
  expect(await row(page, 1)).toEqual([[6, 4]]);
  expect((await frame(page)).duration).toBeCloseTo(10, 1);
  expect((await frame(page)).layoutPlay).toBe('seq');
  await page.screenshot({ path: `${SHOT}/x6-seq-390.png` });

  // 依序時拖第 1 格色塊的尾端 +1 秒 → 第 2 格往後 1 秒、版型變 11 秒；復原一步回來
  const colorId = (await cells(page))[0]!.items.find((i) => i.start > 3.9 && i.start < 4.1)!.id;
  const len = await trimClipEnd(page, colorId, 1);
  expect(len).toBeGreaterThan(2.7);
  expect(len).toBeLessThan(3.3);
  expect((await row(page, 1))[0]![0]).toBeGreaterThan(6.7);
  expect((await frame(page)).duration).toBeGreaterThan(10.7);
  if (await page.getByRole('dialog').count()) await page.getByTestId('sheet-close').tap();
  await undo(page);
  expect(await row(page, 1)).toEqual([[6, 4]]);

  // 切回同步：第 2 格回到版型開頭
  await openTool(page, 'layout.play');
  await page.getByRole('radio', { name: '播放方式 同步' }).tap();
  expect(await row(page, 1)).toEqual([[0, 4]]);
  expect((await frame(page)).duration).toBeCloseTo(6, 1);
  await undo(page);
  expect((await frame(page)).layoutPlay).toBe('seq');
  expect(await row(page, 1)).toEqual([[6, 4]]);
});

test('X6 移至格子：剪輯分頁［移至格子］把素材搬到別格，畫面換成新格子；預覽框出那一格', async ({ page }) => {
  test.setTimeout(180_000);
  await twoCellLayout(page);
  const [c1, c2] = await cells(page);
  const it = c1!.items[0]!;
  await showTimeline(page);
  await closePanel(page);
  await page.locator(`[data-testid="clip"][data-item-id="${it.id}"]`).tap();
  await expect(page.getByTestId('clip-area')).toBeVisible();
  await expect(page.getByTestId('preview-cell-no')).toHaveText(['1', '2']);
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '移至格子' }).tap();
  await page.getByRole('button', { name: '移至第 2 格' }).tap();
  const after = await cells(page);
  expect(after[0]!.items).toHaveLength(0);
  expect(after[1]!.items).toHaveLength(2);
  const moved = after[1]!.items.find((i) => i.id === it.id)!;
  expect(moved.cell!.y).toBeCloseTo(c2!.items[0]!.cell!.y, 3);
  // 兩個素材同時間在第 2 格：後來搬的找空位 → 接在後面
  expect(moved.start).toBeGreaterThanOrEqual(c2!.items[0]!.start + c2!.items[0]!.duration - 1e-6);
});

test('X6 這一格視窗：素材清單、加色塊、改色塊顏色與文字（套用）、刪除一段（文字一起刪）', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await twoCellLayout(page);
  await openTab(page, '版型');
  await openTool(page, 'layout.cells');
  await page.getByTestId('ld-cell').first().tap();
  const dlg = page.getByRole('dialog', { name: '第 1 格' });
  await expect(dlg.getByTestId('cell-items').locator('li')).toHaveCount(1);
  await dlg.getByTestId('cell-add-open').tap();
  await page.getByRole('dialog', { name: '加到第 1 格' }).getByTestId('cell-add-color').tap();
  await expect(dlg.getByTestId('cell-items').locator('li')).toHaveCount(2, { timeout: 20_000 });
  expect(await row(page, 0)).toEqual([
    [0, 4],
    [4, 2],
  ]);
  // 點第 2 段（色塊）→ 改顏色＋文字 → 套用
  await dlg.getByRole('button', { name: /^第 2 段/ }).tap();
  await dlg.getByLabel('色塊上的文字').fill('HI');
  await dlg.getByTestId('cell-color-apply').tap();
  const colorId = (await cells(page))[0]!.items.find((i) => i.start > 3.9)!.id;
  const texts = async () =>
    (await tracks(page))
      .flatMap((t) => t.items)
      .filter((i) => i.type === 'text' && (i as { onItem?: string }).onItem === colorId);
  await expect.poll(async () => (await texts()).length).toBe(1);
  expect((await texts())[0]!.start).toBeCloseTo(4, 1);
  await page.screenshot({ path: `${SHOT}/x6-cell-sheet-390.png` });
  // 刪除第 2 段 → 色塊和文字都沒了
  await dlg.getByRole('button', { name: '刪除第 2 段' }).tap();
  await expect.poll(async () => (await row(page, 0)).length).toBe(1);
  expect((await texts()).length).toBe(0);
});
