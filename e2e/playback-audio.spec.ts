import { expect, test } from '@playwright/test';
import { createProjectWith, openTab, project } from './helpers';

type Hook = {
  stats: () => { fps: number; renderMs: number };
  audio: () => { mode: string; running: boolean; level: number | null };
  editorRenders: () => number;
  time: () => number;
};
const hook = <T>(page: import('@playwright/test').Page, fn: (h: Hook) => T) =>
  page.evaluate(`(${fn.toString()})(window.__videoclip)`) as Promise<T>;

async function waitHook(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip);
}

test('播放順暢：播放中編輯器不會每一格都重畫，畫面更新率夠', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-c.webm']); // 2 秒 + 3 秒
  await waitHook(page);
  await page.getByRole('button', { name: '播放' }).tap();
  await expect(page.getByRole('button', { name: '暫停' })).toBeVisible();
  const before = await hook(page, (h) => h.editorRenders());
  await page.waitForTimeout(2500);
  const after = await hook(page, (h) => h.editorRenders());
  const stats = await hook(page, (h) => h.stats());
  // 2.5 秒、60fps 要重畫 150 次；現在播放狀態只在開始／結束時改
  expect(after - before).toBeLessThan(10);
  expect(stats.fps).toBeGreaterThan(15);
  // 時間標示還是有在動
  const t = (await page.getByTestId('time').textContent()) ?? '';
  expect(t).not.toMatch(/^0:00\.0 /);
  await page.getByRole('button', { name: '暫停' }).tap();
});

test('影片聲音：播放時有聲音輸出；音量 0 就沒有；有 Audio Session 時設成「播放」類別（靜音模式也聽得到）', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // 模擬新版 iPhone Safari 的 Audio Session API
    (navigator as unknown as { audioSession: { type: string } }).audioSession = { type: 'auto' };
  });
  await createProjectWith(page, ['clip-c.webm']); // 3 秒，660Hz
  await waitHook(page);
  await page.getByRole('button', { name: '播放' }).tap();
  await expect(page.getByRole('button', { name: '暫停' })).toBeVisible();
  const type = await page.evaluate(
    () => (navigator as unknown as { audioSession: { type: string } }).audioSession.type,
  );
  expect(type).toBe('playback');
  await expect.poll(async () => (await hook(page, (h) => h.audio())).running, { timeout: 5000 }).toBe(true);
  expect((await hook(page, (h) => h.audio())).mode).toBe('webaudio');
  await expect
    .poll(async () => (await hook(page, (h) => h.audio())).level ?? 0, { timeout: 5000 })
    .toBeGreaterThan(0.02);
  await page.getByRole('button', { name: '暫停' }).tap();

  // 音量 0：播放時沒有聲音
  await page.getByRole('button', { name: '播放' }).waitFor();
  await page.getByTestId('clip').first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '音量' }).tap();
  await page.getByRole('slider', { name: '音量' }).fill('0');
  expect((await project(page)).tracks[0]!.items[0]!).toMatchObject({ volume: 0 });
  await page.getByRole('button', { name: '播放' }).tap();
  await page.waitForTimeout(800);
  const peak = await page.evaluate(async () => {
    const h = (window as unknown as { __videoclip: { audio: () => { level: number | null } } }).__videoclip;
    let m = 0;
    for (let i = 0; i < 10; i++) {
      m = Math.max(m, h.audio().level ?? 0);
      await new Promise((r) => setTimeout(r, 50));
    }
    return m;
  });
  expect(peak).toBeLessThan(0.01);
});
