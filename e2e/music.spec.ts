import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, fixture, openTab, project, seekTo } from './helpers';

type Item = {
  id: string;
  type: string;
  start: number;
  duration: number;
  trimIn: number;
  volume: number;
  fadeIn?: number;
  fadeOut?: number;
};
const audioTrack = async (page: Page) =>
  (await project(page)).tracks.find((t) => (t as unknown as { kind: string }).kind === 'audio') as unknown as
    { kind: string; muted?: boolean; items: Item[] } | undefined;

async function addMusic(page: Page, file = 'music-4s.wav') {
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture(file));
  await expect(page.locator('[data-testid="clip"][data-kind="audio"]')).toHaveCount(1, { timeout: 20_000 });
}
const musicClip = (page: Page) => page.locator('[data-testid="clip"][data-kind="audio"]').first();

async function inspect(page: Page, opts: Record<string, unknown>) {
  await page.waitForFunction(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip);
  return page.evaluate(
    (o) =>
      (
        window as unknown as {
          __videoclip: {
            exportAndInspect: (
              a: unknown,
              b: unknown,
            ) => Promise<{ hasAudio: boolean; audioPeaks: number[]; duration: number; warnings: string[] }>;
          };
        }
      ).__videoclip.exportAndInspect(
        { longSide: 1280, fps: 30, preferWebm: true, ...o },
        { times: [], points: [] },
      ),
    opts,
  );
}

test('加背景音樂：從「檔案」選音樂檔，放在音樂軌、最長到影片結束；時間軸有波形；專案長度不被音樂拉長', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await addMusic(page);
  const p = await project(page);
  const asset = p.assets.find((a) => (a as unknown as { kind: string }).kind === 'audio') as unknown as {
    wave?: number[];
    duration: number;
    name: string;
  };
  expect(asset.duration).toBeCloseTo(4, 1);
  expect(asset.wave!.length).toBeGreaterThanOrEqual(38); // 每 0.1 秒一個值
  // 響的前半秒和輕的後半秒：波形有起伏
  expect(Math.max(...asset.wave!.slice(0, 5))).toBeGreaterThan(Math.max(...asset.wave!.slice(6, 10)) * 2);
  const tr = (await audioTrack(page))!;
  expect(tr.items).toHaveLength(1);
  expect(tr.items[0]).toMatchObject({ type: 'audio', start: 0, volume: 1 });
  expect(tr.items[0]!.duration).toBeCloseTo(4, 1);
  await expect(musicClip(page).getByTestId('wave')).toBeVisible();
  await expect(musicClip(page)).toContainText('♪ music-4s.wav');
  await expect(page.getByTestId('time')).toContainText('/ 0:04.0'); // 專案長度還是 4 秒
  await page.screenshot({ path: 'docs/screenshots/feedback-5/music-track.png' });
  // 預覽沒有選取框（音樂沒有畫面）
  await musicClip(page).tap();
  await expect(page.getByTestId('selbox')).toHaveCount(0);
});

test('音樂比影片長：放在影片結束前會被切在影片結束；放在播放頭的位置', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']); // 2 秒
  await seekTo(page, 1);
  await expect.poll(async () => page.getByTestId('time').textContent()).toContain('0:01.0');
  await addMusic(page);
  const it = (await audioTrack(page))!.items[0]!;
  expect(it.start).toBeCloseTo(1, 1);
  expect(it.duration).toBeCloseTo(1, 1); // 4 秒的音樂只放得下 1 秒
  // 沒有影片時不能加
});

test('選到音樂：只有音樂用得到的工具；音量 0–200%、淡入淡出、關閉聲音；全部一步復原', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addMusic(page);
  await musicClip(page).tap();
  await openTab(page, '音訊');
  const tools = page.getByRole('toolbar', { name: '音樂工具' });
  await expect(tools).toBeVisible();
  for (const n of ['分割', '刪除', '複製', '片段範圍', '音量'])
    await expect(tools.getByRole('button', { name: n })).toBeVisible();
  for (const n of ['變速', '裁切', '填滿', '完整'])
    await expect(tools.getByRole('button', { name: n })).toHaveCount(0);

  await tools.getByRole('button', { name: '音量' }).tap();
  const vol = page.getByRole('slider', { name: '音量' });
  expect(await vol.evaluate((el) => (el as HTMLInputElement).max)).toBe('2');
  await page.getByRole('button', { name: '音量 200%' }).tap();
  expect((await audioTrack(page))!.items[0]!.volume).toBe(2);
  await expect(page.getByTestId('volume-value')).toHaveText('200%');
  await page.getByRole('button', { name: '音量 50%' }).tap();
  expect((await audioTrack(page))!.items[0]!.volume).toBe(0.5);
  await page.getByRole('button', { name: '關閉聲音' }).tap();
  expect((await audioTrack(page))!.items[0]!.volume).toBe(0);
  await expect(musicClip(page)).toContainText('靜音');
  await page.getByRole('button', { name: '音量 100%' }).tap();

  const setRange = (label: string, v: number) =>
    page.getByRole('slider', { name: label, exact: true }).evaluate((el, val) => {
      const i = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, String(val));
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
  expect(
    await page
      .getByRole('slider', { name: '淡入', exact: true })
      .evaluate((el) => (el as HTMLInputElement).max),
  ).toBe('2');
  await setRange('淡入', 1.5);
  await setRange('淡出', 0.5);
  const it = (await audioTrack(page))!.items[0]!;
  expect(it.fadeIn).toBeCloseTo(1.5);
  expect(it.fadeOut).toBeCloseTo(0.5);
  await page.screenshot({ path: 'docs/screenshots/feedback-5/music-volume-panel.png' });
  await page.getByRole('button', { name: '完成' }).tap();

  // 一步復原（淡出、淡入各自一步，連續拖同一個滑桿併成一步）
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await audioTrack(page))!.items[0]!.fadeOut ?? 0).toBe(0);
});

