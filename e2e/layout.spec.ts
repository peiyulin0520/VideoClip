import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWith,
  fixture,
  isGreen,
  isRed,
  openTab,
  previewBox,
  project,
  samplePreview,
  selectedItemId,
  showTimeline,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-5/layout';
type Cell = { x: number; y: number; w: number; h: number };
type It = {
  id: string;
  type: string;
  assetId: string;
  group?: string;
  cell?: Cell;
  crop?: { l: number; t: number; r: number; b: number };
  duration: number;
  transform: { x: number; y: number; scale: number };
};
type Tr = { kind: string; name: string; locked: boolean; items: It[] };
const dims = async (page: Page) => (await project(page)) as unknown as { width: number; height: number };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];

async function addLayout(page: Page, name: string, color: string, files: string[]) {
  await openTab(page, '版型');
  await page.getByRole('button', { name: `版型 ${name}`, exact: true }).tap();
  await expect(page.getByTestId('layout-sheet')).toBeVisible();
  await page.getByRole('radio', { name: `外框 ${color}` }).tap();
  await page.getByTestId('layout-input').setInputFiles(files.map(fixture));
  await expect(page.getByTestId('layout-sheet')).toHaveCount(0, { timeout: 30_000 });
}
const center = (c: Cell): [number, number] => [c.x + c.w / 2, c.y + c.h / 2];
const near = (c: number[] | null, want: number[], tol = 40) =>
  !!c && want.every((v, i) => Math.abs(c[i]! - v) <= tol);

test('版型：拍貼機直條——4 格、外框、各格輪流放紅綠；外框鎖住，點預覽選到下面的格子；移除版型一步復原', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await expect(page.getByTestId('layout-grid').locator('.layout-card')).toHaveCount(8);
  await page.screenshot({ path: `${SHOT}/picker.png` });
  await addLayout(page, '拍貼機直條', '黑', ['solid-red.webm', 'solid-green.webm']);

  const tr = await tracks(page);
  const cellTracks = tr.filter((t) => t.items[0]?.cell);
  const frameTrack = tr.find((t) => t.name.startsWith('版型外框'))!;
  expect(cellTracks).toHaveLength(4);
  expect(frameTrack.locked).toBe(true); // 外框鎖住
  expect(tr.indexOf(frameTrack)).toBe(tr.length - 1); // 在最上層
  const group = cellTracks[0]!.items[0]!.group!;
  expect([...cellTracks, frameTrack].every((t) => t.items[0]!.group === group)).toBe(true);
  const p = await dims(page);
  const frameAsset = (await project(page)).assets.find(
    (a) => a.name === '版型-拍貼機直條.png',
  ) as unknown as {
    width: number;
    height: number;
  };
  expect(frameAsset.width).toBe(p.width);
  expect(frameAsset.height).toBe(p.height);

  // 四格輪流：紅、綠、紅、綠（素材只有 2 個）
  const want = [isRed, isGreen, isRed, isGreen];
  for (let i = 0; i < 4; i++) {
    const [cx, cy] = center(cellTracks[i]!.items[0]!.cell!);
    await expect.poll(async () => want[i]!(await samplePreview(page, cx, cy)), { timeout: 8000 }).toBe(true);
  }
  // 外框是黑色（格子左邊的邊框）；外框外面是底下的藍色主軌
  const c0 = cellTracks[0]!.items[0]!.cell!;
  expect(near(await samplePreview(page, c0.x - 0.02, c0.y + c0.h / 2), [20, 20, 20], 25)).toBe(true);
  expect(near(await samplePreview(page, 0.04, 0.5), [0, 0, 255], 40)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOT}/booth-strip.png` });

  // 點預覽上的格子：選到那一格（不是被鎖住的外框）
  const box = await previewBox(page);
  const [cx1, cy1] = center(cellTracks[1]!.items[0]!.cell!);
  await page.touchscreen.tap(box.x + cx1 * box.width, box.y + cy1 * box.height);
  await expect.poll(() => selectedItemId(page)).toBe(cellTracks[1]!.items[0]!.id);

  // 移除版型：外框與所有格子一起拿掉；一步復原
  await openTab(page, '版型');
  await page.getByRole('button', { name: '移除版型' }).tap();
  expect((await tracks(page)).length).toBe(1);
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await tracks(page)).length).toBe(6); // 主軌 + 4 格 + 外框
});

test('版型：每個版型都做得出來，格子數對、素材輪流或只用前面幾個；九宮格放 1 張照片', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  const cases: [string, string, number][] = [
    ['拍貼機 2×2', '白', 4],
    ['膠卷橫向', '黑', 3],
    ['膠卷直向', '黑', 3],
    ['拍立得', '白', 1],
    ['上下雙格', '粉', 2],
    ['三格', '奶茶', 3],
    ['九宮格', '白', 9],
  ];
  let total = 1;
  for (const [name, color, cells] of cases) {
    await addLayout(page, name, color, ['photo.png']);
    const tr = await tracks(page);
    total += cells + 1;
    expect(tr.length).toBe(total);
    expect(
      tr.filter((t) => t.items[0]?.cell && t.items[0]!.group === tr[tr.length - 1]!.items[0]!.group),
    ).toHaveLength(cells);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${SHOT}/${name.replace(/[ ×]/g, '')}.png` });
  }
});

