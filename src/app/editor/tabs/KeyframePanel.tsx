import { hasKeyframes } from '../../../engine/keyframes';
import type { Item, Project } from '../../../model/types';
import { clearKeyframes, keyframeTarget, setTransform } from '../../../store/actions';
import { useUI } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';

/**
 * 定位細部調整：位置（X、Y，可以放到畫面外）。色調在「色調」分頁（有定位時也能漸變）。有定位時，這裡改的是「播放頭這個時間」的定位（沒有就自動新增一個），
 * 兩個定位之間線性漸變；沒有定位時改物件本身。item 是「這個時間」的樣子（已套用定位）。
 */
export function KeyframePanel({ item, project }: { item: Item; project: Project }) {
  const target = keyframeTarget(project, item.id);
  if (!target) return null;
  const kfs = target.keyframes?.length ?? 0;
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
      <div className="chips">
        <button
          className="chip"
          data-testid="kf-to-color"
          onClick={() => useUI.setState({ requestTab: 'color' })}
        >
          色調：到「色調」分頁
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
