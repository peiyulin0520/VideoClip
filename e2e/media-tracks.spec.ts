import { expect, test } from '@playwright/test';
import {
  addOverlays,
  clips,
  closePanel,
  createProjectWith,
  fixture,
  openLayerList,
  openTab,
  project,
  showTimeline,
  undo,
} from './helpers';

// 2026-11-12：主軌與疊加合併成「影像軌」；影像／特效／字卡／音訊分區；刪除並補齊；舊專案（v1）自動轉換

type Tr = {
  id: string;
  kind: string;
  name: string;
  items: { id: string; start: number; duration: number }[];
};
const tracks = async (page: import('@playwright/test').Page) =>
  (await project(page)).tracks as unknown as Tr[];

test('舊專案（v1：主軌＋疊加，字卡在疊加下面）打開後自動轉成影像軌：名稱、片段時間不變，字卡搬到影像上面並提醒一次', async ({
  page,
}) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm']);
  await addOverlays(page, ['solid-green.webm']);
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  const before = await tracks(page);
  expect(before.map((t) => t.kind)).toEqual(['media', 'media', 'text']);
  const startsBefore = before.flatMap((t) => t.items.map((i) => i.start));
  const pid = page.url().split('/p/')[1]!;
  await page.waitForTimeout(1300);
  await page.getByRole('link', { name: '回首頁' }).tap();

  // 把資料庫裡的專案改回舊格式（v1）：主軌、疊加、字卡在疊加下面、主軌片段帶 gap
  await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('videoclip');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    type LooseTrack = { kind: string; name: string; items: { gap?: number }[] };
    const p = await new Promise<{ tracks: LooseTrack[]; version: number }>((res) => {
      const g = store.get(id);
      g.onsuccess = () => res(g.result);
    });
    const [m, o, t] = p.tracks;
    m.kind = 'main';
    m.name = '主軌';
    m.items[1].gap = 0;
    o.kind = 'overlay';
    o.name = '疊加 1';
    p.tracks = [m, t, o];
    p.version = 1;
    store.put(p);
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  }, pid);

  await page.reload();
  await page.getByRole('link', { name: /開啟/ }).first().tap();
  await expect(clips(page).first()).toBeVisible();
  const after = await tracks(page);
  expect(((await project(page)) as unknown as { version: number }).version).toBe(2);
  expect(after.map((t) => t.kind)).toEqual(['media', 'media', 'text']);
  expect(after.map((t) => t.name)).toEqual(['影像 1', '影像 2', '文字 1']);
  expect(after.flatMap((t) => t.items.map((i) => i.start))).toEqual(startsBefore);
  await expect(page.locator('.toast').filter({ hasText: '圖層順序已經調整' })).toBeVisible();
});

test('刪除只刪這一段、留空位；空位裡的 ← 讓後面的往前接；都是一步復原', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm', 'clip-c.webm']); // 2 + 1.6 + 3 秒
  const starts = async () => (await tracks(page))[0]!.items.map((i) => Math.round(i.start * 10) / 10);
  expect(await starts()).toEqual([0, 2, 3.6]);

  await closePanel(page);
  await clips(page).first().tap();
  await page.getByTestId('tool-edit.delete').tap();
  expect(await starts()).toEqual([2, 3.6]); // 後面的沒動，前面是空位
  await expect(page.getByTestId('gap')).toHaveCount(1); // 開場留白的虛線框
  await undo(page);
  expect(await starts()).toEqual([0, 2, 3.6]);

  await closePanel(page);
  await clips(page).first().tap();
  await page.getByTestId('tool-edit.delete').tap();
  await page.getByTestId('gap').tap(); // 空位裡的 ←：後面的往前接上
  expect(await starts()).toEqual([0, 1.6]);
  await undo(page);
  expect(await starts()).toEqual([0, 2, 3.6]);
});

test('軌道預設順序：新增字卡、音樂、影像後是 影像 → 字卡 → 音訊；時間軸上音訊畫在最下面；圖層分頁可以讓影像換到字卡上面、音訊不參與', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fixture('music-4s.wav'));
  await expect(page.locator('[data-testid="clip"][data-kind="audio"]')).toHaveCount(1, { timeout: 20_000 });
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  await addOverlays(page, ['solid-green.webm']); // 最後加的影像軌：仍在字卡下面
  await addOverlays(page, ['solid-blue.webm']);
  expect((await tracks(page)).map((t) => t.kind)).toEqual(['media', 'media', 'media', 'text', 'audio']);

  // 時間軸由上到下：字卡、影像（上到下）、音訊
  await showTimeline(page);
  const kinds = await page
    .getByTestId('track')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind));
  expect(kinds).toEqual(['text', 'media', 'media', 'media', 'audio']);

  // 圖層分頁（X9）：最上面那條影像軌往上一層＝換到字卡上面（跨類別）；再往上一層＝已經最上面
  await openLayerList(page);
  await page.getByRole('button', { name: '影像 3 往上一層' }).tap();
  expect((await tracks(page)).map((t) => t.kind)).toEqual(['media', 'media', 'text', 'media', 'audio']);
  await page.getByRole('button', { name: '影像 3 往上一層' }).tap();
  await expect(page.locator('.toast').filter({ hasText: '最上面的圖層' })).toBeVisible();
  expect((await tracks(page)).map((t) => t.kind)).toEqual(['media', 'media', 'text', 'media', 'audio']);
  // 時間軸（播放軸）還是照類別分段：字卡、影像（上到下）、音訊；影像那一類中間夾了字卡 → 標題有「已穿插」
  await showTimeline(page);
  const after = await page
    .getByTestId('track')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind));
  expect(after).toEqual(['text', 'media', 'media', 'media', 'audio']);
  await expect(
    page.locator('[data-testid="cat-head"][data-kind="media"]').getByTestId('cat-mixed'),
  ).toBeVisible();
});

test('每一條影像軌地位一樣：最下面那條也能往上換、能放在任何時間；兩條影像軌的上下順序決定誰蓋住誰', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  const [base, over] = await tracks(page);
  await openLayerList(page);
  // 原本的「主軌」（影像 1）也有往上一層
  await page.getByRole('button', { name: '影像 1 往上一層' }).tap();
  const swapped = await tracks(page);
  expect(swapped.map((t) => t.id)).toEqual([over!.id, base!.id]);
});
