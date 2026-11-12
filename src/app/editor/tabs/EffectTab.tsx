import { isVideoItem } from '../../../engine/timeline';
import {
  DEFAULT_TRANSITION_DURATION,
  TRANSITIONS,
  TRANSITION_DURATIONS,
  transitionSpan,
} from '../../../engine/transitions';
import { setTransition, setTransitionAll } from '../../../store/actions';
import { useProjectStore } from '../../../store/projectStore';
import { toast } from '../../../store/uiStore';
import type { Found } from './shared';

/** 特效分頁：目前先放「轉場」——選一個片段，設定它跟前面緊接的片段之間的效果 */
export function EffectTab({ found }: { found: Found }) {
  useProjectStore((s) => s.project); // 專案變了要重畫
  const item = found && isVideoItem(found.item) && !found.item.group ? found.item : null;
  const track = item ? found!.track : null;
  const cur = item?.transitionIn;
  const hasPrev = !!(
    item &&
    track &&
    transitionSpan(track.items, { ...item, transitionIn: { kind: 'fade', duration: 1 } })
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
          <div className="chips" role="radiogroup" aria-label="轉場效果">
            <button
              role="radio"
              aria-checked={!cur}
              aria-label="轉場 無"
              className={`chip${!cur ? ' active' : ''}`}
              onClick={() => setTransition(item.id, null)}
            >
              無
            </button>
            {TRANSITIONS.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={cur?.kind === t.id}
                aria-label={`轉場 ${t.name}`}
                className={`chip${cur?.kind === t.id ? ' active' : ''}`}
                onClick={() => setTransition(item.id, t.id)}
              >
                <b className="tcode">{t.code}</b> {t.name}
              </button>
            ))}
          </div>
          {cur && (
            <>
              <div className="panel-head">
                <span>長度</span>
              </div>
              <div className="chips" role="radiogroup" aria-label="轉場長度">
                {TRANSITION_DURATIONS.map((d) => (
                  <button
                    key={d}
                    role="radio"
                    aria-checked={Math.abs(cur.duration - d) < 0.01}
                    aria-label={`轉場長度 ${d} 秒`}
                    className={`chip${Math.abs(cur.duration - d) < 0.01 ? ' active' : ''}`}
                    onClick={() => setTransition(item.id, cur.kind, d, { coalesce: `tr:${item.id}` })}
                  >
                    {d} 秒
                  </button>
                ))}
              </div>
              <button
                className="btn"
                onClick={() => {
                  const n = setTransitionAll(track.id, cur.kind, cur.duration ?? DEFAULT_TRANSITION_DURATION);
                  toast(`已套用到這一軌的 ${n} 個銜接處`);
                }}
              >
                套用到這一軌全部銜接處
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
