import { expect, test } from '@playwright/test';
import {
  addOverlays,
  clips,
  createProjectWith,
  exportFrame,
  fixture,
  openTab,
  project,
  seekTo,
} from './helpers';

test('播放列：播放鍵只有圖示；定位、縮小、放大是圖示加中文；按住時有顏色回饋；定位開著時是主題色', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm']);
  const play = page.getByRole('button', { name: '播放', exact: true });
  expect(((await play.innerText()) ?? '').trim()).toBe('');
  await expect(page.getByRole('button', { name: '縮小時間軸' })).toContainText('縮小');
  await expect(page.getByRole('button', { name: '放大時間軸' })).toContainText('放大');
  await expect(page.getByTestId('kf-btn')).toContainText('定位');
  // 按住：底色疊一層主題色（box-shadow 跟沒按時不同）
  const zoom = page.getByRole('button', { name: '放大時間軸' });
  const shadow = () => zoom.evaluate((el) => getComputedStyle(el).boxShadow);
  const rest = await shadow();
  const b = (await zoom.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await expect.poll(shadow).not.toBe(rest);
  await page.mouse.up();
  await expect.poll(shadow).toBe(rest);
  await page.screenshot({ path: 'docs/screenshots/feedback-10/playbar.png' });
  // 定位：選到素材、新增定位後，按鈕變主題色底（aria-pressed）
  await clips(page).first().tap();
  const kf = page.getByTestId('kf-btn');
  const bg = () => kf.evaluate((el) => getComputedStyle(el).backgroundColor);
  const off = await bg();
  await seekTo(page, 0.5);
  await kf.tap();
  await expect(kf).toHaveAttribute('aria-pressed', 'true');
  expect(await bg()).not.toBe(off);
});

test('時間軸：最下面的影像軌跟其他軌一樣高；直式影片縮圖格最窄 18px 左右；片段名稱一行', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  const tracks = page.locator('[data-testid="track"]');
  const heights = await tracks.evaluateAll((els) =>
    els.map((el) => Math.round((el as HTMLElement).getBoundingClientRect().height)),
  );
  expect(heights.length).toBeGreaterThanOrEqual(2);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
  expect(heights[0]!).toBeLessThanOrEqual(34);
  const tile = await clips(page)
    .first()
    .locator('.tiles span')
    .first()
    .evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
  expect(tile).toBeLessThanOrEqual(22);
  const labelH = await clips(page)
    .first()
    .locator('.clip-label')
    .evaluate((el) => (el as HTMLElement).getBoundingClientRect().height);
  expect(labelH).toBeLessThanOrEqual(16);
  await page.screenshot({ path: 'docs/screenshots/feedback-10/timeline-low.png' });
});

type Tr = { kind: string; groupRole?: string; items: Item[] };
type Item = {
  id: string;
  type: string;
  group?: string;
  transform: { x: number; y: number };
  frameStyle?: { layout: string; color: string; opacity: number };
  assetId?: string;
  card?: { runs: { text: string; color: string; fontId: string }[] };
};
const allItems = async (page: import('@playwright/test').Page) =>
  ((await project(page)).tracks as unknown as Tr[]).flatMap((t) => t.items);

async function makeBooth(
  page: import('@playwright/test').Page,
  opts: { black?: boolean; opacity?: number } = {},
) {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 拍貼機直條', exact: true }).tap();
  if (opts.black) await page.getByRole('radio', { name: '外框 黑' }).tap();
  if (opts.opacity !== undefined)
    await page.getByLabel('外框透明度').fill(String(Math.round(opts.opacity * 100)));
  await page.getByTestId('layout-input').setInputFiles([fixture('solid-green.webm')]);
  await expect(page.getByTestId('layout-sheet')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('group-panel')).toBeVisible();
}

