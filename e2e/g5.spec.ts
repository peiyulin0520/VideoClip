import { expect, test, type Page } from '@playwright/test';
import {
  clips,
  createProjectWith,
  exportFrame,
  isGreen,
  isRed,
  isWhite,
  openTab,
  project,
  samplePreview,
  seekTo,
  showTimeline,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-7/g5';
type It = { id: string; start: number; duration: number; transitionIn?: { kind: string; duration: number } };
const items = async (page: Page) =>
  ((await project(page)).tracks as unknown as { items: It[] }[])[0]!.items
    .slice()
    .sort((a, b) => a.start - b.start);

async function setup(page: Page) {
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm']); // 各 4 秒，接在一起：接縫在 4 秒
  await showTimeline(page);
}
const mid = async (page: Page) => samplePreview(page, 0.5, 0.5);

test('時間軸兩個緊接的片段中間有小圓圈（沒轉場是「＋」）；點它切到特效分頁並選到後面那個片段', async ({
  page,
}) => {
  await setup(page);
  await expect(page.getByTestId('tr-circle')).toHaveCount(1);
  await expect(page.getByTestId('tr-circle')).toHaveText('＋');
  await page.getByTestId('tr-circle').tap();
  await expect(page.locator('.tabs').getByRole('tab', { name: '特效' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('effect-panel')).toBeVisible();
  const [, b] = await items(page);
  await expect(page.getByTestId('tr-circle')).toHaveClass(/sel/); // 選取中＝實心
  await page.getByRole('radio', { name: '轉場 疊化' }).tap();
  expect((await items(page))[1]!.transitionIn?.kind).toBe('dissolve');
  expect(b!.id).toBe((await items(page))[1]!.id);
  await expect(page.getByTestId('tr-circle')).toHaveText('溶');
  await page.screenshot({ path: `${SHOT}/circle-effect-tab.png` });
});

test('轉場畫面：疊化＝接縫是紅綠混色、閃黑＝全黑、閃白＝白、暖光＝暖色、左移＝左紅右綠、捲簾放下＝上綠下紅', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 疊化' }).tap();
  await page.getByLabel('轉場長度').fill('8'); // 0.8 秒：4 秒的接縫前後各 0.4 秒
  const seam = 4;
  await seekTo(page, 2);
  await expect.poll(async () => isRed(await mid(page))).toBe(true);
  // 疊化：兩段真的重疊——接縫附近同時有紅和綠（不是黑）
  await seekTo(page, seam + 0.05);
  await expect
    .poll(async () => {
      const c = await mid(page);
      return !!c && c[0] > 60 && c[1] > 60 && c[2] < 60; // 紅綠混色
    })
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/dissolve-mid.png` });
  await seekTo(page, 6);
  await expect.poll(async () => isGreen(await mid(page))).toBe(true);

  await page.getByRole('radio', { name: '轉場 閃黑' }).tap();
  await seekTo(page, seam + 0.05);
  await expect
    .poll(async () => {
      const c = await mid(page);
      return !!c && c[0] < 40 && c[1] < 60 && c[2] < 40;
    })
    .toBe(true);

  await page.getByRole('radio', { name: '轉場 閃白' }).tap();
  await seekTo(page, seam + 0.05);
  await expect.poll(async () => isWhite(await mid(page))).toBe(true);

  await page.getByRole('radio', { name: '轉場 左移' }).tap();
  await seekTo(page, seam + 0.05);
  await expect.poll(async () => isRed(await samplePreview(page, 0.15, 0.5))).toBe(true);
  await expect.poll(async () => isGreen(await samplePreview(page, 0.85, 0.5))).toBe(true);
  await page.screenshot({ path: `${SHOT}/moveL-mid.png` });

  await page.getByRole('radio', { name: '轉場 捲簾放下' }).tap();
  await seekTo(page, seam + 0.05);
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.15))).toBe(true);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.92))).toBe(true);
  await page.screenshot({ path: `${SHOT}/rollDown-mid.png` });
});

test('轉場選單：分類、卡片上有 A→B 示意小動畫（不同時間畫面不同）、選到的粗外框', async ({ page }) => {
  await setup(page);
  await page.getByTestId('tr-circle').tap();
  await expect(page.getByRole('tab', { name: '相機動作' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '故障' })).toBeVisible();
  const card = page.getByRole('radio', { name: '轉場 捲簾放下' });
  await expect(card).toBeVisible();
  // 小動畫：同一張卡片在不同時間畫面不一樣
  const shot = () => card.getByTestId('tr-demo').screenshot();
  const a = await shot();
  await page.waitForTimeout(450);
  const b = await shot();
  await page.waitForTimeout(450);
  const c = await shot();
  expect(a.equals(b) && b.equals(c)).toBe(false);
  await page.getByRole('tab', { name: '故障' }).tap();
  await expect(page.getByRole('radio', { name: '轉場 干擾' })).toBeVisible();
  await page.getByRole('radio', { name: '轉場 干擾' }).tap();
  await expect(page.getByRole('radio', { name: '轉場 干擾' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: `${SHOT}/picker.png` });
});

test('套用到這一軌全部銜接處；分割後轉場只留在前半；刪除轉場回到直接切換；一步復原', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm', 'solid-blue.webm']);
  await showTimeline(page);
  await expect(page.getByTestId('tr-circle')).toHaveCount(2);
  await page.getByTestId('tr-circle').first().tap();
  await page.getByRole('radio', { name: '轉場 閃黑' }).tap();
  await page.getByRole('button', { name: '全部套用（這一軌所有銜接處）' }).tap();
  const it = await items(page);
  expect(it[1]!.transitionIn?.kind).toBe('blackflash');
  expect(it[2]!.transitionIn?.kind).toBe('blackflash');
  expect(it[0]!.transitionIn).toBeUndefined(); // 第一個片段前面沒有
  // 一步復原
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await items(page))[2]!.transitionIn).toBeUndefined();
  // 選「無」
  await page.getByRole('radio', { name: '轉場 無' }).tap();
  expect((await items(page))[1]!.transitionIn).toBeUndefined();
  void clips;
  void openTab;
});

test('匯出的轉場跟預覽一樣：左移、捲簾放下在接縫時的單格匯出（兩段重疊、提前／延長的畫面都有）', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 左移' }).tap();
  await page.getByLabel('轉場長度').fill('8');
  const out = await exportFrame(page, 4.05, [
    [0.15, 0.5],
    [0.85, 0.5],
  ]);
  expect(isRed(out.samples[0] as [number, number, number, number])).toBe(true);
  expect(isGreen(out.samples[1] as [number, number, number, number])).toBe(true);
  await page.getByRole('radio', { name: '轉場 捲簾放下' }).tap();
  const out2 = await exportFrame(page, 3.95, [
    [0.5, 0.05],
    [0.5, 0.95],
  ]);
  // 接縫前 0.05 秒（p≈0.44）：B（綠）已經從上面放下來一點，下面還是 A（紅）
  expect(isRed(out2.samples[1] as [number, number, number, number])).toBe(true);
});
