import { X } from 'lucide-react';
import { useRef, type PointerEvent as RPointerEvent } from 'react';
import type { GeoCtx } from '../../engine/geometry';
import { itemBox } from '../../engine/geometry';
import type { VideoItem } from '../../model/types';
import { useUI } from '../../store/uiStore';
import { reshapeLayout } from './frameRestyle';

// 調整版型大小：預覽上多一個虛線框（版型現在占的範圍，版型旋轉也跟著轉），四邊四角有把手，寬、高可以分開拉；
// 框永遠以版型中心為準（拖一邊＝兩邊一起動）。拖的時候顯示「寬 × 高」百分比，按「套用」才重排版型，✕ 放棄。

const MIN_BOX = 0.25; // 版型最小占畫面的比例
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
type Edge = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br';
const EDGES: Edge[] = ['l', 'r', 't', 'b', 'tl', 'tr', 'bl', 'br'];

export function LayoutResize({ frame, geo, k }: { frame: VideoItem; geo: GeoCtx; k: number }) {
  const edit = useUI((s) => s.layoutEdit);
  const start = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const fb = itemBox(frame, geo);
  if (!edit || edit.group !== frame.group || !fb) return null;
  const box = frame.frameStyle?.box ?? { w: 1, h: 1 };
  const v = frame.visible ?? { x: 0, y: 0, w: 1, h: 1 };
  const rot = (fb.rotation * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const ox = (v.x + v.w / 2 - 0.5) * fb.w;
  const oy = (v.y + v.h / 2 - 0.5) * fb.h;
  const cx = fb.cx + ox * cos - oy * sin;
  const cy = fb.cy + ox * sin + oy * cos;
  const vw0 = v.w * fb.w; // 版型現在在畫面上的寬、高（專案像素）
  const vh0 = v.h * fb.h;
  const sxLim: [number, number] = [MIN_BOX / box.w, 1 / box.w];
  const syLim: [number, number] = [MIN_BOX / box.h, 1 / box.h];
  const set = (sx: number, sy: number) =>
    useUI.setState({
      layoutEdit: { ...edit, sx: clamp(sx, ...sxLim), sy: clamp(sy, ...syLim) },
    });

  const down = (e: RPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, sx: edit.sx, sy: edit.sy };
  };
  const move = (e: RPointerEvent, edge: Edge) => {
    const s = start.current;
    if (!s) return;
    // 手指移動量轉到版型自己的方向（版型旋轉過），再換成專案像素；框以中心對稱
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const lx = (dx * cos + dy * sin) / k;
    const ly = (-dx * sin + dy * cos) / k;
    const gx = edge.includes('r') ? 1 : edge.includes('l') ? -1 : 0;
    const gy = edge.includes('b') ? 1 : edge.includes('t') ? -1 : 0;
    set(s.sx + (gx * 2 * lx) / vw0, s.sy + (gy * 2 * ly) / vh0);
  };
  const up = () => {
    start.current = null;
  };
  const bw = Math.round(box.w * edit.sx * 100);
  const bh = Math.round(box.h * edit.sy * 100);
  // 「寬 × 高、套用」那一排放在不會蓋住把手的地方（把手都在框裡面靠邊：上邊、四角在框的上緣往下 44px，左右中間在正中央）：
  // 框的上面放得下就放上面，不然下面放得下放下面，都放不下（框占滿畫面）才放在框裡面、上邊把手的下面
  const CARD_H = 56;
  const frameTop = (cy - (vh0 * edit.sy) / 2) * k;
  const frameBottom = (cy + (vh0 * edit.sy) / 2) * k;
  const cardTop =
    frameTop - CARD_H - 6 >= 4
      ? frameTop - CARD_H - 6
      : frameBottom + 6 + CARD_H <= geo.canvasH * k
        ? frameBottom + 6
        : Math.max(frameTop, 0) + 48;
  return (
    <>
      <div
        className="lr-frame"
        data-testid="layout-resize-frame"
        style={{
          left: cx * k,
          top: cy * k,
          width: vw0 * edit.sx * k,
          height: vh0 * edit.sy * k,
          transform: `translate(-50%, -50%) rotate(${fb.rotation}deg)`,
        }}
      >
        {EDGES.map((edge) => (
          <div
            key={edge}
            className={`crop-h ${edge}`}
            data-handle="layout"
            data-testid={`layout-h-${edge}`}
            onPointerDown={down}
            onPointerMove={(e) => move(e, edge)}
            onPointerUp={up}
            onPointerCancel={up}
          >
            <i />
          </div>
        ))}
      </div>
      <div className="ao-card lr-card" data-handle="layout" style={{ top: cardTop }}>
        <div className="ao-head">
          <b>調整版型大小</b>
          <button
            className="icon-btn ao-close"
            aria-label="放棄調整版型大小"
            data-testid="layout-resize-close"
            onClick={() => useUI.setState({ layoutEdit: null })}
          >
            <X size={20} />
          </button>
        </div>
        <span data-testid="layout-resize-text">
          寬 {bw}% × 高 {bh}%
        </span>
        <p className="ao-hint">拖虛線框的四邊、四角</p>
        <button
          className="btn primary"
          data-testid="layout-resize-apply"
          onClick={() => {
            const g = frame.group!;
            useUI.setState({ layoutEdit: null });
            void reshapeLayout(g, { box: { w: box.w * edit.sx, h: box.h * edit.sy } });
          }}
        >
          套用
        </button>
      </div>
    </>
  );
}
