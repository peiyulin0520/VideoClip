import type { Asset } from '../model/types';
import { getMedia } from '../storage/media';

// 把本機素材檔變成 object URL 給 <video>/<img> 用。整個編輯器共用，離開專案時釋放。
const urls = new Map<string, string>();
const key = (projectId: string, assetId: string) => `${projectId}/${assetId}`;

export async function ensureUrls(projectId: string, assets: Asset[]): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(
    assets.map(async (a) => {
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

export function urlFor(projectId: string, assetId: string): string | undefined {
  return urls.get(key(projectId, assetId));
}

export function releaseProjectUrls(projectId: string): void {
  for (const [k, u] of urls) {
    if (k.startsWith(`${projectId}/`)) {
      URL.revokeObjectURL(u);
      urls.delete(k);
    }
  }
}
