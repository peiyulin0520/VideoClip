import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, exportFrame, openTab, project, samplePreview, seekTo } from './helpers';

const SHOT = 'docs/screenshots/feedback-12';

async function nameFirstClip(page: Page, name: string) {
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '命名', exact: true }).tap();
  await page.getByLabel('片段名稱').fill(name);
  await page.getByRole('button', { name: '確定' }).tap();
}

test('X1-1 播放列按鈕叫「定格」；整個頁面看不到「定位」', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await expect(page.getByTestId('kf-btn')).toContainText('定格');
  await clips(page).first().tap();
  await openTab(page, '圖層');
  await expect(page.getByTestId('kf-panel')).toContainText('定格細部調整');
  await expect(page.locator('body')).not.toContainText('定位');
});

test('X1-2 有命名的素材：圖層清單、音訊分頁、分離原音都用命名；分離後改影片名稱不會跟著變', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']);
  await nameFirstClip(page, '測試一');
  await openTab(page, '圖層');
  await expect(page.getByTestId('layer-row').first()).toContainText('測試一');
  await expect(page.getByTestId('layer-list')).not.toContainText('.webm');
  await openTab(page, '音訊');
  await expect(page.getByTestId('audio-row').first()).toContainText('原音 · 1 測試一');
  await page.getByRole('button', { name: /分離原音 測試一/ }).tap();
  const items = async () =>
    (await project(page)).tracks.flatMap((t) => t.items) as unknown as { type: string; label?: string }[];
  await expect.poll(async () => (await items()).find((i) => i.type === 'audio')?.label).toBe('測試一 原音');
  await nameFirstClip(page, '測試二');
  expect((await items()).find((i) => i.type === 'audio')!.label).toBe('測試一 原音');
});

test('X1-3 新文字是空的、輸入框有淺灰提示字；預覽有半透明提示；打字後提示消失；沒輸入的文字不會畫進輸出', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await openTab(page, '文字');
  await page
    .getByRole('button', { name: /新增文字/ })
    .first()
    .tap();
  const input = page.getByLabel('文字內容');
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('placeholder', '點兩下編輯文字');
  const txt = async () =>
    (await project(page)).tracks.flatMap((t) => t.items).find((i) => i.type === 'text') as unknown as {
      placeholder?: boolean;
      card: { runs: { text: string }[] };
    };
  expect((await txt()).placeholder).toBe(true);
  // 預覽：中央有半透明的白字（比純藍亮）
  await seekTo(page, 0.5);
  await page.evaluate(() => window.scrollTo(0, 0));
  const hasWhite = async () => {
    for (const nx of [0.4, 0.45, 0.5, 0.55, 0.6]) {
      const c = await samplePreview(page, nx, 0.5);
      if (c && c[0]! > 60) return true;
    }
    return false;
  };
  await expect.poll(hasWhite).toBe(true);
  // 單格輸出沒有字：同一排取樣全都是藍色
  const out = await exportFrame(page, 0.5, [
    [0.4, 0.5],
    [0.45, 0.5],
    [0.5, 0.5],
    [0.55, 0.5],
    [0.6, 0.5],
  ]);
  expect(out.samples.every((c) => c[0]! < 40 && c[2]! > 150)).toBe(true);
  // 打字：提示旗標拿掉
  await input.fill('你好');
  await expect.poll(async () => (await txt()).placeholder).toBeUndefined();
  expect((await txt()).card.runs[0]!.text).toBe('你好');
  // 刪光 → 又回到提示狀態
  await input.fill('');
  await expect.poll(async () => (await txt()).placeholder).toBe(true);
  await page.screenshot({ path: `${SHOT}/text-placeholder.png` });
});

test('X1-4 按鈕、選單、輸入框都是圓角，不是膠囊（圓形白名單：圓點、＋、播放鍵）', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  const bad: string[] = [];
  for (const tab of ['剪輯', '疊加', '文字', '圖層', '版型', '特效', '色調', '素材', '音訊'] as const) {
    await openTab(page, tab);
    const r = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(
        document.querySelectorAll('.bottombar button, .bottombar select, .bottombar input'),
      )) {
        const b = (el as HTMLElement).getBoundingClientRect();
        if (b.width < 8 || b.height < 8) continue;
        const cs = getComputedStyle(el);
        const rad = parseFloat(cs.borderTopLeftRadius);
        const round = cs.borderTopLeftRadius.includes('%') || Math.abs(b.width - b.height) < 4;
        if (!round && rad >= b.height / 2 - 1)
          out.push(`${(el as HTMLElement).className}:${(el.textContent ?? '').slice(0, 6)}`);
      }
      return out;
    });
    bad.push(...r.map((x) => `${tab}/${x}`));
  }
  expect(bad).toEqual([]);
});

test('X1-6 再點一次目前的分頁，面板不會收合', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await openTab(page, '色調');
  await clips(page).first().tap();
  await expect(page.getByTestId('color-panel')).toBeVisible();
  await page.locator('.tabs').getByRole('tab', { name: '色調', exact: true }).tap();
  await expect(page.getByTestId('color-panel')).toBeVisible();
});

