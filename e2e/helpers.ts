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

type TabName = '剪輯' | '疊加' | '文字' | '圖層' | '版型' | '特效' | '色調' | '素材' | '音訊';
/** 舊的分頁名稱 → 新的功能列：第一層類別、（第二層才有的）工具、升起的視窗標題 */
const FB: Record<TabName, { cat: string; tools?: string; open?: string; pop?: string }> = {
  剪輯: { cat: '剪輯', tools: '剪輯工具' },
  疊加: { cat: '加入', tools: '加入' },
  素材: { cat: '加入', tools: '加入', open: '貼圖', pop: '貼圖' },
  文字: { cat: '文字', tools: '文字', open: '編輯文字', pop: '文字' },
  圖層: { cat: '剪輯', tools: '剪輯工具', open: '位置大小', pop: '位置與大小' },
  版型: { cat: '版型', pop: '版型' },
  特效: { cat: '特效', pop: '特效' },
  色調: { cat: '色調', pop: '色調' },
  音訊: { cat: '音訊', pop: '音訊' },
};

/**
 * 功能列：切到某個類別（第一層），需要的話再點第二層的工具，讓它的視窗升起來。
 * 已經在那裡就不重複點（點同一個類別會把只有一個工具的視窗收起來）。
 */
export async function openTab(page: Page, name: TabName) {
  const f = FB[name];
  const tab = page.locator('.tabs').getByRole('tab', { name: f.cat, exact: true });
  const popup = page.getByTestId('panel-sheet');
  const popOk = async () =>
    !f.pop ||
    (await popup
      .locator('.ps-head b')
      .first()
      .textContent({ timeout: 300 })
      .catch(() => '')) === f.pop;
  const back = page.getByTestId('fb-back');
  if (f.tools) {
    const row = page.getByRole('toolbar', { name: f.tools, exact: true });
    if (!(await row.isVisible())) {
      if (await back.isVisible()) await back.tap();
      await tab.tap();
    }
    if (f.open && !(await popOk())) {
      const btn = row.getByRole('button', { name: f.open, exact: true });
      await btn.tap();
      if (!(await popOk())) await btn.tap(); // 原本就開著＝被收起了，再點一次
    }
    return;
  }
  if (await back.isVisible()) await back.tap();
  if (
    (await tab.getAttribute('aria-selected')) === 'true' &&
    (await tab.getAttribute('aria-expanded')) === 'true' &&
    (await popOk())
  )
    return;
  await tab.tap();
  // 原本就在這個類別但視窗是收起來的：那一下點擊已經把它升起來；原本是別的視窗：點了就切過去
  if ((await tab.getAttribute('aria-expanded')) !== 'true') await tab.tap();
}

/** 疊加分頁 →「加入影片或照片」→ 選檔案 */
export async function addOverlays(page: Page, files: string[]) {
  await openTab(page, '疊加');
  const before = await page.getByTestId('clip').count();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '影片照片', exact: true }).tap(),
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

/** 收起升起的視窗（它會蓋住播放列和時間軸；要點復原、播放、時間軸上的片段前先收起來） */
export async function closePanel(page: Page) {
  const close = page.getByTestId('panel-close');
  if (await close.isVisible()) {
    await close.tap();
    await expect(page.getByTestId('panel-sheet')).toHaveCount(0);
  }
}
export async function undo(page: Page) {
  await closePanel(page);
  await page.getByRole('button', { name: '復原' }).tap();
}
export async function redo(page: Page) {
  await closePanel(page);
  await page.getByRole('button', { name: '重做' }).tap();
}

/** 把整頁捲到看得到時間軸（不會動到時間軸的水平捲動／播放頭） */
export async function showTimeline(page: Page) {
  await closePanel(page);
  await page.locator('.timeline').evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight) window.scrollBy(0, r.top - window.innerHeight / 3);
  });
}

