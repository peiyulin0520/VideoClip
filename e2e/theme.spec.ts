import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, fixture, openTab, showTimeline } from './helpers';

const SHOT = 'docs/screenshots/feedback-6/theme';
const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const attr = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const lum = (rgb: string) => {
  const m = /(\d+), (\d+), (\d+)/.exec(rgb)!;
  return (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1000;
};

test('設定頁可以換介面主題：暗黑（預設）、黑白、清新、溫暖；記住選擇，重新整理仍是那個主題', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('vc-skip-onboarding', '1'));
  await page.goto('./#/settings');
  expect(await attr(page)).toBeNull(); // 預設是暗黑
  const dark = lum(await bg(page));
  expect(dark).toBeLessThan(60);
  await expect(page.getByRole('radio', { name: '主題 暗黑' })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: `${SHOT}/settings-dark.png` });

  await page.getByRole('radio', { name: '主題 黑白' }).tap();
  expect(await attr(page)).toBe('mono');
  expect(lum(await bg(page))).toBeGreaterThan(240); // 白底
  await expect(page.getByRole('radio', { name: '主題 黑白' })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('vc-theme'))).toBe('mono');
  await page.screenshot({ path: `${SHOT}/settings-mono.png` });

  await page.getByRole('radio', { name: '主題 清新' }).tap();
  expect(await attr(page)).toBe('fresh');
  expect(lum(await bg(page))).toBeGreaterThan(220);
  await page.screenshot({ path: `${SHOT}/settings-fresh.png` });

  await page.getByRole('radio', { name: '主題 溫暖' }).tap();
  expect(await attr(page)).toBe('warm');
  const warm = await bg(page);
  expect(lum(warm)).toBeGreaterThan(220); // 米色（淺色基底）
  expect(warm).not.toBe('rgb(255, 255, 255)'); // 不是純白
  expect(warm).toBe('rgb(246, 240, 230)');
  await page.screenshot({ path: `${SHOT}/settings-warm.png` });

  // 重新整理仍是溫暖；手機狀態列顏色也跟著
  await page.reload();
  expect(await attr(page)).toBe('warm');
  expect(
    await page.evaluate(() => document.querySelector('meta[name="theme-color"]')!.getAttribute('content')),
  ).toBe('#f6f0e6');

  // 換回暗黑：不留記錄
  await page.getByRole('radio', { name: '主題 暗黑' }).tap();
  expect(await attr(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('vc-theme'))).toBeNull();
});

test('每個主題下的編輯器：文字看得清楚（對比夠）、預覽畫面仍是黑底、按鈕都在', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-theme', 'fresh'));
  await createProjectWith(page, ['solid-red.webm']);
  for (const id of ['mono', 'fresh', 'warm', 'dark'] as const) {
    await page.evaluate((t) => {
      localStorage.setItem('vc-theme', t);
      if (t === 'dark') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', t);
    }, id);
    await openTab(page, '剪輯');
    // 頂列文字與背景的對比：亮度差夠大
    const c = await page.evaluate(() => {
      const el = document.querySelector('.ed-top .name-btn') as HTMLElement;
      const top = document.querySelector('.ed-top') as HTMLElement;
      return {
        fg: getComputedStyle(el).color,
        bg: getComputedStyle(top).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
      };
    });
    const bgc = c.bg === 'rgba(0, 0, 0, 0)' ? c.body : c.bg;
    expect(Math.abs(lum(c.fg) - lum(bgc))).toBeGreaterThan(110);
    // 預覽畫面永遠是黑底（才看得出影片真正的顏色）
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector('.stage') as HTMLElement).backgroundColor,
      ),
    ).toBe('rgb(0, 0, 0)');
    await page.screenshot({ path: `${SHOT}/editor-${id}.png` });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.screenshot({ path: `${SHOT}/editor-${id}-panel.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
  }
});

test('首頁在每個主題下也看得到專案卡片與「新增專案」', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vc-skip-onboarding', '1');
    localStorage.setItem('vc-theme', 'mono');
  });
  await page.goto('./');
  expect(await attr(page)).toBe('mono');
  await expect(page.getByRole('button', { name: '新增專案' })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/home-mono.png` });
});

test('清新／溫暖：時間軸上字卡與音樂片段的字看得清楚（深底配淺字）', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增文字/ }).tap();
  await openTab(page, '疊加');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.locator('[data-testid="clip"][data-kind="audio"]')).toHaveCount(1, { timeout: 20_000 });
  await showTimeline(page);

  for (const id of ['fresh', 'warm', 'mono'] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), id);
    for (const kind of ['text', 'audio']) {
      const c = await page.evaluate((k) => {
        const clip = document.querySelector(`[data-testid="clip"][data-kind="${k}"]`) as HTMLElement;
        const label = clip.querySelector('.clip-label') as HTMLElement;
        return { fg: getComputedStyle(label).color, bg: getComputedStyle(clip).backgroundColor };
      }, kind);
      // 亮度差夠大＝看得清楚（片段是深底就要淺字）
      expect(Math.abs(lum(c.fg) - lum(c.bg)), `${id}/${kind}: ${c.fg} on ${c.bg}`).toBeGreaterThan(110);
    }
    await page.screenshot({ path: `docs/screenshots/feedback-6/theme/clips-${id}.png` });
  }
});
