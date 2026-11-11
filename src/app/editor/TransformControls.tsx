import type { Item } from '../../model/types';
import { setTransform } from '../../store/actions';
import { Slider } from '../../ui/Slider';

/**
 * 不用手勢也能精準調大小和旋轉（預覽上是雙指縮放旋轉）。圖層分頁與文字的「版面」都用這個。
 * 拖滑桿會合併成一步復原。
 */
export function TransformControls({ item }: { item: Item }) {
  const { scale, rotation } = item.transform;
  return (
    <div className="transform-controls" data-testid="transform-controls">
      <Slider
        label="整體大小"
        value={Math.round(scale * 100)}
        min={5}
        max={400}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => setTransform(item.id, { scale: v / 100 }, `scale:${item.id}`)}
      />
      <Slider
        label="旋轉"
        value={Math.round(rotation)}
        min={-180}
        max={180}
        step={1}
        format={(v) => `${v}°`}
        onChange={(v) => setTransform(item.id, { rotation: v }, `rot:${item.id}`)}
      />
      <div className="chips">
        <button
          className="chip sm"
          onClick={() => setTransform(item.id, { x: 0.5, y: 0.5 }, `center:${Date.now()}`)}
        >
          置中
        </button>
        <button
          className="chip sm"
          onClick={() => setTransform(item.id, { rotation: 0 }, `straight:${Date.now()}`)}
        >
          轉正
        </button>
      </div>
    </div>
  );
}
