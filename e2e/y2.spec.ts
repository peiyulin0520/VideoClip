import { expect, test } from '@playwright/test';
import {
  createProjectWith,
  finishLayout,
  fixture,
  openTab,
  openTool,
  selectFrame,
  showTimeline,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-13';

test('Y2 選色器：點的顏色移到「最近用過」第一格、整個選色器只有一個選取記號、沒有重複的顏色', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  await selectFrame(page);
  await openTab(page, '版型');
  await openTool(page, 'layout.frame');
  const picker = page.getByTestId('layout-frame').getByTestId('color-picker');
  await picker.getByRole('button', { name: '外框顏色 更多顏色' }).tap();
  // 點兩個不是常用的顏色（粉嫩第一個、莫蘭迪第一個）和一個常用色
  await picker.getByRole('button', { name: '外框顏色 #ffd1dc' }).tap();
  await picker.getByRole('button', { name: '外框顏色 #c9a9a6' }).tap();
  await picker.getByRole('button', { name: '外框顏色 #4dd0ff' }).first().tap();
  const recents = picker.getByLabel('最近用過的顏色').getByRole('button');
  // 最近用過：最新的非常用色在最前面；常用色（#4dd0ff）不重複出現在最近用過
  await expect(recents.first()).toHaveAttribute('aria-label', /#c9a9a6/);
  await expect(recents.nth(1)).toHaveAttribute('aria-label', /#ffd1dc/);
  await expect(recents).toHaveCount(2);
  // 整個選色器只有一個被選的（現在選的是常用色 #4dd0ff）
  await expect(picker.locator('[aria-pressed="true"]')).toHaveCount(1);
  // 再點最近用過的 #ffd1dc → 它移到最前面，且只有它被選
  await recents.nth(1).tap();
  await expect(recents.first()).toHaveAttribute('aria-label', /#ffd1dc/);
  await expect(picker.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(picker.getByText('常用', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/y2-color-picker-390.png` });
});

test('Y2 「加到第 N 格」視窗：〔影片／照片〕和〔色塊〕各自一個有標題的區塊，中間有分隔線', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  await showTimeline(page);
  await page.getByRole('button', { name: '第 1 格 加素材' }).tap();
  const dlg = page.getByRole('dialog', { name: '加到第 1 格' });
  const media = dlg.getByTestId('cell-add-media-zone');
  const color = dlg.getByTestId('cell-add-color-zone');
  await expect(media.locator('.zone-title')).toHaveText('影片／照片');
  await expect(color.locator('.zone-title')).toHaveText('色塊');
  await expect(media.getByTestId('cell-add-media')).toBeVisible();
  await expect(color.getByTestId('cell-add-color')).toBeVisible();
  // 兩個按鈕各在自己的區塊裡，區塊不重疊
  const a = (await media.boundingBox())!;
  const b = (await color.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
  await page.screenshot({ path: `${SHOT}/y2-add-sheet-390.png` });
});
