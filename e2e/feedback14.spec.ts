import { expect, test, type Page } from '@playwright/test';
import {
  addOverlays,
  closePanel,
  createProjectWith,
  finishLayout,
  fixture,
  isBlue,
  isGreen,
  isRed,
  isWhite,
  openTab,
  openTool,
  project,
  regionHash,
  samplePreview,
  seekTo,
  selectFrame,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-14';
type Cell = { x: number; y: number; w: number; h: number };
type It = {
  id: string;
  type: string;
  group?: string;
  cell?: Cell;
  frameStyle?: { box?: { w: number; h: number } };
  kinetic?: { id: string; sub?: string; end?: string };
};
type Tr = { groupRole?: string; cell?: Cell; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];

async function layoutSetup(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  await selectFrame(page);
  await openTab(page, '版型');
}

test('回報14 拖邊調整整體大小套用後：舊的外框圖不能留在底下（版型不會疊成兩個）', async ({ page }) => {
  test.setTimeout(150_000);
  await layoutSetup(page);
  // 套用前：版型占滿畫面，左邊緣是外框（白）
  await expect.poll(async () => isWhite(await samplePreview(page, 0.03, 0.5))).toBe(true);
  await openTool(page, 'layout.size');
  await page.getByTestId('layout-resize').tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  const h = (await page.getByTestId('layout-h-r').boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 120, y, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('layout-resize-apply').tap();
  await expect
    .poll(
      async () =>
        (await tracks(page)).flatMap((t) => t.items).find((i) => i.frameStyle)?.frameStyle?.box?.w ?? 1,
    )
    .toBeLessThan(0.9);
  // 版型縮窄之後，原本的邊緣露出底下的主軌（藍）；舊的外框（白）不能還留著
  await expect.poll(async () => isBlue(await samplePreview(page, 0.03, 0.5)), { timeout: 15_000 }).toBe(true);
  await page.screenshot({ path: `${SHOT}/box-resize-no-ghost-390.png` });
});

test('回報14 拖各格大小套用後：舊的分隔線不能還留著', async ({ page }) => {
  test.setTimeout(180_000);
  await layoutSetup(page);
  const before = (await tracks(page)).filter((t) => t.groupRole === 'cell').map((t) => t.cell!);
  const gapY = (before[0]!.y + before[0]!.h + before[1]!.y) / 2; // 兩格之間原本的線
  await openTool(page, 'layout.size');
  await page.getByTestId('layout-cell-resize').scrollIntoViewIfNeeded();
  await openTool(page, 'layout.size');
  await page.getByTestId('layout-cell-resize').tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  const hd = (await page.getByTestId('lc-handle-h').boundingBox())!;
  const x = hd.x + hd.width / 2;
  const y = hd.y + hd.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 80, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('cell-resize-apply').tap();
  await expect
    .poll(async () => (await tracks(page)).filter((t) => t.groupRole === 'cell')[0]!.cell!.h, {
      timeout: 20_000,
    })
    .toBeGreaterThan(before[0]!.h + 0.02);
  // 舊的線的位置現在在第 1 格裡面（紅）
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, gapY)), { timeout: 15_000 }).toBe(true);
});

test('回報14 版型分頁：「整個版型」與「各格」的按鈕分成兩組、中間有空隙；寬 × 高有標題', async ({ page }) => {
  test.setTimeout(120_000);
  await layoutSetup(page);
  await openTool(page, 'layout.size');
  const a = (await page.getByTestId('layout-resize').boundingBox())!;
  await openTool(page, 'layout.size');
  const b = (await page.getByTestId('layout-cell-resize').boundingBox())!;
  expect(b.y - (a.y + a.height)).toBeGreaterThanOrEqual(10);
  await expect(page.getByTestId('layout-size-now')).toHaveText('100% × 100%');
  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 844 });
    await openTool(page, 'layout.size');
    const z = (await page.getByTestId('layout-shape').boundingBox())!;
    for (const id of ['layout-resize', 'layout-size-reset', 'layout-cell-resize', 'layout-cell-reset']) {
      const r = (await page.getByTestId(id).boundingBox())!;
      expect(r.x + r.width, `${id}@${w}`).toBeLessThanOrEqual(z.x + z.width + 0.5);
    }
  }
  await page.screenshot({ path: `${SHOT}/layout-size-zone-390.png` });
});

