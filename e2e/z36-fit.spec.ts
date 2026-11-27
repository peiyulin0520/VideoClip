import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, openTab, openTool, project, regionHash, seekTo } from './helpers';

// feedback-18 Z36：〔停在最後畫面〕時，字卡在播放軸上多長，特效就在那段時間內播完（留一小段停住）；
// 細調面板的〔速度〕滑桿＝改字卡的長度。用自編的字。
type It = {
  id: string;
  type: string;
  duration: number;
  kinetic?: { id: string; end?: string; fit?: boolean; speed?: number };
};
const items = async (page: Page) =>
  ((await project(page)).tracks as unknown as { items: It[] }[]).flatMap((t) => t.items);
const textItem = async (page: Page) => (await items(page)).find((i) => i.type === 'text')!;
const patch = (page: Page, id: string, p: object) =>
  page.evaluate(
    ([id, p]) =>
      (
        window as unknown as { __videoclip: { patchItem: (i: string, p: object) => void } }
      ).__videoclip.patchItem(id as string, p as object),
    [id, p] as const,
  );

async function setup(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  await page.getByLabel('文字內容').fill('週末一起出遊');
  await openTab(page, '特效');
  await openTool(page, 'fx.textfx');
  await page.getByTestId('kn-group-in').tap();
  await openTool(page, 'fx.textfx');
  await page.locator('[data-testid="kn-card"][data-kn-id="hit"]').tap();
  await page.getByTestId('kn-end-hold').tap();
  await expect.poll(async () => (await textItem(page)).kinetic?.fit).toBe(true);
}

test('Z36 字卡 5 秒、10 秒：特效都在字卡結束前 0.5 秒內播完、停住；短自動加速、長自動放慢', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await setup(page);
  const it = await textItem(page);
  const full: [number, number, number, number] = [0, 0, 1, 1];
  const at = async (t: number) => {
    await seekTo(page, t);
    await page.waitForTimeout(350);
    return regionHash(page, full);
  };
  for (const dur of [5, 10]) {
    await patch(page, it.id, { duration: dur });
    // 結束前 0.45 秒起已經停住（畫面不再變）
    expect(await at(dur - 0.4)).toBe(await at(dur - 0.08));
    // 字卡長，特效就放慢到字卡快結束才出齊：結束前 1.6 秒還在動（沒有配合長度的話，早就停了）
    expect(await at(dur - 1.6)).not.toBe(await at(dur - 0.08));
    // 中間還在動
    expect(await at(dur * 0.25)).not.toBe(await at(dur * 0.5));
  }
});

test('Z36 〔速度〕滑桿＝改字卡長度：速度越快字卡越短；切回〔重複播放〕速度變成自己的速度', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await setup(page);
  const fit = page.getByTestId('kn-fit');
  await expect(fit).toBeVisible();
  const slider = fit.locator('input[type=range]');
  const d0 = (await textItem(page)).duration;
  await slider.fill('2');
  await expect.poll(async () => (await textItem(page)).duration).toBeLessThan(d0 - 0.2);
  const dFast = (await textItem(page)).duration;
  await slider.fill('0.5');
  await expect.poll(async () => (await textItem(page)).duration).toBeGreaterThan(dFast + 1);
  // 切回重複播放：fit 拿掉、速度存成目前實際的速度
  await page.getByTestId('kn-end-loop').tap();
  await expect.poll(async () => (await textItem(page)).kinetic?.fit).toBeUndefined();
  const k = (await textItem(page)).kinetic!;
  expect(k.end).toBeUndefined();
  expect(k.speed ?? 1).toBeGreaterThan(0.2);
});
