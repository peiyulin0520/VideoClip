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
import { TextTab } from './tabs/TextTab';

export type { Tab } from './tabs/shared';

/**
 * 選了東西自動切到對應的分頁：字卡→文字、音樂→音訊；影片／照片從文字或音訊分頁選到時→剪輯。
 * 其他分頁（疊加、素材、版型、圖層）保持原樣：在那裡加東西時會自動選取新的，不應該被帶走。
 */
export function tabForSelection(current: Tab, kind: 'text' | 'audio' | 'media'): Tab {
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
  const [collapsed, setCollapsed] = useState(false);

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
      setPanel(null);
      setCollapsed(false);
      cancelCrop();
    }, 250);
  }, [requestTab]);

  // 點目前的分頁＝收合/展開下面的面板（讓出空間給預覽畫面）
  const switchTab = (t: Tab) => {
    setPanel(null);
    cancelCrop(); // 離開剪輯分頁就結束裁切模式（不套用）
    if (t === tab) setCollapsed((c) => !c);
    else {
      setTab(t);
      setCollapsed(false);
    }
    // 分頁列黏在頂端時（已經往下捲過），切分頁後停在分頁列的位置，不要停在新面板的一半
    const el = barRef.current;
    if (el) {
      const stickTop = parseFloat(getComputedStyle(el).getPropertyValue('--top-h')) || 52;
      if (el.getBoundingClientRect().top <= stickTop + 1)
        requestAnimationFrame(() => window.scrollTo({ top: el.offsetTop - stickTop }));
    }
  };

  // 分頁列放不下（窄螢幕）可以左右滑；選中的分頁自動捲進畫面
  useEffect(() => {
    barRef.current
      ?.querySelector<HTMLElement>('.tab.active')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [tab]);

  return (
    <div className="bottombar" ref={barRef}>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-expanded={tab === t.id ? !collapsed : undefined}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => switchTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'edit' && <EditTab panel={panel} setPanel={setPanel} onImport={onImportMain} found={found} />}
      {!collapsed && tab === 'overlay' && <OverlayTab onImportOverlay={onImportOverlay} />}
      {!collapsed && tab === 'text' && <TextTab found={found} />}
      {!collapsed && tab === 'layers' && <LayersTab />}
      {!collapsed && tab === 'layout' && <LayoutTab found={found} />}
      {!collapsed && tab === 'effect' && <EffectTab found={found} />}
      {!collapsed && tab === 'assets' && <AssetsTab />}
      {!collapsed && tab === 'audio' && <AudioTab found={found} panel={panel} setPanel={setPanel} />}
    </div>
  );
}
