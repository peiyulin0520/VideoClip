import type { TransitionKind } from '../model/types';
import { transitionFrame, type ClipFrac, type Look } from './transitions';

// 轉場選單上的小示意動畫：用兩張自己畫的圖（A：暖橘色、B：藍綠色）走一遍跟正式畫面同一個 transitionFrame，
// 畫在 2D canvas 上。不需要跟正式畫面一模一樣（模糊在 Safari 不支援 ctx.filter 時就省略），看得出是什麼效果就好。

function paintSource(ctx: CanvasRenderingContext2D, w: number, h: number, which: 'A' | 'B') {
  const g = ctx.createLinearGradient(0, 0, w, h);
  if (which === 'A') {
    g.addColorStop(0, '#ff8a4c');
    g.addColorStop(1, '#ffd36e');
  } else {
    g.addColorStop(0, '#2fb8a6');
    g.addColorStop(1, '#2d6cdf');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `700 ${Math.round(h * 0.62)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(which, w / 2, h * 0.54);
}

function clipPath(ctx: CanvasRenderingContext2D, c: ClipFrac, w: number, h: number) {
  ctx.beginPath();
  if (c.kind === 'circle') ctx.arc(c.cx * w, c.cy * h, Math.max(c.r * Math.max(w, h), 0.1), 0, Math.PI * 2);
  else for (const [x, y, rw, rh] of c.rects) ctx.rect(x * w, y * h, rw * w, rh * h);
  ctx.clip();
}

function drawLayer(ctx: CanvasRenderingContext2D, w: number, h: number, look: Look, which: 'A' | 'B') {
  if (look.opacity <= 0.001) return;
  ctx.save();
  if (look.clip) {
    if (look.clip.kind === 'rects' && look.clip.rects.length === 0) {
      ctx.restore();
      return;
    }
    clipPath(ctx, look.clip, w, h);
  }
  ctx.globalAlpha = look.opacity;
  if (look.blur && 'filter' in ctx) ctx.filter = `blur(${(look.blur * Math.min(w, h)).toFixed(1)}px)`;
  ctx.translate(w / 2 + look.dx * w, h / 2 + look.dy * h);
  ctx.scale(look.scale, look.scale);
  ctx.translate(-w / 2, -h / 2);
  paintSource(ctx, w, h, which);
  ctx.restore();
}

/** 在 (w×h) 的 2D canvas 上畫出轉場進行到 p（0–1）的樣子 */
export function drawTransitionDemo(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  kind: TransitionKind,
  p: number,
) {
  const f = transitionFrame(kind, p);
  ctx.save();
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, w, h);
  if (f.bOnTop) {
    drawLayer(ctx, w, h, f.a, 'A');
    drawLayer(ctx, w, h, f.b, 'B');
  } else {
    drawLayer(ctx, w, h, f.b, 'B');
    drawLayer(ctx, w, h, f.a, 'A');
  }
  for (const c of f.covers) {
    const r = c.rect ?? [0, 0, 1, 1];
    ctx.globalAlpha = Math.min(Math.max(c.alpha, 0), 1);
    if (c.kind === 'flash') {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgb(255,236,190)');
      g.addColorStop(0.55, 'rgba(255,184,96,0.92)');
      g.addColorStop(1, 'rgba(235,120,50,0.75)');
      ctx.fillStyle = g;
    } else ctx.fillStyle = c.color;
    ctx.fillRect(r[0] * w, r[1] * h, r[2] * w, r[3] * h);
  }
  ctx.restore();
}
