import { expect, test } from '@playwright/test';
import {
  addOverlays,
  clips,
  countColor,
  createProjectWith,
  exportFrame,
  isBlue,
  isGreen,
  isRed,
  openTab,
  project,
  samplePreview,
  selectedItemId,
  type RGBA,
  previewBox,
  pinch,
} from './helpers';

const SHOT = 'docs/screenshots/phase2';

const near = (a: RGBA | number[] | null, b: RGBA | number[] | null, tol = 8) =>
  !!a && !!b && [0, 1, 2].every((i) => Math.abs(a[i]! - b[i]!) <= tol);

test('同一秒疊 3 支影片＋1 個字卡：換圖層順序後預覽正確，單格匯出和預覽一致', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']); // 主軌：紅，滿版
  await addOverlays(page, ['solid-green.webm', 'solid-blue.webm']); // 疊加：綠、藍，各佔一條軌道，都在第 0 秒
  await expect(clips(page)).toHaveCount(3);
  await expect(page.getByTestId('track')).toHaveCount(3);

  // 加一個文字
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增文字/ }).tap();
  await expect(clips(page)).toHaveCount(4);
  await expect(page.getByTestId('track')).toHaveCount(4);
  await page.getByLabel('文字內容').fill('疊圖測試');

  // 疊加素材預設縮小 50% 放中間 → 佔畫面 x 0.25–0.75、y 0.25–0.75；外面是主軌的紅
  const OUT: [number, number] = [0.1, 0.1];
  const IN: [number, number] = [0.5, 0.3]; // 在疊加範圍內，避開中間的文字
  await expect.poll(async () => isRed(await samplePreview(page, ...OUT)), { timeout: 8000 }).toBe(true);
  await expect.poll(async () => isBlue(await samplePreview(page, ...IN)), { timeout: 8000 }).toBe(true); // 後加的藍在最上面
  // 文字（白色）真的畫出來了：中間那條有白色像素
  expect(await countColor(page, [255, 255, 255], 40, [0.25, 0.47, 0.75, 0.53])).toBeGreaterThan(30);
  await page.screenshot({ path: `${SHOT}/layers-blue-on-top.png` });

  // 圖層分頁：列出這一秒的 4 個圖層（最上面的在最上面）
  await openTab(page, '圖層');
  const rows = page.getByTestId('layer-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('文字');
  await expect(rows.nth(1)).toContainText('影像 3');
  await expect(rows.nth(2)).toContainText('影像 2');
  await expect(rows.nth(3)).toContainText('影像 1');

  // 把藍色（影像 3）往下一層 → 綠色變成最上面
  await page.getByRole('button', { name: '影像 3 往下一層' }).tap();
  await expect.poll(async () => isGreen(await samplePreview(page, ...IN))).toBe(true);
  await expect(rows.nth(1)).toContainText('影像 2');
  await page.screenshot({ path: `${SHOT}/layers-green-on-top.png` });

  // 再把綠色往下、藍色回到最上面
  await page.getByRole('button', { name: '影像 2 往下一層' }).tap();
  await expect.poll(async () => isBlue(await samplePreview(page, ...IN))).toBe(true);

  // 隱藏藍色那條軌道 → 看到綠色
  await page.getByRole('button', { name: '影像 3 隱藏' }).tap();
  await expect.poll(async () => isGreen(await samplePreview(page, ...IN))).toBe(true);
  await page.getByRole('button', { name: '影像 3 顯示' }).tap();
  await expect.poll(async () => isBlue(await samplePreview(page, ...IN))).toBe(true);

  // 單格匯出（輸出解析度 1080×1920）和預覽在同樣幾個點的顏色一致
  const pts: [number, number][] = [OUT, IN, [0.9, 0.9], [0.5, 0.75], [0.3, 0.6]];
  const exp = await exportFrame(page, 0.5, pts);
  expect(exp.width).toBe(1080);
  expect(exp.height).toBe(1920);
  expect(exp.bytes).toBeGreaterThan(1000);
  for (let i = 0; i < pts.length; i++) {
    const prev = await samplePreview(page, ...pts[i]!);
    expect(
      near(exp.samples[i]!, prev),
      `點 ${JSON.stringify(pts[i])}：匯出 ${exp.samples[i]} vs 預覽 ${prev}`,
    ).toBe(true);
  }
});

