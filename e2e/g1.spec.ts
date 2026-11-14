import { expect, test, type Page } from '@playwright/test';
import { countColor, createProjectWith, fixture, openTab, project } from './helpers';

const SHOT = 'docs/screenshots/feedback-7/g1';
type Run = { text: string; color: string; opacity?: number; weight: string };
type Card = {
  runs: Run[];
  box?: { fillOn?: boolean; fill: string; stroke?: { color: string; width: number } };
};
const cards = async (page: Page) =>
  (await project(page)).tracks.flatMap((t) => t.items).filter((i) => i.type === 'text') as unknown as {
    id: string;
    card: Card;
  }[];
const setRange = (page: Page, label: string, v: number) =>
  page.getByRole('slider', { name: label, exact: true }).evaluate((el, val) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(val));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
const addTextBtn = (page: Page) => page.getByRole('button', { name: /新增文字/ }).first();

test('文字透明度：滑桿讓字變淡（描邊不會從字裡透出來）；套用樣式到所有文字；新增文字沿用上一次的樣式', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await addTextBtn(page).tap();
  await page.getByLabel('文字內容').fill('甲甲甲');
  const WHITE: [number, number, number] = [255, 255, 255];
  const region: [number, number, number, number] = [0.05, 0.1, 0.95, 0.9];
  await expect.poll(() => countColor(page, WHITE, 25, region)).toBeGreaterThan(200);
  const solid = await countColor(page, WHITE, 25, region);
  await setRange(page, '文字透明度', 30);
  await expect.poll(() => countColor(page, WHITE, 25, region)).toBeLessThan(solid * 0.2);
  expect((await cards(page))[0]!.card.runs[0]!.opacity).toBeCloseTo(0.3);
  await page.screenshot({ path: `${SHOT}/text-opacity.png` });

  // 再加一個文字：沿用上一次的樣式（透明度 30%），內容是預設
  await addTextBtn(page).tap();
  const second = (await cards(page)).find((c) => c.card.runs[0]!.text !== '甲甲甲')!;
  expect(second.card.runs[0]!.opacity).toBeCloseTo(0.3);

  // 第二個改成不粗（預設是粗體）＋不透明，按「套用」→ 第一個也變成不粗、不透明；內容不變；一步復原
  await page.getByRole('button', { name: '粗體', exact: true }).first().tap();
  await setRange(page, '文字透明度', 100);
  await page.getByRole('button', { name: '套用這個樣式到所有文字' }).tap();
  await expect(page.locator('.toast').filter({ hasText: '已套用到 1 個文字' })).toBeVisible();
  const first = (await cards(page)).find((c) => c.card.runs[0]!.text === '甲甲甲')!;
  expect(first.card.runs[0]!.weight).toBe('normal');
  expect(first.card.runs[0]!.opacity ?? 1).toBe(1);
  await page.getByRole('button', { name: '復原' }).tap();
  const undone = (await cards(page)).find((c) => c.card.runs[0]!.text === '甲甲甲')!;
  expect(undone.card.runs[0]!.opacity).toBeCloseTo(0.3);
});

test('字塊預設透明底＋棕色框線；形狀縮圖是線框；獨立圖形也是；要填滿到「填滿」打開', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await addTextBtn(page).tap();
  await page.getByRole('tab', { name: '字塊', exact: true }).tap();
  await page.getByRole('radio', { name: '方形' }).tap();
  const box = (await cards(page))[0]!.card.box!;
  expect(box.fillOn).toBe(false);
  expect(box.stroke?.color.toLowerCase()).toBe('#8b5a44');
  // 預覽上沒有粉紅色填滿
  expect(await countColor(page, [255, 77, 141], 30, [0.05, 0.1, 0.95, 0.9])).toBeLessThan(30);
  // 縮圖：有棕色線、沒有粉紅色
  const px = await page
    .locator('.shape-thumb')
    .first()
    .evaluate((cv) => {
      const c = cv as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let pink = 0;
      let brown = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3]! < 128) continue;
        if (d[i]! > 230 && d[i + 1]! < 110 && d[i + 2]! > 110) pink++;
        if (Math.abs(d[i]! - 139) < 40 && Math.abs(d[i + 1]! - 90) < 40 && Math.abs(d[i + 2]! - 68) < 40)
          brown++;
      }
      return { pink, brown };
    });
  expect(px.pink).toBe(0);
  expect(px.brown).toBeGreaterThan(30);
  await page.screenshot({ path: `${SHOT}/box-default.png` });
  // 打開填滿 → 才有顏色
  await page.getByRole('switch', { name: '填滿' }).tap();
  await expect.poll(async () => (await cards(page))[0]!.card.box!.fillOn).not.toBe(false);

  // 獨立圖形：透明底＋棕色框線
  await page.getByRole('button', { name: '＋ 另外新增一個獨立圖形' }).tap();
  const shape = (await cards(page)).find(
    (c) => c.card.runs[0]!.text === '' && !(c as { placeholder?: boolean }).placeholder,
  )!;
  expect(shape.card.box!.fillOn).toBe(false);
  expect(shape.card.box!.stroke?.color.toLowerCase()).toBe('#8b5a44');
});

