import { useEffect, useRef, useState } from 'react';
import { decodeAnimBlob } from '../../engine/animImage';
import { ensureUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import type { LibraryRecord } from '../../storage/db';
import { addToLibrary, getLibraryFile, listLibrary, removeFromLibrary } from '../../storage/library';
import { addOverlayClips } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';

/** 上傳的圖片統一轉成 PNG（最長邊 1024）：iPhone 的 HEIC 之後也能用、檔案不會太大、透明背景保留 */
export async function normalizeSticker(file: File, max = 1024): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, bad) =>
      c.toBlob((b) => (b ? ok(b) : bad(new Error('轉成圖片失敗'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addLibrarySticker(id: string) {
  const pid = useProjectStore.getState().project?.id;
  if (!pid) return;
  const { setBusy, player } = useUI.getState();
  setBusy('加入貼圖…');
  try {
    const file = await getLibraryFile(id);
    if (!file) return toast('找不到這個貼圖');
    const res = await importFiles(pid, [file]);
    if (!res.assets.length) return toast(`貼圖加不進去：${res.failed[0]?.reason ?? '不明原因'}`, 6000);
    await ensureUrls(pid, res.assets);
    addOverlayClips(res.assets, player?.time ?? 0, { scale: 0.3 });
    if (window.scrollY > 200) toast('已加入貼圖，往上滑看預覽');
  } finally {
    setBusy(null);
  }
}

/** 我的貼圖：自己上傳的圖存在這台手機，所有專案共用（使用者 2026-11-12） */
export function MyStickers() {
  const [items, setItems] = useState<(LibraryRecord & { url: string })[] | null>(null);
  const [manage, setManage] = useState(false);
  const [version, setVersion] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    let urls: string[] = [];
    void listLibrary('sticker').then((list) => {
      if (!alive) return;
      const withUrl = list.map((r) => ({
        ...r,
        url: URL.createObjectURL(new Blob([r.file], { type: r.mime })),
      }));
      urls = withUrl.map((x) => x.url);
      setItems(withUrl);
    });
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [version]);

  const upload = async (files: FileList | null) => {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const { setBusy } = useUI.getState();
    setBusy('存到我的貼圖…');
    let ok = 0;
    try {
      for (const f of list) {
        try {
          // 會動的 GIF／動態 WebP：保留原檔（轉成 PNG 就不會動了）；其他圖片統一轉成 PNG
          const anim = f.size <= 8 * 1024 * 1024 && (await decodeAnimBlob(f).catch(() => null));
          if (anim) anim.frames.forEach((fr) => fr.close());
          await addToLibrary(anim ? f : await normalizeSticker(f), f.name, 'sticker');
          ok++;
        } catch {
          toast(`「${f.name}」打不開，換一張試試`, 5000);
        }
      }
    } finally {
      setBusy(null);
    }
    if (ok) toast(`已存 ${ok} 個貼圖到「我的貼圖」（所有專案都能用）`);
    setVersion((v) => v + 1);
  };

  return (
    <div className="my-stickers">
      <div className="chips">
        <button className="chip sm add" onClick={() => input.current?.click()}>
          ＋ 上傳自己的貼圖
        </button>
        {items && items.length > 0 && (
          <button
            className={`chip sm${manage ? ' active' : ''}`}
            aria-pressed={manage}
            onClick={() => setManage(!manage)}
          >
            {manage ? '完成' : '管理'}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="my-sticker-input"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = '';
        }}
      />
      {items && items.length === 0 && (
        <p className="hint">
          把自己的圖片（建議去背的 PNG）存在這裡，所有專案都能用，不用每次重新匯入。只存在這台手機。
        </p>
      )}
      <div className="sticker-grid" data-testid="my-sticker-grid">
        {(items ?? []).map((r) => (
          <div key={r.id} className="sticker-wrap">
            <button
              className="sticker-cell"
              aria-label={`我的貼圖 ${r.name}`}
              onClick={() => (manage ? undefined : void addLibrarySticker(r.id))}
            >
              <img src={r.url} alt="" draggable={false} />
            </button>
            {manage && (
              <button
                className="sticker-del"
                aria-label={`刪除我的貼圖 ${r.name}`}
                onClick={() => void removeFromLibrary(r.id).then(() => setVersion((v) => v + 1))}
              >
                <span>✕</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
