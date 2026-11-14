import { placeholderCount } from '../../engine/placeholder';
import { Download, Share2 } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  ExportCancelled,
  estimateBytes,
  exportProject,
  outputSize,
  type ExportOptions,
  type ExportProgress,
  type ExportResult,
} from '../../engine/exporter';
import { formatTime, totalDuration } from '../../engine/timeline';
import type { Project } from '../../model/types';
import { useUI } from '../../store/uiStore';
import { Sheet } from '../../ui/Sheet';

const mb = (b: number) => `${Math.max(Math.round(b / (1024 * 1024)), 1)} MB`;

/** 剩多久（畫面階段跑了 8% 以上才估，不然不準） */
function etaText(p: ExportProgress, startedAt: number): string | null {
  if (p.phase !== '畫面' || p.fraction <= 0.08) return null;
  const left = (((performance.now() - startedAt) / 1000) * (1 - p.fraction)) / p.fraction;
  return left < 60 ? `剩約 ${Math.max(Math.round(left), 1)} 秒` : `剩約 ${Math.ceil(left / 60)} 分鐘`;
}

type State =
  | { kind: 'options' }
  | { kind: 'running'; p: ExportProgress; eta: string | null }
  | { kind: 'done'; result: ExportResult }
  | { kind: 'error'; message: string };

