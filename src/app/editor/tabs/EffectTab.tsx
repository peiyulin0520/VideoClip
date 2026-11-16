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
import type { EffectKind, Item, KineticFade, TextFxKind, TextItem, VideoItem } from '../../../model/types';
import {
  editItem,
  setItemMotion,
  setItemEffect,
  patchKinetic,
  resetKineticArea,
  setKinetic,
  setKineticTextColor,
  setTextFx,
  setTransition,
  setTransitionAll,
  setTransitionSplit,
} from '../../../store/actions';
import { KINETIC, KINETIC_GROUPS, SCHEMES, kineticById, resolveBg } from '../../../engine/kinetic';
import { kineticFrame } from '../../../engine/kinetic/hit';
import type { KineticDef, KineticGroup } from '../../../engine/kinetic/core';
import { kineticWords } from '../../../engine/kinetic/render';
import { TEXT_FXS, textFxName } from '../../../engine/textFx';
import { ColorPicker } from '../../../ui/ColorPicker';
import { KineticCard } from '../KineticCards';
import { useProjectStore } from '../../../store/projectStore';
import { toast, useUI } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';
import { EffectTimingSheet } from '../EffectTimingSheet';
import { TransitionAudioBlock } from '../TransitionAudio';
import { TransitionCard } from '../TransitionCards';
import type { Found } from './shared';

type Part = 'in' | 'out' | 'seam' | 'style' | 'whole';
type CatKey = TransitionCat | '文字';

