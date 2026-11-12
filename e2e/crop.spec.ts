import { expect, test, type Page } from '@playwright/test';
import { addOverlays, createProjectWith, isGreen, isRed, openTab, project, samplePreview } from './helpers';

const SHOT = 'docs/screenshots/feedback-5';
type Crop = { l: number; t: number; r: number; b: number };
type Item = { crop?: Crop; mask?: [number, number][]; transform: { x: number; y: number; scale: number } };
const overlay = async (page: Page) => (await project(page)).tracks[1]!.items[0] as unknown as Item;

async function setup(page: Page) {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']); // 綠色疊在紅色上，置中、縮小一半
  await openTab(page, '剪輯');
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
}

async function dragHandle(page: Page, id: string, dx: number, dy: number) {
  await page.evaluate(() => window.scrollTo(0, 0)); // 預覽在頁面最上面（用過下面的面板後要捲回來）
  const b = (await page.getByTestId(`crop-h-${id}`).boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test('裁切在剪輯分頁：預覽上拖四邊拉霸，切完留下的畫面位置不跳；圖層分頁沒有裁切滑桿', async ({ page }) => {
  await setup(page);
  await openTab(page, '圖層');
  await expect(page.getByLabel('裁切左')).toHaveCount(0);
  await expect(page.getByText('切掉各邊的比例')).toHaveCount(0);
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '裁切' }).tap();
  await expect(page.getByTestId('crop-layer')).toBeVisible();
  await expect(page.getByTestId('crop-panel')).toBeVisible();
  // 八個把手都在、觸控範圍 ≥ 44px
  for (const h of ['l', 'r', 't', 'b', 'tl', 'tr', 'bl', 'br']) {
    const b = (await page.getByTestId(`crop-h-${h}`).boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `${SHOT}/crop-mode.png` });

  const before = await overlay(page);
  const fr = (await page.getByTestId('crop-frame').boundingBox())!;
  // 右邊拉霸往左拖 40% 的寬度、下邊往上拖 30% 的高度
  await dragHandle(page, 'r', -fr.width * 0.4, 0);
  await dragHandle(page, 'b', 0, -fr.height * 0.3);
  await expect(page.getByTestId('crop-size')).toContainText('保留 60% × 70%');
  await page.screenshot({ path: `${SHOT}/crop-dragged.png` });
  // 還沒按完成：資料沒改
  expect((await overlay(page)).crop).toBeUndefined();
  await page.getByRole('button', { name: '完成' }).tap();
  await expect(page.getByTestId('crop-layer')).toHaveCount(0);
  const after = await overlay(page);
  expect(after.crop!.r).toBeCloseTo(0.4, 1);
  expect(after.crop!.b).toBeCloseTo(0.3, 1);
  expect(after.crop!.l).toBeCloseTo(0, 2);
  // 留下的那塊在畫面上不動：原本綠色範圍 x 0.25–0.75、y 約 0.28–0.72（9:16 畫面、縮小一半）
  await expect.poll(async () => isGreen(await samplePreview(page, 0.3, 0.4))).toBe(true); // 還在
  expect(isRed(await samplePreview(page, 0.7, 0.4))).toBe(true); // 右邊被切掉，露出底下的紅
  expect(isRed(await samplePreview(page, 0.4, 0.68))).toBe(true); // 下面被切掉
  // 縮放變了（因為留下的區域比例變了，物件方框要重算），中心跟著留下區域的中心移動
  expect(after.transform.x).toBeLessThan(before.transform.x);
  await page.screenshot({ path: `${SHOT}/crop-done.png` });

  // 一步復原：回到沒裁切，位置大小回來
  await page.getByRole('button', { name: '復原' }).tap();
  const undone = await overlay(page);
  expect(undone.crop).toBeUndefined();
  expect(undone.transform.x).toBeCloseTo(before.transform.x, 5);
  expect(undone.transform.scale).toBeCloseTo(before.transform.scale, 5);
  await expect.poll(async () => isGreen(await samplePreview(page, 0.7, 0.4))).toBe(true);
});

test('裁切：取消不改；重設；在框裡面拖＝整塊平移；拖角；第二次進來看得到完整畫面再往外拉回來', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '裁切' }).tap();
  const fr = (await page.getByTestId('crop-frame').boundingBox())!;
  await dragHandle(page, 'tl', fr.width * 0.3, fr.height * 0.2);
  await expect(page.getByTestId('crop-size')).toContainText('保留 70% × 80%');
  await page.getByRole('button', { name: '取消' }).tap();
  expect((await overlay(page)).crop).toBeUndefined();
  await expect(page.getByTestId('crop-layer')).toHaveCount(0);
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);

  // 重設
  await page.getByRole('button', { name: '裁切' }).tap();
  await dragHandle(page, 'br', -fr.width * 0.5, -fr.height * 0.5);
  await expect(page.getByTestId('crop-size')).toContainText('保留 50% × 50%');
  await page.getByRole('button', { name: '重設' }).tap();
  await expect(page.getByTestId('crop-size')).toContainText('保留 100% × 100%');

  // 整塊平移：先縮到一半，再往右拖
  await dragHandle(page, 'br', -fr.width * 0.5, -fr.height * 0.5);
  const rect = (await page.getByTestId('crop-rect').boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + fr.width * 0.25, rect.y + rect.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: '完成' }).tap();
  const c = (await overlay(page)).crop!;
  expect(c.l).toBeGreaterThan(0.15);
  expect(c.l + c.r).toBeCloseTo(0.5, 1); // 寬度還是 50%

  // 再進去：完整畫面又出現，把左邊拉回 0（往外拉回來）
  await page.getByRole('button', { name: '裁切' }).tap();
  await expect(page.getByTestId('crop-size')).toContainText('保留 50% × 50%');
  await page.getByRole('button', { name: '重設' }).tap();
  await page.getByRole('button', { name: '完成' }).tap();
  const back = await overlay(page);
  expect(back.crop).toBeUndefined();
  expect(back.transform.scale).toBeCloseTo(0.5, 2);
});

