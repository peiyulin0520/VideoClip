import { expect, test } from '@playwright/test';
import { closePanel, createProjectWith, openCat, openTool } from './helpers';

// feedback-15 Z4／Z5：功能列下面不留空白、升起的視窗內容底下不留空白、功能列兩層字級一樣
test('Z4 畫面撐滿、視窗內容底下不留空白（模擬 iPhone 的 Home 橫條 34px）', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const st = document.createElement('style');
    st.textContent = ':root{--safe-bottom:34px !important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
  });
  await createProjectWith(page, ['clip-a.webm']);
  const vh = page.viewportSize()!.height;
  // 功能列的下緣就是畫面下緣
  const bar = (await page.locator('.bottombar').boundingBox())!;
  expect(Math.abs(bar.y + bar.height - vh)).toBeLessThan(2);
  await closePanel(page);
  await page.getByTestId('clip').first().tap();
  const checks: [string, string][] = [
    ['特效', 'fx.in'],
    ['特效', 'fx.whole'],
    ['色調', 'color.look'],
    ['剪輯', 'edit.speed'],
    ['剪輯', 'edit.look'],
    ['音訊', 'audio.volume'],
  ];
  for (const [cat, tool] of checks) {
    await openCat(page, cat);
    await openTool(page, tool);
    const gap = await page.evaluate(() => {
      const sheet = document.querySelector('.panel-sheet')!.getBoundingClientRect();
      const body = document.querySelector('.ps-body')!;
      // 內容最下面的東西（只看最裡面一層的元素，外層容器自己的留白不算）
      const last = Array.from(body.querySelectorAll('*'))
        .filter((e) => e.children.length === 0 || e.tagName === 'BUTTON')
        .reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
      return sheet.bottom - last;
    });
    expect(gap, `${tool} 內容底下的空白`).toBeLessThanOrEqual(32);
  }
});

test('Z5 功能列第一層（類別）與第二層（工具）字級一樣', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']);
  const fs = (sel: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((e) => getComputedStyle(e).fontSize);
  const tab = await fs('.tabs .tab span');
  await closePanel(page);
  await page.getByTestId('clip').first().tap();
  await openCat(page, '剪輯');
  expect(await fs('.fb-row .tool')).toBe(tab);
});

// feedback-16 Z15：功能列文字下面只留一小條（Home 橫條上面一點），不是整條 34pt
test('Z15 模擬 Home 橫條 34px：功能列文字下緣離畫面底 ≤ 28px（原本約 40），視窗貼在功能列上面', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const st = document.createElement('style');
    st.textContent = ':root{--safe-bottom:34px !important}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
  });
  await createProjectWith(page, ['clip-a.webm']);
  const vh = page.viewportSize()!.height;
  const textGap = (sel: string) =>
    page.evaluate(
      ([s, h]) => {
        const e = document.querySelector(s as string)!;
        return (h as number) - e.getBoundingClientRect().bottom;
      },
      [sel, vh],
    );
  expect(await textGap('.tabs .tab span')).toBeLessThanOrEqual(28);
  await closePanel(page);
  await page.getByTestId('clip').first().tap();
  await openCat(page, '剪輯');
  expect(await textGap('.fb-row .tool span:not(.tool-ico)')).toBeLessThanOrEqual(28);
  await openTool(page, 'edit.speed');
  const g = await page.evaluate(() => {
    const sheet = document.querySelector('.panel-sheet')!.getBoundingClientRect();
    const bar = document.querySelector('.fb-row')!.getBoundingClientRect();
    return bar.top - sheet.bottom;
  });
  expect(Math.abs(g), '視窗下緣貼著功能列上緣').toBeLessThanOrEqual(2);
});
