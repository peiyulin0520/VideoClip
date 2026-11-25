import { kineticById } from '../../engine/kinetic';
import {
  cellNoOf,
  cellsOf,
  cellTracksOf,
  frameOfGroup,
  isFrameItem,
  memberTracksOf,
  rowsOfCell,
} from '../../engine/layoutTracks';
import { useGroupOpen } from '../../store/groupOpenStore';
import { EmptyCellSlot } from './EmptyCellSlot';
import { CellSheet } from './CellSheet';
import { importFilesIntoCell } from './cellImport';
import { CellAddSheet } from './CellAddSheet';
import { createAudioClip, createTextItem } from '../../model/defaults';
import { ensureUrls, isAssetMissing } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Film,
  Lock,
  Music,
  Plus,
  Sparkles,
  Type,
  Volume2,
  VolumeX,
} from 'lucide-react';
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
import type { Asset, EffectKind, Item, Project, Track, TrackKind, VideoItem } from '../../model/types';
import { useProxyProgress } from '../../engine/proxyQueue';
import { Wave } from './Wave';
import {
  closeGap,
  moveItemTo,
  moveTrackInKindTo,
  patchTrack,
  placeItem,
  removeTrack,
  mergeTracksMulti,
  moveTracksMulti,
  removeTracksMulti,
  setGroupDuration,
  setGroupStart,
  shiftTrackInKind,
} from '../../store/actions';
import { setTrackItems, useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { Sheet } from '../../ui/Sheet';
import { PromptSheet } from '../../ui/PromptSheet';
import { itemHasGrade } from '../../engine/grade';
import { addGroupMember, keyframeTarget, shiftMemberLayer, trimCellEnd } from '../../store/actions';
import { KeyframeDot } from './KeyframeDot';
import { itemTitle, ordinalIn } from '../../engine/labels';
import { textFxCode, textFxName } from '../../engine/textFx';
import { thumbFor } from '../../engine/thumbs';
import { tileLayout } from './tiles';
import { effectDurations, seamsOf, transitionCode, transitionName } from '../../engine/transitions';
import { renameItem } from '../../store/actions';

const BASE_H = 32; // 最下面那條影像軌：跟其他軌一樣高（2026-11-14 使用者：影像軌太高、縮圖太寬）
const SLOT_H = 26; // 拖素材時，同一區上下各多出一條「＋ 新增一軌」的放置區
const GAP_MIN = 0.1; // 小於這個秒數的空位不畫
const ROW_H = 32; // 其他軌道：細一點（2026-11-12 使用者：拖拉軸再細一些）
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
  if (!thumbs.some(Boolean))
    return (
      <div className="tiles no-thumb" data-testid="clip-name">
        {item.label?.trim() || asset?.name || ''}
      </div>
    );
  const aspect = asset && asset.height ? asset.width / asset.height : 0.56;
  const widthPx = item.duration * pps;
  // 長影片：需要的格數超過上限時每格放寬，整個片段一定鋪滿（不會 1 分鐘之後變空白）
  const { count, tileW } = tileLayout(widthPx, Math.min(Math.max(h * aspect, 18), 114));
  return (
    <div className="tiles">
      {Array.from({ length: count }, (_, i) => {
        const x = (i + 0.5) * tileW;
        const srcT = item.trimIn + (x / pps) * item.speed;
        // 照時間挑縮圖；那一格還沒有就用最近的一張
        const url =
          item.type === 'image' || !asset || asset.duration <= 0
            ? thumbs[0]
            : thumbFor(thumbs, srcT, asset.duration);
        return <span key={i} style={{ width: tileW, backgroundImage: `url(${url ?? thumbs[0]})` }} />;
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

/** 每一類（影像、貼圖、字卡、音訊）各自收合：記下「收起來的類別」在這台手機；預設全部展開 */
const CATS_KEY = 'vc-tl-cats';
const readClosed = (): TrackKind[] => {
  try {
    const v = JSON.parse(localStorage.getItem(CATS_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v.filter((k) => ORDER.includes(k as TrackKind)) as TrackKind[]) : [];
  } catch {
    return [];
  }
};
/** 時間軸由上到下的類別順序（跟圖層由上到下一致：字卡 → 貼圖 → 影像，音訊沒有畫面在最下面） */
const ORDER: TrackKind[] = ['text', 'sticker', 'media', 'audio'];
/** 左邊留給軌道圖示的寬度：播放頭固定在這裡，0 秒的內容直接從這裡開始（不再有半個畫面的空白） */
const GUTTER = 56;
const HEAD_H = 22; // 每一類的標題列
const KIND_NAME: Record<TrackKind, string> = { media: '影像', sticker: '貼圖', text: '字卡', audio: '音訊' };
/** 展開的版型裡的分類名稱 */
const SUB_NAME: Record<TrackKind, string> = { media: '影像', sticker: '貼圖', text: '文字', audio: '音效' };
const KIND_BAR: Record<TrackKind, string> = {
  media: 'var(--clip)',
  sticker: 'var(--clip-effect)',
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

/** 多選軌道的動作列（蓋在時間軸尺規上）：上移、下移、整併、刪除、完成 */
function MultiBar({
  project,
  ids,
  onDone,
  onIds,
}: {
  project: Project;
  ids: string[];
  onDone: () => void;
  onIds: (ids: string[]) => void;
}) {
  const sel = project.tracks.filter((t) => ids.includes(t.id));
  const kinds = new Set(sel.map((t) => t.kind));
  const canMerge = sel.length >= 2 && kinds.size === 1 && !sel.some((t) => t.group);
  const why =
    sel.length < 2 ? '選 2 條以上才能整併' : kinds.size > 1 ? '種類不同不能整併' : '版型的軌道不能整併';
  return (
    <div className="multi-bar" role="toolbar" aria-label="多選軌道" data-testid="multi-bar">
      <span className="multi-count" data-testid="multi-count">
        已選 {sel.length} 條
      </span>
      <button className="chip sm" aria-label="選到的軌道上移" onClick={() => moveTracksMulti(ids, 1)}>
        上移
      </button>
      <button className="chip sm" aria-label="選到的軌道下移" onClick={() => moveTracksMulti(ids, -1)}>
        下移
      </button>
      <button
        className="chip sm"
        aria-label="整併選到的軌道"
        disabled={!canMerge}
        title={canMerge ? undefined : why}
        onClick={() => {
          const r = mergeTracksMulti(ids);
          if (!r) return toast(why);
          if (r.kept > 0) toast(`有 ${r.kept} 個時間重疊，留在原本的軌道`);
          else toast(`已整併（搬了 ${r.merged} 個）`);
          onIds(
            [ids[ids.length - 1]!].filter((id) =>
              useProjectStore.getState().project?.tracks.some((t) => t.id === id),
            ),
          );
        }}
      >
        整併
      </button>
      <button
        className="chip sm danger"
        aria-label="刪除選到的軌道"
        disabled={sel.length === 0}
        onClick={() => {
          removeTracksMulti(ids);
          onDone();
        }}
      >
        刪除
      </button>
      <button className="chip sm active" aria-label="完成多選" onClick={onDone}>
        完成
      </button>
    </div>
  );
}

/** 一格有好幾列時，軌道名稱帶「第 k 列」 */
function rowTagOf(tracks: Track[], t: Track): string {
  const rows = rowsOfCell(tracks, t);
  return rows.length > 1 ? ` 第 ${rows.indexOf(t) + 1} 列` : '';
}

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
  const kfTargetId = keyframeTarget(project, selectedId)?.id ?? null;
  const player = useUI((s) => s.player);
  const fxFocus = useUI((s) => s.fxFocus);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSet = useRef(-100);
  const lastSeen = useRef(0); // 上一次看到的 scrollLeft（我們自己設的、或 scroll 事件處理過的）
  const [vw, setVw] = useState(360);
  const half = GUTTER;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menuTrackId, setMenuTrackId] = useState<string | null>(null);
  const proxyProgress = useProxyProgress((s) => s.progress);
  // 拖軌道圖示換圖層順序：rowIndex＝顯示的第幾列（0＝最上面）、dy＝手指移動的距離
  const [trackDrag, setTrackDrag] = useState<{ id: string; from: number; dy: number } | null>(null);
  const suppressChipClick = useRef(false);
  const lastTap = useRef<{ id: string; t: number } | null>(null);

  const total = totalDuration(project);
  const baseId = baseMediaTrack(project)?.id;
  const [closed, setClosed] = useState<TrackKind[]>(readClosed);
  const groupOpen = useGroupOpen((s) => s.open);
  const groupClosed = useGroupOpen((s) => s.closed);
  const setClosedSave = (next: TrackKind[]) => {
    setClosed(next);
    try {
      localStorage.setItem(CATS_KEY, JSON.stringify(next));
    } catch {
      /* 存不了就只換這一次 */
    }
  };
  const [renameTrackId, setRenameTrackId] = useState<string | null>(null);
  const [renameItemId, setRenameItemId] = useState<string | null>(null);
  // 展開的版型：點格子開「這一格」視窗、空格子「＋ 匯入」、版型尾端「＋」加文字／音效
  const [cellSheet, setCellSheet] = useState<{ id: string; index: number } | null>(null);
  const [cellAdd, setCellAdd] = useState<{ id: string; index: number } | null>(null);
  const cellFileRef = useRef<HTMLInputElement>(null);
  const cellImportFor = useRef<string | null>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);
  const [addMenuGroup, setAddMenuGroup] = useState<string | null>(null);
  const addMenuGroupRef = useRef<string | null>(null);
  const toggleGroup = useGroupOpen((s) => s.toggleGroup);
  const toggleKind = useGroupOpen((s) => s.toggleKind);
  // 選到某個物件、或加進新的物件：它那一類自動展開
  useEffect(
    () =>
      useProjectStore.subscribe((next, prev) => {
        const cur = next.project;
        if (!cur) return;
        const kinds = new Set<TrackKind>();
        if (next.selectedId && next.selectedId !== prev.selectedId) {
          const t = cur.tracks.find((tr) => tr.items.some((x) => x.id === next.selectedId));
          if (t) kinds.add(t.kind);
        }
        for (const t of cur.tracks)
          if (t.items.length && !prev.project?.tracks.some((b) => b.id === t.id)) kinds.add(t.kind);
        if (kinds.size === 0) return;
        setClosed((c) => {
          const rest = c.filter((k) => !kinds.has(k));
          if (rest.length === c.length) return c;
          try {
            localStorage.setItem(CATS_KEY, JSON.stringify(rest));
          } catch {
            /* 存不了就只換這一次 */
          }
          return rest;
        });
      }),
    [],
  );

  // 由上到下顯示：字卡 → 貼圖 → 影像（最上層的軌道在最上面），音訊沒有畫面，畫在最下面、跟上面隔一小段。
  // 每一類有一條標題列（▾／▸ 可以各自收合，收合時標題列上畫出那一類每個物件的位置）。
  // 拖素材時（slotZone），那個素材所屬的類別上下各多出一條「＋ 新增一軌」的放置區
  const draggedItem = drag ? project.tracks.flatMap((t) => t.items).find((x) => x.id === drag.id) : undefined;
  const slotZone = draggedItem ? ZONE[trackKindOf(draggedItem, project.assets)] : null;
  // 多選軌道（長按軌道圖示進入）：一起上移／下移、整併、刪除
  const [multi, setMulti] = useState<string[] | null>(null);
  const showAll = !!drag || !!multi; // 拖素材、多選的時候全部展開（才找得到要放的軌道）
  const layout = useMemo(() => {
    // 版型的附屬軌道（格子、文字／貼圖／音效）不在一般類別裡：版型片段展開時才在它下面看得到
    const all = project.tracks
      .map((track, index) => ({ track, index }))
      .filter((r) => !r.track.groupRole)
      .reverse();
    const slots: { edge: 'top' | 'bottom'; top: number }[] = [];
    const heads: { kind: TrackKind; tracks: Track[]; top: number; open: boolean; mixed: boolean }[] = [];
    const rows: { track: Track; index: number; h: number; top: number; sub?: string }[] = [];
    const gheads: {
      group: string;
      label: string;
      top: number;
      cells: number;
      empty: number;
      frameId: string;
      inFx?: EffectKind;
      outFx?: EffectKind;
    }[] = [];
    const sheads: {
      group: string;
      kind: TrackKind;
      label: string;
      count: number;
      top: number;
      open: boolean;
    }[] = [];
    const idxOf = (t: Track) => project.tracks.indexOf(t);
    let y = RULER_H + ROW_GAP;
    for (const kind of ORDER) {
      const list = all.filter((r) => r.track.kind === kind);
      if (list.length === 0) continue;
      if (kind === 'audio') y += ROW_GAP * 2;
      const open = showAll || !closed.includes(kind);
      // 這一類的軌道中間夾著別種類的畫面軌（在圖層分頁排成夾心）：標題列提示播放軸的上下不等於全部的上下
      const idxs = list.map((r) => r.index);
      const mixed =
        kind !== 'audio' &&
        project.tracks.some(
          (t, i) =>
            i > Math.min(...idxs) &&
            i < Math.max(...idxs) &&
            t.kind !== kind &&
            t.kind !== 'audio' &&
            !t.groupRole,
        );
      heads.push({ kind, tracks: list.map((r) => r.track), top: y, open, mixed });
      y += HEAD_H + ROW_GAP;
      if (!open) continue;
      if (slotZone === ZONE[kind]) {
        slots.push({ edge: 'top', top: y });
        y += SLOT_H + ROW_GAP;
      }
      for (const r of list) {
        const h = r.track.id === baseId ? BASE_H : ROW_H;
        rows.push({ ...r, h, top: y });
        y += h + ROW_GAP;
        // 這一列上有展開的版型：接著畫版型裡面（文字、貼圖、影像的各格、音效）
        for (const fr of r.track.items) {
          if (!isFrameItem(fr) || !groupOpen.includes(fr.group!)) continue;
          const g = fr.group!;
          const cells = cellTracksOf(project.tracks, g);
          const cellList = cellsOf(project.tracks, g);
          gheads.push({
            group: g,
            label: fr.label ?? '版型',
            top: y,
            cells: cellList.length,
            empty: cellList.filter((c) => c.tracks.every((r) => r.items.length === 0)).length,
            frameId: fr.id,
            inFx: fr.inEffect?.kind,
            outFx: fr.outEffect?.kind,
          });
          y += HEAD_H + ROW_GAP;
          const shut = groupClosed[g] ?? [];
          for (const sk of ['text', 'sticker', 'media', 'audio'] as TrackKind[]) {
            const ts = sk === 'media' ? cells : memberTracksOf(project.tracks, g, sk).slice().reverse();
            if (ts.length === 0) continue;
            const sopen = !shut.includes(sk);
            sheads.push({
              group: g,
              kind: sk,
              label: SUB_NAME[sk],
              count: ts.reduce((n, t) => n + t.items.length, 0),
              top: y,
              open: sopen,
            });
            y += HEAD_H + ROW_GAP;
            if (!sopen) continue;
            for (const t of ts) {
              rows.push({ track: t, index: idxOf(t), h: ROW_H, top: y, sub: g });
              y += ROW_H + ROW_GAP;
            }
          }
        }
      }
      if (slotZone === ZONE[kind]) {
        slots.push({ edge: 'bottom', top: y });
        y += SLOT_H + ROW_GAP;
      }
    }
    return { rows, slots, heads, gheads, sheads, end: y - ROW_GAP };
  }, [project.tracks, baseId, slotZone, showAll, closed, groupOpen, groupClosed]);
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
    const same = rows.map((r, i) => ({ r, i })).filter((x) => !x.r.sub && x.r.track.kind === me.track.kind);
    let to = same[0]!.i;
    for (const { r, i } of same) if (i !== from && r.top + r.h / 2 < center) to++;
    return Math.min(to, same[same.length - 1]!.i);
  };

  const startTrackDrag = (e: RPointerEvent, trackId: string, from: number) => {
    e.stopPropagation();
    if (multi) return; // 多選模式：點一下切換打勾（onClick），不拖
    const startY = e.clientY;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let dragging = false;
    // 長按 500ms 且手指沒動：進入多選（這一條先打勾）
    let longFired = false;
    const longTimer = setTimeout(() => {
      if (dragging) return;
      longFired = true;
      player?.pause();
      navigator.vibrate?.(20);
      setMulti([trackId]);
    }, 500);
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!dragging && !longFired && Math.abs(dy) > 8) {
        clearTimeout(longTimer);
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
      clearTimeout(longTimer);
      if (longFired) {
        suppressChipClick.current = true; // 長按放開後不要又開選單／又切換打勾
        setTimeout(() => (suppressChipClick.current = false), 0);
        return;
      }
      if (!dragging) return;
      suppressChipClick.current = true; // 拖完不要又開選單
      setTimeout(() => (suppressChipClick.current = false), 0);
      setTrackDrag(null);
      if (cancelled) return;
      const to = dropRow(from, ev.clientY - startY);
      if (to !== from) {
        // 顯示列 → 「同種類裡第幾條（0＝最下面）」；穿插了別種類的時候陣列 index 不連續，不能直接用
        const same = rows.filter((r) => !r.sub && r.track.kind === rows[from]!.track.kind);
        moveTrackInKindTo(trackId, same.length - 1 - same.indexOf(rows[to]!));
      }
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
    const ro = new ResizeObserver(() => setVw(el.clientWidth));
    ro.observe(el);
    setVw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const syncScroll = useCallback(
    (t: number, fromPlayer = false) => {
      const el = scrollRef.current;
      if (!el) return;
      // 播放器通知時間變了：如果時間軸剛被捲動（使用者或程式）、scroll 事件還沒處理，不要用舊的播放時間把它蓋回去
      // （背景補縮圖、預覽檔做好等重畫會通知播放器，剛好撞到就會把使用者的捲動吃掉）
      if (fromPlayer && Math.abs(el.scrollLeft - lastSeen.current) >= 1) return;
      const target = t * pps;
      if (Math.abs(el.scrollLeft - target) >= 0.5) {
        lastSet.current = target;
        el.scrollLeft = target;
      }
      lastSeen.current = el.scrollLeft;
    },
    [pps],
  );

  useLayoutEffect(() => {
    if (player) syncScroll(player.time);
  }, [player, total, pps, half, syncScroll]);

  useEffect(() => {
    if (!player) return;
    return player.subscribe((t) => syncScroll(t, true));
  }, [player, syncScroll]);

  const onScroll = () => {
    const el = scrollRef.current!;
    lastSeen.current = el.scrollLeft;
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
      dropTarget(
        useProjectStore.getState().project!.tracks,
        item,
        hover,
        useProjectStore.getState().project!.assets,
      );
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
        if (!target || (target.type === 'track' && target.trackId === track.id)) placeItem(item.id, start);
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
    // 版型裡的文字、貼圖、音效：頭尾不能超出版型的時間範圍
    const isCellItem = item.type !== 'text' && item.type !== 'audio' && !!item.cell && !!item.group;
    const snapshot = useProjectStore.getState().project!;
    const frameSpan =
      item.group && !isFrameItem(item) && !(isCellItem && side === 'end')
        ? (() => {
            const fr = frameOfGroup(useProjectStore.getState().project!.tracks, item.group!);
            return fr ? { start: fr.item.start, end: fr.item.start + fr.item.duration } : null;
          })()
        : null;
    const move = (ev: PointerEvent) => {
      let delta = (ev.clientX - startX) / pps;
      if (frameSpan)
        delta =
          side === 'end'
            ? Math.min(delta, frameSpan.end - (item.start + item.duration))
            : Math.max(delta, frameSpan.start - item.start);
      // 版型格子素材的尾端：依序時後面的素材、各格跟著推，超出版型就把外框拉長
      if (isCellItem && side === 'end') {
        trimCellEnd(snapshot, item.id, item.duration + delta, { coalesce: `trim:${item.id}` });
        player?.peek(item.start + Math.max(item.duration + delta, 0.2) - 0.05);
        return;
      }
      if (isFrameItem(item) && side === 'start') {
        // 版型左端：改開始的秒數、結尾不動（各格在新開頭前面的部分切掉）
        setGroupStart(item.group!, item.start + delta, { coalesce: `trim:${item.id}` });
        player?.peek(Math.max(item.start + delta, 0));
        return;
      }
      if (isFrameItem(item)) {
        // 版型：改整組的長度（各格超出的部分切掉）
        setGroupDuration(item.group!, item.duration + delta, { coalesce: `trim:${item.id}` });
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
    if (track.kind !== trackKindOf(draggedItem, project.assets)) return ' drop-bad';
    return drag.hover.trackId === track.id ? ' drop-ok' : '';
  };

  const menuTrack = project.tracks.find((t) => t.id === menuTrackId) ?? null;
  // 時間軸吃掉播放列和功能列中間剩下的高度，軌道多的時候在裡面上下滑（整頁不捲動）
  return (
    <div className="timeline">
      {multi && (
        <MultiBar
          project={project}
          ids={multi}
          onDone={() => setMulti(null)}
          onIds={(ids) => setMulti(ids)}
        />
      )}
      <div
        className="tl-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        onPointerDown={() => player?.pause()}
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.bg) {
            useProjectStore.getState().select(null);
            setMulti(null);
          }
        }}
        data-testid="timeline-scroll"
      >
        <div
          className="tl-content"
          data-bg="1"
          style={{ width: half + total * pps + Math.max(vw - half, 120), height: contentH }}
        >
          <div className="ruler" style={{ height: RULER_H }}>
            <button
              className="layers-toggle"
              aria-label="圖層清單"
              aria-expanded={closed.length === 0}
              data-testid="layers-toggle"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setClosedSave(closed.length === 0 ? layout.heads.map((h) => h.kind) : [])}
            >
              {closed.length === 0 ? '▴' : '▾'} 圖層（{project.tracks.length}）
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
          {layout.heads.map((hd) => {
            const hidden = hd.tracks.filter((t) => t.hidden).length;
            const count = hd.tracks.reduce((n, t) => n + t.items.length, 0);
            return (
              <div
                key={hd.kind}
                className={`cat-head${hd.open ? ' open' : ''}`}
                data-testid="cat-head"
                data-kind={hd.kind}
                data-open={hd.open}
                data-bg="1"
                style={{ top: hd.top, height: HEAD_H }}
              >
                {!hd.open &&
                  hd.tracks.flatMap((t) =>
                    t.hidden
                      ? []
                      : t.items.map((it) => (
                          <i
                            key={it.id}
                            className="sum-bar"
                            style={{
                              left: half + it.start * pps,
                              width: Math.max(it.duration * pps, 3),
                              background: KIND_BAR[hd.kind],
                            }}
                          />
                        )),
                  )}
                <div className="head-inner">
                  <button
                    className="cat-toggle"
                    aria-expanded={hd.open}
                    aria-label={`${hd.open ? '收合' : '展開'}${KIND_NAME[hd.kind]}（${count} 個）`}
                    data-testid="cat-toggle"
                    disabled={showAll}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() =>
                      setClosedSave(
                        hd.open
                          ? [...closed.filter((k) => k !== hd.kind), hd.kind]
                          : closed.filter((k) => k !== hd.kind),
                      )
                    }
                  >
                    {hd.open ? '▾' : '▸'} {KIND_NAME[hd.kind]} {hd.tracks.length}
                    {hidden > 0 && `（${hidden} 條隱藏）`}
                  </button>
                  {hd.mixed && (
                    <button
                      className="cat-mixed"
                      data-testid="cat-mixed"
                      aria-label="這一類有圖層和別類穿插，點預覽右上角的圖層看完整順序"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        toast('這一類的圖層跟別類穿插：點預覽右上角的〔圖層〕看完整順序、上下換')
                      }
                    >
                      已穿插
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {layout.gheads.map((gh) => (
            <div
              key={`gh-${gh.group}`}
              className="group-head"
              data-testid="group-head"
              data-bg="1"
              style={{ top: gh.top, height: HEAD_H }}
            >
              <div className="head-inner">
                <button
                  className="cat-toggle grp"
                  aria-expanded
                  aria-label={`收合版型 ${gh.label}`}
                  data-testid="group-toggle"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => toggleGroup(gh.group)}
                >
                  ▾ 版型：{gh.label} · {gh.cells} 格{gh.empty > 0 ? `（${gh.empty} 格空）` : ''}
                </button>
                <button
                  className="grp-add"
                  aria-label={`加入到版型 ${gh.label}`}
                  data-testid="group-add"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setAddMenuGroup(gh.group)}
                >
                  <Plus size={14} /> 加入
                </button>
                {(['in', 'out'] as const).map((role) => {
                  const kind = role === 'in' ? gh.inFx : gh.outFx;
                  if (!kind) return null;
                  return (
                    <button
                      key={role}
                      className={`fx-circle head ${role}`}
                      data-testid={`group-fx-${role}`}
                      aria-label={`整個版型的${role === 'in' ? '進場' : '出場'}特效 ${transitionName(kind)}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        useProjectStore.getState().select(gh.frameId);
                        useUI.setState({ requestTab: 'effect', fxFocus: { id: gh.frameId, role } });
                      }}
                    >
                      {transitionCode(kind)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {layout.sheads.map((sh) => (
            <div
              key={`sh-${sh.group}-${sh.kind}`}
              className="sub-head"
              data-testid="sub-head"
              data-kind={sh.kind}
              data-bg="1"
              style={{ top: sh.top, height: HEAD_H }}
            >
              <div className="head-inner">
                <button
                  className="cat-toggle sub"
                  aria-expanded={sh.open}
                  aria-label={`${sh.open ? '收合' : '展開'}版型的${sh.label}（${sh.count} 個）`}
                  data-testid="sub-toggle"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => toggleKind(sh.group, sh.kind)}
                >
                  {sh.open ? '▾' : '▸'} {sh.label} {sh.count}
                </button>
              </div>
            </div>
          ))}
          {rows.map(({ track, top, h, sub }, rowIdx) => {
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
                className={`track${track.hidden ? ' off' : ''}${isDragged ? ' track-dragging' : ''}${dropClass(track)}${sub ? ' sub-row' : ''}`}
                data-sub={sub}
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
                  className={`track-chip${sub ? ' sub' : ' draggable'}${multi ? (multi.includes(track.id) ? ' multi-on' : ' multi-off') : ''}`}
                  aria-label={
                    sub && track.groupRole === 'cell'
                      ? `第 ${cellNoOf(project.tracks, track)} 格${rowTagOf(project.tracks, track)} 軌道`
                      : `${track.name} 軌道設定`
                  }
                  data-testid="track-chip"
                  onPointerDown={(e) => (sub ? e.stopPropagation() : startTrackDrag(e, track.id, rowIdx))}
                  onClick={() => {
                    if (suppressChipClick.current) return;
                    if (sub && track.groupRole === 'cell') {
                      const i = cellNoOf(project.tracks, track) - 1;
                      const it = track.items[0];
                      if (it) useProjectStore.getState().select(it.id);
                      return setCellSheet({ id: track.id, index: i });
                    }
                    if (multi)
                      setMulti((m) =>
                        m ? (m.includes(track.id) ? m.filter((x) => x !== track.id) : [...m, track.id]) : m,
                      );
                    else setMenuTrackId(track.id);
                  }}
                  aria-pressed={multi ? multi.includes(track.id) : undefined}
                >
                  {sub && track.groupRole === 'cell' ? (
                    <span className="cell-no" data-testid="cell-no">
                      {cellNoOf(project.tracks, track)}
                    </span>
                  ) : track.kind === 'media' ? (
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

                {sub && track.groupRole === 'cell' && track.items.length === 0 && (
                  <EmptyCellSlot
                    track={track}
                    index={cellNoOf(project.tracks, track) - 1}
                    project={project}
                    left={half}
                    pps={pps}
                    onPick={(id: string) => {
                      cellImportFor.current = id;
                      cellFileRef.current?.click();
                    }}
                  />
                )}

                {!sub &&
                  gapsOf(track.items, track.id === baseId)
                    // 停格轉場的空白（兩段中間，轉場圓圈在那裡）不是留白，不能「補齊」
                    .filter(
                      (g) =>
                        !seamsOf(track.items).some(
                          (s) => s.hold && Math.abs(s.next.start - (g.start + g.len)) < 0.03,
                        ),
                    )
                    .filter((g) => g.len * pps >= 24) // 太窄按不到：放大時間軸再按
                    .map((g) => (
                      <button
                        key={`gap-${g.start}`}
                        className="gap-block"
                        data-testid="gap"
                        aria-label={`往前補齊空白 ${g.len.toFixed(1)} 秒`}
                        style={{ left: half + g.start * pps, width: g.len * pps }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => closeGap(track.id, g.start, g.start + g.len)}
                      >
                        <ArrowLeft size={16} aria-hidden="true" />
                      </button>
                    ))}

                {track.items.map((it) => {
                  const asset = isVideoItem(it) ? project.assets.find((a) => a.id === it.assetId) : undefined;
                  const selected = it.id === selectedId;
                  const dragging = drag?.id === it.id;
                  const dx = dragging ? drag!.dx : 0;
                  const dy = dragging ? drag!.dy - (top - drag!.startTop) : 0; // 放置區把列往下推時補償回來
                  return (
                    <div
                      key={it.id}
                      className={`clip${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${it.type === 'text' ? ' is-text' : ''}${it.type === 'audio' ? ' is-audio' : ''}${isFrameItem(it) ? ' is-frame' : ''}${it.duration * pps < 80 ? ' short' : ''}`}
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
                      {it.type !== 'text' && isAssetMissing(project.id, it.assetId) && (
                        <span className="clip-lost" data-testid="clip-lost">
                          素材遺失
                        </span>
                      )}
                      {isFrameItem(it) && (
                        <button
                          className="grp-toggle"
                          aria-expanded={groupOpen.includes(it.group!)}
                          aria-label={`${groupOpen.includes(it.group!) ? '收合' : '展開'}版型 ${it.label ?? ''}`}
                          data-testid="clip-group-toggle"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroup(it.group!);
                          }}
                        >
                          {groupOpen.includes(it.group!) ? '▾' : '▸'}
                        </button>
                      )}
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
                        {it.type !== 'audio' && itemHasGrade(it) && ' · 調'}
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

                {sub && track.groupRole === 'cell' && track.items.length > 0 && (
                  <button
                    className="cell-add"
                    data-testid="cell-add"
                    aria-label={`第 ${cellNoOf(project.tracks, track)} 格${rowTagOf(project.tracks, track)} 加素材`}
                    style={{
                      left: half + Math.max(...track.items.map((x) => x.start + x.duration)) * pps + 6,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() =>
                      setCellAdd({
                        id: track.id,
                        index: cellNoOf(project.tracks, track) - 1,
                      })
                    }
                  >
                    <Plus size={14} />
                  </button>
                )}

                {track.kind !== 'audio' &&
                  (!track.groupRole || track.groupRole === 'cell') &&
                  seamsOf(track.items).map(({ next, hold }) => {
                    const sel = next.id === selectedId && fxFocus?.id === next.id && fxFocus.role === 'seam';
                    const tr = next.transitionIn;
                    return (
                      <button
                        key={`seam-${next.id}`}
                        className={`tr-circle${tr ? '' : ' none'}${sel ? ' sel' : ''}`}
                        data-testid="tr-circle"
                        data-item-id={next.id}
                        aria-label={tr ? `轉場 ${transitionName(tr.kind)}` : '加轉場'}
                        style={{
                          // 停格轉場：圓圈放在兩段中間那段空白的正中間；邊轉邊播放在接縫上
                          left: half + (hold && tr ? next.start - tr.duration / 2 : next.start) * pps - 11,
                          top: -9,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          useProjectStore.getState().select(next.id);
                          useUI.setState({ requestTab: 'effect', fxFocus: { id: next.id, role: 'seam' } });
                          player?.seek(hold && tr ? next.start - tr.duration / 2 : next.start + 0.02);
                        }}
                      >
                        {tr ? transitionCode(tr.kind) : '＋'}
                      </button>
                    );
                  })}

                {/* 單一素材的進場／出場特效：特效佔的那一段（淡色）＋代表字圓圈（跟接縫的轉場不同色）；版型看外框那一條 */}
                {track.kind !== 'audio' &&
                  track.items.map((it) => {
                    // 字卡的文字特效（舊的 4 種或動態字卡 64 式）：整段一直動，標在字卡片段上
                    const kdef = it.type === 'text' && it.kinetic ? kineticById(it.kinetic.id) : undefined;
                    const styleFx =
                      it.type !== 'text'
                        ? undefined
                        : kdef
                          ? { name: kdef.zh, code: kdef.zh.slice(0, 1) }
                          : it.textFx
                            ? { name: textFxName(it.textFx.kind), code: textFxCode(it.textFx.kind) }
                            : undefined;
                    if (it.type === 'audio' || (!it.inEffect && !it.outEffect && !styleFx && !it.motion))
                      return null;
                    const d = effectDurations(it);
                    const x0 = half + it.start * pps;
                    const x1 = x0 + it.duration * pps;
                    const mk = (role: 'in' | 'out', kind: EffectKind, left: number, w: number) => {
                      const sel = it.id === selectedId && fxFocus?.id === it.id && fxFocus.role === role;
                      return (
                        <span key={`${it.id}-${role}`}>
                          <span
                            className={`fx-span ${role}${sel ? ' sel' : ''}`}
                            style={{ left: role === 'in' ? x0 : x1 - w, width: w }}
                          />
                          <button
                            className={`fx-circle ${role}${sel ? ' sel' : ''}`}
                            data-testid={`fx-circle-${role}`}
                            data-item-id={it.id}
                            aria-label={`${role === 'in' ? '進場' : '出場'}特效 ${transitionName(kind)}`}
                            style={{ left }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              useProjectStore.getState().select(it.id);
                              useUI.setState({
                                requestTab: 'effect',
                                fxFocus: { id: it.id, role },
                              });
                              player?.seek(it.start + (role === 'in' ? 0.02 : it.duration - 0.05));
                            }}
                          >
                            {transitionCode(kind)}
                          </button>
                        </span>
                      );
                    };
                    const styleSel =
                      it.id === selectedId && fxFocus?.id === it.id && fxFocus.role === 'style';
                    return (
                      <span key={`fx-${it.id}`}>
                        {styleFx && (
                          <span
                            className={`fx-span style${styleSel ? ' sel' : ''}`}
                            style={{ left: x0, width: Math.max(x1 - x0, 4) }}
                          />
                        )}
                        {styleFx && (
                          <button
                            className={`fx-circle style${styleSel ? ' sel' : ''}`}
                            data-testid="fx-circle-style"
                            data-item-id={it.id}
                            aria-label={`文字特效 ${styleFx.name}`}
                            title={styleFx.name}
                            style={{ left: x0 + Math.max((x1 - x0) / 2 - 11, 13) }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              useProjectStore.getState().select(it.id);
                              useUI.setState({ requestTab: 'effect', fxFocus: { id: it.id, role: 'style' } });
                              player?.seek(it.start + 0.3);
                            }}
                          >
                            {styleFx.code}
                          </button>
                        )}
                        {it.motion && (
                          <button
                            className={`fx-circle style whole${it.id === selectedId && fxFocus?.id === it.id && fxFocus.role === 'whole' ? ' sel' : ''}`}
                            data-testid="fx-circle-whole"
                            data-item-id={it.id}
                            aria-label={`整段效果 ${it.motion === 'drift' ? '捲動' : '滑入滑出'}`}
                            style={{ left: x0 + Math.max((x1 - x0) / 2 + 14, 40) }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              useProjectStore.getState().select(it.id);
                              useUI.setState({ requestTab: 'effect', fxFocus: { id: it.id, role: 'whole' } });
                              player?.seek(it.start + it.duration / 2);
                            }}
                          >
                            {it.motion === 'drift' ? '捲' : '滑'}
                          </button>
                        )}
                        {it.inEffect && d.in > 0.01 && mk('in', it.inEffect.kind, x0 + 13, d.in * pps)}
                        {it.outEffect &&
                          d.out > 0.01 &&
                          mk('out', it.outEffect.kind, Math.max(x1 - 35, x0 + 37), d.out * pps)}
                      </span>
                    );
                  })}

                {/* 定格（關鍵影格）：物件開始後 t 秒的位置放一個小菱形；點一下＝播放頭跳過去並選取 */}
                {track.items.flatMap((it) =>
                  (it.keyframes ?? []).map((k, i) => (
                    <KeyframeDot
                      key={`kf-${it.id}-${i}`}
                      item={it}
                      index={i}
                      k={k}
                      left={half + (it.start + k.t) * pps}
                      active={kfTargetId === it.id}
                      pps={pps}
                    />
                  )),
                )}

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
                        if (menuTrack.groupRole === 'member') {
                          if (!shiftMemberLayer(menuTrack.id, 1)) toast('已經是版型裡最上面的圖層');
                        } else if (!shiftTrackInKind(menuTrack.id, 1))
                          toast('已經是這一類最上面的軌道。要讓文字夾在影像中間，點預覽右上角的〔圖層〕調整');
                        setMenuTrackId(null);
                      }}
                    >
                      ▲ 往上一層
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        if (menuTrack.groupRole === 'member') {
                          if (!shiftMemberLayer(menuTrack.id, -1)) toast('已經是版型裡最下面的圖層');
                        } else if (!shiftTrackInKind(menuTrack.id, -1))
                          toast('已經是這一類最下面的軌道。要讓文字夾在影像中間，到「圖層」分頁調整');
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
                    {menuTrack.groupRole === 'cell'
                      ? '清空這一格'
                      : menuTrack.groupRole === 'frame'
                        ? '刪除整個版型'
                        : '刪除這條軌道（含裡面的物件）'}
                  </button>
                )}
              </>
            }
          </>
        )}
      </Sheet>
      {cellAdd && (
        <CellAddSheet
          key={cellAdd.id}
          projectId={project.id}
          trackId={cellAdd.id}
          index={cellAdd.index}
          onClose={() => setCellAdd(null)}
        />
      )}
      {cellSheet && (
        <CellSheet
          key={cellSheet.id}
          trackId={cellSheet.id}
          index={cellSheet.index}
          onClose={() => setCellSheet(null)}
        />
      )}
      <input
        ref={cellFileRef}
        type="file"
        accept="video/*,image/*"
        hidden
        data-testid="cell-file-timeline"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          const id = cellImportFor.current;
          cellImportFor.current = null;
          if (id) void importFilesIntoCell(project.id, id, files);
        }}
      />
      <input
        ref={audioFileRef}
        type="file"
        accept="audio/*,video/*"
        hidden
        data-testid="group-audio-file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          const g = addMenuGroupRef.current;
          if (!file || !g) return;
          const { setBusy } = useUI.getState();
          setBusy('匯入音效…');
          try {
            const res = await importFiles(project.id, [file]);
            const a = res.assets.find((x) => x.kind === 'audio') ?? res.assets[0];
            if (!a) return toast('這個檔案放不進來');
            await ensureUrls(project.id, [a]);
            addGroupMember(g, createAudioClip(a, player?.time ?? 0));
          } finally {
            setBusy(null);
          }
        }}
      />
      <Sheet open={!!addMenuGroup} title="加入到版型裡" onClose={() => setAddMenuGroup(null)}>
        <button
          className="menu-item"
          data-testid="group-add-text"
          onClick={() => {
            const g = addMenuGroup!;
            setAddMenuGroup(null);
            addGroupMember(g, createTextItem(player?.time ?? 0));
          }}
        >
          文字
        </button>
        <button
          className="menu-item"
          data-testid="group-add-audio"
          onClick={() => {
            addMenuGroupRef.current = addMenuGroup;
            setAddMenuGroup(null);
            audioFileRef.current?.click();
          }}
        >
          音效（從檔案選）
        </button>
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
