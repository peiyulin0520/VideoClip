import type { Asset } from '../model/types';
import { getMedia } from '../storage/media';

// 把本機素材檔變成 object URL 給 <video>/<img> 用。整個編輯器共用，離開專案時釋放。
const urls = new Map<string, string>();
// 預覽用輕量影片的 URL（做好了才有）
const proxyUrls = new Map<string, string>();
const key = (projectId: string, assetId: string) => `${projectId}/${assetId}`;
/** 預覽用輕量影片在儲存空間裡的檔名 */
export const proxyKey = (assetId: string) => `${assetId}~p`;

async function loadProxy(projectId: string, a: Asset) {
  const k = key(projectId, a.id);
  if (proxyUrls.has(k) || a.proxy?.status !== 'ready') return;
  try {
    const f = await getMedia(projectId, proxyKey(a.id), a.proxy.mime ?? 'video/mp4');
    proxyUrls.set(k, URL.createObjectURL(f));
  } catch {
    /* 預覽檔不見了就照用原檔 */
  }
}

/** proxy 剛做好：載入它的 URL，之後 urlFor 的預覽用途就會用它 */
export async function ensureProxyUrl(projectId: string, a: Asset): Promise<void> {
  await loadProxy(projectId, a);
}

export async function ensureUrls(projectId: string, assets: Asset[]): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(
    assets.map(async (a) => {
      await loadProxy(projectId, a);
      if (urls.has(key(projectId, a.id))) return;
      try {
        const f = await getMedia(projectId, a.id, a.mime);
        urls.set(key(projectId, a.id), URL.createObjectURL(f));
      } catch {
        missing.push(a.name);
      }
    }),
  );
  return missing;
}

/** purpose：preview（預覽播放，有預覽用輕量影片就用它）／export（匯出、單格輸出，一律用原檔） */
export function urlFor(
  projectId: string,
  assetId: string,
  purpose: 'preview' | 'export' = 'preview',
): string | undefined {
  const k = key(projectId, assetId);
  return (purpose === 'preview' ? proxyUrls.get(k) : undefined) ?? urls.get(k);
}

export function releaseProjectUrls(projectId: string): void {
  for (const [k, u] of urls) {
    if (k.startsWith(`${projectId}/`)) {
      URL.revokeObjectURL(u);
      urls.delete(k);
    }
  }
  for (const [k, u] of proxyUrls) {
    if (k.startsWith(`${projectId}/`)) {
      URL.revokeObjectURL(u);
      proxyUrls.delete(k);
    }
  }
}
