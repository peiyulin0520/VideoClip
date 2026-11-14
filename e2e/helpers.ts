import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const fixture = (name: string) => path.resolve(process.cwd(), 'tests/fixtures', name);

/** 首頁按「＋」→ 選素材 → 自動建立專案並進入編輯器 */
export async function createProjectWith(page: Page, files: string[]) {
  // 打開測試用的除錯掛鉤 window.__videoclip（正常使用者看不到）
  await page.addInitScript(() => {
    localStorage.setItem('vc-debug', '1');
    localStorage.setItem('vc-skip-onboarding', '1');
    // 時間軸每一類各自收合（記在 vc-tl-cats，預設全部展開）；要測收合的測試自己設定
  });
  await page.goto('./');
  await page.getByRole('button', { name: '新增專案' }).tap();
  await page.getByTestId('new-project-files').setInputFiles(files.map(fixture));
  await expect(page).toHaveURL(/#\/p\//);
  await expect(page.getByTestId('clip')).toHaveCount(files.length, { timeout: 20_000 });
}

export const clips = (page: Page) => page.getByTestId('clip');

/** 目前被選取的片段是第幾個（-1 = 沒有） */
export async function selectedIndex(page: Page): Promise<number> {
  return page
    .getByTestId('clip')
    .evaluateAll((els) => els.findIndex((e) => e.getAttribute('data-selected') === 'true'));
}

export async function clipIds(page: Page): Promise<string[]> {
  return page.getByTestId('clip').evaluateAll((els) => els.map((e) => e.getAttribute('data-item-id')!));
}

/** 把播放頭移到 t 秒（用捲動時間軸，跟使用者手指滑動一樣；預設 60 px/秒） */
export async function seekTo(page: Page, seconds: number, pps = 60) {
  await page.getByTestId('timeline-scroll').evaluate((el, x) => {
    el.scrollLeft = x;
  }, seconds * pps);
}

export async function timeText(page: Page): Promise<string> {
  return (await page.getByTestId('time').textContent()) ?? '';
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('.toast').filter({ hasText: text }).first()).toBeVisible();
}

export type RGBA = [number, number, number, number];

/** 預覽畫面上某一點的顏色（座標是 0–1 的比例）；預覽引擎還沒好時回傳 null */
export async function samplePreview(page: Page, nx: number, ny: number): Promise<RGBA | null> {
  return page.evaluate(
    ([x, y]) => {
      const h = (window as unknown as { __videoclip?: { samplePreview: (a: number, b: number) => RGBA } })
        .__videoclip;
      return h ? h.samplePreview(x!, y!) : null;
    },
    [nx, ny],
  );
}

export const isRed = (c: RGBA | null) => !!c && c[0] > 200 && c[1] < 70 && c[2] < 70;
export const isGreen = (c: RGBA | null) => !!c && c[1] > 200 && c[0] < 70 && c[2] < 70;
export const isBlue = (c: RGBA | null) => !!c && c[2] > 200 && c[0] < 70 && c[1] < 70;
export const isGray = (c: RGBA | null) =>
  !!c && c[0] > 150 && Math.abs(c[0] - c[1]) < 25 && Math.abs(c[1] - c[2]) < 25;
export const isWhite = (c: RGBA | null) => !!c && c[0] > 230 && c[1] > 230 && c[2] > 230;

type Hook = {
  project: () => {
    assets: { id: string; name: string; unsaved?: boolean; thumbs: string[] }[];
    tracks: {
      id: string;
      kind: string;
      hidden: boolean;
      locked: boolean;
      items: {
        id: string;
        start: number;
        duration: number;
        type: string;
        transform: { x: number; y: number; scale: number; rotation: number; opacity: number };
        blend?: string;
        cornerRadius?: number;
        outline?: { width: number };
        crop?: Record<string, number>;
        card?: { runs: { text: string; size: number; color: string; fontId: string }[] };
      }[];
    }[];
  };
  selected: () => string | null;
  regionHash: (a: number, b: number, c: number, d: number) => number;
  countColor: (
    rgb: [number, number, number],
    tol: number,
    a: number,
    b: number,
    c: number,
    d: number,
  ) => number;
  exportFrame: (
    t: number,
    pts: [number, number][],
  ) => Promise<{ width: number; height: number; bytes: number; samples: number[][] }>;
};
export type HookProject = ReturnType<Hook['project']>;

/** 除錯掛鉤 window.__videoclip 要等預覽引擎建好才有（機器忙時會晚一點）：所有讀掛鉤的 helper 都先等它 */
export const waitHook = (page: Page) =>
  page.waitForFunction(() => !!(window as unknown as { __videoclip?: unknown }).__videoclip);

export const project = async (page: Page): Promise<HookProject> => {
  await waitHook(page);
  return page.evaluate(() => (window as unknown as { __videoclip: Hook }).__videoclip.project());
};

export const selectedItemId = async (page: Page): Promise<string | null> => {
  await waitHook(page);
  return page.evaluate(() => (window as unknown as { __videoclip: Hook }).__videoclip.selected());
};

export const countColor = async (
  page: Page,
  rgb: [number, number, number],
  tol: number,
  r: [number, number, number, number],
) =>
  (await waitHook(page)) &&
  page.evaluate(
    ([c, t, region]) =>
      (window as unknown as { __videoclip: Hook }).__videoclip.countColor(
        c as [number, number, number],
        t as number,
        ...(region as [number, number, number, number]),
      ),
    [rgb, tol, r] as const,
  );

