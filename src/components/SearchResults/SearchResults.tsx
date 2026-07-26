import { type FC, useCallback, useEffect, useState } from "react";
import type { SearchResult } from "../../hooks/useSheetSearch";
import SheetIcon from "../SheetIcon/SheetIcon";
import KeyBadge from "../KeyBadge/KeyBadge";

interface SearchResultsProps {
  /** Search results to display. */
  results: SearchResult[];
  /** Whether the query cap was hit (30+ matches). */
  capped: boolean;
  /** Callback when a result is selected — switches sheet and navigates to page. */
  onSelect: (result: SearchResult) => void;
}

/**
 * Displays search results grouped by sheet then page.
 * Each group header shows sheet icon + name › page name.
 * Keyboard navigable: arrow keys move selection, Enter confirms.
 */
const SearchResults: FC<SearchResultsProps> = ({ results, capped, onSelect }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Clamp selection if it somehow exceeds the list
  const clampedIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results[clampedIndex]) {
        e.preventDefault();
        onSelect(results[clampedIndex]);
      }
    },
    [results, clampedIndex, onSelect],
  );

  if (results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-zinc-400 dark:text-zinc-500 py-8">
        No results found
      </div>
    );
  }

  // Group results by sheet+page for visual sectioning
  type GroupKey = string;
  const groups = new Map<GroupKey, SearchResult[]>();
  for (const r of results) {
    const key: GroupKey = `${r.sheetId}::${r.pageIndex}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  return (
    <div
      className="flex-1 overflow-y-auto outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Result counter */}
      <div className="px-4 pt-2 pb-1 text-xs text-zinc-400 dark:text-zinc-500">
        {results.length} result{results.length !== 1 ? "s" : ""}
        {capped && " — refine your search for more"}
      </div>

      {[...groups.entries()].map(([key, groupResults]) => {
        const first = groupResults[0]!;
        return (
          <div key={key}>
            {/* Group header: sheet icon + name › page name */}
            <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100/50 dark:bg-zinc-800/50 border-t border-zinc-200/50 dark:border-zinc-700/50">
              <SheetIcon
                appId={first.sheetId}
                displayName={first.sheetDisplayName}
                icon={first.sheetIcon}
                className="h-4 w-4"
              />
              <span className="font-medium">{first.sheetDisplayName}</span>
              <span className="text-zinc-400 dark:text-zinc-600" aria-hidden="true">›</span>
              <span>{first.pageName}</span>
            </div>

            {/* Shortcut rows */}
            {groupResults.map((r) => {
              const globalIndex = results.indexOf(r);
              const isSelected = globalIndex === clampedIndex;
              return (
                <div
                  key={`${r.sheetId}-${r.pageIndex}-${r.shortcutIndex}`}
                  data-search-index={globalIndex}
                  className={`grid grid-cols-[1fr_1.5fr] gap-x-4 gap-y-0 px-4 py-1.5 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-blue-100 dark:bg-blue-900/30 text-zinc-900 dark:text-white"
                      : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                  onClick={() => onSelect(r)}
                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                >
                  {/* Key column */}
                  <div className="flex items-center gap-1">
                    {r.shortcut.keys.map((k, j) => (
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
                  <div className="flex items-center text-sm">
                    {r.shortcut.description}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default SearchResults;