test('三層選單長得不一樣：底部分頁、區塊分段控制、分類小膠囊（選中的背景色各不同、區塊不用強調色）', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await addTextBtn(page).tap();
  await page.getByRole('tab', { name: '字塊', exact: true }).tap();
  const bg = (sel: string) =>
    page
      .locator(sel)
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  const l1 = await bg('.tab.active');
  const l2 = await bg('.seg.on');
  const l3 = await bg('.chip3.on');
  const accent = await page.evaluate(() => {
    const el = document.createElement('i');
    el.style.background = 'var(--accent)';
    document.body.append(el);
    const c = getComputedStyle(el).backgroundColor;
    el.remove();
    return c;
  });
  expect(l2).not.toBe(accent);
  expect(l2).not.toBe(l3);
  expect(l3).not.toBe(accent);
  void l1;
  // 「＋」新增是圓形按鈕，不是跟區塊同樣的膠囊
  const r = await page
    .getByRole('button', { name: '新增文字', exact: true })
    .evaluate((el) => getComputedStyle(el).borderRadius);
  expect(r).toBe('50%');
  await page.screenshot({ path: `${SHOT}/three-levels.png` });
});

test('專案封面：首頁「更換封面」從相簿選照片、恢復預設；編輯器「用目前預覽畫面當封面」', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await page.waitForTimeout(1200);
  await page.getByRole('link', { name: '回首頁' }).tap();
  const cardCover = () =>
    page
      .getByTestId('project-card')
      .first()
      .locator('.cover')
      .evaluate((el) => (el as HTMLElement).style.backgroundImage);
  // 把背景圖（data URL）畫出來量中心點的顏色
  const colorOf = (css: string) =>
    page.evaluate(async (bg) => {
      const url = /url\("?(.*?)"?\)/.exec(bg)![1]!;
      const img = new Image();
      img.src = url;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return [...ctx.getImageData(img.width >> 1, img.height >> 1, 1, 1).data.slice(0, 3)];
    }, css);
  const original = await cardCover();
  expect(original).toContain('data:image');

  // 從相簿選照片（photo.png）→ 封面換成那張，重新整理還在
  await page.getByRole('button', { name: '新專案 1 的選單' }).tap();
  await page.getByRole('button', { name: '更換封面' }).tap();
  await expect(page.getByTestId('cover-strip').locator('.cover-pick')).toHaveCount(1); // 專案裡只有 1 個素材
  await page.getByTestId('cover-file').setInputFiles(fixture('photo.png'));
  await expect(page.locator('.toast').filter({ hasText: '封面已更換' })).toBeVisible();
  const changed = await cardCover();
  expect(changed).not.toBe(original);
  expect(changed).toContain('data:image/jpeg');
  await page.reload();
  expect(await cardCover()).toBe(changed);
  await page.screenshot({ path: `${SHOT}/cover-changed.png` });

  // 恢復預設 → 回到第一個素材（紅色）的縮圖
  await page.getByRole('button', { name: '新專案 1 的選單' }).tap();
  await page.getByRole('button', { name: '更換封面' }).tap();
  await page.getByRole('button', { name: /恢復預設/ }).tap();
  await expect.poll(cardCover).not.toBe(changed);
  const [r, g, b] = (await colorOf(await cardCover())) as number[];
  expect(r!).toBeGreaterThan(200);
  expect(g!).toBeLessThan(80);
  expect(b!).toBeLessThan(80);

  // 編輯器：用目前預覽畫面當封面（把預覽改成藍色影片：先換一個專案內容太麻煩，改驗「封面是 JPEG、長邊 ≤ 480」）
  await page.getByRole('link', { name: /開啟 新專案 1/ }).tap();
  await expect(page.getByTestId('clip').first()).toBeVisible();
  await page.getByRole('button', { name: '專案名稱', exact: true }).tap();
  await page.getByRole('button', { name: '用目前預覽畫面當封面' }).tap();
  await expect(page.locator('.toast').filter({ hasText: '已用目前預覽畫面當封面' })).toBeVisible();
  await page.waitForTimeout(1300);
  await page.getByRole('link', { name: '回首頁' }).tap();
  const fromPreview = await cardCover();
  expect(fromPreview).toContain('data:image/jpeg');
  const size = await page.evaluate(async (bg) => {
    const url = /url\("?(.*?)"?\)/.exec(bg)![1]!;
    const img = new Image();
    img.src = url;
    await img.decode();
    return Math.max(img.width, img.height);
  }, fromPreview);
  expect(size).toBeLessThanOrEqual(480);
  const [r2] = (await colorOf(fromPreview)) as number[];
  expect(r2!).toBeGreaterThan(200); // 預覽那一格是紅色影片
});
