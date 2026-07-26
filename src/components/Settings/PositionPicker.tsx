import { type FC, useCallback } from "react";
import type { OverlayPosition } from "../../types/config";

/** All 9 positions in grid order (top-left → bottom-right, row by row). */
const POSITIONS: OverlayPosition[] = [
  "top_left",
  "top_center",
  "top_right",
  "mid_left",
  "center",
  "mid_right",
  "bottom_left",
  "bottom_center",
  "bottom_right",
];

/** Arrow labels for each cell. */
const LABELS: Record<OverlayPosition, string> = {
  top_left: "↖",
  top_center: "↑",
  top_right: "↗",
  mid_left: "←",
  center: "⊙",
  mid_right: "→",
  bottom_left: "↙",
  bottom_center: "↓",
  bottom_right: "↘",
};

interface PositionPickerProps {
  value: OverlayPosition;
  onChange: (pos: OverlayPosition) => void;
}

/**
 * 3×3 grid picker for overlay anchor position.
 * Active cell highlighted with a blue ring.
 */
const PositionPicker: FC<PositionPickerProps> = ({ value, onChange }) => {
  const handleClick = useCallback(
    (pos: OverlayPosition) => {
      onChange(pos);
    },
    [onChange],
  );

  return (
    <div className="grid grid-cols-3 gap-1.5 w-fit">
      {POSITIONS.map((pos) => {
        const isActive = pos === value;
        return (
          <button
            key={pos}
            onClick={() => handleClick(pos)}
            className={`flex items-center justify-center w-10 h-8 rounded text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isActive
                ? "bg-blue-600 text-white ring-2 ring-blue-400"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
            aria-label={pos.replace(/_/g, " ")}
            aria-pressed={isActive}
          >
            {LABELS[pos]}
          </button>
        );
      })}
    </div>
  );
};

export default PositionPicker;
