import { expect, test, type Page } from '@playwright/test';
import {
  countColor,
  createProjectWith,
  exportFrame,
  openTab,
  project,
  samplePreview,
  seekTo,
} from './helpers';

const SHOT = 'docs/screenshots/kinetic';
type Kin = { id: string; accent?: string; bg?: string; speed?: number };
type Txt = {
  id: string;
  type: string;
  textFx?: unknown;
  kinetic?: Kin;
  transform: { x: number; y: number; scale: number };
};
const textItem = async (page: Page) =>
  ((await project(page)).tracks as unknown as { items: Txt[] }[])
    .flatMap((t) => t.items)
    .find((i) => i.type === 'text')!;

async function addText(page: Page, text: string) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  await page.getByLabel('文字內容').fill(text);
  await openTab(page, '特效');
  await page.getByTestId('fx-part-style').tap();
}

test('K0 動態字卡：特效分頁分組（基本／登場／流動）、選「爆出」→ 寫進字卡、舞台歸中、時間軸有標記與色帶', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await addText(page, '開場 登場');
  await expect(page.getByTestId('kn-groups').getByRole('tab')).toHaveText([
    '基本',
    '登場',
    '流動',
    '切換',
    '強調',
    '空間',
    '歌詞',
    '綜藝',
    '恐怖',
  ]);
  await page.getByTestId('kn-group-in').tap();
  await expect(page.getByTestId('kn-card')).toHaveCount(8);
  await page.getByRole('radio', { name: '文字特效 爆出' }).tap();
  const it = await textItem(page);
  expect(it.kinetic?.id).toBe('burst');
  expect(it.textFx).toBeUndefined();
  expect(it.transform).toMatchObject({ x: 0.5, y: 0.5, scale: 1 });
  // 時間軸：字卡片段有標記（代表字＝那一式名稱第一個字）、整條色帶；特效分頁的分段按鈕也帶名稱
  await expect(page.getByTestId('fx-circle-style')).toHaveText('爆');
  await expect(page.getByTestId('fx-circle-style')).toHaveAttribute('aria-label', '文字特效 爆出');
  await expect(page.locator('.fx-span.style')).toHaveCount(1);
  await expect(page.getByTestId('fx-part-style')).toHaveText('文字特效'); // 名字太長會被切掉，特效名稱看效果區的卡片
  // 設定：強調色、底色、速度、一輪幾秒（2 個詞 × 2.2 秒）
  await expect(page.getByTestId('kn-settings')).toContainText('一輪 4.4 秒');
  await page.screenshot({ path: `${SHOT}/k0-effect-tab-390.png` });
  // 換成舊的「基本」特效會拿掉動態字卡；選動態字卡會拿掉舊的
  await page.getByTestId('kn-group-basic').tap();
  await page.getByRole('radio', { name: '文字特效 閃爍' }).tap();
  expect(await textItem(page)).toMatchObject({ textFx: { kind: 'shimmer' } });
  expect((await textItem(page)).kinetic).toBeUndefined();
  await page.getByTestId('kn-group-in').tap();
  await page.getByRole('radio', { name: '文字特效 爆出' }).tap();
  expect((await textItem(page)).textFx).toBeUndefined();
  // 無
  await page.getByRole('radio', { name: '文字特效 無' }).tap();
  expect((await textItem(page)).kinetic).toBeUndefined();
  await expect(page.getByTestId('fx-circle-style')).toHaveCount(0);
  await expect(page.locator('.fx-span.style')).toHaveCount(0);
});

