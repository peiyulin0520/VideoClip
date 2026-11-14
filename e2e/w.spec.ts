import { expect, test, type Page } from '@playwright/test';
import {
  addOverlays,
  clips,
  createProjectWith,
  exportFrame,
  isGreen,
  isRed,
  openTab,
  project,
  samplePreview,
  seekTo as rawSeekTo,
  type RGBA,
} from './helpers';

const isGray = (c: RGBA | null) =>
  !!c && Math.abs(c[0] - c[1]) < 25 && Math.abs(c[1] - c[2]) < 25 && c[0] > 20;

const SHOT = 'docs/screenshots/feedback-11';

/** 跳到某一秒，並等播放頭真的到了 */
async function seekTo(page: Page, sec: number) {
  await rawSeekTo(page, sec);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { __videoclip: { time: () => number } }).__videoclip.time(),
        ),
      { timeout: 5000 },
    )
    .toBeGreaterThan(sec - 0.04);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { __videoclip: { time: () => number } }).__videoclip.time(),
        ),
      { timeout: 5000 },
    )
    .toBeLessThan(sec + 0.04);
}

type Kf = {
  t: number;
  x: number;
  look?: { id: string; amount: number } | null;
  adjust?: Record<string, number>;
  pulse?: { kind: string; duration: number; strength: number };
};
type It = { look?: { id: string; amount: number }; adjust?: Record<string, number>; keyframes?: Kf[] };
const first = async (page: Page) => (await project(page)).tracks[0]!.items[0] as unknown as It;

async function addKf(page: Page, sec: number) {
  await seekTo(page, sec);
  await page.getByTestId('kf-btn').tap();
}

test('W3：沒有定格時色調調整的是整段素材（look 寫在素材上、沒有新增定格、整段都是灰）', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  await openTab(page, '色調');
  await expect(page.getByTestId('scope-item')).toHaveCount(0); // 沒有定格就沒有「套用到」
  await page.getByRole('radio', { name: '色調 黑白' }).tap();
  const it = await first(page);
  expect(it.look?.id).toBe('bw');
  expect(it.keyframes).toBeUndefined();
  await seekTo(page, 0.5);
  await expect.poll(async () => isGray(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await seekTo(page, 3);
  await expect.poll(async () => isGray(await samplePreview(page, 0.5, 0.5))).toBe(true);
});

test('W3：第一個定格原色、第二個定格選「黑白」→ 色調從紅色漸漸變灰；預覽與單格輸出一致', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  await addKf(page, 0.02);
  await addKf(page, 3);
  await openTab(page, '色調');
  await expect(page.getByTestId('scope-key')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: '色調 黑白' }).tap();
  await expect.poll(async () => (await first(page)).keyframes?.[1]?.look?.id).toBe('bw');
  const it = await first(page);
  expect(it.keyframes).toHaveLength(2);
  expect(it.keyframes![0]!.look).toBeUndefined(); // 第一個維持原色
  expect(it.look).toBeUndefined(); // 沒有動到整段素材
  await page.evaluate(() => window.scrollTo(0, 0));
  await seekTo(page, 0.02);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await seekTo(page, 1.5);
  await expect
    .poll(async () => {
      const c = await samplePreview(page, 0.5, 0.5);
      return !!c && c[0] > 110 && c[0] < 225 && c[0] - c[1] > 50;
    })
    .toBe(true);
  const prev = await samplePreview(page, 0.5, 0.5);
  const out = await exportFrame(page, 1.5, [[0.5, 0.5]]);
  expect(Math.abs(prev![0]! - out.samples[0]![0]!)).toBeLessThan(14);
  await seekTo(page, 3.3);
  await expect.poll(async () => isGray(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 第二個菱形有調色的小點，第一個沒有
  await expect(page.getByTestId('kf-dot')).toHaveCount(2);
  await expect(page.getByTestId('kf-dot').nth(1)).toHaveClass(/graded/);
  await expect(page.getByTestId('kf-dot').nth(0)).not.toHaveClass(/graded/);
  await page.screenshot({ path: `${SHOT}/drift.png`, fullPage: true });
  // 全部歸零：兩個定格的色調都沒了，位置還在
  await page.getByTestId('grade-reset').tap();
  const after = await first(page);
  expect(after.keyframes).toHaveLength(2);
  expect(after.keyframes!.every((k) => k.look === undefined && k.adjust === undefined)).toBe(true);
});

test('W3：有定格可以改成「整段素材」（清掉定格上的色調，一步復原）；只有位置定格時預設就是「這個定格」', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  await addKf(page, 0.02);
  await addKf(page, 3);
  await openTab(page, '色調');
  await page.getByRole('radio', { name: '色調 黑白' }).tap();
  await expect.poll(async () => (await first(page)).keyframes?.[1]?.look?.id).toBe('bw');
  await page.getByTestId('scope-item').tap();
  await expect(page.getByTestId('scope-item')).toHaveAttribute('aria-checked', 'true');
  expect((await first(page)).keyframes!.every((k) => k.look === undefined)).toBe(true);
  await page.getByRole('radio', { name: '色調 復古' }).tap();
  const it = await first(page);
  expect(it.look?.id).toBe('vintage');
  expect(it.keyframes).toHaveLength(2); // 沒有新增定格
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await first(page)).look).toBeUndefined();
});

