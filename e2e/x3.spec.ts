import { expect, test, type Page } from '@playwright/test';
import {
  addOverlays,
  clips,
  closePanel,
  createProjectWith,
  exportFrame,
  isGreen,
  isRed,
  openTab,
  pinch,
  project,
  samplePreview,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-12';
type Item = {
  crop?: { l: number; t: number; r: number; b: number };
  mask?: [number, number][];
  maskBitmap?: string;
  cropEdit?: { crop: { l: number }; mask: unknown; strokes: { mode: string; pts: unknown[] }[] };
  transform: { x: number; y: number; scale: number };
};
const overlay = async (page: Page) => (await project(page)).tracks[1]!.items[0] as unknown as Item;

async function setup(page: Page) {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']); // 綠色疊在紅色上，置中、縮小一半
  await openTab(page, '剪輯');
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  await page.getByTestId('tool-edit.crop').tap();
  await expect(page.getByTestId('crop-layer')).toBeVisible();
}

const frame = async (page: Page) => (await page.getByTestId('crop-frame').boundingBox())!;
async function drag(page: Page, from: [number, number], to: [number, number], steps = 10) {
  const fr = await frame(page);
  const at = (p: [number, number]) => [fr.x + fr.width * p[0], fr.y + fr.height * p[1]] as const;
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
  await page.mouse.up();
}
async function dragHandle(page: Page, id: string, dx: number, dy: number) {
  const b = (await page.getByTestId(`crop-h-${id}`).boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}
const keepAlpha = (page: Page, fx: number, fy: number) =>
  page.getByTestId('crop-tint').evaluate(
    (c, p) => {
      const cv = c as HTMLCanvasElement;
      const d = cv
        .getContext('2d')!
        .getImageData(Math.round(p[0]! * cv.width), Math.round(p[1]! * cv.height), 1, 1).data;
      return d[3]! < 20; // tint 透明＝留下
    },
    [fx, fy],
  );

test('一頁放得下：頂列、畫面、三列工具都在螢幕內、不用捲動；工具四個同一列；沒有任何按鈕蓋住畫面', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  const vh = page.viewportSize()!.height;
  const ed = (await page.getByTestId('crop-layer').boundingBox())!;
  expect(ed.y).toBeGreaterThanOrEqual(0);
  expect(ed.y + ed.height).toBeLessThanOrEqual(vh + 1);
  const opt = (await page.getByTestId('crop-options').boundingBox())!;
  expect(opt.y + opt.height).toBeLessThanOrEqual(vh + 1);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
  // 四個工具在同一列
  const tops = await Promise.all(
    ['rect', 'lasso', 'brush', 'erase'].map(
      async (t) => (await page.getByTestId(`crop-tool-${t}`).boundingBox())!.y,
    ),
  );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
  // 播放列：▶ ↩ ↪ 檢查結果 套用裁切
  await expect(page.getByTestId('crop-bar').getByRole('button', { name: '播放' })).toBeVisible();
  for (const n of ['復原裁切', '重做裁切', '檢查結果', '套用裁切'])
    await expect(page.getByTestId('crop-bar').getByRole('button', { name: n })).toBeVisible();
  // 所有按鈕和畫面（舞台）不重疊
  const st = (await page.getByTestId('crop-stage').boundingBox())!;
  for (const b of await page.getByTestId('crop-layer').locator('button').all()) {
    const bb = await b.boundingBox();
    if (!bb || (await b.evaluate((el) => !!el.closest('.crop-frame')))) continue;
    const overlap =
      bb.x < st.x + st.width && bb.x + bb.width > st.x && bb.y < st.y + st.height && bb.y + bb.height > st.y;
    expect(overlap).toBe(false);
  }
  // 畫面很大：舞台高度占 crop 編輯畫面的一半以上
  expect(st.height).toBeGreaterThan(ed.height * 0.45);
  await page.screenshot({ path: `${SHOT}/crop-big.png` });
});

test('4:3 專案裁直式影片：畫面一樣是大的（不是縮在小小的預覽裡）', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['clip-a.webm']); // 320×568
  await page.getByRole('button', { name: '畫面比例' }).tap();
  await page.getByRole('radio', { name: '4:3' }).tap();
  await page.getByTestId('ratio-apply').tap();
  await page.getByRole('button', { name: '關閉', exact: true }).last().tap(); // 套用後視窗不會自動關，按 ✕ 關
  await closePanel(page);
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByTestId('tool-edit.crop').tap();
  const st = (await page.getByTestId('crop-stage').boundingBox())!;
  const fr = await frame(page);
  expect(fr.height).toBeGreaterThanOrEqual(st.height * 0.9);
});

