import { type FC, useCallback } from "react";

interface OpacitySliderProps {
  /** Current opacity 0.0–1.0 */
  value: number;
  /** Called on every change (live update — no debounce needed for range). */
  onChange: (opacity: number) => void;
}

/**
 * Range slider for overlay opacity.
 * Displays percentage (50–100%), stored as 0.0–1.0 in config.
 */
const OpacitySlider: FC<OpacitySliderProps> = ({ value, onChange }) => {
  const percent = Math.round(value * 100);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const pct = parseInt(e.target.value, 10);
      onChange(pct / 100);
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={50}
        max={100}
        value={percent}
        onChange={handleChange}
        className="h-2 w-40 cursor-pointer accent-blue-600"
        aria-label="Overlay opacity"
      />
      <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300 w-10 text-right">
        {percent}%
      </span>
    </div>
  );
};

export default OpacitySlider;
