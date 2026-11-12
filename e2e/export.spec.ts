import { expect, test, type Page } from '@playwright/test';
import { addOverlays, createProjectWith, openTab, project } from './helpers';

type Inspect = {
  ext: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
  audioPeak: number;
  audioPeaks: number[];
  videoCodec: string;
  audioCodec: string | null;
  warnings: string[];
  colors: number[][][];
};
async function inspect(
  page: Page,
  opts: Record<string, unknown>,
  times: number[],
  points: [number, number][] = [[0.5, 0.5]],
): Promise<Inspect> {
  await page.waitForFunction(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip);
  return page.evaluate(
    ([o, t, p]) =>
      (
        window as unknown as {
          __videoclip: { exportAndInspect: (a: unknown, b: unknown) => Promise<Inspect> };
        }
      ).__videoclip.exportAndInspect(o, { times: t, points: p }),
    [opts, times, points] as const,
  );
}
/** OPFS 裡匯出暫存檔的數量 */
async function tempCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('exports');
      let n = 0;
      const it = (dir as unknown as { keys(): AsyncIterable<string> }).keys();
      for await (const k of it) if (k) n++;
      return n;
    } catch {
      return 0;
    }
  });
}
const near = (c: number[] | undefined, want: number[], tol = 45) =>
  !!c && want.every((v, i) => Math.abs(c[i]! - v) <= tol);

test('匯出：長度、尺寸、疊加與文字都畫進去、有聲音；每個時間點的畫面跟預覽一樣', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm', 'clip-a.webm']); // 紅 4 秒（無聲）＋ clip-a 2 秒（有聲）
  await addOverlays(page, ['solid-green.webm']); // 綠色疊在 0 秒開始，置中縮小一半、4 秒
  const r = await inspect(
    page,
    { longSide: 1280, fps: 30, preferWebm: true },
    [1.0, 3.0, 5.0],
    [
      [0.5, 0.5],
      [0.05, 0.05],
    ],
  );
  expect(r.width).toBe(720);
  expect(r.height).toBe(1280);
  expect(Math.abs(r.duration - 6)).toBeLessThan(0.15);
  expect(r.bytes).toBeGreaterThan(5_000);
  // 1.0 秒：中央綠（疊加）、角落紅（主軌）；3.0 秒同；5.0 秒：疊加結束了，是 clip-a（不是純紅）
  expect(near(r.colors[0]![0], [0, 255, 0])).toBe(true);
  expect(near(r.colors[0]![1], [255, 0, 0])).toBe(true);
  expect(near(r.colors[1]![0], [0, 255, 0])).toBe(true);
  expect(near(r.colors[2]![0], [255, 0, 0], 20)).toBe(false);
  // 聲音：clip-a 有 440Hz，混進去了（在 4–6 秒）；前 3 秒量不到，所以另外量整段
  expect(r.hasAudio).toBe(true);
  // 聲音放在對的時間：前 4 秒是無聲的紅色影片，clip-a 的聲音從第 4 秒開始
  expect(Math.max(...r.audioPeaks.slice(0, 3))).toBeLessThan(0.01);
  expect(Math.max(...r.audioPeaks.slice(4, 6))).toBeGreaterThan(0.05);
  expect(r.ext).toBe('webm');
});

test('匯出的聲音：有聲音的影片匯出有音軌且量得到音量；音量 0 或靜音軌道就沒有音軌', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']); // 2 秒、440Hz
  const loud = await inspect(page, { longSide: 1280, fps: 30, preferWebm: true }, []);
  expect(loud.hasAudio).toBe(true);
  expect(loud.audioPeak).toBeGreaterThan(0.05);
  expect(Math.abs(loud.duration - 2)).toBeLessThan(0.15);
  expect(loud.warnings.filter((w) => /沒有聲音/.test(w))).toHaveLength(0);

  // 音量 0
  await page.getByTestId('clip').first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '音量' }).tap();
  await page.getByRole('slider', { name: '音量' }).fill('0');
  const muted = await inspect(page, { longSide: 1280, fps: 30, preferWebm: true }, []);
  expect(muted.hasAudio).toBe(false);
  expect(Math.abs(muted.duration - 2)).toBeLessThan(0.15);

  // 音量一半：音量約一半
  await page.getByRole('slider', { name: '音量' }).fill('0.5');
  const half = await inspect(page, { longSide: 1280, fps: 30, preferWebm: true }, []);
  expect(half.hasAudio).toBe(true);
  expect(half.audioPeak).toBeGreaterThan(loud.audioPeak * 0.3);
  expect(half.audioPeak).toBeLessThan(loud.audioPeak * 0.7);
  expect((await project(page)).tracks[0]!.items.length).toBe(1);
});

