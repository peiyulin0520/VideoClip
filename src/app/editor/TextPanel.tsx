import { useState } from 'react';
import type { CardBox, Stroke, TextItem } from '../../model/types';
import { editText, removeAnyItem } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { DECORATION_KINDS } from '../../engine/decorations';
import { SHAPE_CATS, SHAPES, shapeDef } from '../../engine/shapes';
import { Slider } from '../../ui/Slider';
import { DecoThumb } from './DecoThumb';
import { ShapeThumb } from './ShapeThumb';
import { FontSelect } from '../fonts/FontSelect';

const COLORS = ['#ffffff', '#111111', '#ff4d8d', '#ffd23f', '#4dd0ff', '#7CFC6A', '#b388ff', '#ff7a45'];
const BOX_COLORS = ['#ff4d8d', '#ffffff', '#111111', '#ffd23f', '#4dd0ff', '#7CFC6A', '#b388ff', '#ff7a45'];
const SECTIONS = ['文字', '版面', '字塊', '描邊陰影', '裝飾'] as const;
type Section = (typeof SECTIONS)[number];
const SIDES = [
  ['top', '上'],
  ['bottom', '下'],
  ['left', '左'],
  ['right', '右'],
] as const;
const px = (v: number) => `${v}px`;

export const DEFAULT_BOX: CardBox = {
  shape: 'roundRect',
  fill: '#ff4d8d',
  opacity: 1,
  padding: { top: 24, right: 40, bottom: 24, left: 40 },
  nudgeY: 0,
  radius: 28,
};