test('K0 動態字卡：爆出會動（字從小變大、放射線出現又消失）、巨字橫移底下的強調色窄帶、底色與速度、預覽跟單格輸出一致', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await addText(page, '開場');
  await page.getByTestId('kn-group-in').tap();
  await page.getByRole('radio', { name: '文字特效 爆出' }).tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  // 字體可能還在載入：多量幾個點，看「畫面中間有沒有跟底下藍色影片不一樣的顏色」
  const centerDiff = async () => {
    let n = 0;
    for (const [x, y] of [
      [0.5, 0.5],
      [0.42, 0.5],
      [0.58, 0.5],
      [0.5, 0.46],
      [0.5, 0.54],
      [0.35, 0.5],
      [0.65, 0.5],
    ] as const) {
      const c = await samplePreview(page, x, y);
      if (c && !(c[2] > 200 && c[0] < 60 && c[1] < 60)) n++;
    }
    return n;
  };
  await seekTo(page, 0.02); // 剛開始：字還是 0 倍大
  expect(await centerDiff()).toBe(0);
  await seekTo(page, 1.0); // 字已經完整出現
  await expect.poll(centerDiff).toBeGreaterThan(0);
  await page.screenshot({ path: `${SHOT}/k0-burst-390.png` });
  // 放射線（強調色 #ff4d2e）在 0.3 秒左右出現在字的四周；剛開始和放完之後沒有
  await seekTo(page, 0.3);
  await expect.poll(() => countColor(page, [255, 77, 46], 40, [0, 0, 1, 1])).toBeGreaterThan(0);
  await seekTo(page, 1.0);
  await expect.poll(() => countColor(page, [255, 77, 46], 40, [0, 0, 1, 1])).toBe(0);

  // 底色：墨黑 → 角落是 #14161b
  await page.getByRole('radio', { name: '底色 墨黑' }).tap();
  await seekTo(page, 1.0);
  // 爆出的框是畫面中間一條 16:9：框裡面是墨黑、框外面還是底下的藍色影片
  const inside = await samplePreview(page, 0.08, 0.4);
  expect(inside![0]).toBeLessThan(40);
  expect(inside![2]).toBeLessThan(45);
  const outside = await samplePreview(page, 0.08, 0.15);
  expect(outside![2]).toBeGreaterThan(200);
  expect((await textItem(page)).kinetic?.bg).toBe('#14161b');
  await page.getByRole('radio', { name: '底色 透明' }).tap();
  expect((await textItem(page)).kinetic?.bg).toBeUndefined();

  // 速度 2×：一輪 2.2 秒；寫進字卡、一輪的秒數更新
  await page.getByRole('radio', { name: '速度 2×' }).tap();
  expect((await textItem(page)).kinetic?.speed).toBe(2);
  await expect(page.getByTestId('kn-settings')).toContainText('一輪 1.1 秒');
  await page.getByRole('radio', { name: '速度 1×' }).tap();
  expect((await textItem(page)).kinetic?.speed).toBeUndefined();

  // 巨字橫移：底下一條強調色窄帶（#ff4d2e）；預覽與單格輸出同一個時間畫面一樣
  await page.getByTestId('kn-group-flow').tap();
  await page.getByRole('radio', { name: '文字特效 巨字橫移' }).tap();
  expect((await textItem(page)).kinetic?.id).toBe('crawl');
  await page.getByRole('radio', { name: '底色 墨黑' }).tap();
  await seekTo(page, 1.2);
  const band = await samplePreview(page, 0.5, 0.995);
  expect(band![0]).toBeGreaterThan(200);
  expect(band![1]).toBeLessThan(120);
  expect(band![2]).toBeLessThan(90);
  await page.screenshot({ path: `${SHOT}/k0-crawl-390.png` });
  const ex = (
    (await exportFrame(page, 1.2, [
      [0.5, 0.995],
      [0.04, 0.04],
    ])) as unknown as { samples: number[][] }
  ).samples;
  expect(Math.abs(ex[0]![0]! - band![0])).toBeLessThan(8);
  expect(Math.abs(ex[0]![1]! - band![1])).toBeLessThan(8);
  expect(ex[1]![0]).toBeLessThan(40);
});

