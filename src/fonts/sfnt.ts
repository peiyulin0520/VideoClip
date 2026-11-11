// 最小的字型檔 name 表讀取（.ttf/.otf），只為了在匯入字體時取得字體名稱。woff/woff2 讀不了就回傳 null。
export function readFontFamilyName(buf: ArrayBuffer): string | null {
  try {
    const dv = new DataView(buf);
    const tag = dv.getUint32(0);
    let base = 0;
    if (tag === 0x74746366) base = dv.getUint32(12); // 'ttcf'：取第一個字型
    else if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) return null; // 不是 ttf/otf/true
    const numTables = dv.getUint16(base + 4);
    let nameOff = -1;
    for (let i = 0; i < numTables; i++) {
      const rec = base + 12 + i * 16;
      if (dv.getUint32(rec) === 0x6e616d65) nameOff = dv.getUint32(rec + 8); // 'name'
    }
    if (nameOff < 0) return null;
    const count = dv.getUint16(nameOff + 2);
    const strOff = nameOff + dv.getUint16(nameOff + 4);
    let best: { score: number; text: string } | null = null;
    for (let i = 0; i < count; i++) {
      const r = nameOff + 6 + i * 12;
      const platform = dv.getUint16(r);
      const lang = dv.getUint16(r + 4);
      const nameId = dv.getUint16(r + 6);
      if (nameId !== 1 && nameId !== 16) continue;
      const len = dv.getUint16(r + 8);
      const off = strOff + dv.getUint16(r + 10);
      let text = '';
      if (platform === 3 || platform === 0) {
        for (let j = 0; j < len; j += 2) text += String.fromCharCode(dv.getUint16(off + j));
      } else if (platform === 1) {
        for (let j = 0; j < len; j++) text += String.fromCharCode(dv.getUint8(off + j));
      } else continue;
      text = text.trim();
      if (!text) continue;
      // 偏好：繁中(0x404) > 英文(0x409) > 其他；16（排版家族名）> 1
      const score = (lang === 0x404 ? 4 : lang === 0x409 ? 3 : 1) + (nameId === 16 ? 0.5 : 0);
      if (!best || score > best.score) best = { score, text };
    }
    return best?.text ?? null;
  } catch {
    return null;
  }
}