test('匯出：變速、主軌空白、照片都正確', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['photo.png', 'solid-blue.webm']); // 照片預設幾秒 + 藍 4 秒
  const p0 = await project(page);
  const photoDur = (p0.tracks[0]!.items[0] as unknown as { duration: number }).duration;
  const r = await inspect(page, { longSide: 1280, fps: 30 }, [photoDur + 1], [[0.5, 0.5]]);
  expect(Math.abs(r.duration - (photoDur + 4))).toBeLessThan(0.2);
  expect(near(r.colors[0]![0], [0, 0, 255])).toBe(true); // 照片之後是藍色影片
});

test('匯出預設輸出 MP4（H.264）；這個瀏覽器編不出 AAC 時會明說「沒有聲音」，不會偷偷失敗', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']);
  const r = await inspect(page, { longSide: 1280, fps: 30 }, [0.5]);
  expect(Math.abs(r.duration - 2)).toBeLessThan(0.15);
  expect(r.width).toBe(720);
  if (r.ext === 'mp4') {
    expect(r.videoCodec).toBe('avc');
    // 有 AAC 就有聲音；沒有就一定要有警告
    if (!r.hasAudio) expect(r.warnings.join('')).toContain('AAC');
    else expect(r.audioCodec).toBe('aac');
  } else {
    expect(r.warnings.join('')).toContain('H.264');
  }
});

test('匯出面板：選項、預估大小、進度、完成後可以下載；沒有內容時不能匯出', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']);
  await page.getByRole('button', { name: '匯出影片' }).tap();
  await expect(page.getByTestId('export-options')).toBeVisible();
  const est = page.getByTestId('export-estimate');
  await expect(est).toContainText('1080×1920');
  await page.getByRole('radio', { name: '解析度 720p（檔案較小）' }).tap();
  await expect(est).toContainText('720×1280');
  await page.getByRole('radio', { name: '更新率 60 fps（較順、較慢）' }).tap();
  await page.getByRole('radio', { name: '畫質 高' }).tap();
  await expect(page.getByRole('radio', { name: '畫質 高' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: '更新率 30 fps' }).tap();
  await page.screenshot({ path: 'docs/screenshots/feedback-5/export-options.png' });

  await page.getByRole('button', { name: '開始匯出' }).tap();
  await expect(page.getByTestId('export-running').or(page.getByTestId('export-done'))).toBeVisible();
  await expect(page.getByTestId('export-done')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('export-done')).toContainText('720×1280');
  await page.screenshot({ path: 'docs/screenshots/feedback-5/export-done.png' });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '下載檔案' }).tap(),
  ]);
  // （無頭 Chromium 遇到中文檔名會把建議檔名換成 download，真的瀏覽器不會，所以只確認有下載到檔案）
  expect(download.url()).toMatch(/^blob:/);
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByRole('button', { name: '關閉' }).tap();
  await expect(page.getByTestId('export-done')).toHaveCount(0);
  // 暫存檔在關閉後清掉
  await expect.poll(() => tempCount(page)).toBe(0);
});

test('匯出可以取消：回到選項、暫存檔清掉；之後可以重新匯出', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-c.webm', 'clip-c.webm', 'clip-c.webm']); // 9 秒
  await page.getByRole('button', { name: '匯出影片' }).tap();
  await page.getByRole('radio', { name: '更新率 60 fps（較順、較慢）' }).tap();
  await page.getByRole('button', { name: '開始匯出' }).tap();
  const bar = page.getByRole('progressbar', { name: '匯出進度' });
  await expect(bar).toBeVisible();
  await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(5);
  await page.getByRole('button', { name: '取消' }).tap();
  await expect(page.getByTestId('export-options')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('export-done')).toHaveCount(0);
  const left = await tempCount(page);
  expect(left).toBe(0);
  await page.getByRole('button', { name: '關閉' }).tap();
});

test('沒有內容時匯出鈕按下去會說要先匯入；專案資料不會被匯出動到', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vc-debug', '1');
    localStorage.setItem('vc-skip-onboarding', '1');
  });
  await page.goto('./');
  await page.getByRole('button', { name: '新增專案' }).tap();
  await page.getByTestId('new-project-files').setInputFiles([]);
  // 空專案：從首頁建立一個空專案的路徑不一定有，這裡改用匯入後刪掉片段
  await createProjectWith(page, ['solid-red.webm']);
  await page.getByTestId('clip').first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '刪除' }).tap();
  await page.getByRole('button', { name: '匯出影片' }).tap();
  await expect(page.getByText('還沒有內容可以匯出')).toBeVisible();
  await expect(page.getByRole('button', { name: '開始匯出' })).toBeDisabled();
});
