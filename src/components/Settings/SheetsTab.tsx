import { type FC, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSheetSources } from "../../hooks/useSheetSources";
import type { ToastFn } from "./Toast";
import SheetIcon from "../SheetIcon/SheetIcon";
import ImportModal from "./ImportModal";
import RegistryBrowser from "./RegistryBrowser";

type View = "list" | "registry";

/**
 * The "Sheets" settings tab: manage installed sheets and reach the community
 * library / URL import.
 *
 * List view: action buttons + the installed-sheet list with source badges
 * ("Bundled" / "Installed") and an uninstall control for user sheets.
 * Registry view: the `<RegistryBrowser />` takes over the tab content area
 * (back button returns to the list) — still framed by the settings shell's
 * header + tabs.
 *
 * The installed list comes from `useSheetSources`, which re-fetches on the
 * `sheets_updated` event, so an install from the modal / registry (or another
 * window) refreshes this list automatically.
 */
const SheetsTab: FC<{ onToast?: ToastFn }> = ({ onToast }) => {
	const { sources, refresh } = useSheetSources();
	const [view, setView] = useState<View>("list");
	const [importOpen, setImportOpen] = useState(false);
	const [uninstallError, setUninstallError] = useState<string | null>(null);
	const [uninstallingId, setUninstallingId] = useState<string | null>(null);

	const handleUninstall = async (appId: string, displayName: string) => {
		const confirmed = window.confirm(
			`Uninstall “${displayName}”?\n\nThis removes the sheet from your library. A bundled sheet (if any) is restored.`,
		);
		if (!confirmed) return;
		setUninstallError(null);
		setUninstallingId(appId);
		try {
			await invoke("uninstall_sheet", { appId });
			// Refresh this tab's list immediately. The sheets_updated event
			// still notifies OTHER windows (e.g. the overlay).
			void refresh();
			onToast?.("success", `Uninstalled “${displayName}”`);
		} catch (e) {
			setUninstallError(e instanceof Error ? e.message : String(e));
		} finally {
			setUninstallingId(null);
		}
	};

	// Registry browser fills the tab content area (its own top bar + scroll).
	if (view === "registry") {
		return (
			<div className="h-full">
				<RegistryBrowser
					onBack={() => {
						// Refresh so a registry-installed sheet appears on return
						// (RegistryBrowser holds its own useSheetSources instance).
						void refresh();
						setView("list");
					}}
					onClose={() => invoke("hide_settings").catch(console.error)}
					onToast={onToast}
				/>
			</div>
		);
	}

	const userCount = sources.filter((s) => s.source === "user").length;

	return (
		<div className="flex h-full flex-col">
			<main className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
				{/* Action buttons */}
				<div className="flex flex-wrap gap-2">
					<button
						onClick={() => setView("registry")}
						className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
					>
						Browse Community Library →
					</button>
					<button
						onClick={() => setImportOpen(true)}
						className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
					>
						+ Import from URL
					</button>
				</div>

				{/* Uninstall error */}
				{uninstallError && (
					<div className="rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-950/40">
						<p className="break-words text-xs text-red-600 dark:text-red-400">
							{uninstallError}
						</p>
					</div>
				)}

				{/* Installed sheets list */}
				<section>
					<div className="mb-3 flex items-baseline justify-between">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
							Installed Sheets
						</h2>
						<span className="text-xs text-zinc-400 dark:text-zinc-500">
							{sources.length} total · {userCount} installed
						</span>
					</div>

					{sources.length === 0 ? (
						<p className="text-sm text-zinc-500 dark:text-zinc-400">
							No sheets loaded.
						</p>
					) : (
						<ul className="divide-y divide-zinc-200 dark:divide-zinc-700 rounded-lg border border-zinc-200 dark:border-zinc-700">
							{sources.map(({ meta, source }) => {
								const isUser = source === "user";
								const uninstalling = uninstallingId === meta.app;
								return (
									<li
										key={meta.app}
										className="flex items-center gap-3 bg-white px-3 py-2.5 dark:bg-zinc-800/40"
									>
										<SheetIcon
											appId={meta.app}
											displayName={meta.display_name}
											icon={meta.icon}
											className="h-7 w-7 shrink-0"
										/>
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
												<span className="text-sm font-medium text-zinc-900 dark:text-white">
													{meta.display_name}
												</span>
												{meta.author && (
													<span className="text-xs text-zinc-500 dark:text-zinc-400">
														{meta.author}
													</span>
												)}
												{meta.version && (
													<span className="text-xs text-zinc-400 dark:text-zinc-500">
														v{meta.version}
													</span>
												)}
											</div>
											<span className="text-xs text-zinc-400 dark:text-zinc-500">
												{meta.app}
											</span>
										</div>
										{isUser ? (
											<span className="rounded bg-blue-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-300">
												Installed
											</span>
										) : (
											<span className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
												Bundled
											</span>
										)}
										{isUser && (
											<button
												onClick={() =>
													void handleUninstall(meta.app, meta.display_name)
												}
												disabled={uninstalling}
												title={`Uninstall ${meta.display_name}`}
												aria-label={`Uninstall ${meta.display_name}`}
												className="rounded p-1 text-zinc-400 transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/50 dark:hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
											>
												{uninstalling ? (
													<svg
														xmlns="http://www.w3.org/2000/svg"
														className="h-4 w-4 animate-spin"
														viewBox="0 0 24 24"
														fill="none"
														aria-hidden="true"
													>
														<circle
															className="opacity-25"
															cx="12"
															cy="12"
															r="10"
															stroke="currentColor"
															strokeWidth="4"
														/>
														<path
															className="opacity-75"
															fill="currentColor"
															d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
														/>
													</svg>
												) : (
													<svg
														xmlns="http://www.w3.org/2000/svg"
														className="h-4 w-4"
														viewBox="0 0 20 20"
														fill="currentColor"
														aria-hidden="true"
													>
														<path
															fillRule="evenodd"
															d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
															clipRule="evenodd"
														/>
													</svg>
												)}
											</button>
										)}
									</li>
								);
							})}
						</ul>
					)}
				</section>
			</main>

			{importOpen && (
				<ImportModal
					onClose={() => setImportOpen(false)}
					onToast={onToast}
					onSheetChanged={refresh}
				/>
			)}
		</div>
	);
};

export default SheetsTab;
