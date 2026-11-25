import { expect, test } from '@playwright/test';
import {
  addOverlays,
  clips,
  closePanel,
  createProjectWith,
  deselect,
  openCat,
  project,
  undo,
} from './helpers';

// feedback-15 Z6／Z7：播放列的垃圾桶（任何類別都能刪）、刪完空軌道自動消失
test('Z6 播放列垃圾桶：在文字類別也能刪選到的影像；沒選東西會提示；一步復原', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await deselect(page);
  // 沒選東西：垃圾桶變淡，點了有提示
  await expect(page.getByTestId('pb-delete')).toHaveAttribute('data-dim', '');
  await page.getByTestId('pb-delete').tap();
  await expect(page.locator('.toast').filter({ hasText: '先點一個片段' })).toBeVisible();
  // 選到疊加的綠色影片，跳到〔文字〕類別再刪（不用切到〔剪輯〕）
  await clips(page).nth(1).tap();
  await openCat(page, '文字');
  await page.getByTestId('pb-delete').tap();
  await expect(clips(page)).toHaveCount(1);
  // Z7：疊加那條軌道空了，一起消失
  expect((await project(page)).tracks.filter((t) => t.kind === 'media')).toHaveLength(1);
  // 復原：影片跟軌道一起回來
  await undo(page);
  await expect(clips(page)).toHaveCount(2);
  expect((await project(page)).tracks.filter((t) => t.kind === 'media')).toHaveLength(2);
});

test('Z7 刪掉最後一條影像軌的素材：軌道留著；文字軌空了就消失', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']);
  await closePanel(page);
  await clips(page).first().tap();
  await page.getByTestId('pb-delete').tap();
  await expect(clips(page)).toHaveCount(0);
  expect((await project(page)).tracks.filter((t) => t.kind === 'media')).toHaveLength(1); // 至少留一條影像軌
  await undo(page);
  // 加一段文字再刪掉：文字軌消失
  await openCat(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  expect((await project(page)).tracks.filter((t) => t.kind === 'text')).toHaveLength(1);
  await closePanel(page);
  await page.getByTestId('pb-delete').tap();
  expect((await project(page)).tracks.filter((t) => t.kind === 'text')).toHaveLength(0);
});
