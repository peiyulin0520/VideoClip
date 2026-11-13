import { urlFor } from '../../engine/assetUrls';
import { isFullRange } from '../../engine/audioRanges';
import { MIN_CLIP_DURATION } from '../../model/defaults';
import type { Asset, VideoItem } from '../../model/types';
import { editItem } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { RangeMarkerSheet } from './RangeMarkerSheet';

/**
 * 音訊「靜音標記」：標出片段裡要保留聲音的好幾段（原色保留、灰色靜音）。
 * 不拆片段、畫面與時間位置不變；全部都保留＝不用存標記。
 */
export function MuteSheet({ item, asset, onClose }: { item: VideoItem; asset: Asset; onClose: () => void }) {
  const projectId = useProjectStore((s) => s.project)!.id;
  const player = useUI((s) => s.player);
  const isAudio = asset.kind === 'audio';
  const url = urlFor(projectId, asset.id);
  const initial = item.audioRanges ?? [[item.trimIn, item.trimIn + item.duration * item.speed]];
  return (
    <RangeMarkerSheet
      title="選擇保留的聲音片段"
      mode="mute"
      duration={asset.duration}
      ranges={initial.map(([a, b]): [number, number] => [a, b])}
      minLen={MIN_CLIP_DURATION}
      thumbs={asset.thumbs}
      wave={isAudio ? asset.wave : undefined}
      mediaUrl={url}
      mediaKind={url ? (isAudio ? 'audio' : 'video') : 'none'}
      frameAt={
        isAudio && player
          ? (srcT) => {
              player.peek(Math.max(0, item.start + (srcT - item.trimIn) / item.speed));
              return player.compositor.canvas;
            }
          : undefined
      }
      applyLabel="套用聲音範圍"
      summary={(ranges) => {
        const keep = ranges.reduce((n, [a, b]) => n + (b - a), 0);
        return `保留聲音 ${keep.toFixed(1)} 秒（${ranges.length} 組）· 靜音 ${Math.max(asset.duration - keep, 0).toFixed(1)} 秒`;
      }}
      hint="原色是保留的聲音，灰色處靜音；片段的畫面與時間位置都不變。點縮圖只移動白線，按「新增」才建立下一組保留的範圍。"
      onClose={onClose}
      onApply={(ranges) => {
        editItem(item.id, (it) => {
          if (it.type === 'text') return;
          if (isFullRange(it, ranges)) delete it.audioRanges;
          else it.audioRanges = ranges.map(([a, b]): [number, number] => [a, b]);
        });
        onClose();
      }}
    />
  );
}
