import { useEffect, useRef, useState } from 'react';
import { MIN_CLIP_DURATION } from '../../model/defaults';
import type { Asset, Track, VideoItem } from '../../model/types';
import { mergeRanges, setTrimWindowFree, type Range } from '../../engine/timeline';
import { applyRanges } from '../../store/actions';
import { setTrackItems, useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { RangePicker, type RangeHint } from './RangePicker';

// 修剪面板：整段素材攤開，**上方**用小旗標標出要留下來的範圍（不用兩側拉霸）；可以標很多段，
// 沒選到的灰掉；拖旗標時旁邊的小畫面顯示那一秒整個專案的樣子。
// 只有一段時直接改片段（即時看得到）；多段時按「完成」才把片段拆成好幾個（每段留在原本的時間位置，不要的變空位）。

const fmt = (n: number) => n.toFixed(1);

export function TrimPanel({
  item,
  asset,
  track,
  onClose,
}: {
  item: VideoItem;
  asset: Asset;
  track: Track;
  onClose: () => void;
}) {
  const player = useUI((s) => s.player);
  const project = useProjectStore((s) => s.project)!;
  const dur = Math.max(asset.duration, 0.1);
  const minSrc = MIN_CLIP_DURATION * item.speed;
  const [ranges, setRanges] = useState<Range[]>([[item.trimIn, item.trimIn + item.duration * item.speed]]);
  const [sel, setSel] = useState(0);
  const [sig, setSig] = useState(0);
  const startRef = useRef(item.start);

  // 離開面板：還原預覽用的暫時修改
  useEffect(
    () => () => {
      useUI.getState().player?.setPreviewPatch(null);
    },
    [],
  );

  /** 預覽停在某一段的起點或終點（多段時，片段本身還沒改，先用暫時修改讓預覽顯示那一段） */
  const showAt = (r: Range, edge: 'start' | 'end' | 'move', multi: boolean) => {
    if (!player) return;
    const len = (r[1] - r[0]) / item.speed;
    if (multi)
      player.setPreviewPatch({
        itemId: item.id,
        apply: (it) => ({ ...it, start: startRef.current, trimIn: r[0], duration: len }),
      });
    else player.setPreviewPatch(null);
    const t = multi
      ? startRef.current
      : (project.tracks.flatMap((x) => x.items).find((x) => x.id === item.id)?.start ?? 0);
    player.peek(edge === 'end' ? t + len - 0.05 : t + 0.02);
    setSig((n) => n + 1);
  };

  const change = (next: Range[], hint: RangeHint, final = true) => {
    setRanges(next);
    player?.pause();
    if (!final) return; // 拖旗標中：只動旗標；放開才更新片段與預覽（不然手機上每一下都 seek 影片，會跳格）
    if (next.length === 1) {
      const next1 = setTrimWindowFree(track.items, item.id, next[0]![0], next[0]![1], asset);
      setTrackItems(track.id, next1, { coalesce: `trim:${item.id}` });
      const cur = next1.find((x) => x.id === item.id)!;
      player?.setPreviewPatch(null);
      player?.peek(hint.edge === 'end' ? cur.start + cur.duration - 0.05 : cur.start);
      setSig((n) => n + 1);
    } else showAt(next[hint.index]!, hint.edge, true);
  };

  const step = (which: 'start' | 'end', delta: number) => {
    const r = ranges[sel]!;
    const prevEnd = sel > 0 ? ranges[sel - 1]![1] : 0;
    const nextStart = sel < ranges.length - 1 ? ranges[sel + 1]![0] : dur;
    const nr: Range =
      which === 'start'
        ? [Math.min(Math.max(r[0] + delta, prevEnd), r[1] - minSrc), r[1]]
        : [r[0], Math.min(Math.max(r[1] + delta, r[0] + minSrc), nextStart)];
    change(
      ranges.map((x, k): Range => (k === sel ? nr : x)),
      { index: sel, edge: which },
    );
    player?.refresh();
  };

  const addRange = () => {
    // 最大的空檔正中間放 1 秒（空檔太小就放不下）
    const gaps: Range[] = [];
    let at = 0;
    for (const [a, b] of ranges) {
      if (a - at >= minSrc) gaps.push([at, a]);
      at = b;
    }
    if (dur - at >= minSrc) gaps.push([at, dur]);
    if (gaps.length === 0) return toast('沒有空的地方可以再加一段了');
    const [ga, gb] = gaps.reduce((best, g) => (g[1] - g[0] > best[1] - best[0] ? g : best));
    const len = Math.min(1, gb - ga);
    const mid = (ga + gb) / 2;
    const next = mergeRanges([...ranges, [mid - len / 2, mid + len / 2]], dur, minSrc);
    setRanges(next);
    const k = next.findIndex((r) => r[0] <= mid && mid <= r[1]);
    setSel(k);
    showAt(next[k]!, 'start', true);
  };

  const removeRange = () => {
    if (ranges.length <= 1) return;
    const next = ranges.filter((_, k) => k !== sel);
    setRanges(next);
    setSel(Math.min(sel, next.length - 1));
    if (next.length === 1) change(next, { index: 0, edge: 'start' });
    else showAt(next[Math.min(sel, next.length - 1)]!, 'start', true);
  };

  /** 只播目前選的這一段（播到終點自動停） */
  const playRange = () => {
    if (!player) return;
    const r0 = ranges[sel]!;
    const len = (r0[1] - r0[0]) / item.speed;
    let t0: number;
    if (ranges.length > 1) {
      // 多段：片段本身還沒拆，先用暫時修改讓預覽顯示這一段
      showAt(r0, 'start', true);
      t0 = startRef.current;
    } else {
      t0 = project.tracks.flatMap((x) => x.items).find((x) => x.id === item.id)?.start ?? item.start;
    }
    player.pause();
    player.seek(t0);
    player.play();
    const unsub = player.subscribe((t, playing) => {
      if (t >= t0 + len - 0.03 || !playing) {
        unsub();
        if (playing) player.pause();
      }
    });
  };

  const done = () => {
    if (ranges.length > 1) {
      const id = applyRanges(item.id, ranges);
      if (id) toast(`已拆成 ${ranges.length} 段，中間不要的地方留成空位`);
    }
    player?.setPreviewPatch(null);
    player?.refresh();
    onClose();
  };

  const r = ranges[sel]!;
  const total = ranges.reduce((n, x) => n + (x[1] - x[0]), 0) / item.speed;
  return (
    <div className="panel trim-panel" role="group" aria-label="修剪" data-testid="trim-panel">
      <RangePicker
        asset={asset}
        ranges={ranges}
        sel={sel}
        onSelect={setSel}
        onChange={change}
        minSrc={minSrc}
        previewSignal={sig}
        aspect={project.width / project.height}
      />
      <p className="trim-info" data-testid="trim-info">
        {ranges.length > 1 ? `第 ${sel + 1} 段：` : ''}第 {fmt(r[0])} 秒 → 第 {fmt(r[1])} 秒，留{' '}
        <b>{fmt((r[1] - r[0]) / item.speed)} 秒</b> / 素材共 {fmt(dur)} 秒
        {ranges.length > 1 && `（共 ${ranges.length} 段，合計 ${fmt(total)} 秒）`}
      </p>
      <div className="chips trim-steps">
        <button className="chip" onClick={() => step('start', -1)}>
          前面多 1 秒
        </button>
        <button className="chip" onClick={() => step('start', 1)}>
          前面少 1 秒
        </button>
        <button className="chip" onClick={() => step('end', 1)}>
          後面多 1 秒
        </button>
        <button className="chip" onClick={() => step('end', -1)}>
          後面少 1 秒
        </button>
      </div>
      <div className="range-actions">
        <button className="btn" data-testid="range-play" onClick={playRange}>
          ▶ 播放這一段
        </button>
        <button className="btn" data-testid="range-add" onClick={addRange}>
          ＋ 再加一段
        </button>
        {ranges.length > 1 && (
          <button className="btn" data-testid="range-remove" onClick={removeRange}>
            刪除這一段
          </button>
        )}
      </div>
      <button className="btn done" onClick={done}>
        完成
      </button>
    </div>
  );
}
