import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, fixture, isRed, openTab, project, samplePreview, seekTo } from './helpers';

const SHOT = 'docs/screenshots/feedback-9/i5';
type Fx = { kind: string; duration: number };
type It = { id: string; duration: number; inEffect?: Fx; outEffect?: Fx; transitionIn?: Fx };
const first = async (page: Page) => ((await project(page)).tracks[0] as unknown as { items: It[] }).items[0]!;
const dark = (c: number[] | null) => !!c && c[0]! < 40 && c[1]! < 40 && c[2]! < 40;

test('單一素材進場：選「捲簾放下」3 秒 → 開頭看不到、中途上半有下半沒有、之後完整；時間軸有代表字圓圈；影片照常播', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']); // 紅色 4 秒
  await clips(page).first().tap();
  await openTab(page, '特效');
  await expect(page.locator('.fx-legend .lg.seam')).toHaveText('雙影片銜接');
  await expect(page.locator('.fx-legend .lg.single')).toHaveText('單影片進出場');
  await expect(page.locator('.fx-legend .lg.single-on')).toHaveText('選取中');
  await expect(page.getByTestId('fx-part-in')).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('radio', { name: '進場 捲簾放下' }).tap();
  await page.getByLabel('進場幾秒').fill('30'); // 3.0 秒
  const it = await first(page);
  expect(it.inEffect).toMatchObject({ kind: 'rollDown' });
  expect(it.inEffect!.duration).toBeCloseTo(3, 1);

  await page.evaluate(() => window.scrollTo(0, 0));
  // 開頭：還沒放下，整個是黑的
  await seekTo(page, 0.05);
  await expect.poll(async () => dark(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 1.5 秒（p=0.5）：上半紅、下半黑
  await seekTo(page, 1.5);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.2))).toBe(true);
  await expect.poll(async () => dark(await samplePreview(page, 0.5, 0.85))).toBe(true);
  // 3.5 秒：完整
  await seekTo(page, 3.5);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.85))).toBe(true);

  // 時間軸：片段開頭有代表字「下」（沒選取＝#7F8C6A）
  const circle = page.getByTestId('fx-circle-in');
  await expect(circle).toHaveText('下');
  await page.screenshot({ path: `${SHOT}/in-effect.png` });
});

test('單一素材可以同時有進場與出場（不同特效）：出場「左移」→ 結尾往左移出去；時間軸兩個圓圈顏色跟接縫的不同', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await clips(page).first().tap();
  await openTab(page, '特效');
  await page.getByRole('radio', { name: '進場 疊化' }).tap();
  await page.getByTestId('fx-part-out').tap();
  await page.getByRole('radio', { name: '出場 左移' }).tap();
  await page.getByLabel('出場幾秒').fill('20'); // 2.0 秒：從 2 秒開始
  const it = await first(page);
  expect(it.inEffect).toMatchObject({ kind: 'dissolve' });
  expect(it.outEffect).toMatchObject({ kind: 'moveL' });
  expect(it.outEffect!.duration).toBeCloseTo(2, 1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await seekTo(page, 1.5); // 進場結束（0.8 秒），出場還沒開始
  await expect.poll(async () => isRed(await samplePreview(page, 0.9, 0.5))).toBe(true);
  await seekTo(page, 3.05); // 出場進行到一半：往左移了半個畫面 → 左半紅、右半黑
  await expect.poll(async () => isRed(await samplePreview(page, 0.2, 0.5))).toBe(true);
  await expect.poll(async () => dark(await samplePreview(page, 0.85, 0.5))).toBe(true);
  await expect(page.getByTestId('fx-circle-in')).toHaveText('溶');
  await expect(page.getByTestId('fx-circle-out')).toHaveText('左');
  // 選取中（出場這塊正在編輯）＝深底 #1E3B2F＋淺字 #EEF2E6；沒選的進場＝淺底 #D5DCC6＋深字 #1E3B2F
  const css = (id: string, prop: 'backgroundColor' | 'color') =>
    page.getByTestId(id).evaluate((el, p) => getComputedStyle(el)[p as 'color'], prop);
  const bg = (id: string) => css(id, 'backgroundColor');
  expect(await bg('fx-circle-out')).toBe('rgb(30, 59, 47)');
  expect(await css('fx-circle-out', 'color')).toBe('rgb(238, 242, 230)');
  expect(await bg('fx-circle-in')).toBe('rgb(213, 220, 198)');
  expect(await css('fx-circle-in', 'color')).toBe('rgb(30, 59, 47)');
  await page.screenshot({ path: `${SHOT}/in-out.png` });
  // 點進場圓圈 → 切到進場、顏色對調
  await page.getByTestId('fx-circle-in').tap();
  await expect(page.getByTestId('fx-part-in')).toHaveAttribute('aria-selected', 'true');
  expect(await bg('fx-circle-in')).toBe('rgb(30, 59, 47)');
});

