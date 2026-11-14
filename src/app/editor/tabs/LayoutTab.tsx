import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Project, Track, VideoItem } from '../../../model/types';
import {
  removeGroup,
  setCellFill,
  setGroupDuration,
  setGroupMotion,
  setItemEffect,
} from '../../../store/actions';
import { FrameStyleControls } from '../FrameStyleControls';
import { restyleFrame } from '../frameRestyle';
import { GroupFxSelect } from '../GroupFxSelect';
import { useProjectStore } from '../../../store/projectStore';
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
  const select = useProjectStore((s) => s.select);
  const selectedId = useProjectStore((s) => s.selectedId);
  const frameTrack = project.tracks.find((t) => t.group === group && t.groupRole === 'frame');
  const frame = frameTrack?.items[0] as VideoItem | undefined;
  const cells = project.tracks.filter((t) => t.group === group && t.groupRole === 'cell');
  if (!frame) return null;
  const dur = (n: number) => setGroupDuration(group, Math.max(frame.duration + n, 1));
  return (
    <div className="panel group-panel" data-testid="group-panel">
      <div className="panel-head">
        <span>整個版型 · {frame.label ?? frameTrack?.name}</span>
      </div>
      <p className="hint">
        在預覽上拖移、縮放整個版型（格子會一起動）；再點一下格子，可以到「剪輯」選那一格要用的片段。
      </p>
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
      <ul className="cell-list">
        {cells.map((t, i) => (
          <CellRow key={t.id} track={t} index={i} selectedId={selectedId} onSelect={select} />
        ))}
      </ul>
      <p className="hint">格子的素材比版型短，剩下的秒數會顯示色塊（反黑或反白）。</p>
    </div>
  );
}

function CellRow({
  track,
  index,
  selectedId,
  onSelect,
}: {
  track: Track;
  index: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const first = track.items[0] as VideoItem | undefined;
  const active = !!first && track.items.some((x) => x.id === selectedId);
  return (
    <li className={`cell-row${active ? ' active' : ''}`} data-testid="cell-row">
      <button className="btn" aria-label={`選第 ${index + 1} 格`} onClick={() => first && onSelect(first.id)}>
        第 {index + 1} 格
      </button>
      <span className="grow">{track.items.length > 1 ? `${track.items.length} 段` : ''}</span>
      <div className="chips">
        {(['black', 'white'] as const).map((f) => (
          <button
            key={f}
            role="radio"
            aria-checked={track.fill === f}
            aria-label={`第 ${index + 1} 格 ${f === 'black' ? '反黑' : '反白'}`}
            className={`chip${track.fill === f ? ' active' : ''}`}
            onClick={() => setCellFill(track.id, f)}
          >
            {f === 'black' ? '反黑' : '反白'}
          </button>
        ))}
      </div>
    </li>
  );
}

/** 版型分頁：多格版型（拍貼機、膠卷、拍立得…），之後的模板也放這裡 */
export function LayoutTab({ found }: { found: Found }) {
  const project = useProjectStore((s) => s.project)!;
  const group = found && found.item.type !== 'audio' ? found.item.group : undefined;
  return (
    <>
      {group && (
        <div className="toolbar" role="toolbar" aria-label="版型工具">
          <ToolButton icon={Trash2} label="移除版型" onClick={() => removeGroup(group)} />
        </div>
      )}
      {group && <GroupPanel project={project} group={group} />}
      <div className="panel">
        <LayoutPicker />
      </div>
    </>
  );
}
