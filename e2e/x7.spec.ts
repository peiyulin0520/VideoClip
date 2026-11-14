import { expect, test, type Page } from '@playwright/test';
import { clips, createProjectWith, openTab, project, seekTo as rawSeekTo, showTimeline } from './helpers';

const SHOT = 'docs/screenshots/feedback-12';
type Tr = {
  kind: string;
  duration: number;
  audio?: string;
  audioCut?: number;
  audioOutA?: number;
  audioInB?: number;
};
type It = { id: string; start: number; duration: number; transitionIn?: Tr };
const items = async (page: Page) =>
  ((await project(page)).tracks as unknown as { items: It[] }[])[0]!.items
    .slice()
    .sort((a, b) => a.start - b.start);

/** clip-a（2 秒、有聲音）接 clip-c（3 秒、有聲音）：接縫在 2 秒；疊化 2 秒＝接縫前後各 1 秒（轉場 1～3 秒） */
async function setup(page: Page) {
  await createProjectWith(page, ['clip-a.webm', 'clip-c.webm']);
  await showTimeline(page);
  await page.getByTestId('tr-circle').tap(); // 接縫的小圓圈：切到特效分頁、選到後一段
  await page.getByRole('radio', { name: '轉場 疊化' }).tap();
  await page.getByLabel('轉場長度').fill('20');
  await expect.poll(async () => (await items(page))[1]!.transitionIn?.duration).toBeCloseTo(2, 1);
}

async function seekTo(page: Page, sec: number) {
  // 面板更新時播放器會把時間軸捲回舊位置：捲到目標，等它真的到了才算
  await expect
    .poll(async () => {
      await rawSeekTo(page, sec + 0.05); // 先偏一點再回來，確定會有捲動事件
      await page.waitForTimeout(60);
      await rawSeekTo(page, sec);
      return page.evaluate(() =>
        (window as unknown as { __videoclip: { time: () => number } }).__videoclip.time(),
      );
    })
    .toBeGreaterThan(sec - 0.04);
}
const gains = async (page: Page) => {
  const [a, b] = await items(page);
  return page.evaluate(
    ([ia, ib]) => {
      const g = (
        window as unknown as { __videoclip: { audioGains: () => Record<string, number> } }
      ).__videoclip.audioGains();
      return { a: g[ia!] ?? -1, b: g[ib!] ?? -1 };
    },
    [a!.id, b!.id],
  );
};
const pick = (page: Page, name: string) =>
  page.getByTestId('tr-audio').getByRole('radio', { name, exact: true }).tap();

test('預設交叉淡化：轉場中間兩段的聲音都在（約 0.7），轉場前只有前段、轉場後只有後段', async ({ page }) => {
  test.setTimeout(120_000);
  await setup(page);
  await expect(page.getByTestId('tr-audio')).toBeVisible();
  await expect(page.getByTestId('tr-audio-cross')).toHaveAttribute('aria-checked', 'true');
  const mode = await page.evaluate(
    () => (window as unknown as { __videoclip: { audio: () => { mode: string } } }).__videoclip.audio().mode,
  );
  await seekTo(page, 2);
  if (mode === 'webaudio') {
    // 可以調音量的環境：中間兩段都約 0.7（等功率交叉）
    await expect
      .poll(async () => {
        const g = await gains(page);
        return g.a > 0.6 && g.a < 0.8 && g.b > 0.6 && g.b < 0.8;
      })
      .toBe(true);
  } else {
    // 舊 iPhone（element 模式，只能開／關）：兩段都 ≥ 0.5 → 都開著
    await expect
      .poll(async () => {
        const g = await gains(page);
        return g.a === 1 && g.b === 1;
      })
      .toBe(true);
  }
  await seekTo(page, 0.5);
  await expect.poll(async () => (await gains(page)).a).toBeGreaterThan(0.95);
  await seekTo(page, 3.5);
  await expect.poll(async () => (await gains(page)).b).toBeGreaterThan(0.95);
  await page.screenshot({ path: `${SHOT}/transition-audio.png` });
});

test('六種模式：只要前段／只要後段／靜音／直接切換，聲音倍數各自正確；存在轉場資料裡、換轉場效果不會掉', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await setup(page);
  await pick(page, '只要前段');
  await expect.poll(async () => (await items(page))[1]!.transitionIn?.audio).toBe('prev');
  await seekTo(page, 2.5); // 轉場中（1～3 秒）
  await expect.poll(async () => (await gains(page)).a).toBe(1);
  expect((await gains(page)).b).toBe(0);
  await pick(page, '只要後段');
  await seekTo(page, 1.5);
  await expect.poll(async () => (await gains(page)).b).toBe(1);
  expect((await gains(page)).a).toBe(0);
  await pick(page, '靜音');
  await seekTo(page, 2);
  await expect.poll(async () => (await gains(page)).a).toBe(0);
  expect((await gains(page)).b).toBe(0);
  await seekTo(page, 0.5);
  await expect.poll(async () => (await gains(page)).a).toBe(1);
  // 直接切換（預設切換點＝接縫 2 秒）：2 秒前只有前段、2 秒後只有後段，不淡化
  await pick(page, '直接切換');
  await page.getByTestId('ta-apply').tap();
  await seekTo(page, 1.8);
  await expect.poll(async () => (await gains(page)).a).toBe(1);
  expect((await gains(page)).b).toBe(0);
  await seekTo(page, 2.2);
  await expect.poll(async () => (await gains(page)).b).toBe(1);
  expect((await gains(page)).a).toBe(0);
  // 換轉場效果：聲音設定還在
  await page.getByRole('radio', { name: '轉場 閃黑' }).tap();
  await expect.poll(async () => (await items(page))[1]!.transitionIn?.kind).toBe('blackflash');
  expect((await items(page))[1]!.transitionIn!.audio).toBe('cut');
  // 回到交叉淡化：不寫欄位（預設）
  await pick(page, '交叉淡化');
  await expect.poll(async () => (await items(page))[1]!.transitionIn?.audio).toBeUndefined();
});

