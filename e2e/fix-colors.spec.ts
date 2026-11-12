import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, legacyBox, openTab, project, touchDrag } from './helpers';

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

const rgbOf = async (page: Page) => [
  Number(await page.getByTestId('cp-R').textContent()),
  Number(await page.getByTestId('cp-G').textContent()),
  Number(await page.getByTestId('cp-B').textContent()),
];
const hexOf = async (page: Page) => ((await page.getByTestId('cp-hex').textContent()) ?? '').toLowerCase();
const rgbHex = (c: number[]) => '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('');
/** 在某個區塊（0–1 位置）上用手指點一下／拖一段 */
async function areaPoint(page: Page, id: string, fx: number, fy: number) {
  const b = (await page.getByTestId(id).boundingBox())!;
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
}

test('自訂顏色：跳出彈窗，拖拉選色、色相條、RGB 細調、原本／新的預覽；取消不套用、確定才套用；沒有輸入色碼了', async ({
  page,
}) => {
  await newText(page);
  const was = (await card(page)).runs[0]!.color;
  // 沒有輸入色碼的欄位、也沒有系統取色器
  await expect(page.getByLabel('文字顏色 色碼')).toHaveCount(0);
  await expect(page.locator('input[type="color"]')).toHaveCount(0);

  await page.getByRole('button', { name: '文字顏色 自訂顏色' }).tap();
  const dlg = page.getByTestId('color-popup');
  await expect(dlg).toBeVisible();
  await page.screenshot({ path: `${SHOT}/color-popup-open.png` });
  // 原本的顏色在左邊的色塊，新的一開始跟原本一樣
  const oldBg = await page.getByTestId('cp-old').evaluate((el) => getComputedStyle(el).backgroundColor);
  const newBg = await page.getByTestId('cp-new').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(newBg).toBe(oldBg);

  // 點色相條 1/3 → 綠色系；點方塊右上角 → 最鮮豔最亮 = 純綠
  await page.touchscreen.tap(
    ...(Object.values(await areaPoint(page, 'cp-hue', 1 / 3, 0.5)) as [number, number]),
  );
  await page.touchscreen.tap(
    ...(Object.values(await areaPoint(page, 'cp-sv', 0.98, 0.03)) as [number, number]),
  );
  const [pr, pg, pb] = await rgbOf(page);
  expect(pg).toBeGreaterThan(235);
  expect(pr).toBeLessThan(20);
  expect(pb).toBeLessThan(20);

  // 在方塊上拖到中間（手指拖拉）：顏色改變，RGB 數字和色碼一致
  await touchDrag(page, await areaPoint(page, 'cp-sv', 0.98, 0.03), await areaPoint(page, 'cp-sv', 0.5, 0.5));
  await page.waitForTimeout(250); // CDP 觸控事件到畫面更新有一點延遲
  const mid = await rgbOf(page);
  expect(mid[1]).toBeGreaterThan(100);
  expect(mid[1]).toBeLessThan(160);
  expect(mid[0]).toBeLessThan(mid[1]!); // 還是偏綠
  expect(await hexOf(page)).toBe(rgbHex(mid));
  const newBg2 = await page.getByTestId('cp-new').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(newBg2).not.toBe(oldBg);
  await page.screenshot({ path: `${SHOT}/color-popup-dragged.png` });

  // RGB 細調：＋／−、滑桿
  const r0 = mid[0]!;
  await page.getByRole('button', { name: '紅色 R 加 1' }).tap();
  expect((await rgbOf(page))[0]).toBe(r0 + 1);
  await page.getByRole('button', { name: '紅色 R 減 1' }).tap();
  await page.getByRole('button', { name: '紅色 R 減 1' }).tap();
  expect((await rgbOf(page))[0]).toBe(r0 - 1);
  await page.getByRole('slider', { name: '藍色 B', exact: true }).fill('200');
  await page.getByRole('slider', { name: '紅色 R', exact: true }).fill('10');
  const c = await rgbOf(page);
  expect(c[0]).toBe(10);
  expect(c[2]).toBe(200);
  expect(await hexOf(page)).toBe(rgbHex(c));

  // 取消：什麼都不變、也不進「最近用過」
  await page.getByRole('button', { name: '取消' }).tap();
  await expect(dlg).toHaveCount(0);
  expect((await card(page)).runs[0]!.color).toBe(was);

  // 再開一次，調到指定顏色後按確定 → 套用，而且變成最近用過的第一個
  await page.getByRole('button', { name: '文字顏色 自訂顏色' }).tap();
  await page.getByRole('slider', { name: '紅色 R', exact: true }).fill('18');
  await page.getByRole('slider', { name: '綠色 G', exact: true }).fill('171');
  await page.getByRole('slider', { name: '藍色 B', exact: true }).fill('52');
  expect(await hexOf(page)).toBe('#12ab34');
  await page.getByRole('button', { name: '確定' }).tap();
  await expect(dlg).toHaveCount(0);
  expect((await card(page)).runs[0]!.color).toBe('#12ab34');
  await expect(page.getByLabel('最近用過的顏色').getByRole('button').first()).toHaveAttribute(
    'aria-label',
    /#12ab34/,
  );

  // 彈窗按鈕夠大、點背景等於取消
  await page.getByRole('button', { name: '文字顏色 自訂顏色' }).tap();
  const step = (await page.getByRole('button', { name: '紅色 R 加 1' }).boundingBox())!;
  expect(step.width).toBeGreaterThanOrEqual(44);
  expect(step.height).toBeGreaterThanOrEqual(44);
  await page.touchscreen.tap(5, 5);
  await expect(dlg).toHaveCount(0);
  expect((await card(page)).runs[0]!.color).toBe('#12ab34');
});

