import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import { clips, createProjectWith, fixture, openTab, project, samplePreview, seekTo } from './helpers';

// 沙盒連不到 api.giphy.com：用 page.route 模擬 GIPHY 的回應（格式照官方 API）。測試用假的 key，不用使用者的 key。
const SHOT = 'docs/screenshots/giphy';
const TEST_KEY = 'TEST-KEY-not-real-1234';
const png = fs.readFileSync(fixture('photo.png'));

function sticker(id: string, title: string) {
  const u = (n: string) => `https://media.test/${id}/${n}`;
  return {
    id,
    title,
    images: {
      fixed_width_small: { url: u('small.gif'), webp: u('small.webp'), width: '100', height: '100' },
      original_still: { url: u('still.gif'), width: '400', height: '300' },
      original: { width: '400', height: '300' },
    },
  };
}

async function mockGiphy(page: Page, opts: { badKeys?: string[] } = {}) {
  const calls: URL[] = [];
  await page.route('https://api.giphy.com/**', async (route: Route) => {
    const url = new URL(route.request().url());
    calls.push(url);
    const key = url.searchParams.get('api_key') ?? '';
    if (opts.badKeys?.includes(key))
      return route.fulfill({ status: 403, body: '{"message":"Invalid authentication credentials"}' });
    const q = url.searchParams.get('q');
    const data = q
      ? [sticker('cat1', `${q} 1`), sticker('cat2', `${q} 2`)]
      : [sticker('hot1', 'hot 1'), sticker('hot2', 'hot 2'), sticker('hot3', 'hot 3')];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data }),
    });
  });
  await page.route('https://media.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: png,
    }),
  );
  return calls;
}

async function openGiphy(page: Page) {
  await openTab(page, '素材');
  await page.getByRole('tablist', { name: '貼圖分類' }).getByRole('tab', { name: 'GIPHY' }).tap();
}

test('沒填過 key：顯示申請說明（GIPHY 連結、Create an API Key、VideoClip、Web）；貼上後記住，重新整理不用再貼', async ({
  page,
}) => {
  const calls = await mockGiphy(page);
  await createProjectWith(page, ['solid-blue.webm']);
  await openGiphy(page);
  const setup = page.getByTestId('giphy-key-setup');
  await expect(setup).toBeVisible();
  await expect(setup.getByRole('link', { name: 'GIPHY Developers' })).toHaveAttribute(
    'href',
    'https://developers.giphy.com/dashboard/',
  );
  await expect(setup).toContainText('Create an API Key');
  await expect(setup).toContainText('VideoClip');
  await expect(setup).toContainText('Web');
  await expect(setup).toContainText('不會放到 GitHub');
  expect(calls).toHaveLength(0); // 沒有 key 不會送出請求
  await page.screenshot({ path: `${SHOT}/key-setup.png` });

  await page.getByLabel('GIPHY API key').fill(`  ${TEST_KEY}  `);
  await page.getByRole('button', { name: '儲存' }).tap();
  // 熱門貼圖出現
  await expect(page.getByTestId('giphy-grid').locator('.sticker-cell')).toHaveCount(3);
  expect(calls.every((u) => u.searchParams.get('api_key') === TEST_KEY)).toBe(true);
  // key 存在這台裝置，不在專案資料裡
  expect(await page.evaluate(() => localStorage.getItem('vc-giphy-key'))).toBe(TEST_KEY);
  expect(JSON.stringify(await project(page))).not.toContain(TEST_KEY);

  await page.waitForTimeout(1200);
  await page.reload();
  await expect(clips(page)).toHaveCount(1, { timeout: 20_000 });
  await openGiphy(page);
  await expect(page.getByTestId('giphy-key-setup')).toHaveCount(0);
  await expect(page.getByTestId('giphy-grid').locator('.sticker-cell')).toHaveCount(3);
});

