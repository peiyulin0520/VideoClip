import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, openTab, openTool, project } from './helpers';

// feedback-17：重擊排字的換行：預設排成一行；〔自動換行〕；文字內容按 Enter 就照使用者的行
const textItem = async (page: Page) =>
  (
    (await project(page)).tracks as unknown as {
      items: { type: string; kinetic?: { id: string; wrap?: string } }[];
    }[]
  )
    .flatMap((t) => t.items)
    .find((i) => i.type === 'text')!;

test('重擊排字：換行方式只在重擊排字出現；排成一行／自動換行寫進字卡', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  await page.getByLabel('文字內容').fill('蔡氏家族\n聚餐去');
  await openTab(page, '特效');
  await openTool(page, 'fx.textfx');
  await page.getByTestId('kn-group-in').tap();
  await openTool(page, 'fx.textfx');
  await page.getByTestId('kn-group-in').tap();
  await page.getByRole('radio', { name: '文字特效 爆出' }).tap();
  await expect(page.getByTestId('kn-wrap')).toHaveCount(0);
  await page.getByRole('radio', { name: '文字特效 重擊排字' }).tap();
  expect((await textItem(page)).kinetic?.id).toBe('hitline');
  await expect(page.getByTestId('kn-wrap')).toBeVisible();
  await expect(page.getByRole('radio', { name: '換行 排成一行' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: '換行 自動換行' }).tap();
  expect((await textItem(page)).kinetic?.wrap).toBe('auto');
  await page.getByRole('radio', { name: '換行 排成一行' }).tap();
  expect((await textItem(page)).kinetic?.wrap).toBeUndefined();
});