test('兩段銜接的圓圈寫類型代表字：米色、選取中橘棕；影片和照片是同一類，可以互相銜接', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm', 'photo.png']);
  await expect(page.getByTestId('tr-circle')).toHaveCount(1);
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 左移' }).tap();
  const c = page.getByTestId('tr-circle');
  await expect(c).toHaveText('左');
  expect(await c.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(184, 85, 58)'); // 選取中＝橘棕
  await page.getByTestId('fx-part-in').tap(); // 切到進場：接縫的圓圈變成沒選取的米色
  expect(await c.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(234, 219, 200)');
});

const WHITE: [number, number, number] = [255, 255, 255];
const region: [number, number, number, number] = [0.02, 0.1, 0.98, 0.9];

test('字卡：文字也能用 32 種特效；「打字」進場一個字一個字出現、出場從後面往前刪', async ({ page }) => {
  test.setTimeout(120_000);
  const { countColor } = await import('./helpers');
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByLabel('文字內容').fill('甲乙丙丁戊己');
  const d = (
    (await project(page)).tracks.flatMap((t) => t.items).find((i) => i.type === 'text') as unknown as {
      duration: number;
    }
  ).duration;
  await openTab(page, '特效');
  // 文字能選影像的 32 種（例：進場「疊化」），也有自己的「文字」分類（打字）
  await expect(
    page.getByTestId('effect-panel').getByRole('tab', { name: '文字', exact: true }),
  ).toBeVisible();
  await page.getByRole('radio', { name: '進場 打字' }).tap();
  await page.getByLabel('進場幾秒').fill(String(Math.round(d * 10)));
  await page.evaluate(() => window.scrollTo(0, 0));
  await seekTo(page, 0.02);
  const none = await countColor(page, WHITE, 25, region);
  await seekTo(page, d * 0.5);
  await expect.poll(() => countColor(page, WHITE, 25, region)).toBeGreaterThan(none + 100);
  const half = await countColor(page, WHITE, 25, region);
  await seekTo(page, d - 0.05);
  await expect.poll(() => countColor(page, WHITE, 25, region)).toBeGreaterThan(half * 1.3);
  await page.screenshot({ path: `${SHOT}/typewriter.png` });

  // 出場：從後面往前刪——最後剩下的字比一半少
  await page.getByTestId('fx-part-in').tap();
  await page.getByRole('radio', { name: '進場 無' }).tap();
  await page.getByTestId('fx-part-out').tap();
  await page.getByRole('radio', { name: '出場 打字' }).tap();
  await page.getByLabel('出場幾秒').fill(String(Math.round(d * 10)));
  await seekTo(page, 0.02);
  await expect.poll(() => countColor(page, WHITE, 25, region)).toBeGreaterThan(half * 1.3); // 開始：全部在
  await seekTo(page, d * 0.5);
  await expect.poll(() => countColor(page, WHITE, 25, region)).toBeLessThan(half * 1.4);
  await seekTo(page, d - 0.05);
  await expect.poll(() => countColor(page, WHITE, 25, region)).toBeLessThan(half * 0.5);
});

test('字卡文字特效：閃爍（亮光掃過，不同時間亮的地方不同）、發光、方格字、震動；時間軸字卡中間有代表字', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { countColor } = await import('./helpers');
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  await page.getByLabel('文字內容').fill('閃爍的字');
  await openTab(page, '特效');
  await page.getByTestId('fx-part-style').tap();
  await page.getByRole('radio', { name: '文字特效 閃爍' }).tap();
  const it = () =>
    (project(page) as Promise<{ tracks: { items: { type: string; textFx?: { kind: string } }[] }[] }>).then(
      (p) => p.tracks.flatMap((t) => t.items).find((i) => i.type === 'text')!,
    );
  expect((await it()).textFx).toEqual({ kind: 'shimmer' });
  await expect(page.getByTestId('fx-circle-style')).toHaveText('爍');
  // 文字特效圓圈：選取中（正在特效分頁的「文字特效」）＝深底淺字
  expect(
    await page.getByTestId('fx-circle-style').evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(30, 59, 47)');
  await page.evaluate(() => window.scrollTo(0, 0));
  await seekTo(page, 0.02); // 亮光還在字的左邊：字是暗的
  const dim = await countColor(page, WHITE, 25, region);
  await seekTo(page, 0.8); // 亮光在中間：字亮
  await expect.poll(() => countColor(page, WHITE, 25, region)).toBeGreaterThan(dim * 1.3);
  await page.screenshot({ path: `${SHOT}/shimmer.png` });
  // 同一個時間畫面一樣（預覽與匯出才會一致）
  await seekTo(page, 0.8);
  const a = await countColor(page, WHITE, 25, region);
  await seekTo(page, 0.5);
  await seekTo(page, 0.8);
  await expect.poll(() => countColor(page, WHITE, 25, region)).toBe(a);

  for (const [name, code] of [
    ['發光閃亮', '亮'],
    ['方格字', '方'],
    ['震動', '震'],
  ] as const) {
    await page.getByRole('radio', { name: `文字特效 ${name}` }).tap();
    await expect(page.getByTestId('fx-circle-style')).toHaveText(code);
    await seekTo(page, 0.3);
    await expect.poll(() => countColor(page, WHITE, 60, region)).toBeGreaterThan(50); // 字還看得到
    await page.screenshot({ path: `${SHOT}/text-${name}.png` });
  }
  await page.getByRole('radio', { name: '文字特效 無' }).tap();
  expect((await it()).textFx).toBeUndefined();
  await expect(page.getByTestId('fx-circle-style')).toHaveCount(0);
});

const sheet = (page: Page) => page.getByRole('dialog');

test('調整進場時間：預覽在左、拖拉軸在右同一列；只有一個「迄」旗標、沒有序號；迄與「特效幾秒」連動', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await clips(page).first().tap();
  await openTab(page, '特效');
  await page.getByRole('radio', { name: '進場 捲簾放下' }).tap();
  await page.getByTestId('fx-adjust').tap();
  await expect(sheet(page)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('fx-flag')).toHaveCount(1);
  await expect(page.getByTestId('fx-flag')).toContainText('迄');
  await expect(page.getByTestId('fx-flag')).not.toContainText(/\d/); // 不寫序號
  await expect(page.getByTestId('fx-flag-before')).toHaveCount(0);
  // 預覽在左、軸在右、同一列
  const pv = (await page.getByTestId('et-preview').boundingBox())!;
  const st = (await page.getByTestId('et-strip').boundingBox())!;
  expect(pv.x + pv.width).toBeLessThanOrEqual(st.x + 1);
  expect(st.y + st.height / 2).toBeGreaterThan(pv.y);
  expect(st.y + st.height / 2).toBeLessThan(pv.y + pv.height);
  await page.screenshot({ path: `${SHOT}/timing-in.png` });
  // 連動：特效幾秒 3 → 迄 3
  await page.getByLabel('特效幾秒', { exact: true }).fill('3');
  await page.getByLabel('特效幾秒', { exact: true }).blur();
  await expect(page.getByLabel('迄（秒）', { exact: true })).toHaveValue('3');
  await expect(page.getByTestId('et-summary')).toContainText('0.00 → 3.00 秒（共 3.00 秒）');
  // 改迄 → 特效幾秒跟著
  await page.getByLabel('迄（秒）', { exact: true }).fill('1.5');
  await page.getByLabel('迄（秒）', { exact: true }).blur();
  await expect(page.getByLabel('特效幾秒', { exact: true })).toHaveValue('1.5');
  // 拖旗標往右 1/4 條：多 1 秒
  const f = (await page.getByTestId('fx-flag').boundingBox())!;
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width / 2 + st.width / 8, f.y + f.height / 2, { steps: 4 });
  await page.mouse.move(f.x + f.width / 2 + st.width / 4, f.y + f.height / 2, { steps: 4 });
  await page.mouse.up();
  const v = Number(await page.getByLabel('特效幾秒', { exact: true }).inputValue());
  expect(v).toBeGreaterThan(2.3);
  expect(v).toBeLessThan(2.7);
  await page.getByTestId('et-apply').tap();
  await expect(sheet(page)).toHaveCount(0);
  expect((await first(page)).inEffect!.duration).toBeCloseTo(v, 1);
});

