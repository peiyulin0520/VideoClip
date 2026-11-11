import { useEffect, useRef } from 'react';
import { renderText } from '../../engine/textRender';
import type { DecorationKind, TextCard } from '../../model/types';
import { DECORATION_KINDS } from '../../engine/decorations';

/** 風格選單的縮圖：用範例字「真的畫一次」（跟字卡同一套繪製），不是靜態圖片 */
export function sampleCard(kind: DecorationKind, color: string, width: number): TextCard {
  return {
    align: 'center',
    runs: [
      {
        text: '好看',
        fontId: 'system',
        size: 100,
        color: '#222222',
        letterSpacing: 0,
        lineHeight: 1.2,
        weight: 'bold',
      },
    ],
    decorations: [{ kind, color, width }],
  };
}

export function DecoThumb({ kind }: { kind: DecorationKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const def = DECORATION_KINDS.find((k) => k.kind === kind)!;
    const r = renderText(sampleCard(kind, def.color, def.width), 0.6);
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const k = Math.min(cv.width / r.w, cv.height / r.h);
    ctx.drawImage(r.canvas, (cv.width - r.w * k) / 2, (cv.height - r.h * k) / 2, r.w * k, r.h * k);
  }, [kind]);
  return <canvas ref={ref} width={160} height={96} className="deco-thumb" aria-hidden="true" />;
}
