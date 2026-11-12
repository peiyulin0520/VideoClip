import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, fixture, openTab, project, showTimeline } from './helpers';

const SHOT = 'docs/screenshots/feedback-7/g3';
type It = {
  id: string;
  type: string;
  start: number;
  duration: number;
  trimIn: number;
  volume: number;
  assetId: string;
};
type Tr = { kind: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];

async function inspect(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip);
  return page.evaluate(() =>
    (
      window as unknown as {
        __videoclip: {
          exportAndInspect: (
            a: unknown,
            b: unknown,
          ) => Promise<{ hasAudio: boolean; audioPeaks: number[]; duration: number }>;
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

test('修剪面板：沒有兩側拉霸，上方有小旗標；沒選到的灰掉；拖旗標時小畫面顯示那一秒的畫面', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await showTimeline(page);
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '修剪', exact: true }).tap();
  await expect(page.getByTestId('range-flag-start-0')).toBeVisible();
  await expect(page.getByTestId('range-flag-end-0')).toBeVisible();
  await expect(page.getByTestId('trim-grip-left')).toHaveCount(0); // 舊的兩側拉霸沒有了
  await expect(page.locator('.range-gray')).toHaveCount(0); // 全部都選了，沒有灰的

  // 終點旗標往左拉 1/2：右半灰掉；片段變短；小畫面有畫面（紅色影片）
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  await drag(page, 'range-flag-end-0', -strip.width / 2);
  await expect(page.locator('.range-gray')).toHaveCount(1);
  const it = (await tracks(page))[0]!.items[0]!;
  expect(it.duration).toBeGreaterThan(1.7);
  expect(it.duration).toBeLessThan(2.3);
  await expect
    .poll(async () =>
      page.getByTestId('range-mini').evaluate((cv) => {
        const c = cv as HTMLCanvasElement;
        const d = c.getContext('2d')!.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
        return d[0]! > 200 && d[1]! < 80 && d[2]! < 80;
      }),
    )
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/flags.png` });
});

test('修剪面板：再加一段（多段）→ 完成後拆成兩個片段，各留在原本的時間位置、中間是空位；復原回到一段', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await showTimeline(page);
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '修剪', exact: true }).tap();
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  await drag(page, 'range-flag-end-0', -strip.width * 0.75); // 留 [0, 1]
  await page.getByTestId('range-add').tap(); // 最大的空檔（1–4 秒）正中間放 1 秒 → [2, 3]
  await expect(page.getByTestId('range-flag-start-1')).toBeVisible();
  await expect(page.getByTestId('trim-info')).toContainText('共 2 段');
  await expect(page.getByTestId('range-remove')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/two-ranges.png` });
  await page.getByRole('button', { name: '完成' }).tap();
  const items = (await tracks(page))[0]!.items.slice().sort((a, b) => a.start - b.start);
  expect(items).toHaveLength(2);
  expect(items[0]!.start).toBeCloseTo(0, 1);
  expect(items[0]!.duration).toBeCloseTo(1, 1);
  expect(items[1]!.start).toBeCloseTo(2, 1); // 原本的位置，中間 1–2 秒是空位
  expect(items[1]!.trimIn).toBeCloseTo(2, 1);
  expect(items[1]!.duration).toBeCloseTo(1, 1);
  await expect(page.locator('.toast').filter({ hasText: '已拆成 2 段' })).toBeVisible();
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await tracks(page))[0]!.items).toHaveLength(1);
});

test('音訊分頁：列出專案裡所有聲音（影片原音＋背景音樂）；關掉某一個；分離原音後匯出仍然有聲音', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['clip-a.webm']); // 有聲音（440Hz）2 秒
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.locator('[data-testid="clip"][data-kind="audio"]')).toHaveCount(1, { timeout: 20_000 });
  const rows = page.getByTestId('audio-row');
  await expect(rows).toHaveCount(2);
  await page.screenshot({ path: `${SHOT}/audio-tab.png` });

  // 關掉影片原音 → volume 0；再打開
  await page.getByRole('switch', { name: /保留聲音 影片/ }).tap();
  expect((await tracks(page))[0]!.items[0]!.volume).toBe(0);
  await page.getByRole('switch', { name: /保留聲音 影片/ }).tap();
  expect((await tracks(page))[0]!.items[0]!.volume).toBeGreaterThan(0);

  // 音樂關掉：匯出只剩影片原音（前 2 秒有 440Hz，之後沒有）
  // 分離原音：音樂軌多一段（指向同一個影片素材）、影片靜音；匯出聲音還在
  await page.getByRole('button', { name: /分離原音 影片/ }).tap();
  await expect(page.locator('.toast').filter({ hasText: '原音已分離' })).toBeVisible();
  const tr = await tracks(page);
  expect(tr[0]!.items[0]!.volume).toBe(0);
  const audio = tr
    .filter((t) => t.kind === 'audio')
    .flatMap((t) => t.items)
    .filter((i) => i.assetId === tr[0]!.items[0]!.assetId);
  expect(audio).toHaveLength(1);
  expect(audio[0]!.duration).toBeCloseTo(tr[0]!.items[0]!.duration, 2);
  // 把背景音樂也關掉，只量分離出來的原音
  await page.getByRole('switch', { name: /保留聲音 ♪ music-4s/ }).tap();
  const out = await inspect(page);
  expect(out.hasAudio).toBe(true);
  expect(Math.max(...out.audioPeaks.slice(0, 2))).toBeGreaterThan(0.05);
});
