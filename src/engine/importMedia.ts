import { createClip, newId } from '../model/defaults';
import type { Asset, VideoItem } from '../model/types';
import { putMedia, storageEstimate, type Stored } from '../storage/media';
import { mediaKindOf, probeMedia } from './probe';

export type ImportResult = {
  assets: Asset[];
  clips: VideoItem[];
  failed: { name: string; reason: string }[];
  /** 匯入成功但有提醒（例如只放在記憶體） */
  warnings: string[];
};

/** 除錯用：最近一次匯入遇到的原始錯誤（window.__videoclip.lastImportErrors） */
export const lastImportErrors: { name: string; step: string; error: string }[] = [];

export function mb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

/** 把瀏覽器丟出來的英文錯誤換成看得懂的原因 */
export function describeError(e: unknown): string {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  const msg = e instanceof Error ? e.message : String(e);
  if (name === 'QuotaExceededError' || /quota|storage.*full/i.test(msg)) return '手機儲存空間不足';
  if (name === 'UnknownError' || /out of memory|transient/i.test(msg)) return '記憶體不足';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '瀏覽器不允許寫入（無痕模式？）';
  return msg || name || '不明原因';
}

/** 匯入檔案：存進本機 → 讀資訊與縮圖 → 產生素材與主軌片段。依選擇順序。每一步失敗都會說明是哪一步。 */
export async function importFiles(
  projectId: string,
  files: File[],
  onProgress?: (done: number, total: number, detail?: string) => void,
): Promise<ImportResult> {
  const result: ImportResult = { assets: [], clips: [], failed: [], warnings: [] };
  lastImportErrors.length = 0;
  let done = 0;
  const fail = (file: File, step: string, e: unknown) => {
    console.warn(`[import] ${file.name} ${step}`, e);
    lastImportErrors.push({
      name: file.name,
      step,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
    result.failed.push({ name: file.name, reason: `${step}失敗（${mb(file.size)}）：${describeError(e)}` });
  };
  for (const file of files) {
    onProgress?.(done, files.length);
    const kind = mediaKindOf(file);
    if (!kind) {
      result.failed.push({ name: file.name, reason: '不支援的檔案類型' });
      done++;
      continue;
    }
    const id = newId('a_');

    // 1. 存到手機。先看剩餘空間，已知不夠就不要試了（直接放記憶體）
    let stored: Stored;
    try {
      const est = await storageEstimate();
      const persistent = !(est && est.quota > 0 && est.quota - est.usage < file.size * 1.2);
      stored = await putMedia(projectId, id, file, {
        persistent,
        onProgress: (f) => onProgress?.(done, files.length, `存檔 ${Math.round(f * 100)}%`),
        onFallback: (from, e) => {
          console.warn(`[import] ${file.name} 存到 ${from} 失敗，改用下一個地方`, e);
          lastImportErrors.push({
            name: file.name,
            step: `存到${from}`,
            error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
          });
        },
      });
    } catch (e) {
      fail(file, '存到手機', e);
      done++;
      continue;
    }

    // 2. 讀影片資訊（長度、尺寸）與縮圖。縮圖失敗不算失敗（probeMedia 內部已處理）
    try {
      const probed = await probeMedia(file, kind);
      if (!probed.ok) {
        result.failed.push({ name: file.name, reason: probed.reason });
      } else {
        const asset: Asset = {
          id,
          name: file.name,
          mime:
            file.type || (kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/jpeg'),
          size: file.size,
          ...probed.info,
          ...(stored === 'memory' ? { unsaved: true } : {}),
        };
        result.assets.push(asset);
        if (kind !== 'audio') result.clips.push(createClip(asset)); // 音樂不是主軌片段，呼叫端自己放到音樂軌
        if (stored === 'memory')
          result.warnings.push(
            `${file.name}（${mb(file.size)}）沒辦法存在手機裡，可以先剪輯，但關掉網頁後要重新匯入`,
          );
      }
    } catch (e) {
      fail(file, '讀取影片資訊', e);
    }
    done++;
  }
  onProgress?.(done, files.length);
  return result;
}