test('版型：素材比格子多只用前面的；同時超過 5 支影片會提醒；照片裁成格子的比例', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  // 3 格的版型放 4 個素材：只用前 3 個
  await addLayout(page, '三格', '白', [
    'solid-red.webm',
    'solid-green.webm',
    'solid-blue.webm',
    'clip-a.webm',
  ]);
  const cells = (await tracks(page)).filter((t) => t.items[0]?.cell);
  expect(cells).toHaveLength(3);
  await expect(page.locator('.toast').filter({ hasText: '只用了前 3 個素材' })).toBeVisible();

  // 九宮格放 6 支影片：提醒同時播放太多
  const six = Array.from({ length: 6 }, () => 'solid-red.webm');
  await addLayout(page, '九宮格', '黑', six);
  await expect(page.locator('.toast').filter({ hasText: '同時播放超過 5 支影片' })).toBeVisible();
});

test('版型：拍立得的方形格子——4:3 照片置中裁成正方形，方框剛好等於格子', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '拍立得', '白', ['photo.png']); // 400×300
  const cell = (await tracks(page)).find((t) => t.items[0]?.cell)!.items[0]!;
  const p = await dims(page);
  expect(cell.crop!.t).toBe(0);
  expect(cell.crop!.l).toBeCloseTo(0.125, 3); // 400×300 取中間 300×300：左右各裁 12.5%
  expect(cell.crop!.r).toBeCloseTo(0.125, 3);
  // 方框大小＝格子大小：照片（400×300 裁成 300×300）以「完整」顯示在畫面裡的大小 × 縮放
  const base = Math.min(p.width / 300, p.height / 300) * 300;
  expect(base * cell.transform.scale).toBeCloseTo(cell.cell!.w * p.width, 1);
  expect(cell.transform.x).toBeCloseTo(cell.cell!.x + cell.cell!.w / 2, 5);
  expect(cell.transform.y).toBeCloseTo(cell.cell!.y + cell.cell!.h / 2, 5);
  // 照片中央（白色圓）出現在格子中央
  const [cx, cy] = center(cell.cell!);
  await expect.poll(async () => near(await samplePreview(page, cx, cy), [255, 255, 255], 30)).toBe(true);
});

test('版型的格子可以用裁切調整露出的範圍：預設鎖定格子比例，完成後畫面仍填滿格子', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '拍貼機直條', '白', ['clip-a.webm', 'clip-b.webm']);
  const cellTr = (await tracks(page)).filter((t) => t.items[0]?.cell);
  const it = cellTr[0]!.items[0]!;
  await showTimeline(page);
  await page.locator(`[data-testid="clip"][data-item-id="${it.id}"]`).tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '裁切' }).tap();
  await expect(page.getByTestId('crop-layer')).toBeVisible();
  await expect(page.getByRole('radio', { name: '格子比例' })).toHaveAttribute('aria-checked', 'true');
  // 鎖定比例後拖保留區域的角（縮小），再按完成
  await page.evaluate(() => window.scrollTo(0, 0));
  const h = (await page.getByTestId('crop-h-br').boundingBox())!;
  const fr = (await page.getByTestId('crop-frame').boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 - fr.width * 0.15, h.y + h.height / 2 - fr.height * 0.15, {
    steps: 5,
  });
  await page.mouse.up();
  await page.getByRole('button', { name: '完成' }).tap();
  const after = (await tracks(page)).filter((t) => t.items[0]?.cell)[0]!.items[0]!;
  expect(after.crop).toBeDefined();
  // 位置還是格子中心；方框大小還是格子大小（露出的範圍變小，縮放跟著重算）
  expect(after.transform.x).toBeCloseTo(it.transform.x, 5);
  expect(after.transform.y).toBeCloseTo(it.transform.y, 5);
  const d = await dims(page);
  const c = after.crop!;
  const cw = 320 * (1 - c.l - c.r); // clip-a 是 320×568
  const ch = 568 * (1 - c.t - c.b);
  const base = cw * Math.min(d.width / cw, d.height / ch);
  expect(base * after.transform.scale).toBeCloseTo(after.cell!.w * d.width, 1);
  expect(c.t + c.b).toBeGreaterThan(it.crop!.t + it.crop!.b + 0.05); // 真的縮小了露出的範圍
  const [cx, cy] = center(after.cell!);
  await expect.poll(async () => !!(await samplePreview(page, cx, cy))).toBe(true);
});
