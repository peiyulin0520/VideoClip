import { useState } from 'react';
import { formatMB, packBytes, packFonts, PACKS } from '../fonts/catalog';
import { requestPersistence } from '../storage/media';
import { parseDriveFolderId, type BackupMode } from '../storage/appState';
import { useApp } from '../store/appStore';
import { toast } from '../store/uiStore';
import { percent, usePackInstall } from './fonts/usePackInstall';

type Step = 'first' | 'restore' | 'backup' | 'fonts' | 'installing';

const BACKUP_OPTIONS: { mode: BackupMode; title: string; desc: string }[] = [
  {
    mode: 'files',
    title: '📱 存在手機檔案',
    desc: '要備份時把專案匯出成一個檔案，存到「檔案」App（我的 iPhone 或 iCloud）。iPhone 沒辦法自動存，每次要自己按一下。',
  },
  {
    mode: 'cloud',
    title: '☁️ 存到 Google 雲端',
    desc: '登入 Google 後，自動備份到你選的資料夾。這個功能之後才開放：現在先記下你的選擇，暫時當成「存在手機檔案」。',
  },
  {
    mode: 'none',
    title: '先不要備份',
    desc: '只存在這個瀏覽器。iPhone 的 Safari 如果沒有「加入主畫面」，資料可能被定期清掉。',
  },
];

/** 首次使用精靈：第一次嗎？→ 備份位置 → 下載字體。完成後記在這台裝置，之後不再問。 */
export function Welcome() {
  const update = useApp((s) => s.update);
  const [step, setStep] = useState<Step>('first');
  const [mode, setMode] = useState<BackupMode>('files');
  const [driveUrl, setDriveUrl] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set(['basic']));
  const install = usePackInstall();

  const driveId = parseDriveFolderId(driveUrl);
  const packs = Object.keys(PACKS).filter((p) => packFonts(p).length > 0);
  const pickedBytes = [...picked].reduce((s, p) => s + packBytes(p), 0);

  const finish = async (installedAny: boolean) => {
    void requestPersistence();
    await update({
      onboarded: true,
      backup: {
        mode,
        ...(mode === 'cloud' && driveUrl.trim()
          ? { driveFolderUrl: driveUrl.trim(), ...(driveId ? { driveFolderId: driveId } : {}) }
          : {}),
      },
      fontsBannerDismissed: installedAny,
    });
  };

  const start = async () => {
    setStep('installing');
    const res = await install.run([...picked]);
    if (res.failed.length) toast(`有 ${res.failed.length} 個字體沒下載成功，可以到「設定」再試一次`);
    await finish(res.ok.length > 0);
  };

  return (
    <div className="welcome" role="dialog" aria-label="首次使用" aria-modal="true" data-testid="welcome">
      <div className="welcome-body">
        {step === 'first' && (
          <>
            <h1>歡迎使用 VideoClip 剪輯</h1>
            <p className="hint">專案和影片都只存在這台裝置，不會上傳到任何地方。</p>
            <h2>這是第一次在這台裝置使用嗎？</h2>
            <button className="btn primary big" onClick={() => setStep('backup')}>
              是，第一次使用
            </button>
            <button className="btn big" onClick={() => setStep('restore')}>
              不是，我換了手機或清除過資料
            </button>
          </>
        )}

        {step === 'restore' && (
          <>
            <h2>要把以前的專案找回來嗎？</h2>
            <p className="hint">還原功能會跟「備份」一起在之後的版本開放，現在可以先略過、直接開始使用。</p>
            <button className="btn big" disabled>
              從 Google 雲端還原（之後開放）
            </button>
            <button className="btn big" disabled>
              從手機檔案匯入備份 .zip（之後開放）
            </button>
            <button className="btn primary big" onClick={() => setStep('backup')}>
              先略過，繼續設定
            </button>
          </>
        )}

        {step === 'backup' && (
          <>
            <h2>專案要備份到哪裡？</h2>
            <p className="hint">之後可以在「設定」改。</p>
            <div className="radio-cards" role="radiogroup" aria-label="備份位置">
              {BACKUP_OPTIONS.map((o) => (
                <button
                  key={o.mode}
                  role="radio"
                  aria-checked={mode === o.mode}
                  className={`radio-card${mode === o.mode ? ' active' : ''}`}
                  onClick={() => setMode(o.mode)}
                >
                  <b>{o.title}</b>
                  <span>{o.desc}</span>
                </button>
              ))}
            </div>
            {mode === 'cloud' && (
              <label className="field">
                <span>Google 雲端資料夾網址（選填，之後登入時會直接開在這個資料夾）</span>
                <input
                  className="text-input"
                  aria-label="Google 雲端資料夾網址"
                  placeholder="https://drive.google.com/drive/folders/…"
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                />
                {driveUrl.trim() && (
                  <small className={driveId ? 'ok' : 'warn'}>
                    {driveId ? '已讀到資料夾，先幫你記著' : '這不像資料夾網址，可以先留白'}
                  </small>
                )}
              </label>
            )}
            <button className="btn primary big" onClick={() => setStep('fonts')}>
              下一步
            </button>
          </>
        )}

        {step === 'fonts' && (
          <>
            <h2>要下載哪些字體？</h2>
            <p className="hint">字體會存在這台裝置，之後不用再下載。隨時可以到「設定」增減。</p>
            <div className="pack-list">
              {packs.map((p) => (
                <label key={p} className="pack-row">
                  <input
                    type="checkbox"
                    checked={picked.has(p)}
                    onChange={(e) => {
                      const n = new Set(picked);
                      if (e.target.checked) n.add(p);
                      else n.delete(p);
                      setPicked(n);
                    }}
                  />
                  <span className="pack-name">
                    {PACKS[p]}
                    <small>
                      {packFonts(p).length} 款 · {formatMB(packBytes(p))}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <button className="btn primary big" disabled={picked.size === 0} onClick={() => void start()}>
              {picked.size === 0 ? '還沒選字體包' : `開始下載（${formatMB(pickedBytes)}）`}
            </button>
            <button className="btn big" onClick={() => void finish(false)}>
              先略過，之後再下載
            </button>
          </>
        )}

        {step === 'installing' && (
          <>
            <h2>下載字體中…</h2>
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={percent(install.progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div style={{ width: `${percent(install.progress)}%` }} />
            </div>
            <p className="hint" data-testid="install-status">
              {install.progress
                ? `${install.progress.finished}/${install.progress.total} · ${install.progress.current}`
                : '準備中…'}
            </p>
            <button className="btn big" onClick={install.cancel}>
              停止，先用已經下載好的
            </button>
          </>
        )}
      </div>
    </div>
  );
}