/** 特效分頁：依選到的素材類別，列出這一類能用的特效——進場、出場（只在素材自己的開頭／結尾）、跟前一段的轉場 */
export function EffectTab({ found }: { found: Found }) {
  useProjectStore((s) => s.project); // 專案變了要重畫
  const fxFocus = useUI((s) => s.fxFocus);
  const [cat, setCat] = useState<CatKey | null>(null);
  // 任何素材都能在這裡設特效：版型外框＝整個版型；格子裡的素材、版型裡的文字貼圖＝各自的
  const item: Item | null = found ? found.item : null;
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
          先在時間軸點一個素材（進場、出場、整段），或點兩個素材中間的小圓圈（轉場），再選特效。整個版型：點版型那一條；版型裡的素材：點那個素材。
        </p>
      ) : item.type === 'audio' ? (
        <AudioFx item={item as VideoItem} />
      ) : (
        <>
          <div className="fx-where" data-testid="fx-where">
            <div className="zone-title">作用在</div>
            <div className="seg" role="tablist" aria-label="特效位置">
              {(
                [
                  ['in', '進場'],
                  ['out', '出場'],
                  ['seam', '轉場'],
                  ['whole', '整段'],
                  ...(item.type === 'text' ? [['style', '文字特效'] as const] : []),
                ] as (readonly [Part, string])[]
              ).map(([k, name]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={part === k}
                  data-testid={`fx-part-${k}`}
                  className={`seg-btn${part === k ? ' on' : ''}`}
                  onClick={() => setPart(k)}
                >
                  {name}
                  {k === 'in' && item.inEffect ? ` ·${transitionName(item.inEffect.kind)}` : ''}
                  {k === 'out' && item.outEffect ? ` ·${transitionName(item.outEffect.kind)}` : ''}
                  {k === 'seam' && item.transitionIn ? ` ·${transitionName(item.transitionIn.kind)}` : ''}
                  {k === 'style' && item.type === 'text' && (item.kinetic || item.textFx)
                    ? ` ·${item.kinetic ? (kineticById(item.kinetic.id)?.zh ?? '') : textFxName(item.textFx!.kind)}`
                    : ''}
                  {k === 'whole' && item.motion ? ` ·${item.motion === 'drift' ? '捲動' : '滑入滑出'}` : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="zone-soft" data-testid="fx-effects">
            <div className="zone-title">效果</div>
            {part === 'seam' ? (
              <SeamBlock item={item} track={track} cat={cat} setCat={setCat} />
            ) : part === 'whole' ? (
              <WholeBlock item={item} />
            ) : part === 'style' && item.type === 'text' ? (
              <StyleBlock item={item} />
            ) : part === 'style' ? null : (
              <SingleBlock item={item} role={part} cat={cat} setCat={setCat} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** 整段效果：捲動（從畫面下面外面一路捲到上面外面）、滑入滑出；版型外框＝整組一起動 */
function WholeBlock({ item }: { item: Item }) {
  const cur = item.type === 'audio' ? undefined : item.motion;
  const pick = (m: 'drift' | 'slide' | undefined) => {
    setItemMotion(item.id, m);
    useUI.setState({ fxFocus: { id: item.id, role: 'whole' } });
  };
  return (
    <div className="chips" role="radiogroup" aria-label="整段效果" data-testid="fx-whole">
      {(
        [
          [undefined, '無'],
          ['drift', '捲動'],
          ['slide', '滑入滑出'],
        ] as const
      ).map(([id, name]) => (
        <button
          key={name}
          role="radio"
          aria-checked={cur === id}
          aria-label={`整段 ${name}`}
          className={`chip${cur === id ? ' active' : ''}`}
          onClick={() => pick(id)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/** 字卡的文字特效：整段字一直在動。［基本］是舊的 4 種；其他組是動態字卡 64 式（照原版分組），選一種或「無」 */
function StyleBlock({ item }: { item: Item }) {
  const textFx = item.type === 'text' ? item.textFx?.kind : undefined;
  const kin = item.type === 'text' ? item.kinetic : undefined;
  const kdef = kin ? kineticById(kin.id) : undefined;
  const groups = KINETIC_GROUPS.filter((g) => KINETIC.some((f) => f.group === g.id));
  const [pickedGroup, setGroup] = useState<KineticGroup | 'basic' | null>(null);
  const grp: KineticGroup | 'basic' = pickedGroup ?? kdef?.group ?? 'basic';
  const focus = () => useUI.setState({ fxFocus: { id: item.id, role: 'style' } });
  const pickBasic = (k: TextFxKind | null) => {
    setTextFx(item.id, k);
    focus();
  };
  const pickKinetic = (id: KineticDef['id'] | null) => {
    setKinetic(item.id, id);
    focus();
  };
  const run = item.type === 'text' ? item.card.runs[0] : undefined;
  const words = item.type === 'text' && kdef ? kineticWords(item, kdef.words) : [];
  const cardWords = (def: KineticDef) => (item.type === 'text' ? kineticWords(item, def.words) : def.words);
  const none = !textFx && !kin;
  return (
    <>
      <div className="seg" role="tablist" aria-label="文字特效分組" data-testid="kn-groups">
        {([['basic', '基本'], ...groups.map((g) => [g.id, g.name] as const)] as const).map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={grp === id}
            data-testid={`kn-group-${id}`}
            className={`seg-btn${grp === id ? ' on' : ''}`}
            onClick={() => setGroup(id)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="tr-grid" role="radiogroup" aria-label="文字特效" data-testid="tr-grid">
        <button
          role="radio"
          aria-checked={none}
          aria-label="文字特效 無"
          className={`tr-card${none ? ' on' : ''}`}
          onClick={() => {
            setTextFx(item.id, null);
            setKinetic(item.id, null);
            focus();
          }}
        >
          <span className="tr-none" aria-hidden="true">
            ⊘
          </span>
          <span className="tr-name">無</span>
        </button>
        {grp === 'basic'
          ? TEXT_FXS.map((f) => (
              <button
                key={f.id}
                role="radio"
                aria-checked={textFx === f.id}
                aria-label={`文字特效 ${f.name}`}
                className={`tr-card${textFx === f.id ? ' on' : ''}`}
                onClick={() => pickBasic(f.id)}
              >
                <span className="tr-none" aria-hidden="true">
                  {f.code}
                </span>
                <span className="tr-name">{f.name}</span>
              </button>
            ))
          : KINETIC.filter((f) => f.group === grp).map((f) => (
              <KineticCard
                key={f.id}
                def={f}
                words={cardWords(f)}
                fontId={run?.fontId ?? ''}
                active={kin?.id === f.id}
                onPick={() => pickKinetic(f.id)}
              />
            ))}
      </div>
      {kin && kdef && item.type === 'text' && <KineticSettings item={item} def={kdef} words={words} />}
    </>
  );
}

const KINETIC_BGS: [string | undefined, string][] = [
  [undefined, '透明'],
  ['#14161b', '墨黑'],
  ['#f4f5f7', '紙白'],
  ['#2340ff', '鈷藍'],
  ['#ff4d2e', '朱紅'],
  ['#00b140', '綠幕'],
];
const KINETIC_SPEEDS = [0.5, 1, 1.5, 2];
const KINETIC_FADES: [KineticFade, string][] = [
  ['none', '無'],
  ['v', '上下'],
  ['h', '左右'],
];

/** 動態字卡的設定：顏色（字色、強調色、底色，都能自訂）、顯示範圍（調整範圍、邊緣淡出）、速度與一輪幾秒 */
function KineticSettings({ item, def, words }: { item: TextItem; def: KineticDef; words: string[] }) {
  const k = item.kinetic!;
  const sch = SCHEMES[def.scheme];
  const len = def.len(words);
  const speed = k.speed ?? 1;
  const fade = k.fade ?? def.fade ?? 'none';
  const bg = resolveBg(k.bg);
  const player = useUI((s) => s.player);
  return (
    <div className="kn-set" data-testid="kn-settings">
      <div className="zone-soft" data-testid="kn-colors">
        <div className="zone-title">顏色</div>
        <div className="slider-label">字色</div>
        <ColorPicker
          label="字色"
          value={item.card.runs[0]?.color ?? sch.fg}
          onPick={(c) => setKineticTextColor(item.id, c)}
        />
        <div className="slider-label">強調色</div>
        <ColorPicker
          label="強調色"
          value={k.accent ?? sch.hi}
          onPick={(c) => patchKinetic(item.id, { accent: c })}
        />
        <div className="slider-label">底色</div>
        <div className="chips" role="radiogroup" aria-label="動態字卡底色">
          {KINETIC_BGS.map(([id, name]) => (
            <button
              key={name}
              role="radio"
              aria-checked={bg === (id ?? null)}
              aria-label={`底色 ${name}`}
              className={`chip${bg === (id ?? null) ? ' active' : ''}`}
              onClick={() => patchKinetic(item.id, { bg: id })}
            >
              {name}
            </button>
          ))}
        </div>
        <ColorPicker
          label="自訂底色"
          value={bg ?? '#14161b'}
          onPick={(c) => patchKinetic(item.id, { bg: c })}
        />
      </div>
      <div className="zone-soft" data-testid="kn-area">
        <div className="zone-title">顯示範圍</div>
        <div className="size-row">
          <button
            className="btn"
            data-testid="kn-area-edit"
            onClick={() => {
              player?.pause();
              const p = useProjectStore.getState().project!;
              const f = kineticFrame(item, p.width, p.height);
              useUI.setState({
                kineticEdit: {
                  id: item.id,
                  x: item.transform.x,
                  y: item.transform.y,
                  w: f.w / p.width,
                  h: f.h / p.height,
                },
              });
            }}
          >
            調整範圍
          </button>
          <button
            className="btn"
            data-testid="kn-area-reset"
            disabled={!k.size}
            onClick={() => resetKineticArea(item.id)}
          >
            重置範圍
          </button>
        </div>
        <div className="slider-label">邊緣淡出</div>
        <div className="chips" role="radiogroup" aria-label="邊緣淡出">
          {KINETIC_FADES.map(([id, name]) => (
            <button
              key={id}
              role="radio"
              aria-checked={fade === id}
              aria-label={`邊緣淡出 ${name}`}
              className={`chip${fade === id ? ' active' : ''}`}
              onClick={() => patchKinetic(item.id, { fade: id })}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="zone-soft" data-testid="kn-speed">
        <div className="zone-title">速度</div>
        <div className="chips" role="radiogroup" aria-label="動態字卡速度">
          {KINETIC_SPEEDS.map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={speed === v}
              aria-label={`速度 ${v}×`}
              className={`chip${speed === v ? ' active' : ''}`}
              onClick={() => patchKinetic(item.id, { speed: v === 1 ? undefined : v })}
            >
              {v}×
            </button>
          ))}
        </div>
        {len !== null && <div className="slider-label">一輪 {(len / speed).toFixed(1)} 秒</div>}
      </div>
    </div>
  );
}

function Cats({
  cat,
  setCat,
  withText,
}: {
  cat: CatKey | null;
  setCat: (c: CatKey) => void;
  withText: boolean;
}) {
  const cats: CatKey[] = withText ? ['文字', ...TRANSITION_CATS] : TRANSITION_CATS;
  const cur = cat && cats.includes(cat) ? cat : cats[0]!;
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
  cat: CatKey | null;
  setCat: (c: CatKey) => void;
}) {
  const isText = item.type === 'text';
  const cur = role === 'in' ? item.inEffect : item.outEffect;
  const cats: CatKey[] = isText ? ['文字', ...TRANSITION_CATS] : TRANSITION_CATS;
  const shown = cat && cats.includes(cat) ? cat : cats[0]!;
  const focus = () => useUI.setState({ fxFocus: { id: item.id, role } });
  const pick = (kind: EffectKind | null) => {
    setItemEffect(item.id, role, kind);
    focus();
  };
  const maxLen = Math.max(Math.round(item.duration * 10) / 10, MIN_EFFECT);
  const [adjust, setAdjust] = useState(false);
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
      {cur && adjust && (
        <EffectTimingSheet
          mode={role}
          item={item}
          initial={{ d: Math.min(cur.duration, item.duration) }}
          onClose={() => setAdjust(false)}
          onApply={(v) => {
            setItemEffect(item.id, role, cur.kind, v.d);
            focus();
            toast('已套用');
          }}
        />
      )}
      {cur && (
        <button className="btn" data-testid="fx-adjust" onClick={() => setAdjust(true)}>
          調整時間
        </button>
      )}
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
  cat: CatKey | null;
  setCat: (c: CatKey) => void;
}) {
  const cur = item.type === 'audio' ? undefined : item.transitionIn;
  const spanNow = transitionSpan(track.items, { ...item, transitionIn: { kind: 'dissolve', duration: 1 } });
  const hasPrev = !!spanNow;
  const [adjust, setAdjust] = useState(false);
  const shown =
    cat && (TRANSITION_CATS as string[]).includes(cat) ? (cat as TransitionCat) : TRANSITION_CATS[0]!;
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
      {cur && adjust && spanNow && (
        <EffectTimingSheet
          mode="seam"
          item={item}
          prev={spanNow.prev}
          initial={{
            before: cur.before ?? cur.duration / 2,
            after: cur.after ?? cur.duration / 2,
          }}
          onClose={() => setAdjust(false)}
          onApply={(v) => {
            setTransitionSplit(item.id, v.before, v.after);
            focus();
            toast('已套用');
          }}
        />
      )}
      {cur && (
        <>
          <button className="btn" data-testid="fx-adjust" onClick={() => setAdjust(true)}>
            調整分配（前後各幾秒）
          </button>
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
          {spanNow && <TransitionAudioBlock item={item} prev={spanNow.prev} />}
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
