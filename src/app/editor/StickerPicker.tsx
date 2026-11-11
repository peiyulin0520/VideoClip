import { useState } from 'react';
import { importFiles } from '../../engine/importMedia';
import { ensureUrls } from '../../engine/assetUrls';
import { STICKER_CATS, STICKER_SOURCE, stickerLabel, stickerToPng, stickerUrl } from '../../stickers/catalog';
import { addOverlayClips } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';

/** 貼圖大小：佔畫面寬度的比例（疊加素材預設 50%，貼圖小一點） */
const STICKER_SCALE = 0.3;

/** 把一個貼圖加到目前這一秒（變成一個照片素材，存在這台裝置；跟一般疊加照片一樣可以拖、縮放、旋轉、匯出） */
export async function addSticker(name: string): Promise<string | null> {
  const st = useProjectStore.getState();
  const pid = st.project?.id;
  if (!pid) return null;
  const { setBusy, player } = useUI.getState();
  setBusy('加入貼圖…');
  try {
    const file = await stickerToPng(name);
    const res = await importFiles(pid, [file]);
    if (!res.assets.length) {
      toast(`貼圖加不進去：${res.failed[0]?.reason ?? '不明原因'}`, 6000);
      return null;
    }
    await ensureUrls(pid, res.assets);
    const id = addOverlayClips(res.assets, player?.time ?? 0, { scale: STICKER_SCALE });
    // 整頁往下捲在選貼圖時，預覽可能看不到：提醒一下
    if (window.scrollY > 200) toast('已加入貼圖，往上滑看預覽');
    return id;
  } catch (e) {
    toast(`貼圖加不進去：${e instanceof Error ? e.message : String(e)}`, 6000);
    return null;
  } finally {
    setBusy(null);
  }
}

export function StickerPicker() {
  const [cat, setCat] = useState(STICKER_CATS[0]!.name);
  const items = STICKER_CATS.find((c) => c.name === cat)?.items ?? [];
  return (
    <div className="sticker-picker">
      <div className="chips cat-chips" role="tablist" aria-label="貼圖分類">
        {STICKER_CATS.map((c) => (
          <button
            key={c.name}
            role="tab"
            aria-selected={cat === c.name}
            className={`chip sm${cat === c.name ? ' active' : ''}`}
            onClick={() => setCat(c.name)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="sticker-grid" data-testid="sticker-grid">
        {items.map((n) => (
          <button
            key={n}
            className="sticker-cell"
            aria-label={`貼圖 ${stickerLabel(n)}`}
            data-sticker={n}
            onClick={() => void addSticker(n)}
          >
            <img src={stickerUrl(n)} alt="" loading="lazy" draggable={false} />
          </button>
        ))}
      </div>
      <p className="hint small">
        貼圖：Microsoft Fluent Emoji（{STICKER_SOURCE.license} 授權）。點一下加到目前這一秒。
      </p>
    </div>
  );
}