test('調整出場時間：只有一個「起」旗標；起＝長度−特效幾秒（4 秒的片段、特效 1 秒 → 起 3 秒）；取消不改', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  await openTab(page, '特效');
  await page.getByTestId('fx-part-out').tap();
  await page.getByRole('radio', { name: '出場 左移' }).tap();
  const before = (await first(page)).outEffect!.duration;
  await page.getByTestId('fx-adjust').tap();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('fx-flag')).toContainText('起');
  await page.getByLabel('特效幾秒', { exact: true }).fill('1');
  await page.getByLabel('特效幾秒', { exact: true }).blur();
  await expect(page.getByLabel('起（秒）', { exact: true })).toHaveValue('3');
  await page.getByRole('button', { name: '取消' }).tap();
  expect((await first(page)).outEffect!.duration).toBeCloseTo(before, 2);
  await page.getByTestId('fx-adjust').tap();
  await page.waitForTimeout(500);
  await page.getByLabel('起（秒）', { exact: true }).fill('2.5');
  await page.getByLabel('起（秒）', { exact: true }).blur();
  await expect(page.getByLabel('特效幾秒', { exact: true })).toHaveValue('1.5');
  await page.getByTestId('et-apply').tap();
  expect((await first(page)).outEffect!.duration).toBeCloseTo(1.5, 2);
});

