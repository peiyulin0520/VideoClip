import { useEffect, useState } from 'react';
import {
  DEFAULT_TRANSITION_DURATION,
  MAX_TRANSITION,
  MIN_EFFECT,
  MIN_TRANSITION,
  TRANSITION_CATS,
  TRANSITIONS,
  seamPrev,
  transitionSpan,
  TYPEWRITER_CODE,
  type TransitionCat,
} from '../../../engine/transitions';
import type { EffectKind, Item, KineticFade, TextItem } from '../../../model/types';
import {
  setItemMotion,
  setItemEffect,
  patchKinetic,
  resetKineticArea,
  setKinetic,
  setKineticTextColor,
  setTextFx,
  setTransition,
  setTransitionAll,
  setTransitionMode,
  setTransitionSplit,
} from '../../../store/actions';
import { KINETIC, KINETIC_GROUPS, kineticById, resolveBg, schemeOf } from '../../../engine/kinetic';
import { kineticFrame } from '../../../engine/kinetic/hit';
import { holdTime } from '../../../engine/kinetic/hold';
import type { KineticDef, KineticGroup } from '../../../engine/kinetic/core';
import { DEFAULT_FADE_W, kineticWords } from '../../../engine/kinetic/render';
import { TEXT_FXS } from '../../../engine/textFx';
import { ColorPicker } from '../../../ui/ColorPicker';
import { KineticCard, TextFxCard } from '../KineticCards';
import { useProjectStore } from '../../../store/projectStore';
import { toast, useUI } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';
import { EffectTimingSheet } from '../EffectTimingSheet';
import { TransitionAudioBlock } from '../TransitionAudio';
import { TransitionCard } from '../TransitionCards';
import type { Found } from './shared';

export type FxPart = 'in' | 'out' | 'seam' | 'whole' | 'textfx';
type CatKey = TransitionCat | '文字';

/** 特效工具列每一項的視窗：進場、出場、轉場、整段、文字特效、動態字卡（各自一項，沒有分段切換列） */
export function EffectTab({ found, part }: { found: Found; part: FxPart }) {
  useProjectStore((s) => s.project); // 專案變了要重畫
  const [cat, setCat] = useState<CatKey | null>(null);
  // 任何素材都能在這裡設特效：版型外框＝整個版型；格子裡的素材、版型裡的文字貼圖＝各自的
  const item: Item | null = found ? found.item : null;
  const track = item ? found!.track : null;
  return (
    <div className="panel effect-panel" data-testid="effect-panel">
      {!item || !track ? (
        <p className="hint">先點選一個素材</p>
      ) : (
        <div data-testid="fx-effects">
          {part === 'seam' ? (
            <SeamBlock item={item} track={track} cat={cat} setCat={setCat} />
          ) : part === 'whole' ? (
            <WholeBlock item={item} />
          ) : part === 'textfx' ? (
            item.type === 'text' ? (
              <StyleBlock item={item} />
            ) : null
          ) : (
            <SingleBlock item={item} role={part} cat={cat} setCat={setCat} />
          )}
        </div>
      )}
    </div>
  );
}

