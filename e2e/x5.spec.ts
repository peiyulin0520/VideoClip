import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWith,
  finishLayout,
  fixture,
  isFrameTrack,
  openTab,
  openTool,
  project,
  trimClipEnd,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-12';
type It = {
  id: string;
  type: string;
  label?: string;
  group?: string;
  cellFor?: string;
  cell?: { x: number; y: number; w: number; h: number };
  start: number;
  duration: number;
  speed: number;
  trimIn: number;
  card?: { runs: { text: string; color: string }[] };
};
type Tr = { id: string; kind: string; groupRole?: string; group?: string; fill?: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];
const cellTracks = async (page: Page) => (await tracks(page)).filter((t) => t.groupRole === 'cell');
const dialog = (page: Page) => page.getByRole('dialog').last();
const close = (page: Page) => dialog(page).getByRole('button', { name: '關閉', exact: true }).tap();

async function addLayout(page: Page, name: string, files: string[], color?: string) {
  await openTab(page, '版型');
  const more = page.getByTestId('layout-add-more');
  if (await more.isVisible()) await more.tap();
  await page.getByRole('button', { name: `版型 ${name}`, exact: true }).tap();
  if (color)
    await page
      .getByTestId('layout-options')
      .getByRole('radio', { name: `外框 ${color}` })
      .tap();
  await finishLayout(page, files.map(fixture));
}

test('X5-1 示意圖：每一格有按鈕和縮圖；外框畫成實際的顏色與透明度；挑版型的縮圖也跟著外框顏色', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  // 版型分頁：選版型＋粉色外框 → 版型縮圖跟著變粉色
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await page.getByTestId('layout-options').getByRole('radio', { name: '外框 粉' }).tap();
  const thumb = page.getByRole('button', { name: '版型 上下雙格', exact: true }).locator('.layout-thumb');
  const pixel = (loc: typeof thumb, nx: number, ny: number) =>
    loc.evaluate(
      (c, [x, y]) => {
        const cv = c as HTMLCanvasElement;
        return [
          ...cv.getContext('2d')!.getImageData(Math.floor(x! * cv.width), Math.floor(y! * cv.height), 1, 1)
            .data,
        ];
      },
      [nx, ny] as const,
    );
  const edge = await pixel(thumb, 0.5, 0.01); // 外框的邊（不是格子）
  expect(edge[0]).toBeGreaterThan(200); // 粉色：紅高
  expect(edge[1]).toBeLessThan(edge[0]!);
  await finishLayout(page, ['clip-a.webm', 'solid-red.webm'].map(fixture));

  const diagram = page.getByTestId('layout-diagram');
  await expect(diagram).toBeVisible();
  await openTool(page, 'layout.cells');
  await expect(page.getByTestId('ld-cell')).toHaveCount(2);
  await openTool(page, 'layout.cells');
  await expect(page.getByTestId('ld-cell').nth(0)).toHaveAttribute('aria-label', /^第 1 格/);
  await openTool(page, 'layout.cells');
  await expect(page.getByTestId('ld-cell').nth(1)).toHaveAttribute('aria-label', /^第 2 格/);
  // 外框那層畫成粉色
  const ex = await pixel(diagram.locator('.ld-frame'), 0.5, 0.01);
  expect(ex[0]).toBeGreaterThan(200);
  expect(ex[3]).toBeGreaterThan(200);
  await page.screenshot({ path: `${SHOT}/layout-diagram.png` });
});

