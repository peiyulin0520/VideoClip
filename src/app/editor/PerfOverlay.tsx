import { useEffect, useState } from 'react';
import type { Player } from '../../engine/player';
import { QUALITY_LABELS } from '../../engine/previewQuality';
import { useQuality } from '../../store/qualityStore';

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
    player.setMeasureGpu(true);
    const id = window.setInterval(() => setS(player.stats()), 500);
    return () => {
      window.clearInterval(id);
      player.setMeasureGpu(false);
    };
  }, [player]);
  const q = useQuality((x) => x.q);
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
      <div>
        合成：準備 {f(s.prepMs)}｜繪製 {f(s.drawMs)}｜等 GPU {f(s.gpuMs)}
      </div>
      <div>
        掉格 {s.dropped}｜凍住 {s.frozen}｜最低 {f(s.fpsMin)} fps
      </div>
      <div>
        畫質 {QUALITY_LABELS[q]} {s.canvas}｜解碼器 {s.decoders}/{s.pool}｜聲音 {s.audio}
      </div>
      {s.sources.map((x, i) => (
        <div key={i}>
          影片{i + 1} {x}
        </div>
      ))}
      {s.transition.frames > 0 && (
        <div>
          最近轉場 {s.transition.frames} 格｜卡頓 {s.transition.drops}｜硬跳 {s.transition.hardSeeks}
          {s.transition.lastSeek ? `｜${s.transition.lastSeek}` : ''}
          ｜預先解好 {s.transition.ready}/{s.transition.total}｜用預解 {s.transition.cached} 用影片{' '}
          {s.transition.video}｜等了 {s.transition.waitMs} ms｜換手 預解 {s.transition.handCached} 回影片{' '}
          {s.transition.handBack} 差 {s.transition.handDiff} 秒｜起跑 {s.transition.lat} ms 重對{' '}
          {s.transition.resync}
        </div>
      )}
      {s.video && <div>{s.video}</div>}
    </div>
  );
}