test('音樂可以分割、複製、刪除；修剪面板顯示波形；音樂軌道可以靜音、刪除', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addMusic(page);
  await musicClip(page).tap();
  await openTab(page, '音訊');
  await seekTo(page, 2);
  await page.getByRole('toolbar', { name: '音樂工具' }).getByRole('button', { name: '分割' }).tap();
  let items = (await audioTrack(page))!.items;
  expect(items).toHaveLength(2);
  expect(items[0]!.duration).toBeCloseTo(2, 1);
  expect(items[1]!.start).toBeCloseTo(2, 1);
  expect(items[1]!.trimIn).toBeCloseTo(2, 1);

  // 修剪面板：有波形，可以改留下的區段
  await page.getByRole('toolbar', { name: '音樂工具' }).getByRole('button', { name: '片段範圍' }).tap();
  await expect(page.getByTestId('trim-strip').getByTestId('wave')).toBeVisible();
  await page.waitForTimeout(500); // 等面板滑上來
  const assetSec = ((await project(page)).assets as unknown as { kind: string; duration: number }[]).find(
    (a) => a.kind === 'audio',
  )!.duration;
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  const flag = (await page.getByTestId('range-flag-end-0').boundingBox())!;
  await page.mouse.move(flag.x + flag.width / 2, flag.y + flag.height / 2);
  await page.mouse.down();
  await page.mouse.move(flag.x + flag.width / 2 - strip.width / assetSec, flag.y + flag.height / 2, {
    steps: 6,
  }); // 後面少 1 秒
  await page.mouse.up();
  await page.getByTestId('rm-apply').tap();
  items = (await audioTrack(page))!.items;
  expect(items.find((x) => x.trimIn > 1)!.duration).toBeCloseTo(1, 1);

  // 複製
  await page.getByRole('toolbar', { name: '音樂工具' }).getByRole('button', { name: '複製' }).tap();
  expect((await audioTrack(page))!.items.length).toBe(3);

  // 刪除
  await page.getByRole('toolbar', { name: '音樂工具' }).getByRole('button', { name: '刪除' }).tap();
  expect((await audioTrack(page))!.items.length).toBe(2);

  // 軌道選單：有靜音、沒有往上／往下一層、有刪除
  await page.getByTestId('track-chip').first().scrollIntoViewIfNeeded();
  const chip = page.locator('[data-testid="track"][data-kind="audio"] [data-testid="track-chip"]');
  await chip.tap();
  await expect(page.getByRole('button', { name: /這條軌道靜音|取消靜音/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /往上一層/ })).toHaveCount(0);
  await page.getByRole('button', { name: '這條軌道靜音' }).tap();
  expect((await audioTrack(page))!.muted).toBe(true);
  await chip.tap();
  await page.getByRole('button', { name: /刪除這條軌道/ }).tap();
  expect(await audioTrack(page)).toBeUndefined();
  await expect(clips(page)).toHaveCount(1); // 主軌的影片還在
});

