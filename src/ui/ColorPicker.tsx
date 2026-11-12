import { useState, useSyncExternalStore } from 'react';
import { ColorPopup } from './ColorPopup';

// 共用顏色選擇器：最近用過 → 基本 8 色 →（展開）粉嫩／莫蘭迪／螢光各 8 色；「自訂顏色」跳出彈窗（拖拉選色＋RGB 細調）。
// 資料格式還是一般的色碼字串，舊專案不用轉換。

export const PALETTE: { name: string; colors: string[] }[] = [
  {
    name: '基本',
    colors: ['#ffffff', '#111111', '#ff4d8d', '#ffd23f', '#4dd0ff', '#7CFC6A', '#b388ff', '#ff7a45'],
  },
  {
    name: '粉嫩',
    colors: ['#ffd1dc', '#ffe4b5', '#fff5ba', '#c8f7c5', '#c5f0f7', '#cfe0ff', '#e6d3ff', '#f5e1d3'],
  },
  {
    name: '莫蘭迪',
    colors: ['#c9a9a6', '#d6b99b', '#cfc7a1', '#a7b8a0', '#9fb7bd', '#9aa5b8', '#b3a1b8', '#8a8a8a'],
  },
  {
    name: '螢光',
    colors: ['#ff1744', '#ff6d00', '#ffea00', '#76ff03', '#00e5ff', '#2979ff', '#d500f9', '#ff4081'],
  },
];

const KEY = 'vc-recent-colors';
const MAX_RECENT = 8;
export const normalizeHex = (v: string): string | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(v.trim());
  return m ? `#${m[1]!.toLowerCase()}` : null;
};

// 最近用過：存在這台裝置的 localStorage，最新的在最前面
let recent: string[] = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((c): c is string => typeof c === 'string').slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
})();
const listeners = new Set<() => void>();
export function pushRecent(color: string) {
  const c = normalizeHex(color);
  if (!c) return;
  recent = [c, ...recent.filter((x) => x.toLowerCase() !== c)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(KEY, JSON.stringify(recent));
  } catch {
    /* 存不了就算了 */
  }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const useRecent = () => useSyncExternalStore(subscribe, () => recent);

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function ColorPicker({
  value,
  label,
  onPick,
  extra,
}: {
  value: string;
  label: string; // 無障礙名稱前綴，例如「文字顏色」→ 按鈕叫「文字顏色 #ffffff」
  onPick: (color: string) => void;
  /** 這個地方的預設色（例如裝飾的預設色），放在基本色最前面 */
  extra?: string;
}) {
  const [more, setMore] = useState(false);
  const [popup, setPopup] = useState(false);
  const recents = useRecent();
  const basic = PALETTE[0]!.colors;
  const first = extra && !basic.some((c) => same(c, extra)) ? [extra, ...basic.slice(0, 7)] : basic;
  const pick = (c: string) => {
    onPick(c);
    pushRecent(c);
  };
  const swatch = (c: string, name: string) => (
    <button
      key={`${name}${c}`}
      className={`swatch${same(value, c) ? ' active' : ''}`}
      style={{ background: c }}
      aria-label={`${name} ${c}`}
      aria-pressed={same(value, c)}
      onClick={() => pick(c)}
    />
  );
  return (
    <div className="color-picker" data-testid="color-picker">
      {recents.length > 0 && (
        <>
          <span className="color-tag">最近用過</span>
          <div className="color-row" aria-label="最近用過的顏色">
            {recents.map((c) => swatch(c, '最近用過'))}
          </div>
        </>
      )}
      <div className="color-row">{first.map((c) => swatch(c, label))}</div>
      {more && (
        <>
          {PALETTE.slice(1).map((g) => (
            <div className="color-row" key={g.name} aria-label={`${g.name}色`}>
              {g.colors.map((c) => swatch(c, label))}
            </div>
          ))}
        </>
      )}
      <div className="color-actions">
        <button
          className="chip sm more-colors"
          aria-expanded={more}
          aria-label={`${label} 更多顏色`}
          onClick={() => setMore(!more)}
        >
          {more ? '收起 ▴' : '更多顏色 ▾'}
        </button>
        <button
          className="chip sm custom-btn"
          aria-label={`${label} 自訂顏色`}
          onClick={() => setPopup(true)}
        >
          <span className="custom-dot" style={{ background: value }} aria-hidden="true" />
          自訂顏色
        </button>
      </div>
      {popup && (
        <ColorPopup
          initial={normalizeHex(value) ?? '#ffffff'}
          label={label}
          onCancel={() => setPopup(false)}
          onConfirm={(c) => {
            pick(c);
            setPopup(false);
          }}
        />
      )}
    </div>
  );
}
