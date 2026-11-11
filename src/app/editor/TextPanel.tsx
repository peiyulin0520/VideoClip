import { useState } from 'react';
import type { BoxShape, CardBox, Stroke, TextItem } from '../../model/types';
import { editText } from '../../store/actions';
import { Slider } from '../../ui/Slider';
import { FontSelect } from '../fonts/FontSelect';

const COLORS = ['#ffffff', '#111111', '#ff4d8d', '#ffd23f', '#4dd0ff', '#7CFC6A', '#b388ff', '#ff7a45'];
const BOX_COLORS = ['#ff4d8d', '#ffffff', '#111111', '#ffd23f', '#4dd0ff', '#7CFC6A', '#b388ff', '#ff7a45'];
const SECTIONS = ['文字', '版面', '字塊', '描邊陰影'] as const;
type Section = (typeof SECTIONS)[number];
const SHAPES: { id: BoxShape | 'none'; label: string }[] = [
  { id: 'none', label: '無字塊' },
  { id: 'rect', label: '方形' },
  { id: 'roundRect', label: '圓角' },
  { id: 'pill', label: '膠囊' },
];
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

export function TextPanel({ item, onAdd }: { item: TextItem; onAdd: () => void }) {
  const [section, setSection] = useState<Section>('文字');
  const [linked, setLinked] = useState(false);
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
          <div className="chips" role="radiogroup" aria-label="字塊形狀">
            {SHAPES.map((s) => {
              const on = s.id === 'none' ? !box : box?.shape === s.id;
              return (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={on}
                  className={`chip${on ? ' active' : ''}`}
                  onClick={() =>
                    edit((c) => {
                      if (s.id === 'none') delete c.box;
                      else if (c.box) c.box.shape = s.id;
                      else c.box = { ...DEFAULT_BOX, padding: { ...DEFAULT_BOX.padding }, shape: s.id };
                    })
                  }
                >
                  {s.label}
                </button>
              );
            })}
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
              {box.shape === 'roundRect' && (
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
    </>
  );
}
