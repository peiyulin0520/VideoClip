import { expect, test, type Page } from '@playwright/test';
import {
  addOverlays,
  createProjectWith,
  exportFrame,
  isGreen,
  isRed,
  openTab,
  project,
  samplePreview,
  showTimeline,
  undo,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-12';
type Tr = { id: string; kind: string; name: string };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];
const kinds = async (page: Page) => (await tracks(page)).map((t) => t.kind).join(',');
const listKinds = (page: Page) =>
  page
    .getByTestId('layer-row')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind).join(','));
const textRow = (page: Page) => page.locator('[data-testid="layer-row"][data-kind="text"]');

async function sandwichProject(page: Page) {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  // 預設：影像（紅）、影像（綠）、字卡 → 字卡在最上面
  expect(await kinds(page)).toBe('media,media,text');
}

test('X9 夾心：圖層分頁把文字往下一層＝夾在兩個影像中間；復原一步回到原樣；顯示種類與第幾層', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await sandwichProject(page);
  await openTab(page, '圖層');
  expect(await listKinds(page)).toBe('text,media,media');
  const nos = await page.getByTestId('layer-no').allTextContents();
  expect(nos).toEqual(['第 3 層', '第 2 層', '第 1 層']);
  await expect(textRow(page).locator('.layer-kind')).toHaveText('字卡');
  await page.screenshot({ path: `${SHOT}/x9-layers-before-390.png` });

  await textRow(page)
    .getByRole('button', { name: /往下一層/ })
    .tap();
  expect(await kinds(page)).toBe('media,text,media'); // 文字夾在紅、綠中間
  expect(await listKinds(page)).toBe('media,text,media');
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  const ex = await exportFrame(page, 0.5, [[0.5, 0.5]]);
  const px = (ex as unknown as { samples: number[][] }).samples[0]!;
  expect(isGreen([px[0]!, px[1]!, px[2]!, 255])).toBe(true); // 匯出跟預覽一致
  await page.screenshot({ path: `${SHOT}/x9-layers-sandwich-390.png` });

  // 播放軸照舊分類：字卡在上、影像在下；影像那一類中間夾了字卡 → 標題有「已穿插」
  await showTimeline(page);
  const heads = await page
    .getByTestId('cat-head')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind).join(','));
  expect(heads).toBe('text,media');
  await expect(
    page.locator('[data-testid="cat-head"][data-kind="media"]').getByTestId('cat-mixed'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="cat-head"][data-kind="text"]').getByTestId('cat-mixed'),
  ).toHaveCount(0);
  await page.screenshot({ path: `${SHOT}/x9-timeline-mixed-390.png` });

  await undo(page);
  expect(await kinds(page)).toBe('media,media,text');
});

test('X9 播放軸換順序只在同一類、跨過夾在中間的別類，不打亂夾心；主軌不特別', async ({ page }) => {
  test.setTimeout(120_000);
  await sandwichProject(page);
  const [red, green, text] = await tracks(page);
  await openTab(page, '圖層');
  await textRow(page)
    .getByRole('button', { name: /往下一層/ })
    .tap(); // [紅, 文字, 綠]
  expect((await tracks(page)).map((t) => t.id)).toEqual([red!.id, text!.id, green!.id]);
  await showTimeline(page);
  // 播放軸上把紅（最下面的影像、也是原本的主軌）往上一層 → 跨過文字，跑到綠上面：[文字, 綠, 紅]
  await page.locator(`[data-testid="track"][data-track-id="${red!.id}"] [data-testid="track-chip"]`).tap();
  await page.locator('.menu-item', { hasText: '往上一層' }).tap();
  expect((await tracks(page)).map((t) => t.id)).toEqual([text!.id, green!.id, red!.id]);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 文字軌在播放軸上只有一條字卡：往上一層＝提示到圖層分頁調整
  await page.locator(`[data-testid="track"][data-track-id="${text!.id}"] [data-testid="track-chip"]`).tap();
  await page.locator('.menu-item', { hasText: '往上一層' }).tap();
  await expect(page.locator('.toast').filter({ hasText: '到「圖層」分頁調整' })).toBeVisible();
});

