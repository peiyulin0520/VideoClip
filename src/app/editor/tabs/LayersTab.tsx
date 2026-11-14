import { useEffect, useState } from 'react';
import type { Player } from '../../../engine/player';
import { ArrowDown, ArrowUp, Eye, EyeOff, Layers, Lock, Type } from 'lucide-react';
import { BLEND_LABELS } from '../../../engine/geometry';
import { timeResolved } from '../../../engine/keyframes';
import { findItem, isVideoItem, layersAt } from '../../../engine/timeline';
import { editItem, patchTrack, resetTransform, setTransform, shiftTrackLayer } from '../../../store/actions';
import { useProjectStore } from '../../../store/projectStore';
import { toast, useUI } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';
import { TransformControls } from '../TransformControls';
import { KeyframePanel } from './KeyframePanel';
import { BLENDS, COLORS } from './shared';

/**
 * 播放頭的時間（暫停＝每次移動都更新；播放中每 0.5 秒更新一次，免得整個面板一直重畫）。
 * 以前只在重畫時讀一次，播放頭移動後清單還是舊的那一秒（「這一秒沒有任何圖層」但其實有）。
 */
function usePlayerTime(player: Player | null): number {
  const [t, setT] = useState(player?.time ?? 0);
  useEffect(() => {
    if (!player) return;
    let last = 0;
    queueMicrotask(() => setT(player.time));
    return player.subscribe((time, playing) => {
      const now = performance.now();
      if (playing && now - last < 500) return;
      last = now;
      setT(time);
    });
  }, [player]);
  return t;
}

export function LayersTab() {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const t = usePlayerTime(player);
  // 目前這一秒有哪些圖層（最上層在最上面）
  const layers = layersAt(project, t, true).slice().reverse();
  // 有定格（關鍵影格）的物件：滑桿顯示播放頭這個時間的樣子
  const found = findItem(timeResolved(project, t), selectedId);
  const it = found && found.item.type !== 'audio' ? found.item : undefined;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>這一秒的圖層（上面的會蓋住下面的）</span>
      </div>
      <ul className="layer-list" data-testid="layer-list">
        {layers.map(({ item, track, trackIndex }) => {
          const asset = isVideoItem(item) ? project.assets.find((a) => a.id === item.assetId) : undefined;
          const label =
            item.type === 'text'
              ? item.card.runs[0]?.text === ''
                ? '圖形'
                : `文字：${item.card.runs[0]?.text.slice(0, 8) ?? ''}`
              : (asset?.name ?? '素材');
          return (
            <li
              key={item.id}
              className={`layer-row${item.id === selectedId ? ' selected' : ''}`}
              data-testid="layer-row"
              data-item-id={item.id}
            >
              <button className="layer-name" onClick={() => useProjectStore.getState().select(item.id)}>
                <span className="layer-ico">
                  {item.type === 'text' ? <Type size={16} /> : <Layers size={16} />}
                </span>
                <span className="layer-text">
                  {`${track.name} · `}
                  {label}
                </span>
              </button>
              <button
                className="icon-btn sm"
                aria-label={`${track.name} ${track.hidden ? '顯示' : '隱藏'}`}
                onClick={() => patchTrack(track.id, { hidden: !track.hidden })}
              >
                {track.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              <button
                className={`icon-btn sm${track.locked ? ' on' : ''}`}
                aria-label={`${track.name} ${track.locked ? '解鎖' : '鎖定'}`}
                onClick={() => patchTrack(track.id, { locked: !track.locked })}
              >
                <Lock size={18} />
              </button>
              <button
                className="icon-btn sm"
                aria-label={`${track.name} 往上一層`}
                onClick={() =>
                  project.tracks[trackIndex + 1]?.kind !== track.kind
                    ? toast('已經是這一類最上面的圖層（影像、特效、字卡不能互相穿插）')
                    : shiftTrackLayer(track.id, 1)
                }
              >
                <ArrowUp size={18} />
              </button>
              <button
                className="icon-btn sm"
                aria-label={`${track.name} 往下一層`}
                onClick={() =>
                  project.tracks[trackIndex - 1]?.kind !== track.kind
                    ? toast('已經是這一類最下面的圖層（影像、特效、字卡不能互相穿插）')
                    : shiftTrackLayer(track.id, -1)
                }
              >
                <ArrowDown size={18} />
              </button>
            </li>
          );
        })}
        {layers.length === 0 && <li className="hint">這一秒沒有任何圖層</li>}
      </ul>

      {it ? (
        <div className="props" data-testid="layer-props">
          <div className="panel-head">
            <span>選取的圖層</span>
          </div>
          <TransformControls item={it} />
          <KeyframePanel item={it} project={project} />
          {it.type === 'text' && <p className="hint">文字本身的透明度在「文字」分頁。</p>}
          <Slider
            label="整個圖層透明度"
            value={Math.round(it.transform.opacity * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={
              (v) => setTransform(it.id, { opacity: v / 100 }, `op:${it.id}`) // 版型＝整個版型一起變
            }
          />
          <div className="slider-label">混合模式</div>
          <div className="chips">
            {BLENDS.map((b) => (
              <button
                key={b}
                className={`chip${(it.blend ?? 'normal') === b ? ' active' : ''}`}
                onClick={() => editItem(it.id, (x) => void (x.blend = b))}
              >
                {BLEND_LABELS[b]}
              </button>
            ))}
          </div>
          <Slider
            label="圓角"
            value={Math.round((it.cornerRadius ?? 0) * 100)}
            min={0}
            max={50}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) =>
              editItem(it.id, (x) => void (x.cornerRadius = v / 100), { coalesce: `cr:${it.id}` })
            }
          />
          <Slider
            label="外框粗細"
            value={it.outline?.width ?? 0}
            min={0}
            max={40}
            step={1}
            format={(v) => `${v}`}
            onChange={(v) =>
              editItem(it.id, (x) => void (x.outline = { color: x.outline?.color ?? '#ffffff', width: v }), {
                coalesce: `ow:${it.id}`,
              })
            }
          />
          <div className="chips">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`swatch${it.outline?.color === c ? ' active' : ''}`}
                style={{ background: c }}
                aria-label={`外框顏色 ${c}`}
                onClick={() =>
                  editItem(it.id, (x) => void (x.outline = { width: x.outline?.width || 8, color: c }))
                }
              />
            ))}
          </div>
          <button className="btn" onClick={() => resetTransform(it.id)}>
            位置、大小、旋轉歸位
          </button>
        </div>
      ) : (
        <p className="hint">
          點一個圖層（或預覽畫面上的物件）後，可以調透明度、混合模式、圓角和外框。裁切在「剪輯」分頁。
        </p>
      )}
    </div>
  );
}
