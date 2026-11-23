import { ChevronLeft, Pause, Play, Redo2, Share, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { countEditorRender } from '../../engine/debug';
import { ensureUrls, findMissing, releaseProjectUrls } from '../../engine/assetUrls';
import { importFiles } from '../../engine/importMedia';
import { enqueueProxies } from '../../engine/proxyQueue';
import { addOverlayClips, importToBase } from '../../store/actions';
import { coverFromProject } from '../../engine/cover';
import { formatTime, totalDuration } from '../../engine/timeline';
import { getProjectMigrated, saveProject } from '../../storage/projects';
import { startAutosave } from '../../store/autosave';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { ASPECTS, ratioText } from '../../model/defaults';
import { frameFractions } from '../../engine/stage';
import { shortVersion } from '../pwa';
import { QUALITY_LABELS } from '../../engine/previewQuality';
import { useQuality } from '../../store/qualityStore';
import type { Aspect } from '../../model/types';
import { setProjectAspect } from '../../store/actions';
import { Sheet } from '../../ui/Sheet';
import { CropEditor } from '../editor/CropEditor';
import { ExportSheet } from '../editor/ExportSheet';
import { PlaybarButton } from '../editor/PlaybarButton';
import { Preview } from '../editor/Preview';
import { ProgressBar } from '../editor/ProgressBar';
import { Timeline } from '../editor/Timeline';
import { BottomBar } from '../editor/Toolbar';

export function Editor() {
  const { projectId = '' } = useParams();
  // key：換專案時整個重新載入
  return <EditorLoader key={projectId} projectId={projectId} />;
}

function EditorLoader({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready'>('loading');

  // 每次點進專案都從最上面開始看（首頁捲到哪、上次離開時捲到哪，都不帶進來）
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [projectId]);
  useEffect(() => {
    if (status !== 'ready') return;
    const raf = requestAnimationFrame(() => window.scrollTo(0, 0));
    return () => cancelAnimationFrame(raf);
  }, [status]);

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
      const gone = await findMissing(p.id, p.assets);
      if (cancelled) return;
      // 找不到檔案的素材：專案裡沒有任何物件在用的，直接從素材清單拿掉、不用通知；有在用的才提醒（片段上會標「素材遺失」）
      const used = new Set(
        p.tracks.flatMap((t) => t.items.flatMap((it) => (it.type !== 'text' ? [it.assetId] : []))),
      );
      const unused = new Set(gone.filter((a) => !used.has(a.id)).map((a) => a.id));
      if (unused.size) {
        p.assets = p.assets.filter((a) => !unused.has(a.id));
        await saveProject(p);
      }
      const missing = gone.filter((a) => used.has(a.id)).map((a) => a.name);
      useProjectStore.getState().load(p);
      autosave = startAutosave();
      enqueueProxies(p.id, p.assets); // 舊專案的大影片：背景補做預覽用輕量影片
      setStatus('ready');
      if (migrated.reordered) toast('為了讓字卡永遠在影像上面，這個專案的圖層順序已經調整過', 9000);
      if (missing.length)
        toast(
          `有 ${missing.length} 個素材找不到檔案：${missing.join('、')}（用到它的片段標了「素材遺失」，請重新匯入）`,
          8000,
        );
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
  useEffect(() => {
    useUI.setState({ timelinePps: pps });
  }, [pps]);
  const [playing, setPlaying] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);
  const [ratioDraft, setRatioDraft] = useState<'auto' | Aspect | 'custom'>('auto');
  const [coverDraft, setCoverDraft] = useState(false);
  const [ratioFill, setRatioFill] = useState(false); // false＝保持原樣；true＝影片填滿新畫面
  const quality = useQuality((s) => s.q);
  const setQuality = useQuality((s) => s.set);
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
    <main
      className={`editor${previewFull ? ' preview-full' : ''}`}
      style={{ ['--proj-aspect' as string]: String(project.width / project.height) }}
    >
      <header className="ed-top">
        <div className="btn-zone grow" data-testid="zone-nav">
          <Link className="icon-btn" to="/" aria-label="回首頁">
            <ChevronLeft />
          </Link>
          <button
            className="name-btn"
            aria-label="專案名稱"
            onClick={() => {
              setNameDraft(project.name);
              setCoverDraft(false);
              setRenaming(true);
            }}
          >
            {project.name}
            <span className="proj-ver" data-testid="proj-ver">
              {shortVersion()}
            </span>
          </button>
        </div>
        <span className="zone-sep" aria-hidden="true" />
        <div className="btn-zone" data-testid="zone-view">
          <button
            className="ratio-btn"
            aria-label="畫面比例"
            onClick={() => {
              setRatioDraft(project.aspectAuto ? 'auto' : project.aspect);
              setRatioFill(false);
              setRatioOpen(true);
            }}
          >
            {project.aspect === 'custom' ? ratioText(project.width, project.height) : project.aspect}
          </button>
          <button
            className="ratio-btn"
            aria-label={`預覽畫質 ${QUALITY_LABELS[quality]}（點一下切換）`}
            data-testid="quality-btn"
            onClick={() => setQuality(quality === 'smooth' ? 'clear' : 'smooth')}
          >
            {quality === 'clear' ? '高清' : quality === 'smooth' ? '順暢' : '自動'}
          </button>
        </div>
        <span className="zone-sep" aria-hidden="true" />
        <div className="btn-zone" data-testid="zone-export">
          <button
            className="icon-btn export-btn"
            aria-label="匯出影片"
            onClick={() => {
              useUI.getState().player?.pause();
              useUI.setState({ gradePeek: false });
              setExportOpen(true);
            }}
          >
            <Share size={22} />
          </button>
        </div>
      </header>

      <Preview
        projectId={project.id}
        width={project.width}
        height={project.height}
        emptyAction={empty ? () => pick('main') : undefined}
      />

      {previewFull && <ProgressBar total={total} />}

      <div className="playbar">
        <div className="btn-zone" data-testid="zone-play">
          <PlaybarButton
            icon={playing ? Pause : Play}
            ariaLabel={playing ? '暫停' : '播放'}
            fill
            onClick={() => {
              if (total <= 0) return toast('先匯入影片或照片');
              player?.toggle();
            }}
          />
          <TimeText total={total} />
        </div>
        <span className="spacer" />
        <span className="zone-sep" aria-hidden="true" />
        <div className="btn-zone" data-testid="zone-history">
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
        </div>
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
      <CropEditor />

      <Sheet open={ratioOpen} title="畫面比例" onClose={() => setRatioOpen(false)}>
        <p className="hint">
          預覽的底不會變，框內是影片輸出的範圍，框外（斜線）不會輸出。按「套用」才會改；按 ✕ 關閉就不改。
        </p>
        <div className="chips" role="radiogroup" aria-label="選擇畫面比例">
          <button
            role="radio"
            aria-checked={ratioDraft === 'auto'}
            className={`chip${ratioDraft === 'auto' ? ' active' : ''}`}
            onClick={() => setRatioDraft('auto')}
          >
            自動（跟第一支影片）
          </button>
          {(Object.keys(ASPECTS) as Aspect[]).map((a) => (
            <button
              key={a}
              role="radio"
              aria-checked={ratioDraft === a}
              className={`chip${ratioDraft === a ? ' active' : ''}`}
              onClick={() => setRatioDraft(a)}
            >
              {ASPECTS[a].label}
            </button>
          ))}
          <button
            role="radio"
            aria-checked={ratioDraft === 'custom'}
            className={`chip${ratioDraft === 'custom' ? ' active' : ''}`}
            data-testid="ratio-custom"
            onClick={() => setRatioDraft('custom')}
          >
            自訂
          </button>
        </div>
        {ratioDraft === 'custom' && <p className="hint">按「套用」後，在預覽上拖框的四邊或四角調整比例。</p>}
        <div className="slider-label">改了之後</div>
        <div className="chips" role="radiogroup" aria-label="改比例之後">
          <button
            role="radio"
            aria-checked={!ratioFill}
            className={`chip${!ratioFill ? ' active' : ''}`}
            data-testid="ratio-keep"
            onClick={() => setRatioFill(false)}
          >
            保持原樣
          </button>
          <button
            role="radio"
            aria-checked={ratioFill}
            className={`chip${ratioFill ? ' active' : ''}`}
            data-testid="ratio-fill"
            onClick={() => setRatioFill(true)}
          >
            影片填滿畫面
          </button>
        </div>
        <p className="hint">
          {ratioFill
            ? '位置、大小照新畫面的比例重新算，主要影片會填滿。'
            : '每個東西在預覽上的位置、大小不變，超出框的部分留在斜線區。'}
        </p>
        <div className="sheet-row">
          <button
            className="btn primary grow"
            data-testid="ratio-apply"
            onClick={() => {
              const now: 'auto' | Aspect | 'custom' = project.aspectAuto ? 'auto' : project.aspect;
              if (ratioDraft === 'custom') {
                // 自訂：關掉視窗，在預覽上拖版面的邊（那邊也有「套用」和 ✕）
                const f = frameFractions(project.width, project.height);
                useUI.getState().player?.pause();
                useUI.setState({ frameEdit: { fx: f.fx, fy: f.fy, fill: ratioFill } });
                setRatioOpen(false);
              } else if (ratioDraft !== now) {
                const a = setProjectAspect(ratioDraft, ratioFill ? 'fill' : 'keep');
                if (ratioDraft === 'auto' && a) toast(`已設成自動（目前是 ${a}）`);
                else toast('已套用');
              }
            }}
          >
            套用
          </button>
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
          role="switch"
          aria-checked={coverDraft}
          className={`chip${coverDraft ? ' active' : ''}`}
          data-testid="cover-now"
          onClick={() => setCoverDraft((v) => !v)}
        >
          用目前預覽畫面當封面
        </button>
        <div className="sheet-row">
          <button
            className="btn primary"
            onClick={async () => {
              const n = nameDraft.trim();
              if (n)
                useProjectStore.getState().apply((d) => {
                  d.name = n;
                });
              const withCover = coverDraft;
              setCoverDraft(false);
              if (!withCover) return toast('已儲存');
              const p = useProjectStore.getState().project;
              if (!p) return;
              try {
                const cover = await coverFromProject(p, useUI.getState().player?.time ?? 0);
                useProjectStore.getState().apply((d) => {
                  d.cover = cover;
                });
                toast('已儲存，並用目前預覽畫面當封面');
              } catch {
                toast('已儲存名稱，但抓不到預覽畫面當封面');
              }
            }}
          >
            儲存
          </button>
        </div>
      </Sheet>
    </main>
  );
}
