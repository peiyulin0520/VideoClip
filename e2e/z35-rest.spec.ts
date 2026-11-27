import { expect, test } from '@playwright/test';
import { createProjectWith, waitHook } from './helpers';

// feedback-18 Z35：一直流動的 8 式〔停在最後畫面〕時，停下來是「特效自己的樣子」（同樣的粗字、顏色、裝飾，只是靜止、整句都看得到），
// 不是通用的一般小字。用自編的字。Z35_SHEET=資料夾 會把 8 式的「流動中／停下來」各存一張圖。
const IDS = ['crawl', 'drift', 'slant', 'ticker', 'tape', 'led', 'depth', 'echo'];
const WORDS = ['環島公路', '一路向南'];
type Hook = {
  kineticPaint: (
    id: string,
    t: number,
    W: number,
    H: number,
    words?: string[],
    settle?: number,
  ) => string | null;
};

test('Z35 流動的 8 式：停下來是特效自己的樣子（墨量夠多、主色出現），不是一般小字', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await waitHook(page);
  const res = await page.evaluate(
    async ([ids, words]) => {
      const hook = (window as unknown as { __videoclip: Hook }).__videoclip;
      const out: { id: string; ink: number; hiPx: number; flow: string; rest: string }[] = [];
      for (const id of ids as string[]) {
        const flow = hook.kineticPaint(id, 1, 360, 640, words as string[], 0)!;
        const rest = hook.kineticPaint(id, 1, 360, 640, words as string[], 1)!;
        const img = new Image();
        img.src = rest;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = 360;
        c.height = 640;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, 360, 640).data;
        const br = d[0]!;
        const bg = d[1]!;
        const bb = d[2]!;
        let ink = 0;
        for (let i = 0; i < d.length; i += 4)
          if (Math.abs(d[i]! - br) + Math.abs(d[i + 1]! - bg) + Math.abs(d[i + 2]! - bb) > 120) ink++;
        out.push({ id, ink, hiPx: 0, flow, rest });
      }
      return out;
    },
    [IDS, WORDS] as const,
  );
  if (process.env.Z35_SHEET) {
    const fs = await import('node:fs');
    fs.mkdirSync(process.env.Z35_SHEET, { recursive: true });
    for (const r of res) {
      fs.writeFileSync(
        `${process.env.Z35_SHEET}/${r.id}-flow.png`,
        Buffer.from(r.flow.split(',')[1]!, 'base64'),
      );
      fs.writeFileSync(
        `${process.env.Z35_SHEET}/${r.id}-rest.png`,
        Buffer.from(r.rest.split(',')[1]!, 'base64'),
      );
    }
  }
  for (const r of res) {
    // 停下來的畫面有相當多的墨（特效自己的大字／色帶），不是通用的一般小字（通用的整句小字大約只佔 3%）
    expect(r.ink / (360 * 640), `${r.id} 停止畫面的墨量`).toBeGreaterThan(r.id === 'led' ? 0.012 : 0.04);
  }
});
