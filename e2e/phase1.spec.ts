import { expect, test } from '@playwright/test';
import {
  clips,
  createProjectWith,
  expectToast,
  fixture,
  isGray,
  isRed,
  isWhite,
  project,
  samplePreview,
  seekTo,
  selectedIndex,
  timeText,
  showTimeline,
} from './helpers';

const SHOT = 'docs/screenshots/phase1';

test('兩個專案各匯入 2 個素材：重新整理後都還在，編輯一個不影響另一個', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm']); // 專案 1：2.0 + 1.6 秒
  await expect(page.getByTestId('time')).toContainText('/ 0:03.6');
  await page.screenshot({ path: `${SHOT}/editor-two-clips.png` });
  await createProjectWith(page, ['clip-c.webm', 'photo.png']); // 專案 2：3 + 3 秒
  await expect(page.getByTestId('time')).toContainText('/ 0:06.0');

  await page.getByRole('link', { name: '回首頁' }).tap();
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await page.screenshot({ path: `${SHOT}/home-two-projects.png` });

  // 重新整理後資料還在（IndexedDB + OPFS）
  await page.reload();
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await expect(page.getByTestId('project-card').filter({ hasText: '新專案 1' })).toBeVisible();
  await expect(page.getByTestId('project-card').filter({ hasText: '新專案 2' })).toBeVisible();

  // 開專案 1，刪掉一個片段，再回首頁
  await page.getByRole('link', { name: '開啟 新專案 1' }).tap();
  await expect(clips(page)).toHaveCount(2);
  await clips(page).first().tap();
  await page.getByRole('button', { name: '刪除並補齊', exact: true }).tap(); // 後面的往前接上，總長度才會變短
  await expect(clips(page)).toHaveCount(1);
  await page.getByRole('link', { name: '回首頁' }).tap();
  // 首頁是從資料庫讀的：封面角落的長度變成剩下那段（clip-b 1.6 秒）＝ 離開編輯器時已立即存檔
  await expect(page.getByTestId('project-card').filter({ hasText: '新專案 1' })).toContainText('0:01.6');

  // 專案 2 不受影響；專案 1 的修改有存下來（離開編輯器時立即存檔）
  await page.reload();
  await page.getByRole('link', { name: '開啟 新專案 2' }).tap();
  await expect(clips(page)).toHaveCount(2);
  await expect(page.getByTestId('time')).toContainText('/ 0:06.0');
  await page.getByRole('link', { name: '回首頁' }).tap();
  await page.getByRole('link', { name: '開啟 新專案 1' }).tap();
  await expect(clips(page)).toHaveCount(1);
  // 重新整理後素材檔還在、能播放
  await page.reload();
  await expect(clips(page)).toHaveCount(1);
  await page.getByRole('button', { name: '播放' }).tap();
  await expect.poll(async () => timeText(page), { timeout: 5000 }).not.toMatch(/^0:00\.0/);
});

test('專案卡片選單：改名、複製、刪除', async ({ page }) => {
  await createProjectWith(page, ['clip-b.webm']);
  await page.getByRole('link', { name: '回首頁' }).tap();
  await page.getByRole('button', { name: '新專案 1 的選單' }).tap();
  await page.getByRole('button', { name: '改名' }).tap();
  await page.getByLabel('新名稱').fill('旅行 vlog');
  await page.getByRole('button', { name: '確定' }).tap();
  await expect(page.getByTestId('project-card').filter({ hasText: '旅行 vlog' })).toBeVisible();

  await page.getByRole('button', { name: '旅行 vlog 的選單' }).tap();
  await page.getByRole('button', { name: '複製' }).tap();
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await expect(page.getByTestId('project-card').filter({ hasText: '旅行 vlog 副本' })).toBeVisible();

  // 副本的素材是獨立一份：開得起來、可以播
  await page.getByRole('link', { name: '開啟 旅行 vlog 副本' }).tap();
  await expect(clips(page)).toHaveCount(1);
  await page.getByRole('link', { name: '回首頁' }).tap();

  await page.getByRole('button', { name: '旅行 vlog 的選單' }).tap();
  await page.getByRole('button', { name: '刪除', exact: true }).tap();
  await page.getByRole('dialog').getByRole('button', { name: '刪除', exact: true }).tap();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
});

