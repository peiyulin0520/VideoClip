import { ChevronLeft, Pause, Play, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ensureUrls, releaseProjectUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import { addOverlayClips } from '../../store/actions';
import { mainItems, relayout, totalDuration, formatTime } from '../../engine/timeline';
import { getProject } from '../../storage/projects';
import { startAutosave } from '../../store/autosave';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { ASPECTS, assignAspect, pickAspect } from '../../model/defaults';
import type { Aspect } from '../../model/types';
import { setProjectAspect } from '../../store/actions';
import { Sheet } from '../../ui/Sheet';
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
      const p = await getProject(projectId);
      if (cancelled) return;
      if (!p) return setStatus('missing');
      const missing = await ensureUrls(p.id, p.assets);
      if (cancelled) return;
      useProjectStore.getState().load(p);
      autosave = startAutosave();
      setStatus('ready');
      if (missing.length) toast(`找不到素材檔：${missing.join('、')}`);
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

function EditorBody() {
  const project = useProjectStore((s) => s.project)!;
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const player = useUI((s) => s.player);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pps, setPps] = useState(60);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const total = totalDuration(project);

  useEffect(() => {
    if (!player) return;
    return player.subscribe((t, p) => {
      setTime(t);
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
      const res = await importFiles(pid, files, (d, n) => setBusy(`匯入中… ${d}/${n}`));
      if (res.assets.length) {
        await ensureUrls(pid, res.assets);
        const player = useUI.getState().player;
        if (importMode.current === 'overlay') {
          // 疊加：放在播放頭這一秒，同一秒疊多個就各佔一條軌道
          useProjectStore.getState().apply((d) => void d.assets.push(...res.assets));
          addOverlayClips(res.assets, player?.time ?? 0);
        } else {
          const startOfNew = totalDuration(useProjectStore.getState().project!);
          // 匯入主軌素材後不自動選取（主軌是滿版的，選取框會像「要手動縮小」的框）
          useProjectStore.getState().apply((d) => {
            d.assets.push(...res.assets);
            const tr = d.tracks.find((t) => t.kind === 'main')!;
            // 比例設成「自動」、而且主軌還是空的：第一次匯入時照第一個素材的形狀決定專案比例
            const first = res.assets[0];
            if (d.aspectAuto && tr.items.length === 0 && first)
              assignAspect(d, pickAspect(first.width, first.height), true);
            tr.items = relayout([...(tr.items as typeof res.clips), ...res.clips]);
          });
          player?.seek(startOfNew);
        }
      }
      if (res.failed.length)
        toast(`無法匯入：${res.failed.map((f) => `${f.name}（${f.reason}）`).join('、')}`);
      else if (res.assets.length) toast(`已匯入 ${res.assets.length} 個素材`);
    } finally {
      setBusy(null);
    }
  }, []);

  const empty = mainItems(project).length === 0;

  return (
    <main className="editor">
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
      </header>

      <Preview projectId={project.id} width={project.width} height={project.height} />
      {empty && (
        <button className="empty-import" onClick={() => pick('main')}>
          ＋ 匯入影片或照片
        </button>
      )}

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
        <span className="time" data-testid="time">
          {formatTime(time)} / {formatTime(total)}
        </span>
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
