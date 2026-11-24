import { Diamond } from 'lucide-react';
import { useEffect, useState } from 'react';
import { keyframeIndexAt } from '../../engine/keyframes';
import { keyframeTarget, toggleKeyframe } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { ToolButton } from './tabs/shared';

/**
 * 剪輯工具列的「關鍵格」按鈕（◇）：選到素材時才亮。播放頭這個時間沒有關鍵格 → 新增（值＝目前畫面上的樣子）；
 * 有 → 變成實心（◆），按了刪除這個關鍵格。版型裡的任何物件＝整個版型（外框）。
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
    <ToolButton
      icon={Diamond}
      label="關鍵格"
      ariaLabel={has ? '刪除這個時間的關鍵格' : '在這個時間新增關鍵格'}
      testId="kf-btn"
      active={has}
      fill={has}
      dim={!target}
      onClick={() => {
        if (!selectedId || !target) return toast('先點一個影片、照片、貼圖或文字');
        player?.pause();
        const r = toggleKeyframe(selectedId);
        if (r === 'added')
          toast('已新增關鍵格。換個時間再拖或縮放會自動多一個；播放線碰到菱形時，只會改那一個', 3500);
      }}
    />
  );
}