test('編輯器工具列：每個按鈕都有反應', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm', 'clip-c.webm']);
  await expect(page.getByTestId('time')).toContainText('/ 0:06.6');

  // 沒選片段時，需要選取的按鈕會提示
  await page.getByRole('button', { name: '刪除', exact: true }).tap();
  await expectToast(page, '請先點選一個片段');

  // 點選片段
  await clips(page).first().tap();
  expect(await selectedIndex(page)).toBe(0);

  // 複製：複製品放在原片段後面最近的空位（後面被占住就接在最後）；自由擺放，其他片段不動
  await page.getByRole('button', { name: '複製' }).tap();
  await expect(clips(page)).toHaveCount(4);
  expect(await selectedIndex(page)).toBe(3);
  expect((await project(page)).tracks[0]!.items.map((i) => i.start).slice(0, 3)).toEqual([0, 2, 3.6]);

  // 變速：2 倍速 → 這個 2 秒的片段變 1 秒
  const totalBefore = await timeText(page);
  await page.getByRole('button', { name: '變速' }).tap();
  await expect(page.getByTestId('speed-value')).toHaveText('1x');
  await page.getByRole('button', { name: '2x', exact: true }).tap();
  await expect(page.getByTestId('speed-value')).toHaveText('2x');
  await page.screenshot({ path: `${SHOT}/editor-speed-panel.png` });
  await page.getByRole('button', { name: '完成' }).tap();
  expect(await timeText(page)).not.toBe(totalBefore);
  await expect(clips(page).nth(3)).toContainText('2x');

  // 音量：靜音
  await page.getByRole('button', { name: '音量' }).tap();
  await page.getByRole('button', { name: '關閉聲音', exact: true }).tap();
  await expect(page.getByTestId('volume-value')).toHaveText('0%');
  await page.getByRole('button', { name: '完成' }).tap();
  await expect(clips(page).nth(3)).toContainText('靜音');

  // 完整 / 填滿
  await page.getByRole('button', { name: '完整' }).tap();
  await expectToast(page, '完整顯示');
  await expect(page.getByRole('button', { name: '填滿' })).toBeVisible();
  await page.getByRole('button', { name: '填滿' }).tap();

  // 分割：把播放頭移到 clip-b（1.6s）中間再分割
  await clips(page).nth(1).tap();
  const n = await clips(page).count();
  const start = (await clipsStartSeconds(page))[1]!;
  await seekTo(page, start + 0.8);
  await page.getByRole('button', { name: '分割' }).tap();
  await expect(clips(page)).toHaveCount(n + 1);
  // 播放頭在邊緣不能分割
  await seekTo(page, 0);
  await page.waitForTimeout(450);
  await clips(page).first().tap();
  await page.getByRole('button', { name: '分割' }).tap();
  await expectToast(page, '播放頭要在片段中間');

  // 刪除 / 復原 / 重做（隔一下再點同一個片段：連點兩下會跳出命名面板）
  await page.waitForTimeout(450);
  await clips(page).first().tap();
  const count = await clips(page).count();
  await page.getByRole('button', { name: '刪除', exact: true }).tap();
  await expect(clips(page)).toHaveCount(count - 1);
  await page.getByRole('button', { name: '復原' }).tap();
  await expect(clips(page)).toHaveCount(count);
  await page.getByRole('button', { name: '重做' }).tap();
  await expect(clips(page)).toHaveCount(count - 1);

  // 縮放時間軸
  const w0 = (await clips(page).first().boundingBox())!.width;
  await page.getByRole('button', { name: '放大時間軸' }).tap();
  await expect.poll(async () => (await clips(page).first().boundingBox())!.width).toBeGreaterThan(w0 * 1.3);
  await page.getByRole('button', { name: '縮小時間軸' }).tap();

  // 匯入：從工具列再加一張照片
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '匯入' }).tap(),
  ]);
  await chooser.setFiles(fixture('photo.png'));
  await expect(clips(page)).toHaveCount(count);
  await expectToast(page, '已匯入 1 個素材');

  // 改專案名稱
  await page.getByRole('button', { name: '專案名稱', exact: true }).tap();
  await page.getByLabel('專案名稱輸入').fill('我的片頭');
  await page.getByRole('button', { name: '確定' }).tap();
  await expect(page.getByRole('button', { name: '專案名稱', exact: true })).toContainText('我的片頭');
});

async function clipsStartSeconds(page: import('@playwright/test').Page): Promise<number[]> {
  // 以 60px/秒、各片段的 left 換算（放大前）
  return page.getByTestId('clip').evaluateAll((els) => {
    const lefts = els.map((e) => parseFloat((e as HTMLElement).style.left));
    return lefts.map((l) => (l - lefts[0]!) / 60);
  });
}

