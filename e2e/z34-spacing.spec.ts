import { expect, test } from '@playwright/test';
import { createProjectWith, waitHook } from './helpers';

// feedback-18 Z34：動態字卡也吃〔字距〕〔行距〕（文字〔版面〕的滑桿）。用自編的字，不用使用者的文字。
type Hook = {
  kineticPaint: (
    id: string,
    t: number,
    W: number,
    H: number,
    words?: string[],
    settle?: number,
    opts?: { letterEm?: number; lineK?: number },
  ) => string | null;
};

/** 畫一張圖，回傳「有墨的範圍」（寬、高） */
async function inkBox(
  page: import('@playwright/test').Page,
  id: string,
  t: number,
  words: string[],
  opts: { letterEm?: number; lineK?: number },
  settle?: number,
) {
  return page.evaluate(
    async ([id, t, words, opts, settle]) => {
      const hook = (window as unknown as { __videoclip: Hook }).__videoclip;
      const url = hook.kineticPaint(
        id as string,
        t as number,
        540,
        960,
        words as string[],
        settle as number | undefined,
        opts as object,
      )!;
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 540;
      c.height = 960;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, 540, 960).data;
      const br = d[0]!;
      const bg = d[1]!;
      const bb = d[2]!;
      let x0 = 1e9;
      let x1 = -1;
      let y0 = 1e9;
      let y1 = -1;
      for (let y = 0; y < 960; y++)
        for (let x = 0; x < 540; x++) {
          const i = (y * 540 + x) * 4;
          if (Math.abs(d[i]! - br) + Math.abs(d[i + 1]! - bg) + Math.abs(d[i + 2]! - bb) > 120) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        }
      return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
    },
    [id, t, words, opts, settle] as const,
  );
}

test('Z34 字距：同一式字距 0 和 0.3，字的範圍變寬（逐字重擊排字，停點那一格）', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await waitHook(page);
  const supported = await page.evaluate(() => 'letterSpacing' in CanvasRenderingContext2D.prototype);
  test.skip(!supported, '這個瀏覽器的 canvas 沒有 letterSpacing');
  const words = ['出遊']; // 字少：字的大小到頂，字距變大＝範圍變寬（字多時會縮小字去配合框）
  const a = await inkBox(page, 'hitline', 3.0, words, { letterEm: 0 });
  const b = await inkBox(page, 'hitline', 3.0, words, { letterEm: 0.3 });
  expect(b.w, '字距變大，字的範圍變寬').toBeGreaterThan(a.w * 1.02);
  // 一般的式子（用 measureText 排字）也吃到
  const c = await inkBox(page, 'burst', 1.2, ['環島公路', '一路向南'], { letterEm: 0 });
  const d = await inkBox(page, 'burst', 1.2, ['環島公路', '一路向南'], { letterEm: 0.4 });
  expect(d.w).toBeGreaterThan(c.w * 1.02);
});

test('Z34 行距：停在最後畫面（多行）行距 1.25 和 2.5，高度變高', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await waitHook(page);
  const words = ['環島', '出遊']; // 短詞：字高到頂（不是被框高限制住），行距變大＝整體變高
  // 流動的式子停在最後畫面：整句每個詞一行（drawRest）
  const a = await inkBox(page, 'led', 3.0, words, { lineK: 1 }, 1);
  const b = await inkBox(page, 'led', 3.0, words, { lineK: 1.4 }, 1);
  expect(b.h, '行距變大，整體變高').toBeGreaterThan(a.h * 1.08);
});
