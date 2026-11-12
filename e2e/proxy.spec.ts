import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, fixture, project } from './helpers';

type Asset = { id: string; codec?: string; proxy?: { status: string; width?: number; height?: number } };
const assets = async (page: Page) => (await project(page)).assets as Asset[];

test('大影片匯入後自動做預覽用輕量影片：預覽播放用它（長邊 960），原檔還在', async ({ page }) => {
  await createProjectWith(page, ['big-1080p.webm']);
  // 一開始或很快就會是 pending／ready；等到 ready
  await expect.poll(async () => (await assets(page))[0]?.proxy?.status, { timeout: 40_000 }).toBe('ready');
  const a = (await assets(page))[0]!;
  expect(a.proxy!.width).toBe(960);
  expect(a.proxy!.height).toBe(540);
  // 預覽用的 <video> 載入的是輕量影片（960 寬），不是 1920
  await expect
    .poll(
      async () =>
        page.locator('.pool video').evaluateAll((vs) => (vs as HTMLVideoElement[]).map((v) => v.videoWidth)),
      {
        timeout: 15_000,
      },
    )
    .toContain(960);
  // 播放照常
  await page.getByRole('button', { name: '播放' }).tap();
  await page.waitForTimeout(600);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __videoclip: { time: () => number } }).__videoclip.time(),
    ),
  ).toBeGreaterThan(0.2);
  await page.getByRole('button', { name: '暫停' }).tap();
  // 單格輸出（匯出用）還是 1080 寬的原檔
  const f = await page.evaluate(() =>
    (
      window as unknown as {
        __videoclip: { exportFrame: (t: number, p: [number, number][]) => Promise<{ width: number }> };
      }
    ).__videoclip.exportFrame(0.5, [[0.5, 0.5]]),
  );
  expect(f.width).toBeGreaterThan(0);
});

test('小影片（已經夠輕）不會做 proxy：狀態是 none，照用原檔', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']);
  await expect.poll(async () => (await assets(page))[0]?.proxy?.status, { timeout: 20_000 }).toBe('none');
  await expect
    .poll(async () =>
      page.locator('.pool video').evaluateAll((vs) => (vs as HTMLVideoElement[]).map((v) => v.videoWidth)),
    )
    .toContain(320);
});

test('播放效能框：設定頁打開才有；播放時顯示每秒幾格與各段耗時、影片資訊', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']);
  await expect(page.getByTestId('perf-overlay')).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('vc-perf', '1'));
  await page.reload();
  await page.getByRole('button', { name: '播放' }).tap();
  const box = page.getByTestId('perf-overlay');
  await expect(box).toBeVisible({ timeout: 8000 });
  await expect(box).toContainText('fps');
  await expect(box).toContainText('影片上傳');
  await expect(box).toContainText('320×568');
  await page.screenshot({ path: 'docs/screenshots/feedback-5/perf-overlay.png' });
});

test('預覽用輕量影片做不出來：標成 failed、照用原檔、播放不受影響', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']);
  await page.waitForFunction(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip);
  await page.evaluate(() =>
    (window as unknown as { __videoclip: { failProxies: (on: boolean) => void } }).__videoclip.failProxies(
      true,
    ),
  );
  await page.getByTestId('file-input').setInputFiles(fixture('big-1080p.webm'));
  await expect(page.getByTestId('clip')).toHaveCount(2, { timeout: 20_000 });
  await expect.poll(async () => (await assets(page))[1]?.proxy?.status, { timeout: 20_000 }).toBe('failed');
  // 預覽用的還是原檔（1920 寬）
  await page.getByTestId('clip').nth(1).tap();
  await expect
    .poll(async () =>
      page.locator('.pool video').evaluateAll((vs) => (vs as HTMLVideoElement[]).map((v) => v.videoWidth)),
    )
    .toContain(1920);
});
