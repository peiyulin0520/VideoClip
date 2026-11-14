import { useEffect, useState } from 'react';
import type { Player } from '../../engine/player';

/**
 * 播放頭的時間（給面板用）：暫停時每次變動都更新；播放中最多每 1000/maxHz 毫秒更新一次，
 * 避免面板跟著每一格重畫、拖慢預覽。
 */
export function usePlayheadTime(player: Player | null, maxHz = 2): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!player) return;
    let last = 0;
    queueMicrotask(() => setTime(player.time));
    return player.subscribe((t, playing) => {
      if (playing) {
        const now = performance.now();
        if (now - last < 1000 / maxHz) return;
        last = now;
      }
      setTime(t);
    });
  }, [player, maxHz]);
  return time;
}
