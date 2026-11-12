import { Trash2 } from 'lucide-react';
import { isVideoItem } from '../../../engine/timeline';
import { removeGroup } from '../../../store/actions';
import { LayoutPicker } from '../LayoutPicker';
import { ToolButton, type Found } from './shared';

/** 版型分頁：多格版型（拍貼機、膠卷、拍立得…），之後的模板也放這裡 */
export function LayoutTab({ found }: { found: Found }) {
  const group = found && isVideoItem(found.item) ? found.item.group : undefined;
  return (
    <>
      {group && (
        <div className="toolbar" role="toolbar" aria-label="版型工具">
          <ToolButton icon={Trash2} label="移除版型" onClick={() => removeGroup(group)} />
        </div>
      )}
      <div className="panel">
        <LayoutPicker />
      </div>
    </>
  );
}