test('修剪頭尾：拖把手會改片段長度，素材範圍受限', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm']);
  await clips(page).first().tap();
  await expect(page.getByTestId('trim-end')).toBeVisible();

  const drag = async (testId: string, dx: number) => {
    const box = (await page.getByTestId(testId).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
  };

  await expect(clips(page).first()).toContainText('2.0s');
  await drag('trim-end', -60); // 60px = 1 秒
  await expect(clips(page).first()).toContainText('1.0s');
  await drag('trim-end', 600); // 往右拉回，最多回到素材原長 2.0
  await expect(clips(page).first()).toContainText('2.0s');
  await drag('trim-start', 60); // 頭端切掉 1 秒
  await expect(clips(page).first()).toContainText('1.0s');
  await drag('trim-start', -600); // 還原到素材起點
  await expect(clips(page).first()).toContainText('2.0s');

  // 一次拖曳 = 一步復原
  await drag('trim-end', -60);
  await expect(clips(page).first()).toContainText('1.0s');
  await page.getByRole('button', { name: '復原' }).tap();
  await expect(clips(page).first()).toContainText('2.0s');
});

test('長按拖曳片段可以移動時間：目標位置被占住就移到最近的空位，其他片段不動', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm', 'clip-c.webm']);
  const before = (await project(page)).tracks[0]!.items;
  const end = Math.max(...before.map((i) => i.start + i.duration));
  // 把第 1 個（2 秒）拖到最後面（編輯器整頁捲動：先捲到看得到時間軸）
  await showTimeline(page);
  const first = (await clips(page).nth(0).boundingBox())!;
  const x = first.x + first.width / 2;
  const y = first.y + first.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(550); // 長按
  await expect(clips(page).first()).toHaveClass(/dragging/);
  await page.mouse.move(x + 100, y, { steps: 6 });
  await page.screenshot({ path: `${SHOT}/reorder-dragging.png` });
  await page.mouse.move(x + 330, y, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await project(page)).tracks[0]!.items[0]!.start, { timeout: 5000 })
    .toBeGreaterThan(end - 0.1); // 中間都被占住，放到最後面
  const after = (await project(page)).tracks[0]!.items;
  expect(after[1]!.start).toBeCloseTo(before[1]!.start, 3);
  expect(after[2]!.start).toBeCloseTo(before[2]!.start, 3);
});

test('播放：時間前進、影片真的在解碼、跨片段會無縫換到下一支', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm']);

  // 預覽畫面真的有影像：第 1 支（testsrc2）最左邊是紅色條，第 2 支（色條）最左邊是灰色
  await expect.poll(async () => isRed(await samplePreview(page, 0.1, 0.5)), { timeout: 8000 }).toBe(true);

  // 從第 1.5 秒開始播，會跨過 2.0 秒進入第 2 支
  await seekTo(page, 1.5);
  await page.getByRole('button', { name: '播放' }).tap();
  await expect(page.getByRole('button', { name: '暫停' })).toBeVisible();
  await expect.poll(async () => isGray(await samplePreview(page, 0.1, 0.5)), { timeout: 6000 }).toBe(true);
  await page.screenshot({ path: `${SHOT}/playing-second-clip.png` });

  // 播到結尾自動停止
  await expect(page.getByRole('button', { name: '播放' })).toBeVisible({ timeout: 6000 });
  expect(await timeText(page)).toMatch(/^0:03\.6 \/ 0:03\.6/);
});

test('照片素材：預設 3 秒、預覽會顯示、不能變速', async ({ page }) => {
  await createProjectWith(page, ['photo.png']);
  await expect(page.getByTestId('time')).toContainText('/ 0:03.0');
  // photo.png 正中間是白色圓
  await expect.poll(async () => isWhite(await samplePreview(page, 0.5, 0.5)), { timeout: 8000 }).toBe(true);
  await clips(page).first().tap();
  await page.getByRole('button', { name: '變速' }).tap();
  await expectToast(page, '照片不能變速');
  await page.getByRole('button', { name: '音量' }).tap();
  await expectToast(page, '照片沒有聲音');
});

test('不支援的檔案會提示，不會壞掉', async ({ page }) => {
  await createProjectWith(page, ['clip-b.webm']);
  await page.getByTestId('file-input').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expectToast(page, /notes\.txt/);
  await expect(clips(page)).toHaveCount(1);
});
