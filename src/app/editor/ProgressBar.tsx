import { useEffect, useRef, type PointerEvent } from 'react';
import { useUI } from '../../store/uiStore';

/** 全螢幕預覽時播放列上方的細進度條：按住左右拖就能跳到那一秒（時間軸被收起來了） */
export function ProgressBar({ total }: { total: number }) {
  const player = useUI((s) => s.player);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!player) return;
    const show = (t: number) => {
      if (fillRef.current) fillRef.current.style.width = `${total > 0 ? Math.min(100, (t / total) * 100) : 0}%`;
    };
    show(player.time);
    return player.subscribe((t) => show(t));
  }, [player, total]);

  const seekAt = (e: PointerEvent) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || !player || total <= 0) return;
    player.seek(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * total);
  };

  return (
    <div
      className="progress-bar"
      data-testid="progress-bar"
      role="slider"
      aria-label="播放進度"
      aria-valuemin={0}
      aria-valuemax={Math.round(total * 10) / 10}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        player?.pause();
        seekAt(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(e);
      }}
    >
      <div className="pg-track" ref={trackRef}>
        <div className="pg-fill" ref={fillRef} />
      </div>
    </div>
  );
}
