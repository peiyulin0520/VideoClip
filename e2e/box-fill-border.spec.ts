import { expect, test, type Page } from '@playwright/test';
import { countColor, createProjectWith, openTab, project } from './helpers';

const SHOT = 'docs/screenshots/feedback-5';
type Box = {
  fillOn?: boolean;
  fill: string;
  opacity: number;
  stroke?: { color: string; width: number; opacity?: number };
};
const box = async (page: Page) =>
  ((await project(page)).tracks[1]!.items[0]!.card as unknown as { box?: Box }).box;
const setRange = (page: Page, label: string, v: number) =>
  page.getByRole('slider', { name: label, exact: true }).evaluate((el, val) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(val));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);

const YELLOW: [number, number, number] = [255, 210, 63];
const region: [number, number, number, number] = [0.05, 0.3, 0.95, 0.7];
// 字塊正中央（遠離邊緣的反鋸齒）：填滿的顏色看得最清楚
const center: [number, number, number, number] = [0.42, 0.46, 0.58, 0.54];
const MIX: [number, number, number] = [127, 105, 159]; // 黃色 50% 疊在藍色上
const yellow = (page: Page) => countColor(page, YELLOW, 30, region);

test('字塊：填滿與框線分開，各自有顏色與透明度；可以不要底色只留框線；框線可調粗細', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByLabel('文字內容').fill('框線測試');
  await page.getByRole('tab', { name: '字塊', exact: true }).tap();
  await page.getByRole('radio', { name: '方形' }).tap();
  await page.getByRole('button', { name: '字塊顏色 #ffd23f' }).tap();
  await expect.poll(() => yellow(page)).toBeGreaterThan(500); // 黃色填滿
  const filled = await yellow(page);
  await page.screenshot({ path: `${SHOT}/box-fill-only.png` });

  // 兩區都在：填滿（開）、框線（關）
  await expect(page.getByRole('switch', { name: '填滿' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: '框線' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('slider', { name: '框線粗細', exact: true })).toHaveCount(0);

  // 打開框線（白色預設）→ 設成黃色、粗 20
  await page.getByRole('switch', { name: '框線' }).tap();
  expect((await box(page))!.stroke).toMatchObject({ color: '#ffffff', width: 4, opacity: 1 });
  await page.getByRole('button', { name: '字塊外框顏色 #ffd23f' }).tap();
  await setRange(page, '框線粗細', 20);
  expect((await box(page))!.stroke).toMatchObject({ color: '#ffd23f', width: 20 });

  // 關掉填滿：只剩框線——黃色像素大幅減少但還有，中間透出底下的藍色影片
  await page.getByRole('switch', { name: '填滿' }).tap();
  expect((await box(page))!.fillOn).toBe(false);
  await expect(page.getByRole('slider', { name: '填滿透明度', exact: true })).toHaveCount(0);
  await expect.poll(() => yellow(page)).toBeLessThan(filled * 0.7);
  expect(await yellow(page)).toBeGreaterThan(100); // 框線在
  await expect.poll(() => countColor(page, [0, 0, 255], 30, [0.3, 0.45, 0.45, 0.55])).toBeGreaterThan(50); // 底下的藍
  await page.screenshot({ path: `${SHOT}/box-border-only.png` });

  // 框線粗細：變細 → 黃色像素變少
  const thick = await yellow(page);
  await setRange(page, '框線粗細', 4);
  await expect.poll(() => yellow(page)).toBeLessThan(thick * 0.6);

  // 打開填滿、填滿 50% 半透明、框線 100% 實心：實心黃色只剩框線，填滿變成黃藍混色（框線不跟著變淡）
  await setRange(page, '框線粗細', 20);
  await page.getByRole('switch', { name: '填滿' }).tap();
  expect((await box(page))!.fillOn).toBeUndefined();
  await setRange(page, '填滿透明度', 50);
  const b = (await box(page))!;
  expect(b.opacity).toBeCloseTo(0.5);
  expect(b.stroke!.opacity).toBe(1); // 框線自己的透明度沒被帶著變
  await expect.poll(() => countColor(page, MIX, 25, center)).toBeGreaterThan(100); // 混色填滿
  await expect.poll(() => yellow(page)).toBeGreaterThan(100); // 實心黃框線
  expect(await yellow(page)).toBeLessThan(filled * 0.7);
  await page.screenshot({ path: `${SHOT}/box-half-fill-solid-border.png` });

  // 框線也 30%：實心黃色幾乎消失
  await setRange(page, '框線透明度', 30);
  expect((await box(page))!.stroke!.opacity).toBeCloseTo(0.3);
  await expect.poll(() => yellow(page)).toBeLessThan(40);

  // 兩個都關：提示字塊看不到
  await page.getByRole('switch', { name: '框線' }).tap();
  await page.getByRole('switch', { name: '填滿' }).tap();
  await expect(page.getByText('填滿和框線都關了')).toBeVisible();
  expect(await countColor(page, MIX, 25, center)).toBeLessThan(20);
  expect(await yellow(page)).toBeLessThan(40);
});

test('框線不再被填滿的透明度牽動；填滿透明度可以到 0%', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByRole('tab', { name: '字塊', exact: true }).tap();
  await page.getByRole('radio', { name: '方形' }).tap();
  await page.getByRole('button', { name: '字塊顏色 #ffd23f' }).tap();
  await page.getByRole('switch', { name: '框線' }).tap();
  await page.getByRole('button', { name: '字塊外框顏色 #ffd23f' }).tap();
  await setRange(page, '框線粗細', 20);
  await setRange(page, '填滿透明度', 0);
  expect((await box(page))!.opacity).toBe(0);
  // 填滿完全透明，框線還是實心黃色
  await expect.poll(() => yellow(page)).toBeGreaterThan(100);
  // 中間是底下的藍色影片（文字的邊緣有反鋸齒，所以不用「沒有混色」判斷）
  await expect.poll(() => countColor(page, [0, 0, 253], 20, center)).toBeGreaterThan(300);
});
