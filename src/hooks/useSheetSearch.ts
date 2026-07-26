import { useMemo } from "react";
import type { Sheet, Shortcut } from "../types/sheet";

export interface SearchResult {
  sheetId: string;
  sheetDisplayName: string;
  sheetIcon?: Sheet["icon"];
  pageIndex: number;
  pageName: string;
  shortcut: Shortcut;
  /** Index of this shortcut within its page — used as React key. */
  shortcutIndex: number;
}

/**
 * Search all shortcuts across all sheets by description and keys.
 * Returns results grouped by sheet then page, capped at 30.
 * Empty query returns no results.
 */
export function useSheetSearch(
  query: string,
  allSheets: Sheet[],
): SearchResult[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: SearchResult[] = [];

    for (const sheet of allSheets) {
      for (let pi = 0; pi < sheet.pages.length; pi++) {
        const page = sheet.pages[pi]!;
        for (let si = 0; si < page.shortcuts.length; si++) {
          const shortcut = page.shortcuts[si]!;

          // Match against description
          const descMatch = shortcut.description.toLowerCase().includes(q);

          // Match against joined keys string
          const keysStr = shortcut.keys.join(" ");
          const keysMatch = keysStr.toLowerCase().includes(q);

          if (descMatch || keysMatch) {
            results.push({
              sheetId: sheet.app,
              sheetDisplayName: sheet.display_name,
              sheetIcon: sheet.icon,
              pageIndex: pi,
              pageName: page.name,
              shortcut,
              shortcutIndex: si,
            });
          }

          // Cap at 30 results
          if (results.length >= 30) return results;
        }
      }
    }

    return results;
  }, [query, allSheets]);
}