test('X5-2 這一格視窗：改名套用（視窗不關）、❌ 不存；換素材；選片段範圍；空白畫面（顏色＋文字＋前後）；慢動作', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '上下雙格', ['clip-a.webm', 'solid-red.webm']); // clip-a 2 秒、紅 4 秒；版型預設 5 秒
  await openTab(page, '版型');
  await openTool(page, 'layout.play');
  await page.getByRole('radio', { name: '空檔 色塊' }).tap(); // 這幾個測試要的是「空檔畫色塊」那一套
  const cell1 = async () => (await cellTracks(page))[0]!;

  // 名稱：改了按 ❌ → 沒變；改了按套用 → 變，視窗還開著
  await openTool(page, 'layout.cells');
  await page.getByTestId('ld-cell').first().tap();
  await expect(dialog(page)).toHaveAccessibleName('第 1 格');
  await page.getByLabel('這一格的名稱').fill('不會存');
  await close(page);
  expect((await cell1()).items[0]!.label).toBeUndefined();
  await openTool(page, 'layout.cells');
  await page.getByTestId('ld-cell').first().tap();
  await page.getByLabel('這一格的名稱').fill('主角');
  await page.getByTestId('cell-apply').tap();
  await expect(dialog(page)).toBeVisible();
  expect((await cell1()).items[0]!.label).toBe('主角');
  await expect(page.getByRole('button', { name: /^第 1 格 主角/ })).toBeVisible(); // 示意圖也用新名字

  // 素材比這一格短：預設「空白畫面」；選放前面、粉色、文字 END → 套用
  await expect(page.getByTestId('cell-length-note')).toContainText('素材可用 2.0 秒，這一格 5.0 秒');
  await expect(page.getByTestId('cell-mode-blank')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('cell-pos-before').tap();
  await page.getByRole('button', { name: '空白畫面顏色 #ff4d8d' }).tap();
  await page.getByLabel('空白畫面文字').fill('END');
  await page.getByTestId('cell-apply').tap();
  const g = (await tracks(page)).find(isFrameTrack)!.items[0]!;
  const c1 = await cell1();
  expect(c1.fill).toBe('#ff4d8d');
  expect(c1.items[0]!.start).toBeCloseTo(g.start + 3, 2); // 前面空白 3 秒（5−2），素材從第 3 秒開始
  const txt = (await tracks(page)).flatMap((t) => t.items).find((x) => x.cellFor === c1.id)!;
  expect(txt.card!.runs[0]!.text).toBe('END');
  expect(txt.start).toBeCloseTo(g.start, 2);
  expect(txt.duration).toBeCloseTo(3, 2);
  await page.screenshot({ path: `${SHOT}/cell-sheet.png` });

  // 慢動作：整段放進去 → speed ≈ 2/5，文字拿掉
  await page.getByTestId('cell-mode-fit').tap();
  await page.getByTestId('cell-apply').tap();
  const c2 = await cell1();
  expect(c2.items[0]!.speed).toBeCloseTo(0.4, 2);
  expect(c2.items[0]!.duration).toBeCloseTo(5, 2);
  expect(c2.items[0]!.start).toBeCloseTo(g.start, 2);
  expect((await tracks(page)).flatMap((t) => t.items).some((x) => x.cellFor)).toBe(false);
  await close(page);
});

test('X5-2 素材比這一格長：選片段範圍（只拖起點）、快動作', async ({ page }) => {
  test.setTimeout(180_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '上下雙格', ['solid-red.webm', 'solid-green.webm']); // 各 4 秒；版型預設 5 秒
  await openTab(page, '版型');
  await openTool(page, 'layout.play');
  await page.getByRole('radio', { name: '空檔 色塊' }).tap(); // 這幾個測試要的是「空檔畫色塊」那一套
  // 拖版型尾端縮短到比素材（4 秒）短
  const frameId = (await tracks(page)).find(isFrameTrack)!.items.find((i) => i.group && !i.cell)!.id;
  const L = await trimClipEnd(page, frameId, -2);
  expect(L).toBeLessThan(3.5);
  await openTab(page, '版型');
  await openTool(page, 'layout.cells');
  await page.getByTestId('ld-cell').first().tap();
  await expect(page.getByTestId('cell-length-note')).toContainText(`這一格 ${L.toFixed(1)} 秒`);
  await page.getByTestId('cell-range').tap();
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  const f = (await page.getByTestId('range-flag-start-0').boundingBox())!;
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width / 2 + strip.width * 0.1, f.y + f.height / 2, { steps: 6 });
  await page.mouse.up();
  // 迄跟著動：長度不變
  await page.getByTestId('rm-apply').tap();
  const it = (await cellTracks(page))[0]!.items[0]!;
  expect(it.trimIn).toBeGreaterThan(0.2);
  expect(it.trimIn).toBeLessThanOrEqual(1.01);
  expect(it.duration * it.speed).toBeCloseTo(L, 1);
  // 快動作
  await page.getByTestId('cell-mode-fit').tap();
  await page.getByTestId('cell-apply').tap();
  const it2 = (await cellTracks(page))[0]!.items[0]!;
  expect(it2.speed).toBeGreaterThan(1);
  expect(it2.duration).toBeCloseTo(L, 2);
});

test('X5-3 多個版型：選到版型時「新增版型」收合成一顆鈕；展開可以再加一個，兩個版型各自是一組', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '上下雙格', ['solid-red.webm', 'solid-green.webm']);
  await expect(page.getByTestId('group-panel')).toBeVisible();
  await expect(page.getByTestId('layout-grid')).toHaveCount(0); // 收合了
  await page.getByTestId('layout-add-more').tap();
  await expect(page.getByTestId('layout-grid')).toBeVisible();
  await addLayout(page, '三格', ['solid-red.webm', 'solid-green.webm', 'solid-blue.webm']);
  const groups = new Set((await tracks(page)).filter((t) => t.group).map((t) => t.group));
  expect(groups.size).toBe(2);
  await openTool(page, 'layout.cells');
  await expect(page.getByTestId('ld-cell')).toHaveCount(3); // 目前選到的是新的那個（三格）
});
