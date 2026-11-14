import { fullAdjust, hasKeyframes } from '../../../engine/keyframes';
import type { Adjust, Item, Project } from '../../../model/types';
import { clearKeyframes, keyframeTarget, setAdjust, setTransform } from '../../../store/actions';
import { Slider } from '../../../ui/Slider';

const TONES: { key: keyof Adjust; label: string }[] = [
  { key: 'brightness', label: '亮度' },
  { key: 'saturation', label: '飽和度' },
  { key: 'temperature', label: '色溫' },
  { key: 'tint', label: '色調' },
];

/**
 * 定位細部調整：位置（X、Y，可以放到畫面外）與色調。有定位時，這裡改的是「播放頭這個時間」的定位（沒有就自動新增一個），
 * 兩個定位之間線性漸變；沒有定位時改物件本身。item 是「這個時間」的樣子（已套用定位）。
 */
export function KeyframePanel({ item, project }: { item: Item; project: Project }) {
  const target = keyframeTarget(project, item.id);
  if (!target) return null;
  const kfs = target.keyframes?.length ?? 0;
  const adj = fullAdjust(item.adjust);
  const note = hasKeyframes(target)
    ? `（定位 ${kfs} 個）改的是播放頭這個時間的定位`
    : '沒有定位時改的是物件本身';
  return (
    <div className="props kf-panel" data-testid="kf-panel">
      <div className="panel-head">
        <span>定位細部調整</span>
      </div>
      <p className="hint">{note}。按播放列的「◇ 定位」新增定位，換時間再拖或調，就會自動多一個。</p>
      <Slider
        label="X 位置"
        value={Math.round(item.transform.x * 100)}
        min={-50}
        max={150}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => setTransform(item.id, { x: v / 100 }, `x:${item.id}`)}
      />
      <Slider
        label="Y 位置"
        value={Math.round(item.transform.y * 100)}
        min={-50}
        max={150}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => setTransform(item.id, { y: v / 100 }, `y:${item.id}`)}
      />
      <div className="slider-label">色調</div>
      {TONES.map((t) => (
        <Slider
          key={t.key}
          label={t.label}
          value={Math.round(adj[t.key] * 100)}
          min={-100}
          max={100}
          step={1}
          format={(v) => `${v}`}
          onChange={(v) => setAdjust(item.id, { [t.key]: v / 100 }, `adj-${t.key}:${item.id}`)}
        />
      ))}
      <div className="chips">
        <button
          className="chip"
          aria-label="色調歸零"
          onClick={() =>
            setAdjust(item.id, { brightness: 0, saturation: 0, temperature: 0, tint: 0 }, `adj0:${item.id}`)
          }
        >
          色調歸零
        </button>
        <button
          className="chip"
          data-testid="kf-clear"
          disabled={kfs === 0}
          onClick={() => clearKeyframes(item.id)}
        >
          清除全部定位
        </button>
      </div>
    </div>
  );
}
