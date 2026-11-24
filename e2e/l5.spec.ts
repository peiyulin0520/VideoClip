import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWith,
  finishLayout,
  fixture,
  isGreen,
  isRed,
  openTab,
  openTool,
  pinch,
  previewBox,
  project,
  samplePreview,
  seekTo,
  selectFrame,
  showTimeline,
  undo,
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

test('L5 選到版型裡的素材時，預覽上有一個虛線框（格子素材看編號、版型裡的文字貼圖標「只露出這個範圍」）；選整個版型就沒有', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]); // 選到第 1 格
  await expect(page.getByTestId('clip-area')).toBeVisible();
  await expect(page.getByTestId('preview-cell-no')).toHaveText(['1', '2']); // 格子素材：預覽上每一格有編號，不再另外標字
  await expect(page.locator('.clip-tag')).toHaveCount(0);
  expect(await page.getByTestId('clip-area').locator('polygon').getAttribute('points')).toMatch(
    /^[\d.,\s-]+$/,
  );
  await selectFrame(page);
  await expect(page.getByTestId('clip-area')).toHaveCount(0);
});

test('L7 版型格式：有「左右雙格」「上下雙格」和「自訂格數」；自訂 3 列 × 2 欄 → 6 格；選到後可以加減列欄（少格要確認）', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await expect(page.getByRole('button', { name: '版型 左右雙格', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '版型 上下雙格', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '版型 自訂格數', exact: true }).tap();
  await expect(page.getByTestId('grid-rows')).toHaveText('2');
  await page.getByRole('button', { name: '列數 加 1' }).tap();
  await page.getByTestId('layout-confirm').tap();
  await expect(page.getByTestId('layout-options')).toHaveCount(0, { timeout: 30_000 });
  const cellsOf = async () => (await tracks(page)).filter((t) => t.groupRole === 'cell');
  expect(await cellsOf()).toHaveLength(6); // 3 列 × 2 欄
  // 選到的版型：加欄 → 9 格；放一個素材到最後一格後減欄 → 要確認
  await openTool(page, 'layout.size');
  await expect(page.getByTestId('shape-rows')).toHaveText('3');
  await openTool(page, 'layout.size');
  await page.getByRole('button', { name: '這個版型的欄數 加 1' }).tap();
  await expect.poll(async () => (await cellsOf()).length).toBe(9);
  await openTool(page, 'layout.cells');
  await page.getByTestId('ld-cell').nth(8).tap();
  await page.getByTestId('cell-assets').getByRole('button').first().tap();
  await page.getByRole('button', { name: '關閉', exact: true }).tap();
  await openTool(page, 'layout.size');
  await page.getByRole('button', { name: '這個版型的欄數 減 1' }).tap();
  await expect(page.getByRole('dialog', { name: '格數變少' })).toBeVisible();
  await page.getByRole('button', { name: '拿掉，改格數' }).tap();
  await expect.poll(async () => (await cellsOf()).length).toBe(6);
  await page.screenshot({ path: `${SHOT}/layout-custom-grid.png` });
});

test('L7 調整版型大小：預覽上拖右邊把手往左 → 套用 → 版型變窄（外框 box、格子都變）；一步復原', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  await selectFrame(page);
  await openTab(page, '版型');
  const frameOf = async () =>
    (await tracks(page))
      .flatMap((t) => t.items)
      .find((i) => i.group && !i.cell && i.type !== 'text') as unknown as {
      frameStyle?: { box?: { w: number; h: number } };
    };
  expect(frameOf().then((f) => f.frameStyle?.box)).resolves.toBeUndefined();
  const w0 = (await tracks(page)).filter((t) => t.groupRole === 'cell')[0]!.items[0]!.cell!.w;
  await openTool(page, 'layout.size');
  await page.getByTestId('layout-resize').tap();
  await expect(page.getByTestId('layout-resize-frame')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  const h = (await page.getByTestId('layout-h-r').boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y, { steps: 6 });
  await page.mouse.move(x - 120, y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('layout-resize-text')).toContainText('高 100%');
  const txt = await page.getByTestId('layout-resize-text').innerText();
  const wPct = Number(/寬 (\d+)%/.exec(txt)![1]);
  expect(wPct).toBeLessThan(90);
  await page.getByTestId('layout-resize-apply').tap();
  await expect
    .poll(async () => (await frameOf()).frameStyle?.box?.w ?? 1, { timeout: 15_000 })
    .toBeLessThan(0.9);
  const cells = (await tracks(page)).filter((t) => t.groupRole === 'cell');
  expect(cells[0]!.items[0]!.cell!.w).toBeLessThan(w0);
  // 每一格還是被素材填滿（格子中心看得到紅、綠）
  const c0 = cells[0]!.items[0]!.cell!;
  const c1 = cells[1]!.items[0]!.cell!;
  await seekTo(page, 1);
  await expect
    .poll(async () => isRed(await samplePreview(page, c0.x + c0.w / 2, c0.y + c0.h / 2)))
    .toBe(true);
  await expect
    .poll(async () => isGreen(await samplePreview(page, c1.x + c1.w / 2, c1.y + c1.h / 2)))
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/layout-resized.png` });
  // 復原 → 回到整個畫面
  await undo(page);
  await expect.poll(async () => (await frameOf()).frameStyle?.box).toBeUndefined();
});

test('L7 格子框線粗細：滑桿 0%＝格子貼在一起、300%＝框線變粗；一步復原', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 左右雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  await selectFrame(page);
  await openTab(page, '版型');
  const gap = async () => {
    const cs = (await tracks(page)).filter((t) => t.groupRole === 'cell');
    const a = cs[0]!.items[0]!.cell!;
    const b = cs[1]!.items[0]!.cell!;
    return b.x - (a.x + a.w);
  };
  const g1 = await gap();
  expect(g1).toBeGreaterThan(0);
  await openTool(page, 'layout.frame');
  const slider = page.getByLabel('格子框線粗細');
  await expect(slider).toHaveValue('100');
  await slider.fill('300');
  await expect.poll(gap, { timeout: 15_000 }).toBeGreaterThan(g1 * 2.5);
  await slider.fill('0');
  await expect.poll(gap, { timeout: 15_000 }).toBeLessThan(0.002);
  // 格子貼在一起後每格仍有素材（沒有露出藍色底）
  const cs = (await tracks(page)).filter((t) => t.groupRole === 'cell');
  const c0 = cs[0]!.items[0]!.cell!;
  await seekTo(page, 1);
  await expect
    .poll(async () => isRed(await samplePreview(page, c0.x + c0.w / 2, c0.y + c0.h / 2)))
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/layout-line-0.png` });
  // 一步復原（滑桿的連續調整合併成一步）→ 回到 300% 或原本；再復原到原本粗細
  await undo(page);
  await undo(page);
  await expect.poll(gap, { timeout: 5000 }).toBeCloseTo(g1, 3);
});