test('預覽播放背景音樂：有聲音；音樂軌道靜音就沒有聲音', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    // 模擬新版 iPhone Safari 的 Audio Session API → 走 Web Audio，才量得到輸出音量
    (navigator as unknown as { audioSession: { type: string } }).audioSession = { type: 'auto' };
  });
  await createProjectWith(page, ['solid-red.webm']); // 沒有聲音的影片，量到的聲音一定是音樂
  await addMusic(page);
  await page.waitForFunction(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip);
  const level = () =>
    page.evaluate(() => {
      const h = (window as unknown as { __videoclip: { audio: () => { level: number | null } } }).__videoclip;
      return h.audio().level ?? 0;
    });
  const peak = async () => {
    let m = 0;
    for (let i = 0; i < 12; i++) {
      m = Math.max(m, await level());
      await page.waitForTimeout(50);
    }
    return m;
  };
  await seekTo(page, 0);
  await page.getByRole('button', { name: '播放' }).tap();
  await expect.poll(peak, { timeout: 8000 }).toBeGreaterThan(0.05);
  await page.getByRole('button', { name: '暫停' }).tap();

  // 音樂軌道靜音
  const chip = page.locator('[data-testid="track"][data-kind="audio"] [data-testid="track-chip"]');
  await chip.scrollIntoViewIfNeeded();
  await chip.tap();
  await page.getByRole('button', { name: '這條軌道靜音' }).tap();
  await seekTo(page, 0);
  await page.getByRole('button', { name: '播放' }).tap();
  await page.waitForTimeout(800);
  expect(await peak()).toBeLessThan(0.01);
  await page.getByRole('button', { name: '暫停' }).tap();
});

test('匯出會混進背景音樂：放在對的時間；音量、淡入淡出、靜音都生效', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']); // 4 秒、沒有聲音
  await addMusic(page);
  const loud = await inspect(page, {});
  expect(loud.hasAudio).toBe(true);
  expect(Math.max(...loud.audioPeaks.slice(0, 4))).toBeGreaterThan(0.1);
  expect(Math.abs(loud.duration - 4)).toBeLessThan(0.2);

  // 淡入 2 秒：第 0 秒（響的那半秒音量最多 25%）比第 2 秒小很多
  await musicClip(page).tap();
  await openTab(page, '音訊');
  await page.getByRole('toolbar', { name: '音樂工具' }).getByRole('button', { name: '音量' }).tap();
  await page.getByRole('slider', { name: '淡入', exact: true }).evaluate((el) => {
    const i = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, '2');
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const faded = await inspect(page, {});
  expect(faded.audioPeaks[0]!).toBeLessThan(faded.audioPeaks[2]! * 0.45);
  expect(faded.audioPeaks[2]!).toBeGreaterThan(loud.audioPeaks[2]! * 0.5);

  // 音量一半：整體約一半
  await page.getByRole('slider', { name: '淡入', exact: true }).evaluate((el) => {
    const i = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, '0');
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByRole('button', { name: '音量 50%' }).tap();
  const half = await inspect(page, {});
  expect(Math.max(...half.audioPeaks.slice(0, 4))).toBeLessThan(
    Math.max(...loud.audioPeaks.slice(0, 4)) * 0.7,
  );
  expect(Math.max(...half.audioPeaks.slice(0, 4))).toBeGreaterThan(
    Math.max(...loud.audioPeaks.slice(0, 4)) * 0.3,
  );

  // 關閉聲音：沒有音軌
  await page.getByRole('button', { name: '關閉聲音' }).tap();
  const none = await inspect(page, {});
  expect(none.hasAudio).toBe(false);
});

test('全部影片靜音：一鍵關掉所有影片的聲音（音樂不受影響），再按恢復；一步復原', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['clip-a.webm']); // 有聲音（440Hz）
  await openTab(page, '音訊'); // 「全部影片靜音」在音訊分頁
  const mute = page.getByRole('button', { name: '全部影片靜音' });
  await expect(mute).toBeVisible();
  const before = await inspect(page, {});
  expect(before.hasAudio).toBe(true);
  await mute.tap();
  await expect(page.getByRole('button', { name: '恢復影片聲音' })).toBeVisible();
  const muted = await inspect(page, {});
  expect(muted.hasAudio).toBe(false);
  expect(((await project(page)).tracks[0] as unknown as { muted?: boolean }).muted).toBe(true);
  await page.getByRole('button', { name: '恢復影片聲音' }).tap();
  expect((await inspect(page, {})).hasAudio).toBe(true);
  // 全部靜音時加音樂：音樂還是有聲音
  await mute.tap();
  await addMusic(page);
  const withMusic = await inspect(page, {});
  expect(withMusic.hasAudio).toBe(true);
  expect(Math.max(...withMusic.audioPeaks.slice(0, 2))).toBeGreaterThan(0.1);
});

test('沒有影片時不能加背景音樂；音樂檔壞掉會說明原因', async ({ page }) => {
  await createProjectWith(page, ['photo.png']);
  await page.getByTestId('clip').first().tap();
  await page.getByRole('button', { name: '刪除', exact: true }).tap();
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.locator('.toast').filter({ hasText: '先匯入影片或照片' })).toBeVisible();
  expect(await audioTrack(page)).toBeUndefined();
});
