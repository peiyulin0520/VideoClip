import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createProjectWith, waitHook } from './helpers';

// 動態字卡跟原版並排比對（不是一般測試：要設 KINETIC_COMPARE=1 才會跑；輸出到 .kinetic-compare/，之後用 scripts/kinetic-compare.py 拼成對照圖）
// KINETIC_IDS=burst,hit 只比對指定的幾式；沒設就比對目前已改寫好的全部。
const ON = !!process.env.KINETIC_COMPARE;
const OUT = path.resolve(process.cwd(), '.kinetic-compare');
const ORIG = path.resolve(process.cwd(), 'docs/reference/claude-animated-text/index.html');
const W = 960;
const H = 540;
const TIMES = (id: string, poster: number) => [
  poster,
  poster + 0.5,
  poster + 1.1,
  poster + 2.3,
  poster + 3.7,
];

test('動態字卡跟原版並排比對（畫面）', async ({ page, browser }) => {
  test.skip(!ON, '設 KINETIC_COMPARE=1 才跑');
  test.setTimeout(600_000);
  fs.mkdirSync(OUT, { recursive: true });
  await createProjectWith(page, ['solid-blue.webm']);
  await waitHook(page);
  const list = (await page.evaluate(() =>
    (
      window as unknown as { __videoclip: { kineticList: () => { id: string; poster: number }[] } }
    ).__videoclip.kineticList(),
  )) as { id: string; poster: number }[];
  const only = process.env.KINETIC_IDS?.split(',');
  const ids = list.filter((f) => !only || only.includes(f.id));
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const orig = await ctx.newPage();
  await orig.goto('file://' + ORIG);
  await orig.waitForFunction(() => !!(window as unknown as { __tm?: unknown }).__tm);
  for (const f of ids) {
    const ts = TIMES(f.id, f.poster);
    // 原版：整頁就是舞台
    await orig.evaluate(
      (id) => (window as unknown as { __tm: { open: (id: string) => void } }).__tm.open(id),
      f.id,
    );
    for (const [i, t] of ts.entries()) {
      await orig.evaluate(
        (tt) => (window as unknown as { __tm: { at: (t: number) => void } }).__tm.at(tt),
        t,
      );
      await orig.screenshot({ path: path.join(OUT, `${f.id}-${i}-orig.png`) });
    }
    // 我們的
    for (const [i, t] of ts.entries()) {
      const url = (await page.evaluate(
        ([id, tt, w, h]) =>
          (
            window as unknown as { __videoclip: { kineticPaint: (...a: unknown[]) => string } }
          ).__videoclip.kineticPaint(id as string, tt as number, w as number, h as number),
        [f.id, t, W, H] as const,
      )) as string;
      fs.writeFileSync(path.join(OUT, `${f.id}-${i}-ours.png`), Buffer.from(url.split(',')[1]!, 'base64'));
    }
  }
  fs.writeFileSync(path.join(OUT, 'ids.json'), JSON.stringify(ids.map((f) => f.id)));
});
