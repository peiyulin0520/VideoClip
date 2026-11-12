import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';

/** 音量波形的解析度：每 0.1 秒一個值 */
export const WAVE_STEP = 0.1;

/**
 * 把音樂檔解碼，算出每 0.1 秒的最大音量（0–100，依整首最大值正規化，輕的歌也看得到波形）。
 * 解不了回傳 undefined（時間軸上就不畫波形，不影響使用）。
 */
export async function computeWave(file: Blob, duration: number): Promise<number[] | undefined> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return undefined;
    const n = Math.max(Math.ceil(duration / WAVE_STEP), 1);
    const peaks = new Float32Array(n);
    const sink = new AudioBufferSink(track);
    for await (const wb of sink.buffers(0, duration)) {
      const ch = wb.buffer.getChannelData(0);
      const sr = wb.buffer.sampleRate;
      for (let i = 0; i < ch.length; i += 8) {
        const k = Math.min(Math.floor((wb.timestamp + i / sr) / WAVE_STEP), n - 1);
        const v = Math.abs(ch[i]!);
        if (k >= 0 && v > peaks[k]!) peaks[k] = v;
      }
    }
    return quantizeWave(peaks);
  } catch {
    return undefined;
  } finally {
    input.dispose();
  }
}

/** 正規化成 0–100 的整數；全部是 0（無聲）回傳 undefined */
export function quantizeWave(peaks: ArrayLike<number>): number[] | undefined {
  let max = 0;
  for (let i = 0; i < peaks.length; i++) max = Math.max(max, peaks[i]!);
  if (!(max > 0)) return undefined;
  return Array.from(peaks, (v) => Math.round((v / max) * 100));
}
