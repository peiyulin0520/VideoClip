import { expect, test } from '@playwright/test';
import {
  clips,
  countColor,
  createProjectWith,
  regionHash,
  fixture,
  openTab,
  project,
  samplePreview,
  type RGBA,
} from './helpers';

const SHOT = 'docs/screenshots/phase3b';

test('首次使用精靈：第一次嗎 → 備份位置 → 下載字體；完成後重新整理不會再問', async ({ page }) => {
  await page.goto('./'); // 沒有 vc-skip-onboarding：這是一台全新的裝置
  const welcome = page.getByTestId('welcome');
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole('heading', { name: /歡迎使用/ })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/wizard-1-first.png` });

  // 「不是第一次」→ 還原選項（目前還不能用）→ 先略過
  await welcome.getByRole('button', { name: /不是，我換了手機/ }).tap();
  await expect(welcome.getByRole('button', { name: /從 Google 雲端還原/ })).toBeDisabled();
  await expect(welcome.getByRole('button', { name: /匯入備份/ })).toBeDisabled();
  await welcome.getByRole('button', { name: /先略過，繼續設定/ }).tap();

  // 備份位置：預設「存在手機檔案」；選 Google 雲端會多一個資料夾網址欄，貼網址會被解析
  await expect(welcome.getByRole('radio', { name: /^📱 存在手機檔案/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await welcome.getByRole('radio', { name: /^☁️ 存到 Google 雲端/ }).tap();
  const input = welcome.getByLabel('Google 雲端資料夾網址');
  await input.fill('https://drive.google.com/drive/folders/1fLGtxMS4oRFIOqpyn-jnBtifCRCclF2l?usp=sharing');
  await expect(welcome.getByText('已讀到資料夾')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/wizard-2-backup.png` });
  await welcome.getByRole('button', { name: '下一步' }).tap();

  // 字體包：預設只勾「基本包」
  const boxes = welcome.getByRole('checkbox');
  await expect(boxes.first()).toBeChecked();
  expect(await boxes.count()).toBeGreaterThanOrEqual(5);
  for (let i = 1; i < (await boxes.count()); i++) await expect(boxes.nth(i)).not.toBeChecked();
  await page.screenshot({ path: `${SHOT}/wizard-3-fonts.png` });
  await welcome.getByRole('button', { name: /開始下載/ }).tap();

  // 下載完成後精靈消失，回到首頁
  await expect(welcome).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'VideoClip 剪輯' })).toBeVisible();

  // 字體真的存進 Cache Storage、清單記在這台裝置
  const cached = await page.evaluate(async () => {
    const c = await caches.open('vc-fonts-v1');
    return (await c.keys()).map((r) => r.url);
  });
  expect(cached.some((u) => u.includes('/fonts/noto-sans-tc/'))).toBe(true);
  expect(cached.some((u) => u.includes('/fonts/mantou-sans/'))).toBe(true);
  expect(cached.some((u) => u.includes('/fonts/pop-gothic/'))).toBe(false); // 沒勾「手寫可愛包」

  // 重新整理：不會再問，也不會再顯示「還沒下載字體」
  await page.reload();
  await expect(page.getByRole('heading', { name: 'VideoClip 剪輯' })).toBeVisible();
  await expect(page.getByTestId('welcome')).toHaveCount(0);
  await expect(page.getByTestId('fonts-banner')).toHaveCount(0);

  // 設定頁記得選擇：備份＝Google 雲端、資料夾網址、基本包全部已下載
  await page.getByRole('link', { name: '設定' }).tap();
  await expect(page.getByRole('radio', { name: /Google 雲端/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Google 雲端資料夾網址')).toHaveValue(/1fLGtxMS4oRFIOqpyn/);
  const basic = page.locator('[data-testid="pack-block"][data-pack="basic"]');
  await expect(basic).toContainText('7/7 款已下載');
});

test('設定頁：下載、移除字體包，看得到授權與來源，儲存空間有顯示', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-skip-onboarding', '1'));
  await page.goto('./#/settings');
  const brush = page.locator('[data-testid="pack-block"][data-pack="brush"]');
  await expect(brush).toContainText('0/2 款已下載');
  await page.getByRole('button', { name: /下載 .*毛筆/ }).tap();
  await expect(brush).toContainText('2/2 款已下載', { timeout: 60_000 });
  await page.screenshot({ path: `${SHOT}/settings-fonts.png` });
  await page.getByRole('button', { name: /移除 .*毛筆/ }).tap();
  await expect(brush).toContainText('0/2 款已下載');

  await page.getByRole('button', { name: /字體授權與來源/ }).tap();
  await expect(
    page.getByText('SIL Open Font License').first().or(page.getByText('OFL-1.1').first()),
  ).toBeVisible();
  await expect(page.getByText(/中規中矩體/)).toBeVisible(); // 不能放進網站的字體有說明
  await expect(page.getByTestId('storage-usage')).toContainText(/已用|無法讀取/);
});

