import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { hexToRgb, hsvFromRgbKeepHue, hsvToRgb, rgbToHex, rgbToHsv, type HSV, type RGB } from './colorMath';

// 自訂顏色彈窗：大方塊（橫＝飽和度、直＝亮度）手指拖拉選色 → 色相條 → R G B 細調（滑桿＋數字＋−／＋）
// → 「原本」「新的」並排預覽 → 確定／取消。按確定才套用。

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/** 在一個區塊上按住拖拉：回傳 0–1 的位置。用 pointer capture，手指滑出區塊也繼續追。 */
function useAreaDrag(onPos: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const at = (e: RPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onPos(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
  };
  return {
    ref,
    onPointerDown: (e: RPointerEvent) => {
      active.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      at(e);
    },
    onPointerMove: (e: RPointerEvent) => {
      if (active.current) at(e);
    },
    onPointerUp: () => {
      active.current = false;
    },
    onPointerCancel: () => {
      active.current = false;
    },
  };
}

const CHANNELS = [
  { i: 0, key: 'R', name: '紅' },
  { i: 1, key: 'G', name: '綠' },
  { i: 2, key: 'B', name: '藍' },
] as const;

export function ColorPopup({
  initial,
  label,
  onConfirm,
  onCancel,
}: {
  initial: string;
  label: string; // 例如「文字顏色」
  onConfirm: (hex: string) => void;
  onCancel: () => void;
}) {
  const start = hexToRgb(initial) ?? ([255, 255, 255] as RGB);
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(start));
  const rgb = hsvToRgb(hsv);
  const hex = rgbToHex(rgb);
  const hueRgb = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));

  const sv = useAreaDrag((x, y) => setHsv((p) => ({ ...p, s: x, v: 1 - y })));
  const hue = useAreaDrag((x) => setHsv((p) => ({ ...p, h: x * 360 })));
  const setChannel = (i: number, value: number) => {
    const next = [...rgb] as RGB;
    next[i] = Math.min(Math.max(Math.round(value) || 0, 0), 255);
    setHsv((p) => hsvFromRgbKeepHue(next, p.h));
  };

  return createPortal(
    <div className="color-popup-backdrop" onClick={onCancel}>
      <div
        className="color-popup"
        role="dialog"
        aria-modal="true"
        aria-label={`${label} 自訂顏色`}
        data-testid="color-popup"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      >
        <div className="sheet-title">自訂顏色</div>

        <div
          {...sv}
          className="cp-sv"
          data-testid="cp-sv"
          role="slider"
          aria-label="顏色區域（左右＝鮮豔程度，上下＝明暗）"
          aria-valuetext={hex}
          style={{ backgroundColor: hueRgb }}
        >
          <div
            className="cp-cursor"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }}
          />
        </div>

        <div
          {...hue}
          className="cp-hue"
          data-testid="cp-hue"
          role="slider"
          aria-label="色相"
          aria-valuetext={hueRgb}
        >
          <div className="cp-cursor hue" style={{ left: `${(hsv.h / 360) * 100}%`, background: hueRgb }} />
        </div>

        <div className="cp-compare" aria-label="預覽">
          <div className="cp-swatch" style={{ background: rgbToHex(start) }} data-testid="cp-old">
            <span>原本</span>
          </div>
          <div className="cp-swatch" style={{ background: hex }} data-testid="cp-new">
            <span>新的</span>
          </div>
          <code className="cp-hex" data-testid="cp-hex">
            {hex.toUpperCase()}
          </code>
        </div>

        {CHANNELS.map(({ i, key, name }) => (
          <div className="cp-channel" key={key}>
            <span className="cp-ch-label">{key}</span>
            <button
              className="cp-step"
              aria-label={`${name}色 ${key} 減 1`}
              onClick={() => setChannel(i, rgb[i]! - 1)}
            >
              −
            </button>
            <input
              type="range"
              aria-label={`${name}色 ${key}`}
              min={0}
              max={255}
              step={1}
              value={rgb[i]}
              onChange={(e) => setChannel(i, Number(e.target.value))}
            />
            <button
              className="cp-step"
              aria-label={`${name}色 ${key} 加 1`}
              onClick={() => setChannel(i, rgb[i]! + 1)}
            >
              ＋
            </button>
            <b className="cp-val" data-testid={`cp-${key}`}>
              {rgb[i]}
            </b>
          </div>
        ))}

        <div className="sheet-row">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button className="btn primary" onClick={() => onConfirm(hex)}>
            確定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
