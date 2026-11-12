import { Copy, MoveHorizontal, Scissors, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useRef } from 'react';
import { ensureUrls } from '../../../engine/assetUrls';
import { importFiles } from '../../../engine/importMedia';
import { isVideoItem, totalDuration } from '../../../engine/timeline';
import {
  addMusic,
  duplicateAny,
  removeAnyItem,
  setAllVideoMuted,
  splitAny,
  videoTracksMuted,
} from '../../../store/actions';
import { useProjectStore } from '../../../store/projectStore';
import { toast, useUI } from '../../../store/uiStore';
import { ClipPanel, panelActive } from './ClipPanel';
import { ToolButton, type Found, type Panel } from './shared';

/** 背景音樂：從「檔案」選 mp3／m4a／wav…，放在播放頭這一秒的音樂軌 */
function MusicImport() {
  const input = useRef<HTMLInputElement>(null);
  const onFiles = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (input.current) input.current.value = '';
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
  };
  return (
    <>
      <div className="panel-head">
        <span>背景音樂</span>
      </div>
      <button className="btn done" onClick={() => input.current?.click()}>
        ＋ 加入背景音樂（從「檔案」選 mp3、m4a、wav…）
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.caf"
        multiple
        hidden
        data-testid="music-input"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <p className="hint music-note">
        音樂會放在目前這一秒，最長到影片結束。點時間軸上的音樂可以分割、修剪、調音量和淡入淡出。發 Reels
        時，也可以先匯出，再在 Instagram 裡加熱門音樂（比較不會有版權問題）。
      </p>
    </>
  );
}

/** 音訊分頁：背景音樂、全部影片靜音；選到音樂時多出分割、刪除、複製、修剪、聲音 */
export function AudioTab({
  found,
  panel,
  setPanel,
}: {
  found: Found;
  panel: Panel;
  setPanel: (p: Panel) => void;
}) {
  const project = useProjectStore((s) => s.project)!;
  const player = useUI((s) => s.player);
  const selected = found?.item.type === 'audio' && isVideoItem(found.item) ? found.item : null;
  if (selected && panelActive(panel, found))
    return <ClipPanel panel={panel} setPanel={setPanel} found={found} />;
  const allMuted = videoTracksMuted(project);
  return (
    <>
      {selected && (
        <div className="toolbar" role="toolbar" aria-label="音樂工具">
          <ToolButton
            icon={Scissors}
            label="分割"
            onClick={() => {
              if (player && !splitAny(selected.id, player.time))
                toast('播放頭要在片段中間才能分割（離邊緣至少 0.2 秒）');
            }}
          />
          <ToolButton
            icon={Trash2}
            label="刪除"
            onClick={() => {
              removeAnyItem(selected.id);
              setPanel(null);
            }}
          />
          <ToolButton icon={Copy} label="複製" onClick={() => duplicateAny(selected.id)} />
          <ToolButton icon={MoveHorizontal} label="修剪" onClick={() => setPanel('trim')} />
          <ToolButton icon={Volume2} label="音量" onClick={() => setPanel('volume')} />
        </div>
      )}
      <div className="panel">
        <MusicImport />
        <div className="panel-head">
          <span>影片原本的聲音</span>
        </div>
        <button
          className={`btn done${allMuted ? ' primary' : ''}`}
          aria-pressed={allMuted}
          onClick={() => {
            setAllVideoMuted(!allMuted);
            toast(allMuted ? '影片的聲音恢復了' : '所有影片都靜音了（背景音樂不受影響）');
          }}
        >
          {allMuted ? <Volume2 size={18} /> : <VolumeX size={18} />}{' '}
          {allMuted ? '恢復影片聲音' : '全部影片靜音'}
        </button>
      </div>
    </>
  );
}
