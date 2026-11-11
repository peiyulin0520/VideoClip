import { createClip, newId } from '../model/defaults';
import type { Asset, VideoItem } from '../model/types';
import { putMedia } from '../storage/media';
import { mediaKindOf, probeMedia } from './probe';

export type ImportResult = {
  assets: Asset[];
  clips: VideoItem[];
  failed: { name: string; reason: string }[];
};

/** 匯入檔案：存進本機（OPFS）→ 讀資訊與縮圖 → 產生素材與主軌片段。依選擇順序。 */
export async function importFiles(
  projectId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const result: ImportResult = { assets: [], clips: [], failed: [] };
  let done = 0;
  for (const file of files) {
    onProgress?.(done, files.length);
    const kind = mediaKindOf(file);
    if (!kind) {
      result.failed.push({ name: file.name, reason: '不支援的檔案類型' });
      done++;
      continue;
    }
    const id = newId('a_');
    try {
      await putMedia(projectId, id, file);
      const probed = await probeMedia(file, kind);
      if (!probed.ok) {
        result.failed.push({ name: file.name, reason: probed.reason });
      } else {
        const asset: Asset = {
          id,
          name: file.name,
          mime: file.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
          size: file.size,
          ...probed.info,
        };
        result.assets.push(asset);
        result.clips.push(createClip(asset));
      }
    } catch (e) {
      result.failed.push({ name: file.name, reason: e instanceof Error ? e.message : '儲存失敗' });
    }
    done++;
  }
  onProgress?.(done, files.length);
  return result;
}
