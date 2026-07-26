import { type FC, useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SheetIcon as SheetIconType, SheetMeta } from "../../types/sheet";
import type { RegistryEntry } from "../../types/registry";
import { useRegistry } from "../../hooks/useRegistry";
import { useSheetSources } from "../../hooks/useSheetSources";
import type { ToastFn } from "./Toast";
import SheetIcon from "../SheetIcon/SheetIcon";

interface RegistryBrowserProps {
	/** Return to the previous settings view (Sheets list / general settings). */
	onBack: () => void;
	/** Close the settings window entirely. */
	onClose: () => void;
	/** Transient install feedback (v0.4 Step 6). */
	onToast?: ToastFn;
}

/** Per-row install lifecycle state (keyed by registry entry id). */
type RowState =
	| { status: "idle" }
	| { status: "installing" }
	| { status: "error"; message: string };

/** How many skeleton rows to show while the index loads. */
const SKELETON_COUNT = 4;

/**
 * Convert a registry `icon` string (emoji or URL) into the structured
 * SheetIcon type the shared <SheetIcon /> component expects.
 * Anything that isn't an http(s) URL is treated as an emoji glyph.
 */
function entryIcon(icon?: string): SheetIconType | undefined {
	if (!icon) return undefined;
	if (/^https?:\/\//i.test(icon)) {
		return { type: "url", value: icon };
	}
	return { type: "emoji", value: icon };
}

interface RegistryRowProps {
	entry: RegistryEntry;
	/** Lifecycle state for this row's install button. */
	state: RowState;
	/** Whether this sheet is already user-installed. */
	isInstalled: boolean;
	/** Trigger the download + install flow for this row. */
	onInstall: (entry: RegistryEntry) => void;
}

/**
 * A single registry entry: icon, metadata, tags, and the install affordance.
 * Extracted from RegistryBrowser so the browser render stays focused on the
 * loading / error / empty / list states.
 */
const RegistryRow: FC<RegistryRowProps> = ({
	entry,
	state,
	isInstalled,
	onInstall,
}) => {
	const busy = state.status === "installing";
	return (
		<li className="flex items-start gap-3 rounded border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
			<SheetIcon
				appId={entry.id}
				displayName={entry.display_name}
				icon={entryIcon(entry.icon)}
				className="mt-0.5 h-7 w-7 shrink-0"
			/>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
					<span className="text-sm font-semibold text-zinc-900 dark:text-white">
						{entry.display_name}
					</span>
					{entry.author && (
						<span className="text-xs text-zinc-500 dark:text-zinc-400">
							{entry.author}
						</span>
					)}
					{entry.version && (
						<span className="text-xs text-zinc-400 dark:text-zinc-500">
							v{entry.version}
						</span>
					)}
				</div>
				{entry.description && (
					<p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
						{entry.description}
					</p>
				)}
				{entry.tags && entry.tags.length > 0 && (
					<div className="mt-1 flex flex-wrap gap-1">
						{entry.tags.map((tag) => (
							<span
								key={tag}
								className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-700/60 dark:text-zinc-400"
							>
								#{tag}
							</span>
						))}
					</div>
				)}
				{state.status === "error" && (
					<p className="mt-1 break-words text-xs text-red-600 dark:text-red-400">
						{state.message}
					</p>
				)}
			</div>
			<div className="shrink-0 self-center">
				{isInstalled ? (
					<span
						className="inline-flex items-center gap-1 rounded bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300"
						title="Already installed"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-3.5 w-3.5"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fillRule="evenodd"
								d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
								clipRule="evenodd"
							/>
						</svg>
						Installed
					</span>
				) : (
					<button
						onClick={() => onInstall(entry)}
						disabled={busy}
						className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{busy
							? "Installing…"
							: state.status === "error"
								? "Retry"
								: "Install"}
					</button>
				)}
			</div>
		</li>
	);
};

/**
 * Browse the community sheet registry: a searchable list of sheets fetched
 * from {@link REGISTRY_URL}. Each row offers one-click install, which
 * downloads the sheet YAML and pipes it through `install_sheet` (which
 * validates before writing). Already-user-installed sheets show an
 * "Installed" badge instead of the install button.
 *
 * Renders loading (skeleton), error (retry), empty-search, and populated
 * states. Installed status is derived from `get_sheet_sources` and kept in
 * sync via the `sheets_updated` event so installs from any window reflect
 * here immediately.
 *
 * Fills its parent container — the host (settings window / future Sheets
 * tab) provides the themed, sized shell.
 */
