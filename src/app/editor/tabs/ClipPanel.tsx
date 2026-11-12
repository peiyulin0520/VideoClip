import { findItem, isVideoItem, setSpeedFree } from '../../../engine/timeline';
import { MAX_SPEED, MIN_SPEED } from '../../../model/defaults';
import type { VideoItem } from '../../../model/types';
import { editItem } from '../../../store/actions';
import { setTrackItems, useProjectStore } from '../../../store/projectStore';
import { toast } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';
import { TrimPanel } from '../TrimPanel';
import { SPEEDS, type Found, type Panel } from './shared';

/** 有面板要顯示嗎（選到的要是影片／照片／音樂） */
export function panelActive(panel: Panel, found: Found): boolean {
  return !!panel && !!found && isVideoItem(found.item);
}

/** 變速、音量（含淡入淡出）、修剪面板；剪輯分頁與音訊分頁共用。沒有開面板就回傳 null */
export function ClipPanel({
  panel,
  setPanel,
  found,
}: {
  panel: Panel;
  setPanel: (p: Panel) => void;
  found: Found;
}) {
  const project = useProjectStore((s) => s.project)!;
  const selected = found?.item;
  if (panel === 'trim' && selected && isVideoItem(selected) && found) {
    const asset = project.assets.find((a) => a.id === selected.assetId);
    if (asset)
      return <TrimPanel item={selected} asset={asset} track={found.track} onClose={() => setPanel(null)} />;
  }

  if (panel && selected && isVideoItem(selected)) {
    const asset = project.assets.find((a) => a.id === selected.assetId);
    const setVideo = (patch: Partial<VideoItem>, coalesce?: string) =>
      editItem(selected.id, (it) => void Object.assign(it, patch), coalesce ? { coalesce } : undefined);
    const applySpeed = (v: number, coalesce?: string) => {
      const f = findItem(project, selected.id)!;
      // 改速度時長度跟著變，但不能壓到同一軌後面的物件
      const next = setSpeedFree(f.track.items, selected.id, v);
      if (!next) return toast('後面有別的物件，這個速度會讓它們重疊');
      setTrackItems(f.track.id, next, coalesce ? { coalesce } : undefined);
    };
    return (
      <div className="panel" role="group" aria-label={panel === 'speed' ? '變速' : '音量'}>
        {panel === 'speed' ? (
          <>
            <div className="panel-head">
              <span>播放速度</span>
              <b data-testid="speed-value">{selected.speed}x</b>
            </div>
            <input
              type="range"
              aria-label="播放速度"
              min={Math.log2(MIN_SPEED)}
              max={Math.log2(MAX_SPEED)}
              step={0.01}
              value={Math.log2(selected.speed)}
              onChange={(e) =>
                applySpeed(Math.round(2 ** Number(e.target.value) * 100) / 100, `speed:${selected.id}`)
              }
            />
            <div className="chips">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`chip${selected.speed === s ? ' active' : ''}`}
                  onClick={() => applySpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="panel-head">
              <span>
                {selected.type === 'audio' ? '音樂音量' : '音量'}
                {asset && !asset.hasAudio ? '（這支影片沒有聲音）' : ''}
              </span>
              <b data-testid="volume-value">{Math.round(selected.volume * 100)}%</b>
            </div>
            {found?.track.muted && (
              <p className="hint warn">這條軌道目前是靜音的（點時間軸左邊的圖示可以取消靜音）。</p>
            )}
            <input
              type="range"
              aria-label="音量"
              min={0}
              max={2}
              step={0.01}
              value={selected.volume}
              onChange={(e) => setVideo({ volume: Number(e.target.value) }, `vol:${selected.id}`)}
            />
            <div className="chips">
              {[0, 0.5, 1, 1.5, 2].map((v) => (
                <button
                  key={v}
                  className={`chip${selected.volume === v ? ' active' : ''}`}
                  aria-label={v === 0 ? '關閉聲音' : `音量 ${v * 100}%`}
                  onClick={() => setVideo({ volume: v })}
                >
                  {v === 0 ? '關閉聲音' : `${v * 100}%`}
                </button>
              ))}
            </div>
            <Slider
              label="淡入"
              value={selected.fadeIn ?? 0}
              min={0}
              max={Math.max(Math.min(5, Math.round((selected.duration / 2) * 10) / 10), 0.1)}
              step={0.1}
              format={(v) => `${v.toFixed(1)} 秒`}
              onChange={(v) => setVideo({ fadeIn: v }, `fi:${selected.id}`)}
            />
            <Slider
              label="淡出"
              value={selected.fadeOut ?? 0}
              min={0}
              max={Math.max(Math.min(5, Math.round((selected.duration / 2) * 10) / 10), 0.1)}
              step={0.1}
              format={(v) => `${v.toFixed(1)} 秒`}
              onChange={(v) => setVideo({ fadeOut: v }, `fo:${selected.id}`)}
            />
          </>
        )}
        <button className="btn primary done" onClick={() => setPanel(null)}>
          完成
        </button>
      </div>
    );
  }
  return null;
}