export const exportFrame = async (page: Page, t: number, pts: [number, number][]) =>
  (await waitHook(page)) &&
  page.evaluate(
    ([tt, p]) =>
      (window as unknown as { __videoclip: Hook }).__videoclip.exportFrame(
        tt as number,
        p as [number, number][],
      ),
    [t, pts] as const,
  );

/** 切到底部分頁 */
export async function openTab(
  page: Page,
  name: '剪輯' | '疊加' | '文字' | '圖層' | '版型' | '特效' | '色調' | '素材' | '音訊',
) {
  const tab = page.locator('.tabs').getByRole('tab', { name, exact: true }); // 只找底部分頁列（文字面板裡也有叫「文字」的小分頁）
  // 點「目前的分頁」會收合面板，所以已經在這個分頁且展開時就不用再點
  if (
    (await tab.getAttribute('aria-selected')) === 'true' &&
    (await tab.getAttribute('aria-expanded')) === 'true'
  )
    return;
  await tab.tap();
}

/** 疊加分頁 →「加入影片或照片」→ 選檔案 */
export async function addOverlays(page: Page, files: string[]) {
  await openTab(page, '疊加');
  const before = await page.getByTestId('clip').count();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /加入影片或照片/ }).tap(),
  ]);
  await chooser.setFiles(files.map(fixture));
  // 匯入是非同步的（讀檔、縮圖），等到時間軸上多出這幾個物件
  await expect(page.getByTestId('clip')).toHaveCount(before + files.length, { timeout: 20_000 });
}

export const regionHash = async (page: Page, r: [number, number, number, number]) =>
  (await waitHook(page)) &&
  page.evaluate(
    (region) => (window as unknown as { __videoclip: Hook }).__videoclip.regionHash(...region),
    r,
  );

/** 預覽舞台的位置：先捲回頁面最上面（編輯器是整頁捲動，預覽在最上面） */
export async function previewBox(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  return (await page.getByTestId('stage').boundingBox())!;
}

/**
 * 雙指手勢（用 CDP 送真的兩點觸控，Chromium 會轉成 pointer 事件，跟 iPhone 上一樣）。
 * 兩指以 (cx, cy) 為中心、距離從 from 變到 to，同時旋轉 angle 度。座標是 CSS px（視窗座標）。
 */
export async function pinch(
  page: Page,
  o: { cx: number; cy: number; from: number; to: number; angle?: number; steps?: number },
) {
  const cdp = await page.context().newCDPSession(page);
  const steps = o.steps ?? 8;
  const pts = (dist: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    const dx = (Math.cos(a) * dist) / 2;
    const dy = (Math.sin(a) * dist) / 2;
    return [
      { x: o.cx - dx, y: o.cy - dy, id: 1 },
      { x: o.cx + dx, y: o.cy + dy, id: 2 },
    ];
  };
  const send = (type: string, touchPoints: { x: number; y: number; id: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints } as never);
  const start = pts(o.from, 0);
  await send('touchStart', [start[0]!]);
  await send('touchStart', start);
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    await send('touchMove', pts(o.from + (o.to - o.from) * f, (o.angle ?? 0) * f));
  }
  await send('touchEnd', []);
  await cdp.detach();
}

/** 單指觸控拖曳（CDP），用來測「在預覽空白處上下滑會捲頁面」 */
export async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, touchPoints: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints } as never);
  await send('touchStart', [from]);
  for (let i = 1; i <= 10; i++) {
    await send('touchMove', [
      { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 },
    ]);
  }
  await send('touchEnd', []);
  await cdp.detach();
}

/** 把整頁捲到看得到時間軸（不會動到時間軸的水平捲動／播放頭） */
export async function showTimeline(page: Page) {
  await page.locator('.timeline').evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight) window.scrollBy(0, r.top - window.innerHeight / 3);
  });
}

/** 取消選取：點時間軸某一軌的空白處（預覽上點空白處不會取消選取了） */
export async function deselect(page: Page) {
  const track = page.locator('[data-testid="track"]').first();
  const tb = (await track.boundingBox())!;
  const view = (await page.getByTestId('timeline-scroll').boundingBox())!;
  // 畫面最右邊那一小塊（不用捲動就點得到；左邊 0 秒就有片段，選取中的片段把手還會蓋住左邊一塊）
  await track.click({ position: { x: view.x + view.width - 14 - tb.x, y: 4 } });
  await page.evaluate(() => window.scrollTo(0, 0)); // 點時間軸會把頁面捲下去，回到預覽
}

/** 開關（填滿、框線…）設成指定狀態；已經是那個狀態就不動 */
export async function setSwitch(page: Page, name: string, on: boolean) {
  const sw = page.getByRole('switch', { name, exact: true });
  if (((await sw.getAttribute('aria-checked')) === 'true') !== on) await sw.tap();
}

/** 字塊回到「舊預設」：填滿開、框線關（2026-11-12 起字塊預設是透明底＋棕色框線；這些測試要的是粉紅／黃色實心的長相） */
export async function legacyBox(page: Page) {
  await setSwitch(page, '填滿', true);
  await setSwitch(page, '框線', false);
}
