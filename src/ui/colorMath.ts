// 顏色換算（給自訂顏色彈窗用）：色碼 ⇄ RGB（0–255）⇄ HSV（h 0–360、s v 0–1）。純函式。

export type RGB = [number, number, number];
export type HSV = { h: number; s: number; v: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const byte = (n: number) => clamp(Math.round(n), 0, 255);

export function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((c) => byte(c).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsv([r, g, b]: RGB): HSV {
  const R = byte(r) / 255;
  const G = byte(g) / 255;
  const B = byte(b) / 255;
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const hh = ((h % 360) + 360) % 360;
  const S = clamp(s, 0, 1);
  const V = clamp(v, 0, 1);
  const c = V * S;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = V - c;
  const [r, g, b] =
    hh < 60
      ? [c, x, 0]
      : hh < 120
        ? [x, c, 0]
        : hh < 180
          ? [0, c, x]
          : hh < 240
            ? [0, x, c]
            : hh < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [byte((r! + m) * 255), byte((g! + m) * 255), byte((b! + m) * 255)];
}

/**
 * 改了 RGB 之後換回 HSV。灰色／黑色沒有色相（算出來是 0），這時沿用原本的色相，
 * 不然拉到灰色時色相條會跳回最左邊。
 */
export function hsvFromRgbKeepHue(rgb: RGB, prevHue: number): HSV {
  const t = rgbToHsv(rgb);
  return t.s === 0 || t.v === 0 ? { ...t, h: prevHue } : t;
}
