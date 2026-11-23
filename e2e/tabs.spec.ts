import { expect, test, type Page } from '@playwright/test';
import { addOverlays, clips, createProjectWith, fixture, openTab, showTimeline } from './helpers';

const SHOT = 'docs/screenshots/feedback-6/tabs';
const NAMES = ['剪輯', '加入', '文字', '版型', '特效', '色調', '音訊'] as const;
// 目前的類別：第一層看選中的類別；剪輯、加入、文字進到第二層後看工具列的名稱
const activeTab = async (page: Page) => {
  const sel = page.getByRole('tab', { selected: true });
  if (await sel.count()) return sel.first().textContent();
  const row = await page.getByTestId('fb-tools').getByRole('toolbar').getAttribute('aria-label');
  return row === '剪輯工具' ? '剪輯' : row;
};
const expectTab = (page: Page, name: string) =>
  expect.poll(async () => activeTab(page), { message: `目前的類別應該是 ${name}` }).toBe(name);

test('七個類別都在、390 寬點得到每一個；每一個有該有的內容', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(7);
  expect(await tabs.allTextContents()).toEqual([...NAMES]);

  const want: Record<(typeof NAMES)[number], string | RegExp> = {
    剪輯: '分割',
    加入: '貼圖',
    文字: '新增文字',
    版型: '拍貼機直條',
    特效: /轉場/,
    色調: /色調組合/,
    音訊: /加入背景音樂/,
  };
  for (const name of NAMES) {
    await openTab(page, name === '加入' ? '疊加' : name);
    await expectTab(page, name);
    if (name === '版型')
      await expect(page.getByRole('button', { name: `版型 ${want[name] as string}` })).toBeVisible();
    else if (name === '剪輯' || name === '加入' || name === '文字')
      await expect(
        page.getByTestId('fb-tools').getByRole('button', { name: want[name] as string }),
      ).toBeVisible();
    else await expect(page.getByText(want[name]).first()).toBeVisible();
    await page.screenshot({ path: `${SHOT}/tab-${name}.png` });
  }
});

test('剪輯分頁只留跟剪輯影片有關的（含刪除並補齊）；沒有前後移；移除版型在版型、全部靜音在音訊', async ({
  page,
}) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm']);
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  for (const n of ['匯入', '分割', '刪除', '刪除並補齊', '複製', '片段範圍', '裁切', '變速', '音量'])
    await expect(page.getByRole('button', { name: n, exact: true })).toBeVisible();
  for (const n of ['前移', '後移', '全部影片靜音', '移除版型'])
    await expect(page.getByRole('button', { name: n })).toHaveCount(0);

  await openTab(page, '圖層');
  for (const n of ['前移', '後移']) await expect(page.getByRole('button', { name: n })).toHaveCount(0); // 每一層都是自由擺放，沒有順序可前後移
  await openTab(page, '音訊');
  await expect(page.getByRole('button', { name: '全部影片靜音' })).toBeVisible();
});

test('選了東西功能列自動跳：字卡→文字、音樂→音訊、從文字／音訊點影片→剪輯；在加入加素材不被帶走', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  // 新增文字（在文字分頁）→ 留在文字
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  await expectTab(page, '文字');
  // 點影片 → 從文字切到剪輯
  const video = page.locator('[data-testid="clip"][data-kind="video"]').first();
  await video.tap();
  await expectTab(page, '剪輯');
  // 點時間軸上的字卡 → 切到文字（先捲到看得到時間軸：黏在上面的分頁列會蓋住字卡）
  await showTimeline(page);
  await page.locator('[data-testid="clip"][data-kind="text"]').first().tap();
  await expectTab(page, '文字');
  // 加音樂（在音訊分頁）→ 留在音訊；再點影片 → 剪輯；再點音樂 → 音訊
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.locator('[data-testid="clip"][data-kind="audio"]')).toHaveCount(1, { timeout: 20_000 });
  await expectTab(page, '音訊');
  await showTimeline(page);
  await video.tap();
  await expectTab(page, '剪輯');
  await showTimeline(page);
  await page.locator('[data-testid="clip"][data-kind="audio"]').first().tap();
  await expectTab(page, '音訊');
  // 疊加分頁加素材：自動選取新的，但分頁不變
  await addOverlays(page, ['solid-green.webm']);
  await expectTab(page, '加入');
});