test('自訂起迄：聲音軸上拖「前迄」「後起」；後段起可以拖到轉場結束之後，那段時間兩段都沒聲音；套用才寫入、取消不改', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await setup(page);
  await pick(page, '自訂起迄');
  await expect(page.getByTestId('ta-flag-out')).toBeVisible();
  await expect(page.getByTestId('ta-flag-in')).toBeVisible();
  const strip = (await page.getByTestId('ta-strip').boundingBox())!;
  const drag = async (id: string, dx: number) => {
    const b = (await page.getByTestId(id).boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, { steps: 4 });
    await page.mouse.move(x + dx, y, { steps: 4 });
    await page.mouse.up();
  };
  // 軸＝接縫前 2 秒＋接縫後 3 秒（共 5 秒）：1 秒＝strip.width / 5
  const sec = strip.width / 5;
  await drag('ta-flag-out', -sec * 0.5); // 前段迄：接縫前約 0.5 秒
  await drag('ta-flag-in', sec * 1.5); // 後段起：接縫後約 1.5 秒（轉場 3 秒結束後 ... 轉場在接縫後 1 秒結束）
  await expect(page.getByTestId('ta-summary')).toContainText('中間');
  await page.getByTestId('ta-apply').tap();
  const t = (await items(page))[1]!.transitionIn!;
  expect(t.audio).toBe('custom');
  expect(t.audioOutA!).toBeLessThan(-0.3);
  expect(t.audioOutA!).toBeGreaterThan(-0.8);
  expect(t.audioInB!).toBeGreaterThan(1.2);
  expect(t.audioInB!).toBeLessThan(1.8);
  // 預覽：接縫前 1 秒（前段迄之前）有前段；接縫後 0.3 秒兩段都沒有；轉場結束（接縫後 1 秒）之後 0.3 秒後段還是 0；晚於後段起之後才有
  await seekTo(page, 1.2);
  await expect.poll(async () => (await gains(page)).a).toBe(1);
  await seekTo(page, 2.3);
  await expect.poll(async () => (await gains(page)).a).toBe(0);
  expect((await gains(page)).b).toBe(0);
  await seekTo(page, 3.3); // 轉場已經結束（3 秒），但後段要到接縫後 ≥1.2 秒（3.2 秒）才有聲音
  await seekTo(page, 3.0);
  await expect.poll(async () => (await gains(page)).b).toBe(0);
  await seekTo(page, 4.0);
  await expect.poll(async () => (await gains(page)).b).toBe(1);
  // 取消不改
  await page.getByTestId('tr-audio-edit').tap();
  await drag('ta-flag-in', -sec * 2);
  await page.getByRole('button', { name: '取消', exact: true }).tap();
  expect((await items(page))[1]!.transitionIn!.audioInB!).toBeGreaterThan(1.2);
  await page.screenshot({ path: `${SHOT}/transition-audio-custom.png` });
});

test('匯出：交叉淡化時轉場那段兩邊都有聲音；靜音時轉場那段是空的、轉場外還在', async ({ page }) => {
  test.setTimeout(240_000);
  await setup(page);
  const inspect = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          __videoclip: {
            exportAndInspect: (
              a: unknown,
              b: unknown,
            ) => Promise<{ audioPeaks: number[]; hasAudio: boolean }>;
          };
        }
      ).__videoclip.exportAndInspect(
        { longSide: 1280, fps: 30, preferWebm: true },
        { times: [], points: [] },
      ),
    );
  const cross = await inspect(); // clip-a 0–2 秒、clip-c 2–5 秒；轉場 1～3 秒
  expect(cross.hasAudio).toBe(true);
  expect(cross.audioPeaks[0]!).toBeGreaterThan(0.03);
  expect(cross.audioPeaks[1]!).toBeGreaterThan(0.03);
  expect(cross.audioPeaks[2]!).toBeGreaterThan(0.03);
  await pick(page, '靜音');
  await expect.poll(async () => (await items(page))[1]!.transitionIn?.audio).toBe('mute');
  const mute = await inspect();
  expect(mute.audioPeaks[0]!).toBeGreaterThan(0.03); // 轉場前
  expect(mute.audioPeaks[1]!).toBeLessThan(0.01); // 轉場期間（1～3 秒）沒有聲音
  expect(mute.audioPeaks[2]!).toBeLessThan(0.01);
  expect(mute.audioPeaks[3]!).toBeGreaterThan(0.03); // 轉場後
});
