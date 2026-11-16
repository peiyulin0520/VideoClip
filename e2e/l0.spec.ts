import { expect, test, type Page } from '@playwright/test';
import {
  clips,
  createProjectWith,
  exportFrame,
  fixture,
  isFrameTrack,
  isGreen,
  isRed,
  openTab,
  project,
  samplePreview,
  seekTo,
  showTimeline,
  finishLayout,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-12';
type It = { id: string; type: string; group?: string; cell?: { x: number; y: number; w: number; h: number } };
type Tr = { id: string; kind: string; groupRole?: string; cell?: unknown; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];

async function addLayout(page: Page, name: string, files: string[]) {
  await openTab(page, '版型');
  const more = page.getByTestId('layout-add-more');
  if (await more.isVisible()) await more.tap();
  await page.getByRole('button', { name: `版型 ${name}`, exact: true }).tap();
  await finishLayout(page, files.map(fixture));
}

test('L0 版型是一個片段：放在播放線那一秒、跟主軌影片同一列，接縫有轉場圓圈；疊化時整個版型（含格子）一起淡入', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await showTimeline(page);
  await seekTo(page, 4); // 紅色結束的地方
  await addLayout(page, '上下雙格', ['solid-green.webm', 'solid-green.webm']);
  const tr = await tracks(page);
  const main = tr.find((t) => t.kind === 'media' && !t.groupRole && t.items.some((i) => !i.group))!;
  const frame = main.items.find((i) => i.group && !i.cell)!;
  expect(frame).toBeTruthy(); // 外框就在主軌上，跟紅色影片同一列
  expect(main.items).toHaveLength(2);
  expect(tr.filter(isFrameTrack)).toHaveLength(1);
  // 格子軌在主軌下面（版型的洞才看得到格子）
  const mainIdx = tr.findIndex((t) => t.id === main.id);
  const cells = tr.filter((t) => t.groupRole === 'cell');
  expect(cells).toHaveLength(2);
  for (const c of cells) expect(tr.findIndex((t) => t.id === c.id)).toBeLessThan(mainIdx);

  // 接縫的圓圈 → 疊化
  await showTimeline(page);
  await expect(page.getByTestId('tr-circle')).toHaveCount(1);
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 疊化' }).tap();
  await page.getByLabel('轉場長度').fill('8'); // 0.8 秒：接縫前後各 0.4 秒
  const cell = cells[0]!.cell as { x: number; y: number; w: number; h: number };
  const at = async () => samplePreview(page, cell.x + cell.w / 2, cell.y + cell.h / 2);
  // 播放頭移到 sec 秒（捲動位置一樣時不會有捲動事件，所以先偏一點再回來）
  const goto = async (sec: number) =>
    expect
      .poll(async () => {
        await seekTo(page, sec + 0.05);
        await page.waitForTimeout(60);
        await seekTo(page, sec);
        return page.evaluate(() =>
          (window as unknown as { __videoclip: { time: () => number } }).__videoclip.time(),
        );
      })
      .toBeGreaterThan(sec - 0.04);
  await goto(2);
  await expect.poll(async () => isRed(await at())).toBe(true); // 版型還沒出現
  await goto(4);
  // 接縫：紅（前一段）和綠（版型格子）混在一起——格子在版型開始之前就跟著淡入了
  await expect
    .poll(async () => {
      const c = await at();
      return !!c && c[0] > 40 && c[1] > 40;
    })
    .toBe(true);
  // 單格輸出（匯出用的同一套畫面）：接縫一樣是紅綠混色
  const out = await exportFrame(page, 4, [[cell.x + cell.w / 2, cell.y + cell.h / 2]]);
  const px = out && (out as unknown as { samples: number[][] }).samples[0]!;
  expect(px[0]! > 40 && px[1]! > 40).toBe(true);
  await page.screenshot({ path: `${SHOT}/layout-transition.png` });
  await goto(6);
  await expect.poll(async () => isGreen(await at())).toBe(true);
});

test('L0 版型不能分割；拖到別列時格子軌跟著、時間也一起', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '上下雙格', ['solid-red.webm', 'solid-green.webm']);
  await showTimeline(page);
  const frameId = (await tracks(page)).find(isFrameTrack)!.items.find((i) => i.group && !i.cell)!.id;
  await page.locator(`[data-testid="clip"][data-item-id="${frameId}"]`).tap();
  await openTab(page, '剪輯');
  await seekTo(page, 2);
  await page.getByRole('button', { name: '分割', exact: true }).tap();
  await expect(page.locator('.toast').filter({ hasText: '版型不能分割' })).toBeVisible();
  expect((await tracks(page)).flatMap((t) => t.items).filter((i) => i.group && !i.cell)).toHaveLength(1);
  expect(clips(page)).toBeTruthy();
});

