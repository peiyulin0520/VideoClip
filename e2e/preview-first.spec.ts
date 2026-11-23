import { expect, test, type Page } from '@playwright/test';
import {
  addOverlays,
  clips,
  closePanel,
  countColor,
  createProjectWith,
  deselect,
  openTab,
  pinch,
  previewBox,
  project,
  redo,
  touchDrag,
  undo,
} from './helpers';

// 使用者 2026-11-11：「預覽不要太小…頁面可以整體往下滑新增功能，但往上滑可以看到不會縮小的預覽畫面」
// 「選取框一率不需要小圓點，只需要有框框可以選取字串並用手指控制縮放」
const SHOT = 'docs/screenshots/preview-first';

const stageSize = async (page: Page) => {
  const b = (await page.getByTestId('stage').boundingBox())!;
  return { w: Math.round(b.width), h: Math.round(b.height) };
};
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);
const textTransform = async (page: Page) => (await project(page)).tracks[1]!.items[0]!.transform;

test('預覽很大而且大小永遠不變：每個分頁、面板開合、選取前後都一樣', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  const top = await previewBox(page);
  const vh = await page.evaluate(() => window.innerHeight);
  // 捲到最上面：預覽高約螢幕的 54%（適中，往下就是播放列和時間軸），預覽和播放鈕都在畫面內
  expect(top.height / vh).toBeGreaterThan(0.45);
  expect(top.height / vh).toBeLessThan(0.62);
  const play = (await page.getByRole('button', { name: '播放' }).boundingBox())!;
  expect(play.y + play.height).toBeLessThanOrEqual(vh + 1);
  await page.screenshot({ path: `${SHOT}/top.png` });

  const base = await stageSize(page);
  for (const tab of ['疊加', '圖層', '版型', '特效', '素材', '音訊', '剪輯'] as const) {
    await openTab(page, tab);
    expect(await stageSize(page)).toEqual(base);
  }
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  expect(await stageSize(page)).toEqual(base);
  await expect(page.getByLabel('文字內容')).toBeVisible(); // 剛新增文字：文字視窗直接升起
  expect(await stageSize(page)).toEqual(base);
});

test('整頁不捲動；視窗裡面可以上下滑、最後的控制項點得到；預覽大小不變', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByRole('tablist', { name: '字卡設定' }).getByRole('tab', { name: '裝飾', exact: true }).tap();
  for (const k of ['尾端圈圈', '波浪底線', '愛心'])
    await page.getByRole('button', { name: `裝飾 ${k}` }).tap();
  // 整頁剛好一個螢幕高，不能捲
  const { sh, ih } = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
  }));
  expect(sh).toBeLessThanOrEqual(ih + 1);
  const before = await stageSize(page);
  // 視窗裡面往下滑：最後一個控制項（愛心大小）按得到
  const slider = page.getByRole('slider', { name: '愛心大小', exact: true });
  await slider.scrollIntoViewIfNeeded();
  await expect(slider).toBeInViewport();
  const sheet = (await page.getByTestId('panel-sheet').boundingBox())!;
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(ih + 1);
  await page.screenshot({ path: `${SHOT}/scrolled-to-settings.png` });
  expect(await stageSize(page)).toEqual(before);
});

test('按在文字上拖＝移動文字，整頁不捲', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await closePanel(page);
  await page.waitForTimeout(300);
  const st2 = await previewBox(page);
  const t0 = await textTransform(page);
  const cx = st2.x + st2.width * 0.5;
  const cy = st2.y + st2.height * 0.5;
  await touchDrag(page, { x: cx, y: cy }, { x: cx + 40, y: cy + 60 });
  const t1 = await textTransform(page);
  expect(t1.y).toBeGreaterThan(t0.y + 0.05);
  expect(t1.x).toBeGreaterThan(t0.x + 0.05);
  await page.waitForTimeout(500);
  expect(await scrollY(page)).toBe(0);
});

test('雙指：手指放在框外也能縮放；沒有選取時雙指會選到中點下的物件；沒有任何圓點', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await closePanel(page);
  const st = await previewBox(page);
  const cx = st.x + st.width * 0.5;
  const cy = st.y + st.height * 0.5;
  // 兩指距離 200px（遠大於文字的框）→ 縮小一半
  await pinch(page, { cx, cy, from: 200, to: 100 });
  const s1 = (await textTransform(page)).scale;
  expect(s1).toBeLessThan(0.6);
  expect(s1).toBeGreaterThan(0.4);

  // 取消選取後雙指 → 選到中點下的文字並放大
  await deselect(page); // 預覽上點空白處不再取消選取（使用者 2026-11-12）：改點時間軸空白
  await expect(page.getByTestId('selbox')).toHaveCount(0);
  await pinch(page, { cx, cy, from: 60, to: 120 });
  await expect(page.getByTestId('selbox')).toBeVisible();
  expect((await textTransform(page)).scale).toBeGreaterThan(s1 * 1.6);
  await expect(page.locator('.sel-dot, [data-handle]')).toHaveCount(0);
  await page.screenshot({ path: `${SHOT}/frame-only.png` });
});

test('多條軌道：時間軸裡面可以上下滑，每一列都點得到', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm', 'solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await closePanel(page);
  await expect(clips(page)).toHaveCount(4);
  // 時間軸佔剩下的高度、軌道多了就在時間軸裡上下滑（整頁不捲）；每一列都滑得到
  for (let i = 0; i < 4; i++) {
    await clips(page).nth(i).scrollIntoViewIfNeeded();
    await expect(clips(page).nth(i)).toBeInViewport({ ratio: 0.1 });
  }
  await page.screenshot({ path: `${SHOT}/timeline-all-rows.png` });
});

