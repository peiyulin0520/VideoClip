import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from 'react';
import { Plus } from 'lucide-react';
import { mainTrack, moveItem, totalDuration, trimEnd, trimStart } from '../../engine/timeline';
import type { Asset, VideoItem } from '../../model/types';
import { setMainItems, useProjectStore } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';

const TRACK_H = 64;
const RULER_H = 24;
const LONG_PRESS_MS = 400;
export const MIN_PPS = 20;
export const MAX_PPS = 300;

function tickStep(pps: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 30, 60, 120]) if (s * pps >= 64) return s;
  return 300;
}

function Tiles({ item, asset, pps }: { item: VideoItem; asset: Asset | undefined; pps: number }) {
  const thumbs = asset?.thumbs ?? [];
  if (thumbs.length === 0) return <div className="tiles" />;
  const aspect = asset && asset.height ? asset.width / asset.height : 0.56;
  const tileW = Math.min(Math.max(TRACK_H * aspect, 36), 114);
  const widthPx = item.duration * pps;
  const count = Math.min(Math.ceil(widthPx / tileW), 120);
  return (
    <div className="tiles">
      {Array.from({ length: count }, (_, i) => {
        const x = (i + 0.5) * tileW;
        const srcT = item.trimIn + (x / pps) * item.speed;
        const idx =
          item.type === 'image' || !asset || asset.duration <= 0
            ? 0
            : Math.min(Math.floor((srcT / asset.duration) * thumbs.length), thumbs.length - 1);
        return <span key={i} style={{ width: tileW, backgroundImage: `url(${thumbs[Math.max(idx, 0)]})` }} />;
      })}
    </div>
  );
}

type Reorder = { id: string; dx: number; target: number };

