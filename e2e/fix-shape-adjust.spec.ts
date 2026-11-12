import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { countColor, createProjectWith, legacyBox, openTab, project, regionHash } from './helpers';

const SHOT = 'docs/screenshots/fix-feedback-2';

type Box = { shape: string; adj?: Record<string, number>; tailDir?: string };
const boxOf = async (page: Page) =>
  ((await project(page)).tracks[1]!.items[0]!.card as unknown as { box?: Box }).box!;

const setRange = (page: Page, label: string, v: number) =>
  page.getByRole('slider', { name: label, exact: true }).evaluate((el, val) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(val));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);

async function startWithShape(page: Page, cat: string, shapeLabel: string) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByLabel('文字內容').fill('吃飯');
  await page.getByRole('tab', { name: '字塊', exact: true }).tap();
  if (cat !== '基本') await page.getByRole('button', { name: `圖形分類 ${cat}` }).tap();
  await page.getByRole('radio', { name: shapeLabel, exact: true }).tap();
  await legacyBox(page);
}

// 粉紅字塊在預覽中央的像素數（用來看圖形形狀有沒有變）
const pink = (page: Page) => countColor(page, [255, 77, 141], 30, [0.05, 0.25, 0.95, 0.75]);

test('雲朵：凹槽深度／圓滑／凸起數量可調，預覽跟著變，文字仍在圖形裡，可復原，換圖形回預設', async ({
  page,
}) => {
  await startWithShape(page, '基本', '雲朵');
  await expect.poll(() => pink(page)).toBeGreaterThan(300);
  const area: [number, number, number, number] = [0.05, 0.25, 0.95, 0.75];
  const baseHash = await regionHash(page, area);
  await expect(page.getByText('圖形調整（像 Office 的黃色調整點）')).toBeVisible();

  await setRange(page, '凹槽深度', 0);
  expect((await boxOf(page)).adj).toMatchObject({ depth: 0 });
  // 深度 0＝接近橢圓：畫面內容變了，而且字塊還在
  await expect.poll(async () => (await regionHash(page, area)) !== baseHash).toBe(true);
  expect(await pink(page)).toBeGreaterThan(300);
  await page.screenshot({ path: `${SHOT}/cloud-depth-0.png` });
  await setRange(page, '凹槽深度', 1);
  await expect.poll(async () => (await regionHash(page, area)) !== baseHash).toBe(true);
  expect(await pink(page)).toBeGreaterThan(200);
  await page.screenshot({ path: `${SHOT}/cloud-depth-1.png` });
  await setRange(page, '凹槽圓滑', 1);
  await setRange(page, '凸起數量', 12);
  expect((await boxOf(page)).adj).toMatchObject({ depth: 1, smooth: 1, count: 12 });
  // 文字（白色）仍在
  await expect
    .poll(() => countColor(page, [255, 255, 255], 40, [0.05, 0.25, 0.95, 0.75]))
    .toBeGreaterThan(30);

  // 復原：回到上一個調整值
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await boxOf(page)).adj).not.toMatchObject({ count: 12 });

  // 還原預設／換圖形：調整值清掉
  await page.getByRole('button', { name: '圖形調整還原預設' }).tap();
  expect((await boxOf(page)).adj).toBeUndefined();
  await setRange(page, '凹槽深度', 0.3);
  await page.getByRole('radio', { name: '橢圓', exact: true }).tap();
  expect((await boxOf(page)).adj).toBeUndefined();
  await expect(page.getByText('圖形調整（像 Office 的黃色調整點）')).toHaveCount(0);
});

test('星形：凹槽深度與角的圓滑；多邊形：角的圓滑；每個有調整項目的圖形都有滑桿', async ({ page }) => {
  await startWithShape(page, '星形', '五角星');
  for (const label of ['凹槽深度', '角的圓滑'])
    await expect(page.getByRole('slider', { name: label, exact: true })).toBeVisible();
  await setRange(page, '凹槽深度', 0.2);
  await setRange(page, '角的圓滑', 0.8);
  expect((await boxOf(page)).adj).toMatchObject({ depth: 0.2, round: 0.8 });
  await page.screenshot({ path: `${SHOT}/star-adjusted.png` });

  await page.getByRole('button', { name: '圖形分類 基本' }).tap();
  await page.getByRole('radio', { name: '六邊形', exact: true }).tap();
  await setRange(page, '角的圓滑', 1);
  expect((await boxOf(page)).adj).toEqual({ round: 1 });
  // 沒有調整項目的圖形（橢圓、愛心）不顯示調整區
  await page.getByRole('radio', { name: '愛心', exact: true }).tap();
  await expect(page.getByText('圖形調整（像 Office 的黃色調整點）')).toHaveCount(0);
});

