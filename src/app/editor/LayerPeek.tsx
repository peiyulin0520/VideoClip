import { ArrowDown, ArrowUp, Lock } from 'lucide-react';
import type { Item, Project, Track } from '../../model/types';
import { itemTitle } from '../../engine/labels';
import { rowsOfCell } from '../../engine/layoutTracks';
import { layersAt, trackUnits } from '../../engine/timeline';
import { moveTrackPast, swapCellRows } from '../../store/actions';
import { toast } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';

/** 一個物件在清單裡的名字（使用者命名的優先） */
export function itemName(item: Item): string {
  return itemTitle(item);
}

/**
 * 預覽上的「查看圖層」：列出播放頭這一秒在畫面上的所有物件（由上到下），
 * 點一個就選它——疊在一起、點不到下面那個時用。鎖住的（例如版型外框）顯示鎖頭、不能選。
 */
export function LayerPeek({
  project,
  time,
  onClose,
}: {
  project: Project;
  time: number;
  onClose: () => void;
}) {
  const select = useProjectStore((s) => s.select);
  const selectedId = useProjectStore((s) => s.selectedId);
  const layers = layersAt(project, time, false).reverse(); // 由上到下
  // 換順序用的完整清單（含鎖住的），由上到下
  const all = layersAt(project, time, true).reverse();
  const units = trackUnits(project.tracks);
  const unitOf = (i: number) => units.findIndex((u) => u.lo <= i && i <= u.hi);
  // ▲▼：跟「這一秒」上面／下面最近的、不屬於同一塊的圖層換（旁邊的軌道這一秒可能沒東西，按了會看不出變化）
  const neighbour = (track: Track, idx: number, dir: -1 | 1) => {
    const myUnit = unitOf(project.tracks.indexOf(track));
    for (let j = idx + dir; j >= 0 && j < all.length; j += dir) {
      const o = all[j]!.track;
      if (track.groupRole === 'member') {
        if (o.groupRole === 'member' && o.group === track.group) return o;
      } else if (unitOf(project.tracks.indexOf(o)) !== myUnit) return o;
    }
    return null;
  };
  const move = (track: Track, dir: -1 | 1) => {
    const idx = all.findIndex((l) => l.track.id === track.id);
    if (track.groupRole === 'cell') {
      // 同一格裡的上下（有好幾列才換得動）
      if (!swapCellRows(track.id, dir))
        toast(
          rowsOfCell(project.tracks, track).length < 2
            ? '這一格只有一層'
            : `已經是這一格最${dir === -1 ? '上' : '下'}面的一層`,
        );
      return;
    }
    const o = neighbour(track, idx, dir);
    if (!o || !moveTrackPast(track.id, o.id, dir === -1))
      toast(
        track.groupRole === 'member'
          ? `已經是版型裡最${dir === -1 ? '上' : '下'}面的圖層`
          : `已經是最${dir === -1 ? '上' : '下'}面的圖層`,
      );
  };
  return (
    <div className="peek" data-testid="layer-peek" role="dialog" aria-label="這一秒的圖層">
      <div className="peek-head">
        <b>這一秒的圖層（上面的在最前面）</b>
        <button className="icon-btn" aria-label="關閉圖層清單" onClick={onClose}>
          ✕
        </button>
      </div>
      {layers.length === 0 && <p className="hint">這一秒畫面上沒有東西</p>}
      <ul>
        {layers.map(({ item, track }) => {
          const asset =
            item.type === 'text'
              ? null
              : project.assets.find((a) => a.id === (item as { assetId: string }).assetId);
          const thumb = asset?.thumbs?.[0];
          return (
            <li key={item.id}>
              <button
                className={`peek-row${item.id === selectedId ? ' on' : ''}`}
                disabled={track.locked}
                data-testid="peek-row"
                data-item-id={item.id}
                onClick={() => {
                  select(item.id);
                  onClose();
                }}
              >
                <span className="peek-thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
                  {!thumb && (item.type === 'text' ? 'Aa' : '')}
                </span>
                <span className="peek-name">{itemName(item)}</span>
                <span className="peek-track">{track.name}</span>
                {track.locked && <Lock size={14} aria-label="已鎖住" />}
              </button>
              {!track.locked && (
                <span className="peek-move">
                  <button
                    className="icon-btn sm"
                    aria-label={`${track.name} 往上一層`}
                    onClick={() => move(track, -1)}
                  >
                    <ArrowUp size={18} />
                  </button>
                  <button
                    className="icon-btn sm"
                    aria-label={`${track.name} 往下一層`}
                    onClick={() => move(track, 1)}
                  >
                    <ArrowDown size={18} />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
