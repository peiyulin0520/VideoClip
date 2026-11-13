import { ChevronLeft, Pause, Play, Redo2, Share, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { countEditorRender } from '../../engine/debug';
import { ensureUrls, releaseProjectUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import { enqueueProxies } from '../../engine/proxyQueue';
import { addOverlayClips, importToBase } from '../../store/actions';
import { coverFromProject } from '../../engine/cover';
import { formatTime, totalDuration } from '../../engine/timeline';
import { getProjectMigrated, saveProject } from '../../storage/projects';
import { startAutosave } from '../../store/autosave';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { ASPECTS } from '../../model/defaults';
import { shortVersion } from '../pwa';
import type { Aspect } from '../../model/types';
import { setProjectAspect } from '../../store/actions';
import { Sheet } from '../../ui/Sheet';
import { ExportSheet } from '../editor/ExportSheet';
import { Preview } from '../editor/Preview';
import { Timeline, MAX_PPS, MIN_PPS } from '../editor/Timeline';
import { BottomBar } from '../editor/Toolbar';

export function Editor() {
  const { projectId = '' } = useParams();
  // key：換專案時整個重新載入
  return <EditorLoader key={projectId} projectId={projectId} />;
}

function EditorLoader({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready'>('loading');

  useEffect(() => {
    let cancelled = false;
    let autosave: ReturnType<typeof startAutosave> | null = null;
    (async () => {
      const migrated = await getProjectMigrated(projectId);
      if (cancelled) return;
      if (!migrated) return setStatus('missing');
      const p = migrated.project;
      if (migrated.changed) await saveProject(p); // 舊格式（v1）：轉成新格式存回去，下次打開就不用再轉
      if (cancelled) return;
      const missing = await ensureUrls(p.id, p.assets);
      if (cancelled) return;
      useProjectStore.getState().load(p);
      autosave = startAutosave();
      enqueueProxies(p.id, p.assets); // 舊專案的大影片：背景補做預覽用輕量影片
      setStatus('ready');
      if (migrated.reordered) toast('為了讓字卡永遠在影像上面，這個專案的圖層順序已經調整過', 9000);
      if (missing.length)
        toast(`找不到素材檔：${missing.join('、')}（可能是上次存不下、沒有留在手機裡，請重新匯入）`, 8000);
    })();
    return () => {
      cancelled = true;
      void autosave?.stop(); // 先同步抓目前內容存檔，再關閉
      useProjectStore.getState().close();
      releaseProjectUrls(projectId);
    };
  }, [projectId]);

  if (status === 'loading')
    return (
      <main className="page">
        <p className="empty-note">載入中…</p>
      </main>
    );
  if (status === 'missing')
    return (
      <main className="page">
        <header className="topbar">
          <Link className="icon-btn" to="/" aria-label="回首頁">
            <ChevronLeft />
          </Link>
          <h1>找不到這個專案</h1>
        </header>
        <p className="empty-note">專案只存在建立它的那台裝置上；換裝置或清除瀏覽器資料後就不會有了。</p>
      </main>
    );
  return <EditorBody />;
}

/** 播放時間：自己訂閱播放器，播放中最多每 100 毫秒更新一次（不讓整個編輯器每一格都重畫） */
function TimeText({ total }: { total: number }) {
  const player = useUI((s) => s.player);
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!player) return;
    let last = 0;
    let alive = true;
    queueMicrotask(() => alive && setTime(player.time));
    const unsub = player.subscribe((t, playing) => {
      const now = performance.now();
      if (playing && now - last < 100) return;
      last = now;
      setTime(t);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [player]);
  return (
    <span className="time" data-testid="time">
      {formatTime(time)} / {formatTime(total)}
    </span>
  );
}

function EditorBody() {
  const project = useProjectStore((s) => s.project)!;
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const player = useUI((s) => s.player);
  const previewFull = useUI((s) => s.previewFull);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pps, setPps] = useState(60);
  const [playing, setPlaying] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const total = totalDuration(project);

  useEffect(() => {
    countEditorRender();
  });

  useEffect(() => {
    if (!player) return;
    return player.subscribe((_t, p) => {
      setPlaying(p);
    });
  }, [player]);

  const importMode = useRef<'main' | 'overlay'>('main');
  const pick = (mode: 'main' | 'overlay') => {
    importMode.current = mode;
    fileInput.current?.click();
  };

  const onFiles = useCallback(async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (fileInput.current) fileInput.current.value = '';
    if (files.length === 0) return;
    const { setBusy } = useUI.getState();
    const pid = useProjectStore.getState().project!.id;
    setBusy(`匯入中… 0/${files.length}`);
    try {
      const res = await importFiles(pid, files, (d, n, detail) =>
        setBusy(`匯入中… ${d}/${n}${detail ? `（${detail}）` : ''}`),
      );
      if (res.assets.length) {
        await ensureUrls(pid, res.assets);
        enqueueProxies(pid, res.assets);
        const player = useUI.getState().player;
        if (importMode.current === 'overlay') {
          // 疊加：放在播放頭這一秒，同一秒疊多個就各佔一條軌道
          addOverlayClips(res.assets, player?.time ?? 0);
        } else {
          // 接在最下面那條影像軌的最後面；不自動選取（滿版的影片選取框會像「要手動縮小」的框）
          const startOfNew = importToBase(res.assets, res.clips);
          player?.seek(startOfNew);
        }
      }
      if (res.failed.length)
        toast(`無法匯入：${res.failed.map((f) => `${f.name}（${f.reason}）`).join('、')}`, 9000);
      else if (res.assets.length) toast(`已匯入 ${res.assets.length} 個素材`);
      if (res.warnings.length) toast(res.warnings.join('；'), 9000);
    } finally {
      setBusy(null);
    }
  }, []);

  // 大大的「匯入」鈕只在專案完全是空的時候顯示；已經有文字／貼圖時不要蓋在預覽中央（會擋住字卡），主軌的＋還在時間軸上
  const empty = project.tracks.every((t) => t.items.length === 0);

  return (
    <main className={`editor${previewFull ? ' preview-full' : ''}`}>
      <header className="ed-top">
        <Link className="icon-btn" to="/" aria-label="回首頁">
          <ChevronLeft />
        </Link>
        <button
          className="name-btn"
          aria-label="專案名稱"
          onClick={() => {
            setNameDraft(project.name);
            setRenaming(true);
          }}
        >
          {project.name}
          <span className="proj-ver" data-testid="proj-ver">
            {shortVersion()}
          </span>
        </button>
        <button className="ratio-btn" aria-label="畫面比例" onClick={() => setRatioOpen(true)}>
          {project.aspect}
        </button>
        <button
          className="icon-btn"
          aria-label="復原"
          aria-disabled={!canUndo}
          onClick={() => {
            if (!useProjectStore.getState().undo()) toast('沒有可復原的動作');
          }}
        >
          <Undo2 size={22} />
        </button>
        <button
          className="icon-btn"
          aria-label="重做"
          aria-disabled={!canRedo}
          onClick={() => {
            if (!useProjectStore.getState().redo()) toast('沒有可重做的動作');
          }}
        >
          <Redo2 size={22} />
        </button>
        <button
          className="icon-btn"
          aria-label="匯出影片"
          onClick={() => {
            useUI.getState().player?.pause();
            setExportOpen(true);
          }}
        >
          <Share size={22} />
        </button>
      </header>

      <Preview
        projectId={project.id}
        width={project.width}
        height={project.height}
        emptyAction={empty ? () => pick('main') : undefined}
      />

      <div className="playbar">
        <button
          className="icon-btn"
          aria-label={playing ? '暫停' : '播放'}
          onClick={() => {
            if (total <= 0) return toast('先匯入影片或照片');
            player?.toggle();
          }}
        >
          {playing ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <TimeText total={total} />
        <span className="spacer" />
        <button
          className="icon-btn"
          aria-label="縮小時間軸"
          onClick={() => setPps(Math.max(pps / 1.5, MIN_PPS))}
        >
          <ZoomOut size={22} />
        </button>
        <button
          className="icon-btn"
          aria-label="放大時間軸"
          onClick={() => setPps(Math.min(pps * 1.5, MAX_PPS))}
        >
          <ZoomIn size={22} />
        </button>
      </div>

      <Timeline pps={pps} setPps={setPps} onAdd={() => pick('main')} />
      <BottomBar onImportMain={() => pick('main')} onImportOverlay={() => pick('overlay')} />

      <input
        ref={fileInput}
        type="file"
        accept="video/*,image/*"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => void onFiles(e.target.files)}
      />

      <ExportSheet project={project} open={exportOpen} onClose={() => setExportOpen(false)} />

      <Sheet open={ratioOpen} title="畫面比例" onClose={() => setRatioOpen(false)}>
        <p className="hint">改了之後，影片和文字的位置、大小會跟著新的畫面。可以按「復原」改回來。</p>
        <div className="chips" role="radiogroup" aria-label="選擇畫面比例">
          <button
            role="radio"
            aria-checked={!!project.aspectAuto}
            className={`chip${project.aspectAuto ? ' active' : ''}`}
            onClick={() => {
              const a = setProjectAspect('auto');
              if (a) toast(`已設成自動（目前是 ${a}）`);
              setRatioOpen(false);
            }}
          >
            自動（跟第一支影片）
          </button>
          {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
            <button
              key={a}
              role="radio"
              aria-checked={!project.aspectAuto && project.aspect === a}
              className={`chip${!project.aspectAuto && project.aspect === a ? ' active' : ''}`}
              onClick={() => {
                setProjectAspect(a);
                setRatioOpen(false);
              }}
            >
              {ASPECTS[a].label}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={renaming} title="專案名稱" onClose={() => setRenaming(false)}>
        <input
          className="text-input"
          aria-label="專案名稱輸入"
          value={nameDraft}
          maxLength={40}
          onChange={(e) => setNameDraft(e.target.value)}
          autoFocus
        />
        <button
          className="menu-item"
          onClick={async () => {
            const p = useProjectStore.getState().project;
            if (!p) return;
            setRenaming(false);
            try {
              const cover = await coverFromProject(p, useUI.getState().player?.time ?? 0);
              useProjectStore.getState().apply((d) => {
                d.cover = cover;
              });
              toast('已用目前預覽畫面當封面');
            } catch {
              toast('抓不到預覽畫面');
            }
          }}
        >
          用目前預覽畫面當封面
        </button>
        <div className="sheet-row">
          <button className="btn" onClick={() => setRenaming(false)}>
            取消
          </button>
          <button
            className="btn primary"
            onClick={() => {
              const n = nameDraft.trim();
              if (n)
                useProjectStore.getState().apply((d) => {
                  d.name = n;
                });
              setRenaming(false);
            }}
          >
            確定
          </button>
        </div>
      </Sheet>
    </main>
  );
}
