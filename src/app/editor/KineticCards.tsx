import { useEffect, useRef } from 'react';
import type { KineticDef } from '../../engine/kinetic/core';
import { paintKinetic } from '../../engine/kinetic/render';
import { SCHEMES } from '../../engine/kinetic';
import { canvasFamily } from '../../engine/textRender';

const SIZE = 64;
const reduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * 動態字卡的卡片：64×64 的小畫面，畫那一式在「代表秒數」的樣子（用這個字卡的字）。
 * 只有選中的那張會動（其他靜止，省電）；系統設定「減少動態效果」時都不動。
 */
export function KineticCard({
  def,
  words,
  fontId,
  active,
  onPick,
}: {
  def: KineticDef;
  words: string[];
  fontId: string;
  active: boolean;
  onPick: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const wordsKey = words.join('|');
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.height = Math.round(SIZE * scale);
    const sch = SCHEMES[def.scheme];
    const p = { words, fg: sch.fg, hi: sch.hi, hifg: sch.hifg, bg: sch.bg, family: canvasFamily(fontId) };
    paintKinetic(c, def, p, def.poster);
    if (!active || reduced()) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      paintKinetic(c, def, p, def.poster + (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, wordsKey, fontId, active]);
  return (
    <button
      role="radio"
      aria-checked={active}
      aria-label={`文字特效 ${def.zh}`}
      className={`tr-card${active ? ' on' : ''}`}
      data-testid="kn-card"
      data-kn-id={def.id}
      onClick={onPick}
    >
      <canvas ref={cv} className="kn-thumb" aria-hidden="true" />
      <span className="tr-name">{def.zh}</span>
    </button>
  );
}
