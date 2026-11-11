import { ChevronDown, Cloud, Plus, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CATALOG, coverageLabel, formatMB, PACKS, type CatalogFont } from '../../fonts/catalog';
import { ensureFont, ensurePreview, importUserFont, previewImageUrl, useFonts } from '../../fonts/fontStore';
import { toast, useUI } from '../../store/uiStore';
import { Sheet } from '../../ui/Sheet';

export const SYSTEM_FONT_ID = 'system';

/** 載入預覽字樣，一次最多同時抓 6 個 */
async function loadPreviews(fonts: CatalogFont[], onReady: (key: string, family: string | null) => void, alive: () => boolean) {
  let i = 0;
  const worker = async () => {
    while (i < fonts.length && alive()) {
      const f = fonts[i++]!;
      onReady(f.key, await ensurePreview(f));
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

/** 字體選單：每個字體用自己的字形顯示名稱。放在字卡分頁。 */
export function FontSelect({ value, onChange }: { value: string; onChange: (fontId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [families, setFamilies] = useState<Record<string, string | null>>({});
  const installed = useFonts((s) => s.installed);
  const userFonts = useFonts((s) => s.userFonts);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadPreviews(CATALOG, (key, fam) => alive && setFamilies((m) => ({ ...m, [key]: fam })), () => alive);
    return () => {
      alive = false;
    };
  }, [open]);

  const current =
    value === SYSTEM_FONT_ID
      ? '系統預設字體'
      : value.startsWith('u:')
        ? (userFonts.find((u) => `u:${u.id}` === value)?.name ?? '匯入的字體')
        : (CATALOG.find((f) => f.key === value)?.label ?? '系統預設字體');

  const pick = async (fontId: string) => {
    if (fontId !== SYSTEM_FONT_ID) {
      const { setBusy } = useUI.getState();
      setBusy('載入字體…');
      const ok = await ensureFont(fontId).finally(() => setBusy(null));
      if (!ok) return toast('字體載入失敗，請確認網路後再試一次');
    }
    onChange(fontId);
    setOpen(false);
  };

  const packs = Object.keys(PACKS);

  return (
    <>
      <button className="font-select" aria-label="字體" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Type size={18} />
        <span className="font-select-name">{current}</span>
        <ChevronDown size={18} />
      </button>

      <Sheet open={open} title="選擇字體" onClose={() => setOpen(false)}>
        <div className="font-list" data-testid="font-list">
          <button className={`font-row${value === SYSTEM_FONT_ID ? ' active' : ''}`} onClick={() => void pick(SYSTEM_FONT_ID)}>
            <span className="font-prev">系統預設字體 永遠的家 Aa 123</span>
          </button>

          {userFonts.length > 0 && <div className="font-group">我的字體（只存在這台裝置）</div>}
          {userFonts.map((u) => (
            <button key={u.id} className={`font-row${value === `u:${u.id}` ? ' active' : ''}`} onClick={() => void pick(`u:${u.id}`)}>
              <span className="font-prev" style={{ fontFamily: `vcu-${u.id}, system-ui` }}>
                {u.name} 永遠的家 Aa 123
              </span>
            </button>
          ))}

          {packs.map((pack) => {
            const fonts = CATALOG.filter((f) => f.pack === pack);
            if (fonts.length === 0) return null;
            return (
              <div key={pack}>
                <div className="font-group">{PACKS[pack]}</div>
                {fonts.map((f) => {
                  const cov = coverageLabel(f);
                  const fam = families[f.key];
                  return (
                    <button
                      key={f.key}
                      className={`font-row${value === f.key ? ' active' : ''}`}
                      data-testid="font-row"
                      data-font-key={f.key}
                      onClick={() => void pick(f.key)}
                    >
                      {f.previewKind === 'image' ? (
                        <img className="font-prev-img" src={previewImageUrl(f)} alt={f.label} />
                      ) : (
                        <span className="font-prev" style={fam ? { fontFamily: `${fam}, system-ui` } : { opacity: 0.45 }}>
                          {f.label} 永遠的家 Aa 123
                        </span>
                      )}
                      <span className="font-tags">
                        {cov === 'many' && <em className="warn">繁體缺字多</em>}
                        {cov === 'few' && <em className="note">少量缺字</em>}
                        {cov === 'latin' && <em className="note">只有英文</em>}
                        {installed.has(f.key) ? <em className="ok">已下載</em> : (
                          <em className="cloud">
                            <Cloud size={12} /> {formatMB(f.bytes)}
                          </em>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          <button className="font-row import" onClick={() => fileRef.current?.click()}>
            <Plus size={18} /> 匯入字體檔（.ttf .otf .woff2，可以從「檔案」App 選）
          </button>
        </div>
      </Sheet>
      <input
        ref={fileRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/*"
        hidden
        data-testid="font-file-input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const { setBusy } = useUI.getState();
          setBusy('匯入字體…');
          try {
            const uf = await importUserFont(file);
            toast(`已匯入「${uf.name}」`);
            onChange(`u:${uf.id}`);
            setOpen(false);
          } catch {
            toast('這個檔案不是瀏覽器能讀的字體檔');
          } finally {
            setBusy(null);
          }
        }}
      />
    </>
  );
}
