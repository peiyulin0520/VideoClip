import { Film, MoreHorizontal, Plus, Settings, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { importFiles } from '../../engine/importMedia';
import { formatTime, mainItems, mainTrack, relayout, totalDuration } from '../../engine/timeline';
import { ASPECTS, assignAspect, createProject, nextProjectName, pickAspect } from '../../model/defaults';
import type { Aspect, Project } from '../../model/types';
import { requestPersistence } from '../../storage/media';
import {
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  saveProject,
} from '../../storage/projects';
import { useFonts } from '../../fonts/fontStore';
import { useApp } from '../../store/appStore';
import { toast, useUI } from '../../store/uiStore';
import { ConfirmSheet, Sheet } from '../../ui/Sheet';

function coverOf(p: Project): string | undefined {
  const first = mainItems(p)[0];
  return first ? p.assets.find((a) => a.id === first.assetId)?.thumbs[0] : undefined;
}

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone =
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function Home() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [aspect, setAspect] = useState<Aspect | 'auto'>('auto');
  const [menuFor, setMenuFor] = useState<Project | null>(null);
  const [renameFor, setRenameFor] = useState<Project | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [deleteFor, setDeleteFor] = useState<Project | null>(null);
  const [tipHidden, setTipHidden] = useState(() => safeGet('tip-ios-a2hs') === '1');
  const pickRef = useRef<HTMLInputElement>(null);
  const fontCount = useFonts((st) => st.installed.size + st.userFonts.length);
  const fontsReady = useFonts((st) => st.ready);
  const bannerDismissed = useApp((st) => st.state.fontsBannerDismissed);
  const appLoaded = useApp((st) => st.loaded);

  const refresh = useCallback(async () => setProjects(await listProjects()), []);
  useEffect(() => {
    let alive = true;
    void listProjects().then((list) => alive && setProjects(list));
    void requestPersistence();
    return () => {
      alive = false;
    };
  }, []);

  const createAndOpen = async (files: File[]) => {
    const { setBusy } = useUI.getState();
    const auto = aspect === 'auto';
    const p = createProject(
      nextProjectName((projects ?? []).map((x) => x.name)),
      auto ? '9:16' : aspect,
      Date.now(),
      auto,
    );
    setNewOpen(false);
    if (files.length === 0) {
      await saveProject(p);
      navigate(`/p/${p.id}`);
      return;
    }
    setBusy(`匯入中… 0/${files.length}`);
    try {
      const res = await importFiles(p.id, files, (d, n) => setBusy(`匯入中… ${d}/${n}`));
      p.assets = res.assets;
      mainTrack(p).items = relayout(res.clips);
      // 自動：照第一個素材的形狀決定專案比例（之後在編輯器還可以改）
      const first = res.assets[0];
      if (auto && first) assignAspect(p, pickAspect(first.width, first.height), true);
      await saveProject(p);
      if (res.failed.length) toast(`無法匯入：${res.failed.map((f) => f.name).join('、')}`);
      navigate(`/p/${p.id}`);
    } finally {
      setBusy(null);
    }
  };

  const hideTip = () => {
    setTipHidden(true);
    try {
      localStorage.setItem('tip-ios-a2hs', '1');
    } catch {
      /* 無痕模式等情況存不了，沒關係 */
    }
  };

  return (
    <main className="page">
      <header className="topbar">
        <h1>VideoClip 剪輯</h1>
        <Link className="icon-btn" to="/settings" aria-label="設定">
          <Settings size={22} />
        </Link>
      </header>

      {appLoaded && fontsReady && fontCount === 0 && !bannerDismissed && (
        <div className="banner" role="note" data-testid="fonts-banner">
          <span>還沒下載字體，字卡只能用系統字體。</span>
          <Link to="/settings">去下載</Link>
          <button
            className="icon-btn"
            aria-label="關閉提示"
            onClick={() => void useApp.getState().update({ fontsBannerDismissed: true })}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {isIOS && !isStandalone && !tipHidden && (
        <div className="tip" role="note">
          <span>iPhone 請按 Safari 的「分享」→「加入主畫面」，專案才不會被 Safari 定期清掉。</span>
          <button className="icon-btn" aria-label="關閉提示" onClick={hideTip}>
            <X size={18} />
          </button>
        </div>
      )}

      {projects && projects.length === 0 && (
        <section className="empty">
          <Film size={40} />
          <p className="empty-title">還沒有專案</p>
          <p className="empty-note">按右下角的「＋」開始第一個剪輯專案。專案只存在這台裝置上。</p>
        </section>
      )}

      <section className="grid" aria-label="專案列表">
        {projects?.map((p) => {
          const cover = coverOf(p);
          return (
            <article key={p.id} className="card" data-testid="project-card">
              <Link to={`/p/${p.id}`} className="card-link" aria-label={`開啟 ${p.name}`}>
                <div className="cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
                  {!cover && <Film size={28} />}
                  <span className="badge">{formatTime(totalDuration(p))}</span>
                </div>
                <div className="card-name">{p.name}</div>
                <div className="card-sub">
                  {p.aspect} ·{' '}
                  {new Date(p.updatedAt).toLocaleString('zh-TW', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </div>
              </Link>
              <button
                className="icon-btn card-menu"
                aria-label={`${p.name} 的選單`}
                onClick={() => setMenuFor(p)}
              >
                <MoreHorizontal size={20} />
              </button>
            </article>
          );
        })}
      </section>

      <button className="fab" aria-label="新增專案" onClick={() => setNewOpen(true)}>
        <Plus size={28} />
      </button>

      <Sheet open={newOpen} title="新專案" onClose={() => setNewOpen(false)}>
        <div className="chips" role="radiogroup" aria-label="畫面比例">
          <button
            role="radio"
            aria-checked={aspect === 'auto'}
            className={`chip${aspect === 'auto' ? ' active' : ''}`}
            onClick={() => setAspect('auto')}
          >
            自動（跟第一支影片）
          </button>
          {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
            <button
              key={a}
              role="radio"
              aria-checked={aspect === a}
              className={`chip${aspect === a ? ' active' : ''}`}
              onClick={() => setAspect(a)}
            >
              {ASPECTS[a].label}
            </button>
          ))}
        </div>
        <div className="sheet-row">
          <button className="btn" onClick={() => void createAndOpen([])}>
            建立空白專案
          </button>
          <button className="btn primary" onClick={() => pickRef.current?.click()}>
            選擇素材並建立
          </button>
        </div>
      </Sheet>
      <input
        ref={pickRef}
        type="file"
        accept="video/*,image/*"
        multiple
        hidden
        data-testid="new-project-files"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          if (files.length) void createAndOpen(files);
        }}
      />

      <Sheet open={!!menuFor} title={menuFor?.name ?? ''} onClose={() => setMenuFor(null)}>
        <button
          className="menu-item"
          onClick={() => {
            if (!menuFor) return;
            setNameDraft(menuFor.name);
            setRenameFor(menuFor);
            setMenuFor(null);
          }}
        >
          改名
        </button>
        <button
          className="menu-item"
          onClick={async () => {
            const p = menuFor;
            setMenuFor(null);
            if (!p) return;
            useUI.getState().setBusy('複製中…');
            try {
              await duplicateProject(p.id);
              await refresh();
              toast('已複製專案');
            } catch {
              toast('複製失敗（可能是儲存空間不足）');
            } finally {
              useUI.getState().setBusy(null);
            }
          }}
        >
          複製
        </button>
        <button
          className="menu-item danger"
          onClick={() => {
            setDeleteFor(menuFor);
            setMenuFor(null);
          }}
        >
          刪除
        </button>
      </Sheet>

      <Sheet open={!!renameFor} title="專案改名" onClose={() => setRenameFor(null)}>
        <input
          className="text-input"
          aria-label="新名稱"
          value={nameDraft}
          maxLength={40}
          onChange={(e) => setNameDraft(e.target.value)}
          autoFocus
        />
        <div className="sheet-row">
          <button className="btn" onClick={() => setRenameFor(null)}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              const n = nameDraft.trim();
              if (renameFor && n) {
                await renameProject(renameFor.id, n);
                await refresh();
              }
              setRenameFor(null);
            }}
          >
            確定
          </button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={!!deleteFor}
        title="刪除專案"
        message={`確定要刪除「${deleteFor?.name ?? ''}」嗎？影片素材也會一起從這台裝置刪掉，無法復原。`}
        confirmText="刪除"
        onClose={() => setDeleteFor(null)}
        onConfirm={async () => {
          if (deleteFor) {
            await deleteProject(deleteFor.id);
            await refresh();
            toast('已刪除');
          }
        }}
      />
    </main>
  );
}