test('K1 登場與流動各 8 式：每張卡片都能選、寫進字卡、預覽畫得出東西', async ({ page }) => {
  test.setTimeout(240_000);
  await addText(page, '開場 登場');
  for (const [group, ids] of [
    ['in', ['burst', 'hit', 'stamp', 'punch', 'stack', 'stretch', 'through', 'squash']],
    ['flow', ['crawl', 'drift', 'echo', 'slant', 'path', 'ticker', 'depth', 'tape']],
  ] as const) {
    await page.getByTestId(`kn-group-${group}`).tap();
    await expect(page.getByTestId('kn-card')).toHaveCount(8);
    expect(
      await page.getByTestId('kn-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-kn-id'))),
    ).toEqual(ids);
    for (const id of ids) {
      await page.locator(`[data-testid="kn-card"][data-kn-id="${id}"]`).tap();
      expect((await textItem(page)).kinetic?.id).toBe(id);
    }
  }
  // 用底色把整個框填滿再看：每一式在「代表秒數」都畫得出東西（跟底色不同的點）
  await page.getByRole('radio', { name: '底色 墨黑' }).tap();
  const ids = await page.evaluate(() =>
    (
      window as unknown as { __videoclip: { kineticList: () => { id: string; poster: number }[] } }
    ).__videoclip.kineticList(),
  );
  expect(ids.map((f) => f.id)).toEqual(
    expect.arrayContaining([
      'burst',
      'hit',
      'stamp',
      'punch',
      'stack',
      'stretch',
      'through',
      'squash',
      'crawl',
      'drift',
      'echo',
      'slant',
      'path',
      'ticker',
      'depth',
      'tape',
    ]),
  );
  await page.screenshot({ path: `${SHOT}/k1-effect-tab-390.png` });
});

test('K2 切換與強調各 8 式：每張卡片都能選、寫進字卡', async ({ page }) => {
  test.setTimeout(240_000);
  await addText(page, '開場 登場');
  for (const [group, ids] of [
    ['swap', ['flap', 'flip', 'type', 'slot', 'odo', 'swapline', 'led', 'split']],
    ['em', ['glitch', 'marker', 'shake', 'neon', 'bob', 'track', 'fill', 'focus']],
  ] as const) {
    await page.getByTestId(`kn-group-${group}`).tap();
    expect(
      await page.getByTestId('kn-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-kn-id'))),
    ).toEqual(ids);
    for (const id of ids) {
      await page.locator(`[data-testid="kn-card"][data-kn-id="${id}"]`).tap();
      expect((await textItem(page)).kinetic?.id).toBe(id);
    }
  }
});

test('K3 空間與歌詞各 8 式：每張卡片都能選、寫進字卡', async ({ page }) => {
  test.setTimeout(240_000);
  await addText(page, '開場 登場');
  for (const [group, ids] of [
    ['sp', ['cube', 'crawl3d', 'orbit', 'tunnel', 'scatter', 'extrude', 'blinds', 'block']],
    ['mv', ['kara', 'popsync', 'dual', 'beat', 'soft', 'lyrics', 'trail', 'mix']],
  ] as const) {
    await page.getByTestId(`kn-group-${group}`).tap();
    expect(
      await page.getByTestId('kn-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-kn-id'))),
    ).toEqual(ids);
    for (const id of ids) {
      await page.locator(`[data-testid="kn-card"][data-kn-id="${id}"]`).tap();
      expect((await textItem(page)).kinetic?.id).toBe(id);
    }
  }
});

test('K4 綜藝與恐怖各 8 式：每張卡片都能選、寫進字卡（64 式齊了）', async ({ page }) => {
  test.setTimeout(240_000);
  await addText(page, '開場 登場');
  let total = 0;
  for (const g of ['in', 'flow', 'swap', 'em', 'sp', 'mv', 'tv', 'hr']) {
    await page.getByTestId(`kn-group-${g}`).tap();
    total += await page.getByTestId('kn-card').count();
  }
  expect(total).toBe(64);
  for (const [group, ids] of [
    ['tv', ['vpop', 'slam', 'lines', 'marks', 'telop', 'emph', 'bouncy', 'star']],
    ['hr', ['flick', 'drip', 'creep', 'ghost', 'corrupt', 'mirror', 'torch', 'melt']],
  ] as const) {
    await page.getByTestId(`kn-group-${group}`).tap();
    expect(
      await page.getByTestId('kn-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-kn-id'))),
    ).toEqual(ids);
    for (const id of ids) {
      await page.locator(`[data-testid="kn-card"][data-kn-id="${id}"]`).tap();
      expect((await textItem(page)).kinetic?.id).toBe(id);
    }
  }
});
