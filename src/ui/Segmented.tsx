/**
 * 第 2 層選單（面板裡的區塊切換，例如 文字／版面／字塊…）：一整條淺色底，選中的那一格是白底＋陰影，
 * 不用強調色——跟底部分頁（第 1 層）和分類小膠囊（第 3 層）一眼分得出來。
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          role="tab"
          aria-selected={value === o}
          className={`seg${value === o ? ' on' : ''}`}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
