import { ArrowLeft, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { isFrameItem } from '../../engine/layoutTracks';
import { findItem } from '../../engine/timeline';
import { cancelCrop } from '../../store/cropStore';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { importMusicFiles } from './musicImport';
import { CATS, ToolButton, type CatId } from './tabs/shared';
import { TOOLS, toolById, type ToolDef, type ToolEnv } from './tools';

/** 背景音樂的檔案選擇器（隱藏的 input；〔背景音樂〕按鈕呼叫 pickMusicFile 打開它） */
let pickMusicFile: () => void = () => undefined;
function MusicInput() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    pickMusicFile = () => input.current?.click();
    return () => {
      pickMusicFile = () => undefined;
    };
  }, []);
  return (
    <input
      ref={input}
      type="file"
      accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.caf"
      multiple
      hidden
      data-testid="music-input"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        void importMusicFiles(files);
      }}
    />
  );
}

type Sel = 'text' | 'audio' | 'frame' | 'media';

/**
 * 選了東西，功能列自動跳到那個東西的類別（不自動升起視窗，免得蓋住時間軸）：
 * 字卡→文字、音樂→音訊、整個版型→版型、其他（影片、照片、貼圖、版型裡的一格）→剪輯。
 * 例外：正在特效、色調、加入時點別的素材，留在原類別（方便一個一個套用；加東西時會自動選取新的，不該被帶走）。
 */
export function targetForSelection(cat: CatId | null, kind: Sel): CatId | null {
  if (kind !== 'audio' && (cat === 'effect' || cat === 'color')) return null;
  if (cat === 'add' && kind !== 'text' && kind !== 'audio') return null;
  const to: CatId =
    kind === 'text' ? 'text' : kind === 'audio' ? 'audio' : kind === 'frame' ? 'layout' : 'edit';
  return to === cat ? null : to;
}

/** 別處（時間軸的特效圓圈、色調…）要求切到某個類別與視窗 */
function requestTarget(tab: string): { cat: CatId; popup: string | null } | null {
  switch (tab) {
    case 'edit':
      return { cat: 'edit', popup: null };
    case 'effect': {
      const f = useUI.getState().fxFocus;
      const popup =
        f?.role === 'out'
          ? 'fx.out'
          : f?.role === 'seam'
            ? 'fx.seam'
            : f?.role === 'whole'
              ? 'fx.whole'
              : f?.role === 'style'
                ? 'fx.textfx'
                : 'fx.in';
      return { cat: 'effect', popup };
    }
    case 'color':
      return { cat: 'color', popup: 'color.look' };
    default:
      return null;
  }
}

