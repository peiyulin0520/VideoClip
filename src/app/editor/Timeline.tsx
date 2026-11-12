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
  dropTarget,
  isVideoItem,
  itemEnd,
  KIND_LABEL,
  totalDuration,
  trackKindOf,
  trimEndFree,
  trimStartFree,
  ZONE,
  type DropTarget,
} from '../../engine/timeline';
import type { Asset, Item, Track, TrackKind, VideoItem } from '../../model/types';
import { useProxyProgress } from '../../engine/proxyQueue';
import { Wave } from './Wave';
import {
  closeGap,
  moveItemTo,
  moveTrackTo,
  patchTrack,
  placeItem,
  removeTrack,
  setGroupDuration,
  shiftTrackLayer,
} from '../../store/actions';
import { setTrackItems, useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { Sheet } from '../../ui/Sheet';
import { PromptSheet } from '../../ui/PromptSheet';
import { itemTitle, ordinalIn } from '../../engine/labels';
import { seamsOf, transitionCode, transitionName } from '../../engine/transitions';
import { renameItem } from '../../store/actions';

const BASE_H = 44; // 最下面那條影像軌（主要影片）高一點，縮圖與兩行名稱看得清楚
const SLOT_H = 26; // 拖素材時，同一區上下各多出一條「＋ 新增一軌」的放置區
const GAP_MIN = 0.1; // 小於這個秒數的空位不畫
const ROW_H = 32; // 其他軌道：細一點（2026-11-12 使用者：拖拉軸再細一些）
const SUM_H = 20; // 收合時每一類縮成的摘要列
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

const EXPANDED_KEY = 'vc-tl-expanded';
const readExpanded = () => {
  try {
    return localStorage.getItem(EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
};
const KIND_NAME: Record<TrackKind, string> = { media: '影像', effect: '特效', text: '字卡', audio: '音訊' };
const KIND_BAR: Record<TrackKind, string> = {
  media: 'var(--clip)',
  effect: 'var(--clip-effect)',
  text: 'var(--clip-text)',
  audio: 'var(--clip-audio)',
};

type Hover = { trackId: string | null; newEdge: 'top' | 'bottom' | null };
type Drag = {
  kind: 'move';
  id: string;
  dx: number;
  dy: number;
  snapX: number | null;
  hover: Hover;
  target: DropTarget | null;
  /** 拖起來那一刻，來源軌道那一列的位置（出現放置區後版面會往下推，片段要補償，才會一直在手指底下） */
  startTop: number;
};

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
  const lastTap = useRef<{ id: string; t: number } | null>(null);

  const total = totalDuration(project);
  const baseId = baseMediaTrack(project)?.id;
  const [gapSel, setGapSel] = useState<{ trackId: string; at: number } | null>(null);
  // 收合：預設只看最下面那條影像軌，其他每一類縮成一條摘要列；按「圖層」展開全部（記在這台手機）
  const [expanded, setExpanded] = useState(readExpanded);
  const [openZones, setOpenZones] = useState<TrackKind[]>([]);
  const [renameTrackId, setRenameTrackId] = useState<string | null>(null);
  const [renameItemId, setRenameItemId] = useState<string | null>(null);
  const toggleExpanded = () => {
    const v = !expanded;
    setExpanded(v);
    setOpenZones([]);
    try {
      localStorage.setItem(EXPANDED_KEY, v ? '1' : '0');
    } catch {
      /* 存不了就只換這一次 */
    }
  };
  const selectedTrackId = project.tracks.find((t) => t.items.some((x) => x.id === selectedId))?.id;

  // 由上到下顯示：字卡 → 特效 → 影像（最上層的軌道在最上面），音訊沒有畫面，畫在最下面、跟上面隔一小段。
  // 拖素材時（slotZone），那個素材所屬的區上下各多出一條「＋ 新增一軌」的放置區
  const draggedItem = drag ? project.tracks.flatMap((t) => t.items).find((x) => x.id === drag.id) : undefined;
  const slotZone = draggedItem ? ZONE[trackKindOf(draggedItem)] : null;
  const showAll = expanded || !!drag; // 拖素材的時候全部展開（才找得到要放的軌道）
  const layout = useMemo(() => {
    // 版型的各格軌道藏起來（時間軸上由外框那一條代表整個版型）
    const all = project.tracks
      .map((track, index) => ({ track, index }))
      .filter((r) => r.track.groupRole !== 'cell')
      .reverse();
    const list = [
      ...all.filter((r) => r.track.kind !== 'audio'),
      ...all.filter((r) => r.track.kind === 'audio'),
    ];
    const shown = (r: (typeof list)[number]) =>
      showAll || r.track.id === baseId || r.track.id === selectedTrackId || openZones.includes(r.track.kind);
    // 收合時，連續幾條不顯示的同種類軌道合成一條摘要列
    type Entry =
      { type: 'track'; r: (typeof list)[number] } | { type: 'summary'; kind: TrackKind; tracks: Track[] };
    const entries: Entry[] = [];
    for (const r of list) {
      if (shown(r)) entries.push({ type: 'track', r });
      else {
        const last = entries[entries.length - 1];
        if (last?.type === 'summary' && last.kind === r.track.kind) last.tracks.push(r.track);
        else entries.push({ type: 'summary', kind: r.track.kind, tracks: [r.track] });
      }
    }
    const slots: { edge: 'top' | 'bottom'; top: number }[] = [];
    const summaries: { kind: TrackKind; tracks: Track[]; top: number }[] = [];
    const rows: { track: Track; index: number; h: number; top: number }[] = [];
    let y = RULER_H + ROW_GAP;
    entries.forEach((e, i) => {
      const kind = e.type === 'track' ? e.r.track.kind : e.kind;
      const z = ZONE[kind];
      const prev = entries[i - 1];
      const prevKind = prev ? (prev.type === 'track' ? prev.r.track.kind : prev.kind) : undefined;
      const next = entries[i + 1];
      const nextKind = next ? (next.type === 'track' ? next.r.track.kind : next.kind) : undefined;
      if (i > 0 && kind === 'audio' && prevKind !== 'audio') y += ROW_GAP * 2;
      if (e.type === 'summary') {
        summaries.push({ kind: e.kind, tracks: e.tracks, top: y });
        y += SUM_H + ROW_GAP;
        return;
      }
      if (slotZone === z && (prevKind === undefined || ZONE[prevKind] !== z)) {
        slots.push({ edge: 'top', top: y });
        y += SLOT_H + ROW_GAP;
      }
      const h = e.r.track.id === baseId ? BASE_H : ROW_H;
      rows.push({ ...e.r, h, top: y });
      y += h + ROW_GAP;
      if (slotZone === z && (nextKind === undefined || ZONE[nextKind] !== z)) {
        slots.push({ edge: 'bottom', top: y });
        y += SLOT_H + ROW_GAP;
      }
    });
    return { rows, slots, summaries, end: y - ROW_GAP };
  }, [project.tracks, baseId, slotZone, showAll, selectedTrackId, openZones]);
  const rows = layout.rows;
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout; // 拖素材的事件處理要讀最新的版面（含放置區）
  });
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

  const contentEnd = Math.max(layout.end, RULER_H, ...layout.slots.map((sl) => sl.top + SLOT_H));
  const contentH = contentEnd + 12;

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

    // 手指現在在哪一條軌道／哪個「＋ 新增一軌」放置區（用時間軸內容的座標比對目前的版面）
    const hoverAt = (clientY: number): Hover => {
      const el = scrollRef.current;
      if (!el) return { trackId: null, newEdge: null };
      const y = clientY - el.getBoundingClientRect().top + el.scrollTop;
      const lay = layoutRef.current;
      for (const sl of lay.slots)
        if (y >= sl.top && y < sl.top + SLOT_H) return { trackId: null, newEdge: sl.edge };
      for (const r of lay.rows)
        if (y >= r.top - ROW_GAP / 2 && y < r.top + r.h + ROW_GAP / 2)
          return { trackId: r.track.id, newEdge: null };
      return { trackId: null, newEdge: null };
    };
    const targetFor = (hover: Hover): DropTarget | null =>
      dropTarget(useProjectStore.getState().project!.tracks, item, hover);
    // 剛拖起來時版面會多出放置區、把列往下推：手指上下移動不到 12px 都當作還在原本的軌道上（只是左右移動時間）
    const resolveHover = (clientY: number): Hover =>
      Math.abs(clientY - startY) < 12 ? { trackId: track.id, newEdge: null } : hoverAt(clientY);
    const startTop = layoutRef.current.rows.find((r) => r.track.id === track.id)?.top ?? 0;

    const timer = setTimeout(() => {
      if (mode !== 'pending' || track.locked) return;
      mode = 'drag';
      window.addEventListener('touchmove', blockScroll, { passive: false });
      const hover = { trackId: track.id, newEdge: null };
      setDrag({
        kind: 'move',
        id: item.id,
        dx: 0,
        dy: 0,
        snapX: null,
        hover,
        target: targetFor(hover),
        startTop,
      });
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
      const hover = resolveHover(ev.clientY);
      setDrag({
        kind: 'move',
        id: item.id,
        dx: s.dx,
        dy: ev.clientY - startY,
        snapX: s.snapX,
        hover,
        target: targetFor(hover),
        startTop,
      });
    };
    const finish = (ev: PointerEvent, cancelled: boolean) => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', blockScroll);
      if (mode === 'pending' && !cancelled) {
        // 連點兩下同一個片段＝命名（自己判斷：iPhone 的觸控不一定會送 dblclick）
        const now = performance.now();
        const lt = lastTap.current;
        if (lt && lt.id === item.id && now - lt.t < 400 && !track.locked) {
          lastTap.current = null;
          // 面板晚一點才出現：手指放開後瀏覽器還會補送一個 click，面板一出現就被背景吃掉關閉
          setTimeout(() => setRenameItemId(item.id), 300);
        } else lastTap.current = { id: item.id, t: now };
        useProjectStore.getState().select(item.id);
        player?.seek(Math.max(item.start, Math.min(player.time, item.start + item.duration - 0.01)));
      } else if (mode === 'drag') {
        const dx = ev.clientX - startX;
        setDrag(null);
        if (cancelled) return;
        const start = item.start + snapStart(dx).dx / pps;
        const target = targetFor(resolveHover(ev.clientY));
        if (
          !target ||
          (target.type === 'track' && target.trackId === track.id) ||
          track.groupRole === 'frame'
        )
          placeItem(item.id, start); // 版型只能左右移動（換時間），不換軌道
        else if (target.type === 'invalid')
          toast(`${KIND_LABEL[target.kind]}只能放在${KIND_LABEL[target.kind]}的軌道上，已放回原位`);
        else moveItemTo(item.id, target, start);
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
      if (track.groupRole === 'frame' && isVideoItem(item) && item.group) {
        // 版型：改整組的長度（各格超出的部分切掉）
        setGroupDuration(item.group, item.duration + delta, { coalesce: `trim:${item.id}` });
        player?.peek(item.start + Math.max(item.duration + delta, 0.5) - 0.05);
        return;
      }
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

  /** 拖素材時，每一列的樣子：放得進去的亮起來、不同種類的變灰 */
  const dropClass = (track: Track): string => {
    if (!drag || !draggedItem) return '';
    if (track.kind !== trackKindOf(draggedItem)) return ' drop-bad';
    return drag.hover.trackId === track.id ? ' drop-ok' : '';
  };

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
            <button
              className="layers-toggle"
              aria-label="圖層清單"
              aria-expanded={expanded}
              data-testid="layers-toggle"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleExpanded}
            >
              {expanded ? '▴' : '▾'} 圖層（{project.tracks.length}）
            </button>
            {ticks.map((t) => (
              <span key={t} className="tick" style={{ left: half + t * pps }}>
                {Math.floor(t / 60)}:{String(Math.round(t % 60)).padStart(2, '0')}
              </span>
            ))}
          </div>

          {layout.slots.map((sl) => (
            <div
              key={sl.edge}
              className={`new-slot${drag?.target?.type === 'new' && drag.target.edge === sl.edge ? ' hot' : ''}`}
              data-testid="new-track-slot"
              data-edge={sl.edge}
              style={{ top: sl.top, height: SLOT_H }}
            >
              ＋ 新增一軌
            </div>
          ))}
          {layout.summaries.map((sm) => {
            const hidden = sm.tracks.filter((t) => t.hidden).length;
            const count = sm.tracks.reduce((n, t) => n + t.items.length, 0);
            return (
              <div
                key={`${sm.kind}-${sm.tracks[0]!.id}`}
                className="track-summary"
                data-testid="track-summary"
                data-kind={sm.kind}
                data-bg="1"
                style={{ top: sm.top, height: SUM_H }}
              >
                {sm.tracks.flatMap((t) =>
                  t.hidden
                    ? []
                    : t.items.map((it) => (
                        <i
                          key={it.id}
                          className="sum-bar"
                          style={{
                            left: half + it.start * pps,
                            width: Math.max(it.duration * pps, 3),
                            background: KIND_BAR[sm.kind],
                          }}
                        />
                      )),
                )}
                <button
                  className="sum-label"
                  aria-label={`展開${KIND_NAME[sm.kind]}（${count} 個）`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setOpenZones((z) => [...z, sm.kind])}
                >
                  {KIND_NAME[sm.kind]}×{count}
                  {hidden > 0 && `（${hidden} 條隱藏）`}
                </button>
              </div>
            );
          })}
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
                className={`track${track.hidden ? ' off' : ''}${isDragged ? ' track-dragging' : ''}${h >= BASE_H ? ' tall' : ''}${dropClass(track)}`}
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
                  const dy = dragging ? drag!.dy - (top - drag!.startTop) : 0; // 放置區把列往下推時補償回來
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
                        transform: dragging ? `translate(${dx}px, ${dy}px)` : undefined,
                      }}
                      onPointerDown={(e) => startItemGesture(e, it, track)}
                    >
                      {it.type === 'audio' ? (
                        <Wave wave={asset?.wave} from={it.trimIn} to={it.trimIn + it.duration} />
                      ) : isVideoItem(it) ? (
                        <Tiles item={it} asset={asset} pps={pps} h={h} />
                      ) : null}
                      <div className="clip-label">
                        {it.type === 'text' || it.type === 'audio' ? (
                          <span className="cl-name">{itemTitle(it, asset)}</span>
                        ) : (
                          <span className="cl-name">
                            {ordinalIn(track.items, it.id)} {itemTitle(it, asset)}
                          </span>
                        )}
                        {it.type !== 'text' && <span className="cl-dur"> {it.duration.toFixed(1)}s</span>}
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
                          {track.groupRole !== 'frame' && (
                            <div
                              className="handle left"
                              data-testid="trim-start"
                              onPointerDown={(e) => startTrim(e, it, track, 'start')}
                            />
                          )}
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

                {track.kind === 'media' &&
                  !track.groupRole &&
                  seamsOf(track.items).map(({ next }) => {
                    const sel = next.id === selectedId;
                    const tr = next.transitionIn;
                    return (
                      <button
                        key={`seam-${next.id}`}
                        className={`tr-circle${tr ? '' : ' none'}${sel ? ' sel' : ''}`}
                        data-testid="tr-circle"
                        data-item-id={next.id}
                        aria-label={tr ? `轉場 ${transitionName(tr.kind)}` : '加轉場'}
                        style={{ left: half + next.start * pps - 12, top: (h - 24) / 2 }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          useProjectStore.getState().select(next.id);
                          player?.seek(next.start + 0.02);
                          useUI.setState({ requestTab: 'effect' });
                        }}
                      >
                        {tr ? transitionCode(tr.kind) : '＋'}
                      </button>
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
            <button
              className="menu-item"
              onClick={() => {
                setRenameTrackId(menuTrack.id);
                setMenuTrackId(null);
              }}
            >
              改名
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
            {
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
                {!(
                  menuTrack.kind === 'media' && project.tracks.filter((t) => t.kind === 'media').length <= 1
                ) && (
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
            }
          </>
        )}
      </Sheet>
      <PromptSheet
        open={!!renameTrackId}
        title="軌道改名"
        label="軌道名稱"
        initial={project.tracks.find((t) => t.id === renameTrackId)?.name ?? ''}
        onSubmit={(v) => renameTrackId && v && patchTrack(renameTrackId, { name: v })}
        onClose={() => setRenameTrackId(null)}
      />
      <PromptSheet
        open={!!renameItemId}
        title="片段命名"
        label="片段名稱"
        initial={project.tracks.flatMap((t) => t.items).find((x) => x.id === renameItemId)?.label ?? ''}
        placeholder="例如：開場・揮手（空白＝用預設名稱）"
        onSubmit={(v) => renameItemId && renameItem(renameItemId, v)}
        onClose={() => setRenameItemId(null)}
      />
    </div>
  );
}