test('搜尋、點貼圖加到這一秒（當照片素材、大小 30%）；搜尋結果不存', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem('vc-giphy-key', k), TEST_KEY);
  const calls = await mockGiphy(page);
  await createProjectWith(page, ['solid-blue.webm']);
  await openGiphy(page);
  await expect(page.getByTestId('giphy-grid').locator('.sticker-cell')).toHaveCount(3);
  await page.getByLabel('搜尋 GIPHY 貼圖').fill('貓咪');
  await page.getByRole('button', { name: '搜尋', exact: true }).tap();
  await expect(page.getByTestId('giphy-grid').locator('.sticker-cell')).toHaveCount(2);
  const last = calls[calls.length - 1]!;
  expect(last.pathname).toBe('/v1/stickers/search');
  expect(last.searchParams.get('q')).toBe('貓咪');
  expect(last.searchParams.get('lang')).toBe('zh-TW');
  await expect(page.getByText('Powered by')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/search.png` });

  await page.getByRole('button', { name: 'GIPHY 貼圖 貓咪 1' }).tap();
  await expect(clips(page)).toHaveCount(2, { timeout: 15_000 });
  const p = await project(page);
  expect(p.tracks[1]!.items[0]!.type).toBe('image');
  expect(p.tracks[1]!.items[0]!.transform.scale).toBeCloseTo(0.3);
  expect(p.assets.some((a) => a.name === 'GIPHY-cat1.png')).toBe(true);
  // 不會存到「我的貼圖」或其他地方（localStorage 只有 key）
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /giphy/i.test(k)));
  expect(keys).toEqual(['vc-giphy-key']);
});

test('key 不正確：顯示提示並回到填 key 的畫面；設定頁可以看到、更換、刪除 key', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-giphy-key', 'BAD-KEY'));
  await mockGiphy(page, { badKeys: ['BAD-KEY', 'ALSO-BAD'] });
  await createProjectWith(page, ['solid-blue.webm']);
  await openGiphy(page);
  await expect(page.getByTestId('giphy-key-setup')).toBeVisible();
  await expect(page.getByTestId('giphy-key-setup')).toContainText('不能用');
  await page.getByLabel('GIPHY API key').fill('ALSO-BAD');
  await page.getByRole('button', { name: '儲存' }).tap();
  await expect(page.locator('.toast').filter({ hasText: '不能用' })).toBeVisible();

  // 設定頁
  await page.evaluate((k) => localStorage.setItem('vc-giphy-key', k), TEST_KEY);
  await page.goto('./#/settings');
  const sec = page.getByRole('region', { name: 'GIPHY 貼圖' });
  await expect(sec.getByTestId('giphy-key-set')).toContainText(TEST_KEY.slice(-4));
  await expect(sec).not.toContainText(TEST_KEY); // 不顯示完整 key
  await sec.getByRole('button', { name: '刪除 key' }).tap();
  expect(await page.evaluate(() => localStorage.getItem('vc-giphy-key'))).toBeNull();
  await expect(sec.getByTestId('giphy-key-setup')).toBeVisible();
});

// ---- 會動的貼圖 ----
const animWebp = fs.readFileSync(fixture('anim-3frames.webp'));
const animGif = fs.readFileSync(fixture('anim-3frames.gif'));

function animSticker(id: string) {
  const u = (n: string) => `https://media.test/${id}/${n}`;
  return {
    id,
    title: `動 ${id}`,
    images: {
      fixed_width_small: { url: u('small.gif'), webp: u('small.webp'), width: '100', height: '100' },
      fixed_height: { url: u('h.gif'), webp: u('h.webp'), width: '200', height: '200' },
      original_still: { url: u('still.gif'), width: '200', height: '200' },
      original: { width: '200', height: '200' },
    },
  };
}