test('X9 圖層分頁「更多排序」：移到最下層／最上層；已穿插的小標點了切到圖層分頁', async ({ page }) => {
  test.setTimeout(120_000);
  await sandwichProject(page);
  await openTab(page, '圖層');
  await textRow(page)
    .getByRole('button', { name: /更多排序/ })
    .tap();
  await page.getByRole('button', { name: /移到最下層/ }).tap();
  expect(await kinds(page)).toBe('text,media,media');
  expect(await listKinds(page)).toBe('media,media,text');
  await textRow(page)
    .getByRole('button', { name: /更多排序/ })
    .tap();
  await page.getByRole('button', { name: /移到最上層/ }).tap();
  expect(await kinds(page)).toBe('media,media,text');
  // 最上面再移到最上層 → 提示
  await textRow(page)
    .getByRole('button', { name: /更多排序/ })
    .tap();
  await page.getByRole('button', { name: /移到最上層/ }).tap();
  await expect(page.locator('.toast').filter({ hasText: '已經是最上面的圖層' })).toBeVisible();

  // 夾心之後到播放軸，點「已穿插」→ 切到圖層分頁
  await textRow(page)
    .getByRole('button', { name: /往下一層/ })
    .tap();
  await openTab(page, '剪輯');
  await showTimeline(page);
  await page.locator('[data-testid="cat-head"][data-kind="media"]').getByTestId('cat-mixed').tap();
  await expect(page.getByTestId('layer-list')).toBeVisible();
});

test('X9 圖層分頁 320 寬：每一列的按鈕不換行、不橫向捲動', async ({ page }) => {
  test.setTimeout(120_000);
  await sandwichProject(page);
  await openTab(page, '圖層');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.waitForTimeout(200);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const row of Array.from(document.querySelectorAll('[data-testid="layer-row"]'))) {
      for (const b of Array.from(row.querySelectorAll('button'))) {
        const r = b.getBoundingClientRect();
        if (r.right > window.innerWidth + 0.5) out.push(`${b.getAttribute('aria-label')} 超出螢幕`);
      }
      const btns = Array.from(row.querySelectorAll('.layer-btns button')).map(
        (b) => b.getBoundingClientRect().top,
      );
      if (Math.max(...btns) - Math.min(...btns) > 2) out.push('按鈕換行');
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('橫向捲動');
    return out;
  });
  expect(bad).toEqual([]);
  await page.screenshot({ path: `${SHOT}/x9-layers-320.png` });
});

test('X9 版型是一整塊：圖層分頁把外面的影像往下一層＝一次跨過整個版型（格子、外框、版型文字不被拆開）', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 三格', exact: true }).tap();
  await page.getByTestId('layout-confirm').tap();
  await expect(page.getByTestId('layout-options')).toHaveCount(0, { timeout: 30_000 });
  await showTimeline(page);
  await page.getByTestId('group-add').tap();
  await page.getByTestId('group-add-text').tap();
  await addOverlays(page, ['solid-green.webm']);
  type G = { id: string; kind: string; groupRole?: string };
  const order = async () =>
    ((await project(page)).tracks as unknown as G[]).map((t) => `${t.groupRole ?? t.kind}`);
  const before = await order();
  // 版型文字（成員軌）緊貼在外框那一列的上面；綠色的影像軌在最上面
  expect(before).toEqual(['media', 'cell', 'cell', 'cell', 'media', 'member', 'media']);
  const greenId = ((await project(page)).tracks as unknown as G[])[6]!.id;
  await openTab(page, '圖層');
  const green = page.locator('[data-testid="layer-row"]').first();
  await green.getByRole('button', { name: /往下一層/ }).tap();
  const tr = (await project(page)).tracks as unknown as G[];
  // 綠色一次跨過整個版型塊（格子＋外框＋文字），跑到藍色主軌上面、版型塊下面
  expect(tr.map((t) => `${t.groupRole ?? t.kind}`)).toEqual([
    'media',
    'media',
    'cell',
    'cell',
    'cell',
    'media',
    'member',
  ]);
  expect(tr[1]!.id).toBe(greenId);
});
