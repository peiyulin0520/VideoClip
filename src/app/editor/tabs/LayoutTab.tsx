import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../../model/types';
import { removeGroup } from '../../../store/actions';
import { FrameStyleControls } from '../FrameStyleControls';
import { restyleFrame } from '../frameRestyle';
import { useProjectStore } from '../../../store/projectStore';
import { frameOfGroup } from '../../../engine/layoutTracks';
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
