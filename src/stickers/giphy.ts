// GIPHY 貼圖（IG 限時動態的貼圖也是 GIPHY）。
// ⚠ API key 只存在這台裝置（localStorage），絕不寫進程式碼或 GitHub（公開 repo）。別人打開網站沒有這把 key。
// 只會把「搜尋關鍵字」送到 GIPHY，不會上傳影片。搜尋結果不存，每次各自搜尋（使用者 2026-11-12）。

import { hasImageDecoder, sniffImageType } from '../engine/animImage';

const KEY = 'vc-giphy-key';
const API = 'https://api.giphy.com/v1/stickers';

export function getGiphyKey(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}
export function setGiphyKey(key: string | null) {
  try {
    if (key) localStorage.setItem(KEY, key.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* 存不了就算了 */
  }
}

export type GiphySticker = {
  id: string;
  title: string;
  /** 格子裡的縮圖（會動） */
  thumb: string;
  /** 加進專案用的靜態圖（第一格）：會動的版本下載不到時的備用 */
  still: string;
  /** 加進專案用的會動版本（約 200px 高）：動態 WebP（有透明、檔案小）與 GIF（備用） */
  anim?: { webp?: string; gif?: string };
  width: number;
  height: number;
};

type Img = { url?: string; webp?: string; width?: string; height?: string };
type Raw = { id: string; title?: string; images: Record<string, Img | undefined> };

export function parseGiphy(raw: Raw): GiphySticker | null {
  const im = raw.images ?? {};
  const thumb = im.fixed_width_small?.webp || im.fixed_width_small?.url || im.fixed_width?.url;
  const still = im.original_still?.url || im.fixed_width_still?.url || im.fixed_width?.url;
  if (!thumb || !still) return null;
  const a = im.fixed_height ?? im.fixed_width;
  const anim = a && (a.webp || a.url) ? { webp: a.webp, gif: a.url } : undefined;
  return {
    id: raw.id,
    title: raw.title ?? '',
    thumb,
    still,
    ...(anim ? { anim } : {}),
    width: Number(im.original?.width ?? im.fixed_width?.width ?? 200),
    height: Number(im.original?.height ?? im.fixed_width?.height ?? 200),
  };
}

export class GiphyError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-key' | 'bad-key' | 'limit' | 'network' | 'other',
  ) {
    super(message);
  }
}

/** 熱門（q 是空的）或搜尋 */
export async function giphyStickers(q: string, key = getGiphyKey(), limit = 24): Promise<GiphySticker[]> {
  if (!key) throw new GiphyError('還沒有填 GIPHY API key', 'no-key');
  const params = new URLSearchParams({ api_key: key, limit: String(limit), rating: 'g' });
  if (q.trim()) {
    params.set('q', q.trim());
    params.set('lang', /[㐀-鿿]/.test(q) ? 'zh-TW' : 'en');
  }
  let res: Response;
  try {
    res = await fetch(`${API}/${q.trim() ? 'search' : 'trending'}?${params}`);
  } catch {
    throw new GiphyError('連不到 GIPHY（網路有問題？）', 'network');
  }
  if (res.status === 401 || res.status === 403) throw new GiphyError('GIPHY API key 不正確', 'bad-key');
  if (res.status === 429) throw new GiphyError('這個小時的搜尋次數用完了，晚一點再試', 'limit');
  if (!res.ok) throw new GiphyError(`GIPHY 回應錯誤（${res.status}）`, 'other');
  const body = (await res.json()) as { data?: Raw[] };
  return (body.data ?? []).map(parseGiphy).filter((x): x is GiphySticker => !!x);
}

/**
 * 加進專案用的檔案：優先下載會動的版本（瀏覽器有 ImageDecoder 就用動態 WebP——有半透明邊緣；沒有就用 GIF），
 * 下載不到或沒有會動的版本，退回第一格的靜態 PNG。
 */
export async function giphyToFile(s: GiphySticker): Promise<File> {
  const url = hasImageDecoder() ? (s.anim?.webp ?? s.anim?.gif) : (s.anim?.gif ?? undefined);
  if (url) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const type = await sniffImageType(blob);
        if (type)
          return new File([blob], `GIPHY-${s.id}.${type === 'image/webp' ? 'webp' : 'gif'}`, { type });
      }
    } catch {
      /* 下載不到：用靜態圖 */
    }
  }
  return giphyToPng(s);
}

/** 把 GIPHY 貼圖的第一格畫成 512px PNG（靜態備用版） */
export async function giphyToPng(s: GiphySticker, size = 512): Promise<File> {
  const res = await fetch(s.still);
  if (!res.ok) throw new Error(`下載貼圖失敗（${res.status}）`);
  const url = URL.createObjectURL(await res.blob());
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = size / Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((img.naturalWidth || 1) * k));
    c.height = Math.max(1, Math.round((img.naturalHeight || 1) * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob>((ok, bad) =>
      c.toBlob((b) => (b ? ok(b) : bad(new Error('轉成圖片失敗'))), 'image/png'),
    );
    return new File([blob], `GIPHY-${s.id}.png`, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
