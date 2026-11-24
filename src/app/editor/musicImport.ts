import { ensureUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import { totalDuration } from '../../engine/timeline';
import { addMusic } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';

/** 背景音樂：從「檔案」選 mp3／m4a／wav…，放在播放頭這一秒的音樂軌 */
export async function importMusicFiles(files: File[]): Promise<void> {
  if (!files.length) return;
  const st = useProjectStore.getState();
  const pid = st.project?.id;
  if (!pid) return;
  if (totalDuration(st.project!) <= 0) return toast('先匯入影片或照片，再加背景音樂');
  const { setBusy, player } = useUI.getState();
  setBusy('匯入音樂中…');
  try {
    const res = await importFiles(pid, files);
    if (res.assets.length) {
      await ensureUrls(pid, res.assets);
      addMusic(res.assets, player?.time ?? 0);
      toast(`已加入背景音樂：${res.assets.map((a) => a.name).join('、')}`);
    }
    if (res.failed.length)
      toast(`無法匯入：${res.failed.map((f) => `${f.name}（${f.reason}）`).join('、')}`, 8000);
  } finally {
    setBusy(null);
  }
}
