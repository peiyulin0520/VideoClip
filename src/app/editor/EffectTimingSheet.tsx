import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { urlFor } from '../../engine/assetUrls';
import { MIN_EFFECT } from '../../engine/transitions';
import type { Item } from '../../model/types';
import { thumbFor, thumbStrip } from '../../engine/thumbs';
import { useProjectStore } from '../../store/projectStore';
import { Sheet } from '../../ui/Sheet';
import { itemTitle } from '../../engine/labels';

// 單一素材進場／出場、兩段之間轉場的「時間細調」面板：預覽在左、拖拉軸在右（同一列，省空間）。
// 進場：軸＝素材自己的長度，起點固定在 0，只有一個「迄」旗標；出場：終點固定在素材結尾，只有一個「起」旗標。
// 轉場：軸＝前一段的結尾＋這一段的開頭，接縫在中間；「起」在接縫左邊、「迄」在接縫右邊。
// 下面的欄位跟旗標連動：進場 迄＝特效幾秒；出場 起＝長度−特效幾秒；轉場 特效幾秒＝起＋迄。

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toFixed(2);
const SEAM_SIDE = 4; // 轉場的軸：接縫兩邊最多各 4 秒

export type TimingMode = 'in' | 'out' | 'seam';

function MiniPreview({ item, t }: { item: Item; t: number }) {
  const project = useProjectStore((s) => s.project)!;
  const asset =
    item.type === 'text' || item.type === 'audio'
      ? undefined
      : project.assets.find((a) => a.id === item.assetId);
  const video = useRef<HTMLVideoElement>(null);
  const url = asset?.kind === 'video' ? urlFor(project.id, asset.id) : undefined;
  const src = item.type !== 'text' && item.type !== 'audio' ? item.trimIn + t * item.speed : 0;
  useEffect(() => {
    const v = video.current;
    if (!v || v.seeking) return;
    const dur = Number.isFinite(v.duration) ? v.duration : 1e9;
    v.currentTime = clamp(src, 0, Math.max(dur - 0.001, 0));
  }, [src, url]);
  return (
    <div className="et-prev" data-testid="et-preview">
      {url ? (
        <video
          ref={video}
          src={url}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={() => {
            if (video.current) video.current.currentTime = Math.max(src, 0);
          }}
        />
      ) : item.type === 'text' ? (
        <div className="et-text">{item.card.runs.map((r) => r.text).join('')}</div>
      ) : asset?.thumbs[0] && item.type !== 'audio' ? (
        <img
          src={
            item.type === 'image'
              ? asset.thumbs[0]
              : (thumbFor(asset.thumbs, item.trimIn + t * item.speed, asset.duration) ?? asset.thumbs[0])
          }
          alt=""
        />
      ) : (
        <div className="et-text">（沒有預覽）</div>
      )}
      <span className="et-prev-name">{itemTitle(item, asset)}</span>
    </div>
  );
}