const RegistryBrowser: FC<RegistryBrowserProps> = ({
	onBack,
	onClose,
	onToast,
}) => {
	const { index, loading, error, fetchIndex } = useRegistry();
	const { sources, refresh } = useSheetSources();
	const [query, setQuery] = useState("");
	const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

	// Installed rows = user-installed app ids. Derived from useSheetSources,
	// which re-fetches on the `sheets_updated` event so installs from any
	// window badge here immediately.
	const installedIds = useMemo(
		() =>
			new Set(
				sources.filter((s) => s.source === "user").map((s) => s.meta.app),
			),
		[sources],
	);

	// Client-side filter over display name, description, and tags.
	const filtered = useMemo<RegistryEntry[]>(() => {
		if (!index) return [];
		const q = query.trim().toLowerCase();
		if (!q) return index.sheets;
		return index.sheets.filter((e) => {
			const inName = e.display_name.toLowerCase().includes(q);
			const inDesc = e.description?.toLowerCase().includes(q) ?? false;
			const inTags = e.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
			return inName || inDesc || inTags;
		});
	}, [index, query]);

	const handleInstall = useCallback(async (entry: RegistryEntry) => {
		setRowStates((prev) => ({
			...prev,
			[entry.id]: { status: "installing" },
		}));
		try {
			const content = await invoke<string>("fetch_remote_text", {
				url: entry.download_url,
			});
			// install_sheet re-validates on the Rust side before writing.
			await invoke<SheetMeta>("install_sheet", { content });
			// Refresh the installed list now so the badge flips immediately
			// (the sheets_updated event still notifies other windows).
			void refresh();
			onToast?.("success", `Sheet installed: ${entry.display_name}`);
			setRowStates((prev) => ({ ...prev, [entry.id]: { status: "idle" } }));
		} catch (e) {
			setRowStates((prev) => ({
				...prev,
				[entry.id]: {
					status: "error",
					message: e instanceof Error ? e.message : String(e),
				},
			}));
		}
	}, []);

	const sheetCount = index?.sheets.length ?? 0;

	return (
		<div className="flex h-full w-full flex-col bg-white text-zinc-900 dark:bg-zinc-900 dark:text-white">
			{/* Top bar: back, title, close */}
			<header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
				<div className="flex items-center gap-2">
					<button
						onClick={onBack}
						className="flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-4 w-4"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fillRule="evenodd"
								d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
								clipRule="evenodd"
							/>
						</svg>
						Back
					</button>
				</div>
				<h1 className="text-sm font-semibold">Community Sheets</h1>
				<button
					onClick={onClose}
					className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-white"
					aria-label="Close settings"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						className="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							fillRule="evenodd"
							d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
							clipRule="evenodd"
						/>
					</svg>
				</button>
			</header>

			{/* Search + count */}
			<div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search community sheets…"
					className="w-full rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500"
				/>
				<p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
					{loading
						? "Loading…"
						: error
							? " "
							: sheetCount > 0
								? `${sheetCount} sheet${sheetCount === 1 ? "" : "s"} available${
										index?.updated_at ? ` · Updated ${index.updated_at}` : ""
									}`
								: "No sheets available yet."}
				</p>
			</div>

			{/* Body: list / loading / error / empty */}
			<div className="flex-1 overflow-y-auto px-4 py-3">
				{loading ? (
					<ul className="space-y-2" aria-busy="true" aria-live="polite">
						{Array.from({ length: SKELETON_COUNT }).map((_, i) => (
							<li
								key={i}
								className="flex animate-pulse items-center gap-3 rounded border border-zinc-200 p-3 dark:border-zinc-700"
							>
								<div className="h-8 w-8 shrink-0 rounded bg-zinc-200 dark:bg-zinc-700" />
								<div className="flex-1 space-y-2">
									<div className="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-700" />
									<div className="h-2.5 w-2/3 rounded bg-zinc-200 dark:bg-zinc-700" />
								</div>
								<div className="h-6 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
							</li>
						))}
					</ul>
				) : error ? (
					<div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
						<p className="text-sm text-zinc-600 dark:text-zinc-300">
							Could not load community registry.
						</p>
						<p className="max-w-sm break-words text-xs text-zinc-400 dark:text-zinc-500">
							{error}
						</p>
						<button
							onClick={() => fetchIndex()}
							className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
						>
							Retry
						</button>
					</div>
				) : filtered.length === 0 ? (
					<div className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
						{query.trim()
							? `No sheets match “${query.trim()}”.`
							: "The community registry is empty."}
					</div>
				) : (
					<ul className="space-y-2">
						{filtered.map((entry) => (
							<RegistryRow
								key={entry.id}
								entry={entry}
								state={rowStates[entry.id] ?? { status: "idle" }}
								isInstalled={installedIds.has(entry.id)}
								onInstall={handleInstall}
							/>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};

export default RegistryBrowser;
