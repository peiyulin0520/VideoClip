import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, EyeOff, Layers, Lock, Type } from 'lucide-react';
import { BLEND_LABELS } from '../../../engine/geometry';
import { findItem, isVideoItem, layersAt, mainItems, moveItem } from '../../../engine/timeline';
import { editItem, patchTrack, shiftTrackLayer } from '../../../store/actions';
import { setMainItems, useProjectStore } from '../../../store/projectStore';
import { toast, useUI } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';
import { TransformControls } from '../TransformControls';
import { BLENDS, COLORS } from './shared';

export function LayersTab() {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const t = player?.time ?? 0;
  // 目前這一秒有哪些圖層（最上層在最上面）
  const layers = layersAt(project, t, true).slice().reverse();
  const found = findItem(project, selectedId);
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
          const isMain = track.kind === 'main';
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
                  {isMain ? '主軌 · ' : `${track.name} · `}
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
                  isMain || trackIndex >= project.tracks.length - 1
                    ? toast(isMain ? '主軌固定在最底層' : '已經在最上層')
                    : shiftTrackLayer(track.id, 1)
                }
              >
                <ArrowUp size={18} />
              </button>
              <button
                className="icon-btn sm"
                aria-label={`${track.name} 往下一層`}
                onClick={() =>
                  isMain || trackIndex <= 1
                    ? toast(isMain ? '主軌固定在最底層' : '不能放到主軌下面')
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
          <Slider
            label="透明度"
            value={Math.round(it.transform.opacity * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) =>
              editItem(it.id, (x) => void (x.transform.opacity = v / 100), { coalesce: `op:${it.id}` })
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
          {found?.track.kind === 'main' && isVideoItem(it) && (
            <div className="chips" role="group" aria-label="主軌順序">
              <button
                className="btn"
                aria-label="前移"
                onClick={() => {
                  const items = mainItems(project);
                  const idx = found.index;
                  if (idx <= 0) return toast('已經是第一個');
                  setMainItems(moveItem(items, it.id, idx - 1));
                }}
              >
                <ArrowLeft size={16} /> 前移
              </button>
              <button
                className="btn"
                aria-label="後移"
                onClick={() => {
                  const items = mainItems(project);
                  const idx = found.index;
                  if (idx >= items.length - 1) return toast('已經是最後一個');
                  setMainItems(moveItem(items, it.id, idx + 1));
                }}
              >
                後移 <ArrowRight size={16} />
              </button>
            </div>
          )}
          <button
            className="btn"
            onClick={() =>
              editItem(it.id, (x) => {
                x.transform.x = 0.5;
                x.transform.y = 0.5;
                x.transform.scale = x.type === 'text' || found?.track.kind === 'main' ? 1 : 0.5;
                x.transform.rotation = 0;
              })
            }
          >
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
