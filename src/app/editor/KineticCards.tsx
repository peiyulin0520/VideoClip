import { useEffect, useRef } from 'react';
import type { KineticDef } from '../../engine/kinetic/core';
import { paintKinetic } from '../../engine/kinetic/render';
import { schemeOf } from '../../engine/kinetic';
import { canvasFamily, renderText } from '../../engine/textRender';
import { applyTextFx } from '../../engine/textFx';
import type { TextCard, TextFxKind } from '../../model/types';

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
    // 縮圖的比例跟那一式的預設框一樣（16:9 一條、整個畫面＝方形、歌詞框）
    const area = def.area ?? 'wide';
    c.width = Math.round(SIZE * scale);
    c.height = Math.round(SIZE * scale * (area === 'full' ? 1 : area === 'lyrics' ? 0.4 : 9 / 16));
    const sch = schemeOf(def);
    const p = {
      words,
      fg: sch.fg,
      paper: sch.bg,
      hi: sch.hi,
      hifg: sch.hifg,
      bg: sch.bg,
      family: canvasFamily(fontId),
    };
    paintKinetic(c, def, p, def.poster, def.fade ?? 'none');
    if (!active || reduced()) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      paintKinetic(c, def, p, def.poster + (now - t0) / 1000, def.fade ?? 'none');
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

/**
 * 基本文字特效（閃爍、發光閃亮、方格字、震動）的卡片：用這個字卡的字（最多前 4 個字、白字）畫出那個特效；
 * 只有選中的那張會動，其他靜止；系統設定「減少動態效果」時都不動。
 */
export function TextFxCard({
  kind,
  name,
  card,
  seed,
  active,
  onPick,
}: {
  kind: TextFxKind;
  name: string;
  card: TextCard;
  seed: string;
  active: boolean;
  onPick: () => void;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const run0 = card.runs[0];
  const text = (card.runs.map((r) => r.text).join('') || '文字').replace(/\s+/g, '').slice(0, 4) || '文字';
  const fontId = run0?.fontId ?? '';
  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(SIZE * scale);
    c.height = Math.round(SIZE * scale);
    const preview: TextCard = {
      runs: [
        {
          text,
          fontId,
          size: 120,
          color: '#f4f5f7',
          letterSpacing: 0,
          lineHeight: 1.2,
          weight: 'bold',
        },
      ],
      align: 'center',
    };
    const g = c.getContext('2d')!;
    const draw = (t: number) => {
      const base = renderText(preview, 0.5);
      const fx = applyTextFx(base, kind, t, seed, 60, '#f4f5f7');
      g.clearRect(0, 0, c.width, c.height);
      const { x, y, w, h } = fx.content;
      if (w <= 0 || h <= 0) return;
      const k = Math.min((c.width * 0.86) / w, (c.height * 0.5) / h);
      g.drawImage(fx.canvas, x, y, w, h, (c.width - w * k) / 2, (c.height - h * k) / 2, w * k, h * k);
    };
    draw(0.4);
    if (!active || reduced()) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      draw(0.4 + (now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind, text, fontId, seed, active]);
  return (
    <button
      role="radio"
      aria-checked={active}
      aria-label={`文字特效 ${name}`}
      className={`tr-card${active ? ' on' : ''}`}
      data-testid="tfx-card"
      data-tfx-id={kind}
      onClick={onPick}
    >
      <canvas ref={cv} className="kn-thumb" aria-hidden="true" />
      <span className="tr-name">{name}</span>
    </button>
  );
}
