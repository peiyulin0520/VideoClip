import type { ReactNode } from 'react';

/** 從底部滑出的面板；點背景關閉。 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  tall,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 高的面板（片段標記軸）：最高一個螢幕、內容太多可以在裡面捲 */
  tall?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className={`sheet${tall ? ' tall' : ''}`}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-title">{title}</div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmText,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <p className="sheet-msg">{message}</p>
      <div className="sheet-row">
        <button className="btn" onClick={onClose}>
          取消
        </button>
        <button
          className="btn danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmText}
        </button>
      </div>
    </Sheet>
  );
}
