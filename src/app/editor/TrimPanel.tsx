import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { MIN_CLIP_DURATION } from '../../model/defaults';
import type { Asset, Track, VideoItem } from '../../model/types';
import { setTrimWindowFree } from '../../engine/timeline';
import { setTrackItems } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { Wave } from './Wave';

// 修剪面板：整段素材攤開（縮圖條），中間的「選取窗」是要留下來的區段。拖兩側把手改頭尾、拖中間整段平移，
// 下面的按鈕一次調 1 秒。片段在時間軸上的位置（含前面的空白）不變，只有長度改變。

const fmt = (n: number) => n.toFixed(1);

export function TrimPanel({
  item,
  asset,
  track,
  onClose,
}: {
  item: VideoItem;
  asset: Asset;
  track: Track;
  onClose: () => void;
}) {
  const player = useUI((s) => s.player);
  const stripRef = useRef<HTMLDivElement>(null);
  const dur = Math.max(asset.duration, 0.1);
  const srcStart = item.trimIn;
  const srcEnd = item.trimIn + item.duration * item.speed;
  const minSrc = MIN_CLIP_DURATION * item.speed;

  const commit = (s: number, e: number, peekAt: 'start' | 'end') => {
    const next = setTrimWindowFree(track.items, item.id, s, e, asset);
    setTrackItems(track.id, next, { coalesce: `trim:${item.id}` });
    const cur = next.find((x) => x.id === item.id)!;
    player?.peek(peekAt === 'start' ? cur.start : cur.start + cur.duration - 0.05);
  };

  const startDrag = (e: RPointerEvent, mode: 'left' | 'right' | 'move') => {
    e.stopPropagation();
    e.preventDefault();
    player?.pause();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const s0 = srcStart;
    const e0 = srcEnd;
    const width = stripRef.current!.getBoundingClientRect().width || 1;
    const move = (ev: PointerEvent) => {
      const d = ((ev.clientX - x0) / width) * dur;
      if (mode === 'left') commit(Math.min(s0 + d, e0 - minSrc), e0, 'start');
      else if (mode === 'right') commit(s0, Math.max(e0 + d, s0 + minSrc), 'end');
      else {
        const len = e0 - s0;
        const ns = Math.min(Math.max(s0 + d, 0), dur - len);
        commit(ns, ns + len, 'start');
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      player?.refresh();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const step = (which: 'start' | 'end', delta: number) => {
    if (which === 'start') commit(Math.min(Math.max(srcStart + delta, 0), srcEnd - minSrc), srcEnd, 'start');
    else commit(srcStart, Math.min(Math.max(srcEnd + delta, srcStart + minSrc), dur), 'end');
    player?.refresh();
  };

  const left = (srcStart / dur) * 100;
  const right = (srcEnd / dur) * 100;
  return (
    <div className="panel trim-panel" role="group" aria-label="修剪" data-testid="trim-panel">
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
        <div className="trim-dim" style={{ left: 0, width: `${left}%` }} />
        <div className="trim-dim" style={{ left: `${right}%`, right: 0 }} />
        <div
          className="trim-window"
          data-testid="trim-window"
          style={{ left: `${left}%`, width: `${Math.max(right - left, 0)}%` }}
          onPointerDown={(e) => startDrag(e, 'move')}
        >
          <div
            className="trim-grip left"
            data-testid="trim-grip-left"
            role="slider"
            aria-label="留下的起點"
            aria-valuetext={`第 ${fmt(srcStart)} 秒`}
            onPointerDown={(e) => startDrag(e, 'left')}
          />
          <div
            className="trim-grip right"
            data-testid="trim-grip-right"
            role="slider"
            aria-label="留下的終點"
            aria-valuetext={`第 ${fmt(srcEnd)} 秒`}
            onPointerDown={(e) => startDrag(e, 'right')}
          />
        </div>
      </div>
      <p className="trim-info" data-testid="trim-info">
        第 {fmt(srcStart)} 秒 → 第 {fmt(srcEnd)} 秒，留 <b>{fmt(item.duration)} 秒</b> / 素材共 {fmt(dur)} 秒
      </p>
      <div className="chips trim-steps">
        <button className="chip" onClick={() => step('start', -1)}>
          前面多 1 秒
        </button>
        <button className="chip" onClick={() => step('start', 1)}>
          前面少 1 秒
        </button>
        <button className="chip" onClick={() => step('end', 1)}>
          後面多 1 秒
        </button>
        <button className="chip" onClick={() => step('end', -1)}>
          後面少 1 秒
        </button>
      </div>
      <button className="btn done" onClick={onClose}>
        完成
      </button>
    </div>
  );
}