test('預覽上的選取框：只有框線（沒有圓點）、拖移、雙指縮放旋轉（一次手勢一步復原）、用剪輯分頁刪除', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await expect(clips(page)).toHaveCount(2);

  // 新加的疊加素材自動被選取：只有框線，沒有任何圓點或按鈕
  await expect(page.getByTestId('selbox')).toBeVisible();
  await expect(page.locator('.sel-dot, [data-handle]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '刪除圖層' })).toHaveCount(0);
  const tf0 = (await project(page)).tracks[1]!.items[0]!.transform;
  expect(tf0.scale).toBeCloseTo(0.5);

  // 雙指（真的兩點觸控）在物件上張開＋轉 90° → 變大、轉成 90°（吸附）
  const stage = await previewBox(page);
  const cx = stage.x + stage.width * 0.5;
  const cy = stage.y + stage.height * 0.5;
  await pinch(page, { cx, cy, from: 40, to: 80, angle: 88 });
  const tf1 = (await project(page)).tracks[1]!.items[0]!.transform;
  expect(tf1.scale).toBeGreaterThan(0.85);
  expect(Math.abs(tf1.rotation - 90)).toBeLessThan(0.01); // 88° 吸附到 90°
  await page.screenshot({ path: `${SHOT}/selection-box-scaled.png` });
  // 一次雙指手勢＝一步復原
  await page.getByRole('button', { name: '復原' }).tap();
  const tfu = (await project(page)).tracks[1]!.items[0]!.transform;
  expect(tfu.scale).toBeCloseTo(0.5);
  expect(tfu.rotation).toBe(0);
  await page.getByRole('button', { name: '重做' }).tap();

  // 拖框內 → 移動位置
  const st2 = await previewBox(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 15, cy + 5, { steps: 4 });
  await page.mouse.move(cx + st2.width * 0.2, cy + st2.height * 0.1, { steps: 6 });
  await page.mouse.up();
  const tf2 = (await project(page)).tracks[1]!.items[0]!.transform;
  expect(tf2.x).toBeGreaterThan(0.6);
  expect(tf2.y).toBeGreaterThan(0.5);

  // 一次拖曳 = 一步復原
  await page.getByRole('button', { name: '復原' }).tap();
  const tf3 = (await project(page)).tracks[1]!.items[0]!.transform;
  expect(tf3.x).toBeCloseTo(tf1.x, 1);

  // 刪除：用剪輯分頁的刪除鈕（預覽上不放 ✕）
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '刪除', exact: true }).tap();
  await expect(clips(page)).toHaveCount(1);
  await expect(page.getByTestId('selbox')).toHaveCount(0);
});

test('點預覽畫面會選到最上面那個物件；鎖定的軌道不會被選到', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm', 'solid-blue.webm']);
  const track2Id = (await project(page)).tracks[2]!.items[0]!.id; // 藍（最上面）
  const track1Id = (await project(page)).tracks[1]!.items[0]!.id; // 綠

  // 開關底部分頁會讓舞台大小改變，所以每次點擊前重新量舞台的位置
  const click = async (nx: number, ny: number) => {
    const stage = await previewBox(page);
    await page.mouse.click(stage.x + stage.width * nx, stage.y + stage.height * ny);
  };

  await click(0.5, 0.5); // 中間：藍在最上面
  expect(await selectedItemId(page)).toBe(track2Id);
  const mainId = (await project(page)).tracks[0]!.items[0]!.id;
  await click(0.08, 0.08); // 角落：只有主軌 → 點預覽的主軌影片也選得到（使用者 2026-11-12 要求）
  expect(await selectedItemId(page)).toBe(mainId);

  // 鎖定藍色那條軌道 → 點中間會選到綠
  await openTab(page, '圖層');
  await page.getByRole('button', { name: '影像 3 鎖定' }).tap();
  await click(0.5, 0.5);
  expect(await selectedItemId(page)).toBe(track1Id);
});

