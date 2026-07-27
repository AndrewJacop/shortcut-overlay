import { useMemo } from "react";
import type { Sheet, Shortcut } from "../types/sheet";

export interface SearchResult {
	sheetId: string;
	sheetDisplayName: string;
	sheetIcon?: Sheet["icon"];
	pageIndex: number;
	pageName: string;
	/** Section title when the shortcut lives in a section (undefined for flat pages). */
	sectionName?: string;
	/** Section index when the shortcut lives in a section. */
	sectionIndex?: number;
	shortcut: Shortcut;
	/** Index of this shortcut within its section (or page for flat pages) — used as React key. */
	shortcutIndex: number;
}

/**
 * Search all shortcuts across all sheets by description and keys.
 * Flattens through page `sections` when present, otherwise the flat `shortcuts`.
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
				// Flatten to groups: one per section, or a single flat group.
				const hasSections = !!page.sections && page.sections.length > 0;
				const groups: {
					shortcuts: Shortcut[];
					sectionName?: string;
					sectionIndex?: number;
				}[] = hasSections
					? page.sections!.map((s, si) => ({
							shortcuts: s.shortcuts,
							sectionName: s.name,
							sectionIndex: si,
						}))
					: [{ shortcuts: page.shortcuts }];

				for (const group of groups) {
					for (let si = 0; si < group.shortcuts.length; si++) {
						const shortcut = group.shortcuts[si]!;

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
								sectionName: group.sectionName,
								sectionIndex: group.sectionIndex,
								shortcut,
								shortcutIndex: si,
							});
						}

						// Cap at 30 results
						if (results.length >= 30) return results;
					}
				}
			}
		}

		return results;
	}, [query, allSheets]);
}
