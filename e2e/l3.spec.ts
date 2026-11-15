import { expect, test, type Page } from '@playwright/test';
import {
  createProjectWith,
  fixture,
  isRed,
  openTab,
  project,
  samplePreview,
  seekTo,
  showTimeline,
} from './helpers';

const SHOT = 'docs/screenshots/feedback-12';
type It = {
  id: string;
  type: string;
  group?: string;
  cell?: { x: number; y: number; w: number; h: number };
  start: number;
  duration: number;
};
type Tr = {
  id: string;
  kind: string;
  groupRole?: string;
  group?: string;
  cell?: { x: number; y: number; w: number; h: number };
  items: It[];
};
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];

async function addEmptyLayout(page: Page, name: string) {
  await openTab(page, '版型');
  await page.getByRole('button', { name: `版型 ${name}`, exact: true }).tap();
  await page.getByTestId('layout-confirm').tap();
  await expect(page.getByTestId('layout-options')).toHaveCount(0, { timeout: 30_000 });
}

test('L3 播放軸展開版型：新版型預設展開；影像分類下每格一列、空格子「＋ 匯入」；匯入後那一格有素材、預覽看得到', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await addEmptyLayout(page, '三格');
  await showTimeline(page);
  await expect(page.getByTestId('group-head')).toContainText('3 格');
  await expect(page.getByTestId('group-head')).toContainText('3 格空');
  await expect(page.getByTestId('sub-head').filter({ hasText: '影像' })).toContainText('影像 0');
  await expect(page.getByTestId('empty-cell-slot')).toHaveCount(3);
  await page.screenshot({ path: `${SHOT}/timeline-group-open.png` });
  // 第 2 格 ＋ 匯入
  await page.getByRole('button', { name: '第 2 格 匯入素材' }).tap();
  // 選檔案（隱藏的 input）
  await page.getByTestId('cell-file-timeline').setInputFiles(fixture('solid-red.webm'));
  await expect(page.getByTestId('empty-cell-slot')).toHaveCount(2, { timeout: 30_000 });
  const cells = (await tracks(page)).filter((t) => t.groupRole === 'cell');
  expect(cells[1]!.items).toHaveLength(1);
  expect(cells[0]!.items).toHaveLength(0);
  const c = cells[1]!.cell!;
  await seekTo(page, 1);
  await expect.poll(async () => isRed(await samplePreview(page, c.x + c.w / 2, c.y + c.h / 2))).toBe(true);
  // 收合／展開（記在這台手機）
  await page.getByTestId('group-toggle').tap();
  await expect(page.locator('.track.sub-row')).toHaveCount(0);
  await page.getByTestId('clip-group-toggle').tap();
  await expect(page.locator('.track.sub-row[data-kind="media"]')).toHaveCount(3);
  // 分類收合：影像
  await page.getByTestId('sub-toggle').filter({ hasText: '影像' }).tap();
  await expect(page.locator('.track.sub-row[data-kind="media"]')).toHaveCount(0);
});

test('L3 版型尾端「加入」→ 文字：進版型自己的文字軌（不在一般「字卡」類），分類「文字」出現；時間在版型範圍內；點它可以用文字分頁', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await addEmptyLayout(page, '三格');
  await showTimeline(page);
  await expect(page.getByTestId('sub-head').filter({ hasText: '文字' })).toHaveCount(0); // 還沒有文字
  await page.getByTestId('group-add').tap();
  await page.getByTestId('group-add-text').tap();
  const tr = await tracks(page);
  const member = tr.find((t) => t.groupRole === 'member')!;
  expect(member.kind).toBe('text');
  const frame = tr.flatMap((t) => t.items).find((i) => i.group && !i.cell && i.type !== 'text')!;
  const text = member.items[0]!;
  expect(text.group).toBe(frame.group);
  expect(text.start).toBeGreaterThanOrEqual(frame.start - 1e-6);
  expect(text.start + text.duration).toBeLessThanOrEqual(frame.start + frame.duration + 1e-6);
  await expect(page.getByTestId('sub-head').filter({ hasText: '文字' })).toContainText('文字 1');
  // 一般「字卡」類沒有（版型文字不佔一般類別）
  await expect(page.getByTestId('cat-head').filter({ hasText: '字卡' })).toHaveCount(0);
  // 點展開裡的文字片段：文字分頁看得到它
  await page.locator(`[data-testid="clip"][data-item-id="${text.id}"]`).tap();
  await openTab(page, '文字');
  await expect(page.getByLabel('文字內容')).toBeVisible();
  // 時間軸上拖到版型外面：被夾住
  await showTimeline(page);
});

test('L4 選到版型時，文字分頁新增文字／素材分頁加貼圖都加進版型裡（版型的成員軌）；關掉切換就加在一般軌道', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await addEmptyLayout(page, '三格'); // 加好後選到版型
  const members = async () => (await tracks(page)).filter((t) => t.groupRole === 'member');
  const frameGroup = async () =>
    (await tracks(page)).flatMap((t) => t.items).find((i) => i.group && !i.cell && i.type !== 'text')!.group;

  // 文字分頁：有「加到版型裡」切換、預設開；新增文字 → 版型的文字成員軌
  await openTab(page, '文字');
  await expect(page.getByRole('switch', { name: /新增的文字加到版型/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('button', { name: /新增文字/ }).tap();
  const ms = await members();
  expect(ms.filter((t) => t.kind === 'text')).toHaveLength(1);
  expect(ms[0]!.items[0]!.group).toBe(await frameGroup());

  // 素材分頁：貼圖加進版型（成員軌 kind=sticker、物件標成版型成員，不是外框也不是格子）
  await openTab(page, '素材');
  await expect(page.getByRole('switch', { name: /新增的貼圖加到版型/ })).toBeVisible();
  await page.getByRole('tablist', { name: '貼圖分類' }).getByRole('tab').nth(3).tap(); // 愛心
  await page.getByRole('button', { name: '貼圖 red heart' }).tap();
  await expect
    .poll(async () => (await members()).filter((t) => t.kind === 'sticker').length, { timeout: 15_000 })
    .toBe(1);
  const st = (await members()).find((t) => t.kind === 'sticker')!.items[0] as unknown as {
    group: string;
    member: boolean;
    cell?: unknown;
  };
  expect(st.group).toBe(await frameGroup());
  expect(st.member).toBe(true);
  expect(st.cell).toBeUndefined();
  // 版型裡的貼圖還是只有一個外框
  expect(
    (await tracks(page))
      .flatMap((t) => t.items)
      .filter((i) => i.group && !i.cell && i.type !== 'text' && !(i as { member?: boolean }).member),
  ).toHaveLength(1);
  // 展開的版型裡出現「貼圖」「文字」分類
  await showTimeline(page);
  await expect(page.getByTestId('sub-head').filter({ hasText: '貼圖' })).toContainText('貼圖 1');
  await expect(page.getByTestId('sub-head').filter({ hasText: '文字' })).toContainText('文字 1');
  await page.screenshot({ path: `${SHOT}/layout-members.png` });

  // 關掉切換：新增的文字就在一般的字卡軌道
  await openTab(page, '文字');
  await page.getByRole('switch', { name: /新增的文字加到版型/ }).tap();
  await page.getByRole('button', { name: /新增文字/ }).tap();
  const plain = (await tracks(page)).filter((t) => t.kind === 'text' && !t.groupRole);
  expect(plain).toHaveLength(1);
  expect(plain[0]!.items[0]!.group).toBeUndefined();
});
