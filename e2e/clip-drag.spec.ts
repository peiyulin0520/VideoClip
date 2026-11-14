import { expect, test, type Page } from '@playwright/test';
import { addOverlays, createProjectWith, openTab, project, showTimeline } from './helpers';

// 2026-11-12 使用者：「直接在拖拉軸長按拖移各種素材到不同圖層及不同位置……影像只能放影像、音效只能放音效、字卡只能放字卡」

const SHOT = 'docs/screenshots/feedback-6/clip-drag';
type Tr = { id: string; kind: string; items: { id: string; start: number; duration: number }[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];

async function rowCenter(page: Page, trackId: string) {
  const b = (await page.locator(`[data-testid="track"][data-track-id="${trackId}"]`).boundingBox())!;
  return b.y + b.height / 2;
}
/** 軌道上緣往下 offset px（軌道變矮之後，放置區把列推下來的位置離按下去的點不到 12px，所以點靠上緣一點） */
async function rowTop(page: Page, trackId: string, offset: number) {
  const b = (await page.locator(`[data-testid="track"][data-track-id="${trackId}"]`).boundingBox())!;
  return b.y + offset;
}
async function clipCenter(page: Page, itemId: string) {
  const b = (await page.locator(`[data-testid="clip"][data-item-id="${itemId}"]`).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
/** 長按 → 移到 (x, y) → （可先檢查）→ 放開 */
async function longPressDrag(
  page: Page,
  itemId: string,
  to: { dx?: number; y?: () => Promise<number> },
  release = true,
) {
  const from = await clipCenter(page, itemId);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(550); // 長按 400ms
  await expect(page.locator(`[data-testid="clip"][data-item-id="${itemId}"]`)).toHaveClass(/dragging/);
  await page.mouse.move(from.x + 5, from.y + 5, { steps: 2 }); // 版面出現放置區後再量位置
  const y = to.y ? await to.y() : from.y;
  await page.mouse.move(from.x + (to.dx ?? 0), y, { steps: 10 });
  if (release) await page.mouse.up();
}

test('長按影像片段拖到另一條影像軌、時間往右：換軌道、換時間，原軌道留空位；一步復原', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']); // 2 秒
  await addOverlays(page, ['solid-green.webm']); // 影像 2（上面那條）
  const [base, over] = await tracks(page);
  const clipA = base!.items[0]!.id;
  await showTimeline(page);
  // 影像 1 的片段往上拖到影像 2、再往右 5 秒（300px）
  await longPressDrag(page, clipA, { dx: 300, y: () => rowTop(page, over!.id, 6) }, false);
  await expect(page.locator(`[data-testid="track"][data-track-id="${over!.id}"]`)).toHaveClass(/drop-ok/);
  await page.screenshot({ path: `${SHOT}/dragging-to-other-track.png` });
  await page.mouse.up();
  const after = await tracks(page);
  expect(after[0]!.items).toHaveLength(0); // 原軌道留空位
  expect(after[1]!.items.map((i) => i.id)).toContain(clipA);
  const moved = after[1]!.items.find((i) => i.id === clipA)!;
  expect(moved.start).toBeGreaterThan(4.5); // 影像 2 的綠色 0–4 秒，所以放在後面的空位

  await page.getByRole('button', { name: '復原' }).tap();
  const undone = await tracks(page);
  expect(undone[0]!.items.map((i) => i.id)).toEqual([clipA]);
  expect(undone[0]!.items[0]!.start).toBe(0);
});

test('影像片段拖到字卡軌：變灰、放開彈回原位並提示「只能放在…的軌道上」', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']);
  await openTab(page, '文字');
  await page.getByRole('button', { name: /新增文字/ }).tap();
  const [media, text] = await tracks(page);
  const clipA = media!.items[0]!.id;
  await showTimeline(page);
  await longPressDrag(page, clipA, { y: () => rowCenter(page, text!.id) }, false);
  await expect(page.locator(`[data-testid="track"][data-track-id="${text!.id}"]`)).toHaveClass(/drop-bad/);
  await page.screenshot({ path: `${SHOT}/dragging-to-wrong-kind.png` });
  await page.mouse.up();
  await expect(page.locator('.toast').filter({ hasText: '已放回原位' })).toBeVisible();
  const after = await tracks(page);
  expect(after[0]!.items.map((i) => i.id)).toEqual([clipA]);
  expect(after[0]!.items[0]!.start).toBe(0);
  expect(after[1]!.items).toHaveLength(1); // 字卡還在字卡軌
});

test('拖到影像區上面或下面的「＋ 新增一軌」：多一條影像軌，片段放進去', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']);
  await addOverlays(page, ['solid-green.webm']);
  const before = await tracks(page);
  const clipA = before[0]!.items[0]!.id;
  await showTimeline(page);
  // 往上拖到影像區最上面的放置區
  await longPressDrag(
    page,
    clipA,
    {
      y: async () => {
        const b = (await page.locator('[data-testid="new-track-slot"][data-edge="top"]').boundingBox())!;
        return b.y + b.height / 2;
      },
    },
    false,
  );
  await expect(page.locator('[data-testid="new-track-slot"][data-edge="top"]')).toHaveClass(/hot/);
  await page.screenshot({ path: `${SHOT}/dragging-to-new-track.png` });
  await page.mouse.up();
  const after = await tracks(page);
  expect(after.map((t) => t.kind)).toEqual(['media', 'media', 'media']);
  expect(after[2]!.items.map((i) => i.id)).toEqual([clipA]); // 新的在影像區最上面
  expect(after[0]!.items).toHaveLength(0);
});

test('沒有長按、直接滑：是捲動時間軸，片段不動', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']);
  const clipA = (await tracks(page))[0]!.items[0]!.id;
  await showTimeline(page);
  const from = await clipCenter(page, clipA);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 80, from.y, { steps: 8 }); // 立刻拖（沒等 400ms）
  await page.mouse.up();
  const after = await tracks(page);
  expect(after[0]!.items[0]!.start).toBe(0);
  expect(after[0]!.items).toHaveLength(1);
});