export function BottomBar({
  onImportMain,
  onImportOverlay,
}: {
  onImportMain: () => void;
  onImportOverlay: () => void;
}) {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  // 第一層：選了哪個類別（null＝只看到 7 個類別）；第三層：升起的視窗（工具 id；null＝收起，可以直接拖播放軸）
  const [cat, setCat] = useState<CatId | null>(null);
  const [popup, setPopup] = useState<string | null>(null);
  const found = findItem(project, selectedId);
  const barRef = useRef<HTMLDivElement>(null);

  const catRef = useRef(cat);
  useEffect(() => {
    catRef.current = cat;
  }, [cat]);
  const goto = (c: CatId | null, p: string | null = null) => {
    catRef.current = c;
    setCat(c);
    setPopup(p);
    cancelCrop();
  };

  const env: ToolEnv = {
    project,
    found,
    onImportMain,
    onImportOverlay,
    pickMusic: pickMusicFile,
    openPopup: (id) => setPopup(id),
    closePopup: () => {
      setPopup(null);
      cancelCrop();
    },
  };

  // 選取的東西換了：自動跳到對應的類別；開著的視窗對新選到的東西不適用就收起來。
  // 晚一點才處理：手指放開後瀏覽器還會補送一個 click；如果馬上換版面，那個 click 會落在別的按鈕上
  useEffect(() => {
    const catAtSelect = catRef.current;
    const timer = setTimeout(() => {
      const st = useProjectStore.getState();
      const f = st.project && findItem(st.project, st.selectedId);
      if (!f || st.selectedId !== selectedId) {
        // 取消選取：視窗要選到東西才有內容的，收起來
        setPopup((p) => (p && toolById(p)?.enabled ? null : p));
        return;
      }
      if (catRef.current !== catAtSelect) return; // 這段時間使用者自己切了：不要再把人帶走
      const kind: Sel =
        f.item.type === 'text'
          ? 'text'
          : f.item.type === 'audio'
            ? 'audio'
            : isFrameItem(f.item)
              ? 'frame'
              : 'media';
      const to = targetForSelection(catRef.current, kind);
      if (to) return goto(to);
      // 留在原類別：視窗那一項對新選到的東西不能用了就收起來
      const tool = popup ? toolById(popup) : undefined;
      const e2: ToolEnv = { ...env, project: st.project!, found: f };
      if (tool?.enabled && !tool.enabled(e2)) setPopup(null);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // 其他地方要求切類別（點時間軸的特效圓圈 → 特效；色調 → 色調視窗…）
  const requestTab = useUI((s) => s.requestTab);
  useEffect(() => {
    if (!requestTab) return;
    useUI.setState({ requestTab: null });
    const to = requestTarget(requestTab);
    if (to) setTimeout(() => goto(to.cat, to.popup), 250);
  }, [requestTab]);

  const press = (t: ToolDef) => {
    if (t.enabled && !t.enabled(env)) return toast(t.need ?? '先點一個片段');
    const g = t.guard?.(env);
    if (g) return toast(g);
    if (t.kind === 'popup') {
      cancelCrop();
      setPopup((p) => (p === t.id ? null : t.id));
      return;
    }
    setPopup(null);
    t.run?.(env);
  };

  // 目前選中的類別捲進畫面（窄螢幕第一層可以左右滑）
  useEffect(() => {
    barRef.current
      ?.querySelector<HTMLElement>('.tab.active')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [cat]);

  const tool = popup ? toolById(popup) : undefined;
  const list = cat ? TOOLS[cat] : [];
  const catLabel = CATS.find((c) => c.id === cat)?.label ?? '';
  const body = tool?.popup?.(env);

  return (
    <div className="bottombar" ref={barRef}>
      <MusicInput />
      {tool && body && tool.bare && body}
      {tool && body && !tool.bare && (
        <div className="panel-sheet" data-testid="panel-sheet" role="region" aria-label={`${tool.label}面板`}>
          <div className="ps-head">
            <b>{tool.label}</b>
            <button
              className="sheet-close"
              aria-label="收起面板"
              data-testid="panel-close"
              onClick={env.closePopup}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="ps-body">{body}</div>
        </div>
      )}
      {cat ? (
        <div className="fb-row" data-testid="fb-tools">
          <button
            className="fb-back"
            aria-label="返回"
            data-testid="fb-back"
            onClick={() => goto(null, null)}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className="toolbar" role="toolbar" aria-label={catLabel}>
            {list.map((t, i) => {
              const sep = i > 0 && list[i - 1]!.zone !== t.zone;
              const dim = !!t.enabled && !t.enabled(env);
              return (
                <Fragment key={t.id}>
                  {sep && <span className="zone-sep tool-sep" aria-hidden="true" />}
                  {t.custom ? (
                    t.custom()
                  ) : (
                    <ToolButton
                      icon={t.icon}
                      label={t.label}
                      testId={`tool-${t.id}`}
                      active={t.kind === 'popup' ? popup === t.id : undefined}
                      fill={t.kind === 'toggle' ? !!t.on?.(env) : undefined}
                      dim={dim}
                      danger={t.danger}
                      badge={dim ? null : t.badge?.(env)}
                      onClick={() => press(t)}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="tabs" role="tablist">
          {CATS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={false}
              className="tab"
              onClick={() => goto(c.id, null)}
            >
              <c.icon size={20} aria-hidden="true" />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