/** 取消選取：點時間軸某一軌的空白處（預覽上點空白處不會取消選取了） */
export async function deselect(page: Page) {
  await closePanel(page);
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

/** 版型 v2：外框是一般影像軌上的片段（有 group、沒有 cell）；這條軌道就是「外框所在的軌道」 */
export const isFrameTrack = (t: { items: object[] }): boolean =>
  t.items.some((x) => {
    const i = x as { group?: string; cell?: unknown; type?: string };
    return !!i.group && !i.cell && i.type !== 'text';
  });

/**
 * 版型 v2：已經在「版型」分頁點了某個版型（可選外框顏色等）→ 按「確定」新增空版型，
 * 再依序把素材放進各格（素材比格子少就輪流重複，跟舊版一樣；files 是檔案路徑）。
 * 結束時選到第 1 格。`motion` 是整段效果（特效分頁的「整段」：捲動、滑入滑出）。
 */
export async function finishLayout(page: Page, files: string[], opts: { motion?: string } = {}) {
  await page.getByTestId('layout-confirm').tap();
  // 選項區收起來＝新版型已經加好、而且選到它了（不然讀到的是上一個版型的示意圖）
  await expect(page.getByTestId('layout-options')).toHaveCount(0, { timeout: 30_000 });
  const cells = page.getByTestId('ld-cell');
  await expect(cells.first()).toBeVisible({ timeout: 30_000 });
  const n = await cells.count();
  if (opts.motion) {
    await openTab(page, '特效');
    await page.getByTestId('fx-part-whole').tap();
    await page.getByRole('radio', { name: `整段 ${opts.motion}` }).tap();
    await openTab(page, '版型');
  }
  for (let i = 0; i < n; i++) {
    await cells.nth(i).tap();
    await page.getByTestId('cell-file').setInputFiles(files[i % files.length]!);
    await expect(page.getByTestId('cell-sheet')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '關閉', exact: true }).last().tap();
  }
  await cells.first().tap();
  await page.getByRole('button', { name: '關閉', exact: true }).last().tap();
}

/** 時間軸上選到一個片段，把尾端的把手拖 seconds 秒（正＝拉長）；回傳拖完後它的長度 */
export async function trimClipEnd(page: Page, itemId: string, seconds: number): Promise<number> {
  await showTimeline(page);
  const clip = page.locator(`[data-testid="clip"][data-item-id="${itemId}"]`);
  await clip.tap();
  // 第一下點下去時時間軸會自動捲動，收尾的 click 有時落在背景上又取消選取：沒選到就再點一次
  const shown = await page
    .getByTestId('trim-end')
    .waitFor({ timeout: 1500 })
    .then(
      () => true,
      () => false,
    );
  if (!shown) await clip.tap();
  const p0 = await project(page);
  const dur0 = (p0.tracks.flatMap((t) => t.items) as unknown as { id: string; duration: number }[]).find(
    (i) => i.id === itemId,
  )!.duration;
  const pps = (await clip.boundingBox())!.width / dur0;
  const h = (await page.getByTestId('trim-end').boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (seconds * pps) / 2, y, { steps: 5 });
  await page.mouse.move(x + seconds * pps, y, { steps: 5 });
  await page.mouse.up();
  const p1 = await project(page);
  return (p1.tracks.flatMap((t) => t.items) as unknown as { id: string; duration: number }[]).find(
    (i) => i.id === itemId,
  )!.duration;
}

/** 版型 v2：選到「整個版型」（版型層）——點時間軸上的版型片段；之後移動、縮放、定格都是整組一起 */
export async function selectFrame(page: Page) {
  await showTimeline(page);
  const tr = (await project(page)).tracks as unknown as {
    items: { id: string; group?: string; cell?: unknown; type: string; member?: boolean }[];
  }[];
  const id = tr
    .flatMap((t) => t.items)
    .find((i) => i.group && !i.cell && i.type !== 'text' && i.type !== 'audio' && !i.member)!.id;
  await page.locator(`[data-testid="clip"][data-item-id="${id}"]`).tap();
  await page.evaluate(() => window.scrollTo(0, 0));
}
