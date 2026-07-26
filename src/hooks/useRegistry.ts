import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RegistryIndex } from "../types/registry";

/**
 * Default registry index URL.
 *
 * TEMPORARY: points at a paste.rs-hosted index for pre-v1.0 manual
 * testing. The canonical home is the `shortcut-overlay/sheets` GitHub
 * repo; switch back once that exists. Served via the Rust
 * `fetch_remote_text` command, so CORS is not a concern.
 */
export const REGISTRY_URL = "https://paste.rs/GUukB";

interface UseRegistryResult {
	/** The fetched index, or null while loading / on error. */
	index: RegistryIndex | null;
	/** True while a fetch is in flight. */
	loading: boolean;
	/** Human-readable error string if the last fetch failed, else null. */
	error: string | null;
	/** Re-run the fetch (used by the Retry button). */
	fetchIndex: () => void;
}

/**
 * Fetch and cache the community sheet registry index.
 *
 * Fetches once on mount and exposes `fetchIndex` for manual retries. The
 * URL is overridable so tests / local development can point at a fixture.
 * Network failures never throw out of the hook — they set `error` instead,
 * so the UI can render a recoverable error state.
 */
export function useRegistry(url: string = REGISTRY_URL): UseRegistryResult {
	const [index, setIndex] = useState<RegistryIndex | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchIndex = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const text = await invoke<string>("fetch_remote_text", { url });
			const data = JSON.parse(text) as RegistryIndex;
			if (!data || !Array.isArray(data.sheets)) {
				throw new Error("Registry response is missing a 'sheets' array");
			}
			setIndex(data);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, [url]);

	// Auto-fetch on mount (and whenever the URL changes).
	useEffect(() => {
		void fetchIndex();
	}, [fetchIndex]);

	return { index, loading, error, fetchIndex };
}
