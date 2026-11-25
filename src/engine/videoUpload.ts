// 播放中的影片畫面「要不要重新上傳成貼圖」。
// 主要看 requestVideoFrameCallback（rVFC）的計數；但 Safari 對看不到的影片（影片池 1×1、透明）rVFC 會不規律、
// 好一陣子都不觸發 → 計數不變 → 預覽停在舊畫面（卡頓）。所以計數太久沒變、而影片時間已經往前（以 30 格／秒量化）時，
// 改用影片時間當備援。計數正常時只看計數，不會一秒上傳超過影片本身的格數。

/** 計數這麼久（毫秒）沒變，就認為 rVFC 停了，改看影片時間 */
export const RVFC_STALE_MS = 80;
const QUANT_FPS = 30;

export type UploadState = {
  /** 上次上傳時的 rVFC 計數、量化時間 */
  fc: number | null;
  q: number;
  /** rVFC 計數最後一次變動的時間（performance.now） */
  fcChangedAt: number;
};

export const freshUploadState = (): UploadState => ({ fc: null, q: NaN, fcChangedAt: 0 });

export type UploadInput = {
  /** 沒有 rVFC 時是 null */
  fc: number | null;
  currentTime: number;
  paused: boolean;
  now: number;
};

/** 回傳要不要上傳；state 會被更新成「這次看到的」 */
export function shouldUpload(state: UploadState, i: UploadInput): boolean {
  const q = Math.floor(i.currentTime * QUANT_FPS + 1e-6);
  if (i.paused) {
    // 暫停（拖時間軸 seek）：影片時間變了就上傳
    const changed = state.fc !== null || state.q !== i.currentTime;
    state.fc = null;
    state.q = i.currentTime;
    return changed;
  }
  let up = false;
  if (i.fc !== null) {
    if (i.fc !== state.fc) {
      up = true;
      state.fcChangedAt = i.now;
    } else if (q !== state.q && i.now - state.fcChangedAt > RVFC_STALE_MS) {
      up = true; // rVFC 停了、影片時間卻在走：備援
    }
  } else if (q !== state.q) {
    up = true; // 沒有 rVFC：每個影片格上傳一次
  }
  if (up) {
    state.fc = i.fc;
    state.q = q;
  }
  return up;
}
