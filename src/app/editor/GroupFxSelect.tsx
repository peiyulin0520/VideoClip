import { TRANSITION_CATS, TRANSITIONS } from '../../engine/transitions';
import type { TransitionKind } from '../../model/types';

/** 版型整體的進場／出場特效選單（可以選「無」）；分類用群組顯示 */
export function GroupFxSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TransitionKind | '';
  onChange: (v: TransitionKind | '') => void;
}) {
  return (
    <label className="group-fx">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as TransitionKind | '')}
      >
        <option value="">無</option>
        {TRANSITION_CATS.map((c) => (
          <optgroup key={c} label={c}>
            {TRANSITIONS.filter((t) => t.cat === c).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
