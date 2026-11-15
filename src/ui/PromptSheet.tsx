import { useState } from 'react';
import { toast } from '../store/uiStore';
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
      {open && <PromptBody label={label} initial={initial} placeholder={placeholder} onSubmit={onSubmit} />}
    </Sheet>
  );
}

function PromptBody({
  label,
  initial,
  placeholder,
  onSubmit,
}: {
  label: string;
  initial: string;
  placeholder?: string;
  onSubmit: (v: string) => void;
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
        <button
          className="btn primary"
          onClick={() => {
            onSubmit(draft.trim());
            toast('已儲存');
          }}
        >
          儲存
        </button>
      </div>
    </>
  );
}
