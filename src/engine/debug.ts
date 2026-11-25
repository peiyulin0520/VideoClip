import { ALL_FORMATS, AudioBufferSink, BlobSource, CanvasSink, Input } from 'mediabunny';
import { patchAssetEverywhere, useProjectStore } from '../store/projectStore';
import { urlFor } from './assetUrls';
import { ensureFont } from '../fonts/fontStore';
import type { TextCard } from '../model/types';
import { __setProxyMaker } from './proxyQueue';
import { exportProject, type ExportOptions } from './exporter';
import { renderFrame } from './exportFrame';
import { lastImportErrors } from './importMedia';
import { renderText, canvasFamily } from './textRender';
import { kineticById, KINETIC, schemeOf } from './kinetic';
import { paintKinetic } from './kinetic/render';
import { holdTime } from './kinetic/hold';
import { splitWords } from './kinetic/core';
import type { Player } from './player';
import { setTransform, setTransition, setTransitionSplit } from '../store/actions';
import { isFrameItem } from './layoutTracks';

let editorRenders = 0;
/** 編輯器本體每重畫一次就加 1（測試用：播放時不該每一格都重畫） */
export function countEditorRender() {
  editorRenders++;
}

/** 測試/除錯用：localStorage 的 vc-debug 設成 1 才會掛出 window.__videoclip。正常使用者看不到。 */
export function installDebugHook(player: Player) {
  const on = (() => {
    try {
      return localStorage.getItem('vc-debug') === '1';
    } catch {
      return false;
    }
  })();
  if (!on) return;
  const hook = {
    /** 測試／比對用：動態字卡某一式在 t 秒、W×H 畫布、指定的詞（沒給＝範例字）畫出來的圖（PNG dataURL，用原版配色、不淡出） */
    kineticPaint: (id: string, t: number, W: number, H: number, words?: string[]) => {
      const def = kineticById(id);
      if (!def) return null;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const sch = schemeOf(def);
      paintKinetic(
        c,
        def,
        {
          words: words ?? def.words,
          fg: sch.fg,
          paper: sch.bg,
          hi: sch.hi,
          hifg: sch.hifg,
          bg: sch.bg,
          family: canvasFamily(''),
        },
        t,
      );
      return c.toDataURL('image/png');
    },
    /** 測試用：每一式在 W×H 畫一張要多久（ms，取 24 張的平均；Chromium 軟體繪圖，只能當相對比較） */
    kineticBench: (W: number, H: number) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return KINETIC.map((def) => {
        const sch = schemeOf(def);
        const p = {
          words: def.words,
          fg: sch.fg,
          paper: sch.bg,
          hi: sch.hi,
          hifg: sch.hifg,
          bg: sch.bg,
          family: canvasFamily(''),
        };
        paintKinetic(c, def, p, def.poster);
        const flush = () => c.getContext('2d')!.getImageData(0, 0, 1, 1); // 逼畫布真的畫完（不然只量到記錄指令的時間）
        flush();
        const t0 = performance.now();
        for (let i = 0; i < 24; i++) {
          paintKinetic(c, def, p, def.poster + i * 0.11);
          flush();
        }
        return { id: def.id, ms: (performance.now() - t0) / 24 };
      });
    },
    /** 測試用：每一式（一輪有長度的）第一個詞那一輪，每個時間點畫面上「有墨」的比例（跟配色底色不同的像素），用來找「字完整呈現」的時間 */
    kineticInk: () =>
      KINETIC.flatMap((def) => {
        const cycle = def.len([def.words[0]!]);
        if (cycle === null) return [];
        const full = def.area === 'full';
        const W = full ? 180 : 320;
        const H = full ? 320 : 180;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const sch = schemeOf(def);
        const p = {
          words: def.words,
          fg: sch.fg,
          paper: sch.bg,
          hi: sch.hi,
          hifg: sch.hifg,
          bg: sch.bg,
          family: canvasFamily(''),
        };
        const bg = parseInt(sch.bg.slice(1), 16);
        const br = (bg >> 16) & 255;
        const bgG = (bg >> 8) & 255;
        const bb = bg & 255;
        const series: number[] = [];
        const n = 120;
        for (let i = 0; i <= n; i++) {
          paintKinetic(c, def, p, (i / n) * cycle, def.fade ?? 'none');
          const d = c.getContext('2d')!.getImageData(0, 0, W, H).data;
          let ink = 0;
          for (let j = 0; j < d.length; j += 4)
            if (Math.abs(d[j]! - br) + Math.abs(d[j + 1]! - bgG) + Math.abs(d[j + 2]! - bb) > 90) ink++;
          series.push(ink / (W * H));
        }
        return [{ id: def.id, cycle, series }];
      }),
    /**
     * 測試用：每一式用給的文字（一段字串，照字卡的規則拆詞）算「停在最後」那一刻，畫兩張只差最後一個字的圖：
     * 兩張不一樣＝最後一個字有被畫出來。回傳停點、一輪長度、最後一個字有沒有畫出來、停點的墨量與最後一輪裡的最大墨量。
     */
    kineticHoldCheck: (text: string) =>
      KINETIC.map((def) => {
        const words = splitWords(text);
        const total = def.len(words);
        const hold = holdTime(def, words);
        const full = def.area === 'full';
        const W = full ? 180 : 320;
        const H = full ? 320 : 180;
        const sch = schemeOf(def);
        const mk = (ws: string[]) => ({
          words: ws,
          fg: sch.fg,
          paper: sch.bg,
          hi: sch.hi,
          hifg: sch.hifg,
          bg: sch.bg,
          family: canvasFamily(''),
        });
        const swapLast = words.map((w, i) => {
          if (i !== words.length - 1) return w;
          const cs = Array.from(w);
          cs[cs.length - 1] = '丑';
          return cs.join('');
        });
        const draw = (ws: string[], t: number) => {
          const c = document.createElement('canvas');
          c.width = W;
          c.height = H;
          paintKinetic(c, def, mk(ws), Math.floor(t * 60 + 1e-6) / 60, def.fade ?? 'none');
          return c.getContext('2d')!.getImageData(0, 0, W, H).data;
        };
        const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
          let n = 0;
          for (let j = 0; j < a.length; j += 4)
            if (
              Math.abs(a[j]! - b[j]!) + Math.abs(a[j + 1]! - b[j + 1]!) + Math.abs(a[j + 2]! - b[j + 2]!) >
              60
            )
              n++;
          return n;
        };
        const bg = parseInt(sch.bg.slice(1), 16);
        const ink = (d: Uint8ClampedArray) => {
          let n = 0;
          for (let j = 0; j < d.length; j += 4)
            if (
              Math.abs(d[j]! - ((bg >> 16) & 255)) +
                Math.abs(d[j + 1]! - ((bg >> 8) & 255)) +
                Math.abs(d[j + 2]! - (bg & 255)) >
              90
            )
              n++;
          return n / (W * H);
        };
        const lastDiff = diff(draw(words, hold), draw(swapLast, hold));
        // 最後一個詞的每個字：換掉那一個字、畫面有沒有變（沒變＝那個字停點時沒畫出來）
        const base = draw(words, hold);
        const lastWord = Array.from(words[words.length - 1]!);
        const perChar = lastWord.map((_, k) => {
          const cs = lastWord.slice();
          cs[k] = '丑';
          return diff(base, draw([...words.slice(0, -1), cs.join('')], hold));
        });
        // 最後一輪（最後一個詞）裡的最大墨量；一直在跑的式子（total＝null）沒有一輪
        let maxInk = 0;
        if (total !== null) {
          const last = def.len([words[words.length - 1]!])!;
          for (let t = total - last; t <= total; t += 1 / 30) maxInk = Math.max(maxInk, ink(draw(words, t)));
        }
        return { id: def.id, hold, total, lastDiff, perChar, inkAtHold: ink(draw(words, hold)), maxInk };
      }),
    /** 測試用：把畫面上第一個版型整個轉 deg 度（效能量測：傾斜的版型最慢） */
    rotateFrame: (deg: number) => {
      const p = useProjectStore.getState().project;
      const fr = p?.tracks.flatMap((t) => t.items).find(isFrameItem);
      if (fr) setTransform(fr.id, { rotation: deg });
    },
    /** 測試用：幫第二個影像片段設轉場（疊化），自訂長度與前後分配（秒；沒給分配＝各一半） */
    setSeam: (duration: number, before?: number, after?: number) => {
      const p = useProjectStore.getState().project;
      const items = p?.tracks.find((t) => t.kind === 'media')?.items ?? [];
      const b = items[1];
      if (!b) return;
      setTransition(b.id, 'dissolve', duration);
      if (before !== undefined && after !== undefined) setTransitionSplit(b.id, before, after);
    },
    /** 測試用：轉場預先解碼的狀態，與開關（關掉＝一定走「等一下再轉」） */
    framesState: () => player.framesState(),
    /** 測試用：把某個影像物件的位置往右挪 dx（0–1 的畫面寬度比例），不進復原紀錄 */
    nudgeItem: (id: string, dx: number) => {
      const pr = useProjectStore.getState().project;
      if (!pr) return;
      useProjectStore.setState({
        project: {
          ...pr,
          tracks: pr.tracks.map((t) => ({
            ...t,
            items: t.items.map((i) =>
              i.id === id && i.type !== 'audio'
                ? { ...i, transform: { ...i.transform, x: i.transform.x + dx } }
                : i,
            ),
          })),
        } as typeof pr,
      });
    },
    setPredecode: (on: boolean) => {
      player.predecode = on;
    },
    kineticList: () => KINETIC.map((f) => ({ id: f.id, zh: f.zh, group: f.group, poster: f.poster })),
    project: () => JSON.parse(JSON.stringify(useProjectStore.getState().project)),
    time: () => player.time,
    /** 測試用：把某個素材的縮圖變回「舊版」的樣子（只剩 1 張、沒有補滿的記號）；存檔後重新整理會在背景補滿 */
    legacyThumbs: (assetId: string) => {
      const a = useProjectStore.getState().project?.assets.find((x) => x.id === assetId);
      if (a) patchAssetEverywhere(assetId, { thumbs: a.thumbs.slice(0, 1), thumbsFull: undefined });
    },
    /** 測試用：匯出整支影片，再用 Mediabunny 讀回來檢查（長度、尺寸、有沒有聲音與音量、指定時間的畫面顏色） */
    async exportAndInspect(
      opts: Partial<ExportOptions>,
      probe: { times: number[]; points: [number, number][] },
    ) {
      const p = useProjectStore.getState().project!;
      const res = await exportProject(p, { longSide: 1280, fps: 30, quality: 'standard', ...opts });
      const input = new Input({ source: new BlobSource(res.file), formats: ALL_FORMATS });
      try {
        const v = await input.getPrimaryVideoTrack();
        const a = await input.getPrimaryAudioTrack();
        const duration = await input.computeDuration();
        let peak = 0;
        // 每一秒的最大音量（看聲音有沒有放在對的時間）
        const peaks: number[] = Array.from({ length: Math.ceil(duration) + 1 }, () => 0);
        if (a) {
          const sink = new AudioBufferSink(a);
          for await (const wb of sink.buffers(0, Math.min(duration, 30))) {
            const d = wb.buffer.getChannelData(0);
            const sr = wb.buffer.sampleRate;
            for (let i = 0; i < d.length; i++) {
              const v = Math.abs(d[i]!);
              peak = Math.max(peak, v);
              const sec = Math.min(Math.floor(wb.timestamp + i / sr), peaks.length - 1);
              if (v > peaks[sec]!) peaks[sec] = v;
            }
          }
        }
        const colors: number[][][] = [];
        if (v) {
          const sink = new CanvasSink(v);
          for (const t of probe.times) {
            const w = await sink.getCanvas(t);
            const row: number[][] = [];
            if (w) {
              const cv = document.createElement('canvas');
              cv.width = w.canvas.width;
              cv.height = w.canvas.height;
              const ctx = cv.getContext('2d')!;
              ctx.drawImage(w.canvas as CanvasImageSource, 0, 0);
              for (const [nx, ny] of probe.points)
                row.push(
                  Array.from(
                    ctx.getImageData(Math.floor(nx * cv.width), Math.floor(ny * cv.height), 1, 1).data,
                  ),
                );
            }
            colors.push(row);
          }
        }
        return {
          ext: res.ext,
          mime: res.mime,
          bytes: res.file.size,
          width: v?.displayWidth ?? 0,
          height: v?.displayHeight ?? 0,
          duration,
          hasAudio: !!a,
          audioPeak: peak,
          audioPeaks: peaks,
          videoCodec: res.videoCodec,
          audioCodec: res.audioCodec,
          warnings: res.warnings,
          colors,
        };
      } finally {
        input.dispose();
        await res.dispose();
      }
    },
    /** 測試用：讓預覽用輕量影片做不出來（模擬手機編不出 H.264） */
    failProxies: (on: boolean) =>
      __setProxyMaker(
        on
          ? async () => {
              throw new Error('測試：編不出來');
            }
          : null,
      ),
    editorRenders: () => editorRenders,
    /** 播放畫格數與每格合成耗時 */
    stats: () => player.stats(),
    audioGains: () => player.audioGains(),
    /** 聲音輸出：模式、有沒有在跑、目前輸出音量（0–1） */
    audio: () => ({ mode: player.audio.mode, running: player.audio.running, level: player.audio.level() }),
    lastImportErrors: () => JSON.parse(JSON.stringify(lastImportErrors)),
    selected: () => useProjectStore.getState().selectedId,
    /** 預覽畫面某區塊（0–1 比例）裡，和 rgb 差不多（每個色版差 tol 以內）的像素有幾個 */
    countColor(
      rgb: [number, number, number],
      tol: number,
      nx0: number,
      ny0: number,
      nx1: number,
      ny1: number,
    ) {
      const c = player.compositor;
      const px = c.readRegion(nx0 * c.width, ny0 * c.height, (nx1 - nx0) * c.width, (ny1 - ny0) * c.height);
      let n = 0;
      for (let i = 0; i < px.length; i += 4)
        if (
          Math.abs(px[i]! - rgb[0]) <= tol &&
          Math.abs(px[i + 1]! - rgb[1]) <= tol &&
          Math.abs(px[i + 2]! - rgb[2]) <= tol
        )
          n++;
      return n;
    },
    /** 預覽畫面上某一點的顏色，座標用 0–1 的比例 */
    samplePreview(nx: number, ny: number) {
      const c = player.compositor;
      return c.samplePixel(nx * c.width, ny * c.height);
    },
    /** 預覽畫面某區塊的內容雜湊：畫面有沒有變，不需要知道顏色 */
    regionHash(nx0: number, ny0: number, nx1: number, ny1: number) {
      const c = player.compositor;
      const px = c.readRegion(nx0 * c.width, ny0 * c.height, (nx1 - nx0) * c.width, (ny1 - ny0) * c.height);
      let h = 2166136261;
      for (let i = 0; i < px.length; i++) h = Math.imul(h ^ px[i]!, 16777619) >>> 0;
      return h;
    },
    /**
     * 把字卡用 scale 畫出來（會先載入字體），量「亮色的字」墨跡在畫布裡的上下左右邊界，
     * 驗證字塊內距跟設定的一樣。字塊要用深色、字用白色。
     */
    async cardInk(card: TextCard, scale = 1) {
      for (const r of card.runs) await ensureFont(r.fontId);
      const out = renderText(card, scale);
      const ctx = out.canvas.getContext('2d')!;
      const { data } = ctx.getImageData(0, 0, out.w, out.h);
      let top = Infinity;
      let bottom = -1;
      let left = Infinity;
      let right = -1;
      for (let y = 0; y < out.h; y++)
        for (let x = 0; x < out.w; x++) {
          const i = (y * out.w + x) * 4;
          if (data[i + 3]! > 200 && data[i + 1]! > 128 && data[i + 2]! > 128) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        }
      return { w: out.w, h: out.h, top, bottom, left, right };
    },
    /** 把字卡畫成 PNG（dataURL），驗收截圖用；bg 是背景色（預設白） */
    async cardPng(card: TextCard, scale = 1, bg = '#ffffff') {
      for (const r of card.runs) await ensureFont(r.fontId);
      const out = renderText(card, scale);
      const cv = document.createElement('canvas');
      cv.width = out.w;
      cv.height = out.h;
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, out.w, out.h);
      ctx.drawImage(out.canvas, 0, 0);
      return cv.toDataURL('image/png');
    },
    /** 用輸出解析度畫出 t 秒那一格（匯出共用的流程），回傳 PNG 大小與幾個取樣點的顏色 */
    async exportFrame(t: number, points: [number, number][]) {
      const p = useProjectStore.getState().project!;
      const { blob } = await renderFrame(p, t, (id) => urlFor(p.id, id, 'export'));
      const bmp = await createImageBitmap(blob);
      const cv = document.createElement('canvas');
      cv.width = bmp.width;
      cv.height = bmp.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return {
        width: bmp.width,
        height: bmp.height,
        bytes: blob.size,
        samples: points.map(([nx, ny]) =>
          Array.from(ctx.getImageData(Math.floor(nx * bmp.width), Math.floor(ny * bmp.height), 1, 1).data),
        ),
      };
    },
  };
  (window as unknown as { __videoclip: typeof hook }).__videoclip = hook;
}
