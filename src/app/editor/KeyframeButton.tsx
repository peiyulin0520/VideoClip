import { Diamond } from 'lucide-react';
import { useEffect, useState } from 'react';
import { keyframeIndexAt } from '../../engine/keyframes';
import { keyframeTarget, toggleKeyframe } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { PlaybarButton } from './PlaybarButton';

/**
 * 播放列的「定位」按鈕（◇）：選到素材時才亮。播放頭這個時間沒有定位 → 新增（值＝目前畫面上的樣子）；
 * 有 → 變成實心（◆），按了刪除這個定位。版型裡的任何物件＝整個版型（外框）。
 */
export function KeyframeButton() {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!player) return;
    let last = 0;
    queueMicrotask(() => setTime(player.time));
    return player.subscribe((t, playing) => {
      const now = performance.now();
      if (playing && now - last < 150) return;
      last = now;
      setTime(t);
    });
  }, [player]);
  const target = keyframeTarget(project, selectedId);
  const has = !!target && keyframeIndexAt(target, time - target.start) >= 0;
  return (
    <PlaybarButton
      icon={Diamond}
      label="定位"
      ariaLabel={has ? '刪除這個時間的定位' : '在這個時間新增定位'}
      testId="kf-btn"
      on={has}
      fill={has}
      disabled={!target}
      onClick={() => {
        if (!selectedId) return;
        player?.pause();
        const r = toggleKeyframe(selectedId);
        if (r === 'added') toast('已新增定位。換個時間再拖或縮放，就會自動多一個定位', 3500);
      }}
    />
  );
}
