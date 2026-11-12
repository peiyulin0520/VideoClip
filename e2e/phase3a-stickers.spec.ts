import { expect, test } from '@playwright/test';
import { clips, countColor, createProjectWith, openTab, previewBox, project, fixture } from './helpers';

const SHOT = 'docs/screenshots/phase3a';

test('貼圖：分類、縮圖有載入、點一下加到這一秒（變成照片素材、比較小）、可拖、一步復原、重新整理後還在', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '素材');
  const grid = page.getByTestId('sticker-grid');
  // 我的貼圖、GIPHY ＋ 9 個 Fluent Emoji 分類；Fluent 每個分類至少 20 個貼圖，縮圖都載入得到
  const tabs = page.getByRole('tablist', { name: '貼圖分類' }).getByRole('tab');
  const n = await tabs.count();
  expect(n).toBe(11);
  await expect(tabs.nth(0)).toHaveText('我的貼圖');
  await expect(tabs.nth(1)).toHaveText('GIPHY');
  for (let i = 2; i < n; i++) {
    await tabs.nth(i).tap();
    await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
    expect(await grid.locator('.sticker-cell').count()).toBeGreaterThanOrEqual(20);
  }
  await tabs.nth(3).tap(); // 愛心
  await grid.locator('.sticker-cell').first().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      grid
        .locator('img')
        .evaluateAll((imgs) =>
          (imgs as HTMLImageElement[]).slice(0, 12).every((i) => i.complete && i.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/sticker-picker.png` });

  // 點「紅心」→ 疊加軌多一個照片素材，被選取，大小 30%
  await page.getByRole('button', { name: '貼圖 red heart' }).tap();
  await expect(clips(page)).toHaveCount(2, { timeout: 15_000 });
  const p = await project(page);
  const item = p.tracks[1]!.items[0]!;
  expect(item.type).toBe('image');
  expect(item.transform.scale).toBeCloseTo(0.3);
  expect(p.assets.some((a) => a.name === '貼圖-red-heart.png')).toBe(true);
  // 預覽中間出現紅色（紅心）
  await expect.poll(() => countColor(page, [248, 49, 47], 60, [0.3, 0.35, 0.7, 0.65])).toBeGreaterThan(200);
  await page.screenshot({ path: `${SHOT}/sticker-added.png` });

  // 拖到右上
  const st = await previewBox(page);
  await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
  await page.mouse.down();
  await page.mouse.move(st.x + st.width * 0.7, st.y + st.height * 0.3, { steps: 6 });
  await page.mouse.up();
  const tf = (await project(page)).tracks[1]!.items[0]!.transform;
  expect(tf.x).toBeGreaterThan(0.6);
  expect(tf.y).toBeLessThan(0.4);

  // 加貼圖是一步復原：復原兩次（拖移、加入）→ 貼圖和素材都不見；重做回來
  await page.getByRole('button', { name: '復原' }).tap();
  await page.getByRole('button', { name: '復原' }).tap();
  await expect(clips(page)).toHaveCount(1);
  expect((await project(page)).assets).toHaveLength(1);
  await page.getByRole('button', { name: '重做' }).tap();
  await page.getByRole('button', { name: '重做' }).tap();
  await expect(clips(page)).toHaveCount(2);

  // 重新整理後還在（存在這台裝置）
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(clips(page)).toHaveCount(2, { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('貼圖授權：設定頁有連結，授權檔可以打開', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('vc-skip-onboarding', '1'));
  await page.goto('./#/settings');
  await expect(page.getByRole('region', { name: '素材授權' })).toContainText('Fluent Emoji');
  const res = await request.get('stickers/LICENSE.txt');
  expect(res.ok()).toBe(true);
  expect(await res.text()).toContain('MIT License');
});

test('我的貼圖：上傳自己的圖存在這支手機，換一個專案也能用；可以刪除', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '素材');
  await page.getByRole('tablist', { name: '貼圖分類' }).getByRole('tab', { name: '我的貼圖' }).tap();
  await expect(page.getByText('所有專案都能用')).toBeVisible();
  await page.getByTestId('my-sticker-input').setInputFiles(fixture('photo.png'));
  const grid = page.getByTestId('my-sticker-grid');
  await expect(grid.locator('.sticker-cell')).toHaveCount(1);
  await grid.locator('.sticker-cell').first().tap();
  await expect(clips(page)).toHaveCount(2, { timeout: 15_000 });
  expect((await project(page)).tracks[1]!.items[0]!.transform.scale).toBeCloseTo(0.3);

  // 回首頁開另一個新專案：我的貼圖還在
  await page.waitForTimeout(1200);
  await page.getByRole('link', { name: '回首頁' }).tap();
  await page.getByRole('button', { name: '新增專案' }).tap();
  await page.getByTestId('new-project-files').setInputFiles(fixture('solid-red.webm'));
  await expect(page).toHaveURL(/#\/p\//);
  await openTab(page, '素材');
  await page.getByRole('tablist', { name: '貼圖分類' }).getByRole('tab', { name: '我的貼圖' }).tap();
  await expect(page.getByTestId('my-sticker-grid').locator('.sticker-cell')).toHaveCount(1);
  await page.screenshot({ path: `${SHOT}/my-stickers.png` });

  // 管理 → 刪除
  await page.getByRole('button', { name: '管理' }).tap();
  await page.getByRole('button', { name: /刪除我的貼圖/ }).tap();
  await expect(page.getByTestId('my-sticker-grid').locator('.sticker-cell')).toHaveCount(0);
});
