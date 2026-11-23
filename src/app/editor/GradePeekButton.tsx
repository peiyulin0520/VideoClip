import { Eye, EyeOff } from 'lucide-react';
import { useEffect } from 'react';
import { itemHasGrade } from '../../engine/grade';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';

/**
 * 色調視窗標題列的「看原色」：按一下看原色（整個專案暫時不套調色）、再按一下回到色調。
 * 不改專案資料、不進復原紀錄；離開編輯器自動關掉。專案裡沒有任何調色時按鈕變淡。
 */
export function GradePeekButton() {
  const project = useProjectStore((s) => s.project);
  const player = useUI((s) => s.player);
  const peek = useUI((s) => s.gradePeek);
  const any = !!project?.tracks.some((tr) => tr.items.some((it) => it.type !== 'audio' && itemHasGrade(it)));
  const on = peek && any;
  useEffect(() => {
    player?.setGradeBypass(on ? 'all' : null);
  }, [player, on]);
  useEffect(() => {
    if (peek && !any) useUI.setState({ gradePeek: false });
  }, [peek, any]);
  useEffect(() => () => useUI.setState({ gradePeek: false }), []);
  return (
    <button
      className={`ps-peek${on ? ' on' : ''}`}
      aria-label={on ? '回到套用色調的畫面' : '看原色（不套色調）'}
      aria-pressed={on}
      data-testid="grade-peek"
      onClick={() => {
        if (!any) return toast('這個專案還沒有調色調');
        useUI.setState({ gradePeek: !peek });
      }}
    >
      {on ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      <span>{on ? '原色' : '看原色'}</span>
    </button>
  );
}
