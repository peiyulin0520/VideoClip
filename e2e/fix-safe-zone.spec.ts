import { expect, test } from '@playwright/test';
import {
  addOverlays,
  clips,
  createProjectWith,
  exportFrame,
  isRed,
  project,
  selectedItemId,
  previewBox,
} from './helpers';

const SHOT = 'docs/screenshots/fix-safe-zone';

test('安全區參考線：預設不顯示；開關有文字；打開後常駐並記住；舊版設定不會讓它變成開', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-safe-zone', '1')); // 舊版 key（已作廢）
  await createProjectWith(page, ['solid-red.webm']);
  await expect(page.getByTestId('safe-zone')).toHaveCount(0);
  await page.screenshot({ path: `${SHOT}/after-default.png` });

  const toggle = page.getByRole('button', { name: '安全區參考線' });
  await expect(toggle).toContainText('安全區');
  const b = (await toggle.boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const zone = page.getByTestId('safe-zone');
  await expect(zone).toBeVisible();
  await expect(zone).toContainText('IG／抖音按鈕區');
  await page.screenshot({ path: `${SHOT}/after-safe-on.png` });

  // 重新整理後保留
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(clips(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId('safe-zone')).toBeVisible();

  // 關掉
  await page.getByRole('button', { name: '安全區參考線' }).tap();
  await expect(page.getByTestId('safe-zone')).toHaveCount(0);
});

test('拖移疊加物件時參考線才出現，放開就消失；匯出的畫面不會有粉紅線', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await expect(page.getByTestId('safe-zone')).toHaveCount(0);

  const stage = await previewBox(page);
  const cx = stage.x + stage.width * 0.5;
  const cy = stage.y + stage.height * 0.5;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 12, cy + 4, { steps: 3 });
  await page.mouse.move(cx + 40, cy + 20, { steps: 5 });
  await expect(page.getByTestId('safe-zone')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/after-dragging.png` });
  await page.mouse.up();
  await expect(page.getByTestId('safe-zone')).toHaveCount(0);

  // 匯出單格：安全區位置（下方、右側）取到的是影片本身的紅色，不是參考線的粉紅
  const out = await exportFrame(page, 0.5, [
    [0.5, 0.95],
    [0.97, 0.3],
  ]);
  expect(isRed(out.samples[0] as [number, number, number, number])).toBe(true);
  expect(isRed(out.samples[1] as [number, number, number, number])).toBe(true);
});

test('主軌：匯入後不自動選取；預覽上點一下就選到（細框、沒有圓點）；選了之後可以在預覽上拖；疊加照舊自動選取', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  await expect(page.getByTestId('selbox')).toHaveCount(0);
  expect(await selectedItemId(page)).toBeNull();

  // 點預覽畫面（只有主軌）→ 選到主軌（2026-11-12 使用者要求：預覽上點影片就能選、縮放）
  const stage = await previewBox(page);
  await page.mouse.click(stage.x + stage.width * 0.5, stage.y + stage.height * 0.5);
  expect(await selectedItemId(page)).toBe((await project(page)).tracks[0]!.items[0]!.id);

  // 選了之後在預覽上拖移＝移動它
  const before = (await project(page)).tracks[0]!.items[0]!.transform;
  await page.mouse.move(stage.x + stage.width * 0.5, stage.y + stage.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.6, stage.y + stage.height * 0.55, { steps: 6 });
  await page.mouse.up();
  const after = (await project(page)).tracks[0]!.items[0]!.transform;
  expect(after.x).toBeGreaterThan(before.x);

  // 從時間軸選主軌片段 → 細框、沒有 ✕、有縮放鈕
  await clips(page).first().tap();
  await expect(page.getByTestId('selbox')).toBeVisible();
  await expect(page.getByRole('button', { name: '刪除圖層' })).toHaveCount(0);
  await expect(page.locator('.sel-dot, [data-handle]')).toHaveCount(0);
  await page.screenshot({ path: `${SHOT}/after-main-selected.png` });

  // 疊加素材：匯入後仍自動選取，有 ✕
  await addOverlays(page, ['solid-green.webm']);
  await expect(page.getByTestId('selbox')).toBeVisible();
  await expect(page.locator('.sel-dot, [data-handle]')).toHaveCount(0);
});
