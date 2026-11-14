import { useState } from 'react';
import { ColorPanel } from '../ColorPanel';
import { useProjectStore } from '../../../store/projectStore';
import { addText } from '../../../store/actions';
import { useUI } from '../../../store/uiStore';
import { TextPanel } from '../TextPanel';
import type { Found } from './shared';

export function TextTab({ found }: { found: Found }) {
  const player = useUI((s) => s.player);
  const project = useProjectStore((s) => s.project)!;
  const [color, setColor] = useState(false);
  const item = found?.item.type === 'text' ? found.item : null;
  const add = () => addText(player?.time ?? 0);
  return (
    <div className="panel text-panel">
      {item ? (
        <>
          <TextPanel item={item} onAdd={add} onAddShape={() => addText(player?.time ?? 0, true)} />
          <button className="btn done" data-testid="text-color-btn" onClick={() => setColor((v) => !v)}>
            {color ? '收起調色' : '調色（亮度、飽和度、色調組合…）'}
          </button>
          {color && <ColorPanel item={item} project={project} />}
        </>
      ) : (
        <>
          <button className="btn primary done" onClick={add}>
            ＋ 新增文字（放在目前這一秒）
          </button>
          <button className="btn done" onClick={() => addText(player?.time ?? 0, true)}>
            ＋ 新增圖形（星形、對話框、雲朵…）
          </button>
          <p className="hint">新增或點選一個文字後，可以在這裡改內容、字體、字塊和描邊。</p>
        </>
      )}
    </div>
  );
}
