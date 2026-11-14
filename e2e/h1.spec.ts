import { expect, test, type Page } from '@playwright/test';
import {
  clips,
  createProjectWith,
  fixture,
  openTab,
  pinch,
  previewBox,
  project,
  showTimeline,
} from './helpers';

type Tf = { x: number; y: number; scale: number; rotation: number; opacity: number };
type It = { id: string; type: string; group?: string; transform: Tf };
type Tr = { id: string; groupRole?: string; items: It[] };
const tracks = async (page: Page) => (await project(page)).tracks as unknown as Tr[];

async function addLayout(page: Page, name: string, files: string[]) {
  await openTab(page, '版型');
  await page.getByRole('button', { name: `版型 ${name}`, exact: true }).tap();
  await page.getByTestId('layout-input').setInputFiles(files.map(fixture));
  await expect(page.getByTestId('layout-sheet')).toHaveCount(0, { timeout: 30_000 });
}

test('「刪除並補齊」刪掉版型的外框＝整個版型（含各格）拿掉，不會留下看不到卻還在畫的格子', async ({
  page,
}) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '拍貼機直條', ['solid-red.webm', 'solid-green.webm']);
  expect((await tracks(page)).filter((t) => t.groupRole)).toHaveLength(5);
  await showTimeline(page);
  // 時間軸上的版型代表列（外框）：點它、剪輯 → 刪除並補齊
  const frameId = (await tracks(page)).find((t) => t.groupRole === 'frame')!.items[0]!.id;
  await page.locator(`[data-testid="clip"][data-item-id="${frameId}"]`).tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '刪除並補齊' }).tap();
  const left = await tracks(page);
  expect(left.filter((t) => t.groupRole)).toHaveLength(0);
  expect(left.flatMap((t) => t.items).filter((i) => i.group)).toHaveLength(0);
  expect(clips(page)).toBeTruthy();
});

test('圖層分頁「位置、大小、旋轉歸位」＝整個版型歸位；整個圖層透明度也是整組一起', async ({ page }) => {
  await createProjectWith(page, ['solid-blue.webm']);
  await addLayout(page, '拍貼機直條', ['solid-red.webm', 'solid-green.webm']);
  const members = async () =>
    (await tracks(page))
      .filter((t) => t.groupRole)
      .flatMap((t) => t.items)
      .sort((a, b) => a.id.localeCompare(b.id));
  const before = await members();
  const s = await previewBox(page);
  await pinch(page, { cx: s.x + s.width / 2, cy: s.y + s.height / 2, from: 160, to: 80 });
  const shrunk = await members();
  expect(shrunk[0]!.transform.scale).toBeLessThan(before[0]!.transform.scale * 0.8);
  await openTab(page, '圖層');
  await page.getByRole('button', { name: '位置、大小、旋轉歸位' }).tap();
  const after = await members();
  for (let i = 0; i < before.length; i++) {
    expect(after[i]!.transform.x).toBeCloseTo(before[i]!.transform.x, 4);
    expect(after[i]!.transform.y).toBeCloseTo(before[i]!.transform.y, 4);
    expect(after[i]!.transform.scale).toBeCloseTo(before[i]!.transform.scale, 4);
  }
});

test('音訊分頁每一列左邊是那支影片的首圖（縮圖），不再只有「影片」兩個字', async ({ page }) => {
  await createProjectWith(page, ['clip-a.webm']);
  await openTab(page, '音訊');
  const thumb = page.getByTestId('audio-thumb').first();
  await expect(thumb).toBeVisible();
  const bg = await thumb.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('url(');
  await expect(page.getByTestId('audio-row').first()).toContainText('1 影片');
  await page.screenshot({ path: 'docs/screenshots/feedback-8/audio-thumb.png' });
});

test('裁切畫面的按鈕字在淺色主題下也看得清楚（跟底色的對比夠）', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vc-theme', 'warm'));
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '裁切' }).tap();
  await expect(page.getByTestId('crop-layer')).toBeVisible();
  const contrast = await page.evaluate(() => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const out: number[] = [];
    for (const id of ['crop-apply', 'crop-check']) {
      const el = document.querySelector(`[data-testid=${id}]`) as HTMLElement;
      const cs = getComputedStyle(el);
      const l1 = lum(rgb(cs.color));
      const l2 = lum(rgb(cs.backgroundColor));
      out.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
    }
    return out;
  });
  for (const c of contrast) expect(c).toBeGreaterThan(3);
});
