import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, openTab, project } from './helpers';

const SHOT = 'docs/screenshots/fix-feedback-2';

const stageBox = async (page: Page) => (await page.getByTestId('stage').boundingBox())!;
const vh = (page: Page) => page.evaluate(() => window.innerHeight);

async function addCloudTextWithWave(page: Page) {
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByLabel('文字內容').fill('吃飯');
  // 雲朵字塊＋波浪底線＋粗描邊（跟使用者截圖同款）
  await page.getByRole('tab', { name: '字塊', exact: true }).tap();
  await page.getByRole('radio', { name: '雲朵' }).tap();
  await page.getByRole('tab', { name: '裝飾', exact: true }).tap();
  await page.getByRole('button', { name: '裝飾 波浪底線' }).tap();
  await page.getByRole('tablist', { name: '字卡設定' }).getByRole('tab', { name: '文字', exact: true }).tap();
}

test('文字面板展開時預覽夠大；時間軸變精簡；選取框貼著看得到的內容', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  const before = await stageBox(page); // 剪輯分頁（沒有設定面板）
  await addCloudTextWithWave(page);
  const s = await stageBox(page);
  const h = await vh(page);
  // 文字分頁展開：預覽至少占 40% 螢幕高（規劃目標 42%；iPhone 13 的可視高度只有 664pt，實測值寫進日誌）
  expect(s.height / h).toBeGreaterThan(0.4);
  // 時間軸精簡：高度 ≤ 90
  const tl = (await page.locator('.timeline').boundingBox())!;
  expect(tl.height).toBeLessThanOrEqual(90);
  await page.screenshot({ path: `${SHOT}/text-panel-preview.png` });

  // 選取框貼著看得到的內容：不會橫跨整個畫面（以前含大片透明邊）
  const sel = (await page.getByTestId('selbox').boundingBox())!;
  expect(sel.width).toBeLessThan(s.width * 0.9);
  expect(sel.height).toBeLessThan(s.height * 0.5);

  // 收合面板 → 預覽更大；全螢幕 → 更大，時間軸與面板隱藏
  await page.locator('.tabs').getByRole('tab', { name: '文字', exact: true }).tap();
  const collapsed = await stageBox(page);
  expect(collapsed.height).toBeGreaterThan(s.height + 20);
  await page.getByRole('button', { name: '全螢幕預覽' }).tap();
  await expect(page.locator('.timeline')).toBeHidden();
  const full = await stageBox(page);
  expect(full.height).toBeGreaterThanOrEqual(collapsed.height);
  expect(full.height / h).toBeGreaterThan(0.6);
  await page.screenshot({ path: `${SHOT}/preview-fullscreen.png` });
  await page.getByRole('button', { name: '結束全螢幕預覽' }).tap();
  await expect(page.locator('.timeline')).toBeVisible();
  void before;
});

test('選取框的角點：很小、不蓋住物件；縮放與旋轉都能用；很小的文字也點得到', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByLabel('文字內容').fill('小');
  // 把字縮到很小：拖角點往中心
  const corner = page.getByTestId('scale-handle').nth(1);
  const cb = (await corner.boundingBox())!;
  const sel = (await page.getByTestId('selbox').boundingBox())!;
  const cx = sel.x + sel.width / 2;
  const cy = sel.y + sel.height / 2;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cx + 6, cy - 6, { steps: 8 });
  await page.mouse.up();
  const sc = (await project(page)).tracks[1]!.items[0]!.transform.scale;
  expect(sc).toBeLessThan(0.3);
  // 看得到的圓點只有 12px
  const dot = await page
    .getByTestId('scale-handle')
    .first()
    .evaluate((el) => {
      const a = getComputedStyle(el, '::after');
      return { w: parseFloat(a.width), h: parseFloat(a.height) };
    });
  expect(dot.w).toBeLessThanOrEqual(14);
  // 取消選取後，點那個很小的字（點在字旁邊 15px 內）還是選得到
  await page.getByTestId('stage').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('selbox')).toHaveCount(0);
  const stage = await stageBox(page);
  await page.mouse.click(stage.x + stage.width / 2 + 12, stage.y + stage.height / 2);
  await expect(page.getByTestId('selbox')).toBeVisible();
});

test('預覽上不再有 ✕；用文字面板的「刪除」刪掉文字', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await expect(page.getByRole('button', { name: '刪除圖層' })).toHaveCount(0);
  await expect(clips(page)).toHaveCount(2);
  await page.getByRole('button', { name: '刪除這個文字' }).tap();
  await expect(clips(page)).toHaveCount(1);
  await expect(page.getByTestId('selbox')).toHaveCount(0);
});

test('空專案：「匯入影片或照片」在預覽中央，沒有蓋到時間軸', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vc-debug', '1');
    localStorage.setItem('vc-skip-onboarding', '1');
  });
  await page.goto('./');
  await page.getByRole('button', { name: '新增專案' }).tap();
  await page.getByRole('button', { name: '建立空白專案' }).tap();
  const btn = page.locator('.empty-import');
  await expect(btn).toBeVisible();
  const b = (await btn.boundingBox())!;
  const wrap = (await page.locator('.stage-wrap').boundingBox())!;
  const tl = (await page.locator('.timeline').boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(wrap.y);
  expect(b.y + b.height).toBeLessThanOrEqual(wrap.y + wrap.height);
  expect(b.y + b.height).toBeLessThanOrEqual(tl.y);
  await page.screenshot({ path: `${SHOT}/empty-project.png` });
});