test('回報14 調整版型大小：「寬 × 高、套用」那一排不蓋住任何把手', async ({ page }) => {
  test.setTimeout(120_000);
  await layoutSetup(page);
  await openTool(page, 'layout.size');
  await page.getByTestId('layout-resize').tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  const card = (await page.locator('.lr-card').boundingBox())!;
  for (const e of ['l', 'r', 't', 'b', 'tl', 'tr', 'bl', 'br']) {
    const h = (await page.getByTestId(`layout-h-${e}`).boundingBox())!;
    const overlap =
      h.x < card.x + card.width &&
      h.x + h.width > card.x &&
      h.y < card.y + card.height &&
      h.y + h.height > card.y;
    expect(overlap, `把手 ${e} 被蓋住`).toBe(false);
  }
  await page.screenshot({ path: `${SHOT}/layout-resize-card-390.png` });
});

test('回報14 特效工具列：選了特效之後，〔文字特效〕按鈕的字不被切掉', async ({ page }) => {
  test.setTimeout(120_000);
  await addKinetic(page);
  await openTool(page, 'fx.textfx');
  await page.getByTestId('kn-group-flow').tap();
  await openTool(page, 'fx.textfx');
  await page.locator('[data-testid="kn-card"][data-kn-id="crawl"]').tap();
  await closePanel(page);
  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 844 });
    for (const id of ['fx.textfx']) {
      const t = await page
        .getByTestId(`tool-${id}`)
        .evaluate((el) => [el.scrollWidth, el.clientWidth, el.querySelector('span:last-child')!.scrollWidth]);
      expect(t[0], `@${w} ${id}`).toBeLessThanOrEqual(t[1]! + 1);
    }
  }
  await page.screenshot({ path: `${SHOT}/effect-part-tab-390.png` });
});

test('回報14 進專案、重新整理都從最上面開始', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.reload();
  await page
    .getByTestId('stage')
    .waitFor({ state: 'attached' })
    .catch(() => undefined);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('回報14 裁切：筆刷、橡皮擦時沒有粉紅框線（直接看結果），切回自由才看得到框線', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await openTab(page, '剪輯');
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await page.getByTestId('tool-edit.crop').tap();
  await page.getByTestId('crop-tool-lasso').tap();
  await page.getByLabel('距離').fill('0'); // 自由裁切也有〔距離〕（預設 70）：這個測試要畫在手指位置
  const fr = (await page.getByTestId('crop-frame').boundingBox())!;
  const cx = fr.x + fr.width / 2;
  const cy = fr.y + fr.height / 2;
  await page.mouse.move(cx + fr.width * 0.4, cy);
  await page.mouse.down();
  for (let i = 1; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    await page.mouse.move(cx + fr.width * 0.4 * Math.cos(a), cy + fr.height * 0.4 * Math.sin(a));
  }
  await page.mouse.up();
  await expect(page.getByTestId('crop-polygon')).toBeVisible();
  // 去掉的地方：自由工具是斜線、筆刷／橡皮擦是變暗的素材（Z26）
  const corner = () =>
    page.getByTestId('crop-tint').evaluate((c) => {
      const cv = c as HTMLCanvasElement;
      const d = cv.getContext('2d')!.getImageData(2, 2, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]!];
    });
  const dim = await corner();
  await page.getByTestId('crop-tool-brush').tap();
  await expect(page.getByTestId('crop-polygon')).toHaveCount(0);
  const checker = await corner();
  void dim; // 變暗跟斜線版的角落像素一樣（都是半透明黑），差別只在斜線，這裡不比對
  // 筆刷、橡皮擦：去掉的地方只是把素材變暗（半透明的黑，看得到底下），不是不透明棋盤格（Z26）
  expect(checker[3]).toBeGreaterThan(100);
  expect(checker[3]).toBeLessThan(200);
  expect(checker[0]).toBeLessThan(40);
  await page.screenshot({ path: `${SHOT}/crop-brush-view-390.png` });
  await page.getByTestId('crop-tool-erase').tap();
  await expect(page.getByTestId('crop-polygon')).toHaveCount(0);
  await page.getByTestId('crop-tool-lasso').tap();
  await expect(page.getByTestId('crop-polygon')).toBeVisible();
});

