import { Copy, MoveHorizontal, Scissors, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useRef } from 'react';
import { ensureUrls } from '../../../engine/assetUrls';
import { importFiles } from '../../../engine/importMedia';
import { isVideoItem, totalDuration } from '../../../engine/timeline';
import {
  addMusic,
  duplicateAny,
  editItem,
  removeAnyItem,
  separateAudio,
  setAllVideoMuted,
  splitAny,
  videoTracksMuted,
} from '../../../store/actions';
import { useProjectStore } from '../../../store/projectStore';
import { toast, useUI } from '../../../store/uiStore';
import { itemTitle, ordinalIn, thumbOf } from '../../../engine/labels';
import { formatTime } from '../../../engine/timeline';
import { Slider } from '../../../ui/Slider';
import { ClipPanel, panelActive } from './ClipPanel';
import { ToolButton, type Found, type Panel } from './shared';
import type { VideoItem } from '../../../model/types';

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
  // 專案裡所有聲音來源：背景音樂、有聲音的影片（影片原音）
  const entries = project.tracks.flatMap((track) =>
    track.items.flatMap((item) => {
      if (item.type === 'text' || item.type === 'image') return [];
      const asset = project.assets.find((a) => a.id === item.assetId);
      return asset?.hasAudio ? [{ item, asset, track }] : [];
    }),
  );
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
          <span>專案裡的聲音（{entries.length}）</span>
        </div>
        {entries.length === 0 && <p className="hint">目前沒有聲音：可以加背景音樂，或加入有聲音的影片。</p>}
        <ul className="audio-list" data-testid="audio-list">
          {entries.map(({ item, asset, track }) => (
            <li key={item.id} className={`audio-row${item.id === found?.item.id ? ' selected' : ''}`}>
              <button
                className="audio-name"
                data-testid="audio-row"
                data-item-id={item.id}
                onClick={() => {
                  useProjectStore.getState().select(item.id);
                  player?.seek(item.start);
                }}
              >
                {thumbOf(item, asset) ? (
                  <span
                    className="audio-thumb"
                    data-testid="audio-thumb"
                    style={{ backgroundImage: `url(${thumbOf(item, asset)})` }}
                  >
                    {item.type === 'audio' && <b>♪</b>}
                  </span>
                ) : (
                  <span className="audio-ico">{item.type === 'audio' ? '♪' : '🎬'}</span>
                )}
                <span className="audio-text">
                  {item.type === 'video' ? `${ordinalIn(track.items, item.id)} ` : ''}
                  {itemTitle(item, asset)}
                  <small>
                    {formatTime(item.start)}–{formatTime(item.start + item.duration)}
                    {track.muted ? ' · 這條軌道靜音' : ''}
                  </small>
                </span>
              </button>
              <button
                role="switch"
                aria-checked={item.volume > 0}
                aria-label={`保留聲音 ${itemTitle(item, asset)}`}
                className={`chip sm${item.volume > 0 ? ' active' : ''}`}
                onClick={() =>
                  editItem(item.id, (x) => void ((x as VideoItem).volume = item.volume > 0 ? 0 : 1))
                }
              >
                {item.volume > 0 ? '保留' : '關閉'}
              </button>
              {item.type === 'audio' && (
                <button
                  className="chip sm"
                  data-testid="audio-trim"
                  aria-label={`修剪 ${itemTitle(item, asset)}`}
                  onClick={() => {
                    useProjectStore.getState().select(item.id);
                    player?.seek(item.start);
                    setPanel('trim');
                  }}
                >
                  修剪
                </button>
              )}
              {item.type === 'video' && (
                <button
                  className="chip sm"
                  aria-label={`分離原音 ${itemTitle(item, asset)}`}
                  onClick={() => {
                    const id = separateAudio(item.id);
                    toast(id ? '原音已分離成一段音樂軌，影片本身靜音了' : '這支影片沒有聲音');
                  }}
                >
                  分離原音
                </button>
              )}
              {item.volume > 0 && (
                <div className="audio-vol">
                  <Slider
                    label="音量"
                    value={Math.round(item.volume * 100)}
                    min={0}
                    max={200}
                    step={5}
                    format={(v) => `${v}%`}
                    onChange={(v) =>
                      editItem(item.id, (x) => void ((x as VideoItem).volume = v / 100), {
                        coalesce: `vol:${item.id}`,
                      })
                    }
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
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
