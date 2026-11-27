import { expect, test } from '@playwright/test';
import { createProjectWith, waitHook } from './helpers';

// feedback-17 Z30：彎道從頭到尾只有一條寫著一遍字的緞帶——平常沿著 S 形從左滑到右，〔停在最後畫面〕時（第一輪滑到一半）
// 照原方向、原速度離開、繞畫面一圈、停在正中間拉直。直式畫面 360×640：用 kineticPaint 每 1/60 秒取一張，量白色（緞帶）。
type Frame = {
  t: number;
  ink: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cx: number;
  cy: number;
};

const SETTLE = 2.3;
const HOLD = 0.9 + SETTLE;

async function frames(
  page: import('@playwright/test').Page,
  W: number,
  H: number,
  words: string[],
  ts: number[],
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
      for (const t of list as number[]) {
        const q = Math.min(
          Math.max((t - ((hold as number) - (settle as number))) / (settle as number), 0),
          1,
        );
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
        out.push({ t, ink, x0, x1, y0, y1, cx: ink ? sx / ink : 0, cy: ink ? sy / ink : 0 });
      }
      return { out, urls };
    },
    [W, H, words, ts, SETTLE, HOLD] as const,
  ) as Promise<{ out: Frame[]; urls: string[] }>;
}

test('Z30 彎道（直式 360×640）：只有一條寫一遍字的緞帶、長度固定、流動收尾接得上、最後是正中間的橫條', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await waitHook(page);
  const ts = Array.from({ length: Math.round(HOLD * 60) + 1 }, (_, i) => i / 60);
  const { out, urls } = await frames(page, 360, 640, ['週末一起出遊'], ts);
  if (process.env.Z28_SHEET) {
    const fs = await import('node:fs');
    fs.mkdirSync(process.env.Z28_SHEET, { recursive: true });
    urls.forEach((u, i) => {
      if (i % 6 === 0)
        fs.writeFileSync(
          `${process.env.Z28_SHEET}/f${String(i).padStart(3, '0')}.png`,
          Buffer.from(u.split(',')[1]!, 'base64'),
        );
    });
  }
  const fin = out[out.length - 1]!;
  const problems: string[] = [];
  for (const f of out) {
    if (f.t < 0.6) continue; // 一開始緞帶還在畫面外滑進來
    if (f.ink < fin.ink * 0.5 || f.ink > fin.ink * 1.3)
      problems.push(`t=${f.t.toFixed(2)} 白帶面積 ${f.ink}（最後 ${fin.ink}）：長度應該固定`);
    if (f.y0 < 640 * 0.12 || f.y1 > 640 * 0.88) problems.push(`t=${f.t.toFixed(2)} 跑出中間 60% 的範圍`);
    if (f.t > 0.9 + 0.3 && (f.x0 <= 0 || f.x1 >= 359))
      problems.push(`t=${f.t.toFixed(2)} 收尾時碰到畫面左右邊緣`);
  }
  expect(problems.slice(0, 6)).toEqual([]);
  // 連續兩格（1/60 秒）中心移動量、以及移動量的變化（速度）都不能突然跳（Z30：流動→收尾接得上）
  const speeds: number[] = [];
  for (let i = 1; i < out.length; i++)
    speeds.push(Math.hypot(out[i]!.cx - out[i - 1]!.cx, out[i]!.cy - out[i - 1]!.cy));
  const jumps: string[] = [];
  for (let i = 25; i < out.length; i++) {
    if (speeds[i - 1]! > 360 * 0.05)
      jumps.push(`t=${out[i]!.t.toFixed(2)} 一格移 ${speeds[i - 1]!.toFixed(1)}px`);
    if (i > 26 && Math.abs(speeds[i - 1]! - speeds[i - 2]!) > 360 * 0.012)
      jumps.push(
        `t=${out[i]!.t.toFixed(2)} 速度突變 ${speeds[i - 2]!.toFixed(1)}→${speeds[i - 1]!.toFixed(1)}`,
      );
  }
  expect(jumps.slice(0, 6)).toEqual([]);
  // 停下來：正中間的橫條
  expect(Math.abs((fin.x0 + fin.x1) / 2 - 180)).toBeLessThan(4);
  expect(Math.abs((fin.y0 + fin.y1) / 2 - 320)).toBeLessThan(4);
  expect(fin.y1 - fin.y0).toBeLessThan(640 * 0.15);
  expect(fin.x1 - fin.x0).toBeGreaterThan(360 * 0.6);
});
