import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createProjectWith, waitHook } from './helpers';

// feedback-17 Z22：把每一式「停在最後畫面」那一格拼成對照圖，人工看字是不是都乖乖待著。
// 平常不跑（會寫 docs/screenshots）：Z22_SHEET=before|after 才跑。
test('Z22 停在最後畫面的對照圖', async ({ page }) => {
  test.skip(!process.env.Z22_SHEET, '只在要產生對照圖時跑');
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm']);
  await waitHook(page);
  const url = await page.evaluate(
    (t) =>
      (
        window as unknown as { __videoclip: { kineticHoldSheet: (t: string) => string } }
      ).__videoclip.kineticHoldSheet(t),
    '蔡氏家族聚餐',
  );
  mkdirSync('docs/screenshots/feedback-17', { recursive: true });
  writeFileSync(
    `docs/screenshots/feedback-17/hold-sheet-${process.env.Z22_SHEET}.png`,
    Buffer.from(url.split(',')[1]!, 'base64'),
  );
});
