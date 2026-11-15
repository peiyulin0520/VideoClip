import { frameOfGroup } from '../../engine/layoutTracks';
import type { Project, Track } from '../../model/types';

/** 版型展開後，還沒放素材的格子：在版型那段時間上畫一塊虛線，點了從相簿匯入 */
export function EmptyCellSlot({
  track,
  index,
  project,
  left,
  pps,
  onPick,
}: {
  track: Track;
  index: number;
  project: Project;
  left: number;
  pps: number;
  onPick: (trackId: string) => void;
}) {
  const fr = track.group ? frameOfGroup(project.tracks, track.group) : null;
  if (!fr) return null;
  return (
    <button
      className="empty-cell-slot"
      data-testid="empty-cell-slot"
      aria-label={`第 ${index + 1} 格 匯入素材`}
      style={{ left: left + fr.item.start * pps, width: Math.max(fr.item.duration * pps, 4) }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => onPick(track.id)}
    >
      ＋ 匯入 第 {index + 1} 格
    </button>
  );
}