/** 轉場位置：置中（前後各一半，預設）、接縫前（全部在前一段結尾）、接縫後（全部在後一段開頭）、自訂 */
function alignOf(tr: {
  duration: number;
  before?: number;
  after?: number;
}): 'center' | 'before' | 'after' | 'custom' {
  if (tr.before === undefined && tr.after === undefined) return 'center';
  const b = tr.before ?? tr.duration / 2;
  const a = tr.after ?? tr.duration / 2;
  if (Math.abs(b - a) < 0.02) return 'center';
  if (a < 0.02 && b > 0.02) return 'before';
  if (b < 0.02 && a > 0.02) return 'after';
  return 'custom';
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

/**
 * 字卡的文字特效（一個視窗）：整段字一直在動。上面一排分組——［基本］是 4 種文字樣式特效，
 * 其他組是動態字卡 64 式（照原版分組）；選一種或「無」（兩種本來就二選一）。
 */
function StyleBlock({ item }: { item: Item }) {
  const textFx = item.type === 'text' ? item.textFx?.kind : undefined;
  const kin = item.type === 'text' ? item.kinetic : undefined;
  const kdef = kin ? kineticById(kin.id) : undefined;
  const kgroups = KINETIC_GROUPS.filter((g) => KINETIC.some((f) => f.group === g.id));
  const groups: { id: KineticGroup | 'basic'; name: string }[] = [{ id: 'basic', name: '基本' }, ...kgroups];
  const [pickedGroup, setGroup] = useState<KineticGroup | 'basic' | null>(null);
  const grp: KineticGroup | 'basic' = pickedGroup ?? kdef?.group ?? 'basic';
  const focus = () => useUI.setState({ fxFocus: { id: item.id, role: 'style' } });
  const run = item.type === 'text' ? item.card.runs[0] : undefined;
  const words = item.type === 'text' && kdef ? kineticWords(item, kdef.words) : [];
  const cardWords = (def: KineticDef) => (item.type === 'text' ? kineticWords(item, def.words) : def.words);
  const none = !textFx && !kin;
  return (
    <>
      <div className="seg" role="tablist" aria-label="文字特效分組" data-testid="kn-groups">
        {groups.map((g) => (
          <button
            key={g.id}
            role="tab"
            aria-selected={grp === g.id}
            data-testid={`kn-group-${g.id}`}
            className={`seg-btn${grp === g.id ? ' on' : ''}`}
            onClick={() => setGroup(g.id)}
          >
            {g.name}
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
        {grp === 'basic' && item.type === 'text'
          ? TEXT_FXS.map((f) => (
              <TextFxCard
                key={f.id}
                kind={f.id}
                name={f.name}
                card={item.card}
                seed={item.id}
                active={textFx === f.id}
                onPick={() => {
                  setTextFx(item.id, f.id);
                  focus();
                }}
              />
            ))
          : KINETIC.filter((f) => f.group === grp).map((f) => (
              <KineticCard
                key={f.id}
                def={f}
                words={cardWords(f)}
                fontId={run?.fontId ?? ''}
                active={kin?.id === f.id}
                onPick={() => {
                  setKinetic(item.id, f.id);
                  focus();
                }}
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
  const sch = schemeOf(def);
  const len = def.len(words);
  const speed = k.speed ?? 1;
  const fade = k.fade ?? def.fade ?? 'none';
  const bg = resolveBg(k.bg);
  const player = useUI((s) => s.player);
  // 設定視窗開著、而且有選邊緣淡出：預覽上標出淡出的範圍
  const showGuide = fade !== 'none';
  useEffect(() => {
    if (!showGuide) return;
    useUI.setState({ kineticFadeGuide: item.id });
    return () => useUI.setState({ kineticFadeGuide: null });
  }, [showGuide, item.id]);
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
        {fade !== 'none' && (
          <>
            <Slider
              label="淡出寬度"
              value={Math.round((k.fadeW ?? DEFAULT_FADE_W) * 100)}
              min={5}
              max={45}
              step={1}
              format={(v) => `${v}%`}
              onChange={(v) => patchKinetic(item.id, { fadeW: v / 100 })}
            />
            <p className="hint" data-testid="kn-fade-hint">
              字經過框的邊緣才會淡掉；字離邊緣遠就看不出來，可以把淡出寬度調大，或用〔調整範圍〕把框縮小到字附近。
            </p>
          </>
        )}
      </div>
      {k.id === 'hitline' && (
        <div className="zone-soft" data-testid="kn-wrap">
          <div className="zone-title">換行</div>
          <div className="chips" role="radiogroup" aria-label="重擊排字換行">
            {(
              [
                [undefined, '排成一行'],
                ['auto', '自動換行'],
              ] as const
            ).map(([id, name]) => (
              <button
                key={name}
                role="radio"
                aria-checked={k.wrap === id}
                aria-label={`換行 ${name}`}
                className={`chip${k.wrap === id ? ' active' : ''}`}
                onClick={() => patchKinetic(item.id, { wrap: id })}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="hint">
            〔排成一行〕字再多也排一行（字會縮小）；〔自動換行〕超過 8
            個字才換行。想自己決定在哪裡換行，就在文字〔內容〕按 Enter。
          </p>
        </div>
      )}
      <div className="zone-soft" data-testid="kn-speed">
        <div className="zone-title">速度與播放</div>
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
        <>
          <div className="slider-label">字卡比一輪長時</div>
          <div className="chips" role="radiogroup" aria-label="字卡比一輪長時">
            {(
              [
                ['loop', '重複播放'],
                ['hold', '停在最後畫面'],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                role="radio"
                aria-checked={(k.end ?? 'loop') === id}
                aria-label={name}
                data-testid={`kn-end-${id}`}
                className={`chip${(k.end ?? 'loop') === id ? ' active' : ''}`}
                onClick={() => patchKinetic(item.id, { end: id === 'loop' ? undefined : id })}
              >
                {name}
              </button>
            ))}
          </div>
          {k.end === 'hold' && (
            <div className="slider-label" data-testid="kn-hold-at">
              停在 {(holdTime(def, words) / speed).toFixed(1)} 秒
            </div>
          )}
        </>
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
  const holdNow = cur?.mode === 'hold';
  const spanNow = holdNow
    ? seamPrev(track.items, item)
      ? { prev: seamPrev(track.items, item)!.prev }
      : null
    : transitionSpan(track.items, { ...item, transitionIn: { kind: 'dissolve', duration: 1 } });
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
          <div className="chips" role="radiogroup" aria-label="轉場方式" data-testid="tr-mode">
            {(
              [
                ['overlap', '邊轉邊播'],
                ['hold', '停格轉場'],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                role="radio"
                aria-checked={(holdNow ? 'hold' : 'overlap') === id}
                aria-label={`轉場方式 ${name}`}
                className={`chip${(holdNow ? 'hold' : 'overlap') === id ? ' active' : ''}`}
                data-testid={`tr-mode-${id}`}
                onClick={() => {
                  if (setTransitionMode(item.id, id)) focus();
                }}
              >
                {name}
              </button>
            ))}
          </div>
          {!holdNow && (
            <>
              <div className="chips" role="radiogroup" aria-label="轉場位置" data-testid="tr-align">
                {(
                  [
                    ['center', '置中', 0.5],
                    ['before', '接縫前', 1],
                    ['after', '接縫後', 0],
                  ] as const
                ).map(([id, name, frac]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={alignOf(cur) === id}
                    aria-label={`轉場位置 ${name}`}
                    className={`chip${alignOf(cur) === id ? ' active' : ''}`}
                    data-testid={`tr-align-${id}`}
                    onClick={() => {
                      setTransitionSplit(item.id, cur.duration * frac, cur.duration * (1 - frac));
                      focus();
                    }}
                  >
                    {name}
                  </button>
                ))}
                <button
                  className={`chip${alignOf(cur) === 'custom' ? ' active' : ''}`}
                  data-testid="fx-adjust"
                  onClick={() => setAdjust(true)}
                >
                  自訂
                </button>
              </div>
            </>
          )}
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
          {spanNow && !holdNow && <TransitionAudioBlock item={item} prev={spanNow.prev} />}
        </>
      )}
    </>
  );
}
