import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GRID_MAX, LINE_MAX, buildIn, defOf, hasFrameLine } from '../../../engine/layouts';
import { Slider } from '../../../ui/Slider';
import type { Project, VideoItem } from '../../../model/types';
import { useUI } from '../../../store/uiStore';
import { ConfirmSheet } from '../../../ui/Sheet';
import { arrangeGroup, editItem, removeGroup, setGapMode } from '../../../store/actions';
import { FrameStyleControls } from '../FrameStyleControls';
import { reshapeLayout, restyleFrame } from '../frameRestyle';
import { useProjectStore } from '../../../store/projectStore';
import { cellsOf, frameOfGroup } from '../../../engine/layoutTracks';
import { CellSheet } from '../CellSheet';
import { LayoutDiagram } from '../LayoutDiagram';
import { LayoutPicker } from '../LayoutPicker';
import type { Found } from './shared';

/** 外框顏色、透明度：換顏色立刻重畫；透明度滑桿停下來 0.4 秒才重畫（每次重畫都是一張新的外框圖） */
function FrameStyleEditor({ group, color, opacity }: { group: string; color: string; opacity: number }) {
  const [op, setOp] = useState(opacity);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <FrameStyleControls
      color={color}
      opacity={op}
      onColor={(c) => void restyleFrame(group, { color: c })}
      onOpacity={(v) => {
        setOp(v);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void restyleFrame(group, { opacity: v }), 400);
      }}
    />
  );
}

/** 一個版型自己才有的設定：示意圖（點格子改那一格）、外框顏色與透明度。特效、動畫、轉場在「特效」分頁；長度在播放軸 */
function GroupPanel({ project, group }: { project: Project; group: string }) {
  const selectedId = useProjectStore((s) => s.selectedId);
  const select = useProjectStore((s) => s.select);
  const [cell, setCell] = useState<{ id: string; index: number } | null>(null);
  const frame = frameOfGroup(project.tracks, group)?.item;
  if (!frame) return null;
  return (
    <div className="panel group-panel" data-testid="group-panel">
      <div className="panel-head">
        <span>整個版型 · {frame.label}</span>
      </div>
      <p className="hint">點示意圖的格子可以改那一格。進出場、轉場在「特效」分頁；長度在播放軸。</p>
      <LayoutDiagram
        project={project}
        group={group}
        selectedId={selectedId}
        onPick={(id, i) => {
          const it = project.tracks.find((t) => t.id === id)?.items[0];
          if (it) select(it.id);
          setCell({ id, index: i });
        }}
      />
      <PlayControls frame={frame} />
      {cell && <CellSheet key={cell.id} trackId={cell.id} index={cell.index} onClose={() => setCell(null)} />}
      {frame.frameStyle && (
        <div className="zone-soft" data-testid="layout-frame">
          <div className="zone-title">外框</div>
          <FrameStyleEditor
            key={frame.frameStyle.opacity}
            group={group}
            color={frame.frameStyle.color}
            opacity={frame.frameStyle.opacity}
          />
          {frame.outline && (
            <button
              className="btn"
              data-testid="frame-outline-off"
              onClick={() =>
                editItem(frame.id, (x) => {
                  delete x.outline;
                })
              }
            >
              拿掉外圍描邊
            </button>
          )}
          {hasFrameLine(
            buildIn(defOf(frame.frameStyle), project.width, project.height, frame.frameStyle.box),
          ) && (
            <LineSlider
              key={`${frame.frameStyle.line ?? 1}`}
              group={group}
              line={frame.frameStyle.line ?? 1}
            />
          )}
        </div>
      )}
      {frame.frameStyle && <ShapeControls project={project} group={group} frame={frame} />}
    </div>
  );
}

