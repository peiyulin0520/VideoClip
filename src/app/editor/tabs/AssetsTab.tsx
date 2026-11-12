import { StickerPicker } from '../StickerPicker';

/** 素材分頁：貼圖（內建、GIPHY、我的貼圖）；之後放畫畫 */
export function AssetsTab() {
  return (
    <div className="panel">
      <div className="panel-head">
        <span>貼圖</span>
      </div>
      <StickerPicker />
      <p className="hint">畫畫功能之後會加在這裡。</p>
    </div>
  );
}