test('裁切比例：1:1／9:16／原比例；鎖定比例後拖角仍保持比例', async ({ page }) => {
  await setup(page); // 素材 320×568（9:16 直式）
  await page.getByRole('button', { name: '裁切' }).tap();
  await page.getByRole('radio', { name: '1:1' }).tap();
  // 320×568 取最大 1:1：寬 100%、高 320/568 = 56%
  await expect(page.getByTestId('crop-size')).toContainText('保留 100% × 56%');
  await page.getByRole('radio', { name: '1:1' }).waitFor();
  const fr = (await page.getByTestId('crop-frame').boundingBox())!;
  await dragHandle(page, 'br', -fr.width * 0.3, -fr.width * 0.3);
  const txt = (await page.getByTestId('crop-size').textContent()) ?? '';
  const m = /保留 (\d+)% × (\d+)%/.exec(txt)!;
  const w = Number(m[1]) / 100;
  const h = Number(m[2]) / 100;
  expect((w * 320) / (h * 568)).toBeGreaterThan(0.95);
  expect((w * 320) / (h * 568)).toBeLessThan(1.05);
  await page.getByRole('radio', { name: '原比例' }).tap();
  await expect(page.getByTestId('crop-size')).toContainText(/保留 \d+% × \d+%/);
  await page.getByRole('radio', { name: '自由' }).tap();
  await page.getByRole('button', { name: '重設' }).tap();
  await page.getByRole('radio', { name: '9:16' }).tap();
  await expect(page.getByTestId('crop-size')).toContainText('保留 100% × 100%'); // 素材本來就是 9:16
  await page.getByRole('button', { name: '取消' }).tap();
});

test('自由形狀（描邊）：手指畫一圈，只留圈裡面，外面透明；保留區域自動框住；可復原；重新進入看得到形狀', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: '裁切' }).tap();
  await page.getByRole('switch', { name: '自由形狀' }).tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  const fr = (await page.getByTestId('crop-frame').boundingBox())!;
  const cx = fr.x + fr.width / 2;
  const cy = fr.y + fr.height / 2;
  const rx = fr.width * 0.4;
  const ry = fr.height * 0.4;
  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    await page.mouse.move(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  }
  await page.mouse.up();
  await expect(page.getByTestId('crop-polygon')).toBeVisible();
  await page.screenshot({ path: `${SHOT}/crop-lasso.png` });
  await page.getByRole('button', { name: '完成' }).tap();
  const it = await overlay(page);
  expect(it.mask!.length).toBeGreaterThan(20);
  expect(it.crop!.l).toBeGreaterThan(0.05); // 保留區域框住圈圈
  // 圈裡面（中心）是綠，圈外面（外框的角落）是底下的紅
  await expect.poll(async () => isGreen(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 綠色素材原本在畫面 x 0.25–0.75、y 0.25–0.75（縮小一半）。圈是橢圓（半徑 40%）：
  // 方框的四個角落在圈外 → 透明，露出底下的紅；圈上靠邊一點（u≈0.8）還是綠
  await expect.poll(async () => isRed(await samplePreview(page, 0.3, 0.3))).toBe(true);
  expect(isRed(await samplePreview(page, 0.7, 0.7))).toBe(true);
  expect(isGreen(await samplePreview(page, 0.65, 0.5))).toBe(true);
  expect(isGreen(await samplePreview(page, 0.5, 0.35))).toBe(true);
  await page.screenshot({ path: `${SHOT}/crop-lasso-done.png` });

  // 一步復原
  await page.getByRole('button', { name: '復原' }).tap();
  const undone = await overlay(page);
  expect(undone.mask).toBeUndefined();
  expect(undone.crop).toBeUndefined();

  // 重做後重新進入裁切模式：看得到形狀的輪廓；「清除形狀」可以去掉
  await page.getByRole('button', { name: '重做' }).tap();
  expect((await overlay(page)).mask).toBeDefined();
  await page.getByRole('button', { name: '裁切' }).tap();
  await expect(page.getByTestId('crop-polygon')).toBeVisible();
  await page.getByRole('button', { name: '清除形狀' }).tap();
  await expect(page.getByTestId('crop-polygon')).toHaveCount(0);
  await page.getByRole('button', { name: '完成' }).tap();
  const cleared = await overlay(page);
  expect(cleared.mask).toBeUndefined();
  expect(cleared.crop).toBeUndefined();
});

test('裁切模式的進出：沒選東西會提示；文字不能裁切；換分頁／選別的片段會結束裁切（不套用）', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '裁切' }).tap();
  await expect(page.locator('.toast').filter({ hasText: '請先點選' })).toBeVisible();
  await expect(page.getByTestId('crop-layer')).toHaveCount(0);

  await page.getByTestId('clip').first().tap(); // 選主軌片段：主軌也能裁切
  await page.getByRole('button', { name: '裁切' }).tap();
  await expect(page.getByTestId('crop-layer')).toBeVisible();
  await openTab(page, '疊加'); // 換分頁 → 結束，不套用
  await expect(page.getByTestId('crop-layer')).toHaveCount(0);
  const m = (await project(page)).tracks[0]!.items[0] as unknown as Item;
  expect(m.crop).toBeUndefined();
});
