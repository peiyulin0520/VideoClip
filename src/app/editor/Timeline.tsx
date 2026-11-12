import { Eye, EyeOff, Film, Layers, Lock, Plus, Type, Volume2, VolumeX } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
} from 'react';
import {
  gapOf,
  isVideoItem,
  itemEnd,
  mainItems,
  moveItem,
  totalDuration,
  trimEnd,
  trimEndFree,
  trimStart,
  trimStartFree,
} from '../../engine/timeline';
import type { Asset, Item, Track, VideoItem } from '../../model/types';
import { useProxyProgress } from '../../engine/proxyQueue';
import { patchTrack, placeItem, removeTrack, shiftTrackLayer } from '../../store/actions';
import { setMainItems, setTrackItems, useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { Sheet } from '../../ui/Sheet';

const MAIN_H = 64;
const ROW_H = 44;
const ROW_GAP = 6;
const RULER_H = 24;
const LONG_PRESS_MS = 400;
export const MIN_PPS = 20;
export const MAX_PPS = 300;

function tickStep(pps: number): number {
  for (const s of [0.5, 1, 2, 5, 10, 30, 60, 120]) if (s * pps >= 64) return s;
  return 300;
}

function Tiles({
  item,
  asset,
  pps,
  h,
}: {
  item: VideoItem;
  asset: Asset | undefined;
  pps: number;
  h: number;
}) {
  const thumbs = asset?.thumbs ?? [];
  // 沒有縮圖（例如 iPhone 匯入時產生不出來）：顯示檔名，不要一片灰
  if (thumbs.length === 0)
    return (
      <div className="tiles no-thumb" data-testid="clip-name">
        {asset?.name ?? ''}
      </div>
    );
  const aspect = asset && asset.height ? asset.width / asset.height : 0.56;
  const tileW = Math.min(Math.max(h * aspect, 30), 114);
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

type Drag =
  | { kind: 'reorder'; id: string; dx: number; target: number }
  | { kind: 'move'; id: string; dx: number; snapX: number | null };

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
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menuTrackId, setMenuTrackId] = useState<string | null>(null);
  const proxyProgress = useProxyProgress((s) => s.progress);

  const total = totalDuration(project);
  const main = mainItems(project);

  // 由上到下顯示（最上層的軌道在最上面），主軌在最底
  const rows = useMemo(() => {
    const list = project.tracks.map((track, index) => ({ track, index })).reverse();
    const heights = list.map((r) => (r.track.kind === 'main' ? MAIN_H : ROW_H));
    return list.map((r, i) => ({
      ...r,
      h: heights[i]!,
      top: RULER_H + ROW_GAP + heights.slice(0, i).reduce((sum, h) => sum + h + ROW_GAP, 0),
    }));
  }, [project.tracks]);
  const contentH = (rows.length ? rows[rows.length - 1]!.top + rows[rows.length - 1]!.h : RULER_H) + 12;

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
    if (Math.abs(el.scrollLeft - lastSet.current) < 1.5) return;
    player?.seek(el.scrollLeft / pps);
  };

  // 雙指縮放時間軸
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

  // ---- 物件：點選 / 長按拖曳（主軌＝排序，其他軌＝移動時間）----
  const startItemGesture = (e: RPointerEvent, item: Item, track: Track) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const isMain = track.kind === 'main';
    const startItems = track.items;
    const idx = startItems.findIndex((x) => x.id === item.id);
    let mode: 'pending' | 'drag' | 'cancelled' = 'pending';
    player?.pause();

    const blockScroll = (ev: TouchEvent) => ev.cancelable && ev.preventDefault();

    // 主軌排序
    const widths = startItems.map((x) => x.duration * pps);
    const lefts = startItems.map((x) => x.start * pps);
    const calcTarget = (dx: number) => {
      const center = lefts[idx]! + widths[idx]! / 2 + dx;
      let target = 0;
      startItems.forEach((_, i) => {
        if (i !== idx && lefts[i]! + widths[i]! / 2 < center) target++;
      });
      return target;
    };

    // 其他軌：移動時間，吸附到 0、播放頭、其他物件的邊緣
    const snapStart = (dx: number): { dx: number; snapX: number | null } => {
      if (!player) return { dx, snapX: null };
      const want = Math.max(item.start + dx / pps, 0);
      const cands = [0, player.time];
      for (const tr of useProjectStore.getState().project!.tracks)
        for (const o of tr.items) if (o.id !== item.id) cands.push(o.start, itemEnd(o));
      const thr = 8 / pps;
      let best: { d: number; at: number; edgeEnd: boolean } | null = null;
      for (const c of cands) {
        for (const [own, edgeEnd] of [[want, false] as const, [want + item.duration, true] as const]) {
          const d = c - own;
          if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: c, edgeEnd };
        }
      }
      if (!best) return { dx: (want - item.start) * pps, snapX: null };
      return { dx: (want + best.d - item.start) * pps, snapX: best.at };
    };

    const timer = setTimeout(() => {
      if (mode !== 'pending' || track.locked) return;
      mode = 'drag';
      window.addEventListener('touchmove', blockScroll, { passive: false });
      setDrag(
        isMain
          ? { kind: 'reorder', id: item.id, dx: 0, target: idx }
          : { kind: 'move', id: item.id, dx: 0, snapX: null },
      );
      navigator.vibrate?.(15);
    }, LONG_PRESS_MS);

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (mode === 'pending' && Math.hypot(dx, ev.clientY - startY) > 8) {
        mode = 'cancelled';
        clearTimeout(timer);
      }
      if (mode !== 'drag') return;
      if (isMain) setDrag({ kind: 'reorder', id: item.id, dx, target: calcTarget(dx) });
      else {
        const s = snapStart(dx);
        setDrag({ kind: 'move', id: item.id, dx: s.dx, snapX: s.snapX });
      }
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
      } else if (mode === 'drag') {
        const dx = ev.clientX - startX;
        setDrag(null);
        if (cancelled) return;
        if (isMain) {
          const target = calcTarget(dx);
          if (target !== idx) setMainItems(moveItem(startItems as VideoItem[], item.id, target));
        } else {
          placeItem(item.id, item.start + snapStart(dx).dx / pps);
        }
      }
    };
    const up = (ev: PointerEvent) => finish(ev, false);
    const cancel = (ev: PointerEvent) => finish(ev, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  // ---- 修剪把手 ----
  const startTrim = (e: RPointerEvent, item: Item, track: Track, side: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();
    player?.pause();
    const startX = e.clientX;
    const startItems = track.items;
    const asset = isVideoItem(item) ? project.assets.find((a) => a.id === item.assetId) : undefined;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const isMain = track.kind === 'main';
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) / pps;
      let next: Item[];
      if (isMain) {
        const list = startItems as VideoItem[];
        next =
          side === 'start'
            ? trimStart(list, item.id, delta)
            : trimEnd(list, item.id, item.duration + delta, asset);
        setMainItems(next as VideoItem[], { coalesce: `trim:${item.id}` });
      } else {
        next =
          side === 'start'
            ? trimStartFree(startItems, item.id, delta)
            : trimEndFree(startItems, item.id, item.duration + delta, asset);
        setTrackItems(track.id, next, { coalesce: `trim:${item.id}` });
      }
      const cur = next.find((x) => x.id === item.id)!;
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

  // 主軌排序的插入位置提示線
  let insertX: number | null = null;
  if (drag?.kind === 'reorder') {
    const others = main.filter((x) => x.id !== drag.id);
    const dur = main.find((x) => x.id === drag.id)?.duration ?? 0;
    insertX =
      half +
      (drag.target >= others.length
        ? total - dur
        : others.slice(0, drag.target).reduce((s, x) => s + gapOf(x) + x.duration, 0)) *
        pps;
  }

  const menuTrack = project.tracks.find((t) => t.id === menuTrackId) ?? null;
  const menuIndex = menuTrack ? project.tracks.indexOf(menuTrack) : -1;
  // 時間軸高度＝全部軌道（不在裡面上下捲；上下交給整頁捲動）
  const viewH = Math.max(contentH, 112);

  return (
    <div className="timeline" style={{ height: viewH, minHeight: viewH }}>
      <div
        className="tl-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={() => player?.pause()}
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.bg)
            useProjectStore.getState().select(null);
        }}
        data-testid="timeline-scroll"
      >
        <div className="tl-content" data-bg="1" style={{ width: half * 2 + total * pps, height: contentH }}>
          <div className="ruler" style={{ height: RULER_H }}>
            {ticks.map((t) => (
              <span key={t} className="tick" style={{ left: half + t * pps }}>
                {Math.floor(t / 60)}:{String(Math.round(t % 60)).padStart(2, '0')}
              </span>
            ))}
          </div>

          {rows.map(({ track, top, h }) => (
            <div
              key={track.id}
              className={`track${track.hidden ? ' off' : ''}`}
              data-testid="track"
              data-kind={track.kind}
              data-bg="1"
              style={{ top, height: h }}
            >
              <button
                className="track-chip"
                aria-label={`${track.name} 軌道設定`}
                data-testid="track-chip"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setMenuTrackId(track.id)}
              >
                {track.kind === 'main' ? (
                  <Film size={16} />
                ) : track.kind === 'text' ? (
                  <Type size={16} />
                ) : (
                  <Layers size={16} />
                )}
                {track.locked ? (
                  <Lock size={11} />
                ) : track.hidden ? (
                  <EyeOff size={11} />
                ) : track.muted ? (
                  <VolumeX size={11} />
                ) : null}
              </button>

              {track.kind === 'main' &&
                (track.items as VideoItem[]).map(
                  (it) =>
                    gapOf(it) > 0 && (
                      <button
                        key={`gap-${it.id}`}
                        className="gap-block"
                        data-testid="gap"
                        data-item-id={it.id}
                        aria-label={`空白 ${gapOf(it).toFixed(1)} 秒`}
                        style={{
                          left: half + (it.start - gapOf(it)) * pps,
                          width: Math.max(gapOf(it) * pps, 4),
                        }}
                        onClick={() => useProjectStore.getState().select(it.id)}
                      >
                        {gapOf(it) * pps > 56 && `空白 ${gapOf(it).toFixed(1)}s`}
                      </button>
                    ),
                )}

              {track.items.map((it) => {
                const asset = isVideoItem(it) ? project.assets.find((a) => a.id === it.assetId) : undefined;
                const selected = it.id === selectedId;
                const dragging = drag?.id === it.id;
                const dx = dragging ? drag!.dx : 0;
                return (
                  <div
                    key={it.id}
                    className={`clip${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${it.type === 'text' ? ' is-text' : ''}${it.duration * pps < 80 ? ' short' : ''}`}
                    data-testid="clip"
                    data-selected={selected}
                    data-item-id={it.id}
                    data-kind={it.type}
                    style={{
                      left: half + it.start * pps,
                      width: Math.max(it.duration * pps, 4),
                      transform: dragging ? `translateX(${dx}px)` : undefined,
                    }}
                    onPointerDown={(e) => startItemGesture(e, it, track)}
                  >
                    {isVideoItem(it) ? <Tiles item={it} asset={asset} pps={pps} h={h} /> : null}
                    <div className="clip-label">
                      {it.type === 'text'
                        ? it.card.runs[0]?.text === ''
                          ? '圖形'
                          : `Aa ${it.card.runs[0]?.text.replace(/\n/g, ' ') ?? ''}`
                        : `${it.type === 'image' ? '照片' : '影片'} ${it.duration.toFixed(1)}s`}
                      {isVideoItem(it) && it.speed !== 1 && ` · ${it.speed}x`}
                      {isVideoItem(it) && it.type === 'video' && it.volume === 0 && ' · 靜音'}
                      {asset && proxyProgress[asset.id] !== undefined && (
                        <span className="proxy-note" data-testid="proxy-note">
                          {' '}
                          · 預覽檔製作中 {Math.round(proxyProgress[asset.id]! * 100)}%
                        </span>
                      )}
                    </div>
                    {selected && !dragging && !track.locked && (
                      <>
                        <div
                          className="handle left"
                          data-testid="trim-start"
                          onPointerDown={(e) => startTrim(e, it, track, 'start')}
                        />
                        <div
                          className="handle right"
                          data-testid="trim-end"
                          onPointerDown={(e) => startTrim(e, it, track, 'end')}
                        />
                      </>
                    )}
                  </div>
                );
              })}

              {track.kind === 'main' && (
                <>
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
                </>
              )}
            </div>
          ))}
          {drag?.kind === 'move' && drag.snapX !== null && (
            <div className="snap-line" style={{ left: half + drag.snapX * pps }} />
          )}
        </div>
      </div>
      <div className="playhead" />

      <Sheet open={!!menuTrack} title={menuTrack?.name ?? ''} onClose={() => setMenuTrackId(null)}>
        {menuTrack && (
          <>
            <button
              className="menu-item"
              onClick={() => {
                patchTrack(menuTrack.id, { hidden: !menuTrack.hidden });
                setMenuTrackId(null);
              }}
            >
              {menuTrack.hidden ? <Eye size={20} /> : <EyeOff size={20} />}
              {menuTrack.hidden ? '顯示這條軌道' : '隱藏這條軌道'}
            </button>
            <button
              className="menu-item"
              onClick={() => {
                patchTrack(menuTrack.id, { locked: !menuTrack.locked });
                setMenuTrackId(null);
              }}
            >
              <Lock size={20} /> {menuTrack.locked ? '解除鎖定' : '鎖定（不能選取、移動）'}
            </button>
            {menuTrack.kind !== 'text' && (
              <button
                className="menu-item"
                onClick={() => {
                  patchTrack(menuTrack.id, { muted: !menuTrack.muted });
                  setMenuTrackId(null);
                }}
              >
                {menuTrack.muted ? <Volume2 size={20} /> : <VolumeX size={20} />}
                {menuTrack.muted ? '取消靜音' : '這條軌道靜音'}
              </button>
            )}
            {menuTrack.kind !== 'main' && (
              <>
                <button
                  className="menu-item"
                  onClick={() => {
                    if (menuIndex >= project.tracks.length - 1) toast('已經在最上層');
                    else shiftTrackLayer(menuTrack.id, 1);
                    setMenuTrackId(null);
                  }}
                >
                  ▲ 往上一層
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    if (menuIndex <= 1) toast('不能放到主軌下面');
                    else shiftTrackLayer(menuTrack.id, -1);
                    setMenuTrackId(null);
                  }}
                >
                  ▼ 往下一層
                </button>
                <button
                  className="menu-item danger"
                  onClick={() => {
                    removeTrack(menuTrack.id);
                    setMenuTrackId(null);
                  }}
                >
                  刪除這條軌道（含裡面的物件）
                </button>
              </>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
