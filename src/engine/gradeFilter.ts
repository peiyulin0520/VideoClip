import { defaultFilterVert, Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { Adjust } from '../model/types';
import { ADJUST_KEYS, fullAdjust } from './grade';

// 調色著色器：一個 pass 做完曝光、色溫、色調、對比、高光、陰影、黑點、亮度、飽和度、鮮艷度、褪色。
// 算式要跟 grade.ts 的 gradeRGB 一模一樣（那邊是測試與色調組合縮圖用的參考實作）。
// 合成器用的是 WebGL（Compositor 的 preference: 'webgl'），所以只寫 GLSL；以後如果改成 WebGPU 要補 gpuProgram。

const uName = (k: string) => `u${k[0]!.toUpperCase()}${k.slice(1)}`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
${ADJUST_KEYS.map((k) => `uniform float ${uName(k)};`).join('\n')}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec4 src = texture(uTexture, vTextureCoord);
  // Pixi 給的是預乘 alpha 的顏色：先還原再算，不然貼圖、字卡邊緣會發黑
  vec3 c = src.a > 0.0 ? src.rgb / src.a : src.rgb;

  // 曝光
  c *= exp2(uExposure * 2.0);
  // 色溫、色調
  c.r *= (1.0 + 0.3 * uTemperature) * (1.0 + 0.12 * uTint);
  c.g *= 1.0 - 0.18 * uTint;
  c.b *= (1.0 - 0.3 * uTemperature) * (1.0 + 0.12 * uTint);
  c = clamp(c, 0.0, 1.0);
  // 對比
  float ck = uContrast >= 0.0 ? 1.0 + uContrast : max(1.0 + uContrast, 0.2);
  c = clamp((c - 0.5) * ck + 0.5, 0.0, 1.0);
  // 高光、陰影
  float y = luma(c);
  float wH = smoothstep(0.5, 1.0, y);
  float wS = 1.0 - smoothstep(0.0, 0.5, y);
  c += uHighlights * 0.35 * wH * (uHighlights < 0.0 ? c : 1.0 - c);
  c += uShadows * 0.35 * wS * (uShadows < 0.0 ? c : 1.0 - c);
  c = clamp(c, 0.0, 1.0);
  // 黑點
  if (uBlacks >= 0.0) {
    c = uBlacks * 0.25 + c * (1.0 - uBlacks * 0.25);
  } else {
    float m = -uBlacks * 0.15;
    c = max((c - m) / (1.0 - m), 0.0);
  }
  c = clamp(c, 0.0, 1.0);
  // 亮度（gamma）
  c = pow(c, vec3(1.0 / (1.0 + uBrightness * 0.6)));
  // 飽和度
  float y2 = luma(c);
  c = clamp(vec3(y2) + (c - vec3(y2)) * (1.0 + uSaturation), 0.0, 1.0);
  // 鮮艷度
  float spread = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float vib = 1.0 + uVibrance * (1.0 - spread);
  float y3 = luma(c);
  c = vec3(y3) + (c - vec3(y3)) * vib;
  // 褪色
  float f = clamp(uFade, 0.0, 1.0);
  c = clamp(c, 0.0, 1.0);
  c = c + (vec3(0.5) + (c - vec3(0.5)) * 0.7 - c) * f + f * 0.04 * (vec3(1.0) - c);
  c = clamp(c, 0.0, 1.0);

  finalColor = vec4(c * src.a, src.a);
}
`;

/** 調色濾鏡：每個圖層一個；沒有調色（全是 0）就不要掛 */
export class GradeFilter extends Filter {
  private group: UniformGroup;
  /** 上一次送出的值：沒變就不重傳（播放時每格都會呼叫） */
  private last: number[] | null = null;
  constructor() {
    const uniforms: Record<string, { value: number; type: 'f32' }> = {};
    for (const k of ADJUST_KEYS) uniforms[uName(k)] = { value: 0, type: 'f32' };
    const group = new UniformGroup(uniforms);
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'grade-filter' }),
      resources: { gradeUniforms: group },
    });
    this.group = group;
  }

  /** 設定調色值（沒寫的項目是 0） */
  setAdjust(adj: Partial<Adjust>) {
    const a = fullAdjust(adj);
    const vals = ADJUST_KEYS.map((k) => a[k]);
    const last = this.last;
    if (last && vals.every((v, i) => v === last[i])) return;
    this.last = vals;
    const u = this.group.uniforms as Record<string, number>;
    ADJUST_KEYS.forEach((k, i) => (u[uName(k)] = vals[i]!));
  }
}
