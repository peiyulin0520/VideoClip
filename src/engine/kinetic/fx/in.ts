// 登場（01–08）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
import { clamp, drawWord, E, fit, lerp, pick, seg, type KineticDef } from '../core';

export const FX_IN: KineticDef[] = [
  {
    id: 'burst',
    group: 'in',
    zh: '爆出',
    en: 'Burst',
    scheme: 'ink',
    words: ['開場', '登場', '來了'],
    poster: 0.6,
    len: (n) => 2.2 * n,
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      const D = 2.2;
      const k = Math.floor(t / D);
      const tt = t - k * D;
      const word = pick(s.words, k);
      const px = fit(s, word, 46, 78);
      const p = E.back(seg(tt, 0, 0.42));
      const out = seg(tt, 1.85, 2.15);
      // 放射線（14 條，先畫在字後面）
      const q = seg(tt, 0.02, 0.55);
      if (q > 0 && q < 1) {
        const d = lerp(18, 64, E.out(q)) * cqmin;
        for (let j = 0; j < 14; j++) {
          g.save();
          g.translate(W / 2, H / 2);
          g.rotate(((j * 360) / 14 + k * 17) * (Math.PI / 180));
          g.translate(0, -d);
          g.scale(1, (1 - q) * (j % 2 ? 1 : 0.55));
          g.fillStyle = s.hi;
          g.fillRect(-0.55 * cqmin, -6.5 * cqmin, 1.1 * cqmin, 13 * cqmin);
          g.restore();
        }
      }
      drawWord(s, word, W / 2, H / 2, px, {
        sx: p * (1 - out * 0.25),
        sy: p * (1 - out * 0.25),
        alpha: clamp(1 - out),
      });
    },
  },
];
