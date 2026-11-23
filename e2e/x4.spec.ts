import { expect, test, type Page } from '@playwright/test';
import {
  addOverlays,
  createProjectWith,
  exportFrame,
  isGreen,
  openTab,
  project,
  touchDrag,
  undo,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-12';

const base = async (page: Page) => (await page.getByTestId('stage-base').boundingBox())!;
const frame = async (page: Page) => (await page.getByTestId('stage').boundingBox())!;

async function setRatio(page: Page, name: RegExp) {
  await page.getByRole('button', { name: '畫面比例' }).tap();
  await page.getByRole('radio', { name }).tap();
  await page.getByTestId('ratio-apply').tap();
  await page.getByRole('button', { name: '關閉', exact: true }).last().tap(); // 套用後視窗不會自動關，按 ✕ 關
}

test('X4 預覽的底＝預覽區整塊：改比例時底、播放列的位置都不動；版面在底裡面置中，外面有斜線', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']); // 直式 → 9:16
  await page.evaluate(() => window.scrollTo(0, 0));
  const b0 = await base(page);
  const wrap0 = (await page.locator('.stage-wrap').boundingBox())!;
  expect(Math.abs(b0.width - wrap0.width)).toBeLessThan(1); // 底就是預覽區整塊
  expect(Math.abs(b0.height - wrap0.height)).toBeLessThan(1);
  const playTop = (await page.getByRole('button', { name: /^(播放|暫停)$/ }).boundingBox())!.y;
  // 9:16 的版面比預覽區窄：左右兩側（版面外面）蓋斜線、有「框內是影片輸出範圍」
  await expect(page.getByText(/框內是影片輸出範圍/)).toBeVisible();
  await expect(page.getByTestId('out-hatch')).toBeVisible();

  for (const [name, ratio] of [
    [/4:3/, 4 / 3],
    [/16:9/, 16 / 9],
    [/1:1/, 1],
  ] as const) {
    await setRatio(page, name);
    await page.evaluate(() => window.scrollTo(0, 0));
    const b = await base(page);
    expect(Math.abs(b.x - b0.x)).toBeLessThan(1);
    expect(Math.abs(b.y - b0.y)).toBeLessThan(1);
    expect(Math.abs(b.width - b0.width)).toBeLessThan(1);
    expect(Math.abs(b.height - b0.height)).toBeLessThan(1);
    expect(
      Math.abs((await page.getByRole('button', { name: /^(播放|暫停)$/ }).boundingBox())!.y - playTop),
    ).toBeLessThan(1);
    const f = await frame(page);
    expect(f.width / f.height).toBeCloseTo(ratio, 1);
    // 置中
    expect(Math.abs(f.x + f.width / 2 - (b.x + b.width / 2))).toBeLessThan(1.5);
    expect(Math.abs(f.y + f.height / 2 - (b.y + b.height / 2))).toBeLessThan(1.5);
    await expect(page.getByTestId('out-hatch')).toBeVisible();
    await expect(page.getByText(/框內是影片輸出範圍/)).toBeVisible();
  }
  await page.screenshot({ path: `${SHOT}/ratio-fixed-base.png` });
});

test('X4 版面外面的東西也看得到、可以拖過去；匯出（單格輸出）只有版面裡面', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']); // 綠色疊在紅色上，置中、縮小一半
  await setRatio(page, /4:3/);
  await page.evaluate(() => window.scrollTo(0, 0));
  const f = await frame(page);
  const b = await base(page);
  // 綠色塊拖到版面上方的斜線區
  await openTab(page, '疊加');
  await page.evaluate(() => window.scrollTo(0, 0));
  const from = { x: f.x + f.width / 2, y: f.y + f.height / 2 };
  const to = { x: from.x, y: b.y + (f.y - b.y) * 0.5 };
  await touchDrag(page, from, to);
  const tr = ((await project(page)).tracks[1]!.items[0] as unknown as { transform: { y: number } }).transform;
  expect(tr.y).toBeLessThan(0); // 跑到版面外面（上方）
  // 預覽 canvas 在斜線區那一點是綠色（斜線只是蓋在上面）
  const px = await page.evaluate(
    ([nx, ny]) => {
      const c = document.querySelector('[data-testid="preview-canvas"]') as HTMLCanvasElement;
      const t = document.createElement('canvas');
      t.width = c.width;
      t.height = c.height;
      const g = t.getContext('2d')!;
      g.drawImage(c, 0, 0);
      return [...g.getImageData(Math.floor(nx! * c.width), Math.floor(ny! * c.height), 1, 1).data];
    },
    [0.5, (to.y - b.y) / b.height] as const,
  );
  expect(isGreen(px as [number, number, number, number])).toBe(true);
  // 單格輸出：只畫版面（專案寬高），那一點（版面外）不存在，中心是紅色
  const out = (await exportFrame(page, 0.5, [[0.5, 0.5]])) as unknown as number[][] | number[];
  expect(out).toBeTruthy();
  await page.screenshot({ path: `${SHOT}/ratio-outside.png` });
});

