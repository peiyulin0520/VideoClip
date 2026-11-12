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
import { LayerPeek } from './LayerPeek';
import { PerfOverlay } from './PerfOverlay';
import { CropOverlay } from './CropOverlay';
import { useCrop } from '../../store/cropStore';
import { geoCtx } from '../../engine/scene';
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
  const stageRef = useRef<HTMLDivElement>(null);
  const [cssW, setCssW] = useState(1);
  const [safe, setSafe] = useState(readSafe);
  const [dragging, setDragging] = useState(false); // 拖移/縮放中：安全區參考線暫時出現
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [selVisible, setSelVisible] = useState(true);
  const [hitIds, setHitIds] = useState(''); // 這一秒可以拖的物件（逗號分隔），給觸控區用
  const [peek, setPeek] = useState(false); // 「查看圖層」清單
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const cropping = useCrop((s) => !!s.s);
  const previewFull = useUI((s) => s.previewFull);
  const fontEpoch = useFonts((s) => s.epoch); // 字體載入完成：字卡大小可能變，選取框要重算

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
    }).then((player) => {
      if (cancelled) return player.destroy();
      created = player;
      useUI.setState({ player });
      const resume = resumeRef.current;
      player.seek(resume && resume.projectId === projectId ? resume.time : 0);
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
  }, [projectId, width, height]); // 比例改了（寬高變了）就重建預覽引擎

  // ---- 舞台大小（CSS px）----
  useEffect(() => {
    const el = stageRef.current!;
    const ro = new ResizeObserver(() => setCssW(el.clientWidth || 1));
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
    const check = (t: number) => {
      const p = useProjectStore.getState().project;
      const id = useProjectStore.getState().selectedId;
      const f = p && findItem(p, id);
      setSelVisible(
        !!f && (f.track.kind === 'main' || (t >= f.item.start && t < f.item.start + f.item.duration)),
      );
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geo = useMemo(() => geoCtx(project, width, height), [project, width, height, fontEpoch]);
  const sel = findItem(project, selectedId);
  const box = sel && selVisible ? selectionBox(sel.item, geo) : null;
  const selLocked = !!sel?.track.locked || !!sel?.track.hidden;

  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture | null>(null);
  const tap = useRef<Tap | null>(null);

  const toProj = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
  };

  const startMove = (id: string, at: Pt) => {
    const f = findItem(useProjectStore.getState().project!, id);
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
    return hitTestAll(visibleLayers(st.project!, t), geo, pt.x, pt.y, 40 / k);
  };

  const onPointerDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-handle]')) return;
    stageRef.current!.setPointerCapture(e.pointerId);
    const pt = toProj(e);
    pointers.current.set(e.pointerId, pt);
    const st = useProjectStore.getState();
    const cur = findItem(st.project!, st.selectedId);

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

    tap.current = { pointerId: e.pointerId, cx: e.clientX, cy: e.clientY, t: performance.now(), pt, moved: false };
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
      if (Math.hypot(e.clientX - tap.current.cx, e.clientY - tap.current.cy) > TAP_MOVE) tap.current.moved = true;
    }
    const g = gesture.current;
    if (!g) return;
    const f = findItem(useProjectStore.getState().project!, g.id);
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
      const f = findItem(project, id);
      const b = f && selectionBox(f.item, geo);
      if (b) hitBoxes.push({ id, b });
    }
  }
  // 從時間軸選了一個現在不在畫面上的物件：沒有觸控區（選取框也不會顯示）
  const minHit = 44 / k;

  return (
    <div className="stage-wrap" style={{ ['--inv-ratio' as string]: `${height / width}` }}>
      <div
        ref={stageRef}
        className="stage"
        style={{ ['--ratio' as string]: `${width} / ${height}` }}
        data-testid="stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {/* key：比例改變就換一個新的 canvas（舊的 WebGL 環境被 Pixi 銷毀後不能在同一個 canvas 上重建） */}
        <canvas key={`${width}x${height}`} ref={canvasRef} data-testid="preview-canvas" />
        <div ref={poolRef} className="pool" aria-hidden="true" />
        <PerfOverlay player={player} />

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
        {guides.x !== null && <div className="guide v" style={{ left: guides.x * k }} />}
        {guides.y !== null && <div className="guide h" style={{ top: guides.y * k }} />}

        {box && sel && !cropping && (
          <div
            className={`selbox${selLocked ? ' locked' : ''}${sel.track.kind === 'main' ? ' main' : ''}`}
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
        {cropping && <CropOverlay project={project} k={k} width={width} height={height} />}
      </div>
      {emptyAction && (
        <button className="empty-import" onClick={emptyAction}>
          ＋ 匯入影片或照片
        </button>
      )}
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
      {peek && <LayerPeek project={project} time={player?.time ?? 0} onClose={() => setPeek(false)} />}
      <button
        className="full-toggle"
        aria-label={previewFull ? '結束全螢幕預覽' : '全螢幕預覽'}
        aria-pressed={previewFull}
        onClick={() => useUI.setState({ previewFull: !previewFull })}
      >
        {previewFull ? <Minimize size={20} /> : <Maximize size={20} />}
      </button>
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
