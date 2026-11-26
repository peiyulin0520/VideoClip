import { expect, test } from '@playwright/test';
import { createProjectWith, waitHook } from './helpers';

// feedback-17 Z28：彎道〔停在最後畫面〕的收尾——一條長度固定的緞帶飛進來、隨風飄、繞回正中間變橫條。
// 直式畫面 360×640（手機）：用 kineticPaint 取不同時刻的圖，量白色（緞帶）像素與位置。
type Frame = {
  q: number;
  ink: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cx: number;
  cy: number;
};

const SETTLE = 2.8;
const HOLD = 3.6;

async function frames(
  page: import('@playwright/test').Page,
  W: number,
  H: number,
  words: string[],
  qs: number[],
) {
  return page.evaluate(
    async ([w, h, ws, list, settle, hold]) => {
      const hook = (
        window as unknown as {
          __videoclip: {
            kineticPaint: (
              id: string,
              t: number,
              W: number,
              H: number,
              words?: string[],
              settle?: number,
            ) => string | null;
          };
        }
      ).__videoclip;
      const out: unknown[] = [];
      const urls: string[] = [];
      for (const q of list as number[]) {
        const t = (hold as number) - (settle as number) * (1 - q);
        const url = hook.kineticPaint('path', t, w as number, h as number, ws as string[], q)!;
        urls.push(url);
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = w as number;
        c.height = h as number;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        // 底色＝左上角那一格；跟底色差很多的像素＝緞帶（含字）
        const br = d[0]!;
        const bg2 = d[1]!;
        const bb = d[2]!;
        let ink = 0;
        let x0 = 1e9;
        let x1 = -1;
        let y0 = 1e9;
        let y1 = -1;
        let sx = 0;
        let sy = 0;
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            if (Math.abs(d[i]! - br) + Math.abs(d[i + 1]! - bg2) + Math.abs(d[i + 2]! - bb) > 120) {
              ink++;
              sx += x;
              sy += y;
              x0 = Math.min(x0, x);
              x1 = Math.max(x1, x);
              y0 = Math.min(y0, y);
              y1 = Math.max(y1, y);
            }
          }
        out.push({ q, ink, x0, x1, y0, y1, cx: ink ? sx / ink : 0, cy: ink ? sy / ink : 0 });
      }
      return { out, urls };
    },
    [W, H, words, qs, SETTLE, HOLD] as const,
  ) as Promise<{ out: Frame[]; urls: string[] }>;
}

test('Z28 彎道收尾（直式 360×640）：緞帶長度固定、不出界、最後是正中間的橫條', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await waitHook(page);
  const qs = Array.from({ length: 41 }, (_, i) => i / 40);
  const { out, urls } = await frames(page, 360, 640, ['蔡氏家族聚餐'], qs);
  if (process.env.Z28_SHEET) {
    const fs = await import('node:fs');
    fs.mkdirSync(process.env.Z28_SHEET, { recursive: true });
    urls.forEach((u, i) =>
      fs.writeFileSync(
        `${process.env.Z28_SHEET}/q${String(i).padStart(2, '0')}.png`,
        Buffer.from(u.split(',')[1]!, 'base64'),
      ),
    );
  }
  const fin = out[out.length - 1]!;
  const problems: string[] = [];
  for (const f of out) {
    if (f.q < 0.35) continue;
    if (f.ink < fin.ink * 0.45 || f.ink > fin.ink * 1.3)
      problems.push(`q=${f.q} 白帶面積 ${f.ink}（最後 ${fin.ink}）：長度應該固定`);
    if (f.x0 <= 0 || f.x1 >= 359 || f.y0 <= 0 || f.y1 >= 639) problems.push(`q=${f.q} 碰到畫面邊緣`);
  }
  expect(problems).toEqual([]);
  // 停下來：正中間的橫條
  expect(Math.abs((fin.x0 + fin.x1) / 2 - 180)).toBeLessThan(4);
  expect(Math.abs((fin.y0 + fin.y1) / 2 - 320)).toBeLessThan(4);
  expect(fin.y1 - fin.y0).toBeLessThan(640 * 0.15);
  expect(fin.x1 - fin.x0).toBeGreaterThan(360 * 0.6);
  // 還沒開始收尾（q=0）：S 形帶子還在
  expect(out[0]!.ink).toBeGreaterThan(fin.ink);
  expect(out.length).toBe(41);
});
