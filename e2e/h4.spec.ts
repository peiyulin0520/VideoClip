import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, fixture, openTab, project } from './helpers';

type It = { id: string; type: string; start: number; duration: number; trimIn: number };
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

async function drag(page: Page, testId: string, dx: number) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

test('音訊修剪：音訊列的「修剪」→ 上方旗標＋波形；留 [0,1]＋[2,4]（去掉中間 1 秒）→ 拆成兩段；匯出的 1–2 秒是靜音', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']); // 4 秒，沒聲音
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.getByTestId('audio-trim')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('audio-trim').tap();
  await expect(page.getByTestId('range-picker')).toBeVisible();
  await expect(
    page.locator('.range-picker svg, .range-picker canvas.wave, .range-picker .wave').first(),
  ).toBeVisible();
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  await drag(page, 'range-flag-end-0', -strip.width * 0.75); // 留 [0,1]
  await page.getByTestId('range-add').tap(); // 最大的空檔（1–4）中間放 1 秒 → [2,3]
  await drag(page, 'range-flag-end-1', strip.width * 0.25); // 終點拉到 4 秒
  await page.getByRole('button', { name: '完成' }).tap();
  const items = await audioItems(page);
  expect(items).toHaveLength(2);
  expect(items[0]!.start).toBeCloseTo(0, 1);
  expect(items[0]!.duration).toBeCloseTo(1, 1);
  expect(items[1]!.start).toBeCloseTo(2, 1);
  expect(items[1]!.duration).toBeCloseTo(2, 1);
  const out = await inspect(page);
  expect(out.hasAudio).toBe(true);
  expect(out.audioPeaks[0]!).toBeGreaterThan(0.05);
  expect(out.audioPeaks[1]!).toBeLessThan(out.audioPeaks[0]! * 0.25); // 被去掉的那一秒（編碼邊緣可能有一點點殘響）
  expect(out.audioPeaks[2]!).toBeGreaterThan(0.05);
});
