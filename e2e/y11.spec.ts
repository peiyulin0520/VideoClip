import { expect, test } from '@playwright/test';
import { createProjectWith, expectToast, openTab, project } from './helpers';

test('Y11 素材檔不見了：沒用到的素材安靜地從清單拿掉、不跳通知；有用到的才提醒，片段標「素材遺失」', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createProjectWith(page, ['solid-blue.webm', 'solid-red.webm']);
  const p0 = await project(page);
  const pid = new URL(page.url()).hash.match(/#\/p\/([^/?]+)/)![1]!;
  const [a, b] = p0.assets as unknown as { id: string; name: string }[];
  // 把第 2 個片段刪掉：它的素材還在清單裡，但沒有任何物件在用
  const clips = page.getByTestId('clip');
  await clips.nth(1).tap();
  await openTab(page, '剪輯');
  await page.getByRole('button', { name: '刪除', exact: true }).first().tap();
  await expect(clips).toHaveCount(1);
  expect((await project(page)).assets.length).toBe(2);
  await page.waitForTimeout(1500); // 等自動儲存
  // 兩個素材的原檔都從手機裡不見（像清掉 Safari 網站資料）
  await page.evaluate(
    async ([pid, ids]) => {
      const root = await navigator.storage.getDirectory();
      const dir = await (await root.getDirectoryHandle('projects')).getDirectoryHandle(pid!);
      const media = await dir.getDirectoryHandle('media');
      for (const id of ids!) await media.removeEntry(id).catch(() => {});
    },
    [pid, [a!.id, b!.id]] as [string, string[]],
  );
  await page.reload();
  await expect(page.getByTestId('clip')).toHaveCount(1, { timeout: 20_000 });
  // 通知只提到有在用的那一個；沒在用的不提
  await expectToast(page, `1 個素材找不到檔案：${a!.name}`);
  await expect(page.locator('.toast')).not.toContainText(b!.name);
  await expect(page.getByTestId('clip-lost')).toBeVisible();
  // 沒在用的素材已經從專案的素材清單拿掉
  const p1 = await project(page);
  expect((p1.assets as unknown as { id: string }[]).map((x) => x.id)).toEqual([a!.id]);
});