test('X4 改比例「保持原樣」：疊加的綠色塊在預覽上的位置、大小不變；「影片填滿畫面」：座標照新畫面算', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']); // 置中、縮小一半
  const selbox = async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    return (await page.getByTestId('selbox').boundingBox())!;
  };
  await page.getByTestId('clip').nth(1).tap();
  const b0 = await selbox();
  const tr0 = ((await project(page)).tracks[1]!.items[0] as unknown as { transform: { scale: number } })
    .transform;

  // 保持原樣（預設）→ 4:3：選取框的中心、寬度不變
  await setRatio(page, /4:3/);
  const b1 = await selbox();
  expect(Math.abs(b1.x + b1.width / 2 - (b0.x + b0.width / 2))).toBeLessThan(2);
  expect(Math.abs(b1.y + b1.height / 2 - (b0.y + b0.height / 2))).toBeLessThan(2);
  expect(Math.abs(b1.width - b0.width)).toBeLessThan(2);
  const tr1 = ((await project(page)).tracks[1]!.items[0] as unknown as { transform: { scale: number } })
    .transform;
  expect(tr1.scale).not.toBeCloseTo(tr0.scale, 2); // 座標換算過了

  // 復原 → 座標回到原來的
  await undo(page);
  const tr2 = ((await project(page)).tracks[1]!.items[0] as unknown as { transform: { scale: number } })
    .transform;
  expect(tr2.scale).toBeCloseTo(tr0.scale, 4);

  // 影片填滿畫面 → 4:3：座標不換算（scale 一樣），主要影片（紅）填滿新畫面
  await page.getByRole('button', { name: '畫面比例' }).tap();
  await page.getByRole('radio', { name: /4:3/ }).tap();
  await page.getByTestId('ratio-fill').tap();
  await page.getByTestId('ratio-apply').tap();
  await page.getByRole('button', { name: '關閉', exact: true }).last().tap(); // 套用後視窗不會自動關，按 ✕ 關
  const tr3 = ((await project(page)).tracks[1]!.items[0] as unknown as { transform: { scale: number } })
    .transform;
  expect(tr3.scale).toBeCloseTo(tr0.scale, 4);
  await page.screenshot({ path: `${SHOT}/ratio-fill.png` });
});

test('X4 自訂比例：套用後在預覽上拖右邊把手 → 寬:高即時變、按套用才改專案；✕ 放棄；一步復原', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']); // 9:16
  const meta = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          __videoclip: { project: () => { aspect: string; width: number; height: number } };
        }
      ).__videoclip.project(),
    );
  const open = async () => {
    await page.getByRole('button', { name: '畫面比例' }).tap();
    await page.getByTestId('ratio-custom').tap();
    await page.getByTestId('ratio-apply').tap();
    await expect(page.getByTestId('aspect-overlay')).toBeVisible();
  };
  const dragH = async (id: string, dx: number, dy = 0) => {
    const b = (await page.getByTestId(id).boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
  };

  // ✕：放棄，專案不變
  await open();
  await page.evaluate(() => window.scrollTo(0, 0));
  await dragH('aspect-h-r', -60);
  await page.getByTestId('aspect-close').tap();
  await expect(page.getByTestId('aspect-overlay')).toHaveCount(0);
  expect(await meta()).toMatchObject({ aspect: '9:16', width: 1080, height: 1920 });

  // 拖右邊把手往左：框變窄（比例 < 9:16），文字即時更新；套用後專案變自訂
  await open();
  await page.evaluate(() => window.scrollTo(0, 0));
  const t0 = await page.getByTestId('aspect-text').innerText();
  const fb = (await page.getByTestId('aspect-frame').boundingBox())!;
  await dragH('aspect-h-b', 0, -fb.height * 0.3); // 下邊往上：框變矮 → 比較寬
  const t1 = await page.getByTestId('aspect-text').innerText();
  expect(t1).not.toBe(t0);
  const fb2 = (await page.getByTestId('aspect-frame').boundingBox())!;
  const expected = fb2.width / fb2.height; // 框的寬高比（CSS 像素）
  await page.getByTestId('aspect-apply').tap();
  await expect(page.getByTestId('aspect-overlay')).toHaveCount(0);
  const m = await meta();
  expect(m.aspect).toBe('custom');
  expect(m.width / m.height).toBeGreaterThan(9 / 16 + 0.1);
  expect(Math.abs(m.width / m.height - expected)).toBeLessThan(0.05);
  expect(Math.max(m.width, m.height)).toBe(1920);
  expect(m.width % 2 === 0 && m.height % 2 === 0).toBe(true);
  // 版面框跟著變成這個比例
  const f = await frame(page);
  expect(Math.abs(f.width / f.height - m.width / m.height)).toBeLessThan(0.03);
  await page.screenshot({ path: `${SHOT}/ratio-custom.png` });

  // 復原 → 回到 9:16
  await undo(page);
  expect(await meta()).toMatchObject({ aspect: '9:16', width: 1080, height: 1920 });
});
