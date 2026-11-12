import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { clips, countColor, createProjectWith, legacyBox, openTab, project, setSwitch } from './helpers';

const SHOT = 'docs/screenshots/phase3a';

type Box = { shape: string; tailDir?: string; stroke?: { color: string; width: number } };
const boxOf = async (page: Page) =>
  ((await project(page)).tracks[1]!.items[0]!.card as unknown as { box?: Box }).box;

const setRange = (page: Page, label: string, v: number) =>
  page.getByRole('slider', { name: label, exact: true }).evaluate((el, val) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(val));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);

test('圖形庫：4 個分類、每個圖形都點得動、縮圖有畫、對話框尾巴方向、字塊外框', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByLabel('文字內容').fill('哈囉你好');
  await page.getByRole('tab', { name: '字塊', exact: true }).tap();

  const cats = ['基本', '對話框', '星形', '標籤箭頭'];
  let total = 0;
  for (const c of cats) {
    await page.getByRole('button', { name: `圖形分類 ${c}` }).tap();
    const cells = page.getByTestId('shape-grid').locator('.shape-cell');
    const n = await cells.count();
    expect(n).toBeGreaterThanOrEqual(5);
    total += n;
    // 縮圖真的有畫東西
    const painted = await page.locator('.shape-thumb').evaluateAll((cvs) =>
      (cvs as HTMLCanvasElement[]).map((cv) => {
        const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
        let k = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) k++;
        return k;
      }),
    );
    expect(painted.every((k) => k > 300)).toBe(true);
    if (c === '星形') await page.screenshot({ path: `${SHOT}/shape-picker-stars.png` });
    // 每一格都點得動，資料裡的 shape 對得上
    for (let i = 0; i < n; i++) {
      const id = await cells.nth(i).getAttribute('data-shape');
      await cells.nth(i).tap();
      expect((await boxOf(page))!.shape).toBe(id);
      await expect(cells.nth(i)).toHaveAttribute('aria-checked', 'true');
    }
  }
  expect(total).toBeGreaterThanOrEqual(30);

  // 對話框：尾巴方向
  await page.getByRole('button', { name: '圖形分類 對話框' }).tap();
  await page.getByRole('radio', { name: '圓角對話框' }).tap();
  await page.getByRole('radio', { name: '尾巴在右下' }).tap();
  expect((await boxOf(page))!.tailDir).toBe('bottom-right');
  await page.getByRole('radio', { name: '尾巴在左下' }).tap();
  expect((await boxOf(page))!.tailDir).toBe('bottom-left');
  await page.screenshot({ path: `${SHOT}/speech-bubble.png` });

  // 字塊外框
  await legacyBox(page);
  await setSwitch(page, '框線', true);
  expect((await boxOf(page))!.stroke).toMatchObject({ width: 4 });
  await setRange(page, '框線粗細', 6);
  expect((await boxOf(page))!.stroke).toMatchObject({ width: 6 });
  await page.getByRole('button', { name: '字塊外框顏色 #111111' }).tap();
  expect((await boxOf(page))!.stroke).toMatchObject({ color: '#111111', width: 6 });
  await page.getByRole('switch', { name: '框線' }).tap();
  expect((await boxOf(page))!.stroke).toBeUndefined();

  // 換成星形：字塊顏色出現在預覽，文字仍在（白色字在粉紅星星裡）
  await page.getByRole('button', { name: '圖形分類 星形' }).tap();
  await page.getByRole('radio', { name: '五角星' }).tap();
  await expect.poll(() => countColor(page, [255, 77, 141], 30, [0.1, 0.3, 0.9, 0.7])).toBeGreaterThan(300);
  await expect.poll(() => countColor(page, [255, 255, 255], 40, [0.1, 0.3, 0.9, 0.7])).toBeGreaterThan(30);
});

test('獨立圖形：新增、用內距調大小、時間軸顯示「圖形」、文字面板仍可改', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增圖形/ }).tap();
  await expect(page.locator('[data-testid="clip"][data-kind="text"]')).toContainText('圖形');
  const cardOf = async () =>
    (await project(page)).tracks[1]!.items[0]!.card as unknown as { box: { shape: string } };
  expect((await cardOf()).box.shape).toBe('star5');
  // 預設透明底＋棕色框線；打開填滿才有黃色星星
  expect((await cardOf()).box).toMatchObject({ fillOn: false });
  await page.getByRole('tab', { name: '字塊', exact: true }).tap();
  await setSwitch(page, '填滿', true);
  await expect.poll(() => countColor(page, [255, 210, 63], 30, [0.2, 0.3, 0.8, 0.7])).toBeGreaterThan(300);
  await page.getByRole('tab', { name: '字塊', exact: true }).tap();
  await page.getByRole('button', { name: '圖形分類 基本' }).tap();
  await page.getByRole('radio', { name: '愛心' }).tap();
  await setRange(page, '內距 上', 150);
  await expect.poll(async () => (await cardOf()).box.shape).toBe('heart');
  await page.screenshot({ path: `${SHOT}/standalone-heart.png` });
  // 在字塊分頁再加第二個獨立圖形
  await page.getByRole('button', { name: /另外新增一個獨立圖形/ }).tap();
  await expect(clips(page)).toHaveCount(3);
});

test('驗收截圖：每個圖形裡放「文字」的總覽', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await expect
    .poll(() => page.evaluate(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip))
    .toBe(true);
  // 用 UI 取得全部 id：逐一展開分類讀 data-shape
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByRole('tab', { name: '字塊', exact: true }).tap();
  const all: string[] = [];
  for (const c of ['基本', '對話框', '星形', '標籤箭頭']) {
    await page.getByRole('button', { name: `圖形分類 ${c}` }).tap();
    all.push(
      ...(await page
        .locator('.shape-cell')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-shape')!))),
    );
  }
  const png = await page.evaluate(async (shapes) => {
    type Hook = { cardPng: (c: unknown, s: number, bg: string) => Promise<string> };
    const hook = (window as unknown as { __videoclip: Hook }).__videoclip;
    const mk = (shape: string) => ({
      align: 'center',
      runs: [
        {
          text: '好看',
          fontId: 'system',
          size: 70,
          color: '#ffffff',
          letterSpacing: 0,
          lineHeight: 1.2,
          weight: 'bold',
        },
      ],
      box: {
        shape,
        fill: '#ff4d8d',
        opacity: 1,
        padding: { top: 14, right: 22, bottom: 14, left: 22 },
        nudgeY: 0,
        radius: 24,
        stroke: { color: '#222222', width: 4 },
      },
    });
    const imgs: HTMLImageElement[] = [];
    for (const s of shapes) {
      const url = await hook.cardPng(mk(s), 0.8, '#ffffff');
      imgs.push(
        await new Promise<HTMLImageElement>((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.src = url;
        }),
      );
    }
    const cols = 6;
    const cw = 200;
    const ch = 170;
    const cv = document.createElement('canvas');
    cv.width = cols * cw;
    cv.height = Math.ceil(imgs.length / cols) * ch;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    imgs.forEach((im, i) => {
      const k = Math.min((cw - 16) / im.width, (ch - 16) / im.height, 1);
      ctx.drawImage(
        im,
        (i % cols) * cw + (cw - im.width * k) / 2,
        Math.floor(i / cols) * ch + (ch - im.height * k) / 2,
        im.width * k,
        im.height * k,
      );
    });
    return cv.toDataURL('image/png');
  }, all);
  fs.writeFileSync(`${SHOT}/shapes-sheet.png`, Buffer.from(png.split(',')[1]!, 'base64'));
  expect(all.length).toBeGreaterThanOrEqual(30);
});
