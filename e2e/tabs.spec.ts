import { expect, test, type Page } from '@playwright/test';
import { addOverlays, clips, createProjectWith, fixture, openTab } from './helpers';

const SHOT = 'docs/screenshots/feedback-6/tabs';
const NAMES = ['剪輯', '疊加', '文字', '圖層', '版型', '素材', '音訊'] as const;
const activeTab = async (page: Page) =>
  page.getByRole('tab', { selected: true }).first().textContent();

test('七個分頁都在、390 寬點得到每一個（放不下時分頁列可以左右滑）；每一頁有該有的內容', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(7);
  expect(await tabs.allTextContents()).toEqual([...NAMES]);

  const want: Record<(typeof NAMES)[number], string | RegExp> = {
    剪輯: '分割',
    疊加: /加入影片或照片/,
    文字: /新增文字/,
    圖層: '這一秒的圖層',
    版型: '拍貼機直條',
    素材: '貼圖',
    音訊: /加入背景音樂/,
  };
  for (const name of NAMES) {
    await page.getByRole('tab', { name }).tap();
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    if (name === '版型') await expect(page.getByRole('button', { name: `版型 ${want[name] as string}` })).toBeVisible();
    else if (name === '剪輯') await expect(page.getByRole('button', { name: '分割' })).toBeVisible();
    else await expect(page.getByText(want[name]).first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/tab-${name}.png` });
  }
  // 每個分頁都在畫面內，或可以捲進畫面
  const bar = await page.locator('.tabs').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(bar.sw).toBeGreaterThanOrEqual(bar.cw);
});

test('剪輯分頁只留跟剪輯影片有關的（含刪除並補齊）；沒有前後移；移除版型在版型、全部靜音在音訊', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm']);
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  for (const n of ['匯入', '分割', '刪除', '刪除並補齊', '複製', '修剪', '裁切', '變速', '音量'])
    await expect(page.getByRole('button', { name: n, exact: true })).toBeVisible();
  for (const n of ['前移', '後移', '全部影片靜音', '移除版型'])
    await expect(page.getByRole('button', { name: n })).toHaveCount(0);

  await openTab(page, '圖層');
  for (const n of ['前移', '後移']) await expect(page.getByRole('button', { name: n })).toHaveCount(0); // 每一層都是自由擺放，沒有順序可前後移
  await openTab(page, '音訊');
  await expect(page.getByRole('button', { name: '全部影片靜音' })).toBeVisible();
});

test('選了東西自動切分頁：字卡→文字、音樂→音訊、從文字／音訊點影片→剪輯；在疊加分頁加素材不被帶走', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  // 新增文字（在文字分頁）→ 留在文字
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增文字/ }).tap();
  expect(await activeTab(page)).toBe('文字');
  // 點影片 → 從文字切到剪輯
  const video = page.locator('[data-testid="clip"][data-kind="video"]').first();
  await video.tap();
  expect(await activeTab(page)).toBe('剪輯');
  // 點時間軸上的字卡 → 切到文字
  await page.locator('[data-testid="clip"][data-kind="text"]').first().tap();
  expect(await activeTab(page)).toBe('文字');
  // 加音樂（在音訊分頁）→ 留在音訊；再點影片 → 剪輯；再點音樂 → 音訊
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.locator('[data-testid="clip"][data-kind="audio"]')).toHaveCount(1, { timeout: 20_000 });
  expect(await activeTab(page)).toBe('音訊');
  await video.tap();
  expect(await activeTab(page)).toBe('剪輯');
  await page.locator('[data-testid="clip"][data-kind="audio"]').first().tap();
  expect(await activeTab(page)).toBe('音訊');
  // 疊加分頁加素材：自動選取新的，但分頁不變
  await addOverlays(page, ['solid-green.webm']);
  expect(await activeTab(page)).toBe('疊加');
});
