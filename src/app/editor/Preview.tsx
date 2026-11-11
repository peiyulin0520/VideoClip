import { Maximize2, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { urlFor } from '../../engine/assetUrls';
import { installDebugHook } from '../../engine/debug';
import { useFonts } from '../../fonts/fontStore';
import {
  boxCorners,
  itemBox,
  snapMove,
  snapRotation,
  SAFE_BOTTOM,
  SAFE_RIGHT,
  topHit,
} from '../../engine/geometry';
import { Player } from '../../engine/player';
import { geoCtx } from '../../engine/scene';
import { findItem, visibleLayers } from '../../engine/timeline';
import { removeAnyItem, setTransform } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
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

export function Preview({ projectId, width, height }: { projectId: string; width: number; height: number }) {
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
  const box = sel && selVisible ? itemBox(sel.item, geo) : null;
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
    const hit = topHit(visibleLayers(st.project!, t), geo, pt.x, pt.y);
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
      const base = itemBox(f.item, geo);
      if (!base) return;
      let cx = g.startX * width + dx;
      let cy = g.startY * height + dy;
      const snap = snapMove({ ...base, cx, cy }, width, height, 8 / k, true);
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

  // ---- 右上角：縮放＋旋轉 ----
  const onScaleDown = (e: RPointerEvent) => {
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
      const d = Math.hypot(v.x, v.y);
      const rot = snapRotation(r0 + ((Math.atan2(v.y, v.x) - a0) * 180) / Math.PI);
      setTransform(id, { scale: clamp((s0 * d) / d0, 0.05, 10), rotation: rot }, `scale:${id}`);
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

  // 縮放鈕（右上）與刪除鈕（左上）：跟著方框的角走，但夾在舞台內，方框比畫面大時（例如填滿的影片）也按得到
  let handles: { tl: Pt; tr: Pt } | null = null;
  if (box) {
    const [tl, tr] = boxCorners(box);
    const m = 22;
    const cl = (p: [number, number]): Pt => ({
      x: clamp(p[0] * k, m, cssW - m),
      y: clamp(p[1] * k, m, (height / width) * cssW - m),
    });
    handles = { tl: cl(tl!), tr: cl(tr!) };
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
            {/* 主軌不放 ✕：在預覽上一鍵刪掉整段主軌太容易誤觸，刪除請用工具列 */}
            {sel.track.kind !== 'main' && (
              <button
                data-handle="del"
                className="sel-handle"
                aria-label="刪除圖層"
                style={{ left: handles.tl.x, top: handles.tl.y }}
                onClick={() => removeAnyItem(sel.item.id)}
              >
                <span>
                  <X size={14} />
                </span>
              </button>
            )}
            <button
              data-handle="scale"
              className="sel-handle scale"
              aria-label="縮放與旋轉"
              data-testid="scale-handle"
              style={{ left: handles.tr.x, top: handles.tr.y }}
              onPointerDown={onScaleDown}
            >
              <span>
                <Maximize2 size={14} />
              </span>
            </button>
          </>
        )}
      </div>
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
