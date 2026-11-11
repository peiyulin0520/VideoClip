import { readFontFamilyName } from './sfnt';

function makeFont(names: { platform: number; lang: number; id: number; text: string }[]): ArrayBuffer {
  const strings = names.map((n) => {
    if (n.platform === 3) {
      const b = new Uint8Array(n.text.length * 2);
      [...n.text].forEach((c, i) => {
        b[i * 2] = c.charCodeAt(0) >> 8;
        b[i * 2 + 1] = c.charCodeAt(0) & 255;
      });
      return b;
    }
    return Uint8Array.from([...n.text].map((c) => c.charCodeAt(0)));
  });
  const nameSize = 6 + names.length * 12 + strings.reduce((s, b) => s + b.length, 0);
  const buf = new ArrayBuffer(12 + 16 + nameSize);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x00010000);
  dv.setUint16(4, 1);
  dv.setUint32(12, 0x6e616d65);
  dv.setUint32(12 + 8, 28);
  const o = 28;
  dv.setUint16(o + 2, names.length);
  dv.setUint16(o + 4, 6 + names.length * 12);
  let off = 0;
  names.forEach((n, i) => {
    const r = o + 6 + i * 12;
    dv.setUint16(r, n.platform);
    dv.setUint16(r + 4, n.lang);
    dv.setUint16(r + 6, n.id);
    dv.setUint16(r + 8, strings[i]!.length);
    dv.setUint16(r + 10, off);
    new Uint8Array(buf, o + 6 + names.length * 12 + off, strings[i]!.length).set(strings[i]!);
    off += strings[i]!.length;
  });
  return buf;
}

describe('readFontFamilyName', () => {
  it('讀出字體家族名稱，偏好繁中，其次英文', () => {
    const buf = makeFont([
      { platform: 3, lang: 0x409, id: 1, text: 'Hello Sans' },
      { platform: 3, lang: 0x404, id: 1, text: '你好體' },
    ]);
    expect(readFontFamilyName(buf)).toBe('你好體');
    expect(readFontFamilyName(makeFont([{ platform: 1, lang: 0, id: 1, text: 'MacOnly' }]))).toBe('MacOnly');
  });
  it('不是 ttf/otf（或壞掉）就回傳 null', () => {
    expect(readFontFamilyName(new ArrayBuffer(4))).toBeNull();
    expect(readFontFamilyName(new TextEncoder().encode('wOF2xxxxxxxxxxxxxxxx').buffer)).toBeNull();
  });
});
