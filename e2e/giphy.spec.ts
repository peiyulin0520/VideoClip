import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import { clips, createProjectWith, fixture, openTab, project } from './helpers';

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
  await openTab(page, '疊加');
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
