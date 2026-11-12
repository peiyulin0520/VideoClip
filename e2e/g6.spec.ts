import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWith,
  fixture,
  isBlue,
  isGreen,
  isRed,
  openTab,
  project,
  samplePreview,
  seekTo,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-7/g6';
type It = {
  id: string;
  type: string;
  start: number;
  duration: number;
  group?: string;
  template?: string;
  fontCycle?: { fonts: string[]; interval: number; until: number };
  card?: { runs: { text: string; fontId: string }[] };
};
type Tr = { kind: string; groupRole?: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];

async function makeStory(page: Page, title?: string) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '模板 三格故事' }).tap();
  await expect(page.getByTestId('story-sheet')).toBeVisible();
  if (title !== undefined) await page.getByLabel('模板標題').fill(title);
  // 開場紅、三格：綠、藍、紅
  await page
    .getByTestId('story-input')
    .setInputFiles(['solid-red.webm', 'solid-green.webm', 'solid-blue.webm', 'solid-red.webm'].map(fixture));
  await expect(page.getByTestId('story-sheet')).toHaveCount(0, { timeout: 30_000 });
}

test('動態模板「三格故事」：資料——4 個畫面、透明外框、標題字體輪播（預設月份英文）、副標', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await makeStory(page);
  const tr = await tracks(page);
  const cells = tr.filter((t) => t.groupRole === 'cell');
  const frame = tr.find((t) => t.groupRole === 'frame')!.items[0]!;
  expect(cells).toHaveLength(4);
  expect(frame.template).toBe('story3');
  expect(frame.duration).toBe(8);
  const month = await page.evaluate(
    () =>
      [
        'JANUARY',
        'FEBRUARY',
        'MARCH',
        'APRIL',
        'MAY',
        'JUNE',
        'JULY',
        'AUGUST',
        'SEPTEMBER',
        'OCTOBER',
        'NOVEMBER',
        'DECEMBER',
      ][new Date().getMonth()],
  );
  const texts = tr.filter((t) => t.kind === 'text').flatMap((t) => t.items);
  const title = texts.find((t) => t.fontCycle)!;
  expect(title.card!.runs[0]!.text).toBe(month);
  expect(title.fontCycle!.interval).toBeCloseTo(0.18, 3);
  expect(title.fontCycle!.fonts.length).toBeGreaterThanOrEqual(4);
  expect(texts).toHaveLength(2); // 標題＋副標
  expect(texts.every((t) => t.group === frame.group)).toBe(true);
  // 時間軸：主軌＋模板代表列＋字卡兩列（標題、副標時間重疊）；一個物件的感覺
  await page.screenshot({ path: `${SHOT}/created.png` });
});

test('三格故事的畫面：開場在中間 → 撐開 → 三格依序進來 → 結尾染色閃白', async ({ page }) => {
  test.setTimeout(120_000);
  await makeStory(page, 'TEST');
  const at = async (sec: number, x: number, y: number) => {
    await seekTo(page, sec);
    await page.waitForTimeout(250);
    return samplePreview(page, x, y);
  };
  // 0.4 秒：開場影片（紅）在中間；上方不是紅（底下是藍色主軌）
  await expect.poll(async () => isRed(await at(0.4, 0.5, 0.5))).toBe(true);
  expect(isBlue(await at(0.45, 0.5, 0.1))).toBe(true);
  await page.screenshot({ path: `${SHOT}/01-open.png` });
  // 2.1 秒：撐開得差不多了，上方也是紅
  await expect.poll(async () => isRed(await at(2.1, 0.5, 0.1))).toBe(true);
  // 3.0 秒：第 1 格（綠）已在上面，第 3 格還沒進來（下面還是紅的開場）
  await expect.poll(async () => isGreen(await at(3.0, 0.5, 0.12))).toBe(true);
  expect(isRed(await at(3.05, 0.5, 0.92))).toBe(true);
  // 5 秒：三格都在：上綠、下紅（第 3 格是紅）
  await expect.poll(async () => isGreen(await at(5, 0.5, 0.1))).toBe(true);
  expect(isRed(await at(5.05, 0.5, 0.92))).toBe(true);
  await page.screenshot({ path: `${SHOT}/02-three.png` });
  // 最後一刻：閃光洗白（四周接近白）
  await expect
    .poll(async () => {
      const c = await at(7.95, 0.1, 0.1);
      return !!c && c[0] > 200 && c[1] > 190 && c[2] > 170;
    })
    .toBe(true);
  await page.screenshot({ path: `${SHOT}/03-flash.png` });
});

test('三格故事是一個整體：刪掉外框＝整個模板（含標題副標）拿掉，一步復原', async ({ page }) => {
  test.setTimeout(90_000);
  await makeStory(page, 'ABC');
  await openTab(page, '版型');
  await expect(page.getByTestId('group-panel')).toBeVisible();
  await page.getByRole('button', { name: '移除版型' }).tap();
  const left = await tracks(page);
  expect(left.filter((t) => t.kind === 'text' && t.items.length > 0)).toHaveLength(0);
  expect(left.filter((t) => t.groupRole)).toHaveLength(0);
  await page.getByRole('button', { name: '復原' }).tap();
  expect((await tracks(page)).filter((t) => t.groupRole)).toHaveLength(5);
});