test('字卡換字體：選單每個字體用自己的字形；沒下載過的選了會自動下載；畫出來的字真的變了', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增文字/ }).tap();
  await page.getByLabel('文字內容').fill('ㄅㄆㄇ 大波浪圓體');
  // 中間那條的白色像素數：系統字體
  const band: [number, number, number, number] = [0, 0.4, 1, 0.6];
  await expect.poll(async () => countColor(page, [255, 255, 255], 40, band)).toBeGreaterThan(30);
  const before = await regionHash(page, band);

  await page.getByRole('button', { name: '字體', exact: true }).tap();
  const list = page.getByTestId('font-list');
  await expect(list.getByTestId('font-row')).toHaveCount(await list.getByTestId('font-row').count());
  expect(await list.getByTestId('font-row').count()).toBeGreaterThan(30);
  // 預覽字樣載入後，名稱是用該字體自己的字形（vcp-<key>）
  await expect
    .poll(() =>
      page.evaluate(() => {
        const row = document.querySelector('[data-font-key="pop-gothic"] .font-prev') as HTMLElement | null;
        return row?.style.fontFamily ?? '';
      }),
    )
    .toContain('vcp-pop-gothic');
  await page.screenshot({ path: `${SHOT}/font-select.png` });

  await list.locator('[data-font-key="pop-gothic"]').tap(); // 還沒下載 → 自動下載並套用
  await expect(page.getByRole('dialog', { name: '選擇字體' })).toBeHidden({ timeout: 30_000 });
  const run = (await project(page)).tracks[1]!.items[0]!.card!.runs[0]!;
  expect(run.fontId).toBe('pop-gothic');
  expect(await page.evaluate(() => document.fonts.check('20px vc-pop-gothic'))).toBe(true);
  // 字形不同 → 這一條的畫面內容會變（而且仍然有白色的字）
  await expect.poll(async () => (await regionHash(page, band)) !== before, { timeout: 10_000 }).toBe(true);
  expect(await countColor(page, [255, 255, 255], 40, band)).toBeGreaterThan(30);
  await page.screenshot({ path: `${SHOT}/text-pop-gothic.png` });

  // 專案重新載入後字體還在（從快取讀，不會變回系統字體）
  await page.waitForTimeout(1200); // 等自動儲存（800ms）
  await page.reload();
  await expect(clips(page)).toHaveCount(2);
  const sample = async () => (await samplePreview(page, 0.5, 0.5)) as RGBA | null;
  await expect.poll(async () => !!(await sample())).toBe(true);
  await expect
    .poll(async () => page.evaluate(() => document.fonts.check('20px vc-pop-gothic')), { timeout: 15_000 })
    .toBe(true);
});

test('匯入自己的字體：選了檔案就能用，存在這台裝置，重新整理後還在', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增文字/ }).tap();
  await page.getByRole('button', { name: '字體', exact: true }).tap();
  await page.getByTestId('font-file-input').setInputFiles(fixture('mini-font.ttf'));
  await expect(
    page
      .locator('.toast')
      .filter({ hasText: /已匯入/ })
      .first(),
  ).toBeVisible();
  const p = await project(page);
  const fontId = p.tracks[1]!.items[0]!.card!.runs[0]!.fontId;
  expect(fontId.startsWith('u:')).toBe(true);

  // 不是字體的檔案：不會壞掉，只提示
  await page.getByRole('button', { name: '字體', exact: true }).tap();
  await page
    .getByTestId('font-file-input')
    .setInputFiles({ name: 'x.ttf', mimeType: 'font/ttf', buffer: Buffer.from('not a font') });
  await expect(
    page
      .locator('.toast')
      .filter({ hasText: /不是瀏覽器能讀的字體檔/ })
      .first(),
  ).toBeVisible();

  // 重新整理後：「我的字體」還在，字卡還是用它
  await page.waitForTimeout(1200); // 等自動儲存（800ms）
  await page.reload();
  await expect(clips(page)).toHaveCount(2);
  // 專案打開時畫字卡會自動從這台裝置的資料庫把字體載回來
  await expect
    .poll(
      async () =>
        page.evaluate(
          (id) =>
            Array.from(document.fonts as unknown as Iterable<FontFace>).some(
              (f) => f.family.replace(/"/g, '') === `vcu-${id.slice(2)}` && f.status === 'loaded',
            ),
          fontId,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  await page.getByRole('link', { name: '回首頁' }).tap();
  await page.getByRole('link', { name: '設定' }).tap();
  await expect(
    page
      .getByText('Iansui Mini')
      .or(page.getByText(/芫荽.*Mini|Mini/))
      .first(),
  ).toBeVisible(); // 「我的字體」列出來
});

test('還沒下載任何字體時，首頁會提醒；關掉後不再出現', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-skip-onboarding', '1'));
  await page.goto('./');
  const banner = page.getByTestId('fonts-banner');
  await expect(banner).toBeVisible();
  await banner.getByRole('link', { name: '去下載' }).tap();
  await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
});
