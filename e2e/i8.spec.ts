import { expect, test } from '@playwright/test';
import { clips, createProjectWith, project, seekTo } from './helpers';

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

type Th = { id: string; kind: string; thumbs: string[]; thumbsFull?: boolean };
const videoAsset = async (page: import('@playwright/test').Page) =>
  ((await project(page)).assets as unknown as Th[]).find((a) => a.kind === 'video')!;
const rgbOf = (page: import('@playwright/test').Page, url: string) =>
  page.evaluate(async (u) => {
    const img = new Image();
    img.src = u;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    return Array.from(g.getImageData(img.width >> 1, img.height >> 1, 1, 1).data);
  }, url);

test('縮圖每 2 秒一張：匯入後在背景補滿（90 秒＝45 張，前紅後藍），時間軸每一格依時間顯示不同畫面', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['long-90s.webm']);
  await expect.poll(async () => (await videoAsset(page)).thumbsFull, { timeout: 60_000 }).toBe(true);
  const a = await videoAsset(page);
  expect(a.thumbs).toHaveLength(45);
  expect((await rgbOf(page, a.thumbs[2]!))[0]!).toBeGreaterThan(180); // 前面紅
  expect((await rgbOf(page, a.thumbs[40]!))[2]!).toBeGreaterThan(180); // 後面藍
  // 時間軸：中段（約 20 秒）的格子是紅、70 秒的格子是藍（不是每一格都一樣）
  const bgAt = (sec: number) =>
    clips(page)
      .first()
      .evaluate((el, s) => {
        const spans = Array.from(el.querySelectorAll<HTMLElement>('.tiles span'));
        const clipLeft = el.getBoundingClientRect().left;
        const hit = spans.find((sp) => {
          const r = sp.getBoundingClientRect();
          return clipLeft + s * 60 >= r.left && clipLeft + s * 60 < r.right;
        })!;
        return hit.style.backgroundImage;
      }, sec);
  const urlOf = (bg: string) =>
    bg.slice(bg.indexOf('(') + 1, bg.lastIndexOf(')')).replace(/^["']|["']$/g, '');
  expect((await rgbOf(page, urlOf(await bgAt(20))))[0]!).toBeGreaterThan(180);
  expect((await rgbOf(page, urlOf(await bgAt(70))))[2]!).toBeGreaterThan(180);
});

test('舊專案（縮圖只剩 1 張、沒有補滿的記號）：重新打開後背景補滿', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['long-90s.webm']);
  await expect.poll(async () => (await videoAsset(page)).thumbsFull, { timeout: 60_000 }).toBe(true);
  const id = (await videoAsset(page)).id;
  await page.evaluate(
    (assetId) =>
      (window as unknown as { __videoclip: { legacyThumbs: (a: string) => void } }).__videoclip.legacyThumbs(
        assetId,
      ),
    id,
  );
  expect((await videoAsset(page)).thumbs).toHaveLength(1);
  await page.waitForTimeout(1500); // 自動儲存
  await page.reload();
  await expect.poll(async () => (await videoAsset(page)).thumbsFull, { timeout: 60_000 }).toBe(true);
  expect((await videoAsset(page)).thumbs).toHaveLength(45);
});

test('縮圖補不到的備用：播放到哪裡就把那一格補上（其他格先用最近的舊縮圖頂著）', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['long-90s.webm']);
  await expect.poll(async () => (await videoAsset(page)).thumbsFull, { timeout: 60_000 }).toBe(true);
  const id = (await videoAsset(page)).id;
  await page.evaluate(
    (assetId) =>
      (window as unknown as { __videoclip: { legacyThumbs: (a: string) => void } }).__videoclip.legacyThumbs(
        assetId,
      ),
    id,
  );
  expect((await videoAsset(page)).thumbs).toHaveLength(1); // 只有紅色那一張
  await seekTo(page, 60); // 第 60 秒（藍色）
  await page.getByRole('button', { name: '播放' }).tap();
  await expect.poll(async () => (await videoAsset(page)).thumbs.length, { timeout: 20_000 }).toBe(45);
  const a = await videoAsset(page);
  expect((await rgbOf(page, a.thumbs[30]!))[2]!).toBeGreaterThan(180); // 第 60 秒那一格是藍色
  expect((await rgbOf(page, a.thumbs[2]!))[0]!).toBeGreaterThan(180); // 其他格先用舊的紅色頂著
  expect(a.thumbsFull).toBeFalsy();
});
