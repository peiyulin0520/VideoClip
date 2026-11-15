import { hasKeyframes, keyframeNear } from '../../../engine/keyframes';
import type { Item, Project } from '../../../model/types';
import { PULSE_MAX, PULSE_MIN, PULSES } from '../../../engine/pulse';
import {
  clearKeyframes,
  deleteNearKeyframe,
  keyframeTarget,
  setKeyframePulse,
  setTransform,
} from '../../../store/actions';
import { toast } from '../../../store/uiStore';
import { useState } from 'react';
import { useUI } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';
import { usePlayheadTime } from '../usePlayheadTime';

/**
 * 定格細部調整：位置（X、Y，可以放到畫面外）。色調在「色調」分頁（有定格時也能漸變）。有定格時，這裡改的是「播放頭這個時間」的定格（沒有就自動新增一個），
 * 兩個定格之間線性漸變；沒有定格時改物件本身。item 是「這個時間」的樣子（已套用定格）。
 */
export function KeyframePanel({ item, project }: { item: Item; project: Project }) {
  const player = useUI((s) => s.player);
  const pps = useUI((s) => s.timelinePps);
  const time = usePlayheadTime(player, 4);
  // 試播時播放線會離開定格：這段時間繼續用試播的那個定格（面板不會閃掉）
  const [locked, setLocked] = useState<number | null>(null);
  const target = keyframeTarget(project, item.id);
  if (!target) return null;
  const nearIdx = locked ?? (hasKeyframes(target) ? keyframeNear(target, time - target.start, 8 / pps) : -1);
  const near = nearIdx >= 0;
  const pulse = near ? target.keyframes![nearIdx]!.pulse : undefined;
  // 從這個定格播一次小特效給你看，播完回到原本的位置
  const preview = (idx: number, at: number, dur: number) => {
    if (!player) return;
    const back = player.time;
    setLocked(idx);
    player.pause();
    player.seek(target.start + at);
    player.play();
    window.setTimeout(
      () => {
        player.pause();
        player.seek(back);
        setLocked(null);
      },
      (dur + 0.15) * 1000,
    );
  };
  const kfs = target.keyframes?.length ?? 0;
  const note = hasKeyframes(target)
    ? `（定格 ${kfs} 個）時間軸上播放線碰到的菱形（白色那個）就是選到的定格，這裡改的只有它；沒碰到就在播放線的時間新增一個`
    : '沒有定格時改的是物件本身';
  return (
    <div className="props kf-panel" data-testid="kf-panel">
      <div className="panel-head">
        <span>定格細部調整</span>
      </div>
      <p className="hint">{note}。按播放列的「◇ 定格」新增定格（離別的定格很近也可以新增）。</p>
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
      <div className="slider-label">這個定格的小特效（原地動一下，不是進場、離場或轉場）</div>
      {!near ? (
        <p className="hint" data-testid="pulse-hint">
          先讓時間軸的播放線碰到一個定格（菱形變白色），再選小特效。
        </p>
      ) : (
        <>
          <div className="chips" role="radiogroup" aria-label="定格小特效">
            <button
              role="radio"
              aria-checked={!pulse}
              className={`chip${!pulse ? ' active' : ''}`}
              data-testid="pulse-none"
              onClick={() => setKeyframePulse(item.id, null, undefined, nearIdx)}
            >
              無
            </button>
            {PULSES.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={pulse?.kind === p.id}
                aria-label={`小特效 ${p.name}`}
                className={`chip${pulse?.kind === p.id ? ' active' : ''}`}
                data-testid={`pulse-${p.id}`}
                onClick={() => {
                  const at = setKeyframePulse(item.id, { kind: p.id }, undefined, nearIdx);
                  if (at === null) return toast('先讓播放線碰到一個定格');
                  preview(nearIdx, at, pulse?.duration ?? 0.5);
                }}
              >
                {p.code} {p.name}
              </button>
            ))}
          </div>
          {pulse && (
            <>
              <Slider
                label="長度"
                value={Math.round(pulse.duration * 10)}
                min={Math.round(PULSE_MIN * 10)}
                max={PULSE_MAX * 10}
                step={1}
                format={(v) => `${(v / 10).toFixed(1)} 秒`}
                onChange={(v) =>
                  setKeyframePulse(item.id, { duration: v / 10 }, `pulse-d:${item.id}`, nearIdx)
                }
              />
              <Slider
                label="力道"
                value={Math.round(pulse.strength * 100)}
                min={5}
                max={100}
                step={1}
                format={(v) => `${v}%`}
                onChange={(v) =>
                  setKeyframePulse(item.id, { strength: v / 100 }, `pulse-s:${item.id}`, nearIdx)
                }
              />
            </>
          )}
        </>
      )}
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
          data-testid="kf-delete"
          disabled={!near}
          onClick={() => deleteNearKeyframe(item.id)}
        >
          刪除這個定格
        </button>
        <button
          className="chip"
          data-testid="kf-clear"
          disabled={kfs === 0}
          onClick={() => clearKeyframes(item.id)}
        >
          清除全部定格
        </button>
      </div>
    </div>
  );
}