test('很小的文字也點得到；文字面板的「刪除」；全螢幕預覽', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByLabel('文字內容').fill('小');
  await closePanel(page);
  const st = await previewBox(page);
  const cx = st.x + st.width * 0.5;
  const cy = st.y + st.height * 0.5;
  await pinch(page, { cx, cy, from: 200, to: 40 }); // 縮很小
  expect((await textTransform(page)).scale).toBeLessThan(0.3);
  await deselect(page); // 預覽上點空白處不再取消選取（使用者 2026-11-12）：改點時間軸空白
  await expect(page.getByTestId('selbox')).toHaveCount(0);
  await page.mouse.click(cx + 12, cy); // 點在字旁邊 12px 內
  await expect(page.getByTestId('selbox')).toBeVisible();

  await openTab(page, '文字');
  await page.getByRole('button', { name: '刪除這個文字' }).tap();
  await expect(clips(page)).toHaveCount(1);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: '全螢幕預覽' }).tap();
  await expect(page.locator('.timeline')).toBeHidden();
  await page.getByRole('button', { name: '結束全螢幕預覽' }).tap();
  await expect(page.locator('.timeline')).toBeVisible();
});

test('空專案：「匯入影片或照片」在預覽中央', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vc-debug', '1');
    localStorage.setItem('vc-skip-onboarding', '1');
  });
  await page.goto('./');
  await page.getByRole('button', { name: '新增專案' }).tap();
  await page.getByRole('button', { name: '建立空白專案' }).tap();
  const b = (await page.locator('.empty-import').boundingBox())!;
  const w = (await page.locator('.stage-wrap').boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(w.y);
  expect(b.y + b.height).toBeLessThanOrEqual(w.y + w.height);
  await page.screenshot({ path: `${SHOT}/empty-project.png` });
});

test('不用手勢也能調：圖層分頁與文字「版面」的整體大小／旋轉／置中／轉正（滑桿一步復原）', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  const setRange = (label: string, v: number) =>
    page.getByRole('slider', { name: label, exact: true }).evaluate((el, val) => {
      const input = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(val));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
  // 文字面板「版面」
  await page.getByRole('tablist', { name: '字卡設定' }).getByRole('tab', { name: '版面', exact: true }).tap();
  await setRange('整體大小', 150);
  await setRange('整體大小', 180);
  await setRange('旋轉', -30);
  let tf = await textTransform(page);
  expect(tf.scale).toBeCloseTo(1.8);
  expect(tf.rotation).toBe(-30);
  // 拖兩次大小滑桿＝一步復原
  await undo(page);
  await undo(page);
  expect((await textTransform(page)).scale).toBeCloseTo(1);
  await redo(page);
  await redo(page);

  // 圖層分頁：同樣的控制項；置中、轉正
  await openTab(page, '圖層');
  await expect(page.getByTestId('transform-controls')).toBeVisible();
  // 先把文字拖離中心
  const st = await previewBox(page);
  await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
  await page.mouse.down();
  await page.mouse.move(st.x + st.width * 0.7, st.y + st.height * 0.7, { steps: 6 });
  await page.mouse.up();
  expect((await textTransform(page)).x).toBeGreaterThan(0.6);
  await page.getByRole('button', { name: '置中', exact: true }).tap();
  await page.getByRole('button', { name: '轉正', exact: true }).tap();
  tf = await textTransform(page);
  expect(tf.x).toBe(0.5);
  expect(tf.y).toBe(0.5);
  expect(tf.rotation).toBe(0);
});

test('沒有影片、只有字卡時：預覽中央不放大的匯入鈕（不會蓋住字卡），字卡看得到', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vc-debug', '1');
    localStorage.setItem('vc-skip-onboarding', '1');
  });
  await page.goto('./');
  await page.getByRole('button', { name: '新增專案' }).tap();
  await page.getByRole('button', { name: '建立空白專案' }).tap();
  await expect(page.locator('.empty-import')).toBeVisible(); // 完全空的：有大匯入鈕
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByLabel('文字內容').fill('吃水餃');
  await expect(page.locator('.empty-import')).toHaveCount(0); // 有字卡了：不要蓋住
  // 預覽中間有白色的字，而且選取框看得到、沒有被別的東西蓋住
  await expect.poll(() => countColor(page, [255, 255, 255], 40, [0, 0.35, 1, 0.65])).toBeGreaterThan(200);
  await page.evaluate(() => window.scrollTo(0, 0));
  const sel = (await page.getByTestId('selbox').boundingBox())!;
  const topEl = await page.evaluate(
    ([x, y]) => (document.elementFromPoint(x!, y!) as HTMLElement | null)?.className ?? '',
    [sel.x + sel.width / 2, sel.y + sel.height / 2],
  );
  expect(topEl).not.toContain('empty-import');
  await page.screenshot({ path: `${SHOT}/text-only-project.png` });
  // 主軌的匯入入口還在（時間軸上的＋）
  await expect(page.getByRole('button', { name: '加入素材' })).toBeVisible();
});

test('設定頁顯示版本（建置時間＋commit），讓使用者確認手機上是不是新版', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-skip-onboarding', '1'));
  await page.goto('./#/settings');
  await expect(page.getByTestId('app-version')).toContainText(
    /20\d\d-\d\d-\d\d \d\d:\d\d（[0-9a-f]{7}|dev）/,
  );
});
