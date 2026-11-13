import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Range } from '../../engine/timeline';
import type { Asset } from '../../model/types';
import { Wave } from './Wave';

// 片段範圍選取：整段素材攤成一條（縮圖或波形），**上方**用小旗標標起點與終點（不用兩側拉霸）。
// 一對旗標＝一段要留下來的範圍，可以有好幾段；選到的範圍保持原色，沒選到的變灰。
// 拖旗標時，旁邊的小畫面會顯示那一秒整個專案合起來的樣子（從預覽畫布縮小複製）。

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export type RangeHint = { index: number; edge: 'start' | 'end' | 'move' };

export function RangePicker({
  asset,
  ranges,
  sel,
  onSelect,
  onChange,
  minSrc,
  previewSignal,
  aspect,
}: {
  asset: Asset;
  ranges: Range[];
  sel: number;
  onSelect: (i: number) => void;
  /** 旗標移動中 final=false（只更新畫面上的旗標與小縮圖，不去動預覽的影片）；放開手指 final=true */
  onChange: (next: Range[], hint: RangeHint, final: boolean) => void;
  /** 一段最短的素材秒數 */
  minSrc: number;
  /** 每次增加就把預覽畫布目前的畫面複製到小畫面（晚一點再畫幾次，等影片 seek 完） */
  previewSignal: number;
  /** 專案寬 ÷ 高（小畫面的比例） */
  aspect: number;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  // 拖旗標的時候：小畫面先顯示素材縮圖（零延遲，手機上 seek 影片太慢會跳格）；放開才去 seek 精準的那一格
  const [live, setLive] = useState<number | null>(null);
  const dur = Math.max(asset.duration, 0.1);

  useEffect(() => {
    if (previewSignal === 0) return;
    const draw = () => {
      const src = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]');
      const cv = miniRef.current;
      if (!src || !cv) return;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(src, 0, 0, cv.width, cv.height);
    };
    const timers = [40, 180, 450, 900].map((ms) => setTimeout(draw, ms));
    return () => timers.forEach(clearTimeout);
  }, [previewSignal]);

  const startDrag = (e: RPointerEvent, i: number, edge: RangeHint['edge']) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(i);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const base = ranges.map((r): Range => [r[0], r[1]]);
    const width = stripRef.current!.getBoundingClientRect().width || 1;
    const prevEnd = i > 0 ? base[i - 1]![1] : 0;
    const nextStart = i < base.length - 1 ? base[i + 1]![0] : dur;
    let latest: Range[] = base;
    const move = (ev: PointerEvent) => {
      const d = ((ev.clientX - x0) / width) * dur;
      const [a, b] = base[i]!;
      let r: Range;
      if (edge === 'start') r = [clamp(a + d, prevEnd, b - minSrc), b];
      else if (edge === 'end') r = [a, clamp(b + d, a + minSrc, nextStart)];
      else {
        const len = b - a;
        const ns = clamp(a + d, prevEnd, nextStart - len);
        r = [ns, ns + len];
      }
      const next = base.map((x, k): Range => (k === i ? r : x));
      latest = next;
      setLive(edge === 'end' ? r[1] : r[0]);
      onChange(next, { index: i, edge }, false);
    };
    const up = () => {
      setLive(null);
      onChange(latest, { index: i, edge }, true);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // 沒被選的區段（範圍之間與頭尾）：變灰
  const gaps: Range[] = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a > at) gaps.push([at, a]);
    at = b;
  }
  if (at < dur) gaps.push([at, dur]);
  const pct = (t: number) => `${(t / dur) * 100}%`;

  return (
    <div className="range-picker" data-testid="range-picker">
      <div className="range-mini-wrap">
        <canvas
          ref={miniRef}
          className="range-mini"
          width={112}
          height={Math.max(Math.round(112 / Math.max(aspect, 0.2)), 48)}
          aria-label="拖旗標時，這一秒的畫面"
          data-testid="range-mini"
        />
        {live !== null && asset.thumbs.length > 0 && (
          <img
            className="range-mini-thumb"
            data-testid="range-mini-thumb"
            alt=""
            draggable={false}
            src={
              asset.thumbs[clamp(Math.floor((live / dur) * asset.thumbs.length), 0, asset.thumbs.length - 1)]
            }
          />
        )}
        {live !== null && <span className="range-mini-t">第 {live.toFixed(1)} 秒</span>}
      </div>
      <div className="range-main">
        <div className="range-wrap">
          <div className="range-flags">
            {ranges.map(([a, b], i) => (
              <span key={i}>
                <button
                  className={`range-flag start${i === sel ? ' on' : ''}`}
                  style={{ left: pct(a) }}
                  role="slider"
                  aria-label={`第 ${i + 1} 段 起點`}
                  aria-valuetext={`第 ${a.toFixed(1)} 秒`}
                  data-testid={`range-flag-start-${i}`}
                  onPointerDown={(e) => startDrag(e, i, 'start')}
                />
                <button
                  className={`range-flag end${i === sel ? ' on' : ''}`}
                  style={{ left: pct(b) }}
                  role="slider"
                  aria-label={`第 ${i + 1} 段 終點`}
                  aria-valuetext={`第 ${b.toFixed(1)} 秒`}
                  data-testid={`range-flag-end-${i}`}
                  onPointerDown={(e) => startDrag(e, i, 'end')}
                />
              </span>
            ))}
          </div>
          <div
            className={`trim-strip${asset.kind === 'audio' ? ' is-audio' : ''}`}
            ref={stripRef}
            data-testid="trim-strip"
          >
            <div className="trim-tiles" aria-hidden="true">
              {asset.kind === 'audio' ? (
                <Wave wave={asset.wave} from={0} to={asset.duration} />
              ) : asset.thumbs.length > 0 ? (
                asset.thumbs.map((t, i) => <img key={i} src={t} alt="" draggable={false} />)
              ) : (
                <span className="trim-nothumb">{asset.name}</span>
              )}
            </div>
            {gaps.map(([a, b], i) => (
              <div
                key={i}
                className="range-gray"
                style={{ left: pct(a), width: `${((b - a) / dur) * 100}%` }}
              />
            ))}
            {ranges.map(([a, b], i) => (
              <div
                key={i}
                className={`range-body${i === sel ? ' on' : ''}`}
                data-testid={`range-body-${i}`}
                style={{ left: pct(a), width: `${Math.max(((b - a) / dur) * 100, 0)}%` }}
                onPointerDown={(e) => startDrag(e, i, 'move')}
              />
            ))}
          </div>
          {ranges.map(([a, b], i) => (
            <i key={i} className="range-line-wrap" aria-hidden="true">
              <i className="range-line" style={{ left: pct(a) }} />
              <i className="range-line" style={{ left: pct(b) }} />
            </i>
          ))}
        </div>
      </div>
    </div>
  );
}
