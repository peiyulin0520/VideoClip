import { useState } from 'react';
import {
  DEFAULT_TRANSITION_DURATION,
  MAX_TRANSITION,
  MIN_EFFECT,
  MIN_TRANSITION,
  TRANSITION_CATS,
  TRANSITIONS,
  transitionName,
  transitionSpan,
  TYPEWRITER_CODE,
  type TransitionCat,
} from '../../../engine/transitions';
import type { EffectKind, Item, VideoItem } from '../../../model/types';
import { editItem, setItemEffect, setTransition, setTransitionAll } from '../../../store/actions';
import { useProjectStore } from '../../../store/projectStore';
import { toast, useUI } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';
import { TransitionCard } from '../TransitionCards';
import type { Found } from './shared';

type Part = 'in' | 'out' | 'seam';
type CatKey = TransitionCat | '文字';

/** 特效分頁：依選到的素材類別，列出這一類能用的特效——進場、出場（只在素材自己的開頭／結尾）、跟前一段的轉場 */
export function EffectTab({ found }: { found: Found }) {
  useProjectStore((s) => s.project); // 專案變了要重畫
  const fxFocus = useUI((s) => s.fxFocus);
  const [cat, setCat] = useState<CatKey>('基本');
  const item: Item | null = found && !('group' in found.item && found.item.group) ? found.item : null;
  const track = item ? found!.track : null;
  const part: Part = item && fxFocus?.id === item.id ? fxFocus.role : 'in';
  const setPart = (role: Part) => item && useUI.setState({ fxFocus: { id: item.id, role } });

  return (
    <div className="panel effect-panel" data-testid="effect-panel">
      <div className="fx-legend" aria-hidden="true">
        <span className="lg seam">雙影片銜接</span>
        <span className="lg single">單影片進出場</span>
      </div>
      {!item || !track ? (
        <p className="hint">
          先在時間軸點一個素材，或點兩個素材中間的小圓圈，再選特效。版型整體的特效請到「版型」分頁。
        </p>
      ) : item.type === 'audio' ? (
        <AudioFx item={item as VideoItem} />
      ) : (
        <>
          <div className="chips cat-chips" role="tablist" aria-label="特效位置">
            {(
              [
                ['in', '進場'],
                ['out', '出場'],
                ['seam', '轉場'],
              ] as const
            ).map(([k, name]) => (
              <button
                key={k}
                role="tab"
                aria-selected={part === k}
                data-testid={`fx-part-${k}`}
                className={`chip3${part === k ? ' on' : ''}`}
                onClick={() => setPart(k)}
              >
                {name}
                {k === 'in' && item.inEffect ? ` ·${transitionName(item.inEffect.kind)}` : ''}
                {k === 'out' && item.outEffect ? ` ·${transitionName(item.outEffect.kind)}` : ''}
                {k === 'seam' && item.transitionIn ? ` ·${transitionName(item.transitionIn.kind)}` : ''}
              </button>
            ))}
          </div>
          {part === 'seam' ? (
            <SeamBlock item={item} track={track} cat={cat} setCat={setCat} />
          ) : (
            <SingleBlock item={item} role={part} cat={cat} setCat={setCat} />
          )}
        </>
      )}
    </div>
  );
}

