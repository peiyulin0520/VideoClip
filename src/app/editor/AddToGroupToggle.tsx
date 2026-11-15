import { useProjectStore } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { findItem } from '../../engine/timeline';
import { frameOfGroup } from '../../engine/layoutTracks';

/**
 * 選到版型（或版型裡的東西）時，文字、素材（貼圖）、音訊分頁最上面的一列：新增的東西要不要加進這個版型。
 * 預設加進去（時間只能在版型範圍內、跟著整個版型動）；關掉＝照一般素材加在專案裡。
 * 用淡底的區塊跟下面的新增按鈕分開（不同層級的設定）。
 */
export function AddToGroupToggle({ what }: { what: string }) {
  const project = useProjectStore((s) => s.project);
  const selectedId = useProjectStore((s) => s.selectedId);
  const off = useUI((s) => s.addToGroupOff);
  const f = project && selectedId ? findItem(project, selectedId) : null;
  const g = f?.item.group;
  const frame = project && g ? frameOfGroup(project.tracks, g) : null;
  if (!g || !frame) return null;
  const on = !off;
  return (
    <div className="zone-soft" data-testid="add-to-group">
      <button
        role="switch"
        aria-checked={on}
        aria-label={`${what}加到版型「${frame.item.label ?? '版型'}」裡`}
        className={`btn${on ? ' primary' : ''}`}
        onClick={() => useUI.setState({ addToGroupOff: on })}
      >
        {on ? '✓ ' : ''}
        {what}加到版型「{frame.item.label ?? '版型'}」裡
      </button>
      <p className="hint">
        {on
          ? '放在版型的任何位置（可以疊在外框上），時間只能在版型範圍內，跟著整個版型動。'
          : '不加進版型：照一般方式加在專案裡。'}
      </p>
    </div>
  );
}
