import { describe, expect, it } from 'vitest';
import { addToLibrary, getLibraryFile, listLibrary, removeFromLibrary } from './library';

describe('我的素材庫', () => {
  it('新增、依時間新到舊列出、取檔案、刪除', async () => {
    const a = await addToLibrary(new Blob(['a'], { type: 'image/png' }), '小狗.png');
    await new Promise((r) => setTimeout(r, 5));
    const b = await addToLibrary(new Blob(['bb'], { type: 'image/png' }), '愛心');
    const list = await listLibrary('sticker');
    expect(list.map((r) => r.id).slice(0, 2)).toEqual([b.id, a.id]);
    expect(list.find((r) => r.id === a.id)!.bytes).toBe(1);
    const f = await getLibraryFile(b.id);
    expect(f!.name).toBe('愛心.png');
    await removeFromLibrary(a.id);
    expect((await listLibrary()).some((r) => r.id === a.id)).toBe(false);
    expect(await getLibraryFile('nope')).toBeNull();
  });
});
