import { type FC, useCallback, useState } from "react";
import type { MonitorTarget } from "../../types/config";

interface MonitorSelectorProps {
  value: MonitorTarget;
  onChange: (monitor: MonitorTarget) => void;
}

/**
 * Radio group for monitor target selection.
 * "Active window" is disabled with a tooltip (v1.0 feature).
 * "Specific" reveals a number input for the monitor index.
 */
const MonitorSelector: FC<MonitorSelectorProps> = ({ value, onChange }) => {
  const [specificIndex, setSpecificIndex] = useState(() =>
    value.type === "index" ? (value as { type: "index"; value: number }).value : 0,
  );

  const activeType =
    value.type === "index" ? "index" : value.type;

  const handleChange = useCallback(
    (type: string) => {
      if (type === "primary") {
        onChange({ type: "primary" });
      } else if (type === "cursor") {
        onChange({ type: "cursor" });
      } else if (type === "active_window") {
        // Disabled — v1.0
        return;
      } else if (type === "index") {
        onChange({ type: "index", value: specificIndex });
      }
    },
    [onChange, specificIndex],
  );

  const handleIndexChange = useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, newIndex);
      setSpecificIndex(clamped);
      onChange({ type: "index", value: clamped });
    },
    [onChange],
  );

  type RadioOption = {
    id: string;
    label: string;
    disabled?: boolean;
    tooltip?: string;
  };

  const options: RadioOption[] = [
    { id: "primary", label: "Primary" },
    { id: "cursor", label: "Follow cursor" },
    { id: "active_window", label: "Active window", disabled: true, tooltip: "Coming in v1.0" },
    { id: "index", label: "Specific" },
  ];

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label
          key={opt.id}
          className={`flex items-center gap-2 text-sm ${
            opt.disabled
              ? "text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
              : "cursor-pointer"
          }`}
          title={opt.tooltip}
        >
          <input
            type="radio"
            name="monitor"
            value={opt.id}
            checked={activeType === opt.id}
            onChange={() => handleChange(opt.id)}
            disabled={opt.disabled}
            className="accent-blue-600"
          />
          <span>{opt.label}</span>
          {opt.id === "index" && activeType === "index" && (
            <input
              type="number"
              min={0}
              value={specificIndex}
              onChange={(e) => handleIndexChange(parseInt(e.target.value, 10) || 0)}
              className="w-14 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-0.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </label>
      ))}
    </div>
  );
};

export default MonitorSelector;
