import { Fragment, type FC } from "react";
import type { Shortcut } from "../../types/sheet";
import KeyBadge from "../KeyBadge/KeyBadge";

interface ShortcutGridProps {
  /** Shortcuts to display for the active page. */
  shortcuts: Shortcut[];
}

/**
 * Two-column grid: key display | description.
 * For sequences like ["Ctrl+B", "D"], renders: [Ctrl+B] → [D]
 * For chords like ["Ctrl+B+%"], renders: [Ctrl+B+%]
 */
const ShortcutGrid: FC<ShortcutGridProps> = ({ shortcuts }) => {
  return (
    <div className="grid grid-cols-[1fr_1.5fr] gap-x-4 gap-y-1.5 px-4 py-3">
      {shortcuts.map((shortcut, i) => (
        <Fragment key={i}>
          {/* Key column */}
          <div className="flex items-center gap-1">
            {shortcut.keys.map((k, j) => (
              <span key={j} className="flex items-center gap-1">
                {j > 0 && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500" aria-hidden="true">
                    →
                  </span>
                )}
                <KeyBadge keyStr={k} />
              </span>
            ))}
          </div>
          {/* Description column */}
          <div className="flex items-center text-sm text-zinc-600 dark:text-zinc-300">
            {shortcut.description}
          </div>
        </Fragment>
      ))}
    </div>
  );
};
export default ShortcutGrid;
