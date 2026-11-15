import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWith,
  finishLayout,
  fixture,
  isGreen,
  isRed,
  openTab,
  pinch,
  previewBox,
  project,
  samplePreview,
  seekTo,
  selectFrame,
  showTimeline,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-12';
type Tf = { x: number; y: number; scale: number };
type It = {
  id: string;
  type: string;
  group?: string;
  cell?: { x: number; y: number; w: number; h: number };
  cellEdit?: boolean;
  transform: Tf;
};
type Tr = { id: string; kind: string; groupRole?: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];

test('L5 素材層：選到某一格 → 雙指放大只動那一格（放大超過格子，畫面只露出自己那一格）；整個版型和別的格子不動', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  // finishLayout 結束時選到第 1 格（素材層）
  await expect(page.locator('.selbox.member')).toBeVisible();
  const before = await tracks(page);
  const cells = before.filter((t) => t.groupRole === 'cell');
  const frame = before.flatMap((t) => t.items).find((i) => i.group && !i.cell && i.type !== 'text')!;
  const [top, bottom] = [cells[0]!.items[0]!, cells[1]!.items[0]!];
  const s = await previewBox(page);
  await pinch(page, { cx: s.x + s.width / 2, cy: s.y + s.height / 2, from: 80, to: 240 });
  const after = await tracks(page);
  const aCells = after.filter((t) => t.groupRole === 'cell');
  const aFrame = after.flatMap((t) => t.items).find((i) => i.id === frame.id)!;
  expect(aCells[0]!.items[0]!.transform.scale).toBeGreaterThan(top.transform.scale * 2); // 放大超過格子也可以
  expect(aCells[0]!.items[0]!.cellEdit).toBe(true);
  expect(aCells[1]!.items[0]!.transform.scale).toBeCloseTo(bottom.transform.scale, 6); // 別的格子不動
  expect(aFrame.transform.scale).toBeCloseTo(frame.transform.scale, 6); // 整個版型不動
  // 畫面只露出自己那一格：放大的紅色沒有蓋到下面那一格（還是綠色），上面那一格還是紅色
  const c0 = cells[0]!.items[0]!.cell!;
  const c1 = cells[1]!.items[0]!.cell!;
  await seekTo(page, 1);
  await expect
    .poll(async () => isGreen(await samplePreview(page, c1.x + c1.w / 2, c1.y + c1.h / 2)))
    .toBe(true);
  await expect
    .poll(async () => isRed(await samplePreview(page, c0.x + c0.w / 2, c0.y + c0.h / 2)))
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/member-level-zoom.png` });
});

test('L5 版型層與素材層：選整個版型縮小＝格子一起縮；選版型裡的文字縮放＝只有那個文字', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 三格', exact: true }).tap();
  await page.getByTestId('layout-confirm').tap();
  await expect(page.getByTestId('layout-options')).toHaveCount(0, { timeout: 30_000 });
  await showTimeline(page);
  await page.getByTestId('group-add').tap();
  await page.getByTestId('group-add-text').tap(); // 加一個版型文字（選到它）
  await expect(page.locator('.selbox.member')).toHaveCount(1);
  const t0 = await tracks(page);
  const text0 = t0.flatMap((t) => t.items).find((i) => i.type === 'text' && i.group)!;
  const frame0 = t0.flatMap((t) => t.items).find((i) => i.group && !i.cell && i.type !== 'text')!;
  const s = await previewBox(page);
  await pinch(page, { cx: s.x + s.width / 2, cy: s.y + s.height / 2, from: 160, to: 80 });
  const t1 = await tracks(page);
  const text1 = t1.flatMap((t) => t.items).find((i) => i.id === text0.id)!;
  const frame1 = t1.flatMap((t) => t.items).find((i) => i.id === frame0.id)!;
  expect(text1.transform.scale).toBeLessThan(text0.transform.scale * 0.8); // 文字縮小
  expect(frame1.transform.scale).toBeCloseTo(frame0.transform.scale, 6); // 整個版型沒動
  // 選整個版型再縮小：外框縮小，文字也跟著縮小
  await selectFrame(page);
  await expect(page.locator('.selbox.member')).toHaveCount(0);
  const s2 = await previewBox(page);
  await pinch(page, { cx: s2.x + s2.width / 2, cy: s2.y + s2.height / 2, from: 160, to: 80 });
  const t2 = await tracks(page);
  const frame2 = t2.flatMap((t) => t.items).find((i) => i.id === frame0.id)!;
  const text2 = t2.flatMap((t) => t.items).find((i) => i.id === text0.id)!;
  expect(frame2.transform.scale).toBeLessThan(frame1.transform.scale * 0.8);
  expect(text2.transform.scale).toBeLessThan(text1.transform.scale * 0.8);
});

test('L5 選到版型裡的素材時，預覽上有一個虛線框＋「只露出這個範圍」；選整個版型就沒有', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]); // 選到第 1 格
  await expect(page.getByTestId('clip-area')).toBeVisible();
  await expect(page.getByText('只露出這個範圍')).toBeVisible();
  expect(await page.getByTestId('clip-area').locator('polygon').getAttribute('points')).toMatch(
    /^[\d.,\s-]+$/,
  );
  await selectFrame(page);
  await expect(page.getByTestId('clip-area')).toHaveCount(0);
});
