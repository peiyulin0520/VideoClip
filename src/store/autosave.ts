import { saveProject } from '../storage/projects';
import { useProjectStore } from './projectStore';

const DELAY_MS = 800;

/** 內容變更後 800ms 寫入 IndexedDB；離開頁面/切到背景時立刻寫。回傳停止函式（會先存一次）。 */
export function startAutosave(): { flush: () => Promise<void>; stop: () => Promise<void> } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let savedRevision = useProjectStore.getState().revision;
  let inflight: Promise<void> = Promise.resolve();

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const { project, revision } = useProjectStore.getState();
    if (!project || revision === savedRevision) return inflight;
    savedRevision = revision;
    // 立刻送進儲存佇列（同步），讀取會等它完成
    inflight = saveProject(project).catch((e) => console.error('自動儲存失敗', e));
    return inflight;
  };

  const unsub = useProjectStore.subscribe((s, prev) => {
    if (s.revision === prev.revision) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), DELAY_MS);
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);

  return {
    flush,
    stop: async () => {
      unsub();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      await flush();
    },
  };
}
