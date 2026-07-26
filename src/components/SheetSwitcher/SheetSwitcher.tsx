import {
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useOverlayStore } from "../../stores/useOverlayStore";
import SheetIcon from "../SheetIcon/SheetIcon";

/**
 * Command-palette-style sheet switcher.
 * - Triggered by Ctrl+K (wired in Overlay.tsx)
 * - Filters sheets by display_name as user types
 * - Arrow Up/Down navigates, Enter selects, Escape closes
 */
const SheetSwitcher: FC = () => {
  const { allSheets, activeSheetId, switchSheet, setSwitcherOpen } =
    useOverlayStore();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filtered list of sheets matching query
  const filtered = useMemo(() => {
    if (!query.trim()) return allSheets;
    const lower = query.toLowerCase();
    return allSheets.filter((s) =>
      s.display_name.toLowerCase().includes(lower)
    );
  }, [allSheets, query]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const selected = listEl.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleClose = useCallback(() => {
    setSwitcherOpen(false);
  }, [setSwitcherOpen]);

  const handleSelect = useCallback(
    async (appId: string) => {
      await switchSheet(appId);
      setSwitcherOpen(false);
    },
    [switchSheet, setSwitcherOpen]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) =>
            i < filtered.length - 1 ? i + 1 : i
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i > 0 ? i - 1 : i));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[selectedIndex]) {
            void handleSelect(filtered[selectedIndex].app);
          }
          break;
        case "Escape":
          e.preventDefault();
          handleClose();
          break;
        case "Tab": {
          // Focus trap: cycle between input and result items
          e.preventDefault();
          const panel = listRef.current?.parentElement;
          if (!panel) return;
          const focusable = panel.querySelectorAll<HTMLElement>(
            "input, button"
          );
          if (focusable.length === 0) return;
          const active = document.activeElement;
          const idx = Array.from(focusable).indexOf(active as HTMLElement);
          const next = e.shiftKey
            ? idx <= 0
              ? focusable.length - 1
              : idx - 1
            : idx >= focusable.length - 1
              ? 0
              : idx + 1;
          focusable[next]?.focus();
          break;
        }
      }
    },
    [filtered, selectedIndex, handleSelect, handleClose]
  );

  return (
    // Backdrop — clicking outside closes
    <div
      className="absolute inset-0 z-50 flex items-start justify-center pt-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Panel */}
      <div
        className="w-80 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="border-b border-zinc-200 dark:border-zinc-700 px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Switch sheet…"
            className="w-full bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none"
          />
        </div>

        {/* Focus-trap sentinel — catches focus at panel boundary */}
        <div tabIndex={-1} className="sr-only" aria-hidden="true" />

        {/* Results list */}
        <div
          ref={listRef}
          className="max-h-64 overflow-y-auto py-1"
        >
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-zinc-400 dark:text-zinc-500">
              No sheets found
            </div>
          )}
          {filtered.map((sheet, i) => {
            const isActive = sheet.app === activeSheetId;
            const isSelected = i === selectedIndex;
            return (
              <button
                key={sheet.app}
                className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors ${
                  isSelected
                    ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-white"
                    : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
                onClick={() => void handleSelect(sheet.app)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <SheetIcon
                  appId={sheet.app}
                  displayName={sheet.display_name}
                  icon={sheet.icon}
                  className="h-5 w-5 shrink-0"
                />
                <span className="truncate">{sheet.display_name}</span>
                {isActive && (
                  <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">active</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 dark:text-zinc-600">
          ↑↓ navigate · Enter select · Esc close
        </div>
      </div>
    </div>
  );
};

export default SheetSwitcher;