async function mockAnimGiphy(page: Page) {
  const hits: string[] = [];
  await page.route('https://api.giphy.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data: [animSticker('dance')] }),
    }),
  );
  await page.route('https://media.test/**', (route) => {
    const u = route.request().url();
    hits.push(u);
    const isWebp = u.endsWith('.webp');
    const isGif = u.endsWith('.gif') && !u.endsWith('still.gif');
    return route.fulfill({
      status: 200,
      contentType: isWebp ? 'image/webp' : isGif ? 'image/gif' : 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: isWebp ? animWebp : isGif ? animGif : png,
    });
  });
  return hits;
}

const YELLOW: [number, number, number] = [255, 255, 0];
const LIME: [number, number, number] = [0, 255, 0];
const MAGENTA: [number, number, number] = [255, 0, 255];
const near = (c: number[] | null, want: number[], tol = 40) =>
  !!c && want.every((v, i) => Math.abs(c[i]! - v) <= tol);

async function addAnimSticker(page: Page) {
  await openGiphy(page);
  await page.getByRole('button', { name: 'GIPHY 貼圖 動 dance' }).tap();
  await expect(clips(page)).toHaveCount(2, { timeout: 20_000 });
}

test('GIPHY 貼圖會動：加進專案的是動態 WebP；不同時間點取到不同格，會循環；重新整理後還會動', async ({
  page,
}) => {
  await page.addInitScript((k) => localStorage.setItem('vc-giphy-key', k), TEST_KEY);
  const hits = await mockAnimGiphy(page);
  await createProjectWith(page, ['solid-blue.webm']);
  await addAnimSticker(page);
  expect(hits.some((u) => u.endsWith('/dance/h.webp'))).toBe(true); // 下載的是會動的版本
  expect(hits.some((u) => u.endsWith('still.gif'))).toBe(false); // 不是靜態第一格

  const p = await project(page);
  const asset = p.assets.find((a) => a.name === 'GIPHY-dance.webp') as unknown as {
    anim?: { frames: number; duration: number };
    mime: string;
  };
  expect(asset.mime).toBe('image/webp');
  expect(asset.anim!.frames).toBeGreaterThanOrEqual(3);
  expect(asset.anim!.duration).toBeCloseTo(0.9, 1);

  // 貼圖在畫面中央（大小 30%）：0.1 秒黃、0.4 秒綠、0.7 秒洋紅、1.0 秒（下一圈）又是黃
  const colorAt = async (sec: number) => {
    await seekTo(page, sec);
    await page.waitForTimeout(300);
    return samplePreview(page, 0.5, 0.5);
  };
  await expect.poll(async () => near(await colorAt(0.1), YELLOW)).toBe(true);
  await expect.poll(async () => near(await colorAt(0.4), LIME)).toBe(true);
  await expect.poll(async () => near(await colorAt(0.7), MAGENTA)).toBe(true);
  await expect.poll(async () => near(await colorAt(1.05), YELLOW)).toBe(true);
  await page.screenshot({ path: `${SHOT}/anim-sticker.png` });

  // 單格輸出（匯出用）取的也是同一格
  const ex = await page.evaluate(() =>
    (
      window as unknown as {
        __videoclip: {
          exportFrame: (t: number, pts: [number, number][]) => Promise<{ samples: number[][] }>;
        };
      }
    ).__videoclip.exportFrame(0.4, [[0.5, 0.5]]),
  );
  expect(near(ex.samples[0]!, LIME)).toBe(true);

  // 重新整理後還會動
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(clips(page)).toHaveCount(2, { timeout: 20_000 });
  await expect.poll(async () => near(await colorAt(0.1), YELLOW)).toBe(true);
  await expect.poll(async () => near(await colorAt(0.7), MAGENTA)).toBe(true);
});

