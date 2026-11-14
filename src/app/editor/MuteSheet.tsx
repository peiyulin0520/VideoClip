import { useRef, useState } from 'react';
import { urlFor } from '../../engine/assetUrls';
import { invertRanges, isFullRange } from '../../engine/audioRanges';
import { MIN_CLIP_DURATION } from '../../model/defaults';
import type { Asset, VideoItem } from '../../model/types';
import { editItem } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { RangeMarkerSheet } from './RangeMarkerSheet';

type R = [number, number];
const MODE_KEY = 'vc-audio-range-mode';
const readMode = (): 'keep' | 'silence' => {
  try {
    return localStorage.getItem(MODE_KEY) === 'silence' ? 'silence' : 'keep';
  } catch {
    return 'keep';
  }
};

/**
 * 音訊「進階」：標出聲音的範圍。兩種標法（結果一樣，存的都是「保留聲音的範圍」`audioRanges`）：
 * - 標記要保留的聲音：標起來的有聲音、其他靜音（原色＝保留、灰＝靜音）
 * - 標記要靜音的聲音：標起來的靜音、其他保留
 * 不拆片段、畫面與時間位置不變；全部都保留＝不用存標記。切換標法時，標記會換算成另一種表示（聲音的結果不變）。
 */
export function MuteSheet({ item, asset, onClose }: { item: VideoItem; asset: Asset; onClose: () => void }) {
  const projectId = useProjectStore((s) => s.project)!.id;
  const player = useUI((s) => s.player);
  const isAudio = asset.kind === 'audio';
  const url = urlFor(projectId, asset.id);
  const span: R = [item.trimIn, item.trimIn + item.duration * item.speed]; // 這個片段用到的素材範圍
  const keepNow: R[] = (item.audioRanges ?? [span]).map(([a, b]): R => [a, b]);
  const [mode, setMode] = useState<'keep' | 'silence'>(readMode);
  // 切換標法時要用目前的標記換算，所以記下來
  const [initial, setInitial] = useState<R[]>(mode === 'keep' ? keepNow : invertRanges(keepNow, span));
  const current = useRef<R[]>(initial);

  const switchTo = (m: 'keep' | 'silence') => {
    if (m === mode) return;
    const next = invertRanges(current.current, span);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* 存不了就算了 */
    }
    current.current = next;
    setInitial(next);
    setMode(m);
  };

  return (
    <RangeMarkerSheet
      key={mode}
      title="進階：聲音範圍"
      mode={mode === 'keep' ? 'mute' : 'silence'}
      allowEmpty={mode === 'silence'}
      duration={asset.duration}
      ranges={initial}
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
      onRangesChange={(r) => {
        current.current = r;
      }}
      extra={
        <div className="segmented" role="radiogroup" aria-label="標記方式" data-testid="audio-range-mode">
          {(
            [
              ['keep', '標記要保留的聲音'],
              ['silence', '標記要靜音的聲音'],
            ] as const
          ).map(([m, name]) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              className={`seg${mode === m ? ' on' : ''}`}
              data-testid={`audio-mode-${m}`}
              onClick={() => switchTo(m)}
            >
              {name}
            </button>
          ))}
        </div>
      }
      applyLabel="套用聲音範圍"
      summary={(ranges) => {
        const total = span[1] - span[0];
        const marked = ranges.reduce((n, [a, b]) => n + (Math.min(b, span[1]) - Math.max(a, span[0])), 0);
        const keep = mode === 'keep' ? marked : total - marked;
        return `保留聲音 ${Math.max(keep, 0).toFixed(1)} 秒 · 靜音 ${Math.max(total - keep, 0).toFixed(1)} 秒（${ranges.length} 組標記）`;
      }}
      hint={
        mode === 'keep'
          ? '原色是保留的聲音，灰色處靜音；片段的畫面與時間位置都不變。點縮圖只移動白線，按「新增」才建立下一組。'
          : '灰色斜線的地方靜音，其他地方保留聲音；片段的畫面與時間位置都不變。點縮圖只移動白線，按「新增」才建立下一組。'
      }
      onClose={onClose}
      onApply={(ranges) => {
        const keep = mode === 'keep' ? ranges : invertRanges(ranges, span);
        editItem(item.id, (it) => {
          if (it.type === 'text') return;
          if (isFullRange(it, keep)) delete it.audioRanges;
          else it.audioRanges = keep.map(([a, b]): R => [a, b]);
        });
        onClose();
      }}
    />
  );
}