function Swatches({
  colors,
  value,
  label,
  onPick,
}: {
  colors: string[];
  value: string;
  label: string;
  onPick: (c: string) => void;
}) {
  return (
    <div className="chips">
      {colors.map((c) => (
        <button
          key={c}
          className={`swatch${value.toLowerCase() === c.toLowerCase() ? ' active' : ''}`}
          style={{ background: c }}
          aria-label={`${label} ${c}`}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

export function TextPanel({
  item,
  onAdd,
  onAddShape,
}: {
  item: TextItem;
  onAdd: () => void;
  onAddShape: () => void;
}) {
  const [section, setSection] = useState<Section>('文字');
  const [linked, setLinked] = useState(false);
  const [cat, setCat] = useState<(typeof SHAPE_CATS)[number]>('基本');
  const card = item.card;
  const run = card.runs[0]!;
  const id = item.id;
  const box = card.box;
  const edit = (recipe: Parameters<typeof editText>[1], key?: string) =>
    editText(id, recipe, key ? { coalesce: `${key}:${id}` } : undefined);

  const stroke = (i: number): Stroke =>
    run.strokes?.[i] ?? { color: i === 0 ? '#ffffff' : '#111111', width: 0 };
  const setStroke = (i: number, patch: Partial<Stroke>, key?: string) =>
    edit((c) => {
      const r = c.runs[0]!;
      const list: Stroke[] = [stroke(0), stroke(1)];
      if (r.strokes) r.strokes.forEach((s, k) => (list[k] = s));
      list[i] = { ...list[i]!, ...patch };
      r.strokes = list; // 兩層都留著（厚度 0 的層畫的時候略過），滑桿和顏色才不會互相跑位
    }, key);

  return (
    <>
      <div className="chips sticky-tabs" role="tablist" aria-label="字卡設定">
        {SECTIONS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={section === s}
            className={`chip${section === s ? ' active' : ''}`}
            onClick={() => setSection(s)}
          >
            {s}
          </button>
        ))}
        <button className="chip sm add" aria-label="新增文字" onClick={onAdd}>
          ＋新增
        </button>
      </div>

      {section === '文字' && (
        <>
          <textarea
            className="text-input area"
            aria-label="文字內容"
            rows={2}
            value={run.text}
            onChange={(e) => edit((c) => void (c.runs[0]!.text = e.target.value), 'txt')}
          />
          <div className="font-row-wrap">
            <FontSelect
              value={run.fontId}
              onChange={(fontId) => edit((c) => void (c.runs[0]!.fontId = fontId))}
            />
          </div>
          <Slider
            label="大小"
            value={run.size}
            min={24}
            max={240}
            step={1}
            onChange={(v) => edit((c) => void (c.runs[0]!.size = v), 'size')}
          />
          <Swatches
            colors={COLORS}
            value={run.color}
            label="文字顏色"
            onPick={(col) => edit((c) => void (c.runs[0]!.color = col))}
          />
          <div className="chips">
            <button
              className={`chip${run.weight === 'bold' ? ' active' : ''}`}
              aria-pressed={run.weight === 'bold'}
              onClick={() =>
                edit((c) => void (c.runs[0]!.weight = run.weight === 'bold' ? 'normal' : 'bold'))
              }
            >
              粗體
            </button>
            <button
              className={`chip${run.italic ? ' active' : ''}`}
              aria-pressed={!!run.italic}
              onClick={() => edit((c) => void (c.runs[0]!.italic = !run.italic))}
            >
              斜體
            </button>
            <button
              className="chip danger"
              aria-label="刪除這個文字"
              onClick={() => {
                removeAnyItem(id);
                useProjectStore.getState().select(null);
              }}
            >
              刪除
            </button>
          </div>
        </>
      )}

      {section === '版面' && (
        <>
          <Slider
            label="字距"
            value={run.letterSpacing}
            min={-0.2}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => edit((c) => void (c.runs[0]!.letterSpacing = v), 'ls')}
          />
          <Slider
            label="行距"
            value={run.lineHeight}
            min={0.8}
            max={2.5}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => edit((c) => void (c.runs[0]!.lineHeight = v), 'lh')}
          />
          <div className="chips">
            <button
              className={`chip${card.width === undefined ? ' active' : ''}`}
              aria-pressed={card.width === undefined}
              onClick={() =>
                edit((c) => {
                  if (c.width === undefined) c.width = 700;
                  else delete c.width;
                })
              }
            >
              寬度：依文字
            </button>
          </div>
          {card.width !== undefined && (
            <Slider
              label="寬度"
              value={card.width}
              min={200}
              max={1080}
              step={10}
              format={px}
              onChange={(v) => edit((c) => void (c.width = v), 'w')}
            />
          )}
          <div className="chips" role="radiogroup" aria-label="對齊">
            {(
              [
                ['left', '靠左'],
                ['center', '置中'],
                ['right', '靠右'],
              ] as const
            ).map(([a, label]) => (
              <button
                key={a}
                role="radio"
                aria-checked={card.align === a}
                className={`chip${card.align === a ? ' active' : ''}`}
                onClick={() => edit((c) => void (c.align = a))}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {section === '字塊' && (
        <>
          <div className="chips">
            <button
              role="radio"
              aria-checked={!box}
              className={`chip${!box ? ' active' : ''}`}
              onClick={() => edit((c) => void delete c.box)}
            >
              無字塊
            </button>
            {SHAPE_CATS.map((c) => (
              <button
                key={c}
                className={`chip${cat === c ? ' active' : ''}`}
                aria-pressed={cat === c}
                aria-label={`圖形分類 ${c}`}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="shape-grid" role="radiogroup" aria-label="字塊形狀" data-testid="shape-grid">
            {SHAPES.filter((s) => s.cat === cat).map((s) => {
              const on = box?.shape === s.id;
              return (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={on}
                  aria-label={s.label}
                  data-shape={s.id}
                  className={`shape-cell${on ? ' active' : ''}`}
                  onClick={() =>
                    edit((c) => {
                      if (c.box) c.box.shape = s.id;
                      else c.box = { ...DEFAULT_BOX, padding: { ...DEFAULT_BOX.padding }, shape: s.id };
                    })
                  }
                >
                  <ShapeThumb shape={s.id} />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
          <div className="chips">
            <button className="chip sm" onClick={onAddShape}>
              ＋ 另外新增一個獨立圖形
            </button>
          </div>
          {box ? (
            <>
              <Swatches
                colors={BOX_COLORS}
                value={box.fill}
                label="字塊顏色"
                onPick={(col) => edit((c) => void (c.box!.fill = col))}
              />
              <Slider
                label="透明度"
                value={Math.round(box.opacity * 100)}
                min={10}
                max={100}
                step={5}
                format={(v) => `${v}%`}
                onChange={(v) => edit((c) => void (c.box!.opacity = v / 100), 'bop')}
              />
              {shapeDef(box.shape).tail && (
                <div className="chips" role="radiogroup" aria-label="尾巴方向">
                  {(
                    [
                      ['bottom-left', '尾巴在左下'],
                      ['bottom-right', '尾巴在右下'],
                    ] as const
                  ).map(([d, label]) => (
                    <button
                      key={d}
                      role="radio"
                      aria-checked={(box.tailDir ?? 'bottom-left') === d}
                      className={`chip${(box.tailDir ?? 'bottom-left') === d ? ' active' : ''}`}
                      onClick={() => edit((c) => void (c.box!.tailDir = d))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {(box.shape === 'roundRect' || box.shape === 'speech-round') && (
                <Slider
                  label="圓角"
                  value={box.radius ?? 28}
                  min={0}
                  max={120}
                  step={2}
                  format={px}
                  onChange={(v) => edit((c) => void (c.box!.radius = v), 'brad')}
                />
              )}
              <Slider
                label="字塊外框"
                value={box.stroke?.width ?? 0}
                min={0}
                max={24}
                step={1}
                format={px}
                onChange={(v) =>
                  edit((c) => {
                    const b2 = c.box!;
                    b2.stroke = { color: b2.stroke?.color ?? '#ffffff', width: v };
                    if (v <= 0) delete b2.stroke;
                  }, 'bst')
                }
              />
              {box.stroke && (
                <Swatches
                  colors={COLORS}
                  value={box.stroke.color}
                  label="字塊外框顏色"
                  onPick={(col) =>
                    edit((c) => void (c.box!.stroke = { color: col, width: c.box!.stroke?.width ?? 4 }))
                  }
                />
              )}
              <div className="panel-head">
                <span>內距（字到色塊邊緣的距離）</span>
                <button
                  className={`chip sm${linked ? ' active' : ''}`}
                  aria-pressed={linked}
                  aria-label="四邊連動"
                  onClick={() => setLinked(!linked)}
                >
                  {linked ? '四邊連動：開' : '四邊連動：關'}
                </button>
              </div>
              {SIDES.map(([side, label]) => (
                <Slider
                  key={side}
                  label={`內距 ${label}`}
                  value={box.padding[side]}
                  min={0}
                  max={200}
                  step={1}
                  format={px}
                  onChange={(v) =>
                    edit(
                      (c) => {
                        const pad = c.box!.padding;
                        if (linked) pad.top = pad.bottom = pad.left = pad.right = v;
                        else pad[side] = v;
                      },
                      `pad-${linked ? 'all' : side}`,
                    )
                  }
                />
              ))}
              <Slider
                label="文字上下微調"
                value={box.nudgeY}
                min={-40}
                max={40}
                step={1}
                format={px}
                onChange={(v) => edit((c) => void (c.box!.nudgeY = v), 'nudge')}
              />
            </>
          ) : (
            <p className="hint">選一個形狀，文字後面就會有色塊。內距上下左右可以分開調。</p>
          )}
        </>
      )}

      {section === '描邊陰影' && (
        <>
          <div className="panel-head">
            <span>外層描邊</span>
          </div>
          <Slider
            label="描邊 外層"
            value={stroke(0).width}
            min={0}
            max={40}
            step={1}
            format={px}
            onChange={(v) => setStroke(0, { width: v }, 'st0')}
          />
          <Swatches
            colors={COLORS}
            value={stroke(0).color}
            label="外層描邊顏色"
            onPick={(col) => setStroke(0, { color: col, width: stroke(0).width || 6 })}
          />
          <div className="panel-head">
            <span>內層描邊（加在外層裡面，做雙層邊）</span>
          </div>
          <Slider
            label="描邊 內層"
            value={stroke(1).width}
            min={0}
            max={40}
            step={1}
            format={px}
            onChange={(v) => setStroke(1, { width: v }, 'st1')}
          />
          <Swatches
            colors={COLORS}
            value={stroke(1).color}
            label="內層描邊顏色"
            onPick={(col) => setStroke(1, { color: col, width: stroke(1).width || 3 })}
          />
          <div className="chips">
            <button
              className={`chip${run.shadow ? ' active' : ''}`}
              aria-pressed={!!run.shadow}
              onClick={() =>
                edit((c) => {
                  const r = c.runs[0]!;
                  if (r.shadow) delete r.shadow;
                  else r.shadow = { color: 'rgba(0,0,0,0.55)', blur: 6, x: 0, y: 2 };
                })
              }
            >
              陰影
            </button>
          </div>
          {run.shadow && (
            <Slider
              label="陰影模糊"
              value={run.shadow.blur}
              min={0}
              max={40}
              step={1}
              format={px}
              onChange={(v) => edit((c) => void (c.runs[0]!.shadow!.blur = v), 'shb')}
            />
          )}
        </>
      )}

      {section === '裝飾' && (
        <>
          <p className="hint">點一個風格加到字上（可以疊好幾個），再點一次就拿掉。</p>
          <div className="deco-grid" data-testid="deco-grid">
            {DECORATION_KINDS.map((k) => {
              const on = !!card.decorations?.some((d) => d.kind === k.kind);
              return (
                <button
                  key={k.kind}
                  className={`deco-cell${on ? ' active' : ''}`}
                  aria-pressed={on}
                  aria-label={`裝飾 ${k.label}`}
                  data-kind={k.kind}
                  onClick={() =>
                    edit((c) => {
                      const list = c.decorations ?? [];
                      const i = list.findIndex((d) => d.kind === k.kind);
                      if (i >= 0) list.splice(i, 1);
                      else list.push({ kind: k.kind, color: k.color, width: k.width });
                      if (list.length) c.decorations = list;
                      else delete c.decorations;
                    })
                  }
                >
                  <DecoThumb kind={k.kind} />
                  <span>{k.label}</span>
                </button>
              );
            })}
          </div>
          {(card.decorations ?? []).map((d, i) => {
            const def = DECORATION_KINDS.find((k) => k.kind === d.kind)!;
            return (
              <div key={d.kind} className="deco-row" data-testid="deco-row">
                <div className="panel-head">
                  <span>{def.label}</span>
                  <button
                    className="chip sm"
                    aria-label={`移除 ${def.label}`}
                    onClick={() =>
                      edit((c) => {
                        c.decorations!.splice(i, 1);
                        if (!c.decorations!.length) delete c.decorations;
                      })
                    }
                  >
                    移除
                  </button>
                </div>
                <Swatches
                  colors={[def.color, ...COLORS.filter((c) => c !== def.color)]}
                  value={d.color}
                  label={`${def.label}顏色`}
                  onPick={(col) => edit((c) => void (c.decorations![i]!.color = col))}
                />
                {d.kind !== 'marker' && d.kind !== 'sparkles' && d.kind !== 'hearts' && (
                  <Slider
                    label={`${def.label}粗細`}
                    value={Math.round(d.width * 100)}
                    min={3}
                    max={25}
                    step={1}
                    format={(v) => `${v}%`}
                    onChange={(v) => edit((c) => void (c.decorations![i]!.width = v / 100), `deco${i}`)}
                  />
                )}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
