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

async function clickStrip(page: Page, frac: number) {
  const b = (await page.getByTestId('trim-strip').boundingBox())!;
  await page.mouse.click(b.x + b.width * frac, b.y + b.height / 2);
}

test('修剪面板：沒有兩側拉霸，上方有小旗標（1起／1迄）；沒選到的灰掉；拖旗標時預覽跟著、按「套用」才改片段', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await showTimeline(page);
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '片段範圍', exact: true }).tap();
  await expect(page.getByTestId('range-flag-start-0')).toBeVisible();
  await expect(page.getByTestId('range-flag-end-0')).toBeVisible();
  await expect(page.getByTestId('range-flag-start-0')).toContainText('1起');
  await expect(page.getByTestId('range-flag-end-0')).toContainText('1迄');
  await expect(page.getByTestId('trim-grip-left')).toHaveCount(0); // 舊的兩側拉霸沒有了
  await expect(page.getByTestId('range-gray')).toHaveCount(0); // 全部都選了，沒有灰的
  await expect(page.getByTestId('rm-video')).toBeVisible(); // 有預覽畫面

  // 終點旗標往左拉 1/2：右半灰掉；按套用才改片段
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  await drag(page, 'range-flag-end-0', -strip.width / 2);
  await expect(page.getByTestId('range-gray')).toHaveCount(1);
  await expect(page.getByTestId('rm-now')).toContainText('2.');
  expect((await tracks(page))[0]!.items[0]!.duration).toBeCloseTo(4, 1); // 還沒套用
  await page.screenshot({ path: `${SHOT}/flags.png` });
  await page.getByTestId('rm-apply').tap();
  const it = (await tracks(page))[0]!.items[0]!;
  expect(it.duration).toBeGreaterThan(1.7);
  expect(it.duration).toBeLessThan(2.3);
});

test('修剪面板：再加一段（多段）→ 完成後拆成兩個片段，各留在原本的時間位置、中間是空位；復原回到一段', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await showTimeline(page);
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '片段範圍', exact: true }).tap();
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  await drag(page, 'range-flag-end-0', -strip.width * 0.75); // 留 [0, 1]
  await clickStrip(page, 0.5); // 白線移到 2 秒
  await page.getByTestId('range-add').tap(); // 白線位置放 1 秒 → [2, 3]
  await expect(page.getByTestId('range-flag-start-1')).toBeVisible();
  await expect(page.getByTestId('trim-info')).toContainText('共 2 組');
  await expect(page.getByTestId('range-remove-1')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/two-ranges.png` });
  await page.getByTestId('rm-apply').tap();
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