test('Z2 分隔線粗細：單獨調格子之間的線，外框邊距不動；調整體粗細時兩者一起變；一步復原', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  await selectFrame(page);
  await openTab(page, '版型');
  const geo = async () => {
    const cs = (await tracks(page)).filter((t) => t.groupRole === 'cell');
    const a = cs[0]!.items[0]!.cell!;
    const b = cs[1]!.items[0]!.cell!;
    return { gap: b.y - (a.y + a.h), margin: a.y };
  };
  const g0 = await geo();
  await openTool(page, 'layout.frame');
  await expect(page.getByLabel('分隔線粗細')).toHaveValue('100');
  await page.getByLabel('分隔線粗細').fill('300');
  await expect.poll(async () => (await geo()).gap, { timeout: 15_000 }).toBeGreaterThan(g0.gap * 2.5);
  expect((await geo()).margin).toBeCloseTo(g0.margin, 3); // 外框邊距沒動
  // 整體粗細拉到 200%：邊距 2 倍、分隔線也回到跟整體一樣（2 倍）
  await page.getByLabel('格子框線粗細').fill('200');
  await expect.poll(async () => (await geo()).margin, { timeout: 15_000 }).toBeGreaterThan(g0.margin * 1.8);
  expect((await geo()).gap).toBeCloseTo(g0.gap * 2, 3);
  await undo(page);
  await expect.poll(async () => (await geo()).gap, { timeout: 5000 }).toBeGreaterThan(g0.gap * 2.5);
});

test('L7 拍立得（只有一格）也有框線粗細滑桿：白邊跟著變粗細', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 拍立得', exact: true }).tap();
  await finishLayout(page, [fixture('photo.png')]);
  await selectFrame(page);
  await openTab(page, '版型');
  await openTool(page, 'layout.size');
  await expect(page.getByTestId('layout-shape')).toBeVisible();
  await openTool(page, 'layout.frame');
  const slider = page.getByLabel('格子框線粗細');
  await expect(slider).toBeVisible();
  const w = async () => (await tracks(page)).filter((t) => t.groupRole === 'cell')[0]!.items[0]!.cell!.w;
  const w0 = await w();
  await slider.fill('300');
  await expect.poll(w, { timeout: 15_000 }).toBeLessThan(w0 * 0.97);
});

test('L8 版型裡的文字有上下圖層：兩個文字各一條成員軌，選單「往上一層」只在版型裡換；到頂有提示', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 三格', exact: true }).tap();
  await page.getByTestId('layout-confirm').tap();
  await expect(page.getByTestId('layout-options')).toHaveCount(0, { timeout: 30_000 });
  await showTimeline(page);
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('group-add').tap();
    await page.getByTestId('group-add-text').tap(); // 同一秒的兩個文字 → 兩條成員軌
  }
  const members = async () =>
    (await tracks(page)).filter((t) => t.groupRole === 'member' && t.kind === 'text');
  expect(await members()).toHaveLength(2);
  const [low, high] = await members();
  // 最上面那條再往上 → 提示
  const chips = page.locator('.track.sub-row[data-kind="text"] [data-testid="track-chip"]');
  await expect(chips).toHaveCount(2);
  await chips.first().tap(); // 畫面上最上面那條＝陣列最後（最上層）
  await page.getByRole('button', { name: /往上一層/ }).tap();
  await expect(page.locator('.toast').filter({ hasText: '已經是版型裡最上面' })).toBeVisible();
  // 最下面那條往上一層 → 兩條換位置
  await chips.last().tap();
  await page.getByRole('button', { name: /往上一層/ }).tap();
  const after = await members();
  expect(after[0]!.id).toBe(high!.id);
  expect(after[1]!.id).toBe(low!.id);
});
