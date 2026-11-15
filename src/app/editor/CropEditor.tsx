import { Brush, Eraser, Minus, Pause, Play, Plus, Redo2, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { urlFor } from '../../engine/assetUrls';
import { applyRatio, dragCrop, keepSize, smoothPolygon, type Handle } from '../../engine/crop';
import { composeKeep, drawStroke } from '../../engine/cropCompose';
import { findItem, isVideoItem } from '../../engine/timeline';
import type { Crop, CropStroke, VideoItem } from '../../model/types';
import {
  cancelCrop,
  commitCrop,
  finishCrop,
  MAX_REACH,
  redoCrop,
  saveReach,
  setLassoMask,
  undoCrop,
  updateCrop,
  useCrop,
  MASK_SIDE,
  type CropSnap,
  type CropTool,
  type Pt,
} from '../../store/cropStore';
import { useProjectStore } from '../../store/projectStore';
import { toast } from '../../store/uiStore';
import { Slider } from '../../ui/Slider';
import { CropFreeIcon, CropRectIcon } from './cropIcons';

// 裁切編輯畫面（獨立的全螢幕，一頁放得下、不用捲動）：上面是畫面（可以放大縮小），下面三列——
// ▶ ↩ ↪ 檢查結果 套用裁切；一般裁切｜自由裁切｜筆刷｜橡皮擦；目前工具的選項（比例、粗細／距離）。
// 四個工具互相獨立、可以一起用。工具列不蓋在畫面上；右上角 ❌ ＝這次做的都不存。

const HANDLES: Handle[] = ['tl', 'tr', 'bl', 'br', 'l', 'r', 't', 'b'];
const NAMES: Record<Handle, string> = {
  l: '左邊',
  r: '右邊',
  t: '上邊',
  b: '下邊',
  tl: '左上角',
  tr: '右上角',
  bl: '左下角',
  br: '右下角',
};
const TOOLS: { id: CropTool; label: string; icon: React.ReactNode }[] = [
  { id: 'rect', label: '一般', icon: <CropRectIcon /> },
  { id: 'lasso', label: '自由', icon: <CropFreeIcon /> },
  { id: 'brush', label: '筆刷', icon: <Brush size={18} aria-hidden="true" /> },
  { id: 'erase', label: '橡皮擦', icon: <Eraser size={18} aria-hidden="true" /> },
];
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const MAX_ZOOM = 4;

/** 去掉太近的點（筆畫太長會讓存檔變大） */
function thin(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.002) out.push(p);
  }
  if (out.length === 0 && pts[0]) out.push(pts[0]);
  return out;
}

/** 斜線＋變暗的花紋（被去掉的地方）／棋盤格（檢查結果時，透明的地方） */
function tile(kind: 'dim' | 'check'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d')!;
  if (kind === 'dim') {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 0, 48, 48);
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-4, 52);
    g.lineTo(52, -4);
    g.moveTo(-28, 28);
    g.lineTo(28, -28);
    g.moveTo(20, 76);
    g.lineTo(76, 20);
    g.stroke();
  } else {
    g.fillStyle = '#e8e8e8';
    g.fillRect(0, 0, 48, 48);
    g.fillStyle = '#bdbdbd';
    g.fillRect(0, 0, 24, 24);
    g.fillRect(24, 24, 24, 24);
  }
  return c;
}

export function CropEditor() {
  const s = useCrop((st) => st.s);
  const project = useProjectStore((st) => st.project);
  const selectedId = useProjectStore((st) => st.selectedId);
  const open = !!s;

  // 選了別的片段、或片段不見了（復原）就離開裁切模式
  useEffect(() => {
    if (s && selectedId !== s.itemId) cancelCrop();
  }, [s, selectedId]);

  // 裁切時整頁不能捲動
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const found = s && project ? findItem(project, s.itemId) : null;
  const item = found && isVideoItem(found.item) ? found.item : null;
  const asset = item && project ? project.assets.find((a) => a.id === item.assetId) : null;
  useEffect(() => {
    if (open && project && !item) cancelCrop();
  }, [open, project, item]);
  if (!s || !project || !item || !asset) return null;
  return <Editor key={s.itemId} />;
}