export function Timeline({
  pps,
  setPps,
  onAdd,
}: {
  pps: number;
  setPps: (v: number) => void;
  onAdd: () => void;
}) {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSet = useRef(-100);
  const [half, setHalf] = useState(180);
  const [reorder, setReorder] = useState<Reorder | null>(null);

  const items = mainTrack(project).items;
  const total = totalDuration(project);

  // 容器寬度的一半 = 播放頭位置（播放頭固定在中間，時間軸在下面捲動）
  useLayoutEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setHalf(el.clientWidth / 2));
    ro.observe(el);
    setHalf(el.clientWidth / 2);
    return () => ro.disconnect();
  }, []);

  const syncScroll = useCallback(
    (t: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const target = t * pps;
      if (Math.abs(el.scrollLeft - target) >= 0.5) {
        lastSet.current = target;
        el.scrollLeft = target;
      }
    },
    [pps],
  );

  useLayoutEffect(() => {
    if (player) syncScroll(player.time);
  }, [player, total, pps, half, syncScroll]);

  useEffect(() => {
    if (!player) return;
    return player.subscribe((t) => syncScroll(t));
  }, [player, syncScroll]);

  const onScroll = () => {
    const el = scrollRef.current!;
    if (Math.abs(el.scrollLeft - lastSet.current) < 1.5) return; // 自己設定的捲動
    player?.seek(el.scrollLeft / pps);
  };

  // 雙指縮放時間軸（touch-action: pan-x 讓瀏覽器不搶雙指手勢）
  useEffect(() => {
    const el = scrollRef.current!;
    let startDist = 0;
    let startPps = pps;
    const dist = (e: TouchEvent) =>
      Math.hypot(
        e.touches[0]!.clientX - e.touches[1]!.clientX,
        e.touches[0]!.clientY - e.touches[1]!.clientY,
      );
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e);
        startPps = pps;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        setPps(Math.min(Math.max((startPps * dist(e)) / startDist, MIN_PPS), MAX_PPS));
      }
    };
    const onEnd = () => (startDist = 0);
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setPps(Math.min(Math.max(pps * (e.deltaY < 0 ? 1.15 : 0.87), MIN_PPS), MAX_PPS));
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, [pps, setPps]);

  // ---- 片段：點選 / 長按拖曳排序 ----
  const startClipGesture = (e: RPointerEvent, item: VideoItem) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startItems = items;
    const idx = startItems.findIndex((x) => x.id === item.id);
    const widths = startItems.map((x) => x.duration * pps);
    let mode: 'pending' | 'reorder' | 'cancelled' = 'pending';
    player?.pause();

    const blockScroll = (ev: TouchEvent) => ev.cancelable && ev.preventDefault();
    const calcTarget = (dx: number) => {
      const lefts = startItems.map((x) => x.start * pps);
      const center = lefts[idx]! + widths[idx]! / 2 + dx;
      let target = 0;
      startItems.forEach((_, i) => {
        if (i !== idx && lefts[i]! + widths[i]! / 2 < center) target++;
      });
      return target;
    };

    const timer = setTimeout(() => {
      if (mode !== 'pending') return;
      mode = 'reorder';
      window.addEventListener('touchmove', blockScroll, { passive: false });
      setReorder({ id: item.id, dx: 0, target: idx });
      navigator.vibrate?.(15);
    }, LONG_PRESS_MS);

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (mode === 'pending' && Math.hypot(dx, ev.clientY - startY) > 8) {
        mode = 'cancelled';
        clearTimeout(timer);
      }
      if (mode === 'reorder') setReorder({ id: item.id, dx, target: calcTarget(dx) });
    };
    const finish = (ev: PointerEvent, cancelled: boolean) => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', blockScroll);
      if (mode === 'pending' && !cancelled) {
        useProjectStore.getState().select(item.id);
        player?.seek(Math.max(item.start, Math.min(player.time, item.start + item.duration - 0.01)));
      } else if (mode === 'reorder') {
        const target = calcTarget(ev.clientX - startX);
        setReorder(null);
        if (!cancelled && target !== idx) setMainItems(moveItem(startItems, item.id, target));
      }
    };
    const up = (ev: PointerEvent) => finish(ev, false);
    const cancel = (ev: PointerEvent) => finish(ev, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  // ---- 修剪把手 ----
  const startTrim = (e: RPointerEvent, item: VideoItem, side: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();
    player?.pause();
    const startX = e.clientX;
    const startItems = items;
    const asset = project.assets.find((a) => a.id === item.assetId);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) / pps;
      const next =
        side === 'start'
          ? trimStart(startItems, item.id, delta)
          : trimEnd(startItems, item.id, item.duration + delta, asset);
      setMainItems(next, { coalesce: `trim:${item.id}` });
      const cur = next.find((x) => x.id === item.id)!;
      // 預覽正在修剪的那一邊的畫格（不移動播放頭，免得手指下的把手跑掉）
      player?.peek(side === 'start' ? cur.start : cur.start + cur.duration - 0.05);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      player?.refresh();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const ticks: number[] = [];
  const step = tickStep(pps);
  for (let t = 0; t <= total + 1e-6; t += step) ticks.push(t);

  // 排序中的插入位置提示線
  let insertX: number | null = null;
  if (reorder) {
    const others = items.filter((x) => x.id !== reorder.id);
    insertX =
      half +
      (reorder.target >= others.length
        ? total - (items.find((x) => x.id === reorder.id)?.duration ?? 0)
        : others.slice(0, reorder.target).reduce((s, x) => s + x.duration, 0)) *
        pps;
  }

  return (
    <div className="timeline">
      <div
        className="tl-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={() => player?.pause()}
        data-testid="timeline-scroll"
      >
        <div className="tl-content" style={{ width: half * 2 + total * pps, height: RULER_H + TRACK_H + 12 }}>
          <div className="ruler" style={{ height: RULER_H }}>
            {ticks.map((t) => (
              <span key={t} className="tick" style={{ left: half + t * pps }}>
                {Math.floor(t / 60)}:{String(Math.round(t % 60)).padStart(2, '0')}
              </span>
            ))}
          </div>
          <div className="track" style={{ top: RULER_H + 6, height: TRACK_H }}>
            {items.map((it) => {
              const asset = project.assets.find((a) => a.id === it.assetId);
              const selected = it.id === selectedId;
              const dragging = reorder?.id === it.id;
              return (
                <div
                  key={it.id}
                  className={`clip${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}`}
                  data-testid="clip"
                  data-selected={selected}
                  data-item-id={it.id}
                  style={{
                    left: half + it.start * pps,
                    width: Math.max(it.duration * pps, 4),
                    transform: dragging ? `translateX(${reorder!.dx}px)` : undefined,
                  }}
                  onPointerDown={(e) => startClipGesture(e, it)}
                >
                  <Tiles item={it} asset={asset} pps={pps} />
                  <div className="clip-label">
                    {it.type === 'image' ? '照片' : '影片'} {it.duration.toFixed(1)}s
                    {it.speed !== 1 && ` · ${it.speed}x`}
                    {it.type === 'video' && it.volume === 0 && ' · 靜音'}
                  </div>
                  {selected && !dragging && (
                    <>
                      <div
                        className="handle left"
                        data-testid="trim-start"
                        onPointerDown={(e) => startTrim(e, it, 'start')}
                      />
                      <div
                        className="handle right"
                        data-testid="trim-end"
                        onPointerDown={(e) => startTrim(e, it, 'end')}
                      />
                    </>
                  )}
                </div>
              );
            })}
            {insertX !== null && <div className="insert-line" style={{ left: insertX }} />}
            <button
              className="add-clip"
              aria-label="加入素材"
              style={{ left: half + total * pps + 8 }}
              onClick={onAdd}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Plus size={22} />
            </button>
          </div>
        </div>
      </div>
      <div className="playhead" />
    </div>
  );
}
