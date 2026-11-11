import { APP_VERSION } from '../pwa';
import { ChevronLeft, Download, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CATALOG, formatMB, packBytes, packFonts, PACKS, PERSONAL_FONTS } from '../../fonts/catalog';
import { importUserFont, removeFont, removeUserFont, useFonts } from '../../fonts/fontStore';
import { parseDriveFolderId, type BackupMode } from '../../storage/appState';
import { storageEstimate } from '../../storage/media';
import { useApp } from '../../store/appStore';
import { toast, useUI } from '../../store/uiStore';
import { percent, usePackInstall } from '../fonts/usePackInstall';

const MODES: { mode: BackupMode; label: string }[] = [
  { mode: 'files', label: '存在手機檔案（匯出 .zip）' },
  { mode: 'cloud', label: 'Google 雲端（之後開放，先記下選擇）' },
  { mode: 'none', label: '先不要備份' },
];

export function Settings() {
  const installed = useFonts((s) => s.installed);
  const userFonts = useFonts((s) => s.userFonts);
  const backup = useApp((s) => s.state.backup);
  const update = useApp((s) => s.update);
  const install = usePackInstall();
  const fileRef = useRef<HTMLInputElement>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [driveUrl, setDriveUrl] = useState(backup.driveFolderUrl ?? '');
  const [openLicenses, setOpenLicenses] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const e = await storageEstimate();
      const p = (await navigator.storage?.persisted?.()) ?? null;
      if (alive) {
        setUsage(e);
        setPersisted(p);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [installed, userFonts]);

  const packs = Object.keys(PACKS).filter((p) => packFonts(p).length > 0);
  const driveId = parseDriveFolderId(driveUrl);

  return (
    <main className="page settings">
      <header className="topbar">
        <Link className="icon-btn" to="/" aria-label="回首頁">
          <ChevronLeft />
        </Link>
        <h1>設定</h1>
      </header>

      <section aria-label="字體">
        <h2>字體</h2>
        <p className="hint">
          已下載 {installed.size} / {CATALOG.length} 款。字體存在這台裝置，用到時才會載入。
        </p>
        {install.running && (
          <div className="install-box">
            <div className="progress">
              <div style={{ width: `${percent(install.progress)}%` }} />
            </div>
            <p className="hint">
              {install.progress
                ? `${install.progress.finished}/${install.progress.total} · ${install.progress.current}`
                : '準備中…'}
            </p>
            <button className="btn" onClick={install.cancel}>
              停止
            </button>
          </div>
        )}
        {packs.map((p) => {
          const fonts = packFonts(p);
          const have = fonts.filter((f) => installed.has(f.key)).length;
          const all = have === fonts.length;
          return (
            <div key={p} className="pack-block" data-testid="pack-block" data-pack={p}>
              <div className="pack-head">
                <div>
                  <b>{PACKS[p]}</b>
                  <small>
                    {have}/{fonts.length} 款已下載 · 全部 {formatMB(packBytes(p))}
                  </small>
                </div>
                {all ? (
                  <button
                    className="btn sm"
                    aria-label={`移除 ${PACKS[p]}`}
                    onClick={async () => {
                      for (const f of fonts) await removeFont(f.key);
                      toast('已移除（重新整理後生效，用到時會自動再下載）');
                    }}
                  >
                    <Trash2 size={16} /> 移除
                  </button>
                ) : (
                  <button
                    className="btn sm primary"
                    aria-label={`下載 ${PACKS[p]}`}
                    disabled={install.running}
                    onClick={async () => {
                      const r = await install.run([p]);
                      toast(r.failed.length ? `有 ${r.failed.length} 個沒下載成功，再試一次` : '下載完成');
                    }}
                  >
                    <Download size={16} /> 下載
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <h3>我的字體（只存在這台裝置）</h3>
        {userFonts.length === 0 && <p className="hint">還沒有匯入的字體。</p>}
        {userFonts.map((u) => (
          <div key={u.id} className="pack-head">
            <div>
              <b style={{ fontFamily: `vcu-${u.id}, system-ui` }}>{u.name}</b>
              <small>{formatMB(u.bytes)}</small>
            </div>
            <button
              className="btn sm"
              aria-label={`刪除 ${u.name}`}
              onClick={() => void removeUserFont(u.id)}
            >
              <Trash2 size={16} /> 刪除
            </button>
          </div>
        ))}
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <Plus size={18} /> 匯入字體檔
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,font/*"
          multiple
          hidden
          data-testid="settings-font-input"
          onChange={async (e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = '';
            const { setBusy } = useUI.getState();
            for (const f of files) {
              setBusy(`匯入 ${f.name}…`);
              try {
                const uf = await importUserFont(f);
                toast(`已匯入「${uf.name}」`);
              } catch {
                toast(`「${f.name}」不是瀏覽器能讀的字體檔`);
              }
            }
            setBusy(null);
          }}
        />

        <button
          className="link-btn"
          onClick={() => setOpenLicenses(!openLicenses)}
          aria-expanded={openLicenses}
        >
          字體授權與來源 {openLicenses ? '▲' : '▼'}
        </button>
        {openLicenses && (
          <div className="licenses">
            {CATALOG.map((f) => (
              <p key={f.key}>
                <b>{f.label}</b> {f.license}
                <br />
                <small>{f.source}</small>
              </p>
            ))}
            <p className="hint">以下字體的授權不允許放在公開網站，請自己匯入：</p>
            {PERSONAL_FONTS.map((f) => (
              <p key={f.label}>
                <b>{f.label}</b> {f.license}
                <br />
                <small>{f.how}</small>
              </p>
            ))}
          </div>
        )}
      </section>

      <section aria-label="備份位置">
        <h2>專案備份位置</h2>
        <div className="chips" role="radiogroup" aria-label="備份位置">
          {MODES.map((m) => (
            <button
              key={m.mode}
              role="radio"
              aria-checked={backup.mode === m.mode}
              className={`chip${backup.mode === m.mode ? ' active' : ''}`}
              onClick={() => void update({ backup: { ...backup, mode: m.mode } })}
            >
              {m.label}
            </button>
          ))}
        </div>
        {backup.mode === 'cloud' && (
          <label className="field">
            <span>Google 雲端資料夾網址（選填）</span>
            <input
              className="text-input"
              aria-label="Google 雲端資料夾網址"
              value={driveUrl}
              placeholder="https://drive.google.com/drive/folders/…"
              onChange={(e) => setDriveUrl(e.target.value)}
              onBlur={() =>
                void update({
                  backup: { ...backup, driveFolderUrl: driveUrl.trim(), driveFolderId: driveId ?? undefined },
                })
              }
            />
            {driveUrl.trim() && (
              <small className={driveId ? 'ok' : 'warn'}>
                {driveId ? '已讀到資料夾' : '這不像資料夾網址'}
              </small>
            )}
          </label>
        )}
        <p className="hint">雲端備份與還原會在之後的版本開放；目前專案只存在這台裝置。</p>
      </section>

      <section aria-label="儲存空間">
        <h2>儲存空間</h2>
        <p className="hint" data-testid="storage-usage">
          {usage ? `已用 ${formatMB(usage.usage)} / 可用約 ${formatMB(usage.quota)}` : '無法讀取'}
          <br />
          {persisted === true && '瀏覽器已承諾不會自動清掉這些資料。'}
          {persisted === false && '瀏覽器可能在空間不足時清掉資料。iPhone 請「加入主畫面」，並定期備份。'}
        </p>
      </section>

      <section aria-label="素材授權">
        <h2>素材授權</h2>
        <p className="hint">
          貼圖：Microsoft Fluent Emoji（MIT 授權，
          <a href={`${import.meta.env.BASE_URL}stickers/LICENSE.txt`} target="_blank" rel="noreferrer">
            授權全文
          </a>
          ）。圖形庫與裝飾是本 App 自己畫的。
        </p>
      </section>

      <section aria-label="版本">
        <h2>版本</h2>
        <p className="hint" data-testid="app-version">
          {APP_VERSION}
          <br />
          網站更新後，打開網頁或切回這個分頁時會自動換成新版。如果版本沒變，把 Safari 分頁完全關掉再打開。
        </p>
      </section>
    </main>
  );
}
