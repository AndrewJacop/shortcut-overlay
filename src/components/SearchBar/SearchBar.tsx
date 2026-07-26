import { type FC, useEffect, useRef } from "react";

interface SearchBarProps {
  /** Current query value. */
  query: string;
  /** Callback when query changes. */
  onQueryChange: (query: string) => void;
  /** Callback to close search. */
  onClose: () => void;
}

/**
 * Search input for global shortcut search.
 * Displays a `/` prefix, auto-focuses on mount.
 */
const SearchBar: FC<SearchBarProps> = ({ query, onQueryChange, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
      <span className="text-zinc-400 dark:text-zinc-500 text-sm font-mono">/</span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search shortcuts…"
        className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
        spellCheck={false}
      />
      <button
        onClick={onClose}
        className="rounded p-1 text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Close search"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
};

export default SearchBar;
