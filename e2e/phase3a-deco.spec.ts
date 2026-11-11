import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { countColor, createProjectWith, openTab, project } from './helpers';

const SHOT = 'docs/screenshots/phase3a';

const decos = async (page: Page) =>
  (
    (await project(page)).tracks[1]!.items[0]!.card as unknown as {
      decorations?: { kind: string; color: string; width: number }[];
    }
  ).decorations ?? [];

const setRange = (page: Page, label: string, v: number) =>
  page.getByRole('slider', { name: label, exact: true }).evaluate((el, val) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(val));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);

test('裝飾面板：縮圖都有畫出來、點選加／拿掉、改顏色與粗細、可疊多個', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增文字/ }).tap();
  await page.getByLabel('文字內容').fill('尾端有圈圈');
  await page.getByRole('tab', { name: '裝飾', exact: true }).tap();

  // 13 種風格，每格的縮圖真的有畫東西（不是空白）
  const cells = page.getByTestId('deco-grid').locator('.deco-cell');
  await expect(cells).toHaveCount(13);
  const painted = await page.locator('.deco-thumb').evaluateAll((cvs) =>
    (cvs as HTMLCanvasElement[]).map((c) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
      return n;
    }),
  );
  expect(painted.every((n) => n > 300)).toBe(true);
  await page.screenshot({ path: `${SHOT}/deco-picker.png` });

  // 加尾端圈圈：預設桃紅色出現在預覽裡
  expect(await decos(page)).toEqual([]);
  await page.getByRole('button', { name: '裝飾 尾端圈圈' }).tap();
  expect(await decos(page)).toEqual([{ kind: 'tail-loop', color: '#E2006E', width: 0.15 }]);
  await expect.poll(() => countColor(page, [226, 0, 110], 30, [0.1, 0.35, 0.95, 0.75])).toBeGreaterThan(80);

  // 改顏色、粗細
  await page.getByRole('button', { name: '尾端圈圈顏色 #ffd23f' }).tap();
  await setRange(page, '尾端圈圈粗細', 8);
  expect((await decos(page))[0]).toMatchObject({ color: '#ffd23f', width: 0.08 });
  await expect.poll(() => countColor(page, [255, 210, 63], 30, [0.1, 0.35, 0.95, 0.75])).toBeGreaterThan(40);

  // 疊第二個（螢光筆）；兩個都在
  await page.getByRole('button', { name: '裝飾 螢光筆' }).tap();
  expect((await decos(page)).map((d) => d.kind)).toEqual(['tail-loop', 'marker']);
  await page.screenshot({ path: `${SHOT}/deco-two.png` });

  // 移除（列上的按鈕、再點格子）
  await page.getByRole('button', { name: '移除 螢光筆' }).tap();
  expect((await decos(page)).map((d) => d.kind)).toEqual(['tail-loop']);
  await page.getByRole('button', { name: '裝飾 尾端圈圈' }).tap();
  expect(await decos(page)).toEqual([]);

  // 每一種都點得動（加上去、再拿掉）
  for (let i = 0; i < 13; i++) {
    await cells.nth(i).tap();
    expect((await decos(page)).length).toBe(1);
    await cells.nth(i).tap();
    expect((await decos(page)).length).toBe(0);
  }
  // 復原：回到上一步
  await cells.nth(0).tap();
  await page.getByRole('button', { name: '復原' }).tap();
  expect(await decos(page)).toEqual([]);
});

