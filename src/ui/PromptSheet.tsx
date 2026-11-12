import { useState } from 'react';
import { Sheet } from './Sheet';

/** 輸入一行文字的小面板（改名、命名用）。開著的時候才會建立，所以每次打開都從 initial 開始。 */
export function PromptSheet({
  open,
  title,
  label,
  initial,
  placeholder,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {open && (
        <PromptBody
          label={label}
          initial={initial}
          placeholder={placeholder}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function PromptBody({
  label,
  initial,
  placeholder,
  onSubmit,
  onClose,
}: {
  label: string;
  initial: string;
  placeholder?: string;
  onSubmit: (v: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <>
      <input
        className="text-input"
        aria-label={label}
        value={draft}
        maxLength={40}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
      />
      <div className="sheet-row">
        <button className="btn" onClick={onClose}>
          取消
        </button>
        <button
          className="btn primary"
          onClick={() => {
            onSubmit(draft.trim());
            onClose();
          }}
        >
          確定
        </button>
      </div>
    </>
  );
}