test('轉場分配：起（A 結尾前幾秒）、迄（B 開頭後幾秒）各自設定，特效幾秒＝兩者相加；套用後接縫前後長度對', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm', 'solid-green.webm']); // 各 4 秒，接縫在 4 秒
  await page.getByTestId('tr-circle').tap();
  await page.getByRole('radio', { name: '轉場 疊化' }).tap();
  await page.getByTestId('fx-adjust').tap();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('fx-flag-before')).toContainText('起');
  await expect(page.getByTestId('fx-flag-after')).toContainText('迄');
  await page.getByLabel('起（A 結尾前幾秒）', { exact: true }).fill('1.2');
  await page.getByLabel('起（A 結尾前幾秒）', { exact: true }).blur();
  await page.getByLabel('迄（B 開頭後幾秒）', { exact: true }).fill('0.3');
  await page.getByLabel('迄（B 開頭後幾秒）', { exact: true }).blur();
  await expect(page.getByLabel('特效幾秒', { exact: true })).toHaveValue('1.5');
  await page.screenshot({ path: `${SHOT}/timing-seam.png` });
  await page.getByTestId('et-apply').tap();
  const items = ((await project(page)).tracks[0] as unknown as { items: It[] & { start: number }[] }).items;
  const tr = items[1]!.transitionIn as unknown as { before: number; after: number; duration: number };
  expect(tr.before).toBeCloseTo(1.2, 2);
  expect(tr.after).toBeCloseTo(0.3, 2);
  expect(tr.duration).toBeCloseTo(1.5, 2);
  // 接縫後只佔 0.3 秒（4.3 秒結束）：4.4 秒已經全綠（如果還是前後各 0.75 秒，這裡還有一點紅）
  await page.evaluate(() => window.scrollTo(0, 0));
  await seekTo(page, 4.4);
  await expect.poll(async () => (await samplePreview(page, 0.5, 0.5))?.[0]).toBeLessThan(15);
});

