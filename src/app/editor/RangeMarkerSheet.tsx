import { Pause, Play, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { Range } from '../../engine/timeline';
import { toast } from '../../store/uiStore';
import { thumbStrip } from '../../engine/thumbs';
import { Sheet } from '../../ui/Sheet';
import { Wave } from './Wave';

// 共用的「片段標記軸」：網頁裡所有要「選片段」的地方都用它（修剪影片／照片／音樂、音訊靜音標記、特效出現時機、轉場分配）。
// 版面照使用者的截圖：標題＋右上角復原；上方預覽（素材本身的畫面，跟著白線）；秒數刻度＋小倒三角旗標（1起／1迄…）；
// 縮圖條（選到的原色＋框、沒選的灰）＋白線；「在白線位置新增一組起迄標記」（有起點一定同時有終點）；每組一行可移除；取消／套用。
// 單位：ranges 是「素材秒數」（或呼叫端自己決定的時間），duration 是整條軸的長度。

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const fmt2 = (n: number) => n.toFixed(2);

/** keep＝標起來的是留下的；mute＝標起來的是保留聲音的；silence＝標起來的是靜音的；timing＝特效時間 */
export type MarkerMode = 'keep' | 'mute' | 'silence' | 'timing';

export function RangeMarkerSheet({
  title,
  duration,
  ranges: initial,
  mode = 'keep',
  minLen,
  maxGroups = 99,
  thumbs,
  wave,
  mediaUrl,
  mediaKind = 'video',
  srcOffset = 0,
  srcSpeed = 1,
  frameAt,
  applyLabel = '套用片段範圍',
  hint,
  summary,
  onApply,
  onClose,
  extra,
  allowEmpty,
  onRangesChange,
}: {
  title: string;
  /** 整條軸的長度（秒） */
  duration: number;
  ranges: Range[];
  mode?: MarkerMode;
  /** 一組最短幾秒 */
  minLen: number;
  maxGroups?: number;
  thumbs?: string[];
  wave?: number[];
  /** 預覽用的影片／音樂網址；沒有就只有縮圖條（沒有預覽畫面） */
  mediaUrl?: string;
  mediaKind?: 'video' | 'audio' | 'none';
  /** 軸上的時間 t 對到素材秒數 srcOffset + t × srcSpeed（特效時機：軸是物件自己的時間） */
  srcOffset?: number;
  srcSpeed?: number;
  /** 音樂沒有畫面：白線移動時呼叫，讓呼叫端把「專案那一刻的畫面」畫出來（回傳 canvas 才會顯示） */
  frameAt?: (t: number) => HTMLCanvasElement | null;
  applyLabel?: string;
  hint?: string;
  summary?: (ranges: Range[]) => string;
  onApply: (ranges: Range[]) => void;
  onClose: () => void;
  /** 標題下面多放的東西（例：進階的「保留／靜音」切換） */
  extra?: ReactNode;
  /** 一組標記都沒有也可以套用（靜音模式＝沒有要靜音的地方） */
  allowEmpty?: boolean;
  /** 標記有變動時通知呼叫端（切換模式時要換算） */
  onRangesChange?: (ranges: Range[]) => void;
}) {
  const dur = Math.max(duration, 0.1);
  const [ranges, setRanges] = useState<Range[]>(initial.map((r): Range => [r[0], r[1]]));
  const undo = useRef<Range[][]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [cursor, setCursor] = useState(initial[0]?.[0] ?? 0);
  const [playing, setPlaying] = useState(false);
  const media = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);
  const rangesRef = useRef(ranges);
  useEffect(() => {
    rangesRef.current = ranges;
    onRangesChange?.(ranges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranges]);

  const snapshot = () => {
    undo.current = [...undo.current.slice(-19), rangesRef.current.map((r): Range => [r[0], r[1]])];
    setUndoCount(undo.current.length);
  };
  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    setUndoCount(undo.current.length);
    setRanges(prev);
  };

  const mediaTime = (t: number) => srcOffset + t * srcSpeed;
  const seek = (t: number) => {
    const c = clamp(t, 0, dur);
    setCursor(c);
    const m = media.current;
    if (m && !m.seeking) m.currentTime = clamp(mediaTime(c), 0, Math.max(m.duration || 1e9, 0.001) - 0.001);
    if (frameAt) {
      const src = frameAt(c);
      // 專案畫面要等預覽畫過才複製
      if (src) setTimeout(() => copyFrame(src), 60);
    }
  };
  const copyFrame = (src: HTMLCanvasElement) => {
    const cv = frameRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx?.drawImage(src, 0, 0, cv.width, cv.height);
  };

  // 一開始：預覽停在第一組的起點
  useEffect(() => {
    const id = setTimeout(() => seek(initial[0]?.[0] ?? 0), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 播放：白線跟著素材目前的時間跑；保留／靜音模式在範圍外把音量關掉
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const m = media.current;
      if (m) {
        const t = (m.currentTime - srcOffset) / srcSpeed;
        setCursor(clamp(t, 0, dur));
        if (mode !== 'timing') {
          const inside = rangesRef.current.some(([a, b]) => t >= a && t < b);
          m.volume = (mode === 'silence' ? !inside : inside) ? 1 : 0;
        }
        if (m.ended || t >= dur - 0.02) {
          m.pause();
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, mode, srcOffset, srcSpeed, dur]);

  const togglePlay = () => {
    const m = media.current;
    if (!m) return;
    if (playing) {
      m.pause();
      setPlaying(false);
      return;
    }
    if (cursor >= dur - 0.05) seek(0);
    void m
      .play()
      .then(() => setPlaying(true))
      .catch(() => toast('這個素材暫時無法試聽，請再按一次播放'));
  };

  // 點縮圖條：只移動白線與預覽，不改標記
  const onStripDown = (e: RPointerEvent) => {
    const r = stripRef.current!.getBoundingClientRect();
    media.current?.pause();
    setPlaying(false);
    seek(((e.clientX - r.left) / r.width) * dur);
  };

  const dragFlag = (e: RPointerEvent, i: number, side: 0 | 1) => {
    e.stopPropagation();
    e.preventDefault();
    media.current?.pause();
    setPlaying(false);
    snapshot();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const base = rangesRef.current.map((r): Range => [r[0], r[1]]);
    const width = stripRef.current!.getBoundingClientRect().width || 1;
    const origin = base[i]![side];
    const move = (ev: PointerEvent) => {
      const d = ((ev.clientX - x0) / width) * dur;
      const next = base.map((r): Range => [r[0], r[1]]);
      const r = next[i]!;
      if (side === 0) r[0] = clamp(origin + d, next[i - 1]?.[1] ?? 0, r[1] - minLen);
      else r[1] = clamp(origin + d, r[0] + minLen, next[i + 1]?.[0] ?? dur);
      setRanges(next);
      seek(r[side]);
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

  const addGroup = () => {
    if (ranges.length >= maxGroups) return toast(`最多 ${maxGroups} 組，請先移除或拖旗標調整`);
    if (ranges.some(([a, b]) => cursor > a && cursor < b))
      return toast('白線在已選的範圍裡，請先把白線移到沒選取的地方');
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const next = sorted.find(([a]) => a >= cursor - 1e-6);
    const end = Math.min(cursor + 1, next ? next[0] : dur, dur);
    if (end - cursor < minLen - 1e-6) return toast('白線後面空的地方太短，放不下一組');
    snapshot();
    setRanges([...ranges, [cursor, end] as Range].sort((a, b) => a[0] - b[0]));
  };
  const removeGroup = (i: number) => {
    snapshot();
    setRanges(ranges.filter((_, k) => k !== i));
  };

  // 沒被選的地方（範圍之間與頭尾）：變灰
  const gaps: Range[] = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a > at) gaps.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < dur) gaps.push([at, dur]);
  const pct = (t: number) => `${(clamp(t, 0, dur) / dur) * 100}%`;
  const kept = ranges.reduce((n, [a, b]) => n + (b - a), 0);
  const defaultSummary =
    mode === 'timing'
      ? `特效：${ranges[0] ? `${fmt2(ranges[0][0])} → ${fmt2(ranges[0][1])} 秒（共 ${fmt2(ranges[0][1] - ranges[0][0])} 秒）` : '還沒有標記'}`
      : `${ranges.length > 1 ? `共 ${ranges.length} 組 · ` : ''}來源 ${fmt2(ranges[0]?.[0] ?? 0)} 秒 → ${fmt2(ranges[ranges.length - 1]?.[1] ?? 0)} 秒 · ${
          mode === 'mute' ? '保留聲音' : '選取'
        } ${kept.toFixed(1)} 秒 / 原始素材 ${dur.toFixed(1)} 秒`;

  return (
    <Sheet open title={title} onClose={onClose} tall>
      {extra}
      <div className="rm-preview" data-testid="rm-preview">
        {mediaKind === 'video' && mediaUrl && (
          <video
            ref={(el) => {
              media.current = el;
            }}
            src={mediaUrl}
            playsInline
            preload="auto"
            onLoadedMetadata={() => seek(cursor)}
            data-testid="rm-video"
          />
        )}
        {mediaKind === 'audio' && mediaUrl && (
          <>
            <audio
              ref={(el) => {
                media.current = el;
              }}
              src={mediaUrl}
              preload="auto"
              onLoadedMetadata={() => seek(cursor)}
            />
            <canvas ref={frameRef} width={320} height={180} aria-label="這一刻專案的畫面" />
          </>
        )}
        {mediaKind === 'none' && <div className="rm-nopreview">（沒有預覽畫面）</div>}
      </div>
      <div className="rm-play-row">
        {mediaKind !== 'none' && (
          <button
            className="rm-icon-btn"
            data-testid="rm-play"
            aria-label={playing ? '暫停' : '播放'}
            onClick={togglePlay}
          >
            {playing ? (
              <Pause size={20} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={20} fill="currentColor" aria-hidden="true" />
            )}
          </button>
        )}
        <button
          className="rm-icon-btn"
          aria-label="復原上一步"
          data-testid="rm-undo"
          disabled={undoCount === 0}
          onClick={doUndo}
        >
          <Undo2 size={20} aria-hidden="true" />
        </button>
        <span className="rm-now" data-testid="rm-now">
          目前 {fmt2(cursor)} 秒
        </span>
      </div>
      <div className="rm-ruler" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i}>{((dur * i) / 4).toFixed(2)}s</span>
        ))}
      </div>
      <div className="rm-wrap">
        <div className="rm-flags">
          {ranges.map(([a, b], i) => (
            <span key={i}>
              <button
                className="rm-flag start"
                style={{ left: pct(a) }}
                role="slider"
                aria-label={`第 ${i + 1} 組 起點`}
                aria-valuetext={`第 ${fmt2(a)} 秒`}
                data-testid={`range-flag-start-${i}`}
                onPointerDown={(e) => dragFlag(e, i, 0)}
              >
                <i />
                <small>{i + 1}起</small>
              </button>
              <button
                className="rm-flag end"
                style={{ left: pct(b) }}
                role="slider"
                aria-label={`第 ${i + 1} 組 終點`}
                aria-valuetext={`第 ${fmt2(b)} 秒`}
                data-testid={`range-flag-end-${i}`}
                onPointerDown={(e) => dragFlag(e, i, 1)}
              >
                <i />
                <small>{i + 1}迄</small>
              </button>
            </span>
          ))}
        </div>
        <div className="rm-strip" ref={stripRef} data-testid="trim-strip" onPointerDown={onStripDown}>
          <div className="rm-tiles" aria-hidden="true">
            {wave && wave.length > 0 ? (
              <Wave wave={wave} from={srcOffset} to={srcOffset + dur * srcSpeed} />
            ) : thumbs && thumbs.length > 0 ? (
              // 整條帶平均挑 8 張（縮圖有幾十張，每張都畫會變成一條一條的細縫）
              thumbStrip(thumbs, 1, 0, 1, 8).map((t, i) => <img key={i} src={t} alt="" draggable={false} />)
            ) : null}
          </div>
          {(mode === 'silence' ? [] : gaps).map(([a, b], i) => (
            <div
              key={i}
              className="rm-gray"
              data-testid="range-gray"
              style={{ left: pct(a), width: `${((b - a) / dur) * 100}%` }}
            />
          ))}
          {ranges.map(([a, b], i) => (
            <div
              key={i}
              className={`rm-body${mode === 'silence' ? ' silence' : ''}`}
              data-testid={`range-body-${i}`}
              style={{ left: pct(a), width: `${((b - a) / dur) * 100}%` }}
            />
          ))}
          <div className="rm-cursor" data-testid="rm-cursor" style={{ left: pct(cursor) }} />
        </div>
      </div>
      <button className="btn rm-add" data-testid="range-add" onClick={addGroup}>
        在白線位置新增一組起迄標記
      </button>
      <ul className="rm-list">
        {ranges.map(([a, b], i) => (
          <li key={i}>
            <span>
              第 {i + 1} 組：{fmt2(a)}–{fmt2(b)} 秒
            </span>
            <button className="chip sm" data-testid={`range-remove-${i}`} onClick={() => removeGroup(i)}>
              移除第 {i + 1} 組{mode === 'timing' ? '' : '片段'}
            </button>
          </li>
        ))}
      </ul>
      <p className="rm-summary" data-testid="trim-info">
        {summary ? summary(ranges) : defaultSummary}
      </p>
      <p className="hint">
        {hint ??
          '點縮圖只移動白線與預覽；按「新增」才建立下一組。原色是選取，灰色是不選；中間沒選的地方保留原本的時間空白。右上角可復原，取消不套用變更。'}
      </p>
      <div className="sheet-row">
        <button className="btn" onClick={onClose}>
          取消
        </button>
        <button
          className="btn primary"
          data-testid="rm-apply"
          disabled={ranges.length === 0 && !allowEmpty}
          onClick={() => onApply(ranges)}
        >
          {applyLabel}
        </button>
      </div>
    </Sheet>
  );
}
