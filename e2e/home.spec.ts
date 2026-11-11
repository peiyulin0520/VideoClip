import { expect, test } from '@playwright/test';

test('首頁在 iPhone 13 尺寸可開啟、沒有錯誤，並可點設定', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.addInitScript(() => localStorage.setItem('vc-skip-onboarding', '1'));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'VideoClip 剪輯' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/phase0/home.png' });

  // 按鈕要有反應（使用者回報過 icon 沒反應）
  const settings = page.getByRole('link', { name: '設定' });
  const box = await settings.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await settings.tap();
  await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
  await page.getByRole('link', { name: '回首頁' }).tap();
  await expect(page.getByRole('heading', { name: 'VideoClip 剪輯' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('PWA manifest 設定正確', async ({ request }) => {
  const res = await request.get('manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBe('VideoClip 剪輯');
  expect(m.display).toBe('standalone');
});
