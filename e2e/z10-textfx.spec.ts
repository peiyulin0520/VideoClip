import { expect, test } from '@playwright/test';
import { closePanel, createProjectWith, openCat, openTab, openTool, project } from './helpers';

// feedback-15 Z10／Z11：文字特效（基本＋動態字卡）合成一個視窗；文字類別也有〔特效〕；基本特效卡片有示意圖
test('Z10 文字類別〔特效〕＝同一個文字特效視窗；基本＋動態字卡分組在一起；二選一', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openCat(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  await page.getByLabel('文字內容').fill('蔡氏家族聚餐');
  await closePanel(page);
  const item = async () =>
    (await project(page)).tracks.flatMap((t) => t.items).find((i) => i.type === 'text') as unknown as {
      textFx?: { kind: string };
      kinetic?: { id: string };
    };
  await openTool(page, 'text.fx');
  // 一個視窗：分組列〔基本〕＋動態字卡 8 組；預設在〔基本〕
  await expect(page.getByTestId('kn-groups').getByRole('tab')).toHaveCount(9);
  await expect(page.getByTestId('kn-group-basic')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('tfx-card')).toHaveCount(4);
  await page.getByRole('radio', { name: '文字特效 閃爍' }).tap();
  expect((await item()).textFx).toEqual({ kind: 'shimmer' });
  await expect(page.getByTestId('tool-text.fx')).toContainText('特效');
  // 換到動態字卡的一式：基本特效被拿掉（二選一）
  await page.getByTestId('kn-group-in').tap();
  await page.getByRole('radio', { name: '文字特效 爆出' }).tap();
  expect((await item()).kinetic?.id).toBe('burst');
  expect((await item()).textFx).toBeUndefined();
  // 〔特效〕類別裡的〔文字特效〕是同一個東西（選中的那一式一樣）
  await openTab(page, '特效');
  await openTool(page, 'fx.textfx');
  await expect(page.getByRole('radio', { name: '文字特效 爆出' })).toHaveAttribute('aria-checked', 'true');
  // 〔無〕兩種都清掉
  await page.getByRole('radio', { name: '文字特效 無' }).tap();
  expect((await item()).kinetic).toBeUndefined();
  expect((await item()).textFx).toBeUndefined();
});

test('Z11 基本文字特效的卡片有示意圖（用這段字畫出來）', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openCat(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  await page.getByLabel('文字內容').fill('哈囉');
  await closePanel(page);
  await openTool(page, 'text.fx');
  const cards = page.getByTestId('tfx-card');
  await expect(cards).toHaveCount(4);
  const ink = await cards.evaluateAll((els) =>
    els.map((el) => {
      const c = el.querySelector('canvas') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 40) n++;
      return n;
    }),
  );
  for (const n of ink) expect(n).toBeGreaterThan(30); // 每一張都畫出字
  await page.screenshot({ path: 'docs/screenshots/feedback-15/z11-basic-cards.png' });
});