test('沒有 ImageDecoder 的瀏覽器：改下載 GIF，用備用解碼器一樣會動', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem('vc-giphy-key', k), TEST_KEY);
  await page.addInitScript(() => {
    (window as unknown as { ImageDecoder?: unknown }).ImageDecoder = undefined;
  });
  const hits = await mockAnimGiphy(page);
  await createProjectWith(page, ['solid-blue.webm']);
  await addAnimSticker(page);
  expect(hits.some((u) => u.endsWith('/dance/h.gif'))).toBe(true);
  expect(hits.some((u) => u.endsWith('.webp') && u.includes('/h.'))).toBe(false);
  const p = await project(page);
  expect(p.assets.some((a) => a.name === 'GIPHY-dance.gif')).toBe(true);
  const colorAt = async (sec: number) => {
    await seekTo(page, sec);
    await page.waitForTimeout(300);
    return samplePreview(page, 0.5, 0.5);
  };
  await expect.poll(async () => near(await colorAt(0.1), YELLOW)).toBe(true);
  await expect.poll(async () => near(await colorAt(0.4), LIME)).toBe(true);
  await expect.poll(async () => near(await colorAt(0.7), MAGENTA)).toBe(true);
});

test('GIPHY 沒有會動的版本或下載失敗：退回靜態圖，照常加得進去', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem('vc-giphy-key', k), TEST_KEY);
  await page.route('https://api.giphy.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data: [animSticker('dance')] }),
    }),
  );
  await page.route('https://media.test/**', (route) => {
    const u = route.request().url();
    if (u.endsWith('h.webp') || u.endsWith('h.gif')) return route.fulfill({ status: 500, body: 'x' });
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: png,
    });
  });
  await createProjectWith(page, ['solid-blue.webm']);
  await addAnimSticker(page);
  const p = await project(page);
  expect(p.assets.some((a) => a.name === 'GIPHY-dance.png')).toBe(true);
});

test('我的貼圖：上傳 GIF 會保留會動；一般圖片還是轉成 PNG', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '素材');
  await page.getByRole('tablist', { name: '貼圖分類' }).getByRole('tab', { name: '我的貼圖' }).tap();
  await page
    .getByTestId('my-sticker-input')
    .setInputFiles([fixture('anim-3frames.gif'), fixture('photo.png')]);
  await expect(page.getByTestId('my-sticker-grid').locator('.sticker-cell')).toHaveCount(2, {
    timeout: 10_000,
  });
  await page.getByRole('button', { name: '我的貼圖 anim-3frames.gif' }).tap();
  await expect(clips(page)).toHaveCount(2, { timeout: 15_000 });
  const a = (await project(page)).assets.find((x) => x.name === 'anim-3frames.gif') as unknown as {
    mime: string;
    anim?: { frames: number };
  };
  expect(a.mime).toBe('image/gif');
  expect(a.anim!.frames).toBeGreaterThanOrEqual(3);
  await seekTo(page, 0.4);
  await expect
    .poll(async () => {
      await page.waitForTimeout(200);
      return near(await samplePreview(page, 0.5, 0.5), LIME);
    })
    .toBe(true);
});

test('往下滑載入更多：一頁 24 個，滑到底再載下一頁，直到沒有更多；不會重複', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem('vc-giphy-key', k), TEST_KEY);
  await mockGiphy(page);
  const offsets: number[] = [];
  await page.route('https://api.giphy.com/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset') ?? '0');
    offsets.push(offset);
    const n = Math.max(0, Math.min(24, 60 - offset));
    const data = Array.from({ length: n }, (_, i) => sticker(`m${offset + i}`, `many ${offset + i}`));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ data, pagination: { total_count: 60, count: n, offset } }),
    });
  });
  await createProjectWith(page, ['solid-blue.webm']);
  await openGiphy(page);
  const cells = page.getByTestId('giphy-grid').locator('.sticker-cell');
  await expect(cells.first()).toBeVisible();
  // 一直往下滑，直到 60 個都載入
  await expect
    .poll(
      async () => {
        await page
          .getByTestId('giphy-sentinel')
          .scrollIntoViewIfNeeded({ timeout: 500 })
          .catch(() => {});
        return cells.count();
      },
      { timeout: 15_000 },
    )
    .toBe(60);
  expect(offsets).toEqual([0, 24, 48]);
  await expect(page.getByTestId('giphy-sentinel')).toHaveCount(0); // 沒有更多了
});
