import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, fixture } from './helpers';

const SHOT = 'docs/screenshots/fix-safe-zone';

type AspectInfo = { aspect: string; width: number; height: number; aspectAuto?: boolean };
const info = async (page: Page): Promise<AspectInfo> => {
  // 預覽引擎建好後除錯掛鉤才會出現
  await page.waitForFunction(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip);
  return page.evaluate(() =>
    (window as unknown as { __videoclip: { project: () => AspectInfo } }).__videoclip.project(),
  );
};

/** 預覽 canvas 的寬高比 */
const canvasRatio = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('.stage canvas') as HTMLCanvasElement;
    const r = c.getBoundingClientRect();
    return r.width / r.height;
  });

async function newEmptyProject(page: Page, chip?: RegExp) {
  await page.addInitScript(() => {
    localStorage.setItem('vc-debug', '1');
    localStorage.setItem('vc-skip-onboarding', '1');
  });
  await page.goto('./');
  await page.getByRole('button', { name: '新增專案' }).tap();
  if (chip) await page.getByRole('radio', { name: chip }).tap();
  await page.getByRole('button', { name: '建立空白專案' }).tap();
  await expect(page).toHaveURL(/#\/p\//);
  // 預覽引擎建好、除錯掛鉤才會出現
  await expect
    .poll(() => page.evaluate(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip))
    .toBe(true);
}

async function importMain(page: Page, file: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page
      .getByRole('button', { name: /匯入影片或照片|匯入/ })
      .first()
      .tap(),
  ]);
  await chooser.setFiles(fixture(file));
}

test('新專案預設「自動」，直式影片 → 9:16、橫式影片 → 16:9、照片 → 4:3', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']);
  expect(await info(page)).toMatchObject({ aspect: '9:16', aspectAuto: true });
  expect(await canvasRatio(page)).toBeCloseTo(9 / 16, 1);
});

test('自動：橫式影片 → 16:9', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await createProjectWith(page, ['clip-c.webm']);
  expect(await info(page)).toMatchObject({ aspect: '16:9', width: 1920, height: 1080, aspectAuto: true });
  expect(await canvasRatio(page)).toBeCloseTo(16 / 9, 1);
});

test('自動：照片 → 4:3', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await createProjectWith(page, ['photo.png']);
  expect(await info(page)).toMatchObject({ aspect: '4:3', width: 1440, height: 1080 });
});

test('新專案面板：預設選「自動」，手動選 1:1 後匯入橫式仍是 1:1', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vc-debug', '1');
    localStorage.setItem('vc-skip-onboarding', '1');
  });
  await page.goto('./');
  await page.getByRole('button', { name: '新增專案' }).tap();
  await expect(page.getByRole('radio', { name: /自動/ })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: `${SHOT}/new-project-sheet.png` });
  await page.getByRole('radio', { name: /1:1/ }).tap();
  await expect(page.getByRole('radio', { name: /1:1/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('new-project-files').setInputFiles(fixture('clip-c.webm'));
  await expect(page).toHaveURL(/#\/p\//);
  await expect(clips(page)).toHaveCount(1, { timeout: 20_000 });
  const p = await info(page);
  expect(p.aspect).toBe('1:1');
  expect(p.aspectAuto).toBeUndefined();
});

test('空白專案＋自動：第一次匯入照第一個素材，之後不再改', async ({ page }) => {
  await newEmptyProject(page);
  expect((await info(page)).aspect).toBe('9:16');
  await importMain(page, 'clip-c.webm');
  await expect(clips(page)).toHaveCount(1, { timeout: 20_000 });
  expect((await info(page)).aspect).toBe('16:9');
  // 第二次匯入直式：主軌已經不是空的，不會再改
  await importMain(page, 'clip-a.webm');
  await expect(clips(page)).toHaveCount(2, { timeout: 20_000 });
  expect((await info(page)).aspect).toBe('16:9');
});

test('編輯器「畫面比例」按鈕：改比例、預覽形狀改變、復原、切回自動', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await createProjectWith(page, ['clip-c.webm']); // 自動 → 16:9
  const btn = page.getByRole('button', { name: '畫面比例' });
  const box = await btn.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await expect(btn).toHaveText('16:9');

  await btn.tap();
  await expect(page.getByRole('radio', { name: /自動/ })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: `${SHOT}/ratio-sheet.png` });
  await page.getByRole('radio', { name: /1:1/ }).tap();
  await expect(btn).toHaveText('1:1');
  await expect.poll(() => canvasRatio(page)).toBeCloseTo(1, 1);
  const manual = await info(page);
  expect(manual).toMatchObject({ aspect: '1:1', width: 1080, height: 1080 });
  expect(manual.aspectAuto).toBeUndefined();
  await page.screenshot({ path: `${SHOT}/ratio-changed-1x1.png` });

  // 復原 → 回到 16:9（連「自動」也一起回來）
  await page.getByRole('button', { name: '復原' }).tap();
  await expect(btn).toHaveText('16:9');
  expect(await info(page)).toMatchObject({ aspect: '16:9', aspectAuto: true });
  await expect.poll(() => canvasRatio(page)).toBeCloseTo(16 / 9, 1);

  // 手動改 9:16，再切回「自動」→ 照第一個片段重算（16:9）
  await btn.tap();
  await page.getByRole('radio', { name: /9:16/ }).tap();
  await expect(btn).toHaveText('9:16');
  await btn.tap();
  await page.getByRole('radio', { name: /自動/ }).tap();
  await expect(btn).toHaveText('16:9');
  expect((await info(page)).aspectAuto).toBe(true);
  expect(errors).toEqual([]);
});
