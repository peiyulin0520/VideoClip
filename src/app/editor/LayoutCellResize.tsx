import { X } from 'lucide-react';
import { useRef, type PointerEvent as RPointerEvent } from 'react';
import type { GeoCtx } from '../../engine/geometry';
import { itemBox } from '../../engine/geometry';
import type { VideoItem } from '../../model/types';
import { useUI } from '../../store/uiStore';
import { reshapeLayout } from './frameRestyle';

// 拖格子大小：預覽上每一格畫一個虛線框，格子之間的線上有把手；拖把手＝線兩邊的格子一起變（一邊變大、另一邊變小）。
// 同一條線上的格子（例如 2×2 的中間直線）一起動。按「套用」才重畫外框、格子重新排，✕ 放棄。

type R = { x: number; y: number; w: number; h: number };
const MIN = 0.08; // 每格最小占畫面寬、高的比例
const MAX_GAP = 0.2; // 兩格距離超過這個就不算相鄰
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

type Divider = {
  key: string;
  dir: 'v' | 'h'; // v＝直線（左右拖）、h＝橫線（上下拖）
  pairs: [number, number][]; // [左（上）格, 右（下）格]
  at: number; // 線的位置（比例）
  from: number; // 線的範圍（比例）
  to: number;
};

/** 相鄰的格子兩兩配對，同一條線上的併成一組 */
export function dividersOf(cells: R[]): Divider[] {
  const out = new Map<string, Divider>();
  const add = (dir: 'v' | 'h', i: number, j: number, at: number, from: number, to: number) => {
    const key = `${dir}${Math.round(at * 200)}`;
    const d = out.get(key);
    if (d) {
      d.pairs.push([i, j]);
      d.from = Math.min(d.from, from);
      d.to = Math.max(d.to, to);
    } else out.set(key, { key, dir, pairs: [[i, j]], at, from, to });
  };
  cells.forEach((a, i) =>
    cells.forEach((b, j) => {
      if (i === j) return;
      const gx = b.x - (a.x + a.w);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (gx >= -0.002 && gx <= MAX_GAP && oy > 0.02)
        add('v', i, j, a.x + a.w + gx / 2, Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h));
      const gy = b.y - (a.y + a.h);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (gy >= -0.002 && gy <= MAX_GAP && ox > 0.02)
        add('h', i, j, a.y + a.h + gy / 2, Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w));
    }),
  );
  return [...out.values()];
}

/** 把一條線拖 d（比例）：左（上）格的右（下）邊跟線一起動、右（下）格的左（上）邊也是；超過最小大小就停 */
export function moveDivider(cells: R[], div: Divider, d: number): R[] {
  const v = div.dir === 'v';
  let lo = -Infinity;
  let hi = Infinity;
  for (const [i, j] of div.pairs) {
    const a = cells[i]!;
    const b = cells[j]!;
    lo = Math.max(lo, MIN - (v ? a.w : a.h));
    hi = Math.min(hi, (v ? b.w : b.h) - MIN);
  }
  const dd = clamp(d, lo, hi);
  const next = cells.map((c) => ({ ...c }));
  for (const [i, j] of div.pairs) {
    const a = next[i]!;
    const b = next[j]!;
    if (v) {
      a.w += dd;
      b.x += dd;
      b.w -= dd;
    } else {
      a.h += dd;
      b.y += dd;
      b.h -= dd;
    }
  }
  // 同一格被同一條線的兩對配對各動一次時（極少）以最後的為準；這裡只處理一般情況
  return next;
}

export function LayoutCellResize({
  frame,
  geo,
  k,
  W,
  H,
}: {
  frame: VideoItem;
  geo: GeoCtx;
  k: number;
  W: number;
  H: number;
}) {
  const edit = useUI((s) => s.cellEdit);
  const drag = useRef<{ x: number; y: number; cells: R[]; div: Divider } | null>(null);
  const fb = itemBox(frame, geo);
  if (!edit || edit.group !== frame.group || !fb) return null;
  const s = fb.w / W; // 版型畫面（W×H）換成專案像素的倍率
  const rot = (fb.rotation * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  /** 版型畫面上的一點（比例）→ 預覽上的 CSS px */
  const at = (px: number, py: number) => {
    const lx = (px * W - W / 2) * s;
    const ly = (py * H - H / 2) * s;
    return { x: (fb.cx + lx * cos - ly * sin) * k, y: (fb.cy + lx * sin + ly * cos) * k };
  };
  const cells = edit.cells;
  const dividers = dividersOf(cells);

  const down = (e: RPointerEvent, div: Divider) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cells, div };
  };
  const move = (e: RPointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    // 手指移動量轉回版型自己的方向（版型旋轉過）→ 版型畫面的比例
    const lx = (dx * cos + dy * sin) / (k * s);
    const ly = (-dx * sin + dy * cos) / (k * s);
    const d = g.div.dir === 'v' ? lx / W : ly / H;
    useUI.setState({ cellEdit: { ...edit, cells: moveDivider(g.cells, g.div, d) } });
  };
  const up = () => {
    drag.current = null;
  };

  return (
    <>
      {cells.map((c, i) => {
        const ctr = at(c.x + c.w / 2, c.y + c.h / 2);
        return (
          <div
            key={i}
            className="lc-cell"
            data-testid="lc-cell"
            style={{
              left: ctr.x,
              top: ctr.y,
              width: c.w * W * s * k,
              height: c.h * H * s * k,
              transform: `translate(-50%, -50%) rotate(${fb.rotation}deg)`,
            }}
          >
            <i>{i + 1}</i>
          </div>
        );
      })}
      {dividers.map((d) => {
        const mid = (d.from + d.to) / 2;
        const p = d.dir === 'v' ? at(d.at, mid) : at(mid, d.at);
        return (
          <div
            key={d.key}
            className={`lc-handle ${d.dir}`}
            data-handle="cells"
            data-testid={`lc-handle-${d.dir}`}
            style={{ left: p.x, top: p.y, transform: `translate(-50%, -50%) rotate(${fb.rotation}deg)` }}
            onPointerDown={(e) => down(e, d)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            <i />
          </div>
        );
      })}
      <div className="ao-card lr-card lc-card" data-handle="cells">
        <div className="ao-head">
          <b>調整格子大小</b>
          <button
            className="icon-btn ao-close"
            aria-label="放棄調整格子大小"
            data-testid="cell-resize-close"
            onClick={() => useUI.setState({ cellEdit: null })}
          >
            <X size={20} />
          </button>
        </div>
        <p className="ao-hint">拖格子之間的線</p>
        <button
          className="btn primary"
          data-testid="cell-resize-apply"
          onClick={() => {
            const g = frame.group!;
            useUI.setState({ cellEdit: null });
            void reshapeLayout(g, { cells: cells.map((c) => ({ ...c })) });
          }}
        >
          套用
        </button>
      </div>
    </>
  );
}
