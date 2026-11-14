import { expect, test } from '@playwright/test';
import { createProjectWith } from './helpers';

// 開發建置的版本號是 'dev'，不會檢查更新；e2e 跑的是正式建置（vite build＋preview），有真的版本號
test('設定頁「檢查更新」：版本相同＝已經是最新版', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-skip-onboarding', '1'));
  await page.goto('./#/settings');
  await expect(page.getByTestId('app-version')).toContainText('（');
  await page.getByTestId('check-update').tap();
  await expect(page.locator('.toast').filter({ hasText: /已經是最新版|開發版/ })).toBeVisible();
  // version.json 真的有被建置出來
  const res = await page.request.get('./version.json');
  expect(res.ok()).toBe(true);
  expect((await res.json()).version).toContain('（');
});

test('伺服器版本不一樣、新的 Service Worker 沒接手：畫面底下出現「點一下更新」橫幅', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-skip-onboarding', '1'));
  await page.route('**/version.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: '2099-01-01 00:00（zzzzzzz）' }),
    }),
  );
  await page.goto('./#/settings');
  await page.getByTestId('check-update').tap();
  await expect(page.getByTestId('update-banner')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('update-banner')).toContainText('01/01 00:00');
});

test('編輯器頂列專案名稱下面有小字版本日期', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await expect(page.getByTestId('proj-ver')).toHaveText(/\d{2}\/\d{2} \d{2}:\d{2}|dev/);
});
