import { expect, test, type Page } from '@playwright/test';
import { closePanel, createProjectWith, openTab, openTool, project, samplePreview, seekTo } from './helpers';

// feedback-17 Z23：邊緣淡出的寬度可調、設定視窗開著時預覽上標出淡出的範圍
const textItem = async (page: Page) =>
  (
    (await project(page)).tracks as unknown as {
      items: { type: string; kinetic?: { fadeW?: number; fade?: string } }[];
    }[]
  )
    .flatMap((t) => t.items)
    .find((i) => i.type === 'text')!;

test('Z23 邊緣淡出：寬度滑桿、預覽上的範圍色帶、淡出寬度真的影響畫面', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']); // 底下是藍色影片：字卡淡出的地方會透出藍色
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  await page.getByLabel('文字內容').fill('開場');
  await openTab(page, '特效');
  await openTool(page, 'fx.textfx');
  await page.getByTestId('kn-group-flow').tap();
  await openTool(page, 'fx.textfx');
  await page.getByTestId('kn-group-flow').tap();
  await page.getByRole('radio', { name: '文字特效 巨字橫移' }).tap(); // 預設左右淡出、框是整個畫面
  await page.getByRole('radio', { name: '底色 墨黑' }).tap();
  // 設定視窗開著：有滑桿、有提示、預覽上有範圍色帶
  await expect(page.getByLabel('淡出寬度')).toBeVisible();
  await expect(page.getByTestId('kn-fade-hint')).toBeVisible();
  await expect(page.getByTestId('kn-fade-guide')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await seekTo(page, 1);
  const blueAt = async () => (await samplePreview(page, 0.18, 0.1))?.[2] ?? 0; // 巨字在中間，取上緣；離左邊 18%
  await page.getByLabel('淡出寬度').fill('5');
  await expect.poll(async () => (await textItem(page)).kinetic?.fadeW).toBeCloseTo(0.05, 2);
  await expect.poll(blueAt).toBeLessThan(80); // 離邊緣 18%：窄淡出碰不到，還是墨黑
  await page.getByLabel('淡出寬度').fill('45');
  await expect.poll(async () => (await textItem(page)).kinetic?.fadeW).toBeCloseTo(0.45, 2);
  await expect.poll(blueAt).toBeGreaterThan(130); // 寬淡出：這裡已經淡掉，透出底下的藍色影片
  // 選〔無〕：沒有滑桿、沒有色帶；關掉視窗：也沒有色帶
  await page.getByRole('radio', { name: '邊緣淡出 無' }).tap();
  await expect(page.getByLabel('淡出寬度')).toHaveCount(0);
  await expect(page.getByTestId('kn-fade-guide')).toHaveCount(0);
  await page.getByRole('radio', { name: '邊緣淡出 左右' }).tap();
  await expect(page.getByTestId('kn-fade-guide')).toBeVisible();
  await closePanel(page);
  await expect(page.getByTestId('kn-fade-guide')).toHaveCount(0);
});
