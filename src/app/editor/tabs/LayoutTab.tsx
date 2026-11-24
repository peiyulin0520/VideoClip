import { useEffect, useRef, useState } from 'react';
import { GRID_MAX, LINE_MAX, buildIn, cellGap, defOf, hasFrameLine } from '../../../engine/layouts';
import { Slider } from '../../../ui/Slider';
import type { Project, VideoItem } from '../../../model/types';
import { useUI } from '../../../store/uiStore';
import { ConfirmSheet } from '../../../ui/Sheet';
import { arrangeGroup, editItem, setGapMode } from '../../../store/actions';
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

/** 各格：版型示意圖，點一格選到那一格並開「這一格」視窗（換素材、調那一格的大小） */
function CellsBlock({ project, group }: { project: Project; group: string }) {
  const selectedId = useProjectStore((s) => s.selectedId);
  const select = useProjectStore((s) => s.select);
  const [cell, setCell] = useState<{ id: string; index: number } | null>(null);
  return (
    <>
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
      {cell && <CellSheet key={cell.id} trackId={cell.id} index={cell.index} onClose={() => setCell(null)} />}
    </>
  );
}

/** 外框：顏色、透明度、拿掉外圍描邊、格子框線粗細 */
function FrameBlock({ project, group, frame }: { project: Project; group: string; frame: VideoItem }) {
  if (!frame.frameStyle) return null;
  return (
    <div data-testid="layout-frame">
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
        <LineSlider key={`${frame.frameStyle.line ?? 1}`} group={group} line={frame.frameStyle.line ?? 1} />
      )}
      {cellGap(
        buildIn(defOf(frame.frameStyle), project.width, project.height, frame.frameStyle.box).windows,
      ) !== undefined && (
        <LineSlider
          key={`gap-${frame.frameStyle.gap ?? frame.frameStyle.line ?? 1}`}
          group={group}
          line={frame.frameStyle.gap ?? frame.frameStyle.line ?? 1}
          only="gap"
        />
      )}
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
function LineSlider({ group, line, only }: { group: string; line: number; only?: 'gap' }) {
  const [v, setV] = useState(Math.round(line * 100));
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <Slider
      label={only === 'gap' ? '分隔線粗細' : '格子框線粗細'}
      value={v}
      min={0}
      max={LINE_MAX * 100}
      step={10}
      format={(n) => `${n}%`}
      onChange={(n) => {
        setV(n);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(
          () =>
            void reshapeLayout(
              group,
              // 整體粗細：分隔線跟著一起變（清掉單獨設的分隔線粗細）；分隔線粗細：只動格子之間
              only === 'gap' ? { gap: n / 100 } : { line: n / 100, gap: undefined },
            ),
          400,
        );
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
      <div className="size-group">
        <div className="size-label">
          <span>整個版型</span>
          <span className="size-now" data-testid="layout-size-now">
            {Math.round(box.w * 100)}% × {Math.round(box.h * 100)}%
          </span>
        </div>
        <div className="size-row">
          <button
            className="btn"
            data-testid="layout-resize"
            onClick={() => {
              player?.pause();
              useUI.setState({ layoutEdit: { group, sx: 1, sy: 1 } });
            }}
          >
            調整整體大小
          </button>
          <button
            className="btn"
            data-testid="layout-size-reset"
            disabled={full}
            onClick={() => void reshapeLayout(group, { box: { w: 1, h: 1 } })}
          >
            重置
          </button>
        </div>
      </div>
      <div className="size-group">
        <div className="size-label">
          <span>各格</span>
        </div>
        <div className="size-row">
          <button
            className="btn"
            data-testid="layout-cell-resize"
            onClick={() => {
              player?.pause();
              const b = buildIn(
                defOf(style),
                project.width,
                project.height,
                style.box,
                style.line,
                style.cells,
                style.gap,
              );
              useUI.setState({
                cellEdit: {
                  group,
                  cells: b.windows.map((w) => ({
                    x: w.x / project.width,
                    y: w.y / project.height,
                    w: w.w / project.width,
                    h: w.h / project.height,
                  })),
                },
              });
            }}
          >
            調整各格大小
          </button>
          <button
            className="btn"
            data-testid="layout-cell-reset"
            disabled={!style.cells}
            onClick={() => void reshapeLayout(group, { cells: undefined })}
          >
            重置
          </button>
        </div>
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

export type LayoutPart = 'add' | 'frame' | 'size' | 'cells' | 'play';

/** 版型工具列每一項的視窗：〔版型〕挑版型加進專案；〔外框〕〔大小〕〔各格〕〔播放方式〕調選到的版型 */
export function LayoutTab({ found, part }: { found: Found; part: LayoutPart }) {
  const project = useProjectStore((s) => s.project)!;
  if (part === 'add')
    return (
      <div className="panel">
        <LayoutPicker />
      </div>
    );
  const group = found && found.item.type !== 'audio' ? found.item.group : undefined;
  const frame = group ? frameOfGroup(project.tracks, group)?.item : undefined;
  if (!group || !frame)
    return (
      <div className="panel group-panel" data-testid="group-panel">
        <p className="hint">先點選一個版型</p>
      </div>
    );
  return (
    <div className="panel group-panel" data-testid="group-panel">
      {part === 'cells' && <CellsBlock project={project} group={group} />}
      {part === 'play' && <PlayControls frame={frame} />}
      {part === 'frame' && <FrameBlock project={project} group={group} frame={frame} />}
      {part === 'size' && frame.frameStyle && <ShapeControls project={project} group={group} frame={frame} />}
    </div>
  );
}