test('W4：播放線碰到菱形＝選到那個定格（菱形變白底）；調色只改它；要在很近的地方新增用「定格」按鈕', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  await addKf(page, 0.02);
  await addKf(page, 2);
  await addKf(page, 3.5);
  const kfs = (await first(page)).keyframes!;
  expect(kfs).toHaveLength(3);
  const t1 = kfs[1]!.t;
  const dots = page.getByTestId('kf-dot');
  const here = (i: number) => dots.nth(i).getAttribute('data-here');
  // 離第二個定格 0.08 秒（60 px/秒＝約 5px）：碰到 → 它是白色的，其他不是
  await seekTo(page, t1 + 0.08);
  await expect.poll(() => here(1)).toBe('1');
  expect(await here(0)).toBe('0');
  expect(await here(2)).toBe('0');
  // 選黑白：只改第二個定格，定格數量不變
  await openTab(page, '色調');
  await page.getByRole('radio', { name: '色調 黑白' }).tap();
  await expect.poll(async () => (await first(page)).keyframes?.[1]?.look?.id).toBe('bw');
  const mid = await first(page);
  expect(mid.keyframes).toHaveLength(3);
  expect(mid.keyframes![0]!.look).toBeUndefined();
  expect(mid.keyframes![2]!.look).toBeUndefined();
  // 「定格」按鈕：沒有剛好對齊 → 在播放線的時間再新增一個
  await page.getByTestId('kf-btn').tap();
  await expect.poll(async () => (await first(page)).keyframes?.length).toBe(4);
  // 新的定格變成選到的（白色），原本那個變回橘色
  await expect.poll(() => here(2)).toBe('1');
  expect(await here(1)).toBe('0');
  // 離任何定格都很遠 → 沒有白色的；調色時在播放線新增定格
  await seekTo(page, 1);
  await expect.poll(() => here(1)).toBe('0');
  for (let i = 0; i < 4; i++) expect(await here(i)).toBe('0');
  await expect(page.getByTestId('scope-hint')).toContainText('沒有碰到任何定格');
  await page.screenshot({ path: `${SHOT}/pick-keyframe.png`, fullPage: true });
});

test('W4：點菱形跳到剛好那個時間 → 按「定格」按鈕就是刪除；定格細部調整的「刪除這個定格」也只刪選到的', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  await addKf(page, 0.02);
  await addKf(page, 2);
  await addKf(page, 3.5);
  await page.getByTestId('kf-dot').nth(1).tap();
  await page.getByTestId('kf-btn').tap();
  await expect.poll(async () => (await first(page)).keyframes?.length).toBe(2);
  // 細部調整的刪除：先碰到第二個（剩下的最後一個 3.5 秒），按「刪除這個定格」
  await openTab(page, '圖層');
  await page.getByTestId('kf-dot').nth(1).tap();
  await page.getByTestId('kf-delete').tap();
  await expect.poll(async () => (await first(page)).keyframes?.length).toBe(1);
});

