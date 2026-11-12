import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGiphyKey, giphyStickers, GiphyError, parseGiphy, setGiphyKey } from './giphy';

describe('GIPHY', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('key 存在這台裝置（localStorage），可以清掉；前後空白會去掉', () => {
    expect(getGiphyKey()).toBeNull();
    setGiphyKey('  abc123  ');
    expect(getGiphyKey()).toBe('abc123');
    setGiphyKey(null);
    expect(getGiphyKey()).toBeNull();
  });

  it('解析回應：縮圖用會動的小圖、加入用靜態第一格；缺圖的略過', () => {
    const s = parseGiphy({
      id: 'x1',
      title: 'Cat',
      images: {
        fixed_width_small: { url: 'https://m/s.gif', webp: 'https://m/s.webp' },
        original_still: { url: 'https://m/still.gif' },
        original: { width: '480', height: '270' },
      },
    })!;
    expect(s).toMatchObject({
      id: 'x1',
      thumb: 'https://m/s.webp',
      still: 'https://m/still.gif',
      width: 480,
      height: 270,
    });
    expect(parseGiphy({ id: 'y', images: {} })).toBeNull();
  });

  it('沒有 key：不送出請求，丟 no-key', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    await expect(giphyStickers('cat', null)).rejects.toMatchObject({ kind: 'no-key' });
    expect(f).not.toHaveBeenCalled();
  });

  it('搜尋：用 stickers/search、帶 key、中文用 zh-TW；空字串用熱門', async () => {
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify({ data: [] })));
    await giphyStickers('貓咪', 'K1');
    const u1 = new URL(String(f.mock.calls[0]![0]));
    expect(u1.pathname).toBe('/v1/stickers/search');
    expect(u1.searchParams.get('api_key')).toBe('K1');
    expect(u1.searchParams.get('q')).toBe('貓咪');
    expect(u1.searchParams.get('lang')).toBe('zh-TW');
    expect(u1.searchParams.get('rating')).toBe('g');
    await giphyStickers('  ', 'K1');
    expect(new URL(String(f.mock.calls[1]![0])).pathname).toBe('/v1/stickers/trending');
  });

  it('錯誤分類：key 不對、次數用完、連不到', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(giphyStickers('a', 'K')).rejects.toMatchObject({ kind: 'bad-key' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 429 }));
    await expect(giphyStickers('a', 'K')).rejects.toMatchObject({ kind: 'limit' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fail'));
    const e = await giphyStickers('a', 'K').catch((x) => x);
    expect(e).toBeInstanceOf(GiphyError);
    expect(e.kind).toBe('network');
  });
});