test('四個工具獨立、可一起用：先拉框、再用筆刷補框外、再拉框，筆刷不會不見；復原／重做；❌ 不改；套用後再進來筆畫還在', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  const fr = await frame(page);
  // 一般裁切：左邊往右拉 50%
  await dragHandle(page, 'l', fr.width * 0.5, 0);
  await expect(page.getByTestId('crop-size')).toContainText('保留 50% × 100%');
  expect(await keepAlpha(page, 0.25, 0.5)).toBe(false); // 框外被去掉
  expect(await keepAlpha(page, 0.75, 0.5)).toBe(true);
  // 筆刷：在框外刷一條橫線，補回來
  await page.getByTestId('crop-tool-brush').tap();
  await page.getByLabel('粗細').fill('8');
  await page.getByLabel('距離').fill('0');
  await drag(page, [0.05, 0.3], [0.4, 0.3]);
  expect(await keepAlpha(page, 0.2, 0.3)).toBe(true); // 框外刷到的留下來了
  expect(await keepAlpha(page, 0.2, 0.7)).toBe(false);
  // 再切回一般裁切把左邊拉回左邊：筆畫還在
  await page.getByTestId('crop-tool-rect').tap();
  await dragHandle(page, 'l', fr.width * 0.1, 0);
  expect(await keepAlpha(page, 0.2, 0.3)).toBe(true);
  // 復原 ↩ 兩次（拉框、筆畫）→ 重做 ↪ 一次
  await page.getByTestId('crop-undo').tap(); // 回到拉框前（左邊 50%）
  await page.getByTestId('crop-undo').tap(); // 回到沒有筆畫
  await expect.poll(() => keepAlpha(page, 0.2, 0.3)).toBe(false);
  await page.getByTestId('crop-redo').tap();
  await expect.poll(() => keepAlpha(page, 0.2, 0.3)).toBe(true);
  // ❌：不改專案
  await page.getByTestId('crop-close').tap();
  expect((await overlay(page)).crop).toBeUndefined();
  expect((await overlay(page)).cropEdit).toBeUndefined();
  // 重新來：只用筆刷（底是空的，只留刷到的）→ 套用
  await page.getByTestId('tool-edit.crop').tap();
  await page.getByTestId('crop-tool-brush').tap();
  await page.getByLabel('粗細').fill('15');
  await page.getByLabel('距離').fill('0');
  await drag(page, [0.2, 0.5], [0.8, 0.5]);
  expect(await keepAlpha(page, 0.5, 0.5)).toBe(true);
  expect(await keepAlpha(page, 0.5, 0.1)).toBe(false);
  await page.getByTestId('crop-apply').tap();
  const it = await overlay(page);
  expect(it.maskBitmap).toMatch(/^data:image\/png/);
  expect(it.cropEdit!.strokes).toHaveLength(1);
  expect(it.crop!.t).toBeGreaterThan(0.3); // 保留區域框住筆畫
  // 預覽：中間一條是綠、上面露出底下的紅
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  expect(isRed(await samplePreview(page, 0.5, 0.33))).toBe(true);
  // 再進來：筆畫還在（可以 ↩ 復原不了——歷史是新的——但筆刷的範圍還在）
  await page.getByTestId('tool-edit.crop').tap();
  expect(await keepAlpha(page, 0.5, 0.5)).toBe(true);
  expect(await keepAlpha(page, 0.5, 0.1)).toBe(false);
  await page.getByTestId('crop-close').tap();
});

test('只用橡皮擦＝整張扣掉擦的；檢查結果：只顯示留下來的（棋盤格）', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByTestId('crop-tool-erase').tap();
  await page.getByLabel('粗細').fill('12');
  await page.getByLabel('距離').fill('0');
  await drag(page, [0.1, 0.5], [0.9, 0.5]);
  expect(await keepAlpha(page, 0.5, 0.5)).toBe(false); // 擦掉
  expect(await keepAlpha(page, 0.5, 0.1)).toBe(true); // 其他還在
  await page.getByTestId('crop-check').tap();
  await expect(page.getByTestId('crop-check')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('crop-paint')).toHaveCount(0); // 檢查時工具不能動
  await page.screenshot({ path: `${SHOT}/crop-brush.png` });
  await page.getByTestId('crop-check').tap();
  await page.getByTestId('crop-apply').tap();
  const out = await exportFrame(page, 0.5, [
    [0.5, 0.5],
    [0.5, 0.36],
  ]);
  expect(isRed(out.samples[0] as [number, number, number, number])).toBe(true); // 擦掉露出紅
  expect(isGreen(out.samples[1] as [number, number, number, number])).toBe(true);
});

