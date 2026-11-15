import { itemTitle } from '../../../engine/labels';
import { useEffect, useState } from 'react';
import type { Player } from '../../../engine/player';
import { ArrowDown, ArrowUp, Eye, EyeOff, Layers, Lock, MoreHorizontal, Type } from 'lucide-react';
import { BLEND_LABELS } from '../../../engine/geometry';
import { timeResolved } from '../../../engine/keyframes';
import { frameOfGroup, isFrameItem } from '../../../engine/layoutTracks';
import { findItem, isVideoItem, layersAt, trackUnits } from '../../../engine/timeline';
import type { TrackKind } from '../../../model/types';
import {
  editItem,
  patchTrack,
  resetTransform,
  setTransform,
  moveTrackPast,
  moveTrackToEdge,
} from '../../../store/actions';
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

const KIND_TAG: Record<TrackKind, string> = { media: '影像', sticker: '貼圖', text: '字卡', audio: '音訊' };

export function LayersTab() {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const t = usePlayerTime(player);
  // 目前這一秒有哪些圖層（最上層在最上面）
  const layers = layersAt(project, t, true).slice().reverse();
  const units = trackUnits(project.tracks);
  // 有定格（關鍵影格）的物件：滑桿顯示播放頭這個時間的樣子
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const found = findItem(timeResolved(project, t), selectedId);
  const it = found && found.item.type !== 'audio' ? found.item : undefined;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>這一秒的圖層（上面的會蓋住下面的）</span>
      </div>
      <ul className="layer-list" data-testid="layer-list">
        {layers.map(({ item, track }, idx) => {
          const asset = isVideoItem(item) ? project.assets.find((a) => a.id === item.assetId) : undefined;
          const label = itemTitle(item, asset);
          const sub = !!track.groupRole;
          const gName = track.group ? (frameOfGroup(project.tracks, track.group)?.item.label ?? '版型') : '';
          const isFrame = isFrameItem(item as never) && !track.groupRole;
          // ▲▼：跟「這一秒」上面／下面最近的、不屬於同一塊的圖層換（旁邊的軌道這一秒可能沒東西，按了會看不出變化）
          const unitOf = (i: number) => units.findIndex((u) => u.lo <= i && i <= u.hi);
          const myUnit = unitOf(project.tracks.indexOf(track));
          const neighbour = (dir: -1 | 1) => {
            for (let j = idx + dir; j >= 0 && j < layers.length; j += dir) {
              const o = layers[j]!.track;
              if (track.groupRole === 'member') {
                if (o.groupRole === 'member' && o.group === track.group) return o;
              } else if (unitOf(project.tracks.indexOf(o)) !== myUnit) return o;
            }
            return null;
          };
          const move = (dir: -1 | 1) => {
            const o = neighbour(dir);
            if (!o || !moveTrackPast(track.id, o.id, dir === -1))
              toast(
                track.groupRole === 'member'
                  ? `已經是版型裡最${dir === -1 ? '上' : '下'}面的圖層`
                  : `已經是最${dir === -1 ? '上' : '下'}面的圖層`,
              );
          };
          return (
            <li
              key={item.id}
              className={`layer-row${item.id === selectedId ? ' selected' : ''}${sub ? ' sub' : ''}`}
              data-testid="layer-row"
              data-item-id={item.id}
              data-kind={track.kind}
              data-layer-no={layers.length - idx}
            >
              <button className="layer-name" onClick={() => useProjectStore.getState().select(item.id)}>
                <span className="layer-ico">
                  {item.type === 'text' ? <Type size={16} /> : <Layers size={16} />}
                </span>
                <span className="layer-main">
                  <span className="layer-text">
                    {`${track.name} · `}
                    {label}
                  </span>
                  <span className="layer-meta">
                    <span className={`layer-kind k-${track.kind}`}>{KIND_TAG[track.kind]}</span>
                    <span data-testid="layer-no">第 {layers.length - idx} 層</span>
                    {sub && <span>版型 · {gName}</span>}
                    {isFrame && <span>整個版型</span>}
                  </span>
                </span>
              </button>
              <div className="layer-btns">
                <div className="btn-zone">
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
                </div>
                {track.groupRole !== 'cell' && (
                  <>
                    <span className="zone-sep" aria-hidden="true" />
                    <div className="btn-zone">
                      <button
                        className="icon-btn sm"
                        aria-label={`${track.name} 往上一層`}
                        onClick={() => move(-1)}
                      >
                        <ArrowUp size={18} />
                      </button>
                      <button
                        className="icon-btn sm"
                        aria-label={`${track.name} 往下一層`}
                        onClick={() => move(1)}
                      >
                        <ArrowDown size={18} />
                      </button>
                      <button
                        className="icon-btn sm"
                        aria-label={`${track.name} 更多排序`}
                        aria-expanded={moreFor === track.id}
                        onClick={() => setMoreFor(moreFor === track.id ? null : track.id)}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              {moreFor === track.id && (
                <div className="layer-more" data-testid="layer-more">
                  <button
                    className="chip"
                    aria-label={`${track.name} 移到最上層`}
                    onClick={() => {
                      if (!moveTrackToEdge(track.id, 'top')) toast('已經是最上面的圖層');
                      setMoreFor(null);
                    }}
                  >
                    移到最上層
                  </button>
                  <button
                    className="chip"
                    aria-label={`${track.name} 移到最下層`}
                    onClick={() => {
                      if (!moveTrackToEdge(track.id, 'bottom')) toast('已經是最下面的圖層');
                      setMoreFor(null);
                    }}
                  >
                    移到最下層
                  </button>
                </div>
              )}
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