test('W3 順暢度：有色調漂移的片段播放，渲染耗時跟整段同一個色調差不多', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  const play = async () => {
    await seekTo(page, 0.1);
    await page.getByRole('button', { name: '播放', exact: true }).tap();
    await page.waitForTimeout(2200);
    const s = await page.evaluate(() =>
      (
        window as unknown as { __videoclip: { stats: () => { fps: number; renderMs: number } } }
      ).__videoclip.stats(),
    );
    await page.getByRole('button', { name: '暫停', exact: true }).tap();
    return s;
  };
  // 整段同一個色調
  await openTab(page, '色調');
  await page.getByRole('radio', { name: '色調 黑白' }).tap();
  const flat = await play();
  await page.getByTestId('grade-reset').tap();
  // 漂移：0.02 秒原色 → 3.5 秒黑白
  await addKf(page, 0.02);
  await addKf(page, 3.5);
  await page.getByRole('radio', { name: '色調 黑白' }).tap();
  await expect.poll(async () => (await first(page)).keyframes?.[1]?.look?.id).toBe('bw');
  const drift = await play();
  expect(drift.fps).toBeGreaterThan(flat.fps * 0.7);
  expect(drift.renderMs).toBeLessThan(flat.renderMs * 1.6 + 4);
});

test('W5：定格小特效「彈一下」——彈起來的時候綠色疊加素材變大、結束後回到原位；時間軸菱形旁有「彈」；單格輸出一致；取消後消失', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  const ov = async () => (await project(page)).tracks[1]!.items[0] as unknown as It;
  await seekTo(page, 0.02);
  await page.getByTestId('kf-btn').tap();
  await seekTo(page, 1);
  await page.getByTestId('kf-btn').tap();
  await expect.poll(async () => (await ov()).keyframes?.length).toBe(2);
  const t1 = (await ov()).keyframes![1]!.t;
  // 播放線碰到第二個定格（差 0.05 秒）
  await seekTo(page, t1 + 0.05);
  await openTab(page, '圖層');
  await expect(page.getByTestId('pulse-hint')).toHaveCount(0);
  await page.getByRole('radio', { name: '小特效 彈一下' }).tap();
  await expect.poll(async () => (await ov()).keyframes?.[1]?.pulse?.kind).toBe('pop');
  // 力道最大、長度 1 秒：最高點在定格後 0.3 秒
  await page.getByLabel('力道').fill('100');
  await page.getByLabel('長度').fill('10');
  const p = (await ov()).keyframes![1]!.pulse!;
  expect(p.strength).toBeCloseTo(1, 2);
  expect(p.duration).toBeCloseTo(1, 2);
  await page.waitForTimeout(1500); // 預覽自己播完一次
  await expect(page.getByTestId('kf-pulse')).toHaveText('彈');
  await page.evaluate(() => window.scrollTo(0, 0));
  const edge: [number, number] = [0.8, 0.5];
  await seekTo(page, t1 + 1.4); // 結束後：回到原位（邊緣外是紅色）
  await expect.poll(async () => isRed(await samplePreview(page, ...edge))).toBe(true);
  await seekTo(page, t1 + 0.3); // 最高點：變大，邊緣變綠
  await expect.poll(async () => isGreen(await samplePreview(page, ...edge))).toBe(true);
  const out = await exportFrame(page, t1 + 0.3, [edge]);
  expect(out.samples[0]![1]!).toBeGreaterThan(150);
  // 取消
  await page.getByTestId('kf-dot').nth(1).tap(); // 點菱形＝播放線跳到剛好那個定格
  await page.getByTestId('pulse-none').tap();
  await expect.poll(async () => (await ov()).keyframes?.[1]?.pulse).toBeUndefined();
  await expect(page.getByTestId('kf-pulse')).toHaveCount(0);
});
