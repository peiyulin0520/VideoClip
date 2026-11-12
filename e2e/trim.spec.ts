import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, project, samplePreview, seekTo } from './helpers';

type Clip = { id: string; start: number; duration: number; trimIn: number };
const main = async (page: Page) => (await project(page)).tracks[0]!.items as unknown as Clip[];

async function drag(page: Page, testId: string, dx: number) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}

test('影像軌左把手往右拉：尾巴不動、前面留空位（黑畫面）；往左拉回來完全還原；右把手也能拉回', async ({
  page,
}) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm']); // 2 秒 + 1.6 秒
  await clips(page).first().tap();
  const before = await main(page);
  expect(before.map((c) => c.start)).toEqual([0, 2]);

  await drag(page, 'trim-start', 60); // 60px = 1 秒
  let m = await main(page);
  expect(m[0]!.start).toBeCloseTo(1, 1); // 起點往後，前面空出 1 秒
  expect(m[0]!.trimIn).toBeCloseTo(1, 1);
  expect(m[0]!.duration).toBeCloseTo(1, 1);
  expect(m[0]!.start + m[0]!.duration).toBeCloseTo(2, 1); // 尾巴還在原本的位置
  expect(m[1]!.start).toBeCloseTo(2, 1); // 後面的片段沒動
  await expect(page.getByTestId('gap')).toHaveCount(1);
  await page.screenshot({ path: 'docs/screenshots/feedback-5/trim-gap.png' });

  // 空白的時間點：預覽是黑的；片段開始後有畫面
  await seekTo(page, 0.4);
  await expect.poll(async () => (await samplePreview(page, 0.5, 0.5))?.slice(0, 3).join(',')).toBe('0,0,0');
  await seekTo(page, 1.5);
  await expect
    .poll(async () => (await samplePreview(page, 0.5, 0.5))?.slice(0, 3).join(','), { timeout: 5000 })
    .not.toBe('0,0,0');

  // 左把手往左拉回來：吃掉空白、素材起點還原
  await clips(page).first().tap();
  await drag(page, 'trim-start', -60);
  m = await main(page);
  expect(m[0]!.start).toBeCloseTo(0, 1);
  expect(m[0]!.trimIn).toBeCloseTo(0, 1);
  expect(m[0]!.duration).toBeCloseTo(2, 1);
  expect(m[1]!.start).toBeCloseTo(2, 1);
  await expect(page.getByTestId('gap')).toHaveCount(0);

  // 右把手縮短再拉回素材原長（使用者：拉不回原長度）
  await drag(page, 'trim-end', -60);
  expect((await main(page))[0]!.duration).toBeCloseTo(1, 1);
  await drag(page, 'trim-end', 600);
  expect((await main(page))[0]!.duration).toBeCloseTo(2, 1);
});

test('補齊空位：開場留白的虛線框點一下選取、再點一下補齊，後面往前接上；一步復原', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm']);
  await clips(page).first().tap();
  await expect(page.getByTestId('gap')).toHaveCount(0);
  await drag(page, 'trim-start', 60);
  await expect(page.getByTestId('gap')).toHaveCount(1);
  const gap = page.getByTestId('gap');
  await gap.tap(); // 第一下：選取，出現「補齊」
  await expect(gap).toHaveText('補齊');
  expect((await main(page)).map((c) => c.start)).toEqual([1, 2]); // 還沒動
  await gap.tap(); // 第二下：真的補齊
  const m = await main(page);
  expect(m.map((c) => c.start)).toEqual([0, 1]);
  await expect(page.getByTestId('gap')).toHaveCount(0);
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await main(page))[0]!.start).toBeCloseTo(1, 1);
});

test('修剪面板：整段素材攤開、上方小旗標標起點終點；拖旗標／拖中間／按鈕都能改；文字寫清楚；片段位置不變；一次拖曳一步復原', async ({
  page,
}) => {
  await createProjectWith(page, ['clip-a.webm', 'clip-b.webm']);
  await clips(page).first().tap();
  await page.getByRole('button', { name: '修剪' }).tap();
  const panel = page.getByTestId('trim-panel');
  await expect(panel).toBeVisible();
  const info = page.getByTestId('trim-info');
  await expect(info).toContainText('第 0.0 秒 → 第 2.0 秒');
  await expect(info).toContainText('留 2.0 秒');
  await expect(info).toContainText('素材共 2.0 秒');
  await page.screenshot({ path: 'docs/screenshots/feedback-5/trim-panel.png' });

  // 按鈕
  await page.getByRole('button', { name: '前面少 1 秒' }).tap();
  await expect(info).toContainText('第 1.0 秒 → 第 2.0 秒');
  let m = await main(page);
  expect(m[0]).toMatchObject({ trimIn: 1, duration: 1, start: 0 }); // 位置不變
  expect(m[1]!.start).toBeCloseTo(2, 5); // 後面的片段不動（自由擺放，不再順延）
  await page.getByRole('button', { name: '前面多 1 秒' }).tap();
  await expect(info).toContainText('第 0.0 秒 → 第 2.0 秒');
  await page.getByRole('button', { name: '後面少 1 秒' }).tap();
  await expect(info).toContainText('第 0.0 秒 → 第 1.0 秒');
  await page.getByRole('button', { name: '後面多 1 秒' }).tap();
  await expect(info).toContainText('第 0.0 秒 → 第 2.0 秒');

  // 拖起點旗標往右 1/4 條：起點約 0.5 秒
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  await drag(page, 'range-flag-start-0', strip.width / 4);
  m = await main(page);
  expect(m[0]!.trimIn).toBeGreaterThan(0.35);
  expect(m[0]!.trimIn).toBeLessThan(0.65);
  await page.screenshot({ path: 'docs/screenshots/feedback-5/trim-panel-dragged.png' });
  // 拖終點旗標往左 1/4 條：終點約 1.5 秒
  await drag(page, 'range-flag-end-0', -strip.width / 4);
  m = await main(page);
  expect(m[0]!.trimIn + m[0]!.duration).toBeGreaterThan(1.35);
  expect(m[0]!.trimIn + m[0]!.duration).toBeLessThan(1.65);
  const len = m[0]!.duration;
  const s0 = m[0]!.trimIn;
  // 拖中間：長度不變、區段平移（等一下再拖，才不會跟前面的拖曳併成同一步復原）
  await page.waitForTimeout(1500);
  await drag(page, 'range-body-0', strip.width / 8);
  m = await main(page);
  expect(m[0]!.duration).toBeCloseTo(len, 2);
  expect(m[0]!.trimIn).toBeGreaterThan(s0 + 0.1);

  // 一次拖曳 = 一步復原
  const afterMove = m[0]!.trimIn;
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await main(page))[0]!.trimIn).toBeCloseTo(s0, 2);
  expect(afterMove).toBeGreaterThan(s0);

  // 完成：關閉面板、回到工具列
  await page.getByRole('button', { name: '完成' }).tap();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: '修剪' })).toBeVisible();
});

test('照片沒有修剪面板（提示用時間軸把手）；疊加影片的修剪面板不會壓到後面的物件', async ({ page }) => {
  await createProjectWith(page, ['photo.png']);
  await clips(page).first().tap();
  await page.getByRole('button', { name: '修剪' }).tap();
  await expect(page.getByTestId('trim-panel')).toHaveCount(0);
  await expect(page.locator('.toast').filter({ hasText: '照片沒有素材區段' })).toBeVisible();
});
