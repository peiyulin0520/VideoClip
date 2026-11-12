// 介面主題：存在這台手機（localStorage `vc-theme`），設定頁切換。預覽畫面本身永遠是黑底。
// 顏色全部在 styles.css 的 :root[data-theme=…] 變數；這裡只負責選擇、記住、套用。

export type ThemeId = 'dark' | 'mono' | 'fresh' | 'warm';

export const THEMES: {
  id: ThemeId;
  name: string;
  desc: string;
  colors: [string, string, string, string];
  bar: string;
}[] = [
  {
    id: 'dark',
    name: '暗黑',
    desc: '預設，深色底、粉紅重點',
    colors: ['#111111', '#1c1c1c', '#f4f4f4', '#ff4d8d'],
    bar: '#111111',
  },
  {
    id: 'mono',
    name: '黑白',
    desc: '白底黑字，像簡潔的網頁',
    colors: ['#ffffff', '#ececec', '#111111', '#111111'],
    bar: '#ffffff',
  },
  {
    id: 'fresh',
    name: '清新',
    desc: '淺色底、薄荷綠重點',
    colors: ['#f4fbf9', '#e3f3f0', '#1d3b38', '#0b7f72'],
    bar: '#f4fbf9',
  },
  {
    id: 'warm',
    name: '溫暖',
    desc: '米色底、磚紅重點、深咖啡字',
    colors: ['#f6f0e6', '#efe5d6', '#3b2a20', '#b8553a'],
    bar: '#f6f0e6',
  },
];

const KEY = 'vc-theme';
const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    return isTheme(v) ? v : 'dark';
  } catch {
    return 'dark';
  }
}

/** 套用到整個頁面（html 的 data-theme、手機狀態列顏色） */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  if (id === 'dark') delete root.dataset.theme;
  else root.dataset.theme = id;
  const bar = THEMES.find((t) => t.id === id)!.bar;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar);
}

export function setTheme(id: ThemeId) {
  try {
    if (id === 'dark') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    /* 存不了就只換這一次 */
  }
  applyTheme(id);
}
