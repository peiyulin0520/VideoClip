import { expect, test } from '@playwright/test';
import {
  addOverlays,
  createProjectWith,
  pinch,
  previewBox,
  project,
  selectedItemId,
  touchDrag,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-6/preview-select';

// 使用者 2026-11-12：「在預覽畫面可以直接點影片調整縮放大小，不用一定要點選拖拉軸的素材才能縮放，
// 因為往上滑時，可能不小心點到其他地方導致沒有選到素材」

const tapAt = async (page: import('@playwright/test').Page, nx: number, ny: number) => {
  const s = await previewBox(page);
  await page.mouse.click(s.x + s.width * nx, s.y + s.height * ny);
};

test('只有一支主軌影片：點預覽就選到、雙指縮小就變小（不用先點時間軸）', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  expect(await selectedItemId(page)).toBeNull();
  await tapAt(page, 0.5, 0.5);
  const main = (await project(page)).tracks[0]!.items[0]!;
  expect(await selectedItemId(page)).toBe(main.id);
  await expect(page.getByTestId('selbox')).toBeVisible();

  const s = await previewBox(page);
  await pinch(page, { cx: s.x + s.width / 2, cy: s.y + s.height / 2, from: 160, to: 80 });
  const tf = (await project(page)).tracks[0]!.items[0]!.transform;
  expect(tf.scale).toBeLessThan(0.7);
  expect(tf.scale).toBeGreaterThan(0.3);
  await page.screenshot({ path: `${SHOT}/main-pinched.png` });
});

test('選好之後：雙指不用剛好按在影片上，放在影片旁邊（外擴 40px 內）也能縮放已選的影片', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await tapAt(page, 0.5, 0.5);
  // 先縮小到露出黑邊
  const s = await previewBox(page);
  await pinch(page, { cx: s.x + s.width / 2, cy: s.y + s.height / 2, from: 160, to: 60 });
  const small = (await project(page)).tracks[0]!.items[0]!.transform.scale;
  // 影片縮小後半寬 = s.width * small / 2；第一根手指落在影片右邊外面 25px、第二根在更外面
  const edge = s.x + s.width / 2 + (s.width * small) / 2;
  await pinch(page, { cx: edge + 25 + 20, cy: s.y + s.height / 2, from: 40, to: 120 });
  const big = (await project(page)).tracks[0]!.items[0]!.transform.scale;
  expect(big).toBeGreaterThan(small * 1.5);
});

test('點到空白的地方不會取消選取', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await tapAt(page, 0.5, 0.5);
  const id = (await project(page)).tracks[0]!.items[0]!.id;
  const s = await previewBox(page);
  await pinch(page, { cx: s.x + s.width / 2, cy: s.y + s.height / 2, from: 160, to: 50 }); // 縮成小的
  await tapAt(page, 0.04, 0.04); // 角落：這裡沒有東西
  expect(await selectedItemId(page)).toBe(id);
});

test('在預覽上往上／往下滑是捲頁面，不會選到東西也不會取消選取', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await page.evaluate(() => window.scrollTo(0, 0));
  const s = await previewBox(page);
  // 沒選取時，在滿版影片上滑 → 捲頁面、沒有選取
  await touchDrag(page, { x: s.x + s.width / 2, y: s.y + s.height * 0.8 }, { x: s.x + s.width / 2, y: s.y + s.height * 0.2 });
  expect(await selectedItemId(page)).toBeNull();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(20);
});

test('疊在一起：第一次點選到最上面的、再點一次換下面那層（主軌），再點回最上面；「查看圖層」可以直接選', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  const p = await project(page);
  const mainId = p.tracks[0]!.items[0]!.id;
  const overId = p.tracks[1]!.items[0]!.id;
  expect(await selectedItemId(page)).toBe(overId); // 新加的疊加自動選取

  await tapAt(page, 0.5, 0.5); // 已選的再點一次 → 換下面那層
  expect(await selectedItemId(page)).toBe(mainId);
  await tapAt(page, 0.5, 0.5);
  expect(await selectedItemId(page)).toBe(overId);

  // 查看圖層：列出 2 個（上面的在前面），點主軌那個
  await page.getByRole('button', { name: '查看圖層' }).tap();
  const rows = page.getByTestId('peek-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-item-id', overId);
  await page.screenshot({ path: `${SHOT}/layer-peek.png` });
  await rows.nth(1).tap();
  expect(await selectedItemId(page)).toBe(mainId);
  await expect(page.getByTestId('layer-peek')).toHaveCount(0);
});
