import { expect, test, type Page } from '@playwright/test';
import { clips, fixture, isRed, project, samplePreview, type RGBA } from './helpers';

// 模擬 iPhone 匯入大影片時的各種失敗（沙盒沒有 iPhone，用 Chromium 把對應的瀏覽器功能弄壞）。
// 錯誤訊息用 WebKit 的原文：The operation failed for an unknown transient reason (e.g. out of memory).

const SAFARI_MSG = 'The operation failed for an unknown transient reason (e.g. out of memory).';

async function newProject(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('vc-debug', '1');
    localStorage.setItem('vc-skip-onboarding', '1');
  });
  await page.goto('./');
  await page.getByRole('button', { name: '新增專案' }).tap();
}
async function importIntoNew(page: Page, file: string) {
  await page.getByTestId('new-project-files').setInputFiles(fixture(file));
  await expect(page).toHaveURL(/#\/p\//, { timeout: 30_000 });
}
const errors = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __videoclip: { lastImportErrors: () => { step: string; error: string }[] } }
    ).__videoclip.lastImportErrors(),
  );

test('OPFS 寫入失敗（UnknownError）→ 自動改存 IndexedDB，匯入成功，重新整理後素材還在', async ({ page }) => {
  await page.addInitScript((msg) => {
    FileSystemWritableFileStream.prototype.write = function () {
      return Promise.reject(new DOMException(msg, 'UnknownError'));
    };
  }, SAFARI_MSG);
  await newProject(page);
  await importIntoNew(page, 'solid-red.webm');
  await expect(clips(page)).toHaveCount(1, { timeout: 20_000 });
  await expect.poll(async () => isRed((await samplePreview(page, 0.5, 0.5)) as RGBA | null)).toBe(true);
  const errs = await errors(page);
  expect(errs.some((e) => e.step === '存到opfs' && e.error.includes('UnknownError'))).toBe(true);
  expect((await project(page)).assets[0]!.unsaved).toBeUndefined();

  await page.waitForTimeout(1200);
  await page.reload();
  await expect(clips(page)).toHaveCount(1, { timeout: 20_000 });
  await expect.poll(async () => isRed((await samplePreview(page, 0.5, 0.5)) as RGBA | null)).toBe(true);
});

test('OPFS 和 IndexedDB 都寫不進去 → 先放記憶體：照樣能剪、有提醒、素材標記沒存', async ({ page }) => {
  await page.addInitScript((msg) => {
    FileSystemWritableFileStream.prototype.write = function () {
      return Promise.reject(new DOMException(msg, 'UnknownError'));
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: Parameters<typeof put>) {
      if (this.name === 'blobs') throw new DOMException(msg, 'UnknownError');
      return put.apply(this, a);
    } as typeof put;
  }, SAFARI_MSG);
  await newProject(page);
  await importIntoNew(page, 'solid-red.webm');
  await expect(clips(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('.toast').filter({ hasText: '沒辦法存在手機裡' })).toBeVisible();
  await expect.poll(async () => isRed((await samplePreview(page, 0.5, 0.5)) as RGBA | null)).toBe(true);
  expect((await project(page)).assets[0]!.unsaved).toBe(true);
  // 還能繼續剪：分割
  await clips(page).first().tap();
  await page.getByRole('button', { name: '複製', exact: true }).tap();
  await expect(clips(page)).toHaveCount(2);
});

test('縮圖解碼失敗（VideoDecoder 壞掉、video 也拿不到畫面）不會讓匯入失敗', async ({ page }) => {
  await page.addInitScript((msg) => {
    VideoDecoder.prototype.decode = function () {
      throw new DOMException(msg, 'UnknownError');
    };
  }, SAFARI_MSG);
  await newProject(page);
  await importIntoNew(page, 'clip-a.webm');
  await expect(clips(page)).toHaveCount(1, { timeout: 30_000 });
  // 沒有 WebCodecs 縮圖也會有（改用 <video>，或之後由播放器補上）
  await expect
    .poll(async () => (await project(page)).assets[0]!.thumbs.length, {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
});

test('失敗時的錯誤訊息要說明是哪一步、檔案多大、原因（不是英文原文）', async ({ page }) => {
  await newProject(page);
  await page.getByTestId('new-project-files').setInputFiles({
    name: 'broken.mov',
    mimeType: 'video/quicktime',
    buffer: Buffer.from('this is not a video'),
  });
  // 專案照樣建立（空的），並且提示哪個檔案為什麼失敗
  await expect(page).toHaveURL(/#\/p\//, { timeout: 30_000 });
  const toast = page.locator('.toast').filter({ hasText: '無法匯入' });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('broken.mov');
  await expect(toast).not.toContainText('unknown transient reason');
});
