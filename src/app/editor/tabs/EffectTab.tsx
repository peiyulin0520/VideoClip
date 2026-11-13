import { useState } from 'react';
import { isVideoItem } from '../../../engine/timeline';
import {
  DEFAULT_TRANSITION_DURATION,
  MAX_TRANSITION,
  MIN_TRANSITION,
  TRANSITION_CATS,
  TRANSITIONS,
  transitionSpan,
  type TransitionCat,
} from '../../../engine/transitions';
import { setTransition, setTransitionAll } from '../../../store/actions';
import { useProjectStore } from '../../../store/projectStore';
import { toast } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';
import { TransitionCard } from '../TransitionCards';
import type { Found } from './shared';

/** 特效分頁：目前先放「轉場」——選一個片段（或點時間軸上兩個片段中間的圓圈），挑跟前面緊接的片段之間的效果 */
export function EffectTab({ found }: { found: Found }) {
  useProjectStore((s) => s.project); // 專案變了要重畫
  const [cat, setCat] = useState<TransitionCat>('基本');
  const item = found && isVideoItem(found.item) && !found.item.group ? found.item : null;
  const track = item ? found!.track : null;
  const cur = item?.transitionIn;
  const hasPrev = !!(
    item &&
    track &&
    transitionSpan(track.items, { ...item, transitionIn: { kind: 'dissolve', duration: 1 } })
  );

  return (
    <div className="panel effect-panel" data-testid="effect-panel">
      <div className="panel-head">
        <span>轉場（接在前一個片段後面）</span>
      </div>
      {!item || !track ? (
        <p className="hint">先在時間軸點一個片段，或點兩個片段中間的小圓圈，再選轉場效果。</p>
      ) : !hasPrev ? (
        <p className="hint">
          這個片段前面沒有緊接的片段，所以沒有轉場。把兩個片段排在一起（中間不留空位）就可以加。
        </p>
      ) : (
        <>
          <div className="chips cat-chips" role="tablist" aria-label="轉場分類">
            {TRANSITION_CATS.map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={cat === c}
                className={`chip3${cat === c ? ' on' : ''}`}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="tr-grid" role="radiogroup" aria-label="轉場效果" data-testid="tr-grid">
            <TransitionCard
              kind={null}
              label="無"
              active={!cur}
              onPick={() => setTransition(item.id, null)}
            />
            {TRANSITIONS.filter((t) => t.cat === cat).map((t) => (
              <TransitionCard
                key={t.id}
                kind={t.id}
                label={t.name}
                active={cur?.kind === t.id}
                onPick={() => setTransition(item.id, t.id)}
              />
            ))}
          </div>
          {cur && (
            <>
              <Slider
                label="轉場長度"
                value={Math.round(cur.duration * 10)}
                min={Math.round(MIN_TRANSITION * 10)}
                max={Math.round(MAX_TRANSITION * 10)}
                step={1}
                format={(v) => `${(v / 10).toFixed(1)} 秒`}
                onChange={(v) => setTransition(item.id, cur.kind, v / 10, { coalesce: `tr:${item.id}` })}
              />
              <button
                className="btn"
                onClick={() => {
                  const n = setTransitionAll(track.id, cur.kind, cur.duration ?? DEFAULT_TRANSITION_DURATION);
                  toast(`已套用到這一軌的 ${n} 個銜接處`);
                }}
              >
                全部套用（這一軌所有銜接處）
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
