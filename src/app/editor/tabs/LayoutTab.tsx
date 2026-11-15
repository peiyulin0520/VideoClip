import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GRID_MAX, LINE_MAX, buildIn, cellGap, defOf } from '../../../engine/layouts';
import { Slider } from '../../../ui/Slider';
import type { Project, VideoItem } from '../../../model/types';
import { useUI } from '../../../store/uiStore';
import { ConfirmSheet } from '../../../ui/Sheet';
import { removeGroup } from '../../../store/actions';
import { FrameStyleControls } from '../FrameStyleControls';
import { reshapeLayout, restyleFrame } from '../frameRestyle';
import { useProjectStore } from '../../../store/projectStore';
import { cellTracksOf, frameOfGroup } from '../../../engine/layoutTracks';
import { CellSheet } from '../CellSheet';
import { LayoutDiagram } from '../LayoutDiagram';
import { LayoutPicker } from '../LayoutPicker';
import { ToolButton, type Found } from './shared';

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
      <p className="hint">
        在預覽上拖移、縮放整個版型（格子會一起動）。點下面示意圖的格子，可以改那一格的名稱、素材、片段、空白畫面。進場、出場、動畫、轉場到「特效」分頁；長度在播放軸拖尾端。
      </p>
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
      {frame.frameStyle && (
        <FrameStyleEditor
          key={frame.frameStyle.opacity}
          group={group}
          color={frame.frameStyle.color}
          opacity={frame.frameStyle.opacity}
        />
      )}
      {frame.frameStyle && <ShapeControls project={project} group={group} frame={frame} />}
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
      label="格子之間的框線粗細"
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
  const cells = cellTracksOf(project.tracks, group);
  const [ask, setAsk] = useState<{ rows: number; cols: number; lost: number } | null>(null);
  const player = useUI((s) => s.player);
  const rows = style.rows ?? 2;
  const cols = style.cols ?? 2;
  const setGrid = (r: number, c: number) => {
    const lost = cells.slice(r * c).filter((t) => t.items.length > 0).length;
    if (lost > 0) setAsk({ rows: r, cols: c, lost });
    else void reshapeLayout(group, { rows: r, cols: c });
  };
  const box = style.box ?? { w: 1, h: 1 };
  // 格子之間的框線粗細：只有一格的版型（拍立得）沒有格子間框線
  const hasGap =
    cellGap(buildIn(defOf(style), project.width, project.height, style.box).windows) !== undefined;
  return (
    <div className="zone-soft" data-testid="layout-shape">
      <div className="slider-label">版型的大小與格數</div>
      <button
        className="btn"
        data-testid="layout-resize"
        onClick={() => {
          player?.pause();
          useUI.setState({ layoutEdit: { group, sx: 1, sy: 1 } });
        }}
      >
        調整版型大小（在預覽上拖邊，現在 {Math.round(box.w * 100)}% × {Math.round(box.h * 100)}%）
      </button>
      {hasGap && <LineSlider key={`${style.line ?? 1}`} group={group} line={style.line ?? 1} />}
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
        <div className="toolbar" role="toolbar" aria-label="版型工具">
          <ToolButton icon={Trash2} label="移除版型" onClick={() => removeGroup(group)} />
        </div>
      )}
      {group && <GroupPanel project={project} group={group} />}
      {group && !adding ? (
        <button className="btn" data-testid="layout-add-more" onClick={() => setAddingFor(group)}>
          ＋ 再新增一個版型
        </button>
      ) : (
        <div className="panel">
          <LayoutPicker />
        </div>
      )}
    </>
  );
}