/** 版型才有的兩個設定：播放方式（同步／依序）、空檔（停格／色塊／透明）。立刻生效、可以復原 */
function PlayControls({ frame }: { frame: VideoItem }) {
  const group = frame.group!;
  const play = frame.layoutPlay ?? 'sync';
  const gap = frame.gapMode ?? 'fill';
  return (
    <div className="zone-soft" data-testid="layout-play">
      <div className="zone-title">播放</div>
      <div className="slider-label">播放方式</div>
      <div className="chips" role="radiogroup" aria-label="播放方式">
        {(
          [
            ['sync', '同步'],
            ['seq', '依序'],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            className={`chip${play === id ? ' active' : ''}`}
            role="radio"
            aria-checked={play === id}
            aria-label={`播放方式 ${name}`}
            onClick={() => play !== id && arrangeGroup(group, id)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="slider-label">空檔</div>
      <div className="chips" role="radiogroup" aria-label="空檔">
        {(
          [
            ['hold', '停格'],
            ['fill', '色塊'],
            ['none', '透明'],
          ] as const
        ).map(([id, name]) => (
          <button
            key={id}
            className={`chip${gap === id ? ' active' : ''}`}
            role="radio"
            aria-checked={gap === id}
            aria-label={`空檔 ${name}`}
            onClick={() => gap !== id && setGapMode(group, id)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 格子之間框線的粗細：0%（沒有框線）～300%；停下來 0.4 秒才重畫外框（每次重畫都是一張新的外框圖） */
function LineSlider({ group, line }: { group: string; line: number }) {
  const [v, setV] = useState(Math.round(line * 100));
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Slider
      label="格子框線粗細"
      value={v}
      min={0}
      max={LINE_MAX * 100}
      step={10}
      format={(n) => `${n}%`}
      onChange={(n) => {
        setV(n);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void reshapeLayout(group, { line: n / 100 }), 400);
      }}
    />
  );
}

/** 版型的大小（預覽上拖邊）與自訂格數的列、欄（加減）。舊版型（沒有記錄用哪個版型）沒有 */
function ShapeControls({ project, group, frame }: { project: Project; group: string; frame: VideoItem }) {
  const style = frame.frameStyle!;
  const cells = cellsOf(project.tracks, group);
  const [ask, setAsk] = useState<{ rows: number; cols: number; lost: number } | null>(null);
  const player = useUI((s) => s.player);
  const rows = style.rows ?? 2;
  const cols = style.cols ?? 2;
  const setGrid = (r: number, c: number) => {
    const lost = cells.slice(r * c).filter((c2) => c2.tracks.some((t) => t.items.length > 0)).length;
    if (lost > 0) setAsk({ rows: r, cols: c, lost });
    else void reshapeLayout(group, { rows: r, cols: c });
  };
  const box = style.box ?? { w: 1, h: 1 };
  const full = box.w >= 0.999 && box.h >= 0.999;
  return (
    <div className="zone-soft" data-testid="layout-shape">
      <div className="zone-title">大小與格數</div>
      <div className="size-row">
        <button
          className="btn"
          data-testid="layout-resize"
          onClick={() => {
            player?.pause();
            useUI.setState({ layoutEdit: { group, sx: 1, sy: 1 } });
          }}
        >
          拖邊調整大小
        </button>
        <span className="size-now" data-testid="layout-size-now">
          {Math.round(box.w * 100)}% × {Math.round(box.h * 100)}%
        </span>
        <button
          className="btn"
          data-testid="layout-size-reset"
          disabled={full}
          onClick={() => void reshapeLayout(group, { box: { w: 1, h: 1 } })}
        >
          重置大小
        </button>
      </div>
      {style.layout === 'grid' && (
        <div className="grid-steppers" data-testid="shape-steppers">
          {(
            [
              ['rows', '列數', rows],
              ['cols', '欄數', cols],
            ] as const
          ).map(([key, name, val]) => (
            <div className="stepper" key={key} role="group" aria-label={`這個版型的${name}`}>
              <span>{name}</span>
              <button
                className="chip"
                aria-label={`這個版型的${name} 減 1`}
                disabled={val <= 1}
                onClick={() => setGrid(key === 'rows' ? rows - 1 : rows, key === 'cols' ? cols - 1 : cols)}
              >
                －
              </button>
              <b data-testid={`shape-${key}`}>{val}</b>
              <button
                className="chip"
                aria-label={`這個版型的${name} 加 1`}
                disabled={val >= GRID_MAX}
                onClick={() => setGrid(key === 'rows' ? rows + 1 : rows, key === 'cols' ? cols + 1 : cols)}
              >
                ＋
              </button>
            </div>
          ))}
        </div>
      )}
      <ConfirmSheet
        open={!!ask}
        title="格數變少"
        message={`多出來的格子會拿掉，裡面的 ${ask?.lost ?? 0} 個素材也會一起拿掉。要繼續嗎？`}
        confirmText="拿掉，改格數"
        onConfirm={() => ask && void reshapeLayout(group, { rows: ask.rows, cols: ask.cols })}
        onClose={() => setAsk(null)}
      />
    </div>
  );
}

/** 版型分頁：多格版型（拍貼機、膠卷、拍立得…），之後的模板也放這裡 */
export function LayoutTab({ found }: { found: Found }) {
  const project = useProjectStore((s) => s.project)!;
  const group = found && found.item.type !== 'audio' ? found.item.group : undefined;
  // 選到版型時，「新增版型」收合成一顆鈕；展開只對當下這個版型有效（選到別的版型又收起來）
  const [addingFor, setAddingFor] = useState<string | undefined>(undefined);
  const adding = !!group && addingFor === group;
  return (
    <>
      {group && (
        <section className="this-layout" data-testid="zone-this-layout" aria-label="這個版型">
          <div className="this-layout-head">
            <b>這個版型</b>
            <button className="btn danger this-layout-remove" onClick={() => removeGroup(group)}>
              <Trash2 size={16} /> 移除版型
            </button>
          </div>
          <GroupPanel project={project} group={group} />
        </section>
      )}
      {group && <hr className="zone-line" aria-hidden="true" />}
      {group && !adding ? (
        <div className="zone-soft new-layout" data-testid="zone-new-layout">
          <button className="btn" data-testid="layout-add-more" onClick={() => setAddingFor(group)}>
            ＋ 再新增一個版型
          </button>
        </div>
      ) : (
        <div
          className={`panel${group ? ' new-layout' : ''}`}
          data-testid={group ? 'zone-new-layout' : undefined}
        >
          <LayoutPicker />
        </div>
      )}
    </>
  );
}
