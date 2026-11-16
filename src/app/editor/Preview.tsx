import { cellItems } from '../../engine/cellGap';
import type { GeoCtx } from '../../engine/geometry';
import { cellsOf, frameOfGroup, isFrameItem } from '../../engine/layoutTracks';
import type { Item, Project } from '../../model/types';
import { groupClipArea } from '../../engine/scene';
import { showPlaceholders } from '../../engine/placeholder';
import { Layers, Maximize, Minimize, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { urlFor } from '../../engine/assetUrls';
import { installDebugHook } from '../../engine/debug';
import { useFonts } from '../../fonts/fontStore';
import {
  selectionBox,
  snapMove,
  snapRotation,
  SAFE_BOTTOM,
  SAFE_RIGHT,
  hitTestAll,
  nextHit,
  type Box,
} from '../../engine/geometry';
import { Player } from '../../engine/player';
import { aspectLabel } from '../../model/defaults';
import { stageLayout } from '../../engine/stage';
import { useSmooth } from '../../engine/previewQuality';
import { useQuality } from '../../store/qualityStore';
import { AspectOverlay } from './AspectOverlay';
import { LayoutResize } from './LayoutResize';
import { LayerPeek } from './LayerPeek';
import { PerfOverlay } from './PerfOverlay';
import { useCrop } from '../../store/cropStore';
import { geoCtx } from '../../engine/scene';
import { hasKeyframes, timeResolved } from '../../engine/keyframes';
import { findItem, visibleLayers } from '../../engine/timeline';
import { setTransform } from '../../store/actions';
import { setAssetThumbs, useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';

// v2：改成預設關閉（舊版 'vc-safe-zone' 預設開，會讓使用者誤以為粉紅區是畫面的一部分）
const SAFE_KEY = 'vc-safe-zone-v2';
const readSafe = () => {
  try {
    return localStorage.getItem(SAFE_KEY) === '1';
  } catch {
    return false;
  }
};

type Pt = { x: number; y: number };
/** 輕點的判定：手指移動不到 8px、按下到放開不到 350ms，而且中間沒被瀏覽器接手去捲頁面 */
const TAP_MOVE = 8;
const TAP_MS = 350;
/** 大於舞台一半的物件（例如滿版的影片）：沒選取時只能「點」來選取，上下滑要能捲頁面 */
const LARGE_AREA = 0.5;
type Tap = { pointerId: number; cx: number; cy: number; t: number; pt: Pt; moved: boolean };
type Gesture =
  | { type: 'move'; id: string; start: Pt; startX: number; startY: number; moved: boolean }
  | {
      type: 'pinch';
      id: string;
      startDist: number;
      startAngle: number;
      startScale: number;
      startRot: number;
    };

export function Preview({
  projectId,
  width,
  height,
  emptyAction,
}: {
  projectId: string;
  width: number;
  height: number;
  /** 專案還沒有素材時，在預覽中央顯示的「匯入」按鈕 */
  emptyAction?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null); // 版面（輸出範圍）
  const baseRef = useRef<HTMLDivElement>(null); // 底：固定 9:16，手勢都在這裡收
  const [cssW, setCssW] = useState(1);
  const [safe, setSafe] = useState(readSafe);
  const [dragging, setDragging] = useState(false); // 拖移/縮放中：安全區參考線暫時出現
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [selVisible, setSelVisible] = useState(true);
  const [kfTime, setKfTime] = useState(0); // 專案裡有定格（關鍵影格）時，跟著播放頭更新選取框與觸控區的位置
  const [hitIds, setHitIds] = useState(''); // 這一秒可以拖的物件（逗號分隔），給觸控區用
  const [peek, setPeek] = useState(false); // 「查看圖層」清單
  const [playing, setPlaying] = useState(false); // 播放中：編輯用的框線、編號全部收起來
  const [curT, setCurT] = useState(0); // 暫停時播放頭的時間（格子編號只畫這一刻看得到的版型）
  const [holdSnap, setHoldSnap] = useState<string | null>(null); // 換預覽畫質、重建預覽引擎時，先頂著舊畫面
  const [dim, setDim] = useState({ ww: 0, wh: 0, bw: 0, bh: 0 }); // 預覽區與底的大小（斜線要蓋到底的外面）
  const wrapRef = useRef<HTMLDivElement>(null);
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const cropping = useCrop((s) => !!s.s);
  const previewFull = useUI((s) => s.previewFull);
  const gradePeek = useUI((s) => s.gradePeek);
  // 預覽畫質：自動／清楚／流暢（設定頁可改）；自動時同時 3 支以上影片、或偵測到播放太慢就用流暢
  const quality = useQuality((s) => s.q);
  const [slow, setSlow] = useState(false);
  const smooth = useSmooth(quality, project, slow);
  const fontEpoch = useFonts((s) => s.epoch); // 字體載入完成：字卡大小可能變，選取框要重算
  // 換畫質會重建預覽引擎（新的畫布一開始是空的）：換之前先把現在這一格存起來頂著，新的畫好才拿掉，不會跳一下
  const snapshotNow = useRef(() => {});
  useEffect(() => {
    snapshotNow.current = () => {
      const c = canvasRef.current;
      if (!c || c.width < 2) return;
      try {
        setHoldSnap(c.toDataURL('image/jpeg', 0.8));
      } catch {
        /* 存不了就算了（會閃一下） */
      }
    };
  });
  useEffect(() => useQuality.subscribe(() => snapshotNow.current()), []);

  // ---- 建立 / 銷毀播放引擎（含 Pixi 合成器）----
  // 比例改了（寬高變了）會重建；記住舊的播放時間，重建後回到同一個位置（換專案則歸 0）
  const resumeRef = useRef<{ projectId: string; time: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let created: Player | null = null;
    let unsub = () => {};
    void Player.create({
      host: poolRef.current!,
      canvas: canvasRef.current!,
      getProject: () => useProjectStore.getState().project,
      urlFor: (id) => urlFor(projectId, id),
      onThumb: setAssetThumbs,
      onAudioBlocked: () => toast('iPhone 擋住了聲音，請再按一次播放', 6000),
      smooth,
      onSlow: () => {
        if (useQuality.getState().q === 'auto') {
          snapshotNow.current();
          setSlow(true);
          toast('播放有點吃力，預覽自動改成「流暢」（匯出不受影響）', 6000);
        }
      },
      onPoolFull: () => toast('同時播放的影片太多，有些格子先用縮圖預覽；匯出不受影響', 6000),
    }).then((player) => {
      if (cancelled) return player.destroy();
      created = player;
      useUI.setState({ player });
      const resume = resumeRef.current;
      player.seek(resume && resume.projectId === projectId ? resume.time : 0);
      // 舊畫面頂到新的畫好為止（最多 2 秒）
      const t0 = performance.now();
      const wait = () => {
        if (cancelled) return;
        if (player.settled || performance.now() - t0 > 2000) setHoldSnap(null);
        else requestAnimationFrame(wait);
      };
      requestAnimationFrame(wait);
      const unsubProject = useProjectStore.subscribe((s, prev) => {
        if (s.project !== prev.project) player.refresh();
      });
      const unsubFonts = useFonts.subscribe((s, prev) => {
        if (s.epoch !== prev.epoch) player.refresh(); // 字體載入完成，字卡重畫
      });
      unsub = () => {
        unsubProject();
        unsubFonts();
      };
      installDebugHook(player);
    });
    return () => {
      cancelled = true;
      unsub();
      if (created) resumeRef.current = { projectId, time: created.time };
      created?.destroy();
      useUI.setState({ player: null });
    };
  }, [projectId, width, height, smooth]); // 比例改了、預覽畫質改了就重建預覽引擎

  // ---- 舞台大小（CSS px）----
  useEffect(() => {
    const el = baseRef.current!;
    const frame = stageRef.current!;
    const wrap = wrapRef.current!;
    const measure = () => {
      setCssW(frame.clientWidth || 1);
      setDim({ ww: wrap.clientWidth, wh: wrap.clientHeight, bw: el.clientWidth, bh: el.clientHeight });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    ro.observe(wrap);
    ro.observe(el);
    // iOS Safari：雙指在預覽上不要變成整頁縮放（touch-action 之外的保險）
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', stop);
    el.addEventListener('gesturechange', stop);
    return () => {
      ro.disconnect();
      el.removeEventListener('gesturestart', stop);
      el.removeEventListener('gesturechange', stop);
    };
  }, []);

  // 選取的物件目前在不在畫面上（不在就不顯示選取框）
  useEffect(() => {
    if (!player) return;
    let lastKf = 0;
    const check = (t: number, playing?: boolean) => {
      const p = useProjectStore.getState().project;
      const id = useProjectStore.getState().selectedId;
      const f = p && findItem(p, id);
      // 播放中，有定格時選取框最多每秒更新約 15 次（每一格都重畫會拖慢預覽）
      const now = performance.now();
      if (!playing || now - lastKf >= 66) {
        lastKf = now;
        setKfTime(p && p.tracks.some((tr) => tr.items.some(hasKeyframes)) ? t : 0);
      }
      setPlaying(!!playing);
      if (!playing) setCurT(t);
      setSelVisible(!!f && t >= f.item.start && t < f.item.start + f.item.duration);
      // 字串相同 React 不會重畫，播放時不會每一格都重畫
      setHitIds(
        p
          ? visibleLayers(p, t)
              .filter((l) => !l.track.locked)
              .map((l) => l.item.id)
              .join(',')
          : '',
      );
    };
    check(player.time);
    return player.subscribe(check);
  }, [player, selectedId, project]);

  const k = cssW / width; // 專案座標 → CSS px
  const shown = useMemo(() => showPlaceholders(project), [project]); // 還沒輸入的文字也有框可以選
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geo = useMemo(() => geoCtx(shown, width, height), [shown, width, height, fontEpoch]);
  // 有定格的物件：選取框、觸控區用「播放頭這個時間」的位置
  const rproject = useMemo(() => timeResolved(shown, kfTime), [shown, kfTime]);
  const sel = findItem(rproject, selectedId);
  const box = sel && selVisible ? selectionBox(sel.item, geo) : null;
  const selLocked = !!sel?.track.locked || !!sel?.track.hidden;
  const layoutEdit = useUI((s) => s.layoutEdit);
  const lrFrame = layoutEdit ? (frameOfGroup(rproject.tracks, layoutEdit.group)?.item ?? null) : null;
  // 選到版型裡的素材（素材層）：把「畫面只露出來的範圍」畫成虛線框（版型旋轉也跟著轉），知道超出去的部分不會出現
  const clipPts = useMemo(() => {
    if (!sel || !selVisible || sel.item.type === 'audio' || !sel.item.group || isFrameItem(sel.item))
      return undefined;
    const fr = frameOfGroup(rproject.tracks, sel.item.group);
    return fr ? groupClipArea(sel.item, fr.item, geo, width, height, { x: 0, y: 0 }, true) : undefined;
  }, [sel, selVisible, rproject, geo, width, height]);

  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture | null>(null);
  const tap = useRef<Tap | null>(null);

  const toProj = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
  };

  /** 現在這個時間的物件（有定格的換成這個時間的位置、大小） */
  const findNow = (id: string | null) => {
    const t = useUI.getState().player?.time ?? 0;
    return findItem(timeResolved(useProjectStore.getState().project!, t), id);
  };

  const startMove = (id: string, at: Pt) => {
    const f = findNow(id);
    if (!f) return;
    gesture.current = {
      type: 'move',
      id,
      start: at,
      startX: f.item.transform.x,
      startY: f.item.transform.y,
      moved: false,
    };
  };

  /** 這個點下面所有的物件，由上到下 */
  const hitsAt = (pt: Pt) => {
    const st = useProjectStore.getState();
    const t = useUI.getState().player?.time ?? 0;
    const rp = timeResolved(st.project!, t);
    const hits = hitTestAll(visibleLayers(rp, t), geo, pt.x, pt.y, 40 / k);
    // 格子裡的影像沒有預先裁切，方框可能超出那一格：只有點在自己那一格的範圍內才算點到它
    return hits.filter((l) => {
      const it = l.item;
      if (it.type === 'text' || it.type === 'audio' || !it.cell || !it.group) return true;
      const fr = frameOfGroup(rp.tracks, it.group);
      const poly = fr ? groupClipArea(it, fr.item, geo, width, height, { x: 0, y: 0 }) : undefined;
      return !poly || pointInPoly(poly, pt.x, pt.y);
    });
  };

  const onPointerDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-handle]')) return;
    if (useUI.getState().frameEdit || useUI.getState().layoutEdit) return; // 正在調自訂比例／版型大小：預覽上的東西先不能動
    baseRef.current!.setPointerCapture(e.pointerId);
    const pt = toProj(e);
    pointers.current.set(e.pointerId, pt);
    const st = useProjectStore.getState();
    const cur = findNow(st.selectedId);

    if (pointers.current.size === 2) {
      tap.current = null; // 第二根手指：不是輕點
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      // 已經有選取：雙指不管落在哪裡都作用在已選的物件；沒有選取：選兩指中點下最上面的物件
      let target: { item: { id: string; transform: { scale: number; rotation: number } } } | null =
        cur && !cur.track.locked ? cur : null;
      if (!target) {
        const hit = hitsAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })[0];
        if (hit) {
          st.select(hit.item.id);
          target = hit;
        }
      }
      if (!target) return;
      setDragging(true);
      gesture.current = {
        type: 'pinch',
        id: target.item.id,
        startDist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        startAngle: Math.atan2(b.y - a.y, b.x - a.x),
        startScale: target.item.transform.scale,
        startRot: target.item.transform.rotation,
      };
      return;
    }
    if (pointers.current.size > 1) return;

    tap.current = {
      pointerId: e.pointerId,
      cx: e.clientX,
      cy: e.clientY,
      t: performance.now(),
      pt,
      moved: false,
    };
    // 按在「看不見的觸控區」（touch-action:none）上：立刻選取＋準備拖移。
    // 其他地方（含沒選取的大物件）只當成「可能是輕點」，放開時才判定，上下滑就是捲頁面、什麼都不改
    const hitEl = (e.target as HTMLElement).closest<HTMLElement>('[data-hit]');
    if (!hitEl || hitEl.dataset.eager !== '1') return;
    const id = hitEl.dataset.hit!;
    useUI.getState().player?.pause();
    if (id !== st.selectedId) {
      st.select(id);
      tap.current = null; // 這一下已經拿來選取了，不再算輕點（不會馬上換到下一層）
    }
    startMove(id, pt);
  };

  /** 輕點判定結束：選取最上面的，或已選的再點一次換下一層；點到空白什麼都不做 */
  const finishTap = (e: RPointerEvent) => {
    const tp = tap.current;
    tap.current = null;
    if (!tp || tp.pointerId !== e.pointerId || tp.moved) return;
    if (gesture.current?.type === 'move' && gesture.current.moved) return; // 拖移過了
    if (performance.now() - tp.t > TAP_MS) return;
    const hit = nextHit(hitsAt(tp.pt), useProjectStore.getState().selectedId);
    if (!hit) return;
    useUI.getState().player?.pause();
    if (hit.item.id !== useProjectStore.getState().selectedId) useProjectStore.getState().select(hit.item.id);
  };

  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const pt = toProj(e);
    pointers.current.set(e.pointerId, pt);
    if (tap.current && tap.current.pointerId === e.pointerId) {
      if (Math.hypot(e.clientX - tap.current.cx, e.clientY - tap.current.cy) > TAP_MOVE)
        tap.current.moved = true;
    }
    const g = gesture.current;
    if (!g) return;
    const f = findNow(g.id);
    if (!f) return;

    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      // 一次雙指手勢＝一步復原；旋轉吸附 0/90/180/270
      setTransform(
        g.id,
        {
          scale: clamp((g.startScale * dist) / g.startDist, 0.05, 10),
          rotation: snapRotation(g.startRot + ((ang - g.startAngle) * 180) / Math.PI),
        },
        `pinch:${g.id}`,
      );
      return;
    }
    if (g.type === 'move' && pointers.current.size === 1) {
      if (f.track.locked) return;
      const dx = pt.x - g.start.x;
      const dy = pt.y - g.start.y;
      if (!g.moved && Math.hypot(dx, dy) < 4 / k) return; // 小於 4px 當作點擊，不算移動
      g.moved = true;
      setDragging(true);
      const base = selectionBox(f.item, geo);
      if (!base) return;
      // 吸附用「看得到的內容」的方框；內容中心和物件中心（transform）可能不同（裝飾偏一邊）
      const offX = base.cx - f.item.transform.x * width;
      const offY = base.cy - f.item.transform.y * height;
      let cx = g.startX * width + dx;
      let cy = g.startY * height + dy;
      const snap = snapMove({ ...base, cx: cx + offX, cy: cy + offY }, width, height, 8 / k, true);
      cx += snap.dx;
      cy += snap.dy;
      setGuides({ x: snap.guideX, y: snap.guideY });
      setTransform(g.id, { x: cx / width, y: cy / height });
    }
  };

  const onPointerUp = (e: RPointerEvent) => {
    finishTap(e);
    pointers.current.delete(e.pointerId);
    setGuides({ x: null, y: null });
    if (pointers.current.size === 0) setDragging(false);
    if (pointers.current.size === 0) gesture.current = null;
    else if (pointers.current.size === 1 && gesture.current?.type === 'pinch') {
      // 兩指放掉一指：剩下的那一指接著當移動
      const [pt] = [...pointers.current.values()] as [Pt];
      startMove(gesture.current.id, pt);
    }
  };

  const onPointerCancel = (e: RPointerEvent) => {
    tap.current = null; // 瀏覽器接手去捲頁面了：不是輕點
    onPointerUp(e);
  };

  const toggleSafe = () => {
    const v = !safe;
    setSafe(v);
    if (v) toast('粉紅虛線＝IG／抖音按鈕會蓋住的地方，重點別放這裡；匯出的影片不會有這些線');
    try {
      localStorage.setItem(SAFE_KEY, v ? '1' : '0');
    } catch {
      /* 存不了就算了 */
    }
  };

  // 物件的觸控區（看不見）：按在上面＝拖物件；預覽其他地方上下滑＝捲頁面
  const hitBoxes: { id: string; b: Box }[] = [];
  if (hitIds) {
    for (const id of hitIds.split(',')) {
      const f = findItem(rproject, id);
      const b = f && selectionBox(f.item, geo);
      if (b) hitBoxes.push({ id, b });
    }
  }
  // 已選的觸控區放在最上面（版型的外框很大，不然會蓋住下面已選的格子，拖不動）
  if (sel && sel.item.type !== 'audio' && sel.item.group)
    hitBoxes.sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));
  // 從時間軸選了一個現在不在畫面上的物件：沒有觸控區（選取框也不會顯示）
  const minHit = 44 / k;
  // 預覽的底固定 9:16；版面在底裡面置中，外面蓋斜線（範圍外的東西也看得到、可以拖）
  const lay = stageLayout(width, height);
  const hasOut = lay.fx < 0.999 || lay.fy < 0.999;
  const pc = (n: number) => `${(n * 100).toFixed(4)}%`;
  const fl = (lay.offX / lay.baseW) * 100;
  const ft = (lay.offY / lay.baseH) * 100;
  const fr = fl + lay.fx * 100;
  const fb = ft + lay.fy * 100;

  // 斜線：預覽區裡所有不會輸出的地方（底裡面版面外面、底左右兩側的黑邊）；中間挖掉版面
  const bx0 = (dim.ww - dim.bw) / 2;
  const by0 = (dim.wh - dim.bh) / 2;
  const fx0 = bx0 + (fl / 100) * dim.bw;
  const fy0 = by0 + (ft / 100) * dim.bh;
  const fx1 = bx0 + (fr / 100) * dim.bw;
  const fy1 = by0 + (fb / 100) * dim.bh;
  const sideBars = dim.ww - dim.bw > 1 || dim.wh - dim.bh > 1;
  const hatch =
    dim.ww > 0 && (hasOut || sideBars)
      ? `polygon(evenodd, 0 0, ${dim.ww}px 0, ${dim.ww}px ${dim.wh}px, 0 ${dim.wh}px, 0 0, ${fx0}px ${fy0}px, ${fx0}px ${fy1}px, ${fx1}px ${fy1}px, ${fx1}px ${fy0}px, ${fx0}px ${fy0}px)`
      : null;
  // 預覽上每一格的編號（暫停、編輯時才有；匯出不會有）
  const badges = !playing && !cropping ? cellBadges(rproject, curT, geo, width, height) : [];

  return (
    <div className="stage-wrap" ref={wrapRef}>
      <div
        ref={baseRef}
        className="stage-base"
        data-testid="stage-base"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* key：比例改變就換一個新的 canvas（舊的 WebGL 環境被 Pixi 銷毀後不能在同一個 canvas 上重建） */}
        <canvas
          key={`${width}x${height}-${smooth ? 's' : 'c'}`}
          ref={canvasRef}
          data-testid="preview-canvas"
        />
        {holdSnap && (
          <img className="frame-hold" data-testid="frame-hold" src={holdSnap} alt="" aria-hidden="true" />
        )}
        <div ref={poolRef} className="pool" aria-hidden="true" />
        <PerfOverlay player={player} />
        {gradePeek && (
          <div className="peek-tag" data-testid="peek-tag" aria-hidden="true">
            原色預覽中
          </div>
        )}
        <AspectOverlay baseRef={baseRef} />
        {hasOut && (
          <>
            <div className="out-label" aria-hidden="true">
              框內是影片輸出範圍 · {aspectLabel(project)}
            </div>
          </>
        )}
        <div
          ref={stageRef}
          className={`stage${hasOut ? ' has-out' : ''}`}
          data-testid="stage"
          style={{
            left: pc(lay.offX / lay.baseW),
            top: pc(lay.offY / lay.baseH),
            width: pc(lay.fx),
            height: pc(lay.fy),
          }}
        >
          {(safe || dragging) && (
            <div className="safe" aria-hidden="true" data-testid="safe-zone">
              <div className="safe-bottom" style={{ height: `${SAFE_BOTTOM * 100}%` }}>
                <span>IG／抖音按鈕區</span>
              </div>
              <div className="safe-right" style={{ width: `${SAFE_RIGHT * 100}%` }}>
                <span>按鈕</span>
              </div>
            </div>
          )}
          {!playing && guides.x !== null && <div className="guide v" style={{ left: guides.x * k }} />}
          {!playing && guides.y !== null && <div className="guide h" style={{ top: guides.y * k }} />}

          {clipPts && !cropping && !playing && (
            <>
              <svg
                className="clip-area"
                data-testid="clip-area"
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polygon points={clipPts.map((p) => p.join(',')).join(' ')} />
              </svg>
              {!(sel && sel.item.type !== 'text' && sel.item.type !== 'audio' && sel.item.cell) && (
                <span
                  className="clip-tag"
                  style={{
                    left: Math.min(...clipPts.map((p) => p[0])) * k + 4,
                    top: Math.min(...clipPts.map((p) => p[1])) * k + 4,
                  }}
                >
                  只露出這個範圍
                </span>
              )}
            </>
          )}
          {lrFrame && !playing && <LayoutResize frame={lrFrame} geo={geo} k={k} />}
          {box && sel && !cropping && !playing && (
            <div
              className={`selbox${selLocked ? ' locked' : ''}${sel.item.group && !isFrameItem(sel.item) ? ' member' : ''}`}
              data-level={sel.item.group ? (isFrameItem(sel.item) ? 'group' : 'member') : undefined}
              data-testid="selbox"
              style={{
                left: box.cx * k,
                top: box.cy * k,
                width: box.w * k,
                height: box.h * k,
                transform: `translate(-50%, -50%) rotate(${box.rotation}deg)`,
              }}
            />
          )}
          {badges.map((b) => (
            <span
              key={b.key}
              className="cell-badge"
              data-testid="preview-cell-no"
              aria-hidden="true"
              style={{ left: b.x * k + 5, top: b.y * k + 5 }}
            >
              {b.n}
            </span>
          ))}
          {!cropping &&
            hitBoxes.map(({ id, b }) => {
              const pad = id === selectedId ? 40 / k : 0; // 選取中的物件觸控區外擴 40px，雙指比較好放（再大就擋住預覽上的捲頁面）
              const w = Math.max(b.w, minHit) + pad * 2;
              const h = Math.max(b.h, minHit) + pad * 2;
              // 沒選取的大物件（滿版影片）：觸控區不擋捲動，只靠輕點選取；選取中的、小的物件：可以直接拖
              const large = (b.w * b.h) / (width * height) >= LARGE_AREA;
              const eager = id === selectedId || !large;
              return (
                <div
                  key={id}
                  className={`hit${eager ? '' : ' soft'}`}
                  data-hit={id}
                  data-eager={eager ? '1' : '0'}
                  aria-hidden="true"
                  style={{
                    left: b.cx * k,
                    top: b.cy * k,
                    width: w * k,
                    height: h * k,
                    transform: `translate(-50%, -50%) rotate(${b.rotation}deg)`,
                  }}
                />
              );
            })}
        </div>
      </div>
      {hatch && (
        <div className="out-hatch" data-testid="out-hatch" aria-hidden="true" style={{ clipPath: hatch }} />
      )}
      {emptyAction && (
        <button className="empty-import" onClick={emptyAction}>
          ＋ 匯入影片或照片
        </button>
      )}
      {!cropping && (
        <button
          className="peek-toggle"
          aria-label="查看圖層"
          aria-pressed={peek}
          onClick={() => {
            player?.pause();
            setPeek((v) => !v);
          }}
        >
          <Layers size={18} />
          <span>圖層</span>
        </button>
      )}
      {peek && <LayerPeek project={project} time={player?.time ?? 0} onClose={() => setPeek(false)} />}
      {!cropping && (
        <button
          className="full-toggle"
          aria-label={previewFull ? '結束全螢幕預覽' : '全螢幕預覽'}
          aria-pressed={previewFull}
          onClick={() => useUI.setState({ previewFull: !previewFull })}
        >
          {previewFull ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      )}
      <button
        className={`safe-toggle${safe ? ' on' : ''}`}
        aria-label="安全區參考線"
        aria-pressed={safe}
        onClick={toggleSafe}
      >
        <ShieldCheck size={18} />
        <span>安全區</span>
      </button>
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** 這一刻看得到的版型，每一格左上角的位置（專案座標）與編號；版型旋轉、縮放也跟著 */
function cellBadges(
  p: Project,
  t: number,
  ctx: GeoCtx,
  W: number,
  H: number,
): { key: string; n: number; x: number; y: number }[] {
  const out: { key: string; n: number; x: number; y: number }[] = [];
  for (const tr of p.tracks)
    for (const it of tr.items) {
      if (!isFrameItem(it) || t < it.start || t >= it.start + it.duration) continue;
      // 一格有好幾列時只標一個編號（格號 cellNo）
      for (const cell of cellsOf(p.tracks, it.group!)) {
        const c = cell.tracks[0]!;
        const box = cell.rect ?? cellItems(c)[0]?.cell;
        if (!box) continue;
        const probe = { type: 'image', group: it.group, cell: box } as unknown as Item;
        const pts = groupClipArea(probe, it, ctx, W, H, { x: 0, y: 0 }, true);
        if (pts) out.push({ key: c.id, n: cell.no, x: pts[0]![0], y: pts[0]![1] });
      }
    }
  return out;
}

/** 點是不是在多邊形裡（射線法） */
function pointInPoly(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
