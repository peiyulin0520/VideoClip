// 裁切工具的單色圖示（跟著文字顏色）：lucide 沒有的兩個自己畫。

type P = { size?: number };

/** 一般裁切：四邊形外框（無底色）＋四個角的實心小圓點 */
export function CropRectIcon({ size = 18 }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="5.5" width="15" height="13" />
      <g fill="currentColor" stroke="none">
        <circle cx="4.5" cy="5.5" r="2.2" />
        <circle cx="19.5" cy="5.5" r="2.2" />
        <circle cx="4.5" cy="18.5" r="2.2" />
        <circle cx="19.5" cy="18.5" r="2.2" />
      </g>
    </svg>
  );
}

/** 自由裁切：不規則的封閉形狀（只有外框） */
export function CropFreeIcon({ size = 18 }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 8.5 C6 4.8 10.5 3.6 14 5 C17.5 6.2 20.2 8.4 19.4 12.2 C18.8 15.6 15.4 14.8 14.6 17.6 C13.8 20.4 9.4 20.6 6.6 18.2 C4 16 3.8 11.6 5 8.5 Z" />
    </svg>
  );
}