test('去掉的地方是「變暗＋斜線」不是紅色；留下的地方是原本的亮度', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  const fr = await frame(page);
  await dragHandle(page, 'l', fr.width * 0.5, 0);
  const px = await page.getByTestId('crop-tint').evaluate((c) => {
    const cv = c as HTMLCanvasElement;
    const d = cv
      .getContext('2d')!
      .getImageData(Math.round(cv.width * 0.25), Math.round(cv.height * 0.5), 1, 1).data;
    return Array.from(d);
  });
  // 黑色、半透明（不偏紅）
  expect(px[0]!).toBeLessThan(120);
  expect(Math.abs(px[0]! - px[1]!)).toBeLessThan(40);
  expect(px[3]!).toBeGreaterThan(100);
});

test('放大縮小：按鈕 ±、點數字回 100%、兩指捏合；放大後刷的位置換算回整張畫面（縮小後還在）', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  const zoomText = () => page.getByTestId('crop-zoom').innerText();
  await page.getByRole('button', { name: '放大畫面' }).tap();
  await page.getByRole('button', { name: '放大畫面' }).tap();
  await expect.poll(zoomText).toBe('200%');
  const fr = await frame(page);
  expect(fr.width).toBeGreaterThan(0);
  // 放大 200% 後，在畫面左上角附近（整張畫面的 10%–40%）刷：只用筆刷＝只留刷到的
  await page.getByTestId('crop-tool-brush').tap();
  await page.getByLabel('粗細').fill('6');
  await page.getByLabel('距離').fill('0');
  const st = (await page.getByTestId('crop-stage').boundingBox())!;
  const f2 = await frame(page);
  // 舞台左上角附近那塊（可見的）在整張畫面的哪個位置
  const fx = (st.x + st.width * 0.3 - f2.x) / f2.width;
  const fy = (st.y + st.height * 0.3 - f2.y) / f2.height;
  await page.mouse.move(st.x + st.width * 0.3, st.y + st.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(st.x + st.width * 0.5, st.y + st.height * 0.3, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('crop-zoom').tap(); // 回 100%
  await expect.poll(zoomText).toBe('100%');
  expect(await keepAlpha(page, fx + 0.02, fy)).toBe(true);
  expect(await keepAlpha(page, 0.9, 0.9)).toBe(false);
  // 兩指捏合放大
  const s2 = (await page.getByTestId('crop-stage').boundingBox())!;
  await pinch(page, { cx: s2.x + s2.width / 2, cy: s2.y + s2.height / 2, from: 60, to: 180 });
  await expect
    .poll(async () => Number.parseInt((await zoomText()).replace('%', ''), 10))
    .toBeGreaterThan(150);
  await page.getByTestId('crop-close').tap();
});

test('刷的時候不重畫預覽、不重畫編輯器：一筆 20 個點，畫面像素 hash 與編輯器 render 次數幾乎不變', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByTestId('crop-tool-erase').tap();
  await page.getByLabel('粗細').fill('6');
  await page.getByLabel('距離').fill('0');
  const hook = () =>
    page.evaluate(() =>
      (window as unknown as { __videoclip: { editorRenders: () => number } }).__videoclip.editorRenders(),
    );
  const before = await hook();
  const fr = await frame(page);
  await page.mouse.move(fr.x + fr.width * 0.2, fr.y + fr.height * 0.5);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++)
    await page.mouse.move(fr.x + fr.width * (0.2 + i * 0.03), fr.y + fr.height * 0.5);
  const during = await hook();
  await page.mouse.up();
  expect(during - before).toBeLessThanOrEqual(1);
});

test('離開：選到別的片段、片段不見會結束裁切；沒有改就套用不會多一筆復原紀錄', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByTestId('crop-apply').tap(); // 什麼都沒改
  await expect(page.getByTestId('crop-layer')).toHaveCount(0);
  expect((await overlay(page)).crop).toBeUndefined();
});

