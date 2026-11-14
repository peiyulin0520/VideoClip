import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { itemTitle } from '../../engine/labels';
import { thumbStrip } from '../../engine/thumbs';
import { TRANSITION_AUDIO, transitionSpan, type TransitionAudioMode } from '../../engine/transitions';
import type { Item } from '../../model/types';
import { setTransitionAudio } from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';
import { Sheet } from '../../ui/Sheet';

// 轉場時的聲音：特效分頁「轉場」下面的一塊。六種：交叉淡化（預設）／直接切換／自訂起迄／只要前段／只要後段／靜音。
// 直接切換、自訂起迄要在「聲音軸」上拖標記（時間都是相對接縫的秒數）：前一段標聲音迄、後一段標聲音起，
// 所以可以等影片完全推進來、或停住之後才放那一段的聲音。

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const r2 = (n: number) => Math.round(n * 100) / 100;
const SIDE = 4; // 聲音軸：接縫兩邊最多各 4 秒

type Vals = { audioCut: number; audioOutA: number; audioInB: number };

export function TransitionAudioBlock({ item, prev }: { item: Item; prev: Item }) {
  const [open, setOpen] = useState(false);
  const tr = item.type === 'audio' ? undefined : item.transitionIn;
  const hasSound = item.type === 'video' || prev.type === 'video';
  if (!tr || !hasSound) return null;
  const mode = tr.audio ?? 'cross';
  const def = TRANSITION_AUDIO.find((m) => m.id === mode)!;
  return (
    <div className="tr-audio" data-testid="tr-audio">
      <div className="slider-label">轉場時的聲音</div>
      <div className="chips" role="radiogroup" aria-label="轉場時的聲音">
        {TRANSITION_AUDIO.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={mode === m.id}
            className={`chip${mode === m.id ? ' active' : ''}`}
            data-testid={`tr-audio-${m.id}`}
            onClick={() => {
              setTransitionAudio(item.id, { audio: m.id });
              if (m.id === 'cut' || m.id === 'custom') setOpen(true);
            }}
          >
            {m.name}
          </button>
        ))}
      </div>
      <p className="hint">{def.hint}</p>
      {(mode === 'cut' || mode === 'custom') && (
        <button className="btn" data-testid="tr-audio-edit" onClick={() => setOpen(true)}>
          調整聲音時間
        </button>
      )}
      {open && (mode === 'cut' || mode === 'custom') && (
        <TransitionAudioSheet item={item} prev={prev} mode={mode} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function TransitionAudioSheet({
  item,
  prev,
  mode,
  onClose,
}: {
  item: Item;
  prev: Item;
  mode: TransitionAudioMode;
  onClose: () => void;
}) {
  const project = useProjectStore((s) => s.project)!;
  const player = useUI((s) => s.player);
  const tr = item.type === 'audio' ? undefined : item.transitionIn!;
  const track = project.tracks.find((t) => t.items.some((x) => x.id === item.id));
  const span = track ? transitionSpan(track.items, item) : null;
  const before = span?.before ?? 0.5;
  const after = span?.after ?? 0.5;
  const ta = Math.min(prev.duration, SIDE);
  const tb = Math.min(item.duration, SIDE);
  const total = ta + tb;
  const initial: Vals = {
    audioCut: tr?.audioCut ?? 0,
    audioOutA: tr?.audioOutA ?? 0,
    audioInB: tr?.audioInB ?? 0,
  };
  const [v, setV] = useState<Vals>(initial);
  const [touched, setTouched] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const pos = (rel: number) => `${(clamp(rel + ta, 0, total) / total) * 100}%`;

  const stripOf = (it: Item, l0: number, l1: number, k: number): string[] => {
    if (it.type === 'text' || it.type === 'audio') return [];
    const a = project.assets.find((x) => x.id === it.assetId);
    if (!a) return [];
    if (it.type === 'image') return a.thumbs.slice(0, 1);
    return thumbStrip(a.thumbs, a.duration, it.trimIn + l0 * it.speed, it.trimIn + l1 * it.speed, k);
  };

  const limits: Record<keyof Vals, [number, number]> = {
    audioCut: [-ta, tb],
    audioOutA: [-ta, after],
    audioInB: [-before, tb],
  };
  const drag = (e: RPointerEvent, key: keyof Vals) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const width = stripRef.current!.getBoundingClientRect().width || 1;
    const start = v[key];
    const move = (ev: PointerEvent) => {
      const [lo, hi] = limits[key];
      setV((cur) => ({ ...cur, [key]: r2(clamp(start + ((ev.clientX - x0) / width) * total, lo, hi)) }));
      setTouched(true);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const write = () => setTransitionAudio(item.id, mode === 'cut' ? { audioCut: v.audioCut } : v);
  const restore = () => setTransitionAudio(item.id, initial);
  const cancel = () => {
    if (touched) restore();
    onClose();
  };
  const seam = item.start;
  /** 試聽：先套用目前的設定，從轉場開始前 0.6 秒播到結束後 0.6 秒 */
  const listen = () => {
    if (!player) return;
    write();
    player.pause();
    player.seek(Math.max(seam - before - 0.6, 0));
    player.play();
    window.setTimeout(() => player.pause(), (before + after + 1.2) * 1000);
  };

  const gapSec = mode === 'custom' ? Math.max(v.audioInB - v.audioOutA, 0) : 0; // 前段停到後段起之間沒聲音的秒數
  const summary =
    mode === 'cut'
      ? `前一段的聲音到「接縫${v.audioCut >= 0 ? '後' : '前'} ${Math.abs(v.audioCut).toFixed(2)} 秒」，之後直接換成後一段的聲音`
      : `前段聲音到接縫${v.audioOutA >= 0 ? '後' : '前'} ${Math.abs(v.audioOutA).toFixed(2)} 秒停、後段聲音從接縫${
          v.audioInB >= 0 ? '後' : '前'
        } ${Math.abs(v.audioInB).toFixed(2)} 秒開始${gapSec > 0.01 ? `，中間 ${gapSec.toFixed(2)} 秒沒有聲音` : v.audioInB < v.audioOutA - 0.01 ? '，中間兩段聲音重疊' : ''}`;

  return (
    <Sheet open title={mode === 'cut' ? '轉場聲音：直接切換' : '轉場聲音：自訂起迄'} onClose={cancel}>
      <div className="et-axis tr-audio-axis">
        <div className="rm-wrap">
          <div className="rm-flags">
            {mode === 'cut' ? (
              <button
                className="rm-flag"
                style={{ left: pos(v.audioCut) }}
                role="slider"
                aria-label="聲音切換點"
                aria-valuetext={`接縫${v.audioCut >= 0 ? '後' : '前'} ${Math.abs(v.audioCut).toFixed(2)} 秒`}
                data-testid="ta-flag-cut"
                onPointerDown={(e) => drag(e, 'audioCut')}
              >
                <i />
                <small>切</small>
              </button>
            ) : (
              <>
                <button
                  className="rm-flag out"
                  style={{ left: pos(v.audioOutA) }}
                  role="slider"
                  aria-label="前段聲音迄"
                  aria-valuetext={`接縫${v.audioOutA >= 0 ? '後' : '前'} ${Math.abs(v.audioOutA).toFixed(2)} 秒`}
                  data-testid="ta-flag-out"
                  onPointerDown={(e) => drag(e, 'audioOutA')}
                >
                  <i />
                  <small>前迄</small>
                </button>
                <button
                  className="rm-flag in"
                  style={{ left: pos(v.audioInB) }}
                  role="slider"
                  aria-label="後段聲音起"
                  aria-valuetext={`接縫${v.audioInB >= 0 ? '後' : '前'} ${Math.abs(v.audioInB).toFixed(2)} 秒`}
                  data-testid="ta-flag-in"
                  onPointerDown={(e) => drag(e, 'audioInB')}
                >
                  <i />
                  <small>後起</small>
                </button>
              </>
            )}
          </div>
          <div className="rm-strip" ref={stripRef} data-testid="ta-strip">
            <div className="rm-tiles" aria-hidden="true">
              <div className="et-half" style={{ flex: ta || 1 }}>
                {stripOf(prev, prev.duration - ta, prev.duration, 4).map((t, i) => (
                  <img key={i} src={t} alt="" draggable={false} />
                ))}
              </div>
              <div className="et-half" style={{ flex: tb || 1 }}>
                {stripOf(item, 0, tb, 4).map((t, i) => (
                  <img key={i} src={t} alt="" draggable={false} />
                ))}
              </div>
            </div>
            {/* 轉場的範圍（淡色）；接縫一條線；聲音有的地方亮、沒有的地方灰 */}
            <div
              className="rm-body"
              style={{ left: pos(-before), width: `${((before + after) / total) * 100}%` }}
            />
            <div className="et-seam" style={{ left: pos(0) }} />
            {mode === 'cut' ? (
              <>
                <div className="rm-gray" style={{ left: pos(v.audioCut), right: 0 }} data-side="a-off" />
              </>
            ) : (
              <>
                <div
                  className="rm-gray"
                  style={{
                    left: pos(v.audioOutA),
                    width: `${(Math.max(v.audioInB - v.audioOutA, 0) / total) * 100}%`,
                  }}
                />
              </>
            )}
          </div>
        </div>
        <div className="et-ab">
          <span>前段：{itemTitle(prev)}</span>
          <span>後段：{itemTitle(item)}</span>
        </div>
      </div>
      <p className="hint" data-testid="ta-summary">
        {summary}
      </p>
      <div className="sheet-row">
        <button className="btn" data-testid="ta-listen" onClick={listen}>
          試聽轉場
        </button>
        <button className="btn" onClick={cancel}>
          取消
        </button>
        <button
          className="btn primary"
          data-testid="ta-apply"
          onClick={() => {
            write();
            onClose();
          }}
        >
          套用
        </button>
      </div>
    </Sheet>
  );
}
