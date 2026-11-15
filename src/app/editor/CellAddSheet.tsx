import { useRef, useState } from 'react';
import { ColorPicker } from '../../ui/ColorPicker';
import { Sheet } from '../../ui/Sheet';
import { addFilesToCell } from './cellImport';
import { addColorToCell } from './cellColor';

/** 版型某一格列尾的「＋」：加影片／照片（從相簿）或一段色塊 */
export function CellAddSheet({
  projectId,
  trackId,
  index,
  onClose,
}: {
  projectId: string;
  trackId: string;
  index: number;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [color, setColor] = useState('#ffd23f');
  return (
    <Sheet open title={`加到第 ${index + 1} 格`} onClose={onClose}>
      <button className="menu-item" data-testid="cell-add-media" onClick={() => fileRef.current?.click()}>
        影片／照片
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        multiple
        hidden
        data-testid="cell-add-file"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = '';
          onClose();
          void addFilesToCell(projectId, trackId, files);
        }}
      />
      <div className="zone-soft" data-testid="cell-add-color-zone">
        <ColorPicker label="色塊顏色" value={color} onPick={setColor} />
        <button
          className="btn primary"
          data-testid="cell-add-color"
          onClick={() => {
            onClose();
            void addColorToCell(projectId, trackId, color);
          }}
        >
          加入色塊
        </button>
      </div>
    </Sheet>
  );
}
