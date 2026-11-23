import { ArrowLeft, Move, Shapes, Smile, Type as TypeIcon, X, ImagePlus, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { findItem } from '../../engine/timeline';
import { addText } from '../../store/actions';
import { cancelCrop } from '../../store/cropStore';
import { useProjectStore } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { GradePeekButton } from './GradePeekButton';
import { KeyframeButton } from './KeyframeButton';
import { AssetsTab } from './tabs/AssetsTab';
import { AudioTab } from './tabs/AudioTab';
import { EditTab } from './tabs/EditTab';
import { LayersTab } from './tabs/LayersTab';
import { LayoutTab } from './tabs/LayoutTab';
import { EffectTab } from './tabs/EffectTab';
import {
  CATS,
  SINGLE_TOOL,
  TOOL_TITLE,
  ToolButton,
  targetOfTab,
  type CatId,
  type Panel,
  type ToolId,
} from './tabs/shared';
import { ColorTab } from './tabs/ColorTab';
import { TextTab } from './tabs/TextTab';

import type { Tab } from './tabs/shared';
export type { Tab };

type Sel = 'text' | 'audio' | 'media';

/**
 * 選了東西，功能列自動跳到那個東西的工具：字卡→文字（升起文字視窗）、音樂→音訊；
 * 影片／照片從文字、音訊或第一層選到時→剪輯。其他類別（加入、版型、特效）保持原樣：
 * 在那裡加東西時會自動選取新的，不應該被帶走；色調類別選別的影像（非音樂）也留著。
 */
export function targetForSelection(
  cat: CatId | null,
  kind: Sel,
): { cat: CatId; tool: ToolId | null } | null {
  if (cat === 'color' && kind !== 'audio') return null;
  if (kind === 'text') return { cat: 'text', tool: 'textedit' };
  if (kind === 'audio') return { cat: 'audio', tool: 'audio' };
  if (cat === null || cat === 'text' || cat === 'audio') return { cat: 'edit', tool: null };
  return null;
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
  const player = useUI((s) => s.player);
  // 第一層：選了哪個類別（null＝只看到 7 個類別）；第三層：升起的視窗（null＝收起，可以直接拖播放軸）
  const [cat, setCat] = useState<CatId | null>(null);
  const [tool, setTool] = useState<ToolId | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const found = findItem(project, selectedId);
  const barRef = useRef<HTMLDivElement>(null);

  const catRef = useRef(cat);
  useEffect(() => {
    catRef.current = cat;
  }, [cat]);
  const goto = (c: CatId | null, t: ToolId | null) => {
    catRef.current = c;
    setCat(c);
    setTool(t);
    setPanel(null);
    cancelCrop();
  };

  // 選取的東西換了：自動跳到對應的類別／工具。
  // 晚一點才跳：手指放開後瀏覽器還會補送一個 click；如果馬上換版面，那個 click 會落在別的按鈕上
  useEffect(() => {
    if (!selectedId) {
      // 取消選取：文字視窗沒東西可改了就收起來
      const close = setTimeout(() => setTool((t) => (t === 'textedit' ? null : t)), 0);
      return () => clearTimeout(close);
    }
    const catAtSelect = catRef.current;
    const timer = setTimeout(() => {
      if (catRef.current !== catAtSelect) return; // 這段時間使用者自己切了：不要再把人帶走
      const st = useProjectStore.getState();
      const f = st.project && findItem(st.project, st.selectedId);
      if (!f || st.selectedId !== selectedId) return;
      const kind: Sel = f.item.type === 'text' ? 'text' : f.item.type === 'audio' ? 'audio' : 'media';
      const to = targetForSelection(catRef.current, kind);
      if (!to) return;
      if (to.cat === catRef.current && to.tool === null) return;
      goto(to.cat, to.tool);
    }, 250);
    return () => clearTimeout(timer);
  }, [selectedId]);

  // 其他地方要求切分頁（點時間軸的轉場小圓圈 → 特效；色調 → 色調視窗…）
  const requestTab = useUI((s) => s.requestTab);
  useEffect(() => {
    if (!requestTab) return;
    useUI.setState({ requestTab: null });
    const to = targetOfTab(requestTab as Tab);
    setTimeout(() => goto(to.cat, to.tool), 250);
  }, [requestTab]);

  // 剪輯工具列開關變速、音量、片段範圍（panel）：升起／收起「片段設定」視窗
  const setClipPanel = (p: Panel) => {
    setPanel(p);
    setTool((t) => (p ? 'clip' : t === 'clip' ? null : t));
  };

  // 點第一層的類別：剪輯、加入、文字＝換成它的工具列（第二層）；其餘只有一個工具＝直接升起視窗，再點一次收起
  const pickCat = (c: CatId) => {
    const only = SINGLE_TOOL[c];
    if (only) {
      if (cat === c) {
        setTool((t) => (t ? null : only));
        setPanel(null);
        return;
      }
      goto(c, only);
      return;
    }
    goto(c, null);
  };

  // 目前選中的類別捲進畫面（窄螢幕第一層可以左右滑）
  useEffect(() => {
    barRef.current
      ?.querySelector<HTMLElement>('.tab.active')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [cat]);

  const row2 = cat !== null && !SINGLE_TOOL[cat];
  const closePopup = () => {
    setTool(null);
    setPanel(null);
    cancelCrop();
  };
  const addAt = () => player?.time ?? 0;

  const edit = (part: 'row' | 'panel', extra?: React.ReactNode) => (
    <EditTab
      panel={panel}
      setPanel={setClipPanel}
      onImport={onImportMain}
      found={found}
      part={part}
      extra={extra}
    />
  );

  return (
    <div className="bottombar" ref={barRef}>
      {tool && (
        <div
          className="panel-sheet"
          data-testid="panel-sheet"
          role="region"
          aria-label={`${TOOL_TITLE[tool]}面板`}
        >
          <div className="ps-head">
            <b>{TOOL_TITLE[tool]}</b>
            {tool === 'color' && <GradePeekButton />}
            <button className="sheet-close" aria-label="收起面板" data-testid="panel-close" onClick={closePopup}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="ps-body">
            {tool === 'clip' && edit('panel')}
            {tool === 'layers' && <LayersTab />}
            {tool === 'sticker' && <AssetsTab />}
            {tool === 'textedit' && <TextTab found={found} />}
            {tool === 'layout' && <LayoutTab found={found} />}
            {tool === 'effect' && <EffectTab found={found} />}
            {tool === 'color' && <ColorTab found={found} />}
            {tool === 'audio' && <AudioTab found={found} panel={panel} setPanel={setPanel} />}
          </div>
        </div>
      )}
      {row2 ? (
        <div className="fb-row" data-testid="fb-tools">
          <button className="fb-back" aria-label="返回" data-testid="fb-back" onClick={() => goto(null, null)}>
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          {cat === 'edit' &&
            edit(
              'row',
              <>
                <ToolButton
                  icon={Move}
                  label="位置大小"
                  active={tool === 'layers'}
                  onClick={() => setTool((t) => (t === 'layers' ? null : 'layers'))}
                />
                <KeyframeButton />
              </>,
            )}
          {cat === 'add' && (
            <div className="toolbar" role="toolbar" aria-label="加入">
              <ToolButton icon={ImagePlus} label="影片照片" onClick={onImportOverlay} />
              <ToolButton
                icon={Smile}
                label="貼圖"
                active={tool === 'sticker'}
                onClick={() => setTool((t) => (t === 'sticker' ? null : 'sticker'))}
              />
            </div>
          )}
          {cat === 'text' && (
            <div className="toolbar" role="toolbar" aria-label="文字">
              <ToolButton icon={TypeIcon} label="新增文字" onClick={() => addText(addAt())} />
              <ToolButton icon={Shapes} label="新增圖形" onClick={() => addText(addAt(), true)} />
              <ToolButton
                icon={Pencil}
                label="編輯文字"
                active={tool === 'textedit'}
                onClick={() => setTool((t) => (t === 'textedit' ? null : 'textedit'))}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="tabs" role="tablist">
          {CATS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={cat === c.id}
              aria-expanded={cat === c.id && !!tool}
              className={`tab${cat === c.id ? ' active' : ''}`}
              onClick={() => pickCat(c.id)}
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
