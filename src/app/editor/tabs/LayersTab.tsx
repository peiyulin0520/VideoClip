import { itemTitle } from '../../../engine/labels';
import { useEffect, useState } from 'react';
import type { Player } from '../../../engine/player';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Lock,
  MoreHorizontal,
  Type,
} from 'lucide-react';
import { BLEND_LABELS } from '../../../engine/geometry';
import { timeResolved } from '../../../engine/keyframes';
import { frameOfGroup, isFrameItem, rowsOfCell } from '../../../engine/layoutTracks';
import { findItem, isVideoItem, layersAt, trackUnits } from '../../../engine/timeline';
import type { Track, TrackKind } from '../../../model/types';
import {
  editItem,
  patchTrack,
  resetTransform,
  setTransform,
  moveTrackPast,
  moveTrackToEdge,
  swapCellRows,
} from '../../../store/actions';
import { useProjectStore } from '../../../store/projectStore';
import { toast, useUI } from '../../../store/uiStore';
import { Slider } from '../../../ui/Slider';
import { TransformControls } from '../TransformControls';
import { KeyframePanel } from './KeyframePanel';
import { BLENDS, COLORS } from './shared';

/**
 * 播放頭的時間（暫停＝每次移動都更新；播放中每 0.5 秒更新一次，免得整個面板一直重畫）。
 * 以前只在重畫時讀一次，播放頭移動後清單還是舊的那一秒（「這一秒沒有任何圖層」但其實有）。
 */
function usePlayerTime(player: Player | null): number {
  const [t, setT] = useState(player?.time ?? 0);
  useEffect(() => {
    if (!player) return;
    let last = 0;
    queueMicrotask(() => setT(player.time));
    return player.subscribe((time, playing) => {
      const now = performance.now();
      if (playing && now - last < 500) return;
      last = now;
      setT(time);
    });
  }, [player]);
  return t;
}

const KIND_TAG: Record<TrackKind, string> = { media: '影像', sticker: '貼圖', text: '字卡', audio: '音訊' };

