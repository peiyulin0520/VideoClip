import { Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ADJUST_KEYS, ADJUST_LABELS, fullAdjust, gradeRGB, LOOKS, type LookDef } from '../../engine/grade';
import { hasKeyframes, keyframeNear, manualAdjustAt } from '../../engine/keyframes';
import { thumbOf } from '../../engine/labels';
import type { Item, Project } from '../../model/types';
import {
  applyGradeToAll,
  clearKeyframeGrade,
  gradeScopeOf,
  keyframeHasGrade,
  keyframeTarget,
  resetGrade,
  setAdjust,
  setLook,
} from '../../store/actions';
import { toast, useUI } from '../../store/uiStore';
import { Slider } from '../../ui/Slider';
import { usePlayheadTime } from './usePlayheadTime';

// 調色面板：上面是色調組合卡片（用這個素材自己的畫面示範），下面是 11 條調整滑桿。
// 有定格（關鍵影格）時，滑桿改的是播放頭這個時間的定格（兩個定格之間漸變）；沒有定格改物件本身。

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

  // 播放頭的時間：播放中最多每 0.5 秒更新一次，不讓面板拖慢預覽
  const t = usePlayheadTime(player, 2);
  const pps = useUI((s) => s.timelinePps);
  useUI((s) => s.gradeScope); // 使用者改了「套用到」要重畫
  const target = keyframeTarget(project, item.id);
  const hasKf = !!target && hasKeyframes(target);
  const scope = target ? gradeScopeOf(target) : 'item';
  const keyMode = hasKf && scope === 'key';
  // 播放線碰到的定格（沒有＝在兩個定格中間或定格之外）
  const kfIdx = keyMode ? keyframeNear(target!, t - target!.start, 8 / pps) : -1;
  const kfNow = kfIdx >= 0 ? target!.keyframes![kfIdx]! : null;
  // 目前顯示的色調組合：整段素材＝物件本身的；定格＝播放線碰到的定格的（沒寫就沿用物件的；null＝原色）
  const shownLook = !keyMode
    ? item.look
    : kfNow
      ? kfNow.look === undefined
        ? target!.look
        : kfNow.look
      : null;
  const between = keyMode && !kfNow;
  const adj = fullAdjust(keyMode ? manualAdjustAt(target!, t) : item.adjust);
  const chooseScope = (next: 'item' | 'key') => {
    if (!target) return;
    if (next === 'item' && keyframeHasGrade(target)) {
      clearKeyframeGrade(item.id);
      toast('已清掉各定格上的色調，改成整段素材同一個色調（可以按復原）', 3500);
    }
    useUI.setState({ gradeScope: { id: target.id, scope: next } });
  };

  return (
    <div className="color-panel" data-testid="color-panel">
      <div className="panel-head">
        <span>
          <Palette size={16} /> 色調
        </span>
      </div>
      {hasKf && (
        <div className="grade-scope" role="radiogroup" aria-label="套用到">
          <span>套用到</span>
          <button
            role="radio"
            aria-checked={scope === 'item'}
            className={`chip${scope === 'item' ? ' active' : ''}`}
            data-testid="scope-item"
            onClick={() => chooseScope('item')}
          >
            整段素材
          </button>
          <button
            role="radio"
            aria-checked={scope === 'key'}
            className={`chip${scope === 'key' ? ' active' : ''}`}
            data-testid="scope-key"
            onClick={() => chooseScope('key')}
          >
            這個定格（漸變）
          </button>
        </div>
      )}
      {keyMode && (
        <p className="hint" data-testid="scope-hint">
          {between
            ? '播放線沒有碰到任何定格：選一個色調會在這裡新增一個定格。'
            : '改的是播放線碰到的這個定格，兩個定格之間的色調會漸漸變過去。'}
        </p>
      )}
      <div className="look-row" role="radiogroup" aria-label="色調組合">
        <LookCard
          look={null}
          src={src}
          active={!between && !shownLook}
          onPick={() => setLook(item.id, null)}
        />
        {LOOKS.map((l) => (
          <LookCard
            key={l.id}
            look={l}
            src={src}
            active={!between && shownLook?.id === l.id}
            onPick={() => setLook(item.id, l.id)}
          />
        ))}
      </div>
      {shownLook && !between && (
        <Slider
          label="強度"
          value={Math.round(shownLook.amount * 100)}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v}%`}
          onChange={(v) => setLook(item.id, shownLook.id, v / 100, `look:${item.id}`)}
        />
      )}
      <p className="hint">在播放列按眼睛圖示，可以切換看原色／色調。</p>
      <div className="slider-label">調整{keyMode ? '（定格：改的是播放線碰到的定格）' : ''}</div>
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
