import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { findItem } from '../../engine/timeline';
import { cancelCrop } from '../../store/cropStore';
import { useProjectStore } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { AssetsTab } from './tabs/AssetsTab';
import { AudioTab } from './tabs/AudioTab';
import { EditTab } from './tabs/EditTab';
import { LayersTab } from './tabs/LayersTab';
import { LayoutTab } from './tabs/LayoutTab';
import { EffectTab } from './tabs/EffectTab';
import { OverlayTab } from './tabs/OverlayTab';
import { TABS, type Panel, type Tab } from './tabs/shared';
import { ColorTab } from './tabs/ColorTab';
import { TextTab } from './tabs/TextTab';

export type { Tab } from './tabs/shared';

/**
 * 選了東西自動切到對應的分頁：字卡→文字、音樂→音訊；影片／照片從文字或音訊分頁選到時→剪輯。
 * 其他分頁（疊加、素材、版型、圖層）保持原樣：在那裡加東西時會自動選取新的，不應該被帶走。
 */
export function tabForSelection(current: Tab, kind: 'text' | 'audio' | 'media'): Tab {
  // 色調分頁：選別的影片、照片、貼圖、字卡都留在色調分頁（音樂沒有色調，才切走）
  if (current === 'color' && kind !== 'audio') return current;
  if (kind === 'text') return 'text';
  if (kind === 'audio') return 'audio';
  return current === 'text' || current === 'audio' ? 'edit' : current;
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
  const [tab, setTab] = useState<Tab>('edit');
  const [panel, setPanel] = useState<Panel>(null);
  // 面板（各分頁的內容）平常收起來，點分頁才從下面升起；關掉後就能直接拖播放軸看效果
  const [open, setOpen] = useState(false);

  const found = findItem(project, selectedId);
  const barRef = useRef<HTMLDivElement>(null);

  // 選取的東西換了：自動切到對應的分頁。
  // 晚一點才切：手指放開後瀏覽器還會補送一個 click；如果馬上換分頁、版面跟著變，那個 click 會落在別的按鈕上
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);
  useEffect(() => {
    if (!selectedId) return;
    const tabAtSelect = tabRef.current;
    const timer = setTimeout(() => {
      if (tabRef.current !== tabAtSelect) return; // 這段時間使用者自己切了分頁：不要再把人帶走
      const st = useProjectStore.getState();
      const f = st.project && findItem(st.project, st.selectedId);
      if (!f || st.selectedId !== selectedId) return;
      const kind = f.item.type === 'text' ? 'text' : f.item.type === 'audio' ? 'audio' : 'media';
      const next = tabForSelection(tabRef.current, kind);
      if (next === tabRef.current) return;
      tabRef.current = next;
      setTab(next);
      setPanel(null);
      cancelCrop();
    }, 250);
    return () => clearTimeout(timer);
  }, [selectedId]);

  // 其他地方要求切分頁（點時間軸的轉場小圓圈 → 特效）
  const requestTab = useUI((s) => s.requestTab);
  useEffect(() => {
    if (!requestTab) return;
    const want = TABS.find((x) => x.id === requestTab)?.id;
    useUI.setState({ requestTab: null });
    if (!want) return;
    setTimeout(() => {
      tabRef.current = want;
      setTab(want);
      setOpen(true);
      setPanel(null);
      cancelCrop();
    }, 250);
  }, [requestTab]);

  // 點分頁：升起那一頁的面板；再點同一個分頁＝收起來
  const switchTab = (t: Tab) => {
    setPanel(null);
    cancelCrop(); // 離開剪輯分頁就結束裁切模式（不套用）
    if (t === tab) setOpen((o) => !o);
    else {
      setTab(t);
      setOpen(true);
    }
  };

  // 分頁列放不下（窄螢幕）可以左右滑；選中的分頁自動捲進畫面
  useEffect(() => {
    barRef.current
      ?.querySelector<HTMLElement>('.tab.active')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [tab]);

  const label = TABS.find((x) => x.id === tab)?.label ?? '';
  return (
    <div className="bottombar" ref={barRef}>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-expanded={tab === t.id && open}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {open && (
        <div className="panel-sheet" data-testid="panel-sheet" role="region" aria-label={`${label}面板`}>
          <div className="ps-head">
            <b>{label}</b>
            <button
              className="sheet-close"
              aria-label="收起面板"
              data-testid="panel-close"
              onClick={() => setOpen(false)}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="ps-body">
            {tab === 'edit' && (
              <EditTab panel={panel} setPanel={setPanel} onImport={onImportMain} found={found} />
            )}
            {tab === 'overlay' && <OverlayTab onImportOverlay={onImportOverlay} />}
            {tab === 'text' && <TextTab found={found} />}
            {tab === 'layers' && <LayersTab />}
            {tab === 'layout' && <LayoutTab found={found} />}
            {tab === 'effect' && <EffectTab found={found} />}
            {tab === 'color' && <ColorTab found={found} />}
            {tab === 'assets' && <AssetsTab />}
            {tab === 'audio' && <AudioTab found={found} panel={panel} setPanel={setPanel} />}
          </div>
        </div>
      )}
    </div>
  );
}