test('疊加素材：長按拖曳移動時間、修剪、軌道選單', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  // 縮小時間軸兩次（60 → 26.7 px/秒），4 秒的素材才完整落在手機螢幕內
  await page.getByRole('button', { name: '縮小時間軸' }).tap();
  await page.getByRole('button', { name: '縮小時間軸' }).tap();
  const PPS = 60 / 2.25;
  const overlay = page.locator('[data-testid="clip"][data-kind="video"]').nth(0); // 疊加軌在主軌上面，DOM 順序在前
  const id = (await project(page)).tracks[1]!.items[0]!.id;
  expect((await project(page)).tracks[1]!.items[0]!.start).toBe(0);

  // 先把它縮短 2 秒（拖右邊把手往左），才有空間移動
  await overlay.tap();
  const th = (await page.getByTestId('trim-end').boundingBox())!;
  const ty = th.y + th.height / 2;
  const tx = th.x + th.width / 2;
  await page.mouse.move(tx, ty);
  await page.mouse.down();
  await page.mouse.move(tx - PPS, ty, { steps: 4 });
  await page.mouse.move(tx - 2 * PPS, ty, { steps: 4 });
  await page.mouse.up();
  const dur = (await project(page)).tracks[1]!.items[0]!.duration;
  expect(dur).toBeGreaterThan(1.7);
  expect(dur).toBeLessThan(2.3);

  // 長按後往右拖 2 秒 → 起點約 2 秒（同一軌沒有別的物件，剛好可以放）
  const box = (await overlay.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(550);
  await expect(overlay).toHaveClass(/dragging/);
  await page.mouse.move(x + PPS, y, { steps: 5 });
  await page.mouse.move(x + 2 * PPS, y, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await project(page)).tracks[1]!.items.find((i) => i.id === id)!.start)
    .toBeGreaterThan(1.7);
  await page.screenshot({ path: `${SHOT}/overlay-moved.png` });

  // 軌道選單：隱藏 → 預覽回到紅；顯示 → 綠
  await page.getByRole('button', { name: /影像 2 軌道設定/ }).tap();
  await page.getByRole('button', { name: /隱藏這條軌道/ }).tap();
  expect((await project(page)).tracks[1]!.hidden).toBe(true);
  await page.getByRole('button', { name: /影像 2 軌道設定/ }).tap();
  await page.getByRole('button', { name: /顯示這條軌道/ }).tap();
  expect((await project(page)).tracks[1]!.hidden).toBe(false);

  // 刪除軌道（連同物件）
  await page.getByRole('button', { name: /影像 2 軌道設定/ }).tap();
  await page.getByRole('button', { name: /刪除這條軌道/ }).tap();
  await expect(page.getByTestId('track')).toHaveCount(1);
  await expect(clips(page)).toHaveCount(1);
});

