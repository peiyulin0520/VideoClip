import { useCallback, useEffect, useState } from 'react';
import { ensureUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import {
  getGiphyKey,
  giphyStickers,
  GiphyError,
  giphyToFile,
  setGiphyKey,
  type GiphySticker,
} from '../../stickers/giphy';
import { addOverlayClips } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';

const DASHBOARD = 'https://developers.giphy.com/dashboard/';

/**
 * 沒填過 key：申請說明＋輸入欄位。填過：顯示「已設定」＋更換／刪除。
 * key 只存在這台裝置，不會上傳到 GitHub，別人用不到。
 */
export function GiphyKeySetup({ onSaved, invalid }: { onSaved?: () => void; invalid?: boolean }) {
  const [key, setKey] = useState(getGiphyKey());
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(!getGiphyKey() || !!invalid);
  const [checking, setChecking] = useState(false);

  const save = async () => {
    const k = draft.trim();
    if (!k) return toast('先貼上 API key');
    setChecking(true);
    try {
      await giphyStickers('', k, 1); // 試一次，確定 key 能用
      setGiphyKey(k);
      setKey(k);
      setDraft('');
      setEditing(false);
      toast('GIPHY 已連線');
      onSaved?.();
    } catch (e) {
      if (e instanceof GiphyError && e.kind === 'bad-key') toast('這個 API key 不能用，請再確認一次', 6000);
      else {
        // 連不到（例如暫時沒網路）：先存起來，之後再試
        setGiphyKey(k);
        setKey(k);
        setDraft('');
        setEditing(false);
        toast(`已儲存，但現在${e instanceof Error ? e.message : '連不到 GIPHY'}`, 6000);
        onSaved?.();
      }
    } finally {
      setChecking(false);
    }
  };

  if (key && !editing)
    return (
      <div className="giphy-key" data-testid="giphy-key-set">
        <p className="hint">GIPHY API key 已設定（只存在這台手機：…{key.slice(-4)}）。</p>
        <div className="chips">
          <button className="chip sm" onClick={() => setEditing(true)}>
            更換 key
          </button>
          <button
            className="chip sm"
            onClick={() => {
              setGiphyKey(null);
              setKey(null);
              setEditing(true);
            }}
          >
            刪除 key
          </button>
        </div>
      </div>
    );

  return (
    <div className="giphy-key" data-testid="giphy-key-setup">
      {invalid && (
        <p className="hint warn">目前存的 GIPHY API key 不能用，請重新貼上（或照下面步驟再申請一組）。</p>
      )}
      <p className="hint">
        要用 IG 同款的 GIPHY 貼圖，需要一組免費的 GIPHY API key（只要申請一次，貼上後會記在這台手機）：
      </p>
      <ol className="giphy-steps">
        <li>
          打開{' '}
          <a href={DASHBOARD} target="_blank" rel="noreferrer">
            GIPHY Developers
          </a>
          ，建立帳號（或登入）。
        </li>
        <li>進入 Dashboard，按「Create an API Key」。</li>
        <li>選「API」；App 名稱和說明都填「VideoClip」；平台選「Web」；同意條款後建立。</li>
        <li>複製產生的 API Key，貼到下面，按「儲存」。</li>
      </ol>
      <p className="hint small">
        key 只存在這台手機，不會放到 GitHub 或任何網站，別人用不到。免費 key 每小時大約可以搜尋 100 次。
      </p>
      <div className="giphy-key-row">
        <input
          className="text-input"
          aria-label="GIPHY API key"
          placeholder="貼上 API key"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn primary" disabled={checking} onClick={() => void save()}>
          {checking ? '確認中…' : '儲存'}
        </button>
      </div>
      {key && (
        <button className="chip sm" onClick={() => setEditing(false)}>
          取消
        </button>
      )}
    </div>
  );
}

export async function addGiphySticker(s: GiphySticker): Promise<string | null> {
  const pid = useProjectStore.getState().project?.id;
  if (!pid) return null;
  const { setBusy, player } = useUI.getState();
  setBusy('加入貼圖…');
  try {
    const res = await importFiles(pid, [await giphyToFile(s)]);
    if (!res.assets.length) {
      toast(`貼圖加不進去：${res.failed[0]?.reason ?? '不明原因'}`, 6000);
      return null;
    }
    await ensureUrls(pid, res.assets);
    const id = addOverlayClips(res.assets, player?.time ?? 0, { scale: 0.3 });
    if (window.scrollY > 200) toast('已加入貼圖，往上滑看預覽');
    return id;
  } catch (e) {
    toast(`貼圖加不進去：${e instanceof Error ? e.message : String(e)}`, 6000);
    return null;
  } finally {
    setBusy(null);
  }
}

/** GIPHY 分頁：搜尋＋熱門。結果不存，每次各自搜尋 */
export function GiphyPanel() {
  const [hasKey, setHasKey] = useState(!!getGiphyKey());
  const [badKey, setBadKey] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<GiphySticker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fail = useCallback((e: unknown) => {
    setItems([]);
    if (e instanceof GiphyError && (e.kind === 'bad-key' || e.kind === 'no-key')) {
      setBadKey(e.kind === 'bad-key');
      setHasKey(false);
    }
    setError(e instanceof Error ? e.message : String(e));
  }, []);

  // 搜尋（按鈕觸發）
  const search = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      setItems(await giphyStickers(query));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  };

  // 有 key 時先載入熱門貼圖（items 還是 null 的時候畫面顯示「載入中」）
  useEffect(() => {
    if (!hasKey) return;
    let alive = true;
    giphyStickers('')
      .then((r) => alive && setItems(r))
      .catch((e) => alive && fail(e));
    return () => {
      alive = false;
    };
  }, [hasKey, fail]);

  if (!hasKey)
    return (
      <GiphyKeySetup
        invalid={badKey}
        onSaved={() => {
          setBadKey(false);
          setItems(null);
          setError(null);
          setHasKey(true);
        }}
      />
    );

  return (
    <div className="giphy-panel">
      <form
        className="giphy-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <input
          className="text-input"
          type="search"
          aria-label="搜尋 GIPHY 貼圖"
          placeholder="搜尋貼圖（例如：愛心、cat、生日）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn" type="submit">
          搜尋
        </button>
      </form>
      {error && <p className="hint warn">{error}</p>}
      {(loading || (items === null && !error)) && <p className="hint">載入中…</p>}
      <div className="sticker-grid" data-testid="giphy-grid">
        {(items ?? []).map((s) => (
          <button
            key={s.id}
            className="sticker-cell"
            aria-label={`GIPHY 貼圖 ${s.title || s.id}`}
            data-giphy={s.id}
            onClick={() => void addGiphySticker(s)}
          >
            <img src={s.thumb} alt="" loading="lazy" draggable={false} />
          </button>
        ))}
      </div>
      {items && items.length === 0 && !error && !loading && (
        <p className="hint">找不到貼圖，換個關鍵字試試。</p>
      )}
      <p className="hint small">
        Powered by{' '}
        <a href="https://giphy.com" target="_blank" rel="noreferrer">
          GIPHY
        </a>
        。只會送出搜尋的字，不會上傳影片；加入專案的是貼圖的第一格（會動的版本之後再做）。
      </p>
    </div>
  );
}
