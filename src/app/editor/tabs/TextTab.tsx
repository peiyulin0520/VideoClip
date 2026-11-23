import { addText } from '../../../store/actions';
import { useUI } from '../../../store/uiStore';
import { AddToGroupToggle } from '../AddToGroupToggle';
import { TextPanel } from '../TextPanel';
import type { Found } from './shared';

export function TextTab({ found }: { found: Found }) {
  const player = useUI((s) => s.player);
  const item = found?.item.type === 'text' ? found.item : null;
  const add = () => addText(player?.time ?? 0);
  return (
    <div className="panel text-panel">
      <AddToGroupToggle what="新增的文字" />
      {item ? (
        <>
          <>
            <TextPanel item={item} onAdd={add} onAddShape={() => addText(player?.time ?? 0, true)} />
          </>
        </>
      ) : (
        <>
          <button className="btn primary done" onClick={add}>
            ＋ 新增文字（放在目前這一秒）
          </button>
          <button className="btn done" onClick={() => addText(player?.time ?? 0, true)}>
            ＋ 新增圖形（星形、對話框、雲朵…）
          </button>
        </>
      )}
    </div>
  );
}