test('圖層屬性：透明度、混合模式、圓角、外框、裁切', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await openTab(page, '圖層');
  const IN: [number, number] = [0.5, 0.5];
  await expect.poll(async () => isGreen(await samplePreview(page, ...IN)), { timeout: 8000 }).toBe(true);

  // 透明度 50%：綠疊在紅上 → 中間變成紅綠混合
  await page.getByLabel('透明度').fill('50');
  await expect
    .poll(async () => {
      const c = await samplePreview(page, ...IN);
      return !!c && c[0] > 90 && c[0] < 170 && c[1] > 90 && c[1] < 170;
    })
    .toBe(true);
  expect((await project(page)).tracks[1]!.items[0]!.transform.opacity).toBeCloseTo(0.5);
  await page.getByLabel('透明度').fill('100');

  // 混合模式「色彩加深」(multiply)：綠 × 紅 = 黑
  await page.getByRole('button', { name: '色彩加深', exact: true }).tap();
  await expect
    .poll(async () => {
      const c = await samplePreview(page, ...IN);
      return !!c && c[0] < 30 && c[1] < 30 && c[2] < 30;
    })
    .toBe(true);
  await page.getByRole('button', { name: '正常', exact: true }).tap();
  await expect.poll(async () => isGreen(await samplePreview(page, ...IN))).toBe(true);

  // 圓角：疊加素材左上角 (0.25,0.25) 附近被切掉 → 露出底下的紅
  await page.getByLabel('圓角').fill('50');
  await expect.poll(async () => isRed(await samplePreview(page, 0.255, 0.255))).toBe(true);
  await page.getByLabel('圓角').fill('0');
  await expect.poll(async () => isGreen(await samplePreview(page, 0.255, 0.255))).toBe(true);

  // 外框：白色，邊緣內側變白
  await page.getByLabel('外框粗細').fill('30');
  await page.getByRole('button', { name: '外框顏色 #ffffff' }).tap();
  await expect
    .poll(async () => {
      const c = await samplePreview(page, 0.27, 0.5);
      return !!c && c[0] > 220 && c[1] > 220 && c[2] > 220;
    })
    .toBe(true);
  await page.getByLabel('外框粗細').fill('0');

  // 裁切（在剪輯分頁、直接在預覽上拖）：把左邊拉霸往右拖到一半；原本在 x≈0.3 的位置不再是綠，
  // 留下來的那一半在畫面上的位置不變（x≈0.6 還是綠）
  await expect(page.getByLabel('裁切左')).toHaveCount(0); // 圖層分頁沒有裁切滑桿了
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '裁切' }).tap();
  const fr = (await page.getByTestId('crop-frame').boundingBox())!;
  const hl = (await page.getByTestId('crop-h-l').boundingBox())!;
  await page.mouse.move(hl.x + hl.width / 2, hl.y + hl.height / 2);
  await page.mouse.down();
  await page.mouse.move(hl.x + hl.width / 2 + fr.width / 4, hl.y + hl.height / 2, { steps: 4 });
  await page.mouse.move(hl.x + hl.width / 2 + fr.width / 2, hl.y + hl.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId('crop-apply').tap();
  const p = await project(page);
  expect(p.tracks[1]!.items[0]!.crop!.l).toBeCloseTo(0.5, 1);
  await expect.poll(async () => isRed(await samplePreview(page, 0.27, 0.5))).toBe(true);
  expect(isGreen(await samplePreview(page, 0.6, 0.5))).toBe(true);
  await openTab(page, '圖層');
  await page.screenshot({ path: `${SHOT}/layer-props.png` });

  // 位置、大小、旋轉歸位
  await page.getByRole('button', { name: '位置、大小、旋轉歸位' }).tap();
  expect((await project(page)).tracks[1]!.items[0]!.transform.scale).toBeCloseTo(0.5);
});

test('文字：新增、改內容與顏色、在預覽上可拖移，也能分割', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增文字/ }).tap();
  await page.getByLabel('文字內容').fill('哈囉\n第二行');
  await page.getByRole('button', { name: '文字顏色 #111111' }).tap();
  const p = await project(page);
  const run = p.tracks[1]!.items[0]!.card!.runs[0]!;
  expect(run.text).toBe('哈囉\n第二行');
  expect(run.color).toBe('#111111');
  await expect(page.locator('[data-testid="clip"][data-kind="text"]')).toContainText('哈囉');
  // 黑色字畫在紅色背景上：中間有深色像素
  await expect
    .poll(async () => countColor(page, [17, 17, 17], 30, [0.25, 0.4, 0.75, 0.6]))
    .toBeGreaterThan(50);
  await page.screenshot({ path: `${SHOT}/text-item.png` });

  // 分割：把播放頭移到文字中間（1.5 秒）再按分割
  await page.getByTestId('timeline-scroll').evaluate((el) => void (el.scrollLeft = 90));
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '分割', exact: true }).tap();
  await expect(clips(page)).toHaveCount(3);
});

test('底部分頁：再點目前的分頁面板不會收合，預覽大小永遠不變（使用者：預覽不能被擠小）', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '文字');
  const stage = page.getByTestId('stage');
  const h1 = (await stage.boundingBox())!.height;
  const w1 = (await stage.boundingBox())!.width;
  await page.getByRole('tab', { name: '文字' }).tap(); // 再點一次：面板不會收合
  await expect(page.getByRole('button', { name: /新增文字/ })).toBeVisible();
  expect((await stage.boundingBox())!.height).toBeCloseTo(h1, 0);
  expect((await stage.boundingBox())!.width).toBeCloseTo(w1, 0);
});