async function addKinetic(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  await page.getByLabel('文字內容').fill('蔡氏家族聚餐');
  await openTab(page, '特效');
  await openTool(page, 'fx.textfx');
}
const textItem = async (page: Page) =>
  (await tracks(page)).flatMap((t) => t.items).find((i) => i.type === 'text')!;

test('回報14 副標：有副標的特效，〔內容〕視窗多一個輸入框（名稱照用途），打了就存進字卡；沒有副標的特效沒有', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await addKinetic(page);
  await page.getByTestId('kn-group-flow').tap();
  await page.locator('[data-testid="kn-card"][data-kn-id="crawl"]').tap();
  // 特效視窗裡不再有副標輸入框；到文字類別的〔內容〕輸入
  await expect(page.getByTestId('kn-sub-input')).toHaveCount(0);
  await openTab(page, '文字');
  await openTool(page, 'text.content');
  await expect(page.getByTestId('kn-sub-input')).toBeVisible();
  await expect(page.getByLabel('底部小字')).toBeVisible();
  await page.getByTestId('kn-sub-input').fill('家族大團圓');
  await expect.poll(async () => (await textItem(page)).kinetic?.sub).toBe('家族大團圓');
  await page.getByTestId('kn-sub-input').fill('');
  await expect.poll(async () => (await textItem(page)).kinetic?.sub).toBeUndefined();
  await openTab(page, '特效');
  await openTool(page, 'fx.textfx');
  await page.getByTestId('kn-group-sp').tap();
  await page.locator('[data-testid="kn-card"][data-kn-id="cube"]').tap();
  await openTab(page, '文字');
  await openTool(page, 'text.content');
  await expect(page.getByTestId('kn-sub-input')).toHaveCount(0);
  await page.screenshot({ path: `${SHOT}/kinetic-sub-390.png` });
});

test('回報14 字卡比一輪長時：重複播放／停在最後畫面（每一式都有，一直在跑的停在代表畫面）', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await addKinetic(page);
  await openTool(page, 'fx.textfx');
  await page.getByTestId('kn-group-in').tap();
  await openTool(page, 'fx.textfx');
  await page.locator('[data-testid="kn-card"][data-kn-id="burst"]').tap();
  await expect(page.getByTestId('kn-end-loop')).toBeVisible();
  await expect(page.getByTestId('kn-end-loop')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('kn-end-hold').tap();
  await expect.poll(async () => (await textItem(page)).kinetic?.end).toBe('hold');
  await page.getByTestId('kn-end-loop').tap();
  await expect.poll(async () => (await textItem(page)).kinetic?.end).toBeUndefined();
  await openTool(page, 'fx.textfx');
  await page.getByTestId('kn-group-flow').tap();
  await openTool(page, 'fx.textfx');
  await page.locator('[data-testid="kn-card"][data-kn-id="crawl"]').tap();
  await expect(page.getByTestId('kn-end-hold')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/kinetic-end-390.png` });
});

test('回報14 停在最後畫面：選了之後過了停點畫面不再動；重複播放照舊一直動（含一直在跑的巨字橫移）', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await addKinetic(page);
  await openTool(page, 'fx.textfx');
  await page.getByTestId('kn-group-flow').tap();
  await openTool(page, 'fx.textfx');
  await page.locator('[data-testid="kn-card"][data-kn-id="crawl"]').tap();
  const it = await textItem(page);
  const dur = ((await project(page)).tracks as unknown as { items: { id: string; duration: number }[] }[])
    .flatMap((t) => t.items)
    .find((i) => i.id === it.id)!.duration;
  expect(dur).toBeGreaterThan(2.8);
  const full: [number, number, number, number] = [0, 0, 1, 1];
  const at = async (t: number) => {
    await seekTo(page, t);
    await page.waitForTimeout(400);
    return regionHash(page, full);
  };
  // 重複播放：一直在動
  expect(await at(1.9)).not.toBe(await at(2.8));
  // 停在最後畫面：停點（巨字橫移＝代表畫面 1.5 秒）之後不再動
  await page.getByTestId('kn-end-hold').tap();
  expect(await at(1.9)).toBe(await at(2.8));
  expect(await at(0.5)).not.toBe(await at(1.9)); // 停點之前照樣在動
});