export function LayersTab() {
  const project = useProjectStore((s) => s.project)!;
  const selectedId = useProjectStore((s) => s.selectedId);
  const player = useUI((s) => s.player);
  const t = usePlayerTime(player);
  // 目前這一秒有哪些圖層（最上層在最上面）
  const layers = layersAt(project, t, true).slice().reverse();
  const units = trackUnits(project.tracks);
  // 有定格（關鍵影格）的物件：滑桿顯示播放頭這個時間的樣子
  const [moreFor, setMoreFor] = useState<string | null>(null);
  // 版型預設收合成一列；點開才列出裡面的素材（要調版型裡的圖層順序時再展開）
  const [open, setOpen] = useState<Set<string>>(new Set());
  const found = findItem(timeResolved(project, t), selectedId);
  const it = found && found.item.type !== 'audio' ? found.item : undefined;

  // 連續屬於同一個版型的圖層併成一塊（版型預設收合成一列）
  const runs: { group?: string; idxs: number[] }[] = [];
  layers.forEach(({ item, track }, idx) => {
    const g = track.group ?? (item.type !== 'audio' ? item.group : undefined); // 外框那一列的軌道本身沒有 group，看素材
    const last = runs[runs.length - 1];
    if (g && last?.group === g) last.idxs.push(idx);
    else runs.push({ group: g, idxs: [idx] });
  });
  const unitOf = (i: number) => units.findIndex((u) => u.lo <= i && i <= u.hi);
  // ▲▼：跟「這一秒」上面／下面最近的、不屬於同一塊的圖層換（旁邊的軌道這一秒可能沒東西，按了會看不出變化）
  const neighbour = (track: Track, idx: number, dir: -1 | 1) => {
    const myUnit = unitOf(project.tracks.indexOf(track));
    for (let j = idx + dir; j >= 0 && j < layers.length; j += dir) {
      const o = layers[j]!.track;
      if (track.groupRole === 'member') {
        if (o.groupRole === 'member' && o.group === track.group) return o;
      } else if (unitOf(project.tracks.indexOf(o)) !== myUnit) return o;
    }
    return null;
  };
  const move = (track: Track, idx: number, dir: -1 | 1) => {
    if (track.groupRole === 'cell') {
      // 同一格裡的上下（有好幾列才換得動）
      if (!swapCellRows(track.id, dir))
        toast(
          rowsOfCell(project.tracks, track).length < 2
            ? '這一格只有一層'
            : `已經是這一格最${dir === -1 ? '上' : '下'}面的一層`,
        );
      return;
    }
    const o = neighbour(track, idx, dir);
    if (!o || !moveTrackPast(track.id, o.id, dir === -1))
      toast(
        track.groupRole === 'member'
          ? `已經是版型裡最${dir === -1 ? '上' : '下'}面的圖層`
          : `已經是最${dir === -1 ? '上' : '下'}面的圖層`,
      );
  };
  /** 往上／往下／更多排序：每一列都在同樣的位置（格子列沒有「更多」，留空位對齊） */
  const moveButtons = (track: Track, idx: number) => (
    <div className="btn-zone">
      <button
        className="icon-btn sm"
        aria-label={`${track.name} 往上一層`}
        onClick={() => move(track, idx, -1)}
      >
        <ArrowUp size={18} />
      </button>
      <button
        className="icon-btn sm"
        aria-label={`${track.name} 往下一層`}
        onClick={() => move(track, idx, 1)}
      >
        <ArrowDown size={18} />
      </button>
      {track.groupRole === 'cell' ? (
        <span className="layer-spacer-btn" aria-hidden="true" />
      ) : (
        <button
          className="icon-btn sm"
          aria-label={`${track.name} 更多排序`}
          aria-expanded={moreFor === track.id}
          onClick={() => setMoreFor(moreFor === track.id ? null : track.id)}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
    </div>
  );
  const moreBar = (track: Track) => (
    <div className="layer-more" data-testid="layer-more">
      <button
        className="chip"
        aria-label={`${track.name} 移到最上層`}
        onClick={() => {
          if (!moveTrackToEdge(track.id, 'top')) toast('已經是最上面的圖層');
          setMoreFor(null);
        }}
      >
        移到最上層
      </button>
      <button
        className="chip"
        aria-label={`${track.name} 移到最下層`}
        onClick={() => {
          if (!moveTrackToEdge(track.id, 'bottom')) toast('已經是最下面的圖層');
          setMoreFor(null);
        }}
      >
        移到最下層
      </button>
    </div>
  );

  const renderRow = (idx: number) => {
    const { item, track } = layers[idx]!;
    const asset = isVideoItem(item) ? project.assets.find((a) => a.id === item.assetId) : undefined;
    const label = itemTitle(item, asset);
    const sub = !!track.groupRole;
    const gName = track.group ? (frameOfGroup(project.tracks, track.group)?.item.label ?? '版型') : '';
    const isFrame = isFrameItem(item as never) && !track.groupRole;
    return (
      <li
        key={item.id}
        className={`layer-row${item.id === selectedId ? ' selected' : ''}${sub ? ' sub' : ''}`}
        data-testid="layer-row"
        data-item-id={item.id}
        data-kind={track.kind}
        data-layer-no={layers.length - idx}
      >
        <button className="layer-name" onClick={() => useProjectStore.getState().select(item.id)}>
          <span className="layer-ico">
            {item.type === 'text' ? <Type size={16} /> : <Layers size={16} />}
          </span>
          <span className="layer-main">
            <span className="layer-text">
              {`${track.name} · `}
              {label}
            </span>
            <span className="layer-meta">
              <span className={`layer-kind k-${track.kind}`}>{KIND_TAG[track.kind]}</span>
              <span data-testid="layer-no">第 {layers.length - idx} 層</span>
              {sub && <span>版型 · {gName}</span>}
              {isFrame && <span>整個版型</span>}
            </span>
          </span>
        </button>
        <div className="layer-btns">
          <div className="btn-zone">
            <button
              className="icon-btn sm"
              aria-label={`${track.name} ${track.hidden ? '顯示' : '隱藏'}`}
              onClick={() => patchTrack(track.id, { hidden: !track.hidden })}
            >
              {track.hidden ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            <button
              className={`icon-btn sm${track.locked ? ' on' : ''}`}
              aria-label={`${track.name} ${track.locked ? '解鎖' : '鎖定'}`}
              onClick={() => patchTrack(track.id, { locked: !track.locked })}
            >
              <Lock size={18} />
            </button>
          </div>
          <span className="zone-sep" aria-hidden="true" />
          {moveButtons(track, idx)}
        </div>
        {moreFor === track.id && moreBar(track)}
      </li>
    );
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span>這一秒的圖層（上面的會蓋住下面的）</span>
      </div>
      <ul className="layer-list" data-testid="layer-list">
        {runs.map((run) => {
          if (!run.group) return renderRow(run.idxs[0]!);
          const group = run.group;
          const expanded = open.has(group);
          const frameIdx = run.idxs.find((i) => isFrameItem(layers[i]!.item as never));
          const frameTrack = frameIdx !== undefined ? layers[frameIdx]!.track : undefined;
          const hi = layers.length - run.idxs[0]!;
          const lo = layers.length - run.idxs[run.idxs.length - 1]!;
          const gName = frameOfGroup(project.tracks, group)?.item.label ?? '版型';
          const inside = run.idxs.some((i) => layers[i]!.item.id === selectedId);
          return (
            <li key={`g-${group}`} className="layer-group" data-testid="layer-group" data-open={expanded}>
              <div className={`layer-row layer-group-head${inside && !expanded ? ' selected' : ''}`}>
                <button
                  className="layer-name"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? '收合' : '展開'}版型 ${gName}`}
                  onClick={() =>
                    setOpen((prev) => {
                      const n = new Set(prev);
                      if (n.has(group)) n.delete(group);
                      else n.add(group);
                      return n;
                    })
                  }
                >
                  <span className="layer-ico">
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <span className="layer-main">
                    <span className="layer-text">版型 · {gName}</span>
                    <span className="layer-meta">
                      <span data-testid="layer-group-no">
                        {lo === hi ? `第 ${lo} 層` : `第 ${lo}–${hi} 層`}
                      </span>
                      <span>共 {run.idxs.length} 層</span>
                    </span>
                  </span>
                </button>
                <div className="layer-btns">
                  <div className="btn-zone layer-spacer" aria-hidden="true" />
                  {frameTrack && frameIdx !== undefined && !expanded && (
                    <>
                      <span className="zone-sep" aria-hidden="true" />
                      {moveButtons(frameTrack, frameIdx)}
                    </>
                  )}
                </div>
                {frameTrack && !expanded && moreFor === frameTrack.id && moreBar(frameTrack)}
              </div>
              {expanded && <ul className="layer-children">{run.idxs.map((i) => renderRow(i))}</ul>}
            </li>
          );
        })}
        {layers.length === 0 && <li className="hint">這一秒沒有任何圖層</li>}
      </ul>

      {it ? (
        <div className="props" data-testid="layer-props">
          <div className="panel-head">
            <span>選取的圖層</span>
          </div>
          <TransformControls item={it} />
          <KeyframePanel item={it} project={project} />
          {it.type === 'text' && <p className="hint">文字本身的透明度在「文字」分頁。</p>}
          <Slider
            label="整個圖層透明度"
            value={Math.round(it.transform.opacity * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={
              (v) => setTransform(it.id, { opacity: v / 100 }, `op:${it.id}`) // 版型＝整個版型一起變
            }
          />
          <div className="slider-label">混合模式</div>
          <div className="chips">
            {BLENDS.map((b) => (
              <button
                key={b}
                className={`chip${(it.blend ?? 'normal') === b ? ' active' : ''}`}
                onClick={() => editItem(it.id, (x) => void (x.blend = b))}
              >
                {BLEND_LABELS[b]}
              </button>
            ))}
          </div>
          {!isFrameItem(it) && (
            <>
              <Slider
                label="圓角"
                value={Math.round((it.cornerRadius ?? 0) * 100)}
                min={0}
                max={50}
                step={1}
                format={(v) => `${v}%`}
                onChange={(v) =>
                  editItem(it.id, (x) => void (x.cornerRadius = v / 100), { coalesce: `cr:${it.id}` })
                }
              />
              <Slider
                label="外框粗細"
                value={it.outline?.width ?? 0}
                min={0}
                max={40}
                step={1}
                format={(v) => `${v}`}
                onChange={(v) =>
                  editItem(
                    it.id,
                    (x) => void (x.outline = { color: x.outline?.color ?? '#ffffff', width: v }),
                    {
                      coalesce: `ow:${it.id}`,
                    },
                  )
                }
              />
              <div className="chips">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch${it.outline?.color === c ? ' active' : ''}`}
                    style={{ background: c }}
                    aria-label={`外框顏色 ${c}`}
                    onClick={() =>
                      editItem(it.id, (x) => void (x.outline = { width: x.outline?.width || 8, color: c }))
                    }
                  />
                ))}
              </div>
            </>
          )}
          <button className="btn" onClick={() => resetTransform(it.id)}>
            位置、大小、旋轉歸位
          </button>
        </div>
      ) : null}
    </div>
  );
}
