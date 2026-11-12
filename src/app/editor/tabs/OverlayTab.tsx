/** 疊加分頁：把影片、照片疊在目前這一秒（畫中畫）；貼圖在「素材」、版型在「版型」 */
export function OverlayTab({ onImportOverlay }: { onImportOverlay: () => void }) {
  return (
    <div className="panel">
      <p className="hint">
        疊加的影片、照片會放在播放頭這一秒，同一秒可以疊很多個（每個放在自己的軌道）。加好後在預覽上點一下選取、拖移、雙指縮放旋轉；貼圖在「素材」，多格版型在「版型」。
      </p>
      <button className="btn primary done" onClick={onImportOverlay}>
        ＋ 加入影片或照片（疊在目前這一秒）
      </button>
    </div>
  );
}
