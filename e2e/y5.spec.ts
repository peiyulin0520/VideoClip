import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWith,
  finishLayout,
  fixture,
  isRed,
  openTab,
  project,
  samplePreview,
  seekTo,
  showTimeline,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-13';
type It = {
  id: string;
  type: string;
  assetId?: string;
  start: number;
  duration: number;
  group?: string;
  cell?: { x: number; y: number; w: number; h: number };
  inEffect?: { kind: string };
  motion?: string;
  transitionIn?: { kind: string };
};
type Tr = { id: string; groupRole?: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];
const cells = async (page: Page) => (await tracks(page)).filter((t) => t.groupRole === 'cell');

async function twoCells(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
}

test('Y5 特效分頁：「作用在」是分段式切換（進場、出場、轉場、整段），「效果」在有標題的區塊；沒有另外的版型動畫區', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await twoCells(page);
  await openTab(page, '特效');
  const where = page.getByTestId('fx-where');
  await expect(where.getByRole('tab')).toHaveText([/進場/, /出場/, /轉場/, /整段/]);
  await expect(where.locator('.seg')).toHaveCount(1);
  await expect(page.getByTestId('fx-effects').locator('.zone-title')).toHaveText('效果');
  await expect(page.getByTestId('layout-motion')).toHaveCount(0);
  await page.screenshot({ path: `${SHOT}/y5-effect-tab-390.png` });
});

test('Y5 版型裡的素材可以有自己的進場特效（選到格子素材，特效分頁照一般素材用）；整個版型的特效不受影響', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await twoCells(page); // 選到第 1 格
  await openTab(page, '特效');
  await expect(page.getByTestId('fx-where')).toBeVisible(); // 以前格子素材看到的是「請到版型分頁」
  await page.getByRole('radio', { name: '進場 疊化' }).tap();
  const cell = (await cells(page))[0]!.items[0]!;
  expect(cell.inEffect?.kind).toBe('dissolve');
  const frame = (await tracks(page)).flatMap((t) => t.items).find((i) => i.group && !i.cell)!;
  expect(frame.inEffect).toBeUndefined();
  // 第 1 格開頭正在淡入（還不是紅色），第 2 格已經是綠色；進場結束後第 1 格是紅色
  const c0 = cell.cell!;
  const c1 = (await cells(page))[1]!.items[0]!.cell!;
  await seekTo(page, 0.05);
  await expect
    .poll(async () => isRed(await samplePreview(page, c0.x + c0.w / 2, c0.y + c0.h / 2)))
    .toBe(false);
  await seekTo(page, 2);
  await expect
    .poll(async () => isRed(await samplePreview(page, c0.x + c0.w / 2, c0.y + c0.h / 2)))
    .toBe(true);
  void c1;
  // 時間軸：格子列上那個素材有進場代表字圓圈
  await showTimeline(page);
  await expect(page.getByTestId('fx-circle-in')).toBeVisible();
});

test('Y5 同一格前後兩段素材之間可以轉場：時間軸有圓圈，疊化時那一格是兩種顏色的混色、只露在那一格裡', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await twoCells(page);
  // 第 1 格接一段綠色影片（紅 0–4、綠 4–8）
  await showTimeline(page);
  await page.getByRole('button', { name: '第 1 格 加素材' }).tap();
  await page.getByTestId('cell-add-file').setInputFiles(fixture('solid-green.webm'));
  await expect.poll(async () => (await cells(page))[0]!.items.length, { timeout: 30_000 }).toBe(2);
  await showTimeline(page);
  // 接縫的圓圈（沒轉場是「＋」）
  const circle = page.locator('.track.sub-row [data-testid="tr-circle"]');
  await expect(circle).toHaveCount(1);
  await circle.tap();
  await page.getByRole('radio', { name: /疊化/ }).first().tap();
  const second = (await cells(page))[0]!.items.find((i) => i.start > 3.9)!;
  expect(second.transitionIn?.kind).toBe('dissolve');
  const c0 = (await cells(page))[0]!.items[0]!.cell!;
  await seekTo(page, 4); // 接縫正中間
  const px = async () => (await samplePreview(page, c0.x + c0.w / 2, c0.y + c0.h / 2)) ?? [0, 0, 0, 0];
  await expect
    .poll(async () => {
      const [r, g] = await px();
      return r > 60 && g > 60; // 紅、綠混在一起
    })
    .toBe(true);
  // 第 2 格（沒轉場）不受影響
  const c1 = (await cells(page))[1]!.items[0]!.cell!;
  const [r2, g2] = (await samplePreview(page, c1.x + c1.w / 2, c1.y + c1.h / 2)) ?? [0, 0];
  expect(g2).toBeGreaterThan(200);
  expect(r2).toBeLessThan(60);
  await page.screenshot({ path: `${SHOT}/y5-cell-transition-390.png` });
});

test('Y5 整段效果：任何影像都能用「捲動」——開頭在畫面外、一路捲過、中間在正中；時間軸中間有代表字', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await showTimeline(page);
  await page.locator('[data-testid="clip"]').first().tap();
  await openTab(page, '特效');
  await page.getByTestId('fx-part-whole').tap();
  await page.getByRole('radio', { name: '整段 捲動' }).tap();
  expect((await tracks(page)).flatMap((t) => t.items)[0]!.motion).toBe('drift');
  await seekTo(page, 0.1);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(false); // 還在畫面外
  await seekTo(page, 2);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true); // 正中間
  await seekTo(page, 3.9);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(false); // 已經捲出去
  await showTimeline(page);
  await expect(page.getByTestId('fx-circle-whole')).toHaveText('捲');
  await page.getByRole('radio', { name: '整段 無' }).tap();
  expect((await tracks(page)).flatMap((t) => t.items)[0]!.motion).toBeUndefined();
});