function Cats({ cat, setCat, withText }: { cat: CatKey; setCat: (c: CatKey) => void; withText: boolean }) {
  const cats: CatKey[] = withText ? ['文字', ...TRANSITION_CATS] : TRANSITION_CATS;
  const cur = cats.includes(cat) ? cat : cats[0]!;
  return (
    <div className="chips cat-chips" role="tablist" aria-label="特效分類">
      {cats.map((c) => (
        <button
          key={c}
          role="tab"
          aria-selected={cur === c}
          className={`chip3${cur === c ? ' on' : ''}`}
          onClick={() => setCat(c)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function SingleBlock({
  item,
  role,
  cat,
  setCat,
}: {
  item: Item;
  role: 'in' | 'out';
  cat: CatKey;
  setCat: (c: CatKey) => void;
}) {
  const isText = item.type === 'text';
  const cur = role === 'in' ? item.inEffect : item.outEffect;
  const cats: CatKey[] = isText ? ['文字', ...TRANSITION_CATS] : TRANSITION_CATS;
  const shown = cats.includes(cat) ? cat : cats[0]!;
  const focus = () => useUI.setState({ fxFocus: { id: item.id, role } });
  const pick = (kind: EffectKind | null) => {
    setItemEffect(item.id, role, kind);
    focus();
  };
  const maxLen = Math.max(Math.round(item.duration * 10) / 10, MIN_EFFECT);
  return (
    <>
      <Cats cat={cat} setCat={setCat} withText={isText} />
      <div
        className="tr-grid"
        role="radiogroup"
        aria-label={role === 'in' ? '進場特效' : '出場特效'}
        data-testid="tr-grid"
      >
        <TransitionCard kind={null} label="無" active={!cur} onPick={() => pick(null)} role={role} />
        {shown === '文字' && (
          <TransitionCard
            kind="typewriter"
            label={`打字（${TYPEWRITER_CODE}）`}
            active={cur?.kind === 'typewriter'}
            onPick={() => pick('typewriter')}
            role={role}
          />
        )}
        {shown !== '文字' &&
          TRANSITIONS.filter((t) => t.cat === shown).map((t) => (
            <TransitionCard
              key={t.id}
              kind={t.id}
              label={t.name}
              active={cur?.kind === t.id}
              onPick={() => pick(t.id)}
              role={role}
            />
          ))}
      </div>
      {cur && (
        <Slider
          label={role === 'in' ? '進場幾秒' : '出場幾秒'}
          value={Math.round(Math.min(cur.duration, maxLen) * 10)}
          min={Math.round(MIN_EFFECT * 10)}
          max={Math.round(maxLen * 10)}
          step={1}
          format={(v) => `${(v / 10).toFixed(1)} 秒`}
          onChange={(v) => {
            setItemEffect(item.id, role, cur.kind, v / 10, { coalesce: `fx:${role}:${item.id}` });
            focus();
          }}
        />
      )}
      <p className="hint">
        {role === 'in'
          ? '進場：這個素材從開頭開始出現（素材當 B）。影片照常播，不會等特效做完。'
          : '出場：特效在素材結尾結束，素材慢慢離開（素材當 A）。'}
      </p>
    </>
  );
}

function SeamBlock({
  item,
  track,
  cat,
  setCat,
}: {
  item: Item;
  track: NonNullable<Found>['track'];
  cat: CatKey;
  setCat: (c: CatKey) => void;
}) {
  const cur = item.type === 'audio' ? undefined : item.transitionIn;
  const hasPrev = !!transitionSpan(track.items, { ...item, transitionIn: { kind: 'dissolve', duration: 1 } });
  const shown = (TRANSITION_CATS as string[]).includes(cat) ? (cat as TransitionCat) : TRANSITION_CATS[0]!;
  const focus = () => useUI.setState({ fxFocus: { id: item.id, role: 'seam' } });
  if (!hasPrev)
    return (
      <p className="hint">
        這個素材前面沒有緊接的同類素材，所以沒有轉場。把兩個同類素材（影片和照片算同一類）排在一起，中間不留空位就可以加。
      </p>
    );
  return (
    <>
      <Cats cat={shown} setCat={setCat} withText={false} />
      <div className="tr-grid" role="radiogroup" aria-label="轉場效果" data-testid="tr-grid">
        <TransitionCard
          kind={null}
          label="無"
          active={!cur}
          onPick={() => {
            setTransition(item.id, null);
            focus();
          }}
        />
        {TRANSITIONS.filter((t) => t.cat === shown).map((t) => (
          <TransitionCard
            key={t.id}
            kind={t.id}
            label={t.name}
            active={cur?.kind === t.id}
            onPick={() => {
              setTransition(item.id, t.id);
              focus();
            }}
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
  );
}

/** 音訊沒有畫面特效：只有「幾秒內慢慢變大聲（淡入）／慢慢變小聲（淡出）」 */
function AudioFx({ item }: { item: VideoItem }) {
  const max = Math.max(Math.min(10, Math.round((item.duration / 2) * 10) / 10), 0.1);
  return (
    <>
      <p className="hint">音訊的特效：開頭慢慢變大聲、結尾慢慢變小聲。</p>
      <Slider
        label="淡入（逐漸變大聲）"
        value={item.fadeIn ?? 0}
        min={0}
        max={max}
        step={0.1}
        format={(v) => `${v.toFixed(1)} 秒`}
        onChange={(v) =>
          editItem(
            item.id,
            (it) => {
              if (it.type === 'audio') it.fadeIn = v;
            },
            { coalesce: `fi:${item.id}` },
          )
        }
      />
      <Slider
        label="淡出（逐漸變小聲）"
        value={item.fadeOut ?? 0}
        min={0}
        max={max}
        step={0.1}
        format={(v) => `${v.toFixed(1)} 秒`}
        onChange={(v) =>
          editItem(
            item.id,
            (it) => {
              if (it.type === 'audio') it.fadeOut = v;
            },
            { coalesce: `fo:${item.id}` },
          )
        }
      />
    </>
  );
}
