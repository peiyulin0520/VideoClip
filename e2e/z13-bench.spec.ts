import { test } from '@playwright/test';
import { createProjectWith, finishLayout, fixture, openTab, pressPlay, seekTo, waitHook } from './helpers';

// feedback-15 Z13：預覽變順的量測（不是一般測試：Z13_BENCH=1 才跑；結果印在終端機）
// 場景＝使用者截圖：主軌一支影片＋傾斜的版型（兩格各一支影片），清楚畫質。看「合成」花在準備、繪製、等 GPU 哪一段。
type Stats = {
  fps: number;
  renderMs: number;
  buildMs: number;
  compMs: number;
  uploadMs: number;
  prepMs: number;
  drawMs: number;
  gpuMs: number;
  renders: number;
  skipped: number;
  canvas: string;
};
test('Z13 合成各段花多少', async ({ page }) => {
  test.skip(!process.env.Z13_BENCH, '設 Z13_BENCH=1 才跑');
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem('vc-preview-quality', 'clear');
    localStorage.setItem('vc-perf', '1');
  });
  await createProjectWith(page, ['big-1080p.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('clip-a.webm'), fixture('clip-b.webm')]);
  await waitHook(page);
  const run = async (label: string) => {
    await seekTo(page, 0.1);
    await pressPlay(page);
    await page.waitForTimeout(3500);
    const s = await page.evaluate(() =>
      (window as unknown as { __videoclip: { stats: () => Stats } }).__videoclip.stats(),
    );
    await page.getByRole('button', { name: '暫停', exact: true }).tap();
    const f = (n: number) => n.toFixed(1);
    console.log(
      `Z13 ${label}: ${s.canvas} fps ${f(s.fps)} 每格 ${f(s.renderMs)} 場景 ${f(s.buildMs)} 合成 ${f(s.compMs)} = 準備 ${f(s.prepMs)} 繪製 ${f(s.drawMs)} 等GPU ${f(s.gpuMs)} 上傳 ${f(s.uploadMs)} 畫了 ${s.renders} 跳過 ${s.skipped}`,
    );
  };
  if (process.env.Z13_PROFILE) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await page.evaluate(() =>
      (window as unknown as { __videoclip: { rotateFrame: (d: number) => void } }).__videoclip.rotateFrame(8),
    );
    await cdp.send('Profiler.start');
    await run('傾斜 8°（量 CPU）');
    const { profile } = (await cdp.send('Profiler.stop')) as {
      profile: {
        nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }[];
        samples: number[];
        timeDeltas: number[];
      };
    };
    const self = new Map<number, number>();
    profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
    const byFn = new Map<string, number>();
    for (const n of profile.nodes) {
      const k = `${n.callFrame.functionName || '(匿名)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
      byFn.set(k, (byFn.get(k) ?? 0) + (self.get(n.id) ?? 0));
    }
    const total = [...byFn.values()].reduce((a, b) => a + b, 0);
    const top = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    for (const [k, v] of top) console.log(`Z13P ${((v / total) * 100).toFixed(1)}% ${k}`);
    return;
  }
  await run('不傾斜');
  await page.evaluate(() =>
    (window as unknown as { __videoclip: { rotateFrame: (d: number) => void } }).__videoclip.rotateFrame(8),
  );
  await run('傾斜 8°');
});
