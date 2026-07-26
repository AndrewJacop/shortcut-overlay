import type { FC } from "react";

interface KeyBadgeProps {
  /** The key string to render (e.g. "Ctrl+B", "D"). */
  keyStr: string;
}

/**
 * Renders a single key segment as a pill/badge.
 * e.g. <KeyBadge keyStr="Ctrl+B" /> → [Ctrl+B]
 */
const KeyBadge: FC<KeyBadgeProps> = ({ keyStr }) => {
  return (
    <kbd className="inline-flex items-center rounded border border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-500 dark:bg-zinc-700 dark:text-zinc-100 px-2 py-0.5 text-xs font-mono">
      {keyStr}
    </kbd>
  );
};

export default KeyBadge;