/** 匯出整支影片：選解析度／更新率／畫質 → 進度（可取消）→ 儲存到相簿（分享）或下載 */
export function ExportSheet({
  project,
  open,
  onClose,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
}) {
  const [opts, setOpts] = useState<ExportOptions>({ longSide: 1920, fps: 30, quality: 'standard' });
  const [state, setState] = useState<State>({ kind: 'options' });
  const abort = useRef<AbortController | null>(null);
  const total = totalDuration(project);
  const size = outputSize(project, opts.longSide);
  const running = state.kind === 'running';

  const finish = () => {
    if (state.kind === 'done') void state.result.dispose();
    setState({ kind: 'options' });
    onClose();
  };

  const start = async () => {
    useUI.getState().player?.pause();
    const ctl = new AbortController();
    abort.current = ctl;
    const startedAt = performance.now();
    setState({ kind: 'running', eta: null, p: { phase: '準備', fraction: 0, frame: 0, frames: 1 } });
    try {
      const result = await exportProject(project, opts, {
        signal: ctl.signal,
        onProgress: (p) => setState({ kind: 'running', eta: etaText(p, startedAt), p }),
      });
      setState({ kind: 'done', result });
    } catch (e) {
      if (e instanceof ExportCancelled) setState({ kind: 'options' });
      else {
        console.warn('[export]', e);
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      abort.current = null;
    }
  };

  const share = async (r: ExportResult) => {
    try {
      if (navigator.canShare?.({ files: [r.file] })) {
        await navigator.share({ files: [r.file], title: project.name });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // 使用者自己關掉分享面板
    }
    download(r);
  };
  const download = (r: ExportResult) => {
    const url = URL.createObjectURL(r.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const chip = <T extends string | number>(
    label: string,
    value: T,
    current: T,
    set: (v: T) => void,
    aria: string,
  ) => (
    <button
      key={String(value)}
      role="radio"
      aria-checked={current === value}
      aria-label={`${aria} ${label}`}
      className={`chip${current === value ? ' active' : ''}`}
      onClick={() => set(value)}
    >
      {label}
    </button>
  );

  return (
    <Sheet open={open} title="匯出影片" onClose={running ? () => {} : finish}>
      {state.kind === 'options' && (
        <div data-testid="export-options">
          {total <= 0 ? (
            <p className="hint">還沒有內容可以匯出，先匯入影片或照片。</p>
          ) : (
            <>
              {placeholderCount(project) > 0 && (
                <p className="hint" data-testid="export-placeholder-note">
                  有 {placeholderCount(project)} 個文字還沒輸入內容，不會出現在影片中。
                </p>
              )}
              <div className="panel-head">
                <span>解析度</span>
              </div>
              <div className="chips" role="radiogroup" aria-label="解析度">
                {chip(
                  '1080p（較清楚）',
                  1920 as const,
                  opts.longSide,
                  (v) => setOpts({ ...opts, longSide: v }),
                  '解析度',
                )}
                {chip(
                  '720p（檔案較小）',
                  1280 as const,
                  opts.longSide,
                  (v) => setOpts({ ...opts, longSide: v }),
                  '解析度',
                )}
              </div>
              <div className="panel-head">
                <span>畫面更新率</span>
              </div>
              <div className="chips" role="radiogroup" aria-label="畫面更新率">
                {chip('30 fps', 30 as const, opts.fps, (v) => setOpts({ ...opts, fps: v }), '更新率')}
                {chip(
                  '60 fps（較順、較慢）',
                  60 as const,
                  opts.fps,
                  (v) => setOpts({ ...opts, fps: v }),
                  '更新率',
                )}
              </div>
              <div className="panel-head">
                <span>畫質</span>
              </div>
              <div className="chips" role="radiogroup" aria-label="畫質">
                {chip(
                  '標準',
                  'standard' as const,
                  opts.quality,
                  (v) => setOpts({ ...opts, quality: v }),
                  '畫質',
                )}
                {chip('高', 'high' as const, opts.quality, (v) => setOpts({ ...opts, quality: v }), '畫質')}
              </div>
              <p className="hint" data-testid="export-estimate">
                輸出 {size.width}×{size.height}，長度 {formatTime(total)}，預估檔案約{' '}
                {mb(estimateBytes(project, opts))}。匯出需要一點時間，過程中請不要切到別的 App 或關螢幕。
              </p>
            </>
          )}
          <div className="sheet-row">
            <button className="btn" onClick={finish}>
              關閉
            </button>
            <button className="btn primary" disabled={total <= 0} onClick={() => void start()}>
              開始匯出
            </button>
          </div>
        </div>
      )}

      {state.kind === 'running' && (
        <div data-testid="export-running">
          <p className="sheet-msg">
            {state.p.phase === '畫面'
              ? `正在輸出畫面 ${state.p.frame} / ${state.p.frames} 格`
              : state.p.phase === '聲音'
                ? '正在處理聲音…'
                : state.p.phase === '收尾'
                  ? '正在存成檔案…'
                  : '準備中…'}
            {state.eta ? `（${state.eta}）` : ''}
          </p>
          <div
            className="export-bar"
            role="progressbar"
            aria-label="匯出進度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(state.p.fraction * 100)}
          >
            <div style={{ width: `${Math.round(state.p.fraction * 100)}%` }} />
          </div>
          <p className="hint">過程中請不要切到別的 App 或關螢幕，不然 iPhone 會暫停匯出。</p>
          <div className="sheet-row">
            <button className="btn" onClick={() => abort.current?.abort()}>
              取消
            </button>
          </div>
        </div>
      )}

      {state.kind === 'done' && (
        <div data-testid="export-done">
          <p className="sheet-msg">
            匯出完成：{state.result.width}×{state.result.height}，{state.result.fps} fps，
            {mb(state.result.file.size)}，{state.result.hasAudio ? '有聲音' : '沒有聲音'}。
          </p>
          {state.result.warnings.map((w) => (
            <p key={w} className="hint warn" data-testid="export-warning">
              {w}
            </p>
          ))}
          <div className="sheet-row">
            <button className="btn primary" onClick={() => void share(state.result)}>
              <Share2 size={18} /> 儲存到相簿／分享
            </button>
          </div>
          <div className="sheet-row">
            <button className="btn" onClick={() => download(state.result)}>
              <Download size={18} /> 下載檔案
            </button>
            <button className="btn" onClick={finish}>
              關閉
            </button>
          </div>
        </div>
      )}

      {state.kind === 'error' && (
        <div data-testid="export-error">
          <p className="sheet-msg">匯出失敗：{state.message}</p>
          <div className="sheet-row">
            <button className="btn" onClick={finish}>
              關閉
            </button>
            <button className="btn primary" onClick={() => setState({ kind: 'options' })}>
              再試一次
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