function Editor() {
  const s = useCrop((st) => st.s)!;
  const project = useProjectStore((st) => st.project)!;
  const found = findItem(project, s.itemId)!;
  const item = found.item as VideoItem;
  const asset = project.assets.find((a) => a.id === item.assetId)!;
  const isVideo = item.type === 'video';
  const mediaUrl = urlFor(project.id, asset.id);
  const A = asset.width / Math.max(asset.height, 1);

  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const tintRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cursorRef = useRef<HTMLElement>(null);
  const fingerRef = useRef<HTMLElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const [stage, setStage] = useState({ w: 300, h: 400 });
  const [zoom, setZoom] = useState({ z: 1, x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const [lassoPts, setLassoPts] = useState<Pt[] | null>(null);
  const [playing, setPlaying] = useState(false);

  // ---- 畫面大小 ----
  useEffect(() => {
    const el = stageRef.current!;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth || 1, h: el.clientHeight || 1 }));
    ro.observe(el);
    setStage({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    return () => ro.disconnect();
  }, []);
  let fw = Math.min(stage.w, stage.h * A);
  let fh = fw / A;
  if (fh > stage.h) {
    fh = stage.h;
    fw = fh * A;
  }

  // ---- 留下的範圍：keep（不透明＝留下）＋ tint（去掉的地方蓋斜線變暗） ----
  const kw = Math.max(Math.round(asset.width * (MASK_SIDE / Math.max(asset.width, asset.height, 1))), 8);
  const kh = Math.max(Math.round(asset.height * (MASK_SIDE / Math.max(asset.width, asset.height, 1))), 8);
  const keep = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = kw;
    c.height = kh;
    return c;
  }, [kw, kh]);
  const dimTile = useMemo(() => tile('dim'), []);
  const checkTile = useMemo(() => tile('check'), []);

  const rebuild = (checking: boolean) => {
    const cur = useCrop.getState().s;
    const tint = tintRef.current;
    if (!cur || !tint) return;
    composeKeep(keep.getContext('2d')!, kw, kh, cur.crop, cur.mask, cur.strokes, cur.base);
    if (tint.width !== kw) tint.width = kw;
    if (tint.height !== kh) tint.height = kh;
    const g = tint.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, kw, kh);
    g.fillStyle = g.createPattern(checking ? checkTile : dimTile, 'repeat')!;
    g.fillRect(0, 0, kw, kh);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(keep, 0, 0);
    g.globalCompositeOperation = 'source-over';
  };
  useEffect(() => {
    rebuild(s.checking);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.crop, s.mask, s.strokes, s.base, s.checking, keep]);

  /** 刷的時候：只畫這一小段（keep 和 tint 都增量更新，不重畫整張、不動 React 狀態） */
  const paintSeg = (a: Pt, b: Pt, mode: 'keep' | 'erase', w: number) => {
    const seg: CropStroke = { mode, w, pts: a[0] === b[0] && a[1] === b[1] ? [a] : [a, b] };
    drawStroke(keep.getContext('2d')!, seg, kw, kh);
    const g = tintRef.current?.getContext('2d');
    if (!g) return;
    // 留下＝tint 把這裡挖掉；去掉＝tint 把這裡蓋回斜線
    const pat = g.createPattern(dimTile, 'repeat')!;
    drawStroke(
      g,
      { ...seg, mode: mode === 'keep' ? 'erase' : 'keep' },
      kw,
      kh,
      mode === 'keep' ? undefined : pat,
    );
  };

  // ---- 手指座標：用畫面現在的位置換算（已經含放大縮小） ----
  const rect = () => frameRef.current!.getBoundingClientRect();
  const rawPoint = (ev: { clientX: number; clientY: number }, dyPx = 0): Pt => {
    const r = rect();
    return [(ev.clientX - r.left) / r.width, (ev.clientY - dyPx - r.top) / r.height];
  };

  // ---- 拖四邊、四角、整塊 ----
  const startDrag = (e: RPointerEvent, kind: Handle | 'move') => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const r = rect();
    const before: CropSnap = { crop: { ...s.crop }, mask: s.mask, strokes: s.strokes };
    const start: Crop = { ...s.crop };
    const move = (ev: PointerEvent) => {
      const fx = (ev.clientX - x0) / r.width;
      const fy = (ev.clientY - y0) / r.height;
      if (kind === 'move') {
        const w = 1 - start.l - start.r;
        const h = 1 - start.t - start.b;
        const l = clamp(start.l + fx, 0, 1 - w);
        const t = clamp(start.t + fy, 0, 1 - h);
        updateCrop({ crop: { l, t, r: 1 - w - l, b: 1 - h - t } });
      } else updateCrop({ crop: dragCrop(start, kind, fx, fy, A, useCrop.getState().s?.lock ?? null) });
    };
    const done = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      abortRef.current = null;
    };
    const up = () => {
      done();
      commitCrop(before);
    };
    abortRef.current = () => {
      done();
      updateCrop({ crop: before.crop });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // ---- 自由裁切：畫一圈 ----
  const startLasso = (e: RPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const clampPt = (p: Pt): Pt => [clamp(p[0], 0, 1), clamp(p[1], 0, 1)];
    const pts: Pt[] = [clampPt(rawPoint(e))];
    setLassoPts([...pts]);
    const move = (ev: PointerEvent) => {
      pts.push(clampPt(rawPoint(ev)));
      setLassoPts([...pts]);
    };
    const done = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      abortRef.current = null;
      setLassoPts(null);
    };
    const up = () => {
      done();
      const poly = smoothPolygon(pts);
      if (!poly) return toast('圈太小了，沿著要留下的範圍畫一整圈');
      setLassoMask(poly);
    };
    abortRef.current = done;
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // ---- 筆刷／橡皮擦 ----
  const startPaint = (e: RPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const st0 = useCrop.getState().s!;
    const mode = st0.tool === 'erase' ? 'erase' : 'keep';
    const w = st0.brush;
    const reach = st0.reach;
    const before: CropSnap = { crop: { ...st0.crop }, mask: st0.mask, strokes: st0.strokes };
    const focusOf = (ev: { clientX: number; clientY: number }): Pt => {
      const q = rawPoint(ev, reach);
      return [clamp(q[0], 0, 1), clamp(q[1], 0, 1)];
    };
    const showMarks = (ev: { clientX: number; clientY: number }, focus: Pt | null) => {
      const f = fingerRef.current;
      const c = cursorRef.current;
      const raw = rawPoint(ev);
      if (f) {
        f.style.display = focus ? 'block' : 'none';
        f.style.left = `${raw[0] * 100}%`;
        f.style.top = `${raw[1] * 100}%`;
      }
      if (c) {
        c.style.display = focus ? 'block' : 'none';
        if (focus) {
          c.style.left = `${focus[0] * 100}%`;
          c.style.top = `${focus[1] * 100}%`;
        }
      }
    };
    // 按下去先只移動、不畫（不會在錯的地方點一點）：手指移動超過 4px、或按住 250ms 才開始畫
    const x0 = e.clientX;
    const y0 = e.clientY;
    let drawing = false;
    let last = focusOf(e);
    const pts: Pt[] = [];
    showMarks(e, last);
    const begin = (at: Pt) => {
      if (drawing) return;
      drawing = true;
      pts.push(at);
      paintSeg(at, at, mode, w);
      last = at;
    };
    const timer = window.setTimeout(() => begin(last), 250);
    const move = (ev: PointerEvent) => {
      const p = focusOf(ev);
      showMarks(ev, p);
      if (!drawing) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) <= 4) return;
        begin(last); // 從按下去時焦點圓的位置開始畫起
      }
      paintSeg(last, p, mode, w);
      pts.push(p);
      last = p;
    };
    const done = () => {
      window.clearTimeout(timer);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      abortRef.current = null;
      showMarks(e, null);
    };
    const up = () => {
      done();
      if (!drawing) return;
      commitCrop(before, { strokes: [...before.strokes, { mode, w, pts: thin(pts) }] });
    };
    abortRef.current = () => {
      done();
      if (drawing) rebuild(useCrop.getState().s!.checking); // 這一筆不算：整張重畫回來
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // ---- 放大縮小：兩指捏合＋兩指平移；一指是目前的工具 ----
  const setZoomAt = (z: number, cx: number, cy: number, x0: number, y0: number, z0: number) => {
    const nz = clamp(z, 1, MAX_ZOOM);
    // 保持 (cx, cy)（畫面內容座標）在手指下面
    const nx = x0 - cx * (nz - z0);
    const ny = y0 - cy * (nz - z0);
    setZoom({ z: nz, x: clamp(nx, stage.w * (1 - nz), 0), y: clamp(ny, stage.h * (1 - nz), 0) });
  };
  useEffect(() => {
    const el = stageRef.current!;
    const ptrs = new Map<number, { x: number; y: number }>();
    let pinch: { d0: number; z0: number; cx: number; cy: number } | null = null;
    let locked = false;
    const two = () => {
      const [a, b] = [...ptrs.values()];
      return { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), mx: (a!.x + b!.x) / 2, my: (a!.y + b!.y) / 2 };
    };
    const down = (e: PointerEvent) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size >= 2) {
        locked = true;
        abortRef.current?.(); // 第一指已經開始畫／拖的：這一下不算
        if (!pinch) {
          const t = two();
          const r = el.getBoundingClientRect();
          const z = zoomRef.current;
          pinch = {
            d0: Math.max(t.d, 1),
            z0: z.z,
            cx: (t.mx - r.left - z.x) / z.z,
            cy: (t.my - r.top - z.y) / z.z,
          };
        }
        e.stopPropagation();
      } else if (locked) e.stopPropagation();
    };
    const move = (e: PointerEvent) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size >= 2) {
        const t = two();
        const r = el.getBoundingClientRect();
        const nz = clamp(pinch.z0 * (t.d / pinch.d0), 1, MAX_ZOOM);
        const nx = t.mx - r.left - pinch.cx * nz;
        const ny = t.my - r.top - pinch.cy * nz;
        setZoom({
          z: nz,
          x: clamp(nx, r.width * (1 - nz), 0),
          y: clamp(ny, r.height * (1 - nz), 0),
        });
        e.stopPropagation();
      } else if (locked) e.stopPropagation();
    };
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (locked) e.stopPropagation();
      if (ptrs.size === 0) locked = false;
    };
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', up, true);
    el.addEventListener('pointercancel', up, true);
    return () => {
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', up, true);
      el.removeEventListener('pointercancel', up, true);
    };
  }, []);
  const stepZoom = (d: number) =>
    setZoomAt(
      zoom.z + d,
      (stage.w / 2 - zoom.x) / zoom.z,
      (stage.h / 2 - zoom.y) / zoom.z,
      zoom.x,
      zoom.y,
      zoom.z,
    );

  // ---- 播放 ----
  const srcEnd = item.type === 'video' ? item.trimIn + item.duration * item.speed : 0;
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) return v.pause();
    v.muted = false;
    if (v.currentTime >= srcEnd - 0.05 || v.currentTime < item.trimIn - 0.05) v.currentTime = s.srcT;
    void v.play().catch(() => {});
  };

  const c = s.crop;
  const poly = lassoPts ?? s.mask;
  const kept = keepSize(c);
  const PRESETS: { key: string; label: string; ratio: number | null }[] = [
    { key: 'free', label: '自由', ratio: null },
    ...(item.cell
      ? [
          {
            key: 'cell',
            label: '格子比例',
            ratio: (item.cell.w * project.width) / (item.cell.h * project.height),
          },
        ]
      : []),
    { key: 'orig', label: '原比例', ratio: A },
    { key: '1:1', label: '1:1', ratio: 1 },
    { key: '9:16', label: '9:16', ratio: 9 / 16 },
    { key: '4:5', label: '4:5', ratio: 4 / 5 },
    { key: '16:9', label: '16:9', ratio: 16 / 9 },
  ];
  const isActive = (r: number | null) =>
    r === null ? s.lock === null : s.lock !== null && Math.abs(s.lock - r) < 1e-6;
  const showTools = !s.checking;

  return (
    <div className="crop-editor" data-testid="crop-layer" role="dialog" aria-label="裁切" aria-modal="true">
      <div className="ce-head">
        <b className="ce-size" data-testid="crop-size">
          保留 {Math.round(kept.w * 100)}% × {Math.round(kept.h * 100)}%
        </b>
        <span className="grow" />
        <div className="ce-zoomctl" role="group" aria-label="放大縮小">
          <button
            className="rm-icon-btn sm"
            aria-label="縮小畫面"
            disabled={zoom.z <= 1}
            onClick={() => stepZoom(-0.5)}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <button
            className="ce-zoomval"
            aria-label="畫面回到 100%"
            data-testid="crop-zoom"
            onClick={() => setZoom({ z: 1, x: 0, y: 0 })}
          >
            {Math.round(zoom.z * 100)}%
          </button>
          <button
            className="rm-icon-btn sm"
            aria-label="放大畫面"
            disabled={zoom.z >= MAX_ZOOM}
            onClick={() => stepZoom(0.5)}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        <button className="sheet-close" aria-label="關閉" data-testid="crop-close" onClick={cancelCrop}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="ce-stage" ref={stageRef} data-testid="crop-stage">
        <div
          className="ce-zoom"
          style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.z})` }}
        >
          <div
            ref={frameRef}
            className="crop-frame"
            data-testid="crop-frame"
            style={{ width: fw, height: fh }}
          >
            {isVideo && mediaUrl ? (
              <video
                ref={videoRef}
                className="ce-media"
                src={mediaUrl}
                playsInline
                muted
                preload="auto"
                data-testid="crop-video"
                onLoadedMetadata={(e) => {
                  e.currentTarget.currentTime = s.srcT;
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => {
                  if (e.currentTarget.currentTime >= srcEnd) e.currentTarget.pause();
                }}
              />
            ) : mediaUrl ? (
              <img className="ce-media" src={mediaUrl} alt="" />
            ) : (
              <div className="ce-media ce-nomedia">（沒有預覽畫面）</div>
            )}
            <canvas ref={tintRef} className="crop-tint" data-testid="crop-tint" aria-hidden="true" />
            {poly && poly.length >= 2 && showTools && (
              <svg className="crop-poly" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
                {lassoPts ? (
                  <polyline points={poly.map((p) => p.join(',')).join(' ')} />
                ) : (
                  <polygon points={poly.map((p) => p.join(',')).join(' ')} data-testid="crop-polygon" />
                )}
              </svg>
            )}
            {showTools && s.tool === 'lasso' && (
              <div className="crop-lasso" data-testid="crop-lasso" onPointerDown={startLasso} />
            )}
            {showTools && (s.tool === 'brush' || s.tool === 'erase') && (
              <div className="crop-paint" data-testid="crop-paint" onPointerDown={startPaint}>
                <i
                  ref={fingerRef}
                  className="brush-finger"
                  data-testid="brush-finger"
                  style={{ display: 'none' }}
                />
                <i
                  ref={cursorRef}
                  className="brush-cursor"
                  data-testid="brush-cursor"
                  style={{ display: 'none', width: s.brush * fw * zoom.z, height: s.brush * fw * zoom.z }}
                />
              </div>
            )}
            {showTools && s.tool === 'rect' && (
              <div
                className="crop-rect"
                data-testid="crop-rect"
                style={{
                  left: `${c.l * 100}%`,
                  top: `${c.t * 100}%`,
                  right: `${c.r * 100}%`,
                  bottom: `${c.b * 100}%`,
                }}
                onPointerDown={(e) => startDrag(e, 'move')}
              >
                {HANDLES.map((h) => (
                  <div
                    key={h}
                    className={`crop-h ${h}`}
                    data-testid={`crop-h-${h}`}
                    role="slider"
                    aria-label={`裁切 ${NAMES[h]}`}
                    onPointerDown={(e) => startDrag(e, h)}
                  >
                    <i />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ce-bar" data-testid="crop-bar">
        {isVideo && (
          <button
            className="rm-icon-btn"
            aria-label={playing ? '暫停' : '播放'}
            data-testid="crop-play"
            onClick={togglePlay}
          >
            {playing ? (
              <Pause size={20} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={20} fill="currentColor" aria-hidden="true" />
            )}
          </button>
        )}
        <button
          className="rm-icon-btn"
          aria-label="復原裁切"
          data-testid="crop-undo"
          disabled={s.history.length === 0}
          onClick={undoCrop}
        >
          <Undo2 size={20} aria-hidden="true" />
        </button>
        <button
          className="rm-icon-btn"
          aria-label="重做裁切"
          data-testid="crop-redo"
          disabled={s.redo.length === 0}
          onClick={redoCrop}
        >
          <Redo2 size={20} aria-hidden="true" />
        </button>
        <button
          className={`btn${s.checking ? ' primary' : ''}`}
          aria-pressed={s.checking}
          data-testid="crop-check"
          onClick={() => updateCrop({ checking: !s.checking })}
        >
          檢查結果
        </button>
        <button className="btn primary grow" data-testid="crop-apply" onClick={finishCrop}>
          套用裁切
        </button>
      </div>

      <div className="ce-divider" aria-hidden="true" />
      <section className="ce-toolcard" aria-label="裁切工具">
        <div className="ce-toolcard-title">裁切工具</div>
        <div className="ce-tools" role="radiogroup" aria-label="選擇裁切工具" data-testid="crop-tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={s.tool === t.id}
              className={`ce-tool${s.tool === t.id ? ' on' : ''}`}
              data-testid={`crop-tool-${t.id}`}
              onClick={() => updateCrop({ tool: t.id, checking: false })}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="ce-ctx" data-testid="crop-options">
          {s.tool === 'rect' && (
            <div className="ce-chips" role="radiogroup" aria-label="裁切比例">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  role="radio"
                  aria-checked={isActive(p.ratio)}
                  className={`chip${isActive(p.ratio) ? ' active' : ''}`}
                  onClick={() => {
                    const before: CropSnap = { crop: { ...s.crop }, mask: s.mask, strokes: s.strokes };
                    if (p.ratio === null) updateCrop({ lock: null });
                    else {
                      updateCrop({ lock: p.ratio });
                      commitCrop(before, { crop: applyRatio(s.crop, p.ratio, A) });
                    }
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {s.tool === 'lasso' && (
            <div className="ce-lasso">
              <span className="hint">用手指沿著要留下的範圍畫一整圈，放開就裁好。</span>
              {s.mask && (
                <button className="chip" onClick={() => setLassoMask(null)}>
                  清除形狀
                </button>
              )}
            </div>
          )}
          {(s.tool === 'brush' || s.tool === 'erase') && (
            <div className="ce-paint" data-testid="paint-bar">
              <div className="paint-size">
                <Slider
                  label="粗細"
                  value={Math.round(s.brush * 100)}
                  min={1}
                  max={15}
                  step={1}
                  format={(v) => `${v}%`}
                  onChange={(v) => updateCrop({ brush: v / 100 })}
                />
              </div>
              <div className="paint-size">
                <Slider
                  label="距離"
                  value={s.reach}
                  min={0}
                  max={MAX_REACH}
                  step={5}
                  format={(v) => `${v}px`}
                  onChange={(v) => {
                    saveReach(v);
                    updateCrop({ reach: v });
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
