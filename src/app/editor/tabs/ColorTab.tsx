import { useProjectStore } from '../../../store/projectStore';
import { ColorPanel } from '../ColorPanel';
import type { Found } from './shared';

/** 色調分頁：選到影片、照片、貼圖、字卡就顯示色調面板（色調組合、11 條調整滑桿…） */
export function ColorTab({ found }: { found: Found }) {
  const project = useProjectStore((s) => s.project)!;
  const item = found && found.item.type !== 'audio' ? found.item : null;
  return (
    <div className="panel color-tab" data-testid="color-tab">
      {item ? (
        <ColorPanel item={item} project={project} />
      ) : (
        <p className="hint">
          先在時間軸點一個影片、照片、貼圖或字卡，再選色調組合（黑白、復古、清新…）或調亮度、飽和度。
        </p>
      )}
    </div>
  );
}
