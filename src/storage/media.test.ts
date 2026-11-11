import { afterEach, describe, expect, it, vi } from 'vitest';
import { chunkRanges, getMedia, putMedia, WRITE_CHUNK } from './media';

describe('分段寫入', () => {
  it('每段最多 8MB，剛好接起來', () => {
    const size = WRITE_CHUNK * 2 + 123;
    const r = chunkRanges(size);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual([0, WRITE_CHUNK]);
    expect(r[2]).toEqual([WRITE_CHUNK * 2, size]);
    expect(r.every(([a, b], i) => b > a && (i === 0 || a === r[i - 1]![1]))).toBe(true);
  });
  it('空檔案沒有段、小檔案一段', () => {
    expect(chunkRanges(0)).toEqual([]);
    expect(chunkRanges(5)).toEqual([[0, 5]]);
  });
});

describe('存素材：一層失敗往下一層退', () => {
  afterEach(() => vi.restoreAllMocks());
  const blob = new Blob(['hello'], { type: 'video/mp4' });

  it('沒有 OPFS 的環境（jsdom）→ 存 IndexedDB，之後找得到（jsdom 的假 IndexedDB 不保留 Blob 內容，內容在 e2e 驗證）', async () => {
    const where = await putMedia('p1', 'a1', blob);
    expect(where).toBe('idb');
    await expect(getMedia('p1', 'a1', 'video/mp4')).resolves.toBeInstanceOf(File);
    await expect(getMedia('p1', 'nope', 'video/mp4')).rejects.toThrow();
  });

  it('IndexedDB 也寫不進去 → 退到記憶體，並回報原因；同一頁面仍讀得到', async () => {
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('The operation failed for an unknown transient reason', 'UnknownError');
    });
    const fell: string[] = [];
    const where = await putMedia('p2', 'a2', blob, { onFallback: (from) => fell.push(from) });
    expect(where).toBe('memory');
    expect(fell).toEqual(['idb']);
    vi.restoreAllMocks();
    const f = await getMedia('p2', 'a2', 'video/mp4');
    expect(await f.text()).toBe('hello');
  });

  it('persistent=false（已知空間不夠）→ 直接放記憶體，不碰儲存', async () => {
    const fell: string[] = [];
    const where = await putMedia('p3', 'a3', blob, { persistent: false, onFallback: (f) => fell.push(f) });
    expect(where).toBe('memory');
    expect(fell).toEqual([]);
  });
});