test('X1-7/8/9/10 片段範圍視窗：圖示播放鈕、秒數等寬、播放時按鈕不抖、右上角沒有按鈕壓住預覽', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']);
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '片段範圍', exact: true }).tap();
  const play = page.getByTestId('rm-play');
  await expect(play.locator('svg')).toHaveCount(1);
  expect(((await play.innerText()) ?? '').trim()).toBe('');
  await expect(play).toHaveAttribute('aria-label', '播放');
  await expect(page.locator('body')).not.toContainText('⏸');
  // 秒數等寬數字
  expect(
    await page.getByTestId('rm-now').evaluate((el) => getComputedStyle(el).fontVariantNumeric),
  ).toContain('tabular-nums');
  // 預覽跟任何按鈕不重疊
  const prev = (await page.getByTestId('rm-preview').boundingBox())!;
  for (const b of await page.locator('[role=dialog] button').all()) {
    const bb = await b.boundingBox();
    if (!bb) continue;
    const overlap =
      bb.x < prev.x + prev.width &&
      bb.x + bb.width > prev.x &&
      bb.y < prev.y + prev.height &&
      bb.y + bb.height > prev.y;
    expect(overlap).toBe(false);
  }
  // 播放中連續取 10 次：播放鈕的位置、寬度完全一樣
  await play.tap();
  await expect(play).toHaveAttribute('aria-label', '暫停');
  const boxes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const b = (await play.boundingBox())!;
    boxes.push(`${Math.round(b.x * 10)}/${Math.round(b.width * 10)}`);
    await page.waitForTimeout(60);
  }
  expect(new Set(boxes).size).toBe(1);
});

test('X1-12 色調卡片名稱都在一行裡', async ({ page }) => {
  await createProjectWith(page, ['solid-red.webm']);
  await clips(page).first().tap();
  await openTab(page, '色調');
  await expect(page.getByTestId('look-card')).toHaveCount(10);
  const lines = await page.getByTestId('look-card').evaluateAll((els) =>
    els.map((el) => {
      const rg = document.createRange();
      rg.selectNodeContents(el.querySelector('span')!);
      return new Set(Array.from(rg.getClientRects()).map((x) => Math.round(x.top / 3))).size;
    }),
  );
  for (const n of lines) expect(n).toBe(1);
  await expect(page.getByRole('radio', { name: '色調 高反差' })).toBeVisible();
});

const WIDTHS = [320, 375, 390, 430];
for (const w of WIDTHS) {
  test(`X1-11/13 ${w} 寬：字級統一、不換行、不超出畫面、不左右捲動、分頁一列放得下`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: w, height: 844 });
    await createProjectWith(page, ['solid-red.webm']);
    await clips(page).first().tap();
    const problems: string[] = [];
    const scan = async (where: string) => {
      const r = await page.evaluate(() => {
        const out: string[] = [];
        const root = document.documentElement;
        if (root.scrollWidth > window.innerWidth + 1)
          out.push(`頁面左右捲動 ${root.scrollWidth}>${window.innerWidth}`);
        const scrollRow = (el: Element) => {
          for (let p: Element | null = el.parentElement; p; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1)
              return true;
          }
          return false;
        };
        const lines = (el: Element) => {
          // 每一段文字各自算幾行（圖示在上、文字在下的按鈕不算兩行）
          let worst = 0;
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!(n.textContent ?? '').trim()) continue;
            const rg = document.createRange();
            rg.selectNodeContents(n);
            const tops = new Set(
              Array.from(rg.getClientRects())
                .filter((x) => x.width > 1)
                .map((x) => Math.round(x.top / 3)),
            );
            worst = Math.max(worst, tops.size);
          }
          return worst;
        };
        const els = Array.from(
          document.querySelectorAll('.bottombar button, [role=dialog] button, .bottombar select'),
        );
        for (const el of els) {
          const h = el as HTMLElement;
          if (h.closest('.timeline')) continue;
          const b = h.getBoundingClientRect();
          if (b.width < 8 || b.height < 8) continue;
          const label = `${h.className}:${(h.textContent ?? '').slice(0, 8)}`;
          const inScrollRow = scrollRow(h);
          if (b.right > window.innerWidth + 1 && !inScrollRow) out.push(`超出右邊 ${label}`);
          const text = (h.textContent ?? '').trim();
          if (text && !h.classList.contains('pb-btn') && !h.classList.contains('add-circle')) {
            const n = lines(h);
            if (n > 1) out.push(`換行 ${label} ${n}行`);
            if (h.scrollWidth > h.clientWidth + 1 && !inScrollRow) out.push(`字被截 ${label}`);
          }
        }
        const tabs = document.querySelector('.tabs') as HTMLElement;
        if (tabs.scrollWidth > tabs.clientWidth + 1)
          out.push(`分頁列放不下 ${tabs.scrollWidth}>${tabs.clientWidth}`);
        // 字級統一：分頁、按鈕、chip、卡片名稱同一個大小
        const tabFs = parseFloat(getComputedStyle(document.querySelector('.tab')!).fontSize);
        for (const el of Array.from(
          document.querySelectorAll(
            '.bottombar .btn, .bottombar .chip, .bottombar .chip3, .bottombar .look-card span',
          ),
        )) {
          const b2 = el.getBoundingClientRect();
          if (b2.width < 8) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (Math.abs(fs - tabFs) > 0.6)
            out.push(
              `字級 ${(el as HTMLElement).className}:${(el.textContent ?? '').slice(0, 6)} ${fs}≠${tabFs}`,
            );
        }
        return out;
      });
      problems.push(...r.map((x) => `${w}/${where}/${x}`));
    };
    for (const tab of ['剪輯', '疊加', '文字', '圖層', '版型', '特效', '色調', '素材', '音訊'] as const) {
      await openTab(page, tab);
      await scan(tab);
    }
    const fs = await page.evaluate(() => ({
      btn: parseFloat(
        getComputedStyle(document.querySelector('.bottombar .btn, .bottombar .chip, .tab')!).fontSize,
      ),
      tab: parseFloat(getComputedStyle(document.querySelector('.tab')!).fontSize),
    }));
    if (w === 320) expect(fs.tab).toBeCloseTo(12, 0);
    if (w >= 390) expect(fs.tab).toBeCloseTo(14, 0);
    expect(problems).toEqual([]);
  });
}