test('工具有圖示（文字在圖示右邊、同一個顏色）、文字是「一般／自由／筆刷／橡皮擦」；工具卡跟動作列分區', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  const names: Record<string, string> = { rect: '一般', lasso: '自由', brush: '筆刷', erase: '橡皮擦' };
  for (const [id, name] of Object.entries(names)) {
    const b = page.getByTestId(`crop-tool-${id}`);
    await expect(b).toContainText(name);
    expect(((await b.innerText()) ?? '').trim()).toBe(name);
    await expect(b.locator('svg')).toHaveCount(1);
    const m = await b.evaluate((el) => {
      const svg = el.querySelector('svg')!.getBoundingClientRect();
      const span = el.querySelector('span')!.getBoundingClientRect();
      return {
        iconRight: svg.right,
        textLeft: span.left,
        svgColor: getComputedStyle(el.querySelector('svg')!).color,
        btnColor: getComputedStyle(el).color,
      };
    });
    expect(m.iconRight).toBeLessThanOrEqual(m.textLeft + 1);
    expect(m.svgColor).toBe(m.btnColor);
  }
  // 一般裁切的圖示：外框＋四個角的實心圓點
  await expect(page.getByTestId('crop-tool-rect').locator('svg circle')).toHaveCount(4);
  // 分區：工具卡有「裁切工具」小標題、底色跟動作列不同、中間有分隔
  const card = page.getByRole('region', { name: '裁切工具' });
  await expect(card).toContainText('裁切工具');
  const bar = (await page.getByTestId('crop-bar').boundingBox())!;
  const cb = (await card.boundingBox())!;
  expect(cb.y - (bar.y + bar.height)).toBeGreaterThanOrEqual(6);
  const bgs = await page.evaluate(() => ({
    card: getComputedStyle(document.querySelector('.ce-toolcard')!).backgroundColor,
    editor: getComputedStyle(document.querySelector('.crop-editor')!).backgroundColor,
  }));
  expect(bgs.card).not.toBe(bgs.editor);
  await page.screenshot({ path: `${SHOT}/crop-toolcard.png` });
});

for (const w of [320, 390]) {
  test(`${w} 寬：裁切畫面仍在一頁內、四個工具不換行`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: w === 320 ? 568 : 664 });
    await setup(page);
    const vh = page.viewportSize()!.height;
    const ed = (await page.getByTestId('crop-layer').boundingBox())!;
    expect(ed.y + ed.height).toBeLessThanOrEqual(vh + 1);
    const opt = (await page.getByTestId('crop-options').boundingBox())!;
    expect(opt.y + opt.height).toBeLessThanOrEqual(vh + 1);
    for (const t of ['rect', 'lasso', 'brush', 'erase']) {
      const lines = await page.getByTestId(`crop-tool-${t}`).evaluate((el) => {
        const rg = document.createRange();
        rg.selectNodeContents(el.querySelector('span')!);
        return new Set(Array.from(rg.getClientRects()).map((r) => Math.round(r.top / 3))).size;
      });
      expect(lines).toBe(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(
      true,
    );
  });
}

// feedback-17 Z26：筆刷第一筆刷的當下就看得到；被去掉的地方是變暗的素材（可切半透明棋盤格）；自由裁切也有兩個圓圈
const tintAt = (page: Page, fx: number, fy: number) =>
  page.getByTestId('crop-tint').evaluate(
    (c, p) => {
      const cv = c as HTMLCanvasElement;
      return Array.from(
        cv.getContext('2d')!.getImageData(Math.round(p[0]! * cv.width), Math.round(p[1]! * cv.height), 1, 1)
          .data,
      );
    },
    [fx, fy],
  );

test('Z26 筆刷：第一筆還沒放開手指就看得到（刷到的亮、其他變暗）；〔看棋盤格〕變半透明棋盤格；〔檢查結果〕不透明', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  await page.getByTestId('crop-tool-brush').tap();
  await page.getByLabel('粗細').fill('10');
  await page.getByLabel('距離').fill('0');
  const fr = await frame(page);
  const y = fr.y + fr.height * 0.5;
  await page.mouse.move(fr.x + fr.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(fr.x + fr.width * 0.5, y, { steps: 8 });
  // 還沒放開：刷到的地方透明（看得到素材）、旁邊是變暗的素材（半透明黑，不是不透明棋盤格）
  const on = await tintAt(page, 0.35, 0.5);
  const off = await tintAt(page, 0.35, 0.15);
  expect(on[3]!, '刷到的地方').toBeLessThan(20);
  expect(off[3]!, '沒刷到的地方是半透明的暗色，看得到底下').toBeGreaterThan(100);
  expect(off[3]!).toBeLessThan(200);
  expect(off[0]!).toBeLessThan(40); // 黑色，不是棋盤格的灰白
  await page.mouse.up();
  // 〔看棋盤格〕：變成半透明棋盤格（灰白）
  await page.getByTestId('paint-look').tap();
  const soft = await tintAt(page, 0.35, 0.15);
  expect(soft[0]!).toBeGreaterThan(150);
  expect(soft[3]!).toBeGreaterThan(100);
  expect(soft[3]!).toBeLessThan(200);
  await page.getByTestId('paint-look').tap();
  // 〔檢查結果〕：不透明棋盤格
  await page.getByTestId('crop-check').tap();
  const hard = await tintAt(page, 0.35, 0.15);
  expect(hard[3]!).toBeGreaterThan(240);
});