function Num({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(clamp(r2(v), min, max));
  return (
    <label className="et-num">
      <span>{label}</span>
      <span className="et-num-ctl">
        <button type="button" aria-label={`${label} 減 0.1`} onClick={() => set(value - 0.1)}>
          −
        </button>
        <input
          type="number"
          aria-label={label}
          step={0.1}
          min={min}
          max={max}
          value={r2(value)}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          onBlur={(e) => {
            const v = Number(e.target.value);
            set(Number.isFinite(v) ? v : value);
          }}
        />
        <button type="button" aria-label={`${label} 加 0.1`} onClick={() => set(value + 0.1)}>
          ＋
        </button>
      </span>
    </label>
  );
}

export function EffectTimingSheet({
  mode,
  item,
  prev,
  initial,
  onApply,
  onClose,
}: {
  mode: TimingMode;
  item: Item;
  /** 轉場：前一個素材 */
  prev?: Item;
  /** in／out：特效幾秒；seam：before、after */
  initial: { d?: number; before?: number; after?: number };
  onApply: (v: { d: number; before: number; after: number }) => void;
  onClose: () => void;
}) {
  const project = useProjectStore((s) => s.project)!;
  const len = item.duration;
  const ta = Math.min(prev?.duration ?? 0, SEAM_SIDE);
  const tb = Math.min(len, SEAM_SIDE);
  const [d, setD] = useState(clamp(initial.d ?? 0.8, MIN_EFFECT, len));
  const [bf, setBf] = useState(clamp(initial.before ?? 0.25, 0.1, Math.max(ta, 0.1)));
  const [af, setAf] = useState(clamp(initial.after ?? 0.25, 0.1, Math.max(tb, 0.1)));
  const [cur, setCur] = useState<'a' | 'b' | 'x'>(mode === 'seam' ? 'b' : 'x');
  const stripRef = useRef<HTMLDivElement>(null);

  const total = mode === 'seam' ? ta + tb : len;
  const pct = (v: number) => `${(clamp(v, 0, total) / total) * 100}%`;
  // 旗標在軸上的位置、預覽跟著看哪一個素材的哪一秒
  const flagPos = mode === 'in' ? d : mode === 'out' ? len - d : 0;
  const prevItem = prev ?? item;
  const preview: { item: Item; t: number } =
    mode === 'seam'
      ? cur === 'a'
        ? { item: prevItem, t: Math.max(prevItem.duration - bf, 0) }
        : { item, t: af }
      : { item, t: mode === 'in' ? d : len - d };
  const cursor = mode === 'seam' ? (cur === 'a' ? ta - bf : ta + af) : flagPos;

  const dragFlag = (e: RPointerEvent, which: 'single' | 'before' | 'after') => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const width = stripRef.current!.getBoundingClientRect().width || 1;
    const start = which === 'single' ? flagPos : which === 'before' ? ta - bf : ta + af;
    const move = (ev: PointerEvent) => {
      const pos = clamp(start + ((ev.clientX - x0) / width) * total, 0, total);
      if (which === 'single') setD(clamp(mode === 'in' ? pos : len - pos, MIN_EFFECT, len));
      else if (which === 'before') {
        setBf(clamp(ta - pos, 0.1, Math.max(ta, 0.1)));
        setCur('a');
      } else {
        setAf(clamp(pos - ta, 0.1, Math.max(tb, 0.1)));
        setCur('b');
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  /** 這個素材自己的時間 l0～l1 秒的縮圖帶（挑 k 張） */
  const stripOf = (it: Item, l0: number, l1: number, k: number): string[] => {
    if (it.type === 'text' || it.type === 'audio') return [];
    const a = project.assets.find((x) => x.id === it.assetId);
    if (!a) return [];
    if (it.type === 'image') return a.thumbs.slice(0, 1);
    return thumbStrip(a.thumbs, a.duration, it.trimIn + l0 * it.speed, it.trimIn + l1 * it.speed, k);
  };
  const title = mode === 'in' ? '調整進場時間' : mode === 'out' ? '調整出場時間' : '調整轉場分配';
  const hl: [number, number] = mode === 'in' ? [0, d] : mode === 'out' ? [len - d, len] : [ta - bf, ta + af];
  const sumTotal = bf + af;

  return (
    <Sheet open title={title} onClose={onClose}>
      <div className="et-row">
        <MiniPreview item={preview.item} t={preview.t} />
        <div className="et-axis">
          <div className="rm-wrap">
            <div className="rm-flags">
              {mode !== 'seam' ? (
                <button
                  className="rm-flag"
                  style={{ left: pct(flagPos) }}
                  role="slider"
                  aria-label={mode === 'in' ? '進場結束點' : '出場開始點'}
                  aria-valuetext={`第 ${fmt(flagPos)} 秒`}
                  data-testid="fx-flag"
                  onPointerDown={(e) => dragFlag(e, 'single')}
                >
                  <i />
                  <small>{mode === 'in' ? '迄' : '起'}</small>
                </button>
              ) : (
                <>
                  <button
                    className="rm-flag"
                    style={{ left: pct(ta - bf) }}
                    role="slider"
                    aria-label="轉場開始點（前一段）"
                    aria-valuetext={`接縫前 ${fmt(bf)} 秒`}
                    data-testid="fx-flag-before"
                    onPointerDown={(e) => dragFlag(e, 'before')}
                  >
                    <i />
                    <small>起</small>
                  </button>
                  <button
                    className="rm-flag"
                    style={{ left: pct(ta + af) }}
                    role="slider"
                    aria-label="轉場結束點（這一段）"
                    aria-valuetext={`接縫後 ${fmt(af)} 秒`}
                    data-testid="fx-flag-after"
                    onPointerDown={(e) => dragFlag(e, 'after')}
                  >
                    <i />
                    <small>迄</small>
                  </button>
                </>
              )}
            </div>
            <div className="rm-strip" ref={stripRef} data-testid="et-strip">
              <div className="rm-tiles" aria-hidden="true">
                {mode === 'seam' ? (
                  <>
                    <div className="et-half" style={{ flex: ta || 1 }}>
                      {stripOf(prevItem, prevItem.duration - ta, prevItem.duration, 4).map((t, i) => (
                        <img key={i} src={t} alt="" draggable={false} />
                      ))}
                    </div>
                    <div className="et-half" style={{ flex: tb || 1 }}>
                      {stripOf(item, 0, tb, 4).map((t, i) => (
                        <img key={i} src={t} alt="" draggable={false} />
                      ))}
                    </div>
                  </>
                ) : (
                  stripOf(item, 0, len, 8).map((t, i) => <img key={i} src={t} alt="" draggable={false} />)
                )}
              </div>
              <div className="rm-gray" style={{ left: 0, width: pct(hl[0]) }} />
              <div className="rm-gray" style={{ left: pct(hl[1]), right: 0 }} />
              <div
                className="rm-body"
                style={{ left: pct(hl[0]), width: `${((hl[1] - hl[0]) / total) * 100}%` }}
              />
              {mode === 'seam' && <div className="et-seam" style={{ left: pct(ta) }} />}
              <div className="rm-cursor" data-testid="et-cursor" style={{ left: pct(cursor) }} />
            </div>
          </div>
          {mode === 'seam' && (
            <div className="et-ab">
              <span>A：{itemTitle(prevItem)}</span>
              <span>B：{itemTitle(item)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="et-fields">
        {mode === 'in' && (
          <>
            <Num label="迄（秒）" value={d} min={MIN_EFFECT} max={len} onChange={setD} />
            <Num label="特效幾秒" value={d} min={MIN_EFFECT} max={len} onChange={setD} />
          </>
        )}
        {mode === 'out' && (
          <>
            <Num
              label="起（秒）"
              value={len - d}
              min={0}
              max={len - MIN_EFFECT}
              onChange={(v) => setD(len - v)}
            />
            <Num label="特效幾秒" value={d} min={MIN_EFFECT} max={len} onChange={setD} />
          </>
        )}
        {mode === 'seam' && (
          <>
            <Num
              label="起（A 結尾前幾秒）"
              value={bf}
              min={0.1}
              max={Math.max(ta, 0.1)}
              onChange={(v) => {
                setBf(v);
                setCur('a');
              }}
            />
            <Num
              label="迄（B 開頭後幾秒）"
              value={af}
              min={0.1}
              max={Math.max(tb, 0.1)}
              onChange={(v) => {
                setAf(v);
                setCur('b');
              }}
            />
            <Num
              label="特效幾秒"
              value={sumTotal}
              min={0.2}
              max={Math.max(ta, 0.1) + Math.max(tb, 0.1)}
              onChange={(v) => {
                const ratio = sumTotal > 0 ? bf / sumTotal : 0.5;
                setBf(clamp(r2(v * ratio), 0.1, Math.max(ta, 0.1)));
                setAf(clamp(r2(v * (1 - ratio)), 0.1, Math.max(tb, 0.1)));
              }}
            />
          </>
        )}
      </div>
      <p className="hint" data-testid="et-summary">
        {mode === 'in'
          ? `進場：0.00 → ${fmt(d)} 秒（共 ${fmt(d)} 秒）`
          : mode === 'out'
            ? `出場：${fmt(len - d)} → ${fmt(len)} 秒（共 ${fmt(d)} 秒）`
            : `轉場：接縫前 ${fmt(bf)} 秒＋接縫後 ${fmt(af)} 秒（共 ${fmt(sumTotal)} 秒）`}
      </p>
      <div className="sheet-row">
        <button className="btn" onClick={onClose}>
          取消
        </button>
        <button
          className="btn primary"
          data-testid="et-apply"
          onClick={() => onApply({ d: r2(d), before: r2(bf), after: r2(af) })}
        >
          套用
        </button>
      </div>
    </Sheet>
  );
}
