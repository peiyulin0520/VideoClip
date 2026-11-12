import { Eye, EyeOff, Film, Lock, Music, Plus, Sparkles, Type, Volume2, VolumeX } from 'lucide-react';
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
  baseMediaTrack,
  isVideoItem,
  itemEnd,
  totalDuration,
  trimEndFree,
  trimStartFree,
  ZONE,
} from '../../engine/timeline';
import type { Asset, Item, Track, VideoItem } from '../../model/types';
import { useProxyProgress } from '../../engine/proxyQueue';
import { Wave } from './Wave';
import {
  closeGap,
  moveTrackTo,
  patchTrack,
  placeItem,
  removeTrack,
  shiftTrackLayer,
} from '../../store/actions';
import { setTrackItems, useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { Sheet } from '../../ui/Sheet';

const BASE_H = 64; // 最下面那條影像軌高一點，縮圖看得清楚
const GAP_MIN = 0.1; // 小於這個秒數的空位不畫
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

/** 同一軌物件之間的空位（時間軸上畫虛線框）；最下面那條影像軌連「開頭」的空位也算（開場留白） */
function gapsOf(items: Item[], includeLeading: boolean): { start: number; len: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const out: { start: number; len: number }[] = [];
  let end = 0;
  sorted.forEach((it, i) => {
    const len = it.start - end;
    if (len >= GAP_MIN && (i > 0 || includeLeading)) out.push({ start: end, len });
    end = Math.max(end, it.start + it.duration);
  });
  return out;
}

type Drag = { kind: 'move'; id: string; dx: number; snapX: number | null };

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
  // 拖軌道圖示換圖層順序：rowIndex＝顯示的第幾列（0＝最上面）、dy＝手指移動的距離
  const [trackDrag, setTrackDrag] = useState<{ id: string; from: number; dy: number } | null>(null);
  const suppressChipClick = useRef(false);

  const total = totalDuration(project);
  const baseId = baseMediaTrack(project)?.id;
  const [gapSel, setGapSel] = useState<{ trackId: string; at: number } | null>(null);

  // 由上到下顯示：字卡 → 特效 → 影像（最上層的軌道在最上面），音訊沒有畫面，畫在最下面、跟上面隔一小段
  const rows = useMemo(() => {
    const all = project.tracks.map((track, index) => ({ track, index })).reverse();
    const list = [...all.filter((r) => r.track.kind !== 'audio'), ...all.filter((r) => r.track.kind === 'audio')];
    const heights = list.map((r) => (r.track.id === baseId ? BASE_H : ROW_H));
    let y = RULER_H + ROW_GAP;
    return list.map((r, i) => {
      if (i > 0 && r.track.kind === 'audio' && list[i - 1]!.track.kind !== 'audio') y += ROW_GAP * 2;
      const top = y;
      y += heights[i]! + ROW_GAP;
      return { ...r, h: heights[i]!, top };
    });
  }, [project.tracks, baseId]);
  // 拖到的位置（顯示列）：只跟同一區（同種類）的列比；不能跨區
  const dropRow = (from: number, dy: number): number => {
    const me = rows[from];
    if (!me) return from;
    const center = me.top + me.h / 2 + dy;
    const zone = ZONE[me.track.kind];
    const same = rows.map((r, i) => ({ r, i })).filter((x) => ZONE[x.r.track.kind] === zone);
    let to = same[0]!.i;
    for (const { r, i } of same) if (i !== from && r.top + r.h / 2 < center) to++;
    return Math.min(to, same[same.length - 1]!.i);
  };

  const startTrackDrag = (e: RPointerEvent, trackId: string, from: number) => {
    e.stopPropagation();
    const startY = e.clientY;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let dragging = false;
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!dragging && Math.abs(dy) > 8) {
        dragging = true;
        player?.pause();
        navigator.vibrate?.(10);
      }
      if (dragging) setTrackDrag({ id: trackId, from, dy });
    };
    const end = (ev: PointerEvent, cancelled: boolean) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      if (!dragging) return;
      suppressChipClick.current = true; // 拖完不要又開選單
      setTimeout(() => (suppressChipClick.current = false), 0);
      setTrackDrag(null);
      if (cancelled) return;
      const to = dropRow(from, ev.clientY - startY);
      if (to !== from) moveTrackTo(trackId, rows[to]!.index); // 顯示列 → 軌道在陣列裡的位置（同一區內）
    };
    const up = (ev: PointerEvent) => end(ev, false);
    const cancel = (ev: PointerEvent) => end(ev, true);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  };

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

  // ---- 物件：點選 / 長按拖曳（所有軌道都一樣：移動時間）----
  const startItemGesture = (e: RPointerEvent, item: Item, track: Track) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let mode: 'pending' | 'drag' | 'cancelled' = 'pending';
    player?.pause();

    const blockScroll = (ev: TouchEvent) => ev.cancelable && ev.preventDefault();

    // 移動時間，吸附到 0、播放頭、其他物件的邊緣
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
      setDrag({ kind: 'move', id: item.id, dx: 0, snapX: null });
      navigator.vibrate?.(15);
    }, LONG_PRESS_MS);

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (mode === 'pending' && Math.hypot(dx, ev.clientY - startY) > 8) {
        mode = 'cancelled';
        clearTimeout(timer);
      }
      if (mode !== 'drag') return;
      const s = snapStart(dx);
      setDrag({ kind: 'move', id: item.id, dx: s.dx, snapX: s.snapX });
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
        placeItem(item.id, item.start + snapStart(dx).dx / pps);
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
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) / pps;
      const next =
        side === 'start'
          ? trimStartFree(startItems, item.id, delta)
          : trimEndFree(startItems, item.id, item.duration + delta, asset);
      setTrackItems(track.id, next, { coalesce: `trim:${item.id}` });
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

          {rows.map(({ track, top, h }, rowIdx) => {
            // 拖軌道時：被拖的那列跟著手指，中間經過的列讓位
            let shift = 0;
            const isDragged = trackDrag?.id === track.id;
            if (trackDrag) {
              const to = dropRow(trackDrag.from, trackDrag.dy);
              const dh = rows[trackDrag.from]!.h + ROW_GAP;
              if (isDragged) shift = trackDrag.dy;
              else if (trackDrag.from < to && rowIdx > trackDrag.from && rowIdx <= to) shift = -dh;
              else if (trackDrag.from > to && rowIdx >= to && rowIdx < trackDrag.from) shift = dh;
            }
            return (
              <div
                key={track.id}
                className={`track${track.hidden ? ' off' : ''}${isDragged ? ' track-dragging' : ''}`}
                data-testid="track"
                data-kind={track.kind}
                data-track-id={track.id}
                data-bg="1"
                style={{
                  top,
                  height: h,
                  transform: shift ? `translateY(${shift}px)` : undefined,
                  transition: trackDrag && !isDragged ? 'transform 120ms' : undefined,
                }}
              >
                <button
                  className="track-chip draggable"
                  aria-label={`${track.name} 軌道設定`}
                  data-testid="track-chip"
                  onPointerDown={(e) => startTrackDrag(e, track.id, rowIdx)}
                  onClick={() => {
                    if (!suppressChipClick.current) setMenuTrackId(track.id);
                  }}
                >
                  {track.kind === 'media' ? (
                    <Film size={16} />
                  ) : track.kind === 'text' ? (
                    <Type size={16} />
                  ) : track.kind === 'audio' ? (
                    <Music size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {track.locked ? (
                    <Lock size={11} />
                  ) : track.hidden ? (
                    <EyeOff size={11} />
                  ) : track.muted ? (
                    <VolumeX size={11} />
                  ) : null}
                </button>

                {track.kind === 'media' &&
                  gapsOf(track.items, track.id === baseId).map((g) => {
                    const sel = gapSel?.trackId === track.id && Math.abs(gapSel.at - g.start) < 1e-6;
                    return (
                      <button
                        key={`gap-${g.start}`}
                        className={`gap-block${sel ? ' sel' : ''}`}
                        data-testid="gap"
                        aria-label={sel ? `補齊空白 ${g.len.toFixed(1)} 秒` : `空白 ${g.len.toFixed(1)} 秒`}
                        style={{ left: half + g.start * pps, width: Math.max(g.len * pps, 4) }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          // 第一下選取（顯示「補齊」），第二下才真的補齊，避免誤觸
                          if (!sel) return setGapSel({ trackId: track.id, at: g.start });
                          closeGap(track.id, g.start, g.start + g.len);
                          setGapSel(null);
                        }}
                      >
                        {sel ? '補齊' : g.len * pps > 56 && `空白 ${g.len.toFixed(1)}s`}
                      </button>
                    );
                  })}

                {track.items.map((it) => {
                  const asset = isVideoItem(it) ? project.assets.find((a) => a.id === it.assetId) : undefined;
                  const selected = it.id === selectedId;
                  const dragging = drag?.id === it.id;
                  const dx = dragging ? drag!.dx : 0;
                  return (
                    <div
                      key={it.id}
                      className={`clip${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${it.type === 'text' ? ' is-text' : ''}${it.type === 'audio' ? ' is-audio' : ''}${it.duration * pps < 80 ? ' short' : ''}`}
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
                      {it.type === 'audio' ? (
                        <Wave wave={asset?.wave} from={it.trimIn} to={it.trimIn + it.duration} />
                      ) : isVideoItem(it) ? (
                        <Tiles item={it} asset={asset} pps={pps} h={h} />
                      ) : null}
                      <div className="clip-label">
                        {it.type === 'text'
                          ? it.card.runs[0]?.text === ''
                            ? '圖形'
                            : `Aa ${it.card.runs[0]?.text.replace(/\n/g, ' ') ?? ''}`
                          : it.type === 'audio'
                            ? `♪ ${asset?.name ?? '音樂'} ${it.duration.toFixed(1)}s`
                            : `${it.type === 'image' ? '照片' : '影片'} ${it.duration.toFixed(1)}s`}
                        {isVideoItem(it) && it.speed !== 1 && ` · ${it.speed}x`}
                        {isVideoItem(it) && it.type !== 'image' && it.volume === 0 && ' · 靜音'}
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

                {track.id === baseId && (
                  <button
                    className="add-clip"
                    aria-label="加入素材"
                    style={{ left: half + total * pps + 8 }}
                    onClick={onAdd}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Plus size={22} />
                  </button>
                )}
              </div>
            );
          })}
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
            {(
              <>
                {menuTrack.kind !== 'audio' && (
                  <>
                    <button
                      className="menu-item"
                      onClick={() => {
                        if (project.tracks[menuIndex + 1]?.kind !== menuTrack.kind)
                          toast('已經是這一類最上面的軌道（影像、特效、字卡不能互相穿插）');
                        else shiftTrackLayer(menuTrack.id, 1);
                        setMenuTrackId(null);
                      }}
                    >
                      ▲ 往上一層
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        if (project.tracks[menuIndex - 1]?.kind !== menuTrack.kind)
                          toast('已經是這一類最下面的軌道（影像、特效、字卡不能互相穿插）');
                        else shiftTrackLayer(menuTrack.id, -1);
                        setMenuTrackId(null);
                      }}
                    >
                      ▼ 往下一層
                    </button>
                  </>
                )}
                {!(menuTrack.kind === 'media' && project.tracks.filter((t) => t.kind === 'media').length <= 1) && (
                  <button
                    className="menu-item danger"
                    onClick={() => {
                      removeTrack(menuTrack.id);
                      setMenuTrackId(null);
                    }}
                  >
                    刪除這條軌道（含裡面的物件）
                  </button>
                )}
              </>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
