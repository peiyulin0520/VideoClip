import { Palette } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ADJUST_KEYS, ADJUST_LABELS, fullAdjust, gradeRGB, LOOKS, type LookDef } from '../../engine/grade';
import { hasKeyframes, timeResolved } from '../../engine/keyframes';
import { thumbOf } from '../../engine/labels';
import type { Item, Project } from '../../model/types';
import { applyGradeToAll, keyframeTarget, resetGrade, setAdjust, setLook } from '../../store/actions';
import { toast, useUI } from '../../store/uiStore';
import { Slider } from '../../ui/Slider';

// 調色面板：上面是色調組合卡片（用這個素材自己的畫面示範），下面是 11 條調整滑桿。
// 有定位（關鍵影格）時，滑桿改的是播放頭這個時間的定位（兩個定位之間漸變）；沒有定位改物件本身。

const SIZE = 48;
const FALLBACK = 'linear-gradient(135deg,#e8a87c,#6aa6c9)';

/** 把縮圖縮成 48×48 的像素，一次讀出來（卡片重複用） */
const pixelCache = new Map<string, ImageData | null>();
async function pixelsOf(url: string): Promise<ImageData | null> {
  if (pixelCache.has(url)) return pixelCache.get(url)!;
  let out: ImageData | null;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    // 取中間正方形
    const s = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, SIZE, SIZE);
    out = g.getImageData(0, 0, SIZE, SIZE);
  } catch {
    out = null;
  }
  if (pixelCache.size > 40) pixelCache.clear();
  pixelCache.set(url, out);
  return out;
}

/** 沒有縮圖（字卡、還沒有縮圖的素材）時用的示範圖：一張有膚色、天空、草地的小色塊圖 */
function demoPixels(): ImageData {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const sky = g.createLinearGradient(0, 0, 0, SIZE * 0.6);
  sky.addColorStop(0, '#5b8fd4');
  sky.addColorStop(1, '#bcd6f0');
  g.fillStyle = sky;
  g.fillRect(0, 0, SIZE, SIZE * 0.6);
  g.fillStyle = '#5f9e4f';
  g.fillRect(0, SIZE * 0.6, SIZE, SIZE * 0.4);
  g.fillStyle = '#e0ac8a';
  g.beginPath();
  g.arc(SIZE * 0.5, SIZE * 0.5, SIZE * 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f3ede2';
  g.fillRect(SIZE * 0.08, SIZE * 0.1, SIZE * 0.25, SIZE * 0.12);
  return g.getImageData(0, 0, SIZE, SIZE);
}

function LookCard({
  look,
  src,
  active,
  onPick,
}: {
  look: LookDef | null;
  src: ImageData | null;
  active: boolean;
  onPick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !src) return;
    c.width = c.height = SIZE;
    const out = new ImageData(new Uint8ClampedArray(src.data), SIZE, SIZE);
    if (look)
      for (let i = 0; i < out.data.length; i += 4) {
        const [r, g, b] = gradeRGB(
          [out.data[i]! / 255, out.data[i + 1]! / 255, out.data[i + 2]! / 255],
          look.adjust,
        );
        out.data[i] = r * 255;
        out.data[i + 1] = g * 255;
        out.data[i + 2] = b * 255;
      }
    c.getContext('2d')!.putImageData(out, 0, 0);
  }, [look, src]);
  return (
    <button
      role="radio"
      aria-checked={active}
      aria-label={`色調 ${look?.name ?? '原圖'}`}
      data-testid="look-card"
      data-look={look?.id ?? 'none'}
      className={`look-card${active ? ' on' : ''}`}
      onClick={onPick}
    >
      <canvas ref={ref} width={SIZE} height={SIZE} style={src ? undefined : { background: FALLBACK }} />
      <span>{look?.name ?? '原圖'}</span>
    </button>
  );
}

export function ColorPanel({ item, project }: { item: Item; project: Project }) {
  const player = useUI((s) => s.player);
  const asset =
    item.type !== 'text' && item.type !== 'audio'
      ? project.assets.find((a) => a.id === item.assetId)
      : undefined;
  const url = thumbOf(item, asset);
  const [src, setSrc] = useState<ImageData | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const px = url ? await pixelsOf(url) : null;
      if (alive) setSrc(px ?? demoPixels());
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  // 這個時間的樣子（有定位的滑桿顯示播放頭那一刻的值）
  const t = player?.time ?? 0;
  const now = useMemo(
    () =>
      timeResolved(project, t)
        .tracks.flatMap((tr) => tr.items)
        .find((x) => x.id === item.id) ?? item,
    [project, t, item],
  );
  const adj = fullAdjust(now.adjust);
  const target = keyframeTarget(project, item.id);
  const kf = !!target && hasKeyframes(target);
  const ids = useMemo(() => {
    // 按住看原圖：版型整組一起
    const g = item.type !== 'audio' ? item.group : undefined;
    if (!g) return [item.id];
    return project.tracks
      .flatMap((tr) => tr.items)
      .filter((x) => x.type !== 'audio' && x.group === g)
      .map((x) => x.id);
  }, [project, item]);
  useEffect(() => () => player?.setGradeBypass(null), [player]);

  return (
    <div className="color-panel" data-testid="color-panel">
      <div className="panel-head">
        <span>
          <Palette size={16} /> 色調
        </span>
      </div>
      <div className="look-row" role="radiogroup" aria-label="色調組合">
        <LookCard look={null} src={src} active={!item.look} onPick={() => setLook(item.id, null)} />
        {LOOKS.map((l) => (
          <LookCard
            key={l.id}
            look={l}
            src={src}
            active={item.look?.id === l.id}
            onPick={() => setLook(item.id, l.id)}
          />
        ))}
      </div>
      {item.look && (
        <Slider
          label="強度"
          value={Math.round(item.look.amount * 100)}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v}%`}
          onChange={(v) => setLook(item.id, item.look!.id, v / 100, `look:${item.id}`)}
        />
      )}
      <div className="slider-label">調整{kf ? '（定位：改的是播放頭這個時間）' : ''}</div>
      {ADJUST_KEYS.map((k) => (
        <Slider
          key={k}
          label={ADJUST_LABELS[k].label}
          value={Math.round(adj[k] * 100)}
          min={Math.round(ADJUST_LABELS[k].min * 100)}
          max={100}
          step={1}
          format={(v) => `${v}`}
          onChange={(v) => setAdjust(item.id, { [k]: v / 100 }, `adj-${k}:${item.id}`)}
        />
      ))}
      <div className="chips">
        <button
          className="btn"
          data-testid="grade-peek"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            player?.setGradeBypass(ids);
          }}
          onPointerUp={() => player?.setGradeBypass(null)}
          onPointerCancel={() => player?.setGradeBypass(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          按住看原圖
        </button>
        <button className="btn" data-testid="grade-reset" onClick={() => resetGrade(item.id)}>
          全部歸零
        </button>
        <button
          className="btn"
          data-testid="grade-all"
          onClick={() => {
            const n = applyGradeToAll(item.id);
            toast(n > 0 ? `已套用到另外 ${n} 個` : '沒有其他同類的素材');
          }}
        >
          套用到全部同類
        </button>
      </div>
    </div>
  );
}
