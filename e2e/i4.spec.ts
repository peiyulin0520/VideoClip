import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, fixture, openTab, project } from './helpers';

type It = {
  id: string;
  type: string;
  start: number;
  duration: number;
  trimIn: number;
  audioRanges?: number[][];
};
type Tr = { kind: string; items: It[] };
const audioItems = async (page: Page) =>
  ((await project(page)).tracks as unknown as Tr[])
    .filter((t) => t.kind === 'audio')
    .flatMap((t) => t.items)
    .sort((a, b) => a.start - b.start);

async function inspect(page: Page) {
  return page.evaluate(() =>
    (
      window as unknown as {
        __videoclip: {
          exportAndInspect: (a: unknown, b: unknown) => Promise<{ hasAudio: boolean; audioPeaks: number[] }>;
        };
      }
    ).__videoclip.exportAndInspect({ longSide: 1280, fps: 30, preferWebm: true }, { times: [], points: [] }),
  );
}

async function dragFlag(page: Page, testId: string, dx: number) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}
async function clickStrip(page: Page, frac: number) {
  const b = (await page.getByTestId('trim-strip').boundingBox())!;
  await page.mouse.click(b.x + b.width * frac, b.y + b.height / 2);
}

test('靜音標記：兩組保留的聲音（0–1、2–3 秒）→ 片段不拆、匯出的 1–2、3–4 秒靜音；復原／移除各組', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']); // 4 秒，沒聲音
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.getByTestId('audio-mute')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('audio-mute').tap();
  await page.waitForTimeout(500); // 等面板滑上來
  await expect(page.getByTestId('rm-cursor')).toBeVisible();
  await expect(page.getByTestId('range-add')).toContainText('在白線位置新增一組起迄標記');

  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  await dragFlag(page, 'range-flag-end-0', -strip.width * 0.75); // 留 [0,1]
  await clickStrip(page, 0.5); // 白線移到 2 秒
  await page.getByTestId('range-add').tap(); // 起點在白線，終點自動出現 → [2,3]
  await expect(page.getByTestId('range-flag-start-1')).toContainText('2起');
  await expect(page.getByTestId('range-flag-end-1')).toContainText('2迄');
  await page.screenshot({ path: 'docs/screenshots/feedback-9/mute-markers.png' });

  // 復原：多的那組不見；再新增回來；移除第 2 組也行
  await page.getByTestId('rm-undo').tap();
  await expect(page.getByTestId('range-flag-start-1')).toHaveCount(0);
  await page.getByTestId('range-add').tap();
  await expect(page.getByTestId('range-flag-start-1')).toBeVisible();
  await page.getByTestId('range-remove-1').tap();
  await expect(page.getByTestId('range-flag-start-1')).toHaveCount(0);
  await page.getByTestId('range-add').tap();

  await page.getByTestId('rm-apply').tap();
  const items = await audioItems(page);
  expect(items).toHaveLength(1); // 不拆片段
  expect(items[0]!.audioRanges).toHaveLength(2);
  expect(items[0]!.audioRanges![0]![0]).toBeCloseTo(0, 1);
  expect(items[0]!.audioRanges![0]![1]).toBeCloseTo(1, 1);
  expect(items[0]!.audioRanges![1]![0]).toBeCloseTo(2, 1);

  const out = await inspect(page);
  expect(out.hasAudio).toBe(true);
  expect(out.audioPeaks[0]!).toBeGreaterThan(0.05);
  expect(out.audioPeaks[1]!).toBeLessThan(out.audioPeaks[0]! * 0.25);
  expect(out.audioPeaks[2]!).toBeGreaterThan(0.02);
  expect(out.audioPeaks[3]!).toBeLessThan(out.audioPeaks[0]! * 0.25);
});

test('標記軸：白線在已選範圍裡不能新增；取消不改任何東西', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.getByTestId('audio-mute')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('audio-mute').tap();
  await page.waitForTimeout(500);
  await clickStrip(page, 0.5); // 白線在 [0,4] 裡
  await page.getByTestId('range-add').tap();
  await expect(page.locator('.toast').filter({ hasText: '白線在已選的範圍裡' })).toBeVisible();
  await expect(page.getByTestId('range-flag-start-1')).toHaveCount(0);
  await page.getByRole('button', { name: '取消' }).tap();
  expect((await audioItems(page))[0]!.audioRanges).toBeUndefined();
});

test('進階：切到「標記要靜音的聲音」→ 在 1–2 秒標一段靜音 → audioRanges 是 [0,1]＋[2,4]、匯出的 1–2 秒是靜音；切換標法標記互補、聲音結果不變', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']); // 4 秒，沒聲音
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.getByTestId('audio-mute')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('audio-mute')).toContainText('進階');
  await page.getByTestId('audio-mute').tap();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('audio-mode-keep')).toHaveAttribute('aria-checked', 'true'); // 預設：標記要保留的
  await page.getByTestId('audio-mode-silence').tap();
  await expect(page.getByTestId('audio-mode-silence')).toHaveAttribute('aria-checked', 'true');
  // 靜音模式一開始沒有標記（整段都有聲音）；白線移到 1 秒、新增一組（預設 1 秒長 → 1–2 秒）
  await expect(page.getByTestId('range-flag-start-0')).toHaveCount(0);
  await clickStrip(page, 0.25);
  await page.getByTestId('range-add').tap();
  await expect(page.getByTestId('range-flag-start-0')).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/feedback-10/audio-silence.png' });
  // 切回「保留」：標記換算成互補（[0,1]＋[2,4]）
  await page.getByTestId('audio-mode-keep').tap();
  await expect(page.getByTestId('range-flag-start-1')).toBeVisible();
  await page.getByTestId('audio-mode-silence').tap();
  await expect(page.getByTestId('range-flag-start-1')).toHaveCount(0); // 再換回靜音：只剩那一段
  await page.getByTestId('rm-apply').tap();
  const items = await audioItems(page);
  expect(items).toHaveLength(1);
  expect(items[0]!.audioRanges).toHaveLength(2);
  expect(items[0]!.audioRanges![0]![1]).toBeCloseTo(1, 1);
  expect(items[0]!.audioRanges![1]![0]).toBeCloseTo(2, 1);
  const out = await inspect(page);
  expect(out.audioPeaks[0]!).toBeGreaterThan(0.05);
  expect(out.audioPeaks[1]!).toBeLessThan(out.audioPeaks[0]! * 0.25);
  expect(out.audioPeaks[2]!).toBeGreaterThan(0.02);
});