test('版型：選版型時可以選進場、出場特效（整個版型一起動）；整體面板也能改；時間軸外框那一條有代表字', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 九宮格', exact: true }).tap();
  await page.getByLabel('版型進場特效').selectOption('dissolve');
  await page.getByLabel('版型出場特效').selectOption('moveL');
  await page.getByTestId('layout-input').setInputFiles([fixture('solid-green.webm')]);
  await expect(page.getByTestId('layout-sheet')).toHaveCount(0, { timeout: 30_000 });
  type Tr = { groupRole?: string; items: (It & { group?: string })[] };
  const frameItem = async () =>
    ((await project(page)).tracks as unknown as Tr[]).find((t) => t.groupRole === 'frame')!.items[0]!;
  const f = await frameItem();
  expect(f.inEffect).toMatchObject({ kind: 'dissolve' });
  expect(f.outEffect).toMatchObject({ kind: 'moveL' });
  // 整體面板可以改
  await expect(page.getByTestId('group-panel')).toBeVisible();
  await page.getByLabel('版型進場特效').selectOption('');
  expect((await frameItem()).inEffect).toBeUndefined();
  await page.getByLabel('版型進場特效').selectOption('moveR');
  expect((await frameItem()).inEffect).toMatchObject({ kind: 'moveR' });
  // 時間軸：外框那一條的開頭／結尾有代表字
  await expect(page.getByTestId('fx-circle-in')).toHaveText('右');
  await expect(page.getByTestId('fx-circle-out')).toHaveText('左');
});

test('版型進場「左移」：第 0 秒整個版型在畫面外，進場結束後回到原位（格子跟外框一起動）', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 九宮格', exact: true }).tap();
  await page.getByLabel('版型進場特效').selectOption('fastL');
  await page.getByTestId('layout-input').setInputFiles([fixture('solid-green.webm')]);
  await expect(page.getByTestId('layout-sheet')).toHaveCount(0, { timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  // 開頭：版型整個還在畫面右邊外面 → 畫面中央看到的是底下的影片（紅色）
  await seekTo(page, 0.02);
  await expect.poll(async () => isRed(await samplePreview(page, 0.5, 0.5))).toBe(true);
  // 進場結束後：九宮格每格都是綠色（中央格）
  await seekTo(page, 1.5);
  await expect
    .poll(async () => (await samplePreview(page, 0.5, 0.5))?.[1], { timeout: 8000 })
    .toBeGreaterThan(150);
});

test('匯出的單格跟預覽一樣：進場「捲簾放下」在 1.5 秒（一半）→ 上紅下黑', async ({ page }) => {
  test.setTimeout(120_000);
  const { exportFrame } = await import('./helpers');
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  await openTab(page, '特效');
  await page.getByRole('radio', { name: '進場 捲簾放下' }).tap();
  await page.getByLabel('進場幾秒').fill('30');
  const out = await exportFrame(page, 1.5, [
    [0.5, 0.2],
    [0.5, 0.85],
  ]);
  expect(isRed(out.samples[0] as [number, number, number, number])).toBe(true);
  expect(dark(out.samples[1]!)).toBe(true);
});

test('音訊的特效：選到音樂時特效分頁只有淡入（逐漸變大聲）、淡出（逐漸變小聲）', async ({ page }) => {
  test.setTimeout(120_000);
  const { fixture: fx } = await import('./helpers');
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '音訊');
  await page.getByTestId('music-input').setInputFiles(fx('music-4s.wav'));
  await expect(page.getByTestId('audio-mute')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid="clip"][data-kind="audio"]').first().tap();
  await openTab(page, '特效');
  await expect(page.getByTestId('fx-part-in')).toHaveCount(0); // 沒有畫面特效
  await page.getByLabel('淡入（逐漸變大聲）').fill('1.5');
  await page.getByLabel('淡出（逐漸變小聲）').fill('0.5');
  const a = (
    (await project(page)).tracks as unknown as {
      kind: string;
      items: { fadeIn?: number; fadeOut?: number }[];
    }[]
  ).find((t) => t.kind === 'audio')!.items[0]!;
  expect(a.fadeIn).toBeCloseTo(1.5, 1);
  expect(a.fadeOut).toBeCloseTo(0.5, 1);
});
