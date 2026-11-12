import { Lock } from 'lucide-react';
import type { Item, Project } from '../../model/types';
import { layersAt } from '../../engine/timeline';
import { useProjectStore } from '../../store/projectStore';

/** 一個物件在清單裡的名字 */
export function itemName(item: Item): string {
  if (item.type === 'text') {
    const t = item.card.runs[0]?.text.replace(/\n/g, ' ') ?? '';
    return t === '' ? '圖形' : `Aa ${t}`;
  }
  return item.type === 'image' ? '照片' : item.type === 'audio' ? '音樂' : '影片';
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
