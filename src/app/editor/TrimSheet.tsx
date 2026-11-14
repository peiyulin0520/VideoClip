import { urlFor } from '../../engine/assetUrls';
import { MIN_CLIP_DURATION } from '../../model/defaults';
import type { Asset, Track, VideoItem } from '../../model/types';
import { setTrimWindowFree, type Range } from '../../engine/timeline';
import { applyRanges } from '../../store/actions';
import { setTrackItems, useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { RangeMarkerSheet } from './RangeMarkerSheet';

/**
 * 修剪片段（影片、照片的影片段、音樂）：共用的片段標記軸。一組標記＝直接改這個片段的頭尾；
 * 好幾組＝套用時拆成好幾個片段，各自留在原本的時間位置、中間沒選的變空位（一步復原）。
 */
export function TrimSheet({
  item,
  asset,
  track,
  onClose,
}: {
  item: VideoItem;
  asset: Asset;
  track: Track;
  onClose: () => void;
}) {
  const projectId = useProjectStore((s) => s.project)!.id;
  const player = useUI((s) => s.player);
  const isAudio = asset.kind === 'audio';
  const minSrc = MIN_CLIP_DURATION * item.speed;
  const url = urlFor(projectId, asset.id);
  return (
    <RangeMarkerSheet
      title={isAudio ? '剪取聲音片段' : '剪取片段'}
      duration={asset.duration}
      ranges={[[item.trimIn, item.trimIn + item.duration * item.speed]]}
      minLen={minSrc}
      thumbs={asset.thumbs}
      wave={isAudio ? asset.wave : undefined}
      mediaUrl={url}
      mediaKind={url ? (isAudio ? 'audio' : 'video') : 'none'}
      // 音樂沒有畫面：白線移動時讓預覽停在「那一段音樂在專案裡的那一刻」，把專案畫面畫在預覽框
      frameAt={
        isAudio && player
          ? (srcT) => {
              player.peek(Math.max(0, item.start + (srcT - item.trimIn) / item.speed));
              return player.compositor.canvas;
            }
          : undefined
      }
      onClose={onClose}
      onApply={(ranges: Range[]) => {
        if (ranges.length === 1) {
          const next = setTrimWindowFree(track.items, item.id, ranges[0]![0], ranges[0]![1], asset);
          setTrackItems(track.id, next);
        } else if (applyRanges(item.id, ranges)) toast(`已拆成 ${ranges.length} 段，中間不要的地方留成空位`);
        player?.refresh();
        onClose();
      }}
    />
  );
}
