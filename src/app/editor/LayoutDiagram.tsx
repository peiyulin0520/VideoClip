import { useEffect, useRef } from 'react';
import { itemTitle, thumbOf } from '../../engine/labels';
import { layoutById, paintFrame, type LayoutId } from '../../engine/layouts';
import type { Project } from '../../model/types';
import { cellMain } from '../../store/actions';

/**
 * 版型示意圖：用這個版型的外框（顏色、透明度跟實際一樣）＋每一格現在的素材縮圖畫出來。
 * 每一格是一個按鈕（aria-label「第 N 格 名稱」），點了開「這一格」視窗。
 */
export function LayoutDiagram({
  project,
  group,
  selectedId,
  onPick,
}: {
  project: Project;
  group: string;
  selectedId: string | null;
  onPick: (trackId: string, index: number) => void;
}) {
  const frameTrack = project.tracks.find((t) => t.group === group && t.groupRole === 'frame');
  const frame = frameTrack?.items[0];
  const style = frame && frame.type !== 'text' && frame.type !== 'audio' ? frame.frameStyle : undefined;
  const cells = project.tracks.filter((t) => t.group === group && t.groupRole === 'cell');
  const W = project.width;
  const H = project.height;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !style) return;
    const w = 160 * 2;
    c.width = w;
    c.height = Math.round((w * H) / W);
    const def = layoutById(style.layout as LayoutId);
    if (def) paintFrame(c.getContext('2d')!, def, c.width, c.height, style.color, undefined, style.opacity);
  }, [style?.layout, style?.color, style?.opacity, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="layout-diagram" data-testid="layout-diagram" style={{ aspectRatio: `${W} / ${H}` }}>
      {cells.map((t, i) => {
        const it = cellMain(t);
        if (!it?.cell) return null;
        const asset = project.assets.find((a) => a.id === it.assetId);
        const thumb = thumbOf(it, asset);
        const name = it.label?.trim() || `第 ${i + 1} 格`;
        return (
          <button
            key={t.id}
            className={`ld-cell${it.id === selectedId ? ' active' : ''}`}
            aria-label={`第 ${i + 1} 格 ${itemTitle(it, asset)}`}
            data-testid="ld-cell"
            style={{
              left: `${it.cell.x * 100}%`,
              top: `${it.cell.y * 100}%`,
              width: `${it.cell.w * 100}%`,
              height: `${it.cell.h * 100}%`,
              backgroundImage: thumb ? `url(${thumb})` : undefined,
            }}
            onClick={() => onPick(t.id, i)}
          >
            <small>{name}</small>
          </button>
        );
      })}
      {style && <canvas ref={ref} className="ld-frame" aria-hidden="true" />}
    </div>
  );
}