test('版型外框自由選顏色＋透明度：黑色 50% → 外框是半透明（看得到底下的紅）、格子裡的影片不透明；一步復原', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await makeBooth(page, { black: true, opacity: 0.5 });
  const frame = (await allItems(page)).find((i) => i.frameStyle)!;
  expect(frame.frameStyle).toMatchObject({ layout: 'booth-strip', color: '#141414', opacity: 0.5 });
  const p = (await project(page)) as unknown as { width: number; height: number };
  const pw = Math.min(p.width * 0.56, p.height * 0.34);
  const x = ((p.width - pw) / 2 + pw * 0.03) / p.width; // 外框左邊的細邊
  const out = await exportFrame(page, 0.5, [[x, 0.5]]);
  const c = out.samples[0]!;
  expect(c[0]!).toBeGreaterThan(90); // 黑 50% 蓋在紅色上：還有紅色透出來（不是純黑）
  expect(c[0]!).toBeLessThan(200);
  expect(c[1]!).toBeLessThan(60);
  await page.screenshot({ path: 'docs/screenshots/feedback-10/frame-alpha.png', fullPage: true });
  // 改成粉色（常用色）→ 外框換新圖；版型文字顏色自動換成深字
  const oldAsset = frame.assetId;
  await page.getByRole('radio', { name: '外框 粉' }).tap();
  await expect
    .poll(async () => (await allItems(page)).find((i) => i.frameStyle)!.frameStyle!.color)
    .toBe('#ffc9dc');
  const after = (await allItems(page)).find((i) => i.frameStyle)!;
  expect(after.assetId).not.toBe(oldAsset);
  expect(after.frameStyle!.opacity).toBe(0.5);
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await allItems(page)).find((i) => i.frameStyle)!.frameStyle!.color).toBe('#141414');
});

test('版型附文字：拍貼機有「PHOTO BOOTH」＋日期的字卡（group 跟版型一樣）；整個版型移動時文字跟著動同樣的量；改內容不改位置；刪除版型文字也沒了', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await makeBooth(page);
  const text0 = (await allItems(page)).find((i) => i.type === 'text')!;
  const frame0 = (await allItems(page)).find((i) => i.frameStyle)!;
  expect(text0.group).toBe(frame0.group);
  expect(text0.card!.runs[0]!.text).toMatch(/^PHOTO BOOTH\n\d{4}\.\d{2}\.\d{2}$/);
  expect(text0.card!.runs[0]!.color).toBe('#3a2e2a'); // 白色外框配深字
  // 整個版型往右移：圖層分頁「X 位置」
  await openTab(page, '圖層');
  await page.getByLabel('X 位置').fill('70');
  const text1 = (await allItems(page)).find((i) => i.type === 'text')!;
  const frame1 = (await allItems(page)).find((i) => i.frameStyle)!;
  const dFrame = frame1.transform.x - frame0.transform.x;
  expect(Math.abs(dFrame)).toBeGreaterThan(0.1);
  expect(text1.transform.x - text0.transform.x).toBeCloseTo(dFrame, 2); // 文字跟著動同樣的量
  // 選到文字：文字分頁有「這是版型的文字」提示；改內容、字體，位置不動
  await page.locator('[data-testid="clip"][data-kind="text"]').first().tap();
  await openTab(page, '文字');
  await expect(page.getByTestId('group-text-hint')).toBeVisible();
  await page.getByLabel('文字內容').fill('MY STRIP');
  const text2 = (await allItems(page)).find((i) => i.type === 'text')!;
  expect(text2.card!.runs[0]!.text).toBe('MY STRIP');
  expect(text2.transform.x).toBeCloseTo(text1.transform.x, 5);
  // 刪除整個版型：文字也一起不見
  await clips(page).first().tap();
  await openTab(page, '版型');
  await page.getByRole('button', { name: '移除版型' }).tap();
  expect((await allItems(page)).filter((i) => i.type === 'text')).toHaveLength(0);
});

test('版型可以選「不附版型文字」', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 拍貼機直條', exact: true }).tap();
  await page.getByRole('switch', { name: '附上版型文字' }).tap();
  await page.getByTestId('layout-input').setInputFiles([fixture('solid-green.webm')]);
  await expect(page.getByTestId('layout-sheet')).toHaveCount(0, { timeout: 30_000 });
  expect((await allItems(page)).filter((i) => i.type === 'text')).toHaveLength(0);
});
