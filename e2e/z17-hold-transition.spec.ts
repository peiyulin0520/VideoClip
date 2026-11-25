import { expect, test } from '@playwright/test';
import {
  closePanel,
  createProjectWith,
  finishLayout,
  fixture,
  isGreen,
  isRed,
  openTab,
  project,
  samplePreview,
  seekTo,
  showTimeline,
  timeText,
  undo,
} from './helpers';

// feedback-16：轉場照市面做法——預設邊轉邊播（重疊）；另有「停格轉場」（前一段播完、轉場時間插在兩段中間、後一段再從頭播）；
// 轉場位置有〔置中〕〔接縫前〕〔接縫後〕〔自訂〕。
const starts = async (page: import('@playwright/test').Page) =>
  (await project(page)).tracks[0]!.items.map((i) => Math.round(i.start * 100) / 100);

test('停格轉場：兩段中間多一段空白做轉場（左移），總長變長；之後後一段才播；沒有「補齊空白」；切回去挪回來', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm']); // 各 4 秒
  await closePanel(page);
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 左移' }).tap();
  expect(await starts(page)).toEqual([0, 4]); // 邊轉邊播：兩段緊接
  await expect(page.getByTestId('tr-mode-overlap')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('tr-mode-hold').tap();
  expect(await starts(page)).toEqual([0, 4.5]); // 預設轉場 0.5 秒：中間多 0.5 秒空白
  await expect(page.getByTestId('tr-mode-hold')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('tr-align')).toHaveCount(0); // 停格轉場沒有前後分配
  await expect(page.getByTestId('gap')).toHaveCount(0); // 這段空白是轉場，不是留白
  await expect.poll(() => timeText(page)).toContain('0:08.5');
  // 空白中間：前一段（紅）往左滑走、後一段（綠）從右邊滑進來，各佔一半
  await seekTo(page, 4.25);
  await expect.poll(async () => isRed(await samplePreview(page, 0.15, 0.5))).toBe(true);
  await expect.poll(async () => isGreen(await samplePreview(page, 0.85, 0.5))).toBe(true);
  // 轉場結束後是後一段；轉場前是前一段
  await seekTo(page, 5.5);
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await seekTo(page, 3.5);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 轉場長度改成 1 秒：後一段跟著挪到 5
  await page.getByLabel('轉場長度').fill('10');
  await expect.poll(() => starts(page)).toEqual([0, 5]);
  // 切回邊轉邊播：挪回緊接
  await page.getByTestId('tr-mode-overlap').tap();
  expect(await starts(page)).toEqual([0, 4]);
  await expect(page.getByTestId('tr-align')).toBeVisible();
  await undo(page);
  expect(await starts(page)).toEqual([0, 5]);
});

test('轉場位置：置中／接縫前／接縫後各寫進前後分配；自訂開原本的視窗', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm']);
  await closePanel(page);
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 疊化' }).tap();
  await page.getByLabel('轉場長度').fill('10'); // 1 秒
  const tr = async () =>
    (
      (await project(page)).tracks[0]!.items[1] as unknown as {
        transitionIn: { before?: number; after?: number };
      }
    ).transitionIn;
  await expect(page.getByTestId('tr-align-center')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('tr-align-before').tap();
  expect(await tr()).toMatchObject({ before: 1, after: 0 });
  await expect(page.getByTestId('tr-align-before')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('tr-align-after').tap();
  expect(await tr()).toMatchObject({ before: 0, after: 1 });
  await page.getByTestId('tr-align-center').tap();
  expect(await tr()).toMatchObject({ before: 0.5, after: 0.5 });
  await page.getByTestId('fx-adjust').tap();
  await expect(page.getByRole('dialog')).toBeVisible();
});

// 版型格子裡的停格轉場（原本只有邊轉邊播）
test('版型格子裡的停格轉場：後一段往後挪、外框變長；空白中間那一格是兩段（左移）；切回去挪回來', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-red.webm')]);
  await showTimeline(page);
  await page.getByRole('button', { name: '第 1 格 加素材' }).tap();
  await page.getByTestId('cell-add-file').setInputFiles(fixture('solid-green.webm'));
  const cell0 = async () =>
    (
      ((await project(page)).tracks as unknown as { groupRole?: string; items: unknown }[]).filter(
        (t) => t.groupRole === 'cell',
      )[0]!.items as unknown as {
        start: number;
        cell: { x: number; y: number; w: number; h: number };
      }[]
    ).map((i) => ({ start: Math.round(i.start * 100) / 100, cell: i.cell }));
  await expect.poll(async () => (await cell0()).length, { timeout: 30_000 }).toBe(2);
  const frameDur = async () =>
    (
      (await project(page)).tracks.flatMap((t) => t.items) as unknown as {
        group?: string;
        cell?: unknown;
        type: string;
        duration: number;
      }[]
    ).find((i) => i.group && !i.cell && i.type !== 'text')!.duration;
  const d0 = await frameDur();
  await showTimeline(page);
  await page.locator('.track.sub-row [data-testid="tr-circle"]').tap();
  await page.getByRole('radio', { name: '轉場 左移' }).tap();
  expect((await cell0()).map((i) => i.start)).toEqual([0, 4]);
  await page.getByTestId('tr-mode-hold').tap();
  expect((await cell0()).map((i) => i.start)).toEqual([0, 4.5]); // 預設 0.5 秒空白
  expect(await frameDur()).toBeCloseTo(d0 + 0.5, 2);
  // 空白中間：這一格左半是紅（前一段滑走）、右半是綠（後一段滑進來）
  await closePanel(page);
  const c = (await cell0())[0]!.cell;
  await seekTo(page, 4.25);
  await expect.poll(async () => isRed(await samplePreview(page, c.x + c.w * 0.15, c.y + c.h / 2))).toBe(true);
  await expect
    .poll(async () => isGreen(await samplePreview(page, c.x + c.w * 0.85, c.y + c.h / 2)))
    .toBe(true);
  // 轉場結束後是綠
  await seekTo(page, 5.5);
  await expect.poll(async () => isGreen(await samplePreview(page, c.x + c.w / 2, c.y + c.h / 2))).toBe(true);
  // 切回邊轉邊播：挪回去
  await showTimeline(page);
  await page.locator('.track.sub-row [data-testid="tr-circle"]').tap();
  await page.getByTestId('tr-mode-overlap').tap();
  expect((await cell0()).map((i) => i.start)).toEqual([0, 4]);
  expect(await frameDur()).toBeCloseTo(d0, 2);
  await undo(page);
  expect((await cell0()).map((i) => i.start)).toEqual([0, 4.5]);
});
