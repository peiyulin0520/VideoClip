import { test } from '@playwright/test';
import fs from 'node:fs';
import { createProjectWith, waitHook } from './helpers';

// 動態字卡「停在最後畫面」要停在哪一刻：量每一式第一個詞那一輪每個時間點的墨量，取「墨量接近最大」那一段的中間，換成一輪的比例。
// 不是一般測試：KINETIC_HOLD=1 才跑，結果印出 JSON（貼進 src/engine/kinetic/hold.ts）。
test('動態字卡完整呈現的時間（比例）', async ({ page }) => {
  test.skip(!process.env.KINETIC_HOLD, '設 KINETIC_HOLD=1 才跑');
  test.setTimeout(300_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await waitHook(page);
  const rows = (await page.evaluate(() =>
    (
      window as unknown as {
        __videoclip: { kineticInk: () => { id: string; cycle: number; series: number[] }[] };
      }
    ).__videoclip.kineticInk(),
  )) as { id: string; cycle: number; series: number[] }[];
  const out: Record<string, number> = {};
  const dbg: string[] = [];
  for (const r of rows) {
    const max = Math.max(...r.series);
    const idx = r.series
      .map((v, i) => [v, i] as const)
      .filter(([v]) => v >= 0.92 * max)
      .map(([, i]) => i);
    const med = idx[Math.floor(idx.length / 2)] ?? 0;
    out[r.id] = Math.round((med / (r.series.length - 1)) * 100) / 100;
    dbg.push(`${r.id}:max=${max.toFixed(3)} n=${idx.length} f=${out[r.id]}`);
  }
  fs.writeFileSync(process.env.KINETIC_HOLD_OUT ?? '/tmp/kinetic-hold.json', JSON.stringify(out, null, 1));
  console.log('HOLD ' + dbg.join('\n'));
});
