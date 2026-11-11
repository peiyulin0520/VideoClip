import { Maximize, Minimize, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { urlFor } from '../../engine/assetUrls';
import { installDebugHook } from '../../engine/debug';
import { useFonts } from '../../fonts/fontStore';
import {
  boxCorners,
  selectionBox,
  snapMove,
  snapRotation,
  SAFE_BOTTOM,
  SAFE_RIGHT,
  topHit,
} from '../../engine/geometry';
import { Player } from '../../engine/player';
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
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
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
    return () => ro.disconnect();
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

  const onPointerDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-handle]')) return;
    stageRef.current!.setPointerCapture(e.pointerId);
    const pt = toProj(e);
    pointers.current.set(e.pointerId, pt);
    const st = useProjectStore.getState();
    const cur = findItem(st.project!, st.selectedId);

    if (pointers.current.size === 2 && cur && !cur.track.locked) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      setDragging(true);
      gesture.current = {
        type: 'pinch',
        id: cur.item.id,
        startDist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        startAngle: Math.atan2(b.y - a.y, b.x - a.x),
        startScale: cur.item.transform.scale,
        startRot: cur.item.transform.rotation,
      };
      return;
    }
    if (pointers.current.size > 1) return;

    useUI.getState().player?.pause();
    const t = useUI.getState().player?.time ?? 0;
    const hit = topHit(visibleLayers(st.project!, t), geo, pt.x, pt.y, 40 / k);
    if (!hit) {
      st.select(null);
      gesture.current = null;
      return;
    }
    // 主軌是滿版的：預覽上單點它不選取、也不拖移（要選主軌請點時間軸）；已經從時間軸選了主軌時才可以在預覽上調整
    if (hit.track.kind === 'main' && hit.item.id !== st.selectedId) {
      st.select(null);
      gesture.current = null;
      return;
    }
    if (hit.item.id !== st.selectedId) st.select(hit.item.id);
    startMove(hit.item.id, pt);
  };

  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const pt = toProj(e);
    pointers.current.set(e.pointerId, pt);
    const g = gesture.current;
    if (!g) return;
    const f = findItem(useProjectStore.getState().project!, g.id);
    if (!f) return;

    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()] as [Pt, Pt];
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      setTransform(g.id, {
        scale: clamp((g.startScale * dist) / g.startDist, 0.05, 10),
        rotation: g.startRot + ((ang - g.startAngle) * 180) / Math.PI,
      });
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

  // ---- 四角小點：縮放（以中心為準）；上方小點：旋轉 ----
  const onHandleDown = (kind: 'scale' | 'rotate') => (e: RPointerEvent) => {
    if (!sel || !box || selLocked) return;
    e.stopPropagation();
    e.preventDefault();
    useUI.getState().player?.pause();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const id = sel.item.id;
    const r = stageRef.current!.getBoundingClientRect();
    const cx = r.left + (box.cx / width) * r.width;
    const cy = r.top + (box.cy / height) * r.height;
    const v0 = { x: e.clientX - cx, y: e.clientY - cy };
    const d0 = Math.hypot(v0.x, v0.y) || 1;
    const a0 = Math.atan2(v0.y, v0.x);
    setDragging(true);
    const s0 = sel.item.transform.scale;
    const r0 = sel.item.transform.rotation;
    const move = (ev: PointerEvent) => {
      const v = { x: ev.clientX - cx, y: ev.clientY - cy };
      if (kind === 'scale') {
        const d = Math.hypot(v.x, v.y);
        setTransform(id, { scale: clamp((s0 * d) / d0, 0.05, 10) }, `scale:${id}`);
      } else {
        const rot = snapRotation(r0 + ((Math.atan2(v.y, v.x) - a0) * 180) / Math.PI);
        setTransform(id, { rotation: rot }, `rotate:${id}`);
      }
    };
    const up = () => {
      setDragging(false);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
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

  // 四角小點與旋轉點：貼著方框，往框外偏一點（不蓋住物件），但夾在舞台內，方框比畫面大時（例如填滿的影片）也按得到
  let handles: { corners: Pt[]; rotate: Pt } | null = null;
  if (box) {
    const m = 18;
    const stageH = (height / width) * cssW;
    const c = { x: box.cx * k, y: box.cy * k };
    const out = (p: [number, number], d: number): Pt => {
      const vx = p[0] * k - c.x;
      const vy = p[1] * k - c.y;
      const len = Math.hypot(vx, vy) || 1;
      return {
        x: clamp(p[0] * k + (vx / len) * d, m, cssW - m),
        y: clamp(p[1] * k + (vy / len) * d, m, stageH - m),
      };
    };
    const cs = boxCorners(box);
    const topMid: [number, number] = [(cs[0]![0] + cs[1]![0]) / 2, (cs[0]![1] + cs[1]![1]) / 2];
    // 物件很小時，角點和旋轉點會擠在一起、觸控區互相蓋住：越小就推得越遠
    const extra = clamp((72 - Math.min(box.w, box.h) * k) / 2, 0, 18);
    handles = { corners: cs.map((p) => out(p, 10 + extra)), rotate: out(topMid, 28 + extra * 1.8) };
  }

  return (
    <div className="stage-wrap">
      <div
        ref={stageRef}
        className="stage"
        style={{ ['--ratio' as string]: `${width} / ${height}` }}
        data-testid="stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* key：比例改變就換一個新的 canvas（舊的 WebGL 環境被 Pixi 銷毀後不能在同一個 canvas 上重建） */}
        <canvas key={`${width}x${height}`} ref={canvasRef} data-testid="preview-canvas" />
        <div ref={poolRef} className="pool" aria-hidden="true" />

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

        {box && sel && (
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
        {box && sel && !selLocked && handles && (
          <>
            {handles.corners.map((p, i) => (
              <button
                key={i}
                data-handle="scale"
                className="sel-dot"
                aria-label="縮放（拖曳角落）"
                data-testid="scale-handle"
                style={{ left: p.x, top: p.y }}
                onPointerDown={onHandleDown('scale')}
              />
            ))}
            <button
              data-handle="rotate"
              className="sel-dot rotate"
              aria-label="旋轉（拖曳上方圓點）"
              data-testid="rotate-handle"
              style={{ left: handles.rotate.x, top: handles.rotate.y }}
              onPointerDown={onHandleDown('rotate')}
            />
          </>
        )}
      </div>
      {emptyAction && (
        <button className="empty-import" onClick={emptyAction}>
          ＋ 匯入影片或照片
        </button>
      )}
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
