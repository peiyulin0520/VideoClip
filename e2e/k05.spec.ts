import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, openTab, openTool, project, samplePreview, seekTo } from './helpers';

const SHOT = 'docs/screenshots/kinetic';
type Kin = {
  id: string;
  accent?: string;
  bg?: string;
  speed?: number;
  size?: { w: number; h: number };
  fade?: string;
};
type Txt = {
  id: string;
  type: string;
  card: { runs: { color: string }[] };
  kinetic?: Kin;
  transform: { x: number; y: number; scale: number };
};
const textItem = async (page: Page) =>
  ((await project(page)).tracks as unknown as { items: Txt[] }[])
    .flatMap((t) => t.items)
    .find((i) => i.type === 'text')!;

async function setup(page: Page, kid: string, group = 'in') {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  await page.getByLabel('文字內容').fill('開場');
  await openTab(page, '特效');
  await openTool(page, 'fx.kinetic');
  await page.getByTestId(`kn-group-${group}`).tap();
  await page.getByRole('radio', { name: `文字特效 ${kid}` }).tap();
}

test('K0.5 顏色都能自訂：字色、強調色、底色各有選色器（含自訂顏色）；字色同步到字卡', async ({ page }) => {
  test.setTimeout(150_000);
  await setup(page, '爆出');
  const kn = page.getByTestId('kn-colors');
  await expect(kn.locator('.zone-title')).toHaveText('顏色');
  for (const name of ['字色', '強調色', '自訂底色']) {
    await expect(kn.getByRole('button', { name: `${name} 自訂顏色` })).toBeVisible();
  }
  // 強調色：點一個色票 → 寫進字卡
  const accent = kn.locator('[aria-label^="強調色 #"]').nth(2);
  const hex = (await accent.getAttribute('aria-label'))!.split(' ')[1]!;
  await accent.tap();
  expect((await textItem(page)).kinetic?.accent).toBe(hex);
  // 字色：寫進字卡文字段的顏色
  const fg = kn.locator('[aria-label^="字色 #"]').nth(3);
  const fgHex = (await fg.getAttribute('aria-label'))!.split(' ')[1]!;
  await fg.tap();
  expect((await textItem(page)).card.runs[0]!.color.toLowerCase()).toBe(fgHex.toLowerCase());
  // 底色：點色票＝自訂色碼；再按「透明」拿掉
  const bgSw = kn.locator('[aria-label^="自訂底色 #"]').nth(1);
  const bgHex = (await bgSw.getAttribute('aria-label'))!.split(' ')[1]!;
  await bgSw.tap();
  expect((await textItem(page)).kinetic?.bg?.toLowerCase()).toBe(bgHex.toLowerCase());
  await kn.getByRole('radio', { name: '底色 透明' }).tap();
  expect((await textItem(page)).kinetic?.bg).toBeUndefined();
  // 自訂顏色彈窗打得開
  await kn.getByRole('button', { name: '強調色 自訂顏色' }).tap();
  await expect(page.getByTestId('color-popup')).toBeVisible();
  await page.getByRole('button', { name: '關閉', exact: true }).tap();
  await page.screenshot({ path: `${SHOT}/k05-colors-390.png` });
});

test('K0.5 顯示範圍：預設是畫面中間一條 16:9；調整範圍（拖邊）後框外看不到字；重置回預設；巨字橫移預設整個畫面且左右淡出', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await setup(page, '爆出');
  await page.getByRole('radio', { name: '底色 墨黑' }).tap();
  // 預設框：直式畫面的 16:9 一條（寬＝整個畫面寬）→ 框外（上方）是底下的藍色影片
  expect((await textItem(page)).kinetic?.size).toBeUndefined();
  await page.evaluate(() => window.scrollTo(0, 0));
  await seekTo(page, 1.0);
  const dark = (c: number[] | null) => !!c && c[0]! < 45 && c[2]! < 50;
  const blue = (c: number[] | null) => !!c && c[2]! > 200 && c[0]! < 60;
  expect(dark(await samplePreview(page, 0.1, 0.4))).toBe(true);
  expect(blue(await samplePreview(page, 0.1, 0.2))).toBe(true);
  // 調整範圍：按鈕 → 預覽上有虛線框＋把手；把下邊往下拖 → 套用 → 框變高
  await openTool(page, 'fx.kinetic');
  await page.getByTestId('kn-area-edit').tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByTestId('ka-frame')).toBeVisible();
  const h = (await page.getByTestId('ka-h-b').boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 120, { steps: 6 });
  await page.mouse.up();
  await page.screenshot({ path: `${SHOT}/k05-area-edit-390.png` });
  await page.getByTestId('ka-apply').tap();
  const it = await textItem(page);
  expect(it.kinetic?.size?.w).toBeCloseTo(1, 1);
  expect(it.kinetic!.size!.h).toBeGreaterThan(0.36); // 16:9 的框高約 0.317
  await seekTo(page, 1.0);
  // 往下多出來的範圍現在也是墨黑（0.4 往下一點點）
  expect(dark(await samplePreview(page, 0.1, 0.63))).toBe(true);
  // 縮窄：把框縮成原本的一半高 → 框外看不到
  await openTool(page, 'fx.kinetic');
  await page.getByTestId('kn-area-edit').tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  const hb = (await page.getByTestId('ka-h-b').boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - 260, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId('ka-apply').tap();
  const small = (await textItem(page)).kinetic!.size!;
  expect(small.h).toBeLessThan(0.2);
  await seekTo(page, 1.0);
  expect(blue(await samplePreview(page, 0.1, 0.63))).toBe(true); // 框外：底下的影片
  // 重置範圍
  await openTool(page, 'fx.kinetic');
  await page.getByTestId('kn-area-reset').tap();
  expect((await textItem(page)).kinetic?.size).toBeUndefined();
  // 放棄：按 ✕ 不改
  await openTool(page, 'fx.kinetic');
  await page.getByTestId('kn-area-edit').tap();
  await page.getByTestId('ka-close').tap();
  await expect(page.getByTestId('ka-frame')).toHaveCount(0);
  expect((await textItem(page)).kinetic?.size).toBeUndefined();

  // 巨字橫移：預設整個畫面、左右淡出（框的左右邊緣是透明的，影片的藍色透出來）
  await openTool(page, 'fx.kinetic');
  await page.getByTestId('kn-group-flow').tap();
  await openTool(page, 'fx.kinetic');
  await page.getByRole('radio', { name: '文字特效 巨字橫移' }).tap();
  await expect(page.getByRole('radio', { name: '邊緣淡出 左右' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: '邊緣淡出 無' }).tap();
  expect((await textItem(page)).kinetic?.fade).toBe('none');
});
