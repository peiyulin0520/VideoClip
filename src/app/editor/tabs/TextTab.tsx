import { AddToGroupToggle } from '../AddToGroupToggle';
import { TextPanel, type TextSection } from '../TextPanel';
import type { Found } from './shared';

/** 文字工具列每一項的視窗：只畫那一段（內容、版面、字塊、描邊陰影、裝飾）。選到版型時，〔內容〕最上面有「新增的文字加進版型」切換 */
export function TextTab({ found, section }: { found: Found; section: TextSection }) {
  const item = found?.item.type === 'text' ? found.item : null;
  return (
    <div className="panel text-panel">
      {section === '文字' && <AddToGroupToggle what="新增的文字" />}
      {item ? <TextPanel item={item} only={section} /> : <p className="hint">先點選一段文字</p>}
    </div>
  );
}