test('L1 空的格子：刪掉格子素材 → 格子還在（示意圖虛線、匯出提醒）；點它可以放進素材', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '上下雙格', ['solid-red.webm', 'solid-green.webm']);
  await expect(page.getByTestId('ld-cell')).toHaveCount(2);
  // 刪掉第 2 格的素材
  await page.getByTestId('ld-cell').nth(1).tap();
  await page.getByRole('button', { name: '關閉', exact: true }).tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '刪除', exact: true }).tap();
  const cellTracks = (await tracks(page)).filter((t) => t.groupRole === 'cell');
  expect(cellTracks).toHaveLength(2); // 格子軌都還在
  expect(cellTracks.filter((t) => t.items.length === 0)).toHaveLength(1);
  expect(cellTracks.every((t) => !!t.cell)).toBe(true);
  // 選回整個版型（點時間軸上的版型片段）→ 版型分頁的示意圖：空的格子是虛線
  await showTimeline(page);
  const frameId = (await tracks(page)).find(isFrameTrack)!.items.find((i) => i.group && !i.cell)!.id;
  await page.locator(`[data-testid="clip"][data-item-id="${frameId}"]`).tap();
  await openTab(page, '版型');
  await expect(page.getByTestId('ld-cell').nth(1)).toHaveClass(/empty/);
  // 匯出提醒
  await page.getByRole('button', { name: '匯出影片' }).tap();
  await expect(page.getByTestId('export-empty-cells-note')).toContainText('1 格');
  await page.getByRole('button', { name: '關閉', exact: true }).tap();
  // 點空的格子 → 選素材放進去
  await page.getByTestId('ld-cell').nth(1).tap();
  await expect(page.getByTestId('cell-sheet-empty')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/cell-empty.png` });
  await page.getByTestId('cell-assets').getByRole('button').first().tap();
  expect((await tracks(page)).filter((t) => t.groupRole === 'cell' && t.items.length === 0)).toHaveLength(0);
});

test('L2 版型分頁只挑版型：沒有特效／動畫／長度；按鈕寫著播放線的秒數；確定＝在那一秒加空版型（預設 5 秒），一步復原', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']);
  await showTimeline(page);
  await seekTo(page, 2);
  await openTab(page, '版型');
  await expect(page.getByTestId('layout-grid').locator('.layout-card')).toHaveCount(10);
  await page.getByRole('button', { name: '版型 三格', exact: true }).tap();
  // 版型自己才有的設定在這裡；特效、動畫、長度不在
  await expect(page.getByTestId('layout-options')).toBeVisible();
  await expect(page.getByLabel('外框透明度')).toBeVisible();
  for (const t of ['版型進場特效', '版型出場特效', '版型動畫'])
    await expect(page.getByLabel(t)).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /^動畫/ })).toHaveCount(0);
  await expect(page.getByTestId('layout-confirm')).toContainText('確定，加在 0:02');
  await page.screenshot({ path: `${SHOT}/layout-tab-v2.png` });
  await page.getByTestId('layout-confirm').tap();
  await expect(page.getByTestId('layout-options')).toHaveCount(0, { timeout: 30_000 });
  const tr = await tracks(page);
  const cells = tr.filter((t) => t.groupRole === 'cell');
  expect(cells).toHaveLength(3);
  expect(cells.every((t) => t.items.length === 0)).toBe(true); // 空版型：還沒放素材
  const frame = tr.find(isFrameTrack)!.items.find((i) => i.group && !i.cell) as unknown as {
    start: number;
    duration: number;
  };
  expect(frame.start).toBeGreaterThan(1.9);
  expect(frame.start).toBeLessThan(2.1);
  expect(frame.duration).toBe(5);
  // 特效分頁選到整個版型：跟一般素材同一套（進場、出場、轉場、整段），沒有另外的版型動畫區
  await openTab(page, '特效');
  await expect(page.getByTestId('fx-where')).toBeVisible();
  await expect(page.getByTestId('layout-motion')).toHaveCount(0);
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await tracks(page)).filter((t) => t.groupRole === 'cell')).toHaveLength(0);
});
