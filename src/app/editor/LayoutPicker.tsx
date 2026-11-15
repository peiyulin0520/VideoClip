import { useEffect, useRef, useState } from 'react';
import { ensureUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import { formatTime } from '../../engine/timeline';
import { LAYOUTS, paintFrame, renderFramePng, type LayoutDef } from '../../engine/layouts';
import { addLayout } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { FrameStyleControls } from './FrameStyleControls';
import { usePlayheadTime } from './usePlayheadTime';

/** 版型文字裡的日期：今天，YYYY.MM.DD */
const todayText = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

/** 版型縮圖：灰底上畫外框，格子的洞裡填淡淡的顏色，看得出哪裡放照片 */
function LayoutThumb({
  def,
  W,
  H,
  color = '#ffffff',
  opacity = 1,
}: {
  def: LayoutDef;
  W: number;
  H: number;
  color?: string;
  opacity?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = 90;
    const h = Math.round((w * H) / W);
    c.width = w * 2;
    c.height = h * 2;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const tmp = document.createElement('canvas');
    tmp.width = c.width;
    tmp.height = c.height;
    paintFrame(tmp.getContext('2d')!, def, c.width, c.height, color, '#8aa4b8', opacity);
    ctx.fillStyle = '#4a4a50';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(tmp, 0, 0);
  }, [def, W, H, color, opacity]);
  return <canvas ref={ref} className="layout-thumb" aria-hidden="true" />;
}

/** 新增版型預設長度（秒）；加進去之後在播放軸拖尾端改整組長度、拖各素材改各自秒數 */
export const LAYOUT_DEFAULT_SECONDS = 5;

/**
 * 版型分頁的「新增版型」：只挑版型的格式、外框顏色、要不要附文字，按「確定」就在播放線那一秒新增一個空的版型
 * （素材到播放軸上展開版型、各格按 ＋ 匯入）。進出場特效、動畫、轉場都到「特效」分頁設。
 */
export function LayoutPicker() {
  const project = useProjectStore((s) => s.project)!;
  const player = useUI((s) => s.player);
  const time = usePlayheadTime(player);
  const [def, setDef] = useState<LayoutDef | null>(null);
  const [frameColor, setFrameColor] = useState('#ffffff');
  const [frameOpacity, setFrameOpacity] = useState(1);
  const [withText, setWithText] = useState(true);
  const W = project.width;
  const H = project.height;

  const confirm = async () => {
    if (!def) return;
    const start = useUI.getState().player?.time ?? 0;
    const color = frameColor;
    const { setBusy } = useUI.getState();
    const pid = useProjectStore.getState().project!.id;
    setBusy('做版型中…');
    try {
      const b = def.build(W, H);
      const frameFile = new File(
        [await renderFramePng(def, W, H, color, frameOpacity)],
        `版型-${def.name}.png`,
        { type: 'image/png' },
      );
      const fr = await importFiles(pid, [frameFile]);
      const frame = fr.assets[0];
      if (!frame) return toast('外框做不出來', 6000);
      await ensureUrls(pid, [frame]);
      const rs = b.panels.length ? b.panels : b.windows;
      const l = Math.min(...rs.map((r) => r.x));
      const tp = Math.min(...rs.map((r) => r.y));
      addLayout({
        cells: b.windows.map((win) => ({ win })),
        frame,
        start,
        duration: LAYOUT_DEFAULT_SECONDS,
        frameName: def.name,
        frameVisible: {
          x: l,
          y: tp,
          w: Math.max(...rs.map((r) => r.x + r.w)) - l,
          h: Math.max(...rs.map((r) => r.y + r.h)) - tp,
        },
        frameStyle: { layout: def.id, color, opacity: frameOpacity },
        texts: withText ? def.texts?.(b, W, todayText()) : undefined,
      });
      setDef(null);
      toast(
        `已加入「${def.name}」（${def.cells} 格）。在播放軸的版型下面各格按 ＋ 匯入；特效到「特效」分頁設定`,
        6000,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="panel-head">
        <span>新增版型（拍貼機、膠卷…）</span>
      </div>
      <div className="layout-grid" data-testid="layout-grid">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            className={`layout-card${def?.id === l.id ? ' active' : ''}`}
            aria-label={`版型 ${l.name}`}
            aria-pressed={def?.id === l.id}
            data-layout={l.id}
            onClick={() => setDef(l)}
          >
            <LayoutThumb def={l} W={W} H={H} color={frameColor} opacity={frameOpacity} />
            <span>{l.name}</span>
          </button>
        ))}
      </div>
      {def && (
        <div className="layout-options" data-testid="layout-options">
          <p className="hint">
            {def.name}（{def.cells} 格）：{def.hint}。
          </p>
          <div className="panel-head">
            <span>外框顏色</span>
          </div>
          <FrameStyleControls
            color={frameColor}
            opacity={frameOpacity}
            onColor={setFrameColor}
            onOpacity={setFrameOpacity}
          />
          {def.texts && (
            <button
              role="switch"
              aria-checked={withText}
              aria-label="附上版型文字"
              className={`btn${withText ? ' primary' : ''}`}
              onClick={() => setWithText((v) => !v)}
            >
              {withText ? '✓ 附上版型文字（可以改字、改字體）' : '不附版型文字'}
            </button>
          )}
          <div className="sheet-row">
            <button className="btn primary grow" data-testid="layout-confirm" onClick={() => void confirm()}>
              確定，加在 {formatTime(time)}
            </button>
          </div>
          <p className="hint">拖播放線選秒數；加好後在播放軸展開版型，各格按 ＋ 放素材。</p>
        </div>
      )}
    </>
  );
}
