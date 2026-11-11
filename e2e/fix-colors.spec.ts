import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, openTab, project } from './helpers';

const SHOT = 'docs/screenshots/fix-feedback-2';

type Card = {
  runs: { color: string; strokes?: { color: string; width: number }[] }[];
  box?: { fill: string; stroke?: { color: string } };
  decorations?: { kind: string; color: string }[];
};
const card = async (page: Page) => (await project(page)).tracks[1]!.items[0]!.card as unknown as Card;
const section = (page: Page, name: string) =>
  page.getByRole('tablist', { name: '字卡設定' }).getByRole('tab', { name, exact: true }).tap();

async function newText(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
}

test('文字顏色：基本色、展開 32 色、每一格都點得動、最近用過、重新整理後最近用過還在', async ({ page }) => {
  await newText(page);
  // 一開始：基本 8 色在，沒有「最近用過」
  await expect(page.getByRole('button', { name: /^文字顏色 #/ })).toHaveCount(8);
  await expect(page.getByLabel('最近用過的顏色')).toHaveCount(0);

  await page.getByRole('button', { name: '文字顏色 更多顏色' }).tap();
  const all = page.getByRole('button', { name: /^文字顏色 #/ });
  await expect(all).toHaveCount(32);
  await page.screenshot({ path: `${SHOT}/color-picker-expanded.png` });
  for (let i = 0; i < 32; i++) {
    const hex = (await all.nth(i).getAttribute('aria-label'))!.split(' ')[1]!;
    await all.nth(i).tap();
    expect((await card(page)).runs[0]!.color.toLowerCase()).toBe(hex.toLowerCase());
  }

  // 最近用過：最後點的 8 個，最新在最前面
  const recents = page.getByLabel('最近用過的顏色').getByRole('button');
  await expect(recents).toHaveCount(8);
  const last = (await card(page)).runs[0]!.color.toLowerCase();
  expect(((await recents.first().getAttribute('aria-label')) ?? '').toLowerCase()).toContain(last);

  // 點最近用過的 → 套用
  const target = ((await recents.nth(3).getAttribute('aria-label')) ?? '').split(' ')[1]!;
  await recents.nth(3).tap();
  expect((await card(page)).runs[0]!.color.toLowerCase()).toBe(target.toLowerCase());

  // 重新整理後最近用過還在（存在這台裝置）
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.locator('[data-testid="clip"][data-kind="text"]')).toHaveCount(1, { timeout: 20_000 });
  await page.locator('[data-testid="clip"][data-kind="text"]').tap();
  await openTab(page, '文字');
  await expect(page.getByLabel('最近用過的顏色').getByRole('button')).toHaveCount(8);
});

test('自訂顏色：輸入色碼、系統取色器；壞色碼不會套用；最近用過會出現', async ({ page }) => {
  await newText(page);
  await page.getByRole('button', { name: '文字顏色 更多顏色' }).tap();
  const hex = page.getByLabel('文字顏色 色碼');
  await hex.fill('#12AB34');
  expect((await card(page)).runs[0]!.color).toBe('#12ab34');
  await hex.fill('#12ab3'); // 還沒輸入完：不套用
  expect((await card(page)).runs[0]!.color).toBe('#12ab34');
  await hex.fill('xyz');
  expect((await card(page)).runs[0]!.color).toBe('#12ab34');
  await hex.fill('#ab12cd');
  await hex.blur();
  expect((await card(page)).runs[0]!.color).toBe('#ab12cd');
  await expect(page.getByLabel('最近用過的顏色').getByRole('button').first()).toHaveAttribute(
    'aria-label',
    /#ab12cd/,
  );
  // 系統取色器（iPhone 上會跳出系統色盤）：<input type=color> 的值改變就套用
  await page.getByLabel('文字顏色 自訂').evaluate((el) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#00ff88');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect((await card(page)).runs[0]!.color).toBe('#00ff88');
  // 自訂按鈕大小夠大
  const b = (await page.locator('.custom-btn').boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(36);
});

test('所有顏色設定處都用同一個選擇器：字塊、字塊外框、描邊兩層、裝飾', async ({ page }) => {
  await newText(page);
  await section(page, '字塊');
  await page.getByRole('radio', { name: '圓角' }).tap();
  await page.getByRole('button', { name: '字塊顏色 #ffd23f' }).tap();
  expect((await card(page)).box!.fill).toBe('#ffd23f');
  await page.getByRole('button', { name: '字塊顏色 更多顏色' }).tap();
  await page.getByRole('button', { name: '字塊顏色 #c5f0f7' }).tap();
  expect((await card(page)).box!.fill).toBe('#c5f0f7');

  await section(page, '描邊陰影');
  await page.getByRole('button', { name: '外層描邊顏色 #111111' }).tap();
  await page.getByRole('button', { name: '內層描邊顏色 #ffd23f' }).tap();
  const st = (await card(page)).runs[0]!.strokes!;
  expect(st[0]!.color).toBe('#111111');
  expect(st[1]!.color).toBe('#ffd23f');
  await page.getByRole('button', { name: '外層描邊顏色 更多顏色' }).tap();
  await page.getByLabel('外層描邊顏色 色碼').fill('#7a1fa2');
  expect((await card(page)).runs[0]!.strokes![0]!.color).toBe('#7a1fa2');

  await section(page, '裝飾');
  await page.getByRole('button', { name: '裝飾 尾端圈圈' }).tap();
  await page.getByRole('button', { name: '尾端圈圈顏色 更多顏色' }).tap();
  await page.getByRole('button', { name: '尾端圈圈顏色 #76ff03' }).tap();
  expect((await card(page)).decorations![0]!.color).toBe('#76ff03');
  // 裝飾自己的預設色（桃紅）仍在基本色最前面
  await expect(page.getByRole('button', { name: '尾端圈圈顏色 #E2006E' })).toBeVisible();
});
