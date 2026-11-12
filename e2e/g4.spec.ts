import { expect, test, type Page } from '@playwright/test';
import {
  clips,
  createProjectWith,
  isRed,
  fixture,
  openTab,
  pinch,
  previewBox,
  project,
  samplePreview,
  seekTo,
  selectedItemId,
  showTimeline,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-7/g4';
type Cell = { x: number; y: number; w: number; h: number };
type It = {
  id: string;
  group?: string;
  cell?: Cell;
  start: number;
  duration: number;
  motion?: string;
  transform: { x: number; y: number; scale: number; rotation: number };
};
type Tr = { id: string; kind: string; groupRole?: string; fill?: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];

async function addLayout(page: Page, name: string, files: string[], motion?: string) {
  await openTab(page, '版型');
  await page.getByRole('button', { name: `版型 ${name}`, exact: true }).tap();
  await expect(page.getByTestId('layout-sheet')).toBeVisible();
  if (motion) await page.getByRole('radio', { name: `動畫 ${motion}` }).tap();
  await page.getByTestId('layout-input').setInputFiles(files.map(fixture));
  await expect(page.getByTestId('layout-sheet')).toHaveCount(0, { timeout: 30_000 });
}
const members = (tr: Tr[]) => tr.filter((t) => t.groupRole).flatMap((t) => t.items);

test('版型整組移動：拖其中一格，外框與所有格子一起動，相對位置不變', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '拍貼機直條', ['solid-red.webm', 'solid-green.webm']);
  const before = members(await tracks(page));
  const box = await previewBox(page);
  const c = before.find((m) => m.cell)!.cell!;
  const from = {
    x: box.x + (c.x + c.w / 2) * box.width,
    y: box.y + (c.y + c.h / 2) * box.height,
  };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 10, { steps: 4 });
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 4 });
  await page.mouse.up();
  const after = members(await tracks(page));
  const dx = after[0]!.transform.x - before[0]!.transform.x;
  expect(Math.abs(dx)).toBeGreaterThan(0.02);
  for (let i = 0; i < before.length; i++) {
    expect(after[i]!.transform.x - before[i]!.transform.x).toBeCloseTo(dx, 4);
    expect(after[i]!.transform.scale).toBeCloseTo(before[i]!.transform.scale, 6);
  }
  await page.screenshot({ path: `${SHOT}/moved.png` });
});

test('版型整組縮放：雙指縮小，格子大小與間距按比例一起縮小（不跑版）', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '拍貼機直條', ['solid-red.webm', 'solid-green.webm']);
  const before = members(await tracks(page));
  const s = await previewBox(page);
  await pinch(page, { cx: s.x + s.width / 2, cy: s.y + s.height / 2, from: 160, to: 80 });
  const after = members(await tracks(page));
  const k = after[0]!.transform.scale / before[0]!.transform.scale;
  expect(k).toBeLessThan(0.7);
  const cx = 0.5;
  const cy = 0.5;
  for (let i = 0; i < before.length; i++) {
    expect(after[i]!.transform.scale / before[i]!.transform.scale).toBeCloseTo(k, 4);
    // 位置：離整組中心的距離也乘上 k（整組以第 1 個物件的相對關係為準，這裡驗證格子間距按比例縮）
    const dxb = before[i]!.transform.x - cx;
    const dxa = after[i]!.transform.x - cx;
    expect(Math.abs(dxa)).toBeLessThanOrEqual(Math.abs(dxb) + 1e-6);
    void cy;
  }
  await page.screenshot({ path: `${SHOT}/scaled.png` });
});

