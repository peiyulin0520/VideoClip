import { expect, test } from '@playwright/test';
import { createProjectWith, waitHook } from './helpers';

// 動態字卡「停在最後畫面」：每一式、不同長度的文字，停點那一格最後一個詞的字都要畫出來（不能停在「聚」沒播到「餐」，
// 也不能停在下一輪開頭）。做法：停點那一格畫兩次，只差某一個字（換成「丑」），畫面不一樣＝那個字有畫出來。
// 例外：一直在跑的式子（沒有「一輪」）、一次只出現一個字的「逐字重擊」只檢查最後一個字；
// 牌子數有上限的式子（翻牌 7、翻卡 7、拉霸 6、字被換掉 10）超過的字本來就不顯示；手電筒只照一部分、跳錶不是照字畫的。
const TEXTS = [
  '蔡氏家族聚餐',
  '環島公路 一路向南',
  'Hello',
  '好',
  '一二三四五六七八九十甲乙丙丁',
  '開場 登場 來了',
  '春日限定 夏夜特映 秋季新番',
];
const LIMIT: Record<string, number> = { flap: 7, flip: 7, slot: 6, corrupt: 10 };
const LAST_ONLY = new Set(['hit']);
const SKIP = new Set(['odo']);
const SOME_ONLY = new Set(['torch']);

type Row = { id: string; hold: number; total: number | null; lastDiff: number; perChar: number[] };

test('動態字卡停在最後：每一式的停點，最後一個詞的字都畫出來', async ({ page }) => {
  test.setTimeout(300_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await waitHook(page);
  const problems: string[] = [];
  for (const text of TEXTS) {
    const rows = (await page.evaluate(
      (t) =>
        (
          window as unknown as { __videoclip: { kineticHoldCheck: (t: string) => unknown[] } }
        ).__videoclip.kineticHoldCheck(t),
      text,
    )) as Row[];
    expect(rows.length).toBe(64);
    for (const r of rows) {
      if (r.total === null || SKIP.has(r.id)) continue; // 一直在跑的式子沒有「最後」
      if (r.hold > r.total + 1e-6) problems.push(`${text}/${r.id} 停點 ${r.hold} 超過一輪 ${r.total}`);
      const want = LAST_ONLY.has(r.id)
        ? [r.perChar.length - 1]
        : r.perChar.map((_, i) => i).filter((i) => i < (LIMIT[r.id] ?? 99));
      if (SOME_ONLY.has(r.id)) {
        if (!r.perChar.some((d) => d > 0)) problems.push(`${text}/${r.id} 一個字都沒畫出來`);
        continue;
      }
      const missing = want.filter((i) => r.perChar[i] === 0);
      if (missing.length)
        problems.push(`${text}/${r.id} 停點 ${r.hold.toFixed(2)} 第 ${missing.join(',')} 個字沒畫出來`);
    }
  }
  expect(problems).toEqual([]);
});
