import { useEffect, useState } from 'react';
import { keyframeNear } from '../../engine/keyframes';
import { pulseCode } from '../../engine/pulse';
import type { Item, Keyframe } from '../../model/types';
import { useProjectStore } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';

/**
 * 時間軸片段上的定格小菱形。沒選到＝橘色；播放線碰到它（而且這個素材是選取中的）＝白底、橘邊、稍大。
 * 播放中不顯示「選到」（一直閃很亂）。有調色（色調組合或手動調整）的定格，菱形中間多一個小點。
 */
export function KeyframeDot({
  item,
  index,
  k,
  left,
  active,
  pps,
}: {
  item: Item;
  index: number;
  k: Keyframe;
  left: number;
  /** 這個素材（或它所屬版型的外框）是目前選取的 */
  active: boolean;
  pps: number;
}) {
  const player = useUI((s) => s.player);
  const [here, setHere] = useState(false);
  useEffect(() => {
    if (!player || !active) {
      queueMicrotask(() => setHere(false));
      return;
    }
    const check = (t: number, playing?: boolean) => {
      setHere(!playing && keyframeNear(item, t - item.start, 8 / pps) === index);
    };
    queueMicrotask(() => check(player.time, false));
    return player.subscribe(check);
  }, [player, active, item, index, pps]);
  const graded = !!k.look || (!!k.adjust && Object.values(k.adjust).some(Boolean));
  return (
    <>
      {k.pulse && (
        <span
          className={`kf-pulse${here ? ' here' : ''}`}
          data-testid="kf-pulse"
          aria-hidden="true"
          style={{ left }}
        >
          {pulseCode(k.pulse.kind)}
        </span>
      )}
      <button
        className={`kf-dot${here ? ' here' : ''}${graded ? ' graded' : ''}`}
        data-testid="kf-dot"
        data-item-id={item.id}
        data-here={here ? '1' : '0'}
        aria-label={`定格 ${(item.start + k.t).toFixed(1)} 秒`}
        style={{ left, bottom: 3 }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          useProjectStore.getState().select(item.id);
          player?.seek(item.start + k.t);
        }}
      />
    </>
  );
}
