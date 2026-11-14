import { useEffect, useState } from 'react';
import type { Player } from '../../engine/player';

export const PERF_KEY = 'vc-perf';
export const isPerfOn = (): boolean => {
  try {
    return localStorage.getItem(PERF_KEY) === '1';
  } catch {
    return false;
  }
};
export const setPerfOn = (on: boolean) => {
  try {
    if (on) localStorage.setItem(PERF_KEY, '1');
    else localStorage.removeItem(PERF_KEY);
  } catch {
    /* 存不了就算了 */
  }
};

type Stats = ReturnType<Player['stats']>;

/** 預覽左上角的小黑框：播放時每秒幾格、每格花多少毫秒、慢在哪一段。設定頁「顯示播放效能」打開才出現。 */
export function PerfOverlay({ player }: { player: Player | null }) {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    if (!player || !isPerfOn()) return;
    const id = window.setInterval(() => setS(player.stats()), 500);
    return () => window.clearInterval(id);
  }, [player]);
  if (!player || !isPerfOn() || !s) return null;
  const f = (n: number) => n.toFixed(1);
  return (
    <div className="perf" data-testid="perf-overlay" aria-hidden="true">
      <div>
        {f(s.fps)} fps｜每格 {f(s.renderMs)} ms
      </div>
      <div>
        場景 {f(s.buildMs)}｜影片上傳 {f(s.uploadMs)}｜合成 {f(s.compMs)}
      </div>
      <div>掉格 {s.dropped}</div>
      {s.transition.frames > 0 && (
        <div>
          最近轉場 {s.transition.frames} 格｜卡頓 {s.transition.drops}｜硬跳 {s.transition.hardSeeks}
        </div>
      )}
      {s.video && <div>{s.video}</div>}
    </div>
  );
}
