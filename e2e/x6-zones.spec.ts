import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, finishLayout, fixture, openTab } from './helpers';

const SHOT = 'docs/screenshots/feedback-12';

const box = async (page: Page, testid: string) => (await page.getByTestId(testid).boundingBox())!;

test('X6 按鈕分區：頂列、播放列用細線分成不同層級；匯出不跟 ↪ 同一區；小螢幕不跑版', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']);

  // 分區：匯出自己一區；復原、重做移到播放列（zone-history）
  const redoZone = page.getByTestId('zone-history');
  await expect(redoZone.getByRole('button', { name: '重做' })).toBeVisible();
  await expect(redoZone.getByRole('button', { name: '匯出影片' })).toHaveCount(0);
  await expect(page.getByTestId('zone-export').getByRole('button', { name: '匯出影片' })).toBeVisible();
  // 返回與名稱同一區；比例與畫質同一區
  await expect(page.getByTestId('zone-nav').getByRole('button', { name: '專案名稱' })).toBeVisible();
  await expect(page.getByTestId('zone-view').getByRole('button', { name: '畫面比例' })).toBeVisible();

  // 播放列：播放與時間一區，復原／重做一區，中間有分隔線
  const play = await box(page, 'zone-play');
  const hist = await box(page, 'zone-history');
  expect(hist.x).toBeGreaterThan(play.x + play.width);
  const seps = page.locator('.playbar > .zone-sep');
  await expect(seps).toHaveCount(1);
  const sepBox = (await seps.last().boundingBox())!;
  expect(sepBox.x).toBeGreaterThanOrEqual(play.x + play.width - 1);
  expect(sepBox.x + sepBox.width).toBeLessThanOrEqual(hist.x + 1);
  expect(sepBox.width).toBeGreaterThan(0);

  // 每一種手機寬度：頂列、播放列不橫向捲動、也沒有按鈕被擠到換行或超出螢幕
  for (const w of [320, 375, 390, 430]) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.waitForTimeout(150);
    const over = await page.evaluate(() => {
      const bad: string[] = [];
      for (const sel of ['.ed-top', '.playbar']) {
        const root = document.querySelector(sel)!;
        if (root.scrollWidth > root.clientWidth + 1) bad.push(`${sel} scroll`);
        for (const b of Array.from(root.querySelectorAll('button, a'))) {
          const r = b.getBoundingClientRect();
          if (r.right > window.innerWidth + 0.5 || r.left < -0.5)
            bad.push(`${sel} ${b.getAttribute('aria-label')} out`);
        }
      }
      return bad;
    });
    expect(over, `寬度 ${w}`).toEqual([]);
    if (w === 320 || w === 390) await page.screenshot({ path: `${SHOT}/x6-zones-${w}.png` });
  }

  // 版型分頁（沒版型時只有挑版型）
  await openTab(page, '版型');
  await expect(page.getByTestId('zone-this-layout')).toHaveCount(0);
});

test('X6 版型分頁：〔這個版型〕卡片（移除版型在裡面）跟〔新增版型〕分開；播放軸版型 ▾ 用強調色底', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-blue.webm')]);
  const card = page.getByTestId('zone-this-layout');
  await expect(card.getByRole('button', { name: '移除版型' })).toBeVisible();
  const addZone = page.getByTestId('zone-new-layout');
  await expect(addZone).toBeVisible();
  await expect(card.getByTestId('layout-add-more')).toHaveCount(0);
  const a = (await card.boundingBox())!;
  const b = (await addZone.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(a.y + a.height); // 新增版型在卡片下面、不重疊
  await page.screenshot({ path: `${SHOT}/x6-layout-tab.png` });
  // 版型 ▾ 的底色跟一般分類鈕（影像）不同
  const grp = await page.getByTestId('group-toggle').evaluate((e) => getComputedStyle(e).backgroundColor);
  const cat = await page
    .locator('.cat-toggle:not(.grp):not(.sub)')
    .first()
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(grp).not.toBe(cat);
});
