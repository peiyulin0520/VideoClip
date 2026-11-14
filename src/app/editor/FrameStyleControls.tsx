import { FRAME_COLORS } from '../../engine/layouts';
import { ColorPicker } from '../../ui/ColorPicker';
import { Slider } from '../../ui/Slider';

/** 版型外框的顏色（常用幾個＋自由選色）與透明度；選版型時、版型整體面板都用它 */
export function FrameStyleControls({
  color,
  opacity,
  onColor,
  onOpacity,
}: {
  color: string;
  opacity: number;
  onColor: (c: string) => void;
  onOpacity: (v: number) => void;
}) {
  return (
    <div data-testid="frame-style">
      <div className="chips" role="radiogroup" aria-label="外框顏色">
        {FRAME_COLORS.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={color.toLowerCase() === c.color}
            aria-label={`外框 ${c.name}`}
            className={`chip${color.toLowerCase() === c.color ? ' active' : ''}`}
            onClick={() => onColor(c.color)}
          >
            <i className="frame-dot" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>
      <ColorPicker value={color} label="外框顏色" onPick={onColor} />
      <Slider
        label="外框透明度"
        value={Math.round(opacity * 100)}
        min={10}
        max={100}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => onOpacity(v / 100)}
      />
    </div>
  );
}
