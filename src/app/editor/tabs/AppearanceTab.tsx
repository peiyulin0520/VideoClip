import { BLEND_LABELS } from '../../../engine/geometry';
import { timeResolved } from '../../../engine/keyframes';
import { isFrameItem } from '../../../engine/layoutTracks';
import { findItem } from '../../../engine/timeline';
import { editItem, resetTransform, setTransform } from '../../../store/actions';
import { useProjectStore } from '../../../store/projectStore';
import { useUI } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';
import { TransformControls } from '../TransformControls';
import { usePlayheadTime } from '../usePlayheadTime';
import { KeyframePanel } from './KeyframePanel';
import { BLENDS, COLORS } from './shared';

/** 剪輯工具列的〔外觀〕：大小、旋轉、置中、轉正；整個圖層透明度、混合模式、圓角、外框；有關鍵格時接著是關鍵格細部調整 */
export function AppearanceTab() {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const t = usePlayheadTime(player, 2);
  // 有關鍵格的物件：滑桿顯示播放頭這個時間的樣子
  const found = findItem(timeResolved(project, t), selectedId);
  const it = found && found.item.type !== 'audio' ? found.item : undefined;
  if (!it)
    return (
      <div className="panel">
        <p className="hint">先點選一個素材</p>
      </div>
    );
  return (
    <div className="props" data-testid="layer-props">
      <TransformControls item={it} />
      <KeyframePanel item={it} project={project} />
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
      {!isFrameItem(it) && (
        <>
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
        </>
      )}
      <button className="btn" onClick={() => resetTransform(it.id)}>
        位置、大小、旋轉歸位
      </button>
    </div>
  );
}
