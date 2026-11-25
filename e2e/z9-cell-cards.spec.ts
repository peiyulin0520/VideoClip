import { expect, test } from '@playwright/test';
import { createProjectWith, finishLayout, fixture, openTab, openTool, selectFrame } from './helpers';

// feedback-15 Z9：〔各格〕每一格一張卡（格號、縮圖、段數、＋加素材）
test('Z9 〔各格〕卡片：一格一張、顯示段數；〔＋加素材〕直接開加素材；點卡片開這一格視窗', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  await selectFrame(page);
  await openTab(page, '版型');
  await openTool(page, 'layout.cells');
  const cards = page.getByTestId('cell-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('1 段');
  await expect(cards.nth(1)).toContainText('1 段');
  await page.screenshot({ path: 'docs/screenshots/feedback-15/z9-cell-cards.png' });
  // 〔＋加素材〕：直接升起「加到第 2 格」
  await page.getByRole('button', { name: '2 號格 加入素材' }).tap();
  await page.getByRole('dialog', { name: '加到第 2 格' }).getByTestId('cell-add-color').tap();
  await expect(page.getByTestId('cell-card').nth(1)).toContainText('2 段', { timeout: 20_000 });
});

test('Z9 點卡片：開那一格的視窗', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  await selectFrame(page);
  await openTab(page, '版型');
  await openTool(page, 'layout.cells');
  await page.getByTestId('cc-open').first().tap();
  await expect(page.getByRole('dialog', { name: '第 1 格' })).toBeVisible();
});