test('自訂顏色：拉到灰色後色相不會跳回去；在方塊外面拖也繼續跟著手指', async ({ page }) => {
  await newText(page);
  await page.getByRole('button', { name: '文字顏色 自訂顏色' }).tap();
  await page.touchscreen.tap(
    ...(Object.values(await areaPoint(page, 'cp-hue', 0.5, 0.5)) as [number, number]),
  ); // 青色系
  const hueBefore = await page.getByTestId('cp-hue').getAttribute('aria-valuetext');
  // 把 S 拉到 0（方塊最左邊）→ 灰／白，色相條的顏色不變
  await touchDrag(page, await areaPoint(page, 'cp-sv', 0.5, 0.5), await areaPoint(page, 'cp-sv', 0.005, 0.5));
  await page.waitForTimeout(250);
  expect(await page.getByTestId('cp-hue').getAttribute('aria-valuetext')).toBe(hueBefore);
  // 手指拖出方塊右邊很遠：夾在邊緣（飽和度 100%），不是壞掉
  const from = await areaPoint(page, 'cp-sv', 0.5, 0.5);
  const to = { x: from.x + 150, y: from.y };
  await touchDrag(page, from, to);
  await page.waitForTimeout(250);
  const [r, g, b] = await rgbOf(page);
  expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeGreaterThan(100);
});

test('所有顏色設定處都用同一個選擇器：字塊、字塊外框、描邊兩層、裝飾', async ({ page }) => {
  await newText(page);
  await section(page, '字塊');
  await page.getByRole('radio', { name: '圓角' }).tap();
  await legacyBox(page);
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
  await page.getByRole('button', { name: '外層描邊顏色 自訂顏色' }).tap();
  await page.getByRole('slider', { name: '紅色 R', exact: true }).fill('122');
  await page.getByRole('slider', { name: '綠色 G', exact: true }).fill('31');
  await page.getByRole('slider', { name: '藍色 B', exact: true }).fill('162');
  await page.getByRole('button', { name: '確定' }).tap();
  expect((await card(page)).runs[0]!.strokes![0]!.color).toBe('#7a1fa2');

  await section(page, '裝飾');
  await page.getByRole('button', { name: '裝飾 尾端圈圈' }).tap();
  await page.getByRole('button', { name: '尾端圈圈顏色 更多顏色' }).tap();
  await page.getByRole('button', { name: '尾端圈圈顏色 #76ff03' }).tap();
  expect((await card(page)).decorations![0]!.color).toBe('#76ff03');
  // 裝飾自己的預設色（桃紅）仍在基本色最前面
  await expect(page.getByRole('button', { name: '尾端圈圈顏色 #E2006E' })).toBeVisible();
});
