import { Plus } from 'lucide-react';
import { cellItems } from '../../engine/cellGap';
import { itemTitle, thumbOf } from '../../engine/labels';
import { cellsOf } from '../../engine/layoutTracks';
import type { Project } from '../../model/types';
import { cellMain } from '../../store/actions';

/**
 * 〔各格〕的卡片：每一格一張——格號、這一格現在的素材縮圖（空格是虛線框）、幾段素材、〔＋加素材〕。
 * 點卡片＝選到這一格並開「這一格」視窗；點〔＋加素材〕＝開視窗並直接升起加素材。
 */
export function CellCards({
  project,
  group,
  selectedId,
  onPick,
}: {
  project: Project;
  group: string;
  selectedId: string | null;
  onPick: (trackId: string, index: number, add?: boolean) => void;
}) {
  const cells = cellsOf(project.tracks, group);
  return (
    <div className="cell-cards" role="group" aria-label="各格" data-testid="cell-cards">
      {cells.map((cell) => {
        const i = cell.no - 1;
        const t = cell.tracks.find((r) => cellMain(r)) ?? cell.tracks[0]!;
        const it = cellMain(t);
        const asset = it ? project.assets.find((a) => a.id === it.assetId) : undefined;
        const thumb = it ? thumbOf(it, asset) : undefined;
        const segs = cell.tracks.reduce((n, r) => n + cellItems(r).length, 0);
        return (
          <div
            key={t.id}
            className={`cell-card${it && it.id === selectedId ? ' active' : ''}${it ? '' : ' empty'}`}
            data-testid="cell-card"
          >
            <button
              className="cc-body"
              aria-label={`第 ${cell.no} 格 ${it ? itemTitle(it, asset) : '（空）'}`}
              data-testid="cc-open"
              style={{ backgroundImage: thumb ? `url(${thumb})` : undefined }}
              onClick={() => onPick(t.id, i)}
            >
              <i className="ld-no" aria-hidden="true">
                {cell.no}
              </i>
              <small>{segs > 0 ? `${segs} 段` : '空'}</small>
            </button>
            <button
              className="cc-add"
              aria-label={`${cell.no} 號格 加入素材`}
              data-testid="cc-add"
              onClick={() => onPick(t.id, i, true)}
            >
              <Plus size={16} aria-hidden="true" /> 加素材
            </button>
          </div>
        );
      })}
    </div>
  );
}
