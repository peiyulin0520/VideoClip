import { useEffect, useRef } from 'react';
import { drawTransitionDemo } from '../../engine/transitionPreview';
import type { TransitionKind } from '../../model/types';

const SIZE = 64;
const CYCLE = 1.8; // 秒：轉場 1.2 秒＋停一下
const GO = 1.2;
const MAX_LIVE = 8; // 同時最多動幾張（太多手機會卡）

const reduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * 轉場卡片：64×64 的小畫面，用 A（暖橘）→ B（藍綠）示範這個轉場的效果，循環播放。
 * 只有在畫面上看得到的卡片才會動（IntersectionObserver），同時最多 MAX_LIVE 張；
 * 系統設定「減少動態效果」時只畫轉場進行到一半的那一格。
 */
export function TransitionCard({
  kind,
  label,
  active,
  onPick,
}: {
  kind: TransitionKind | null;
  label: string;
  active: boolean;
  onPick: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    if (!c || !kind) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.height = SIZE * scale;
    ctx.scale(scale, scale);
    if (reduced()) {
      drawTransitionDemo(ctx, SIZE, SIZE, kind, 0.5);
      return;
    }
    let visible = false;
    let raf = 0;
    const draw = (now: number) => {
      const ph = (now / 1000) % CYCLE;
      drawTransitionDemo(ctx, SIZE, SIZE, kind, Math.min(ph / GO, 1));
      raf = requestAnimationFrame(draw);
    };
    const start = () => {
      if (!raf && liveCount < MAX_LIVE) {
        liveCount++;
        raf = requestAnimationFrame(draw);
      }
    };
    const stop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        liveCount--;
      }
    };
    drawTransitionDemo(ctx, SIZE, SIZE, kind, 0.5); // 還沒動之前先有一張靜態的
    const io = new IntersectionObserver((es) => {
      visible = es.some((e) => e.isIntersecting);
      if (visible) start();
      else stop();
    });
    io.observe(c);
    return () => {
      io.disconnect();
      stop();
      void visible;
    };
  }, [kind]);
  return (
    <button
      role="radio"
      aria-checked={active}
      aria-label={`轉場 ${label}`}
      className={`tr-card${active ? ' on' : ''}`}
      data-kind={kind ?? 'none'}
      onClick={onPick}
    >
      {kind ? (
        <canvas ref={cv} data-testid="tr-demo" style={{ width: SIZE, height: SIZE }} aria-hidden="true" />
      ) : (
        <span className="tr-none" aria-hidden="true">
          ⊘
        </span>
      )}
      <span className="tr-name">{label}</span>
    </button>
  );
}

let liveCount = 0;
