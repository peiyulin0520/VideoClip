import { expect, test } from '@playwright/test';
import { clips, createProjectWith } from './helpers';

test('長影片（90 秒）：時間軸縮圖一路鋪滿到結尾（1 分鐘之後不是空白），而且後半段是藍色的縮圖', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['long-90s.webm']);
  const clip = clips(page).first();
  await expect(clip.locator('.tiles span').first()).toBeVisible({ timeout: 20_000 });
  const info = await clip.evaluate((el) => {
    const spans = Array.from(el.querySelectorAll<HTMLElement>('.tiles span'));
    const sum = spans.reduce((n, s) => n + s.getBoundingClientRect().width, 0);
    return {
      n: spans.length,
      sum,
      clipW: (el as HTMLElement).getBoundingClientRect().width,
      lastBg: spans[spans.length - 1]!.style.backgroundImage,
      firstBg: spans[0]!.style.backgroundImage,
    };
  });
  expect(info.clipW).toBeGreaterThan(3600); // 90 秒 × 60px＝5400px，超過以前 120 格 × 30px 的 3600px
  expect(info.sum).toBeGreaterThanOrEqual(info.clipW - 2); // 縮圖鋪滿整個片段
  expect(info.lastBg).toContain('url(');
  // 取最後一格、第一格縮圖的中心顏色：前面紅、後面藍
  const colorOf = (bg: string) =>
    page.evaluate(async (b) => {
      const url = b.slice(b.indexOf('(') + 1, b.lastIndexOf(')')).replace(/^["']|["']$/g, '');
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return Array.from(g.getImageData(img.width >> 1, img.height >> 1, 1, 1).data);
    }, bg);
  const first = await colorOf(info.firstBg);
  const last = await colorOf(info.lastBg);
  expect(first[0]!).toBeGreaterThan(180); // 紅
  expect(last[2]!).toBeGreaterThan(180); // 藍
  expect(last[0]!).toBeLessThan(80);
});
