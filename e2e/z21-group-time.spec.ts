import { expect, test, type Page } from '@playwright/test';
import {
  closePanel,
  createProjectWith,
  finishLayout,
  fixture,
  openTab,
  openTool,
  project,
  selectFrame,
  showTimeline,
  undo,
} from './helpers';

// feedback-16 Z21：版型在播放軸上左右兩端都能拖（改開始、改長度）；版型工具列〔時間〕可以直接打數字
type It = {
  id: string;
  type: string;
  group?: string;
  cell?: unknown;
  start: number;
  duration: number;
  trimIn?: number;
};
type Tr = { groupRole?: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];
const frameOf = async (page: Page) =>
  (await tracks(page)).flatMap((t) => t.items).find((i) => i.group && !i.cell && i.type !== 'text')!;

async function setup(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']); // 主軌 4 秒
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]); // 各 4 秒
  await selectFrame(page);
}

test('Z21 選到版型：左右兩端都有把手；拖左端改開始、結尾不動；一步復原', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await showTimeline(page);
  await expect(page.getByTestId('trim-start')).toBeVisible();
  await expect(page.getByTestId('trim-end')).toBeVisible();
  const f0 = await frameOf(page);
  const end0 = f0.start + f0.duration;
  const clip = page.locator(`[data-testid="clip"][data-item-id="${f0.id}"]`);
  const pps = (await clip.boundingBox())!.width / f0.duration;
  const h = (await page.getByTestId('trim-start').boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + pps, y, { steps: 6 }); // 往右 1 秒
  await page.mouse.up();
  const f1 = await frameOf(page);
  expect(f1.start).toBeGreaterThan(0.7);
  expect(f1.start + f1.duration).toBeCloseTo(end0, 3); // 結尾不動
  // 各格開頭被切掉：入點往後
  const cell = (await tracks(page)).filter((t) => t.groupRole === 'cell')[0]!.items[0]!;
  expect(cell.start).toBeCloseTo(f1.start, 3);
  expect(cell.trimIn ?? 0).toBeGreaterThan(0.7);
  await undo(page);
  const f2 = await frameOf(page);
  expect(f2.start).toBeCloseTo(f0.start, 3);
  expect(f2.duration).toBeCloseTo(f0.duration, 3);
});

test('Z21 版型〔時間〕視窗：打開始秒數、長度；結尾照規則動', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await closePanel(page);
  await selectFrame(page);
  await openTool(page, 'layout.time');
  const panel = page.getByTestId('layout-time');
  await expect(panel).toBeVisible();
  const f0 = await frameOf(page);
  const end0 = f0.start + f0.duration;
  // 開始 +0.1：結尾不動
  await panel.getByRole('button', { name: '開始（秒） 加 0.1' }).tap();
  const f1 = await frameOf(page);
  expect(f1.start).toBeCloseTo(f0.start + 0.1, 2);
  expect(f1.start + f1.duration).toBeCloseTo(end0, 2);
  // 長度改成 2 秒：開始不動
  const len = panel.getByLabel('長度（秒）', { exact: true });
  await len.fill('2');
  await len.blur();
  const f2 = await frameOf(page);
  expect(f2.duration).toBeCloseTo(2, 2);
  expect(f2.start).toBeCloseTo(f1.start, 2);
  await expect(page.getByTestId('layout-time-end')).toContainText((f2.start + 2).toFixed(2));
});
