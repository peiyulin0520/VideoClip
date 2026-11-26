import { expect, test } from '@playwright/test';
import { closePanel, createProjectWith, pressPlay, samplePreview, seekTo, waitHook } from './helpers';

// feedback-17 Z27：iPhone 的 play() 要好幾百毫秒才真的動（這裡用 setPlayLatency 模擬）。
// 後一段 B 轉場後不能「又播一次」：素材畫面亮度隨時間變亮（亮度 ≈ 60 × 素材秒數），往回跳＝亮度變暗。
type Hook = {
  setSeam: (d: number, b?: number, a?: number) => void;
  setPlayLatency: (ms: number) => void;
  time: () => number;
  framesState: () => { ready: number; total: number };
  stats: () => {
    transition: { hardSeeks: number; lat: number; resync: number; handCached: number; handBack: number };
  };
};
const hook = <T>(page: import('@playwright/test').Page, f: (h: Hook) => T) =>
  page.evaluate(
    (src) =>
      new Function('h', `return (${src})(h)`)((window as unknown as { __videoclip: Hook }).__videoclip),
    f.toString(),
  );

const lum = (c: number[] | null) => (c ? (c[0] + c[1] + c[2]) / 3 : -1);

async function run(page: import('@playwright/test').Page, latency: number) {
  await createProjectWith(page, ['ramp-a.webm', 'ramp-b.webm']); // 各 4 秒
  await waitHook(page);
  await hook(page, (h) => h.setSeam(1)); // 疊化 1 秒、置中：3.5–4.5
  await closePanel(page);
  await expect
    .poll(() => hook(page, (h) => h.framesState().ready), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
  await hook(page, (h) => h.setPlayLatency(400)); // 先設成 400（量測用），下面再依 latency 參數
  if (latency !== 400)
    await page.evaluate(
      (ms) => (window as never as { __videoclip: Hook }).__videoclip.setPlayLatency(ms),
      latency,
    );
  await seekTo(page, 2.4);
  await page.waitForTimeout(500);
  await pressPlay(page);
  const seq: { t: number; l: number; hb: number; vt: number[] }[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    const [c, time, hb] = await Promise.all([
      samplePreview(page, 0.5, 0.5),
      hook(page, (h) => h.time()),
      hook(page, (h) => h.stats().transition.handBack),
    ]);
    const vt = process.env.Z27_DUMP
      ? await page.evaluate(() =>
          Array.from(document.querySelectorAll('video'))
            .filter((v) => v.dataset.itemId && !v.paused)
            .map((v) => +v.currentTime.toFixed(2)),
        )
      : [];
    if (time >= 4.6 && time <= 7.0) seq.push({ t: time, l: lum(c), hb, vt });
    if (time >= 7.0) break;
    await page.waitForTimeout(30);
  }
  return seq;
}

test('Z27 起跑延遲 400ms：轉場後 2 秒內，B 的畫面亮度不會往回降（沒有「又播一次」）', async ({ page }) => {
  test.setTimeout(120_000);
  const seq = await run(page, 400);
  expect(seq.length, '轉場後有取到畫面').toBeGreaterThan(20);
  const back: string[] = [];
  let top = -1;
  for (const { t, l } of seq) {
    if (l < 0) continue;
    if (top >= 0 && l < top - 9)
      back.push(`${t.toFixed(2)} 亮度 ${l.toFixed(0)}（前面最亮 ${top.toFixed(0)}）`);
    top = Math.max(top, l);
  }
  if (process.env.Z27_DUMP)
    console.log(
      JSON.stringify(
        seq.map((x) => [+x.t.toFixed(2), Math.round(x.l), Math.round(60 * (x.t - 4)), x.hb, x.vt]),
      ),
      JSON.stringify(await hook(page, (h) => h.stats().transition)),
    );
  expect(back, '亮度往回降＝畫面往回跳（重播）').toEqual([]);
  // 畫的是對的那一秒：亮度 ≈ 60 × (時間 − 4)，誤差在 0.5 秒內
  const off = seq.filter((x) => x.l >= 0 && Math.abs(x.l - 60 * (x.t - 4)) > 32);
  expect(
    off.map((x) => `${x.t.toFixed(2)}:${x.l.toFixed(0)}`),
    '畫面跟時間差不到 0.5 秒',
  ).toEqual([]);
  const s = await hook(page, (h) => h.stats().transition);
  expect(s.lat, '量到起跑延遲').toBeGreaterThan(100);
  // Z29：接縫那一刻後一段的 <video> 已經在播、時間差不多對上；沒有被「停在第一格」暫停
  const m = /paused=(\w+).*時間 ([\d.]+) 目標 ([\d.]+)/.exec(s.bSeam);
  expect(m, `接縫狀態：${s.bSeam}`).not.toBeNull();
  expect(m![1], '接縫那一刻後一段的影片在播').toBe('false');
  expect(Math.abs(Number(m![2]) - Number(m![3])), '接縫時影片時間跟目標差不到 0.25 秒').toBeLessThan(0.25);
  expect(s.bPauses, '後一段影片沒有被 hold 暫停').not.toMatch(/hold/);
});