test('驗收截圖：13 種裝飾總覽、尾端圈圈跟示意圖的樣子（短字／長字）', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await expect
    .poll(() => page.evaluate(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip))
    .toBe(true);
  const kinds = await page.evaluate(async () => {
    type Hook = { cardPng: (c: unknown, s: number, bg: string) => Promise<string> };
    const hook = (window as unknown as { __videoclip: Hook }).__videoclip;
    const defs = [
      ['tail-loop', 0.15, '#E2006E'],
      ['wave-underline', 0.07, '#ff4d8d'],
      ['dashed-underline', 0.06, '#4dd0ff'],
      ['dotted-underline', 0.09, '#ffd23f'],
      ['double-line', 0.05, '#ff4d8d'],
      ['marker', 1, '#ffe14d'],
      ['scribble-circle', 0.07, '#ff4d8d'],
      ['arrow-curve', 0.07, '#ffd23f'],
      ['sparkles', 1, '#ffd23f'],
      ['hearts', 1, '#ff4d8d'],
      ['slashes', 0.08, '#333333'],
      ['check', 0.12, '#2fb344'],
      ['corner-brackets', 0.06, '#333333'],
    ] as const;
    const mk = (text: string, kind: string, width: number, color: string) => ({
      align: 'center',
      runs: [
        {
          text,
          fontId: 'system',
          size: 120,
          color: '#222222',
          letterSpacing: 0,
          lineHeight: 1.2,
          weight: 'bold',
        },
      ],
      decorations: [{ kind, color, width }],
    });
    const out: string[] = [];
    for (const [k, w, c] of defs) out.push(await hook.cardPng(mk('好看的字', k, w, c), 0.8, '#ffffff'));
    out.push(await hook.cardPng(mk('尾端有圈圈', 'tail-loop', 0.15, '#E2006E'), 1.4, '#ffffff'));
    out.push(
      await hook.cardPng(
        mk('這是一句很長很長很長的字幕文字用來看圈圈', 'tail-loop', 0.15, '#E2006E'),
        0.6,
        '#ffffff',
      ),
    );
    return out;
  });
  const save = (name: string, dataUrl: string) =>
    fs.writeFileSync(`${SHOT}/${name}`, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
  save('tail-loop-short.png', kinds[13]!);
  save('tail-loop-long.png', kinds[14]!);
  // 總覽：用另一個頁面把 13 張圖排成一張
  const sheet = await page.evaluate(
    async (urls) => {
      const imgs = await Promise.all(
        urls.map(
          (u) =>
            new Promise<HTMLImageElement>((res) => {
              const i = new Image();
              i.onload = () => res(i);
              i.src = u;
            }),
        ),
      );
      const cols = 3;
      const cw = 420;
      const ch = 230;
      const rows = Math.ceil(imgs.length / cols);
      const cv = document.createElement('canvas');
      cv.width = cols * cw;
      cv.height = rows * ch;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      imgs.forEach((im, i) => {
        const k = Math.min((cw - 20) / im.width, (ch - 20) / im.height, 1);
        const x = (i % cols) * cw + (cw - im.width * k) / 2;
        const y = Math.floor(i / cols) * ch + (ch - im.height * k) / 2;
        ctx.drawImage(im, x, y, im.width * k, im.height * k);
      });
      return cv.toDataURL('image/png');
    },
    kinds.slice(0, 13),
  );
  save('decorations-sheet.png', sheet);
  expect(fs.statSync(`${SHOT}/decorations-sheet.png`).size).toBeGreaterThan(5000);
});

test('裝飾的「與文字距離」「大小」滑桿：資料與預覽都會變；波浪線變粗不會碰到字', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByLabel('文字內容').fill('吃飯');
  await page.getByRole('tab', { name: '裝飾', exact: true }).tap();
  await page.getByRole('button', { name: '裝飾 波浪底線' }).tap();
  // 波浪線粗細 25%、預設距離：線不會碰到字（用字下方到線上緣之間有藍色背景像素）
  await setRange(page, '波浪底線粗細', 25);
  const d = async () => (await decos(page))[0] as { gap?: number; scale?: number; width: number };
  expect((await d()).width).toBeCloseTo(0.25);
  await page.screenshot({ path: `${SHOT}/deco-wave-thick.png` });

  // 距離滑桿
  const shot = async () => countColor(page, [255, 77, 141], 40, [0.05, 0.3, 0.95, 0.75]);
  await expect.poll(shot).toBeGreaterThan(50); // 桃紅色波浪線在預覽上
  await setRange(page, '波浪底線與文字距離', 60);
  expect((await d()).gap).toBeCloseTo(0.6);
  await page.screenshot({ path: `${SHOT}/deco-wave-gap60.png` });
  await setRange(page, '波浪底線與文字距離', -30);
  expect((await d()).gap).toBeCloseTo(-0.3);

  // 愛心有「大小」，螢光筆的距離叫「上下位置」，粗細滑桿只在有線寬的裝飾出現
  await page.getByRole('button', { name: '裝飾 愛心' }).tap();
  await page.getByRole('button', { name: '裝飾 螢光筆' }).tap();
  await expect(page.getByRole('slider', { name: '愛心大小', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: '愛心粗細', exact: true })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: '螢光筆上下位置', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: '螢光筆粗細', exact: true })).toHaveCount(0);
  await setRange(page, '愛心大小', 150);
  const heart = (await decos(page)).find((x) => x.kind === 'hearts') as { scale?: number };
  expect(heart.scale).toBeCloseTo(1.5);
  await setRange(page, '螢光筆上下位置', 20);
  const mk = (await decos(page)).find((x) => x.kind === 'marker') as { gap?: number };
  expect(mk.gap).toBeCloseTo(0.2);
});
