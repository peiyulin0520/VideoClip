import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { dragCrop, smoothPolygon, type Handle } from '../../engine/crop';
import { itemBox } from '../../engine/geometry';
import { geoCtx } from '../../engine/scene';
import { findItem, isVideoItem } from '../../engine/timeline';
import type { Crop, Project } from '../../model/types';
import { NO_CROP } from '../../engine/crop';
import { cancelCrop, finishCrop, setLassoMask, updateCrop, useCrop, type Pt } from '../../store/cropStore';
import { toast } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';

// 預覽上的裁切模式：整張原始畫面＋變暗的被切掉的部分，四邊中間的細拉霸、四個角把手直接拖；
// 在框裡面拖＝整個保留區域平移；「自由形狀」模式用手指畫一圈。

const HANDLES: Handle[] = ['tl', 'tr', 'bl', 'br', 'l', 'r', 't', 'b'];
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function CropOverlay({
  project,
  k,
  width,
  height,
}: {
  project: Project;
  k: number; // 專案座標 → CSS px
  width: number;
  height: number;
}) {
  const s = useCrop((st) => st.s);
  const selectedId = useProjectStore((st) => st.selectedId);
  const frameRef = useRef<HTMLDivElement>(null);
  const [lassoPts, setLassoPts] = useState<Pt[] | null>(null);

  // 選了別的片段、或片段不見了（復原）就離開裁切模式
  useEffect(() => {
    if (s && selectedId !== s.itemId) cancelCrop();
  }, [s, selectedId]);

  const found = s ? findItem(project, s.itemId) : null;
  const item = found && isVideoItem(found.item) ? found.item : null;
  const asset = item ? project.assets.find((a) => a.id === item.assetId) : null;
  if (!s || !item || !asset) return null;

  const box = itemBox(
    { ...item, crop: undefined, fit: s.view.fit, transform: s.view.transform },
    geoCtx(project, width, height),
  );
  if (!box) return null;
  const A = asset.width / Math.max(asset.height, 1);
  const rot = box.rotation;
  const fw = box.w * k;
  const fh = box.h * k;

  /** 手指的位移 → 整張原始畫面的比例（先把物件的旋轉轉回來） */
  const toFrac = (dx: number, dy: number): [number, number] => {
    const a = (-rot * Math.PI) / 180;
    return [(dx * Math.cos(a) - dy * Math.sin(a)) / fw, (dx * Math.sin(a) + dy * Math.cos(a)) / fh];
  };
  /** 手指的位置 → 原始畫面上的點（0–1） */
  const pointOf = (ev: { clientX: number; clientY: number }): Pt => {
    const r = frameRef.current!.getBoundingClientRect();
    const [fx, fy] = toFrac(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
    return [clamp(fx + 0.5, 0, 1), clamp(fy + 0.5, 0, 1)];
  };

  const startDrag = (e: RPointerEvent, kind: Handle | 'move') => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start: Crop = { ...s.crop };
    const move = (ev: PointerEvent) => {
      const [fx, fy] = toFrac(ev.clientX - x0, ev.clientY - y0);
      if (kind === 'move') {
        const w = 1 - start.l - start.r;
        const h = 1 - start.t - start.b;
        const l = clamp(start.l + fx, 0, 1 - w);
        const t = clamp(start.t + fy, 0, 1 - h);
        updateCrop({ crop: { l, t, r: 1 - w - l, b: 1 - h - t } });
      } else updateCrop({ crop: dragCrop(start, kind, fx, fy, A, useCrop.getState().s?.lock ?? null) });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const startLasso = (e: RPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const pts: Pt[] = [pointOf(e)];
    setLassoPts([...pts]);
    const move = (ev: PointerEvent) => {
      pts.push(pointOf(ev));
      setLassoPts([...pts]);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      setLassoPts(null);
      const poly = smoothPolygon(pts);
      if (!poly) return toast('圈太小了，沿著要留下的範圍畫一整圈');
      setLassoMask(poly);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const c = s.crop;
  const poly = lassoPts ?? s.mask;
  return (
    <div
      className="crop-layer"
      data-testid="crop-layer"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
    >
      <div
        ref={frameRef}
        className="crop-frame"
        data-testid="crop-frame"
        style={{
          left: box.cx * k,
          top: box.cy * k,
          width: fw,
          height: fh,
          transform: `translate(-50%, -50%) rotate(${rot}deg)`,
        }}
      >
        <div className="crop-dim-clip" aria-hidden="true">
          <div
            className="crop-rect-shadow"
            style={{
              left: `${c.l * 100}%`,
              top: `${c.t * 100}%`,
              right: `${c.r * 100}%`,
              bottom: `${c.b * 100}%`,
            }}
          />
        </div>
        {poly && poly.length >= 2 && (
          <svg className="crop-poly" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
            {lassoPts ? (
              <polyline points={poly.map((p) => p.join(',')).join(' ')} />
            ) : (
              <polygon points={poly.map((p) => p.join(',')).join(' ')} data-testid="crop-polygon" />
            )}
          </svg>
        )}
        {s.lasso ? (
          <div className="crop-lasso" data-testid="crop-lasso" onPointerDown={startLasso} />
        ) : (
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
      {/* 重設／取消／完成放在預覽上：不用為了按完成再捲到下面的面板 */}
      <div className="crop-bar" onPointerDown={(e) => e.stopPropagation()}>
        <button
          role="switch"
          aria-checked={s.lasso}
          aria-label="自由形狀"
          className={`btn${s.lasso ? ' primary' : ''}`}
          onClick={() => updateCrop({ lasso: !s.lasso })}
        >
          自由形狀
        </button>
        <button
          className="btn"
          onClick={() => updateCrop({ crop: NO_CROP, mask: null, lock: null, lasso: false })}
        >
          重設
        </button>
        <button className="btn" onClick={cancelCrop}>
          取消
        </button>
        <button className="btn primary" onClick={finishCrop}>
          完成
        </button>
      </div>
    </div>
  );
}

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