test('對話框：尾巴位置／長度／寬度，左下右下快捷會重設位置', async ({ page }) => {
  await startWithShape(page, '對話框', '圓角對話框');
  await setRange(page, '尾巴位置', 0.8);
  await setRange(page, '尾巴長度', 0.6);
  await setRange(page, '尾巴寬度', 0.3);
  expect((await boxOf(page)).adj).toMatchObject({ tailPos: 0.8, tailLen: 0.6, tailWidth: 0.3 });
  await page.screenshot({ path: `${SHOT}/speech-tail-adjusted.png` });
  await page.getByRole('radio', { name: '尾巴在右下' }).tap();
  const b = await boxOf(page);
  expect(b.tailDir).toBe('bottom-right');
  expect(b.adj?.tailPos).toBeUndefined();
  expect(b.adj).toMatchObject({ tailLen: 0.6 }); // 其他調整值保留
  // 滑桿顯示 0.72（range 輸入會吸到 0.05 的格子上顯示 0.7），資料裡沒有 tailPos＝用預設
  const shown = Number(await page.getByRole('slider', { name: '尾巴位置', exact: true }).inputValue());
  expect(Math.abs(shown - 0.72)).toBeLessThan(0.04);
});

test('驗收截圖：同一個圖形三種調整值並排', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await expect
    .poll(() => page.evaluate(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip))
    .toBe(true);
  const png = await page.evaluate(async () => {
    type Hook = { cardPng: (c: unknown, s: number, bg: string) => Promise<string> };
    const hook = (window as unknown as { __videoclip: Hook }).__videoclip;
    const mk = (shape: string, adj?: Record<string, number>) => ({
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
        stroke: { color: '#222222', width: 4 },
        ...(adj ? { adj } : {}),
      },
    });
    const rows: [string, Record<string, number> | undefined][][] = [
      [
        ['cloud', { depth: 0 }],
        ['cloud', undefined],
        ['cloud', { depth: 1, smooth: 1 }],
        ['cloud', { count: 12, depth: 0.7, smooth: 0.5 }],
      ],
      [
        ['star5', { depth: 0.2 }],
        ['star5', undefined],
        ['star5', { depth: 0.9 }],
        ['star5', { depth: 0.4, round: 1 }],
      ],
      [
        ['hexagon', undefined],
        ['hexagon', { round: 0.5 }],
        ['hexagon', { round: 1 }],
        ['triangle', { round: 1 }],
      ],
      [
        ['speech-round', undefined],
        ['speech-round', { tailPos: 0.7, tailLen: 0.6 }],
        ['speech-round', { tailPos: 0.5, tailWidth: 0.4 }],
        ['speech-oval', { tailPos: 0.2, tailLen: 0.5 }],
      ],
    ];
    const imgs: HTMLImageElement[] = [];
    for (const row of rows)
      for (const [s, a] of row) {
        const url = await hook.cardPng(mk(s, a), 0.8, '#ffffff');
        imgs.push(
          await new Promise<HTMLImageElement>((res) => {
            const i = new Image();
            i.onload = () => res(i);
            i.src = url;
          }),
        );
      }
    const cols = 4,
      cw = 250,
      ch = 190;
    const cv = document.createElement('canvas');
    cv.width = cols * cw;
    cv.height = rows.length * ch;
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
  });
  fs.writeFileSync(`${SHOT}/shapes-adjust.png`, Buffer.from(png.split(',')[1]!, 'base64'));
  expect(fs.statSync(`${SHOT}/shapes-adjust.png`).size).toBeGreaterThan(5000);
});
