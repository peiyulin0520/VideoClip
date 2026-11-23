import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, openTab, project, showTimeline } from './helpers';

const SHOT = 'docs/screenshots/feedback-12';

const dialog = (page: Page) => page.getByRole('dialog').last();
const meta = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __videoclip: { project: () => { aspect: string; name: string } } }
    ).__videoclip.project(),
  );

test('每種彈出視窗右上角都有 ❌（關閉），底部沒有「取消」按鈕；按 ❌ 視窗就關掉', async ({ page }) => {
  test.setTimeout(150_000);
  await createProjectWith(page, ['clip-a.webm']);
  await showTimeline(page);
  const check = async (name: string) => {
    const d = dialog(page);
    await expect(d).toBeVisible();
    await expect(d.getByRole('button', { name: '關閉', exact: true })).toHaveCount(1);
    expect(await d.getByRole('button', { name: '取消', exact: true }).count()).toBe(0);
    await d.getByRole('button', { name: '關閉', exact: true }).tap();
    await expect(page.getByRole('dialog', { name })).toHaveCount(0);
  };
  // 畫面比例
  await page.getByRole('button', { name: '畫面比例' }).tap();
  await check('畫面比例');
  // 專案名稱
  await page.getByRole('button', { name: '專案名稱' }).tap();
  await check('專案名稱');
  // 匯出
  await page.getByRole('button', { name: '匯出影片' }).tap();
  await check('匯出影片');
  // 片段命名、片段範圍
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '命名', exact: true }).tap();
  await check('片段命名');
  await page.getByTestId('tool-edit.trim').tap();
  await check('剪取片段');
  // 進階：聲音範圍
  await openTab(page, '音訊');
  await page.getByTestId('audio-mute').first().tap();
  await check('進階：聲音範圍');
});

test('片段範圍視窗：拖旗標後按 ❌ → 專案沒變；重新打開拖旗標按套用 → 變了；↩ 復原、↪ 重做；套用鈕是主題色', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-red.webm']); // 4 秒
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  const dur = async () => (await project(page)).tracks[0]!.items[0]!.duration;
  const drag = async (id: string, dx: number) => {
    // 視窗滑進來的動畫結束、旗標位置不動了再拖
    let b = (await page.getByTestId(id).boundingBox())!;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(60);
      const n = (await page.getByTestId(id).boundingBox())!;
      const same = Math.abs(n.x - b.x) < 0.5 && Math.abs(n.y - b.y) < 0.5;
      b = n;
      if (same) break;
    }
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
  };
  await page.getByTestId('tool-edit.trim').tap();
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  await drag('range-flag-end-0', -strip.width * 0.5);
  await page.getByRole('button', { name: '關閉', exact: true }).tap(); // ❌：不存
  expect(await dur()).toBeCloseTo(4, 1);
  await page.getByTestId('tool-edit.trim').tap();
  await drag('range-flag-end-0', -strip.width * 0.5);
  // 復原、重做
  const body = () => page.getByTestId('range-body-0').boundingBox();
  const full = (await body())!.width;
  await page.getByTestId('rm-undo').tap();
  await expect.poll(async () => (await body())!.width).toBeGreaterThan(full * 1.5);
  await page.getByTestId('rm-redo').tap();
  await expect.poll(async () => (await body())!.width).toBeLessThan(full * 1.1);
  // 套用鈕：主題色底
  const bg = await page.getByTestId('rm-apply').evaluate((el) => getComputedStyle(el).backgroundColor);
  const accent = await page.evaluate(() => {
    const t = document.createElement('div');
    t.style.background = 'var(--accent)';
    document.body.appendChild(t);
    const c = getComputedStyle(t).backgroundColor;
    t.remove();
    return c;
  });
  expect(bg).toBe(accent);
  await page.getByTestId('rm-apply').tap();
  expect(await dur()).toBeLessThan(3);
  await page.screenshot({ path: `${SHOT}/sheet-close.png` });
});

