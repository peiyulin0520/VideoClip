// 流動（09–16）。改寫自 claude-animated-text（MIT，© 2026 pound / POUND0423）。
import { marquee, type KineticDef } from '../core';

export const FX_FLOW: KineticDef[] = [
  {
    id: 'crawl',
    group: 'flow',
    zh: '巨字橫移',
    en: 'Giant crawl',
    scheme: 'ink',
    words: ['環島公路', '一路向南'],
    poster: 1.5,
    area: 'full',
    fade: 'h',
    len: () => null,
    hit: [0, 0.2, 1, 0.6],
    draw(s, t) {
      const { g, W, H, cqmin } = s;
      const unit = s.words.join('・') + '・';
      // 超大的字（字高 58cqmin，範圍＝整個畫面扣掉底下 10cqmin），由右往左慢慢橫移
      marquee(
        s,
        unit,
        t * 0.55,
        58 * cqmin,
        { x: 0, y: 0, w: W, h: H - 10 * cqmin },
        { min: 8, weight: 900 },
      );
      // 底下一條強調色窄帶，小字反向跑
      const sh = 5.6 * cqmin * 1.2 + 3.2 * cqmin;
      g.fillStyle = s.hi;
      g.fillRect(0, H - sh, W, sh);
      marquee(
        s,
        unit,
        -t * 2.4,
        5.6 * cqmin,
        { x: 0, y: H - sh, w: W, h: sh },
        { min: 44, color: s.hifg, weight: 700 },
      );
    },
  },
];
