import type { TextItem } from '../../model/types';
import { kineticById } from '../../engine/kinetic';
import { kineticFrame } from '../../engine/kinetic/hit';
import { DEFAULT_FADE_W } from '../../engine/kinetic/render';
import { useUI } from '../../store/uiStore';

/** 動態字卡設定視窗開著、選了邊緣淡出：在預覽上標出淡出的範圍（半透明色帶＋虛線）；只在編輯時顯示，不畫進影片 */
export function KineticFadeGuide({ item, k, W, H }: { item: TextItem; k: number; W: number; H: number }) {
  const id = useUI((s) => s.kineticFadeGuide);
  const kn = item.kinetic;
  if (!kn || id !== item.id) return null;
  const fade = kn.fade ?? kineticById(kn.id)?.fade ?? 'none';
  if (fade === 'none') return null;
  const f = kineticFrame(item, W, H);
  const sc = item.transform.scale;
  const w = kn.fadeW ?? DEFAULT_FADE_W;
  const v = fade === 'v';
  const band = `${w * 100}%`;
  return (
    <div
      className="kf-guide"
      data-testid="kn-fade-guide"
      style={{
        left: item.transform.x * W * k,
        top: item.transform.y * H * k,
        width: f.w * sc * k,
        height: f.h * sc * k,
        transform: `translate(-50%, -50%) rotate(${item.transform.rotation}deg)`,
      }}
    >
      {[0, 1].map((end) => (
        <i
          key={end}
          className={`kf-band ${v ? 'v' : 'h'} ${end === 0 ? 'a' : 'b'}`}
          style={v ? { height: band } : { width: band }}
        />
      ))}
    </div>
  );
}
