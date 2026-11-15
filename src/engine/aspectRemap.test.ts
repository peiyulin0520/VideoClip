import { describe, expect, it } from 'vitest';
import type { Asset, Project } from '../model/types';
import { remapKeepOnStage } from './aspectRemap';
import { fittedSize, type GeoCtx } from './geometry';
import { frameFractions } from './stage';

const asset = {
  id: 'a',
  kind: 'video',
  width: 1080,
  height: 1920,
  duration: 5,
  thumbs: [],
} as unknown as Asset;
const ctxFor = (w: number, h: number): GeoCtx => ({
  canvasW: w,
  canvasH: h,
  assets: [asset],
  textSize: () => ({ w: 0.3 * w, h: 0.1 * w }),
});
const mk = (x: number, y: number, scale: number, fit: 'cover' | 'contain' = 'cover') =>
  ({
    tracks: [
      {
        id: 't',
        kind: 'overlay',
        name: 'o',
        hidden: false,
        locked: false,
        items: [
          {
            id: 'i',
            type: 'video',
            assetId: 'a',
            start: 0,
            duration: 3,
            trimIn: 0,
            speed: 1,
            volume: 1,
            fit,
            transform: { x, y, scale, rotation: 0, opacity: 1 },
            keyframes: [{ t: 1, x, y, scale: scale * 2, rotation: 0, opacity: 1 }],
          },
        ],
      },
    ],
  }) as unknown as Pick<Project, 'tracks'>;

/** 物件中心、寬度在底（9:16）上的比例位置 */
const onStage = (p: Pick<Project, 'tracks'>, w: number, h: number) => {
  const it = p.tracks[0]!.items[0] as unknown as {
    transform: { x: number; y: number; scale: number };
    fit: 'cover' | 'contain';
  };
  const f = frameFractions(w, h);
  const fit = fittedSize(1080, 1920, w, h, it.fit);
  return {
    cx: f.ox + it.transform.x * f.fx,
    cy: f.oy + it.transform.y * f.fy,
    wf: ((fit.w * it.transform.scale) / w) * f.fx,
  };
};

describe('remapKeepOnStage', () => {
  it('9:16 → 4:3：物件在底上的位置、寬度不變', () => {
    const p = mk(0.3, 0.7, 0.5);
    const before = onStage(p, 1080, 1920);
    remapKeepOnStage(p, 1080, 1920, 1440, 1080, ctxFor);
    const after = onStage(p, 1440, 1080);
    expect(after.cx).toBeCloseTo(before.cx, 6);
    expect(after.cy).toBeCloseTo(before.cy, 6);
    expect(after.wf).toBeCloseTo(before.wf, 6);
  });
  it('4:3 → 16:9 → 9:16 來回：回到原本的座標', () => {
    const p = mk(0.2, 0.4, 0.8, 'contain');
    remapKeepOnStage(p, 1440, 1080, 1920, 1080, ctxFor);
    remapKeepOnStage(p, 1920, 1080, 1080, 1920, ctxFor);
    remapKeepOnStage(p, 1080, 1920, 1440, 1080, ctxFor);
    const t = p.tracks[0]!.items[0]!.transform;
    expect(t.x).toBeCloseTo(0.2, 6);
    expect(t.y).toBeCloseTo(0.4, 6);
    expect(t.scale).toBeCloseTo(0.8, 6);
  });
  it('定格的位置與縮放跟著換算（縮放比例關係不變）', () => {
    const p = mk(0.5, 0.5, 1);
    remapKeepOnStage(p, 1080, 1920, 1080, 1080, ctxFor);
    const it = p.tracks[0]!.items[0] as unknown as {
      transform: { scale: number };
      keyframes: { scale: number; x: number; y: number }[];
    };
    expect(it.keyframes[0]!.scale).toBeCloseTo(it.transform.scale * 2, 6);
    expect(it.keyframes[0]!.x).toBeCloseTo(0.5, 6);
  });
});