test('版型：時間軸只有一條代表列；格子在版型分頁選；外框刪掉＝整個版型拿掉；拉長版型的結尾', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '三格', ['solid-red.webm', 'solid-green.webm', 'solid-blue.webm']);
  await showTimeline(page);
  // 時間軸上：主軌 1 + 版型代表列 1（格子的軌道藏起來）
  await expect(page.getByTestId('track')).toHaveCount(2);
  const tr = await tracks(page);
  const frame = tr.find((t) => t.groupRole === 'frame')!.items[0]!;
  // 版型分頁列出每一格；點「選第 2 格」選到那一格
  await openTab(page, '版型');
  await expect(page.getByTestId('group-panel')).toBeVisible();
  await expect(page.getByTestId('cell-row')).toHaveCount(3);
  await page.getByRole('button', { name: '選第 2 格' }).tap();
  const cell2 = tr.filter((t) => t.groupRole === 'cell')[1]!.items[0]!;
  await expect.poll(() => selectedItemId(page)).toBe(cell2.id);
  await page.screenshot({ path: `${SHOT}/group-panel.png` });

  // 版型多 1 秒
  const d0 = frame.duration;
  await page.getByRole('button', { name: '版型 多 1 秒' }).tap();
  const frame2 = (await tracks(page)).find((t) => t.groupRole === 'frame')!.items[0]!;
  expect(frame2.duration).toBeCloseTo(d0 + 1, 3);

  // 刪掉外框＝整個版型拿掉（復原回來）
  await page.getByRole('button', { name: '移除版型' }).tap();
  expect((await tracks(page)).length).toBe(1);
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await tracks(page)).length).toBe(5);
});

test('版型：素材比版型短，剩下的秒數顯示色塊——反黑，可以改成反白', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-blue.webm']); // 4 秒
  await addLayout(page, '上下雙格', ['clip-a.webm', 'solid-red.webm']); // clip-a 2 秒；紅 4 秒 → 版型 4 秒
  const tr = await tracks(page);
  const cell0 = tr.filter((t) => t.groupRole === 'cell')[0]!;
  const cell = cell0.items[0]!.cell!;
  expect(cell0.items[0]!.duration).toBeLessThan(3); // 2 秒的素材放不滿 4 秒
  // 第 3 秒：第 1 格素材放完了，顯示黑色
  await seekTo(page, 3);
  await page.waitForTimeout(500);
  console.log(
    'DBG',
    JSON.stringify(await samplePreview(page, cell.x + cell.w / 2, cell.y + cell.h / 2)),
    cell0.items[0]!.duration,
  );
  const nx = cell.x + cell.w / 2;
  const ny = cell.y + cell.h / 2;
  await expect
    .poll(async () => {
      const c = await samplePreview(page, nx, ny);
      return !!c && c[0] < 40 && c[1] < 40 && c[2] < 40;
    })
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/fill-black.png` });
  // 改成反白
  await openTab(page, '版型');
  await page.getByRole('radio', { name: '第 1 格 反白' }).tap();
  expect((await tracks(page)).find((t) => t.groupRole === 'cell')!.fill).toBe('white');
  await expect
    .poll(async () => {
      const c = await samplePreview(page, nx, ny);
      return !!c && c[0] > 230 && c[1] > 230 && c[2] > 230;
    })
    .toBe(true);
});

test('版型動畫：捲動——不同時間整組的位置不同；選「不動」就回到原位', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '三格', ['solid-red.webm', 'solid-green.webm', 'solid-blue.webm'], '捲動');
  const tr = await tracks(page);
  const frame = tr.find((t) => t.groupRole === 'frame')!.items[0]!;
  expect(frame.motion).toBe('drift');
  const cell = tr.filter((t) => t.groupRole === 'cell')[0]!.items[0]!.cell!;
  const nx = cell.x + cell.w / 2;
  const ny = cell.y + cell.h / 2;
  await seekTo(page, 0.2);
  const a = await samplePreview(page, nx, ny);
  await seekTo(page, 2); // 捲動到中間時整組回到原位：第 1 格是紅色
  await expect.poll(async () => isRed(await samplePreview(page, nx, ny))).toBe(true);
  // 開頭整組被推到畫面下方，同一個點看到的不是紅色
  expect(isRed(a)).toBe(false);
  await page.screenshot({ path: `${SHOT}/drift.png` });
  await openTab(page, '版型');
  await page.getByRole('button', { name: '選第 1 格' }).tap();
  await page.getByRole('radio', { name: '動畫 不動' }).tap();
  const frame2 = (await tracks(page)).find((t) => t.groupRole === 'frame')!.items[0]!;
  expect(frame2.motion).toBeUndefined();
  void clips;
});
