import { expect, test } from '@playwright/test';
import { addOverlays, clips, createProjectWith, seekTo } from './helpers';

test('播放列：播放鍵只有圖示；定位、縮小、放大是圖示加中文；按住時有顏色回饋；定位開著時是主題色', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm']);
  const play = page.getByRole('button', { name: '播放', exact: true });
  expect(((await play.innerText()) ?? '').trim()).toBe('');
  await expect(page.getByRole('button', { name: '縮小時間軸' })).toContainText('縮小');
  await expect(page.getByRole('button', { name: '放大時間軸' })).toContainText('放大');
  await expect(page.getByTestId('kf-btn')).toContainText('定位');
  // 按住：底色疊一層主題色（box-shadow 跟沒按時不同）
  const zoom = page.getByRole('button', { name: '放大時間軸' });
  const shadow = () => zoom.evaluate((el) => getComputedStyle(el).boxShadow);
  const rest = await shadow();
  const b = (await zoom.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await expect.poll(shadow).not.toBe(rest);
  await page.mouse.up();
  await expect.poll(shadow).toBe(rest);
  await page.screenshot({ path: 'docs/screenshots/feedback-10/playbar.png' });
  // 定位：選到素材、新增定位後，按鈕變主題色底（aria-pressed）
  await clips(page).first().tap();
  const kf = page.getByTestId('kf-btn');
  const bg = () => kf.evaluate((el) => getComputedStyle(el).backgroundColor);
  const off = await bg();
  await seekTo(page, 0.5);
  await kf.tap();
  await expect(kf).toHaveAttribute('aria-pressed', 'true');
  expect(await bg()).not.toBe(off);
});

test('時間軸：最下面的影像軌跟其他軌一樣高；直式影片縮圖格最窄 18px 左右；片段名稱一行', async ({ page }) => {
  test.setTimeout(90_000);
  await createProjectWith(page, ['solid-red.webm']);
  await addOverlays(page, ['solid-green.webm']);
  const tracks = page.locator('[data-testid="track"]');
  const heights = await tracks.evaluateAll((els) =>
    els.map((el) => Math.round((el as HTMLElement).getBoundingClientRect().height)),
  );
  expect(heights.length).toBeGreaterThanOrEqual(2);
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
  expect(heights[0]!).toBeLessThanOrEqual(34);
  const tile = await clips(page)
    .first()
    .locator('.tiles span')
    .first()
    .evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
  expect(tile).toBeLessThanOrEqual(22);
  const labelH = await clips(page)
    .first()
    .locator('.clip-label')
    .evaluate((el) => (el as HTMLElement).getBoundingClientRect().height);
  expect(labelH).toBeLessThanOrEqual(16);
  await page.screenshot({ path: 'docs/screenshots/feedback-10/timeline-low.png' });
});
