import { ensureUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import { enqueueThumbs } from '../../engine/thumbs';
import { importIntoCell } from '../../store/actions';
import { toast, useUI } from '../../store/uiStore';

/** 從相簿選的檔案放進版型的某一格（第一個照片／影片）；時間軸的「＋ 匯入」和「這一格」視窗共用 */
export async function importFilesIntoCell(
  projectId: string,
  trackId: string,
  files: File[],
): Promise<boolean> {
  if (!files.length) return false;
  const { setBusy } = useUI.getState();
  setBusy('匯入中…');
  try {
    const res = await importFiles(projectId, files);
    if (res.failed.length)
      toast(`無法匯入：${res.failed.map((f) => `${f.name}（${f.reason}）`).join('、')}`, 7000);
    const a = res.assets.find((x) => x.kind !== 'audio');
    if (!a) {
      if (!res.failed.length) toast('這個檔案放不進來');
      return false;
    }
    await ensureUrls(projectId, [a]);
    enqueueThumbs(projectId, [a]); // 影片：背景補滿時間軸縮圖
    return !!importIntoCell(trackId, a);
  } finally {
    setBusy(null);
  }
}
