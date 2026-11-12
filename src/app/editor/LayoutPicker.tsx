import { useEffect, useRef, useState } from 'react';
import { ensureUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import {
  FRAME_COLORS,
  LAYOUTS,
  MAX_CELL_VIDEOS,
  paintFrame,
  renderFramePng,
  type LayoutDef,
} from '../../engine/layouts';
import { monthTitle } from '../../engine/story';
import { addLayout, addStory } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { Sheet } from '../../ui/Sheet';

/** 版型縮圖：灰底上畫外框，格子的洞裡填淡淡的顏色，看得出哪裡放照片 */
function LayoutThumb({ def, W, H }: { def: LayoutDef; W: number; H: number }) {
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
    paintFrame(tmp.getContext('2d')!, def, c.width, c.height, '#ffffff', '#8aa4b8');
    ctx.fillStyle = '#4a4a50';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(tmp, 0, 0);
  }, [def, W, H]);
  return <canvas ref={ref} className="layout-thumb" aria-hidden="true" />;
}

/** 疊加分頁的「版型」：拍貼機、膠卷、拍立得、分割、九宮格。點一個 → 選外框顏色 → 從相簿選照片或影片放進格子 */
export function LayoutPicker() {
  const project = useProjectStore((s) => s.project)!;
  const [def, setDef] = useState<LayoutDef | null>(null);
  const [colorId, setColorId] = useState('white');
  const [motion, setMotion] = useState<'' | 'drift' | 'slide'>('');
  const input = useRef<HTMLInputElement>(null);
  // 動態模板「三格故事」
  const [storyOpen, setStoryOpen] = useState(false);
  const [title, setTitle] = useState(() => monthTitle());
  const [subtitle, setSubtitle] = useState('Hello, hello');
  const storyInput = useRef<HTMLInputElement>(null);
  const W = project.width;
  const H = project.height;

  const onFiles = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (input.current) input.current.value = '';
    if (!files.length || !def) return;
    const color = FRAME_COLORS.find((c) => c.id === colorId)!.color;
    const { setBusy, player } = useUI.getState();
    const pid = useProjectStore.getState().project!.id;
    setBusy('做版型中…');
    try {
      const res = await importFiles(pid, files);
      const media = res.assets.filter((a) => a.kind !== 'audio');
      if (res.failed.length)
        toast(`無法匯入：${res.failed.map((f) => `${f.name}（${f.reason}）`).join('、')}`, 7000);
      if (media.length === 0) return;
      const b = def.build(W, H);
      // 素材比格子少：輪流重複使用；比格子多：只用前面幾個
      const cells = b.windows.map((win, i) => ({ asset: media[i % media.length]!, win }));
      const frameFile = new File([await renderFramePng(def, W, H, color)], `版型-${def.name}.png`, {
        type: 'image/png',
      });
      const fr = await importFiles(pid, [frameFile]);
      const frame = fr.assets[0];
      if (!frame) return toast('外框做不出來', 6000);
      await ensureUrls(pid, [...media, frame]);
      const videoCells = cells.filter((c) => c.asset.kind === 'video').length;
      const maxVideo = Math.max(0, ...media.filter((a) => a.kind === 'video').map((a) => a.duration));
      const duration = maxVideo > 0 ? Math.min(Math.max(maxVideo, 1), 15) : 3;
      const rs = b.panels.length ? b.panels : b.windows;
      const l = Math.min(...rs.map((r) => r.x));
      const tp = Math.min(...rs.map((r) => r.y));
      addLayout({
        cells,
        frame,
        start: player?.time ?? 0,
        duration,
        frameName: def.name,
        frameVisible: {
          x: l,
          y: tp,
          w: Math.max(...rs.map((r) => r.x + r.w)) - l,
          h: Math.max(...rs.map((r) => r.y + r.h)) - tp,
        },
        motion: motion || undefined,
      });
      setDef(null);
      toast(
        videoCells > MAX_CELL_VIDEOS
          ? `版型加好了。同時播放超過 ${MAX_CELL_VIDEOS} 支影片，手機可能會卡，建議多放照片`
          : media.length > cells.length
            ? `版型加好了（有 ${cells.length} 格，只用了前 ${cells.length} 個素材）`
            : `版型加好了。整個版型一起縮放移動；再點一下預覽上的格子，可以選那一格要用的片段`,
        6000,
      );
    } finally {
      setBusy(null);
    }
  };

  const onStoryFiles = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (storyInput.current) storyInput.current.value = '';
    if (!files.length) return;
    const { setBusy, player } = useUI.getState();
    const pid = useProjectStore.getState().project!.id;
    setBusy('做模板中…');
    try {
      const res = await importFiles(pid, files);
      const media = res.assets.filter((a) => a.kind !== 'audio');
      if (res.failed.length)
        toast(`無法匯入：${res.failed.map((f) => `${f.name}（${f.reason}）`).join('、')}`, 7000);
      if (media.length === 0) return;
      // 第 1 個是開場，後面 3 個是三格；不夠就輪流重複使用
      const four = [0, 1, 2, 3].map((i) => media[i % media.length]!);
      // 全透明的外框圖（只是代表整個模板的物件，沒有畫面）
      const c = document.createElement('canvas');
      c.width = Math.round(W);
      c.height = Math.round(H);
      const blob = await new Promise<Blob>((ok, bad) =>
        c.toBlob((b) => (b ? ok(b) : bad(new Error('做不出來'))), 'image/png'),
      );
      const fr = await importFiles(pid, [new File([blob], '模板-三格故事.png', { type: 'image/png' })]);
      const frame = fr.assets[0];
      if (!frame) return toast('做不出來', 6000);
      await ensureUrls(pid, [...media, frame]);
      addStory({
        frame,
        media: four,
        start: player?.time ?? 0,
        title: title.trim() || monthTitle(),
        subtitle,
      });
      setStoryOpen(false);
      toast('模板加好了。整個模板可以在預覽上縮放移動；標題、副標在「文字」分頁改', 6000);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="panel-head">
        <span>動態模板</span>
      </div>
      <div className="layout-grid" data-testid="story-grid">
        <button className="layout-card" aria-label="模板 三格故事" onClick={() => setStoryOpen(true)}>
          <span className="story-thumb" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>三格故事</span>
        </button>
      </div>
      <div className="panel-head">
        <span>版型（拍貼機、膠卷…）</span>
      </div>
      <div className="layout-grid" data-testid="layout-grid">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            className="layout-card"
            aria-label={`版型 ${l.name}`}
            data-layout={l.id}
            onClick={() => setDef(l)}
          >
            <LayoutThumb def={l} W={W} H={H} />
            <span>{l.name}</span>
          </button>
        ))}
      </div>
      <Sheet
        open={!!def}
        title={def ? `版型：${def.name}（${def.cells} 格）` : ''}
        onClose={() => setDef(null)}
      >
        {def && (
          <div data-testid="layout-sheet">
            <p className="hint">{def.hint}。選好外框顏色，再從相簿選照片或影片放進格子。</p>
            <div className="panel-head">
              <span>外框顏色</span>
            </div>
            <div className="chips" role="radiogroup" aria-label="外框顏色">
              {FRAME_COLORS.map((c) => (
                <button
                  key={c.id}
                  role="radio"
                  aria-checked={colorId === c.id}
                  aria-label={`外框 ${c.name}`}
                  className={`chip${colorId === c.id ? ' active' : ''}`}
                  onClick={() => setColorId(c.id)}
                >
                  <i className="frame-dot" style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
            <div className="panel-head">
              <span>動畫</span>
            </div>
            <div className="chips" role="radiogroup" aria-label="版型動畫">
              {(
                [
                  ['', '不動'],
                  ['drift', '捲動'],
                  ['slide', '滑入滑出'],
                ] as const
              ).map(([id, name]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={motion === id}
                  aria-label={`動畫 ${name}`}
                  className={`chip${motion === id ? ' active' : ''}`}
                  onClick={() => setMotion(id)}
                >
                  {name}
                </button>
              ))}
            </div>
            <p className="hint">
              選的照片、影片比格子少會輪流重複使用；同時播放的影片太多手機會卡，格子多的版型（例如九宮格）建議放照片。
            </p>
            <div className="sheet-row">
              <button className="btn" onClick={() => setDef(null)}>
                取消
              </button>
              <button className="btn primary" onClick={() => input.current?.click()}>
                選照片或影片
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <Sheet open={storyOpen} title="動態模板：三格故事（8 秒）" onClose={() => setStoryOpen(false)}>
        <div data-testid="story-sheet">
          <p className="hint">
            開場影片先在中間，上下撐開成滿版 → 三格從上、右、下依序滑進來 → 中間的標題快速換字體 → 染成暖橘色
            → 閃光。 選 1–4 個照片或影片：第 1 個是開場，後面 3 個放三格（不夠會輪流重複使用）。
          </p>
          <label className="field">
            標題
            <input
              className="text-input"
              aria-label="模板標題"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            副標（可以留空）
            <input
              className="text-input"
              aria-label="模板副標"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            />
          </label>
          <div className="sheet-row">
            <button className="btn" onClick={() => setStoryOpen(false)}>
              取消
            </button>
            <button className="btn primary" onClick={() => storyInput.current?.click()}>
              選照片或影片
            </button>
          </div>
        </div>
      </Sheet>
      <input
        ref={storyInput}
        type="file"
        accept="video/*,image/*"
        multiple
        hidden
        data-testid="story-input"
        onChange={(e) => void onStoryFiles(e.target.files)}
      />
      <input
        ref={input}
        type="file"
        accept="video/*,image/*"
        multiple
        hidden
        data-testid="layout-input"
        onChange={(e) => void onFiles(e.target.files)}
      />
    </>
  );
}
