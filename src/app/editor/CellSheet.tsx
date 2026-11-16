import { useState } from 'react';
import { useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { cellItems } from '../../engine/cellGap';
import { itemTitle, thumbOf } from '../../engine/labels';
import { textsOnItem } from '../../engine/cellOps';
import { urlFor } from '../../engine/assetUrls';
import { importFilesIntoCell } from './cellImport';
import { frameOfGroup } from '../../engine/layoutTracks';
import {
  applyCell,
  cellAvailable,
  cellMain,
  importIntoCell,
  removeAnyItem,
  setCellCaption,
  setCellTrim,
  setColorItem,
  type CellDraft,
} from '../../store/actions';
import { useProjectStore } from '../../store/projectStore';
import { toast, useUI } from '../../store/uiStore';
import { ColorPicker } from '../../ui/ColorPicker';
import { Sheet } from '../../ui/Sheet';
import { RangeMarkerSheet } from './RangeMarkerSheet';
import { CellAddSheet } from './CellAddSheet';
import { ensureColorAsset } from './cellColor';

const FILL_HEX: Record<string, string> = { black: '#000000', white: '#ffffff' };

/**
 * 「這一格」視窗：名稱、素材、用素材的哪一段、素材比這一格短（或長）時怎麼放。
 * 按「套用」一次寫入（視窗不會關）；按 ✕ 只放棄套用之後的改動。
 */
export function CellSheet({
  trackId,
  index,
  onClose,
}: {
  trackId: string;
  index: number;
  onClose: () => void;
}) {
  const project = useProjectStore((s) => s.project)!;
  const track = project.tracks.find((t) => t.id === trackId);
  const selectedId = useProjectStore((s) => s.selectedId);
  // 現在選的是這一格的哪一段（沒選＝第一段）：下面「換素材」「用素材的哪一段」都是對這一段
  const item = track && (cellItems(track).find((x) => x.id === selectedId) ?? cellMain(track));
  const frameItem = track?.group ? frameOfGroup(project.tracks, track.group)?.item : undefined;
  const textNow = project.tracks
    .flatMap((t) => t.items)
    .find((x) => x.type === 'text' && x.cellFor === trackId);
  const [draft, setDraft] = useState<CellDraft | null>(null);
  const [ranging, setRanging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<{ id: string; color: string; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!track || !frameItem) return null;
  if (!item) {
    // 這一格還是空的：選一個專案裡已有的素材，或從相簿匯入新的
    const choices = project.assets.filter(
      (a) =>
        (a.kind === 'video' || a.kind === 'image') && !a.name.startsWith('版型-') && a.origin !== 'color',
    );
    const onFiles = async (list: FileList | null) => {
      const files = list ? Array.from(list) : [];
      if (fileRef.current) fileRef.current.value = '';
      await importFilesIntoCell(project.id, trackId, files);
    };
    return (
      <Sheet open title={`第 ${index + 1} 格`} onClose={onClose}>
        <div data-testid="cell-sheet-empty">
          <p className="hint">這一格還沒放素材。選一個專案裡已有的，或從相簿匯入。</p>
          <div className="cover-strip" data-testid="cell-assets">
            {choices.map((a) => (
              <button
                key={a.id}
                className="cover-pick"
                aria-label={`放入 ${a.name}`}
                style={{ backgroundImage: a.thumbs[0] ? `url(${a.thumbs[0]})` : undefined }}
                onClick={() => {
                  importIntoCell(trackId, a);
                  useUI.getState().player?.refresh();
                }}
              />
            ))}
          </div>
          <button className="btn" data-testid="cell-import" onClick={() => fileRef.current?.click()}>
            從相簿選照片或影片
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,image/*"
            hidden
            data-testid="cell-file"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </div>
      </Sheet>
    );
  }

  const L = frameItem.duration;
  const asset = project.assets.find((a) => a.id === item.assetId);
  const S = cellAvailable(item, asset);
  const isVideo = item.type === 'video' && Number.isFinite(S);
  const all = cellItems(track);
  // 一格有多個素材、或空檔設成「停格」時，不用「素材比這一格短／長」那一套（空檔由版型的「空檔」決定）
  const legacy = all.length === 1 && frameItem.gapMode !== 'hold';
  const short = legacy && isVideo && S < L - 0.05;
  const long = legacy && isVideo && S > L + 0.05;
  const init: CellDraft = {
    name: item.label ?? '',
    assetId: item.assetId,
    mode:
      item.speed !== 1 ? 'fit' : textNow || item.start > frameItem.start + 0.05 || short ? 'blank' : 'keep',
    pos: item.start > frameItem.start + 0.05 ? 'before' : 'after',
    color:
      FILL_HEX[track.fill ?? 'black'] ??
      track.fill ??
      (frameItem.gapMode === 'fill' ? (frameItem.frameStyle?.color ?? '#000000') : '#000000'),
    text: textNow && textNow.type === 'text' ? (textNow.card.runs[0]?.text ?? '') : '',
  };
  const d = draft ?? init;
  const set = (patch: Partial<CellDraft>) => setDraft({ ...d, ...patch });
  const choices = project.assets.filter(
    (a) => (a.kind === 'video' || a.kind === 'image') && !a.name.startsWith('版型-') && a.origin !== 'color',
  );
  const sameAsset = d.assetId === item.assetId;
  const slowFast = short ? '慢動作' : '快動作';

  return (
    <>
      <Sheet open title={`第 ${index + 1} 格`} onClose={onClose}>
        <div data-testid="cell-sheet">
          <div className="panel-head">
            <span>名稱</span>
          </div>
          <input
            className="text-input"
            aria-label="這一格的名稱"
            value={d.name}
            maxLength={40}
            placeholder={`第 ${index + 1} 格`}
            onChange={(e) => set({ name: e.target.value })}
          />
          <div className="panel-head">
            <span>這一格的素材（{all.length} 段）</span>
          </div>
          <ul className="cell-items" data-testid="cell-items">
            {all.map((it, n) => {
              const a = project.assets.find((x) => x.id === it.assetId);
              const isColor = a?.origin === 'color';
              const thumb = thumbOf(it, a);
              const open = edit?.id === it.id;
              return (
                <li key={it.id} className={`cell-item${it.id === selectedId ? ' selected' : ''}`}>
                  <button
                    className="cell-item-main"
                    aria-label={`第 ${n + 1} 段 ${itemTitle(it, a)}`}
                    onClick={() => {
                      setDraft(null);
                      useProjectStore.getState().select(it.id);
                      useUI.getState().player?.seek(it.start + 0.02);
                      if (isColor) {
                        const cap = textsOnItem(project.tracks, it.id)[0];
                        setEdit(
                          open
                            ? null
                            : {
                                id: it.id,
                                color: a?.color ?? '#ffd23f',
                                text: cap && cap.type === 'text' ? (cap.card.runs[0]?.text ?? '') : '',
                              },
                        );
                      }
                    }}
                  >
                    <span
                      className="cell-thumb"
                      style={{
                        background: isColor ? a?.color : undefined,
                        backgroundImage: !isColor && thumb ? `url(${thumb})` : undefined,
                      }}
                    />
                    <span className="cell-item-name">
                      {n + 1}. {isColor ? '色塊' : itemTitle(it, a)}
                    </span>
                    <span className="cell-item-dur">{it.duration.toFixed(1)} 秒</span>
                  </button>
                  <button
                    className="icon-btn sm"
                    aria-label={`刪除第 ${n + 1} 段`}
                    onClick={() => {
                      removeAnyItem(it.id);
                      setEdit(null);
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                  {open && edit && (
                    <div className="zone-soft cell-item-edit" data-testid="cell-color-edit">
                      <ColorPicker
                        label="色塊顏色"
                        value={edit.color}
                        onPick={(c) => setEdit({ ...edit, color: c })}
                      />
                      <input
                        className="text-input"
                        aria-label="色塊上的文字"
                        value={edit.text}
                        maxLength={40}
                        placeholder="色塊上的文字（可以不寫）"
                        onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                      />
                      <button
                        className="btn primary"
                        data-testid="cell-color-apply"
                        onClick={async () => {
                          const asset = await ensureColorAsset(project.id, edit.color);
                          if (asset) setColorItem(it.id, asset);
                          setCellCaption(it.id, edit.text);
                          useUI.getState().player?.refresh();
                          toast('已套用');
                        }}
                      >
                        套用
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <button className="btn" data-testid="cell-add-open" onClick={() => setAdding(true)}>
            ＋ 加素材
          </button>
          <div className="panel-head">
            <span>
              換第{' '}
              {Math.max(
                all.findIndex((x) => x.id === item.id),
                0,
              ) + 1}{' '}
              段的素材
            </span>
          </div>
          <div className="cover-strip" data-testid="cell-assets">
            {choices.map((a) => (
              <button
                key={a.id}
                className={`cover-pick${d.assetId === a.id ? ' active' : ''}`}
                aria-label={`換成 ${a.name}`}
                aria-pressed={d.assetId === a.id}
                style={{ backgroundImage: a.thumbs[0] ? `url(${a.thumbs[0]})` : undefined }}
                onClick={() => set({ assetId: a.id })}
              />
            ))}
          </div>
          {isVideo && (
            <>
              <div className="panel-head">
                <span>用素材的哪一段</span>
              </div>
              <button
                className="btn"
                data-testid="cell-range"
                disabled={!sameAsset}
                onClick={() => setRanging(true)}
              >
                選片段範圍（現在從 {item.trimIn.toFixed(2)} 秒開始）
              </button>
              {!sameAsset && <p className="hint">換了素材，先按「套用」再選片段範圍。</p>}
            </>
          )}
          {(short || long) && sameAsset && (
            <>
              <div className="panel-head">
                <span>{short ? '素材比這一格短' : '素材比這一格長'}</span>
              </div>
              <p className="hint" data-testid="cell-length-note">
                素材可用 {S.toFixed(1)} 秒，這一格 {L.toFixed(1)} 秒。
              </p>
              <div className="chips" role="radiogroup" aria-label="素材長度跟這一格不一樣時">
                {short ? (
                  <button
                    role="radio"
                    aria-checked={d.mode === 'blank'}
                    className={`chip${d.mode === 'blank' ? ' active' : ''}`}
                    data-testid="cell-mode-blank"
                    onClick={() => set({ mode: 'blank' })}
                  >
                    空白畫面
                  </button>
                ) : (
                  <button
                    role="radio"
                    aria-checked={d.mode === 'keep'}
                    className={`chip${d.mode === 'keep' ? ' active' : ''}`}
                    data-testid="cell-mode-keep"
                    onClick={() => set({ mode: 'keep' })}
                  >
                    只用前面一段
                  </button>
                )}
                <button
                  role="radio"
                  aria-checked={d.mode === 'fit'}
                  className={`chip${d.mode === 'fit' ? ' active' : ''}`}
                  data-testid="cell-mode-fit"
                  onClick={() => set({ mode: 'fit' })}
                >
                  {slowFast}（整段放進去）
                </button>
              </div>
              {short && d.mode === 'blank' && (
                <>
                  <div className="chips" role="radiogroup" aria-label="空白畫面位置">
                    {(['before', 'after'] as const).map((p) => (
                      <button
                        key={p}
                        role="radio"
                        aria-checked={d.pos === p}
                        className={`chip${d.pos === p ? ' active' : ''}`}
                        data-testid={`cell-pos-${p}`}
                        onClick={() => set({ pos: p })}
                      >
                        放{p === 'before' ? '前面' : '後面'}
                      </button>
                    ))}
                  </div>
                  <ColorPicker label="空白畫面顏色" value={d.color} onPick={(c) => set({ color: c })} />
                  <input
                    className="text-input"
                    aria-label="空白畫面文字"
                    value={d.text}
                    maxLength={40}
                    placeholder="空白畫面上的文字（可以不寫）"
                    onChange={(e) => set({ text: e.target.value })}
                  />
                </>
              )}
            </>
          )}
          {frameItem.gapMode === 'fill' && !(short && d.mode === 'blank') && (
            <ColorPicker label="空檔顏色" value={d.color} onPick={(c) => set({ color: c })} />
          )}
          <div className="sheet-row">
            <button
              className="btn primary grow"
              data-testid="cell-apply"
              onClick={() => {
                if (applyCell(trackId, d, item.id)) {
                  setDraft(null);
                  useUI.getState().player?.refresh();
                  toast('已套用');
                }
              }}
            >
              套用
            </button>
          </div>
        </div>
      </Sheet>
      {adding && (
        <CellAddSheet
          projectId={project.id}
          trackId={trackId}
          index={index}
          onClose={() => setAdding(false)}
        />
      )}
      {ranging && isVideo && asset && (
        <RangeMarkerSheet
          title={`第 ${index + 1} 格：選片段`}
          duration={asset.duration}
          ranges={[[item.trimIn, item.trimIn + item.duration * item.speed]]}
          minLen={0.2}
          fixedLen={item.duration * item.speed}
          maxGroups={1}
          thumbs={asset.thumbs}
          mediaUrl={urlFor(project.id, asset.id)}
          mediaKind="video"
          hint="拖「起」就好，「迄」會跟著（長度＝這一格要用的長度）。原色是用到的範圍，灰色沒用到。"
          onApply={(ranges) => {
            setCellTrim(item.id, ranges[0]![0]);
            useUI.getState().player?.refresh();
            setRanging(false);
          }}
          onClose={() => setRanging(false)}
        />
      )}
    </>
  );
}
