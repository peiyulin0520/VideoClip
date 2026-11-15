import { X } from 'lucide-react';
import { useRef, type PointerEvent as RPointerEvent } from 'react';
import { ratioText } from '../../model/defaults';
import { setProjectCustomRatio } from '../../store/actions';
import { useUI } from '../../store/uiStore';

// 自訂畫面比例：預覽上多一個白框（版面），四邊、四角有把手可以拖；框永遠在底的正中央，
// 所以拖一邊＝左右（或上下）一起動。拖的時候即時顯示「寬:高」，按「套用」才改專案，✕ 放棄。

const MIN = 0.25; // 框最小占底的比例
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
type Edge = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br';
const EDGES: Edge[] = ['l', 'r', 't', 'b', 'tl', 'tr', 'bl', 'br'];

export function AspectOverlay({ baseRef }: { baseRef: React.RefObject<HTMLDivElement | null> }) {
  const edit = useUI((s) => s.frameEdit);
  const start = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  if (!edit) return null;
  const ratio = (edit.fx * 9) / (edit.fy * 16); // 框的寬高比（底是 9:16）
  const text = ratioText(Math.round(ratio * 1000), 1000);
  const set = (fx: number, fy: number) =>
    useUI.setState({ frameEdit: { ...edit, fx: clamp(fx, MIN, 1), fy: clamp(fy, MIN, 1) } });

  const down = (e: RPointerEvent, edge: Edge) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, fx: edit.fx, fy: edit.fy };
    void edge;
  };
  const move = (e: RPointerEvent, edge: Edge) => {
    const s = start.current;
    const base = baseRef.current;
    if (!s || !base) return;
    const r = base.getBoundingClientRect();
    // 框置中：一邊移動 d，整個寬（高）變 2d
    const dx = ((e.clientX - s.x) / r.width) * 2;
    const dy = ((e.clientY - s.y) / r.height) * 2;
    const sx = edge.includes('r') ? 1 : edge.includes('l') ? -1 : 0;
    const sy = edge.includes('b') ? 1 : edge.includes('t') ? -1 : 0;
    set(s.fx + sx * dx, s.fy + sy * dy);
  };
  const up = () => {
    start.current = null;
  };
  const left = ((1 - edit.fx) / 2) * 100;
  const top = ((1 - edit.fy) / 2) * 100;

  return (
    <div className="ao" data-testid="aspect-overlay">
      <div
        className="ao-frame"
        data-testid="aspect-frame"
        style={{ left: `${left}%`, top: `${top}%`, width: `${edit.fx * 100}%`, height: `${edit.fy * 100}%` }}
      >
        {EDGES.map((edge) => (
          <div
            key={edge}
            className={`crop-h ${edge}`}
            data-handle="aspect"
            data-testid={`aspect-h-${edge}`}
            onPointerDown={(e) => down(e, edge)}
            onPointerMove={(e) => move(e, edge)}
            onPointerUp={up}
            onPointerCancel={up}
          >
            <i />
          </div>
        ))}
      </div>
      <div className="ao-card" data-handle="aspect">
        <div className="ao-head">
          <b>調整畫面比例</b>
          <button
            className="icon-btn ao-close"
            aria-label="放棄自訂比例"
            data-testid="aspect-close"
            onClick={() => useUI.setState({ frameEdit: null })}
          >
            <X size={20} />
          </button>
        </div>
        <span data-testid="aspect-text">
          寬:高 ≈ {ratio.toFixed(2)}（{text}）
        </span>
        <p className="ao-hint">拖白框的四邊、四角</p>
        <button
          className="btn primary"
          data-testid="aspect-apply"
          onClick={() => {
            setProjectCustomRatio(ratio, edit.fill ? 'fill' : 'keep');
            useUI.setState({ frameEdit: null });
          }}
        >
          套用
        </button>
      </div>
    </div>
  );
}
