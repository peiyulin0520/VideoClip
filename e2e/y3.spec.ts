import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, finishLayout, fixture, isRed, openTab, samplePreview } from './helpers';

const SHOT = 'docs/screenshots/feedback-13';

async function setRatio(page: Page, name: RegExp) {
  await page.getByRole('button', { name: '畫面比例' }).tap();
  await page.getByRole('radio', { name }).tap();
  await page.getByTestId('ratio-apply').tap();
  await page.getByRole('button', { name: '關閉', exact: true }).last().tap();
}

test('Y3 預覽：不播放時每一格有編號；播放時所有編輯框（虛線範圍、選取框、編號）都收起來，暫停後回來', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]); // 選到第 1 格
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByTestId('preview-cell-no')).toHaveText(['1', '2']);
  await expect(page.getByTestId('clip-area')).toBeVisible();
  await expect(page.getByTestId('selbox')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/y3-cell-numbers-390.png` });

  await page.getByRole('button', { name: '播放', exact: true }).tap();
  await expect(page.getByTestId('clip-area')).toHaveCount(0);
  await expect(page.getByTestId('selbox')).toHaveCount(0);
  await expect(page.getByTestId('preview-cell-no')).toHaveCount(0);
  await page.getByRole('button', { name: '暫停', exact: true }).tap();
  await expect(page.getByTestId('preview-cell-no')).toHaveCount(2);
  await expect(page.getByTestId('selbox')).toBeVisible();
});

test('Y3 斜線：3:4 專案，預覽區裡所有不輸出的地方都蓋斜線，只挖掉版面', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']);
  await setRatio(page, /3:4/);
  await page.evaluate(() => window.scrollTo(0, 0));
  const wrap = (await page.locator('.stage-wrap').boundingBox())!;
  const hatch = (await page.getByTestId('out-hatch').boundingBox())!;
  expect(Math.abs(hatch.x - wrap.x)).toBeLessThan(1);
  expect(Math.abs(hatch.width - wrap.width)).toBeLessThan(1);
  expect(Math.abs(hatch.height - wrap.height)).toBeLessThan(1);
  // 版面中心不蓋斜線：clip-path 是 evenodd 挖洞（洞的位置＝版面）
  const f = (await page.getByTestId('stage').boundingBox())!;
  const hole = await page.getByTestId('out-hatch').evaluate((el) => (el as HTMLElement).style.clipPath);
  expect(hole).toContain('evenodd');
  expect(hole).toContain(`${(f.x - wrap.x).toFixed(0)}`.slice(0, 1));
  await page.screenshot({ path: `${SHOT}/y3-hatch-34-390.png` });
});

test('Y3 換預覽畫質（高清／順暢）：先頂著舊畫面、新的畫好才拿掉，畫面不空掉', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await page.evaluate(() => {
    (window as unknown as { __held: boolean }).__held = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="frame-hold"]'))
        (window as unknown as { __held: boolean }).__held = true;
    }).observe(document.body, { subtree: true, childList: true });
  });
  await page.getByTestId('quality-btn').tap();
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5)), { timeout: 15_000 }).toBe(true);
  await expect(page.getByTestId('frame-hold')).toHaveCount(0, { timeout: 5000 });
  expect(await page.evaluate(() => (window as unknown as { __held: boolean }).__held)).toBe(true);
});
