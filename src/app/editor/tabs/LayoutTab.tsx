import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Project, VideoItem } from '../../../model/types';
import { removeGroup, setGroupDuration, setGroupMotion, setItemEffect } from '../../../store/actions';
import { FrameStyleControls } from '../FrameStyleControls';
import { restyleFrame } from '../frameRestyle';
import { GroupFxSelect } from '../GroupFxSelect';
import { useProjectStore } from '../../../store/projectStore';
import { CellSheet } from '../CellSheet';
import { LayoutDiagram } from '../LayoutDiagram';
import { LayoutPicker } from '../LayoutPicker';
import { ToolButton, type Found } from './shared';

const MOTIONS = [
  { id: undefined, name: '不動' },
  { id: 'drift', name: '捲動' },
  { id: 'slide', name: '滑入滑出' },
] as const;

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

/** 一個版型的整體設定：整組長度、動畫、每一格要用的片段與湊秒數的色塊 */
function GroupPanel({ project, group }: { project: Project; group: string }) {
  const selectedId = useProjectStore((s) => s.selectedId);
  const select = useProjectStore((s) => s.select);
  const [cell, setCell] = useState<{ id: string; index: number } | null>(null);
  const frameTrack = project.tracks.find((t) => t.group === group && t.groupRole === 'frame');
  const frame = frameTrack?.items[0] as VideoItem | undefined;
  if (!frame) return null;
  const dur = (n: number) => setGroupDuration(group, Math.max(frame.duration + n, 1));
  return (
    <div className="panel group-panel" data-testid="group-panel">
      <div className="panel-head">
        <span>整個版型 · {frame.label ?? frameTrack?.name}</span>
      </div>
      <p className="hint">
        在預覽上拖移、縮放整個版型（格子會一起動）。點下面示意圖的格子，可以改那一格的名稱、素材、片段、空白畫面。
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
      <div className="group-fx-row">
        <GroupFxSelect
          label="版型進場特效"
          value={frame.inEffect?.kind && frame.inEffect.kind !== 'typewriter' ? frame.inEffect.kind : ''}
          onChange={(v) => setItemEffect(frame.id, 'in', v || null)}
        />
        <GroupFxSelect
          label="版型出場特效"
          value={frame.outEffect?.kind && frame.outEffect.kind !== 'typewriter' ? frame.outEffect.kind : ''}
          onChange={(v) => setItemEffect(frame.id, 'out', v || null)}
        />
      </div>
      <div className="chips" role="radiogroup" aria-label="版型動畫">
        {MOTIONS.map((m) => (
          <button
            key={m.name}
            role="radio"
            aria-checked={frame.motion === m.id}
            aria-label={`動畫 ${m.name}`}
            className={`chip${frame.motion === m.id ? ' active' : ''}`}
            onClick={() => setGroupMotion(group, m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>
      <div className="chips" aria-label="版型長度">
        <button className="chip" aria-label="版型 少 1 秒" onClick={() => dur(-1)}>
          － 1 秒
        </button>
        <span className="chip-static" data-testid="group-duration">
          共 {frame.duration.toFixed(1)} 秒
        </span>
        <button className="chip" aria-label="版型 多 1 秒" onClick={() => dur(1)}>
          ＋ 1 秒
        </button>
      </div>
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
