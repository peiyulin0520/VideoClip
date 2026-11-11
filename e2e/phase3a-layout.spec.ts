import { expect, test } from '@playwright/test';
import { createProjectWith } from './helpers';

type Ink = { w: number; h: number; top: number; bottom: number; left: number; right: number };
type CardArg = unknown;

const ink = (page: import('@playwright/test').Page, card: CardArg, scale = 1): Promise<Ink> =>
  page.evaluate(
    ([c, s]) =>
      (
        window as unknown as { __videoclip: { cardInk: (c: unknown, s: number) => Promise<Ink> } }
      ).__videoclip.cardInk(c, s as number),
    [card, scale] as const,
  );

const card = (fontId: string, pad: { top: number; right: number; bottom: number; left: number }) => ({
  align: 'center',
  runs: [
    {
      text: '字卡測試',
      fontId,
      size: 120,
      color: '#ffffff',
      letterSpacing: 0,
      lineHeight: 1.25,
      weight: 'normal',
    },
  ],
  box: { shape: 'rect', fill: '#202020', opacity: 1, padding: pad, nudgeY: 0 },
});

// 畫布四周多留 4px 給描邊/陰影（沒有描邊陰影時的最小值）
const BLEED = 4;

for (const fontId of ['jf-openhuninn', 'mantou-sans', 'lxgw-wenkai-tc']) {
  test(`字塊內距：${fontId} 上下左右跟設定的一樣（字上方色塊不會比下方多）`, async ({ page }) => {
    await createProjectWith(page, ['solid-red.webm']);
    await expect
      .poll(() => page.evaluate(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip))
      .toBe(true);
    const pad = { top: 30, right: 50, bottom: 30, left: 50 };
    const r = await ink(page, card(fontId, pad));
    // 確實用的是這個字體（不是備用字體）
    expect(await page.evaluate((f) => document.fonts.check(`20px vc-${f}`), fontId)).toBe(true);
    const gapTop = r.top - BLEED;
    const gapBottom = r.h - BLEED - 1 - r.bottom;
    const gapLeft = r.left - BLEED;
    const gapRight = r.w - BLEED - 1 - r.right;
    expect(Math.abs(gapTop - pad.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(gapBottom - pad.bottom)).toBeLessThanOrEqual(2);
    expect(Math.abs(gapLeft - pad.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(gapRight - pad.right)).toBeLessThanOrEqual(2);
    // 上下內距分開調：上 10、下 60
    const r2 = await ink(page, card(fontId, { top: 10, right: 50, bottom: 60, left: 50 }));
    expect(Math.abs(r2.top - BLEED - 10)).toBeLessThanOrEqual(2);
    expect(Math.abs(r2.h - BLEED - 1 - r2.bottom - 60)).toBeLessThanOrEqual(2);
  });
}