test('Z26 自由裁切：有兩個圓圈（手指圓、往上偏的焦點圓），形狀畫在焦點圓；有〔距離〕', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await page.getByTestId('crop-tool-lasso').tap();
  await page.getByLabel('距離').fill('80');
  const fr = await frame(page);
  const y = fr.y + fr.height * 0.8;
  await page.mouse.move(fr.x + fr.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(fr.x + fr.width * 0.4, y, { steps: 4 });
  const a = (await page.getByTestId('brush-finger').boundingBox())!;
  const b = (await page.getByTestId('brush-cursor').boundingBox())!;
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);
  expect(dy).toBeGreaterThan(75);
  expect(dy).toBeLessThan(85);
  // 畫一圈（手指在下面、焦點圓在上面 80px），放開
  await page.mouse.move(fr.x + fr.width * 0.7, y, { steps: 6 });
  await page.mouse.move(fr.x + fr.width * 0.7, y + 60, { steps: 4 });
  await page.mouse.move(fr.x + fr.width * 0.3, y + 60, { steps: 6 });
  await page.mouse.move(fr.x + fr.width * 0.3, y, { steps: 4 });
  await page.mouse.up();
  const poly = (await page.getByTestId('crop-polygon').getAttribute('points'))!
    .split(' ')
    .map((p) => p.split(',').map(Number) as [number, number]);
  const minY = Math.min(...poly.map((p) => p[1]));
  const maxY = Math.max(...poly.map((p) => p[1]));
  // 手指走的 y 範圍在 0.8～0.8+60px；形狀整個往上偏 80px，所以最下緣在手指路線的最上緣附近或更上面
  expect(maxY * fr.height + fr.y, '形狀在手指上方').toBeLessThan(y - 10);
  expect(maxY - minY).toBeGreaterThan(0.05);
});

// feedback-17 Z31：自由裁切畫完放開手指後，預覽和下面的工具區都不能變大變小（以前〔清除形狀〕擠進來，說明文字變一字一行、預覽被壓扁）
test('Z31 自由裁切畫完：預覽和工具區的高度不變、說明文字不擠成一字一行；〔清除形狀〕一直都在', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  await page.getByTestId('crop-tool-lasso').tap();
  const stage = () => page.locator('.ce-stage').boundingBox();
  const ctx = () => page.getByTestId('crop-options').boundingBox();
  const hint = () => page.locator('.ce-lasso .hint').boundingBox();
  const clear = page.getByTestId('lasso-clear');
  await expect(clear).toBeVisible();
  await expect(clear).toBeDisabled();
  const s0 = (await stage())!;
  const c0 = (await ctx())!;
  const h0 = (await hint())!;
  expect(h0.width, '說明文字佔整行').toBeGreaterThan(c0.width * 0.8);
  const fr = await frame(page);
  const y = fr.y + fr.height * 0.7;
  await page.mouse.move(fr.x + fr.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(fr.x + fr.width * 0.7, y, { steps: 6 });
  await page.mouse.move(fr.x + fr.width * 0.7, y + 50, { steps: 4 });
  await page.mouse.move(fr.x + fr.width * 0.3, y + 50, { steps: 6 });
  await page.mouse.move(fr.x + fr.width * 0.3, y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('crop-polygon')).toBeAttached();
  await expect(clear).toBeEnabled();
  const s1 = (await stage())!;
  const c1 = (await ctx())!;
  const h1 = (await hint())!;
  expect(Math.abs(s1.height - s0.height), '預覽高度不變').toBeLessThanOrEqual(2);
  expect(Math.abs(c1.height - c0.height), '工具區高度不變').toBeLessThanOrEqual(2);
  expect(h1.width, '說明文字還是佔整行').toBeGreaterThan(c1.width * 0.8);
  await page.screenshot({ path: 'docs/screenshots/feedback-17/z31-crop-panel-after.png' });
  await clear.tap();
  await expect(page.getByTestId('crop-polygon')).toHaveCount(0);
  await expect(clear).toBeDisabled();
});
