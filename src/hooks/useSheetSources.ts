import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SheetSource } from "../types/sheet";

interface UseSheetSourcesResult {
	/** All loaded sheets with their source, sorted by display name (Rust side). */
	sources: SheetSource[];
	/** Re-fetch the sheet sources on demand. */
	refresh: () => Promise<void>;
}

/**
 * Load the installed sheets with their sources (bundled vs user) and keep
 * the list in sync across windows via the `sheets_updated` event — the same
 * event `install_sheet` / `uninstall_sheet` emit after any change.
 *
 * `get_sheet_sources` returns the data already sorted by display name, so
 * consumers can render it directly. A fetch failure leaves the previous
 * list in place rather than blanking the UI.
 */
export function useSheetSources(): UseSheetSourcesResult {
	const [sources, setSources] = useState<SheetSource[]>([]);

	const refresh = useCallback(async () => {
		try {
			setSources(await invoke<SheetSource[]>("get_sheet_sources"));
		} catch {
			/* leave the previous list in place */
		}
	}, []);

	// Load once on mount.
	useEffect(() => {
		void refresh();
	}, [refresh]);

	// Re-fetch whenever any window installs / uninstalls a sheet.
	useEffect(() => {
		const promise = listen("sheets_updated", () => {
			void refresh();
		});
		return () => {
			promise.then((unlisten) => unlisten());
		};
	}, [refresh]);

	return { sources, refresh };
}
