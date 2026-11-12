import { expect, test, type Page } from '@playwright/test';
import { countColor, createProjectWith, openTab, project } from './helpers';

const SHOT = 'docs/screenshots/phase3a';

const card = async (page: Page) =>
  (await project(page)).tracks[1]!.items[0]!.card as unknown as {
    align: string;
    width?: number;
    box?: {
      shape: string;
      fill: string;
      opacity: number;
      radius?: number;
      nudgeY: number;
      padding: Record<string, number>;
    };
    runs: {
      letterSpacing: number;
      lineHeight: number;
      weight: string;
      italic?: boolean;
      strokes?: { color: string; width: number }[];
      shadow?: { blur: number };
    }[];
  };

const setRange = (page: Page, label: string, v: number) =>
  page.getByRole('slider', { name: label, exact: true }).evaluate((el, val) => {
    const input = el as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(input, String(val));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);

const section = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).tap();

test('字卡面板：文字／版面／字塊／描邊陰影，每個按鈕都有反應', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增文字/ }).tap();
  await page.getByLabel('文字內容').fill('字卡測試');

  // ---- 文字：粗體、斜體 ----
  const bold = page.getByRole('button', { name: '粗體', exact: true });
  const wasBold = (await card(page)).runs[0]!.weight === 'bold';
  await bold.tap();
  expect((await card(page)).runs[0]!.weight).toBe(wasBold ? 'normal' : 'bold');
  await page.getByRole('button', { name: '斜體', exact: true }).tap();
  expect((await card(page)).runs[0]!.italic).toBe(true);
  await page.getByRole('button', { name: '斜體', exact: true }).tap();
  expect((await card(page)).runs[0]!.italic).toBe(false);

  // ---- 版面 ----
  await section(page, '版面');
  await setRange(page, '字距', 0.3);
  expect((await card(page)).runs[0]!.letterSpacing).toBeCloseTo(0.3);
  await setRange(page, '行距', 1.6);
  expect((await card(page)).runs[0]!.lineHeight).toBeCloseTo(1.6);
  await page.getByRole('button', { name: /寬度：依文字/ }).tap();
  expect((await card(page)).width).toBe(700);
  await setRange(page, '寬度', 400);
  expect((await card(page)).width).toBe(400);
  await page.getByRole('button', { name: /寬度：依文字/ }).tap();
  expect((await card(page)).width).toBeUndefined();
  await page.getByRole('radio', { name: '靠左' }).tap();
  expect((await card(page)).align).toBe('left');
  await page.getByRole('radio', { name: '靠右' }).tap();
  expect((await card(page)).align).toBe('right');
  await page.getByRole('radio', { name: '置中' }).tap();
  expect((await card(page)).align).toBe('center');

  // ---- 字塊 ----
  await section(page, '字塊');
  expect((await card(page)).box).toBeUndefined();
  await page.getByRole('radio', { name: '圓角' }).tap();
  expect((await card(page)).box!.shape).toBe('roundRect');
  // 字塊是粉紅色：預覽中間出現粉紅像素
  await expect.poll(() => countColor(page, [255, 77, 141], 30, [0.2, 0.4, 0.8, 0.6])).toBeGreaterThan(200);
  await page.screenshot({ path: `${SHOT}/box-default.png` });
  await page.getByRole('radio', { name: '膠囊' }).tap();
  expect((await card(page)).box!.shape).toBe('pill');
  await page.getByRole('radio', { name: '方形' }).tap();
  expect((await card(page)).box!.shape).toBe('rect');
  await page.getByRole('button', { name: '字塊顏色 #ffd23f' }).tap();
  expect((await card(page)).box!.fill).toBe('#ffd23f');
  await expect.poll(() => countColor(page, [255, 210, 63], 30, [0.2, 0.4, 0.8, 0.6])).toBeGreaterThan(200);
  await setRange(page, '填滿透明度', 50);
  expect((await card(page)).box!.opacity).toBeCloseTo(0.5);
  await setRange(page, '填滿透明度', 100);

  // 內距上下左右各自調
  await setRange(page, '內距 上', 10);
  await setRange(page, '內距 下', 70);
  await setRange(page, '內距 左', 20);
  await setRange(page, '內距 右', 90);
  expect((await card(page)).box!.padding).toMatchObject({ top: 10, bottom: 70, left: 20, right: 90 });
  await page.screenshot({ path: `${SHOT}/box-padding-separate.png` });
  // 連動：開了之後調一個，四邊一起變
  const lock = page.getByRole('button', { name: '四邊連動' });
  await lock.tap();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await setRange(page, '內距 上', 33);
  expect((await card(page)).box!.padding).toMatchObject({ top: 33, bottom: 33, left: 33, right: 33 });
  await lock.tap();
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  await setRange(page, '文字上下微調', 8);
  expect((await card(page)).box!.nudgeY).toBe(8);
  await page.getByRole('radio', { name: '圓角' }).tap();
  await setRange(page, '圓角', 60);
  expect((await card(page)).box!.radius).toBe(60);
  await page.getByRole('radio', { name: '無字塊' }).tap();
  expect((await card(page)).box).toBeUndefined();
  await page.getByRole('radio', { name: '圓角' }).tap(); // 再開，回到預設

  // ---- 描邊陰影 ----
  await section(page, '描邊陰影');
  await page.getByRole('button', { name: '外層描邊顏色 #111111' }).tap();
  let st = (await card(page)).runs[0]!.strokes!;
  expect(st[0]).toMatchObject({ color: '#111111', width: 6 });
  await setRange(page, '描邊 外層', 14);
  await page.getByRole('button', { name: '內層描邊顏色 #ffd23f' }).tap();
  await setRange(page, '描邊 內層', 5);
  st = (await card(page)).runs[0]!.strokes!;
  expect(st[0]).toMatchObject({ color: '#111111', width: 14 });
  expect(st[1]).toMatchObject({ color: '#ffd23f', width: 5 });
  await page.screenshot({ path: `${SHOT}/stroke-two-layers.png` });
  await setRange(page, '描邊 外層', 0);
  await setRange(page, '描邊 內層', 0);
  const shadowBtn = page.getByRole('button', { name: '陰影', exact: true });
  const hadShadow = !!(await card(page)).runs[0]!.shadow;
  await shadowBtn.tap();
  expect(!!(await card(page)).runs[0]!.shadow).toBe(!hadShadow);
  if (hadShadow) await shadowBtn.tap();
  await setRange(page, '陰影模糊', 20);
  expect((await card(page)).runs[0]!.shadow!.blur).toBe(20);

  // 一路改下來，專案裡還是只有一個文字物件、沒有壞掉
  expect((await project(page)).tracks[1]!.items).toHaveLength(1);
});
