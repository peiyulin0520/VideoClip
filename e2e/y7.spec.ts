import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, expectToast, finishLayout, fixture, openLayerList, openTab } from './helpers';

const SHOT = 'docs/screenshots/feedback-13';

async function twoCells(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
}

test('Y7 圖層分頁：版型預設收合成一列（顯示第幾層到第幾層）；展開後依實際上下列出，層號越下面越小', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await twoCells(page);
  await openLayerList(page);
  const group = page.getByTestId('layer-group');
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute('data-open', 'false');
  await expect(page.getByTestId('layer-row')).toHaveCount(1); // 只剩下面的藍色主軌
  await expect(page.getByTestId('layer-group-no')).toHaveText('第 2–4 層');
  await page.screenshot({ path: `${SHOT}/y7-layers-collapsed-390.png` });

  await group.getByRole('button', { name: /^展開版型/ }).tap();
  await expect(group).toHaveAttribute('data-open', 'true');
  const rows = page.getByTestId('layer-row');
  await expect(rows).toHaveCount(4);
  // 由上到下：層號 4、3、2、1（主軌是 1、在最下面）
  const nos = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-layer-no')));
  expect(nos).toEqual(['4', '3', '2', '1']);
  await page.screenshot({ path: `${SHOT}/y7-layers-expanded-390.png` });

  // 收回去
  await group.getByRole('button', { name: /^收合版型/ }).tap();
  await expect(page.getByTestId('layer-row')).toHaveCount(1);
});

test('Y7 版型裡的格子列也有上下鈕（只有一層時提示）；每一列的按鈕在同樣位置、320 寬不換行不超出', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await twoCells(page);
  await openLayerList(page);
  await page
    .getByTestId('layer-group')
    .getByRole('button', { name: /^展開版型/ })
    .tap();
  const cell = page.locator('[data-testid="layer-row"][data-kind="media"]').nth(1);
  await cell.getByRole('button', { name: /往上一層/ }).tap();
  await expectToast(page, '這一格只有一層');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.waitForTimeout(200);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const rights: number[] = [];
    for (const row of Array.from(document.querySelectorAll('[data-testid="layer-row"]'))) {
      const btns = Array.from(row.querySelectorAll('.layer-btns button'));
      const tops = btns.map((b) => b.getBoundingClientRect().top);
      if (Math.max(...tops) - Math.min(...tops) > 2) out.push('按鈕換行');
      for (const b of btns)
        if (b.getBoundingClientRect().right > window.innerWidth + 0.5) out.push('超出螢幕');
      const last = row.querySelector('.layer-btns .btn-zone:last-child');
      if (last) rights.push(Math.round(last.getBoundingClientRect().right));
    }
    if (new Set(rights).size > 1 && Math.max(...rights) - Math.min(...rights) > 20) out.push('按鈕沒對齊');
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('橫向捲動');
    return out;
  });
  expect(bad).toEqual([]);
  await page.screenshot({ path: `${SHOT}/y7-layers-expanded-320.png` });
});