test('片段預覽：按播放後聲音打開；白線在沒選取的地方預覽變灰＋標「沒選取」，在選取範圍裡是原色＋「選取中 第 1 組」', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']); // 2 秒、有聲音
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByTestId('tool-edit.trim').tap();
  const video = page.getByTestId('rm-video');
  await expect(page.getByTestId('rm-state')).toContainText('選取中 第 1 組');
  expect(await video.evaluate((v) => getComputedStyle(v).filter)).not.toContain('grayscale');
  await page.getByTestId('rm-play').tap();
  expect(await video.evaluate((v) => (v as HTMLVideoElement).muted)).toBe(false);
  await page.getByTestId('rm-play').tap(); // 暫停
  // 把「迄」旗標往左拖一半，再點縮圖條右邊（沒選取的地方）
  const strip = (await page.getByTestId('trim-strip').boundingBox())!;
  const f = (await page.getByTestId('range-flag-end-0').boundingBox())!;
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
  await page.mouse.down();
  await page.mouse.move(f.x + f.width / 2 - strip.width * 0.5, f.y + f.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.mouse.click(strip.x + strip.width * 0.9, strip.y + strip.height / 2);
  await expect(page.getByTestId('rm-state')).toContainText('沒選取');
  expect(await video.evaluate((v) => getComputedStyle(v).filter)).toContain('grayscale');
  await page.mouse.click(strip.x + strip.width * 0.1, strip.y + strip.height / 2);
  await expect(page.getByTestId('rm-state')).toContainText('選取中 第 1 組');
  expect(await video.evaluate((v) => getComputedStyle(v).filter)).not.toContain('grayscale');
});

test('設定型彈出視窗都有「套用」或「儲存」；沒按就按 ❌ 關閉 → 這次的調整不算', async ({ page }) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['clip-a.webm']); // 直式 9:16
  await showTimeline(page);
  const closeX = () => page.getByRole('button', { name: '關閉', exact: true }).tap();
  const hasSave = async (re: RegExp) => {
    const n = await dialog(page).getByRole('button', { name: re }).count();
    expect(n).toBeGreaterThan(0);
  };

  // 畫面比例：選了 1:1 → ❌ → 沒變；再選一次按套用 → 變
  const ratioBtn = page.getByRole('button', { name: '畫面比例' });
  const before = (await meta(page)).aspect;
  await ratioBtn.tap();
  await hasSave(/套用/);
  await page.getByRole('radio', { name: /1:1/ }).tap();
  await closeX();
  expect((await meta(page)).aspect).toBe(before);
  await ratioBtn.tap();
  await page.getByRole('radio', { name: /1:1/ }).tap();
  await page.getByTestId('ratio-apply').tap();
  expect((await meta(page)).aspect).toBe('1:1');
  await expect(dialog(page)).toBeVisible(); // 套用後視窗還開著
  await page.getByRole('radio', { name: /16:9/ }).tap();
  await closeX(); // 套用後才選的 16:9 不算；已套用的 1:1 還在
  expect((await meta(page)).aspect).toBe('1:1');

  // 專案名稱：打了新名字 → ❌ → 沒變；按儲存 → 變
  const nameBtn = page.getByRole('button', { name: '專案名稱', exact: true });
  const oldName = (await meta(page)).name;
  await nameBtn.tap();
  await hasSave(/儲存/);
  await page.getByLabel('專案名稱輸入').fill('不會存的名字');
  await closeX();
  expect((await meta(page)).name).toBe(oldName);
  await nameBtn.tap();
  await page.getByLabel('專案名稱輸入').fill('會存的名字');
  await page.getByRole('button', { name: '儲存', exact: true }).tap();
  expect((await meta(page)).name).toBe('會存的名字');
  // 儲存後視窗不會自動關；之後改了又按 ✕ → 只放棄「儲存之後」的改動，已儲存的還在
  await expect(dialog(page)).toBeVisible();
  await page.getByLabel('專案名稱輸入').fill('儲存後又改的');
  await closeX();
  expect((await meta(page)).name).toBe('會存的名字');

  // 片段命名
  await clips(page).first().tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '命名', exact: true }).tap();
  await hasSave(/儲存/);
  await page.getByLabel('片段名稱').fill('不存');
  await closeX();
  await expect(clips(page).first()).not.toContainText('不存');
  await page.screenshot({ path: `${SHOT}/popup-save-rule.png` });

  // 字體
  await openTab(page, '文字');
  await page.getByTestId('tool-text.add').tap();
  const fontOf = async () => {
    const p = await project(page);
    return p.tracks.flatMap((t) => t.items).find((i) => i.type === 'text')!.card!.runs[0]!.fontId;
  };
  const f0 = await fontOf();
  await page.getByRole('button', { name: '字體', exact: true }).tap();
  await hasSave(/套用/);
  await dialog(page).locator('[data-font-key]').first().tap();
  await closeX();
  expect(await fontOf()).toBe(f0);
});
