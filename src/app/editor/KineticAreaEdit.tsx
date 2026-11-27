import { X } from 'lucide-react';
import { useRef, type PointerEvent as RPointerEvent } from 'react';
import type { TextItem } from '../../model/types';
import { setKineticArea } from '../../store/actions';
import { useUI } from '../../store/uiStore';

// 調整動態字卡的顯示範圍：預覽上一個虛線框（跟著字卡旋轉、縮放），四邊四角有把手（拖一邊＝只動那一邊，對邊不動），
// 拖框裡面＝整個框移動。按「套用」才寫回，✕ 放棄。框外面的字一律看不到。

type Edge = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br';
const EDGES: Edge[] = ['l', 'r', 't', 'b', 'tl', 'tr', 'bl', 'br'];
const MIN = 0.1; // 框最小占畫面寬、高的比例
/** 框在畫面上最多是畫面的幾倍（寬、高各自）；字卡縮小時（sc＜1）換算成框的大小可以更大 */
const MAX_ON_SCREEN = 3;
/** 框的大小（寬、高各自，佔畫面的比例）的硬上限：框是一張跟它一樣大的畫布，太大會吃光記憶體 */
const MAX_CANVAS = 4;
/** 框的面積（寬比例 × 高比例）的上限：最多是畫面的 6 倍 */
const MAX_AREA = 6;
const maxOf = (sc: number) => Math.min(MAX_ON_SCREEN / Math.max(sc, 0.05), MAX_CANVAS);
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

type Draft = { id: string; x: number; y: number; w: number; h: number };

/** 拖把手／框的換算（純函式，有單元測試）：d＝開始時的草稿；dx、dy＝手指在專案像素的移動量；W、H＝畫面；sc、rot＝字卡的縮放與旋轉（弧度） */
export function dragArea(
  d: Draft,
  mode: Edge | 'move',
  dx: number,
  dy: number,
  W: number,
  H: number,
  sc: number,
  rot: number,
): Draft {
  if (mode === 'move') return { ...d, x: d.x + dx / W, y: d.y + dy / H };
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // 手指移動量轉到框自己的方向（框旋轉過）
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const w0 = d.w * W * sc;
  const h0 = d.h * H * sc;
  let L = -w0 / 2;
  let R = w0 / 2;
  let T = -h0 / 2;
  let B = h0 / 2;
  if (mode.includes('l')) L += lx;
  if (mode.includes('r')) R += lx;
  if (mode.includes('t')) T += ly;
  if (mode.includes('b')) B += ly;
  const minW = MIN * W * sc;
  const minH = MIN * H * sc;
  const maxW = maxOf(sc) * W * sc;
  const maxH = maxOf(sc) * H * sc;
  // 太小：動到的那一邊停住（對邊不動）；太大一樣
  const left = mode.includes('l');
  const top = mode.includes('t');
  if (R - L < minW) {
    if (left) L = R - minW;
    else R = L + minW;
  }
  if (B - T < minH) {
    if (top) T = B - minH;
    else B = T + minH;
  }
  if (R - L > maxW) {
    if (left) L = R - maxW;
    else R = L + maxW;
  }
  if (B - T > maxH) {
    if (top) T = B - maxH;
    else B = T + maxH;
  }
  // 面積太大（畫布記憶體）：動到的那一邊停住；角落兩邊一起等比例縮
  const maxA = MAX_AREA * W * H * sc * sc;
  if ((R - L) * (B - T) > maxA) {
    const horiz = mode.includes('l') || mode.includes('r');
    const vert = mode.includes('t') || mode.includes('b');
    const setW = (nw: number) => (left ? (L = R - nw) : (R = L + nw));
    const setH = (nh: number) => (top ? (T = B - nh) : (B = T + nh));
    if (horiz && !vert) setW(maxA / (B - T));
    else if (vert && !horiz) setH(maxA / (R - L));
    else {
      const f = Math.sqrt(maxA / ((R - L) * (B - T)));
      setW((R - L) * f);
      setH((B - T) * f);
    }
  }
  const cxl = (L + R) / 2;
  const cyl = (T + B) / 2;
  return {
    ...d,
    w: clamp((R - L) / sc / W, MIN, MAX_CANVAS),
    h: clamp((B - T) / sc / H, MIN, MAX_CANVAS),
    x: d.x + (cxl * cos - cyl * sin) / W,
    y: d.y + (cxl * sin + cyl * cos) / H,
  };
}

export function KineticAreaEdit({ item, k, W, H }: { item: TextItem; k: number; W: number; H: number }) {
  const edit = useUI((s) => s.kineticEdit);
  const drag = useRef<{ x: number; y: number; d: Draft; mode: Edge | 'move' } | null>(null);
  if (!edit || edit.id !== item.id) return null;
  const sc = item.transform.scale;
  const rotDeg = item.transform.rotation;
  const rot = (rotDeg * Math.PI) / 180;

  const down = (e: RPointerEvent, mode: Edge | 'move') => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, d: edit, mode };
  };
  const move = (e: RPointerEvent) => {
    const g = drag.current;
    if (!g) return;
    useUI.setState({
      kineticEdit: dragArea(g.d, g.mode, (e.clientX - g.x) / k, (e.clientY - g.y) / k, W, H, sc, rot),
    });
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <>
      <div
        className="lr-frame ka-frame"
        data-testid="ka-frame"
        style={{
          left: edit.x * W * k,
          top: edit.y * H * k,
          width: edit.w * W * sc * k,
          height: edit.h * H * sc * k,
          transform: `translate(-50%, -50%) rotate(${rotDeg}deg)`,
        }}
      >
        <div
          className="ka-body"
          data-handle="kinetic"
          data-testid="ka-body"
          onPointerDown={(e) => down(e, 'move')}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {EDGES.map((edge) => (
          <div
            key={edge}
            className={`crop-h ${edge}`}
            data-handle="kinetic"
            data-testid={`ka-h-${edge}`}
            onPointerDown={(e) => down(e, edge)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            <i />
          </div>
        ))}
      </div>
      <div className="ao-card lr-card lc-card" data-handle="kinetic">
        <div className="ao-head">
          <b>調整顯示範圍</b>
          <button
            className="icon-btn ao-close"
            aria-label="放棄調整顯示範圍"
            data-testid="ka-close"
            onClick={() => useUI.setState({ kineticEdit: null })}
          >
            <X size={20} />
          </button>
        </div>
        <span data-testid="ka-text">
          寬 {Math.round(edit.w * sc * 100)}% × 高 {Math.round(edit.h * sc * 100)}%
        </span>
        <p className="ao-hint">拖四邊四角改大小（可以拉到比畫面大，特效就能從畫面外動進來），拖框裡面移動</p>
        <button
          className="btn primary"
          data-testid="ka-apply"
          onClick={() => {
            useUI.setState({ kineticEdit: null });
            setKineticArea(item.id, { x: edit.x, y: edit.y, w: edit.w, h: edit.h });
          }}
        >
          套用
        </button>
      </div>
    </>
  );
}
