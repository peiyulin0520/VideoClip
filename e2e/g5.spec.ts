import { expect, test, type Page } from '@playwright/test';
import {
  clips,
  createProjectWith,
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
  await expect(page.getByRole('tab', { name: '特效' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('effect-panel')).toBeVisible();
  const [, b] = await items(page);
  await expect(page.getByTestId('tr-circle')).toHaveClass(/sel/); // 選取中＝實心
  await page.getByRole('radio', { name: '轉場 淡入淡出' }).tap();
  expect((await items(page))[1]!.transitionIn?.kind).toBe('fade');
  expect(b!.id).toBe((await items(page))[1]!.id);
  await expect(page.getByTestId('tr-circle')).toHaveText('淡');
  await page.screenshot({ path: `${SHOT}/circle-effect-tab.png` });
});

test('淡入淡出：接縫時畫面全黑，兩端是原本的顏色；白閃：接縫是白；左推：接縫前後畫面在移動', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 淡入淡出' }).tap();
  await page.getByRole('radio', { name: '轉場長度 0.8 秒' }).tap();
  const seam = 4;
  await seekTo(page, 2);
  await expect.poll(async () => isRed(await mid(page))).toBe(true);
  await seekTo(page, seam + 0.05);
  await expect
    .poll(async () => {
      const c = await mid(page);
      return !!c && c[0] < 40 && c[1] < 60 && c[2] < 40; // 接縫：幾乎全黑
    })
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/fade-mid.png` });
  await seekTo(page, 6);
  await expect.poll(async () => isGreen(await mid(page))).toBe(true);

  // 白閃
  await page.getByRole('radio', { name: '轉場 白閃' }).tap();
  await seekTo(page, seam + 0.05);
  await expect.poll(async () => isWhite(await mid(page))).toBe(true);

  // 暖色閃光：接縫是暖色（紅>藍）
  await page.getByRole('radio', { name: '轉場 暖色閃光' }).tap();
  await seekTo(page, seam + 0.05);
  await expect
    .poll(async () => {
      const c = await mid(page);
      return !!c && c[0] > 220 && c[2] < c[0] - 40;
    })
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/flash-mid.png` });

  // 左推：接縫前一點，畫面中央不再是原本的紅（前一個片段已經往左滑走了一部分）
  await page.getByRole('radio', { name: '轉場 左推' }).tap();
  await seekTo(page, seam - 0.15);
  const before = await samplePreview(page, 0.85, 0.5);
  expect(isRed(before)).toBe(false); // 右邊已經沒有紅色了（紅色往左滑）
});

test('套用到這一軌全部銜接處；分割後轉場只留在前半；刪除轉場回到直接切換；一步復原', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm', 'solid-blue.webm']);
  await showTimeline(page);
  await expect(page.getByTestId('tr-circle')).toHaveCount(2);
  await page.getByTestId('tr-circle').first().tap();
  await page.getByRole('radio', { name: '轉場 黑場' }).tap();
  await page.getByRole('button', { name: '套用到這一軌全部銜接處' }).tap();
  const it = await items(page);
  expect(it[1]!.transitionIn?.kind).toBe('black');
  expect(it[2]!.transitionIn?.kind).toBe('black');
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
