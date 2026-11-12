import { applyRatio, keepSize, NO_CROP } from '../../engine/crop';
import { findItem, isVideoItem } from '../../engine/timeline';
import { updateCrop, useCrop } from '../../store/cropStore';
import { useProjectStore } from '../../store/projectStore';

/** 裁切模式的控制面板（在剪輯分頁）：比例、自由形狀、重設、取消、完成。拖拉本身在預覽上（CropOverlay）。 */
export function CropPanel() {
  const s = useCrop((st) => st.s);
  const project = useProjectStore((st) => st.project)!;
  const found = s ? findItem(project, s.itemId) : null;
  const item = found && isVideoItem(found.item) ? found.item : null;
  const asset = item ? project.assets.find((a) => a.id === item.assetId) : null;
  if (!s || !item || !asset) return null;
  const A = asset.width / Math.max(asset.height, 1);
  const kept = keepSize(s.crop);

  const PRESETS: { key: string; label: string; ratio: number | null }[] = [
    { key: 'free', label: '自由', ratio: null },
    { key: 'orig', label: '原比例', ratio: A },
    { key: '1:1', label: '1:1', ratio: 1 },
    { key: '9:16', label: '9:16', ratio: 9 / 16 },
    { key: '4:5', label: '4:5', ratio: 4 / 5 },
    { key: '16:9', label: '16:9', ratio: 16 / 9 },
  ];
  const isActive = (r: number | null) =>
    r === null ? s.lock === null : s.lock !== null && Math.abs(s.lock - r) < 1e-6;

  return (
    <div className="panel crop-panel" role="group" aria-label="裁切" data-testid="crop-panel">
      <div className="panel-head">
        <span>裁切</span>
        <b data-testid="crop-size">
          保留 {Math.round(kept.w * 100)}% × {Math.round(kept.h * 100)}%
        </b>
      </div>
      <p className="hint">
        {s.lasso
          ? '用手指沿著要留下的範圍畫一整圈，放開就會裁好。畫完按預覽上的「完成」。'
          : '直接在預覽上拖：四邊中間的細條、四個角，或在框裡面拖動整塊。裁好按預覽上的「完成」。'}
      </p>
      <div className="chips" role="radiogroup" aria-label="裁切比例">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            role="radio"
            aria-checked={!s.lasso && isActive(p.ratio)}
            className={`chip${!s.lasso && isActive(p.ratio) ? ' active' : ''}`}
            onClick={() =>
              updateCrop(
                p.ratio === null
                  ? { lock: null, lasso: false }
                  : { lock: p.ratio, crop: applyRatio(s.crop, p.ratio, A), lasso: false },
              )
            }
          >
            {p.label}
          </button>
        ))}
        {s.mask && (
          <button className="chip" onClick={() => updateCrop({ mask: null, crop: NO_CROP })}>
            清除形狀
          </button>
        )}
      </div>
    </div>
  );
}
