import { useProjectStore } from '../../../store/projectStore';
import { ColorPanel } from '../ColorPanel';
import type { Found } from './shared';

/** 色調工具列的兩個視窗：色調組合（含強度）、調整（11 條滑桿）。選到影片、照片、貼圖、字卡才有內容 */
export function ColorTab({ found, part }: { found: Found; part: 'look' | 'adjust' }) {
  const project = useProjectStore((s) => s.project)!;
  const item = found && found.item.type !== 'audio' ? found.item : null;
  return (
    <div className="panel color-tab" data-testid="color-tab">
      {item ? (
        <ColorPanel item={item} project={project} part={part} />
      ) : (
        <p className="hint">先點選一個素材</p>
      )}
    </div>
  );
}
