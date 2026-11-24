import { expect, test, type Page } from '@playwright/test';
import { createProjectWith, finishLayout, fixture, openTab, openTool, project, selectFrame } from './helpers';

const SHOT = 'docs/screenshots/feedback-13';
type It = {
  id: string;
  type: string;
  group?: string;
  cell?: { x: number; y: number; w: number; h: number };
  frameStyle?: { color: string; line?: number; box?: { w: number; h: number } };
  outline?: unknown;
};
type Tr = { groupRole?: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];
const cells = async (page: Page) =>
  (await tracks(page)).filter((t) => t.groupRole === 'cell').map((t) => t.items[0]!.cell!);
const frameOf = async (page: Page) =>
  (await tracks(page)).flatMap((t) => t.items).find((i) => i.group && !i.cell && i.type !== 'text')!;

async function setup(page: Page) {
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '版型');
  await page.getByRole('button', { name: '版型 上下雙格', exact: true }).tap();
  await finishLayout(page, [fixture('solid-red.webm'), fixture('solid-green.webm')]);
  await selectFrame(page);
  await openTab(page, '版型');
}

test('Y1 版型工具列：播放方式、外框、大小各自一個視窗', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  for (const [tool, id] of [
    ['layout.play', 'layout-play'],
    ['layout.frame', 'layout-frame'],
    ['layout.size', 'layout-shape'],
  ] as const) {
    await openTool(page, tool);
    await expect(page.getByTestId(id)).toBeVisible();
  }
  // 外框顏色、透明度、框線粗細都在〔外框〕視窗裡
  await openTool(page, 'layout.frame');
  const frame = page.getByTestId('layout-frame');
  await openTool(page, 'layout.frame');
  await expect(frame.getByLabel('格子框線粗細')).toBeVisible();
  await expect(frame.getByRole('radio', { name: '外框 白' })).toBeVisible();
});

test('Y1 外框顏色（含選色器的顏色）都會換；框線粗細連外圍邊距一起變', async ({ page }) => {
  test.setTimeout(150_000);
  await setup(page);
  await openTool(page, 'layout.frame');
  await page.getByRole('button', { name: '外框顏色 #4dd0ff' }).tap();
  await expect.poll(async () => (await frameOf(page)).frameStyle?.color, { timeout: 15_000 }).toBe('#4dd0ff');
  await page.getByRole('radio', { name: '外框 粉' }).tap();
  await expect
    .poll(async () => (await frameOf(page)).frameStyle?.color, { timeout: 15_000 })
    .not.toBe('#4dd0ff');
  await page.getByRole('button', { name: '外框顏色 #ffd23f' }).tap();
  await expect.poll(async () => (await frameOf(page)).frameStyle?.color, { timeout: 15_000 }).toBe('#ffd23f');

  const [a0, b0] = await cells(page);
  await openTool(page, 'layout.frame');
  await page.getByLabel('格子框線粗細').fill('300');
  await expect.poll(async () => (await cells(page))[0]!.x, { timeout: 15_000 }).toBeGreaterThan(a0!.x * 2.5); // 外圍邊距變粗
  const [a1, b1] = await cells(page);
  expect(b1!.y - (a1!.y + a1!.h)).toBeGreaterThan((b0!.y - (a0!.y + a0!.h)) * 2.5); // 格子之間也變粗
  await page.screenshot({ path: `${SHOT}/y1-frame-line-390.png` });
});

test('Y1 調整大小：按鈕不超出區塊，顯示現在大小，［重置大小］回 100%', async ({ page }) => {
  test.setTimeout(150_000);
  await setup(page);
  await openTool(page, 'layout.size');
  const shape = page.getByTestId('layout-shape');
  await expect(page.getByTestId('layout-size-now')).toHaveText('100% × 100%');
  await openTool(page, 'layout.size');
  await expect(page.getByTestId('layout-size-reset')).toBeDisabled();
  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 844 });
    const z = (await shape.boundingBox())!;
    for (const id of ['layout-resize', 'layout-size-reset']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.x + b.width, `${id} @${w}`).toBeLessThanOrEqual(z.x + z.width + 0.5);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // 預覽上把右邊拉窄、套用 → 顯示新的大小、重置可按；按重置回到 100%
  await openTool(page, 'layout.size');
  await page.getByTestId('layout-resize').tap();
  await page.evaluate(() => window.scrollTo(0, 0));
  const h = (await page.getByTestId('layout-h-r').boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 80, y, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('layout-resize-apply').tap();
  await expect
    .poll(async () => (await frameOf(page)).frameStyle?.box?.w ?? 1, { timeout: 15_000 })
    .toBeLessThan(0.9);
  await expect(page.getByTestId('layout-size-now')).not.toHaveText('100% × 100%');
  await openTool(page, 'layout.size');
  await page.getByTestId('layout-size-reset').tap();
  await expect(page.getByTestId('layout-size-now')).toHaveText('100% × 100%', { timeout: 15_000 });
  await page.screenshot({ path: `${SHOT}/y1-size-390.png` });
});

test('Y1 圖層分頁：選到版型外框時沒有「外框顏色／粗細」（那是物件描邊）；沒有描邊就沒有［拿掉外圍描邊］', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  await openTab(page, '圖層');
  await expect(page.getByTestId('layer-props')).toBeVisible();
  await expect(page.getByLabel(/^外框顏色 #/)).toHaveCount(0);
  await expect(page.getByText('外框粗細', { exact: true })).toHaveCount(0);
  await openTab(page, '版型');
  await openTool(page, 'layout.frame');
  await expect(page.getByTestId('frame-outline-off')).toHaveCount(0);
});
