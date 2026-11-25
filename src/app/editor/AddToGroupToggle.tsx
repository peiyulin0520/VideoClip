import { Group, Ungroup } from 'lucide-react';
import { ToolButton } from './tabs/shared';
import { attachToGroup, detachFromGroup, groupToJoin } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast } from '../../store/uiStore';
import { findItem } from '../../engine/timeline';
import { isFrameItem } from '../../engine/layoutTracks';

/**
 * 文字、音訊工具列的〔加進版型〕：作用在目前選到的文字（音樂／音效）。
 * 還不在版型裡：按了就加進這一段時間有的版型（跟著版型動、時間夾在版型範圍內）；已經在版型裡（按鈕亮著）：按了移出版型。
 * 專案裡沒有版型時不顯示。
 */
export function GroupToggleButton({ testId }: { testId: string }) {
  const project = useProjectStore((s) => s.project);
  const selectedId = useProjectStore((s) => s.selectedId);
  if (!project || !project.tracks.some((t) => t.items.some(isFrameItem))) return null;
  const f = selectedId ? findItem(project, selectedId) : null;
  const item = f && (f.item.type === 'text' || f.item.type === 'audio') ? f.item : null;
  const inGroup = !!item && !!item.group && f!.track.groupRole === 'member';
  const target = item ? groupToJoin(project, item) : null;
  const dim = !item || (!inGroup && !target);
  return (
    <ToolButton
      icon={inGroup ? Ungroup : Group}
      label={inGroup ? '移出版型' : '加進版型'}
      testId={testId}
      fill={inGroup}
      active={inGroup}
      dim={dim}
      onClick={() => {
        if (!item) return toast('先點一段文字或音樂');
        if (inGroup) {
          if (detachFromGroup(item.id)) toast('已移出版型');
          return;
        }
        if (!target) return toast('這段的時間沒有版型');
        if (attachToGroup(item.id, target)) toast('已加進版型');
      }}
    />
  );
}
