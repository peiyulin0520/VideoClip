import { expect, test, type Page } from '@playwright/test';
import { addOverlays, clips, createProjectWith, fixture, openTab, project, showTimeline } from './helpers';

const SHOT = 'docs/screenshots/feedback-9/i3';
const tracks = (page: Page) => page.locator('[data-testid="track"]');
const head = (page: Page, kind: string) => page.locator(`[data-testid="cat-head"][data-kind="${kind}"]`);
const toggle = (page: Page, kind: string) => head(page, kind).getByTestId('cat-toggle');

async function buildBusyProject(page: Page) {
  await createProjectWith(page, ['clip-a.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await addOverlays(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole('button', { name: /新增文字/ })
      .first()
      .tap();
    await page.getByLabel('文字內容').fill(`字${i}`);
  }
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.locator('[data-testid="clip"][data-kind="audio"]')).toHaveCount(1, { timeout: 20_000 });
}

test('時間軸 0 秒貼齊左邊：第一個片段緊貼軌道圖示右邊，播放頭固定在那裡（前面沒有半個畫面的空白）', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  await showTimeline(page);
  const clip = (await clips(page).first().boundingBox())!;
  const ph = (await page.locator('.playhead').boundingBox())!;
  const scroll = (await page.getByTestId('timeline-scroll').boundingBox())!;
  expect(Math.abs(clip.x - ph.x)).toBeLessThanOrEqual(4); // 0 秒就在播放頭上
  expect(ph.x - scroll.x).toBeLessThan(70); // 播放頭靠左（圖示右邊），不在畫面中央
  await page.screenshot({ path: `${SHOT}/zero-left.png` });
  // 拖到最後：結尾還在畫面裡
  await page.getByTestId('timeline-scroll').evaluate((el) => (el.scrollLeft = el.scrollWidth));
  const end = (await clips(page).first().boundingBox())!;
  expect(end.x + end.width).toBeGreaterThan(scroll.x);
});

test('四個分類（影像、貼圖、字卡、音訊）各自收合展開，互不影響；全部收合／展開；記住', async ({ page }) => {
  test.setTimeout(120_000);
  await buildBusyProject(page);
  await showTimeline(page);
  // 影像 3、字卡 3、音訊 1（沒有貼圖：沒有貼圖那一類的標題）
  await expect(tracks(page)).toHaveCount(7);
  await expect(head(page, 'sticker')).toHaveCount(0);
  const kinds = await page
    .locator('[data-testid="cat-head"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
  expect(kinds).toEqual(['text', 'media', 'audio']); // 由上到下：字卡、影像、音訊
  await page.screenshot({ path: `${SHOT}/all-open.png` });

  // 只收合影像：影像 3 條軌道不見，字卡與音訊還在
  await toggle(page, 'media').tap();
  await expect(tracks(page)).toHaveCount(4);
  await expect(head(page, 'media')).toHaveAttribute('data-open', 'false');
  await expect(head(page, 'text')).toHaveAttribute('data-open', 'true');
  await page.screenshot({ path: `${SHOT}/media-closed.png` });
  // 再點一下展開回來（使用者：以前打開之後收不回去）
  await toggle(page, 'media').tap();
  await expect(tracks(page)).toHaveCount(7);

  // 全部收合 → 只剩三條標題列；再按全部展開
  await page.getByTestId('layers-toggle').tap();
  await expect(tracks(page)).toHaveCount(0);
  await page.getByTestId('layers-toggle').tap();
  await expect(tracks(page)).toHaveCount(7);

  // 收合字卡 → 重新整理後還是收合
  await toggle(page, 'text').tap();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(head(page, 'text')).toHaveAttribute('data-open', 'false');

  // 選到字卡（預覽上點／圖層清單）會自動展開那一類
  await page.getByRole('button', { name: /^展開字卡/ }).tap();
  await expect(head(page, 'text')).toHaveAttribute('data-open', 'true');
});

test('貼圖自成一類：貼圖放在貼圖軌（影像軌之上、字卡之下）；影片照片同一類同一軌', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '素材');
  await page
    .getByRole('button', { name: /^表情|貼圖/ })
    .first()
    .waitFor({ state: 'attached' })
    .catch(() => {});
  // 加一個內建貼圖
  const cell = page.locator('.sticker-grid .sticker-cell').first();
  await cell.tap();
  await expect(page.locator('[data-testid="clip"][data-kind="image"]')).toHaveCount(1, { timeout: 20_000 });
  const p = await project(page);
  const kinds = (p.tracks as unknown as { kind: string; items: unknown[] }[]).map((t) => t.kind);
  expect(kinds).toEqual(['media', 'sticker']);
  expect((p.assets as unknown as { origin?: string }[]).some((a) => a.origin === 'sticker')).toBe(true);
  await showTimeline(page);
  await expect(head(page, 'sticker')).toBeVisible();
  const order = await page
    .locator('[data-testid="cat-head"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
  expect(order).toEqual(['sticker', 'media']);
  // 再加一張一般照片：放進影像軌（跟影片同一條或同一類）
  await openTab(page, '疊加');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /加入影片或照片/ }).tap(),
  ]);
  await chooser.setFiles(fixture('photo.png'));
  await expect(page.locator('[data-testid="clip"][data-kind="image"]')).toHaveCount(2, { timeout: 20_000 });
  const p2 = await project(page);
  const media = (p2.tracks as unknown as { kind: string }[]).filter((t) => t.kind === 'media');
  const stick = (p2.tracks as unknown as { kind: string }[]).filter((t) => t.kind === 'sticker');
  expect(stick).toHaveLength(1);
  expect(media.length).toBeGreaterThanOrEqual(1);
});
