import { type FC, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SheetMeta, SheetSource } from "../../types/sheet";
import { resolveGistUrl } from "../../utils/gist";
import type { ToastFn } from "./Toast";

interface ImportModalProps {
	/** Transient install feedback (v0.4 Step 6). */
	onToast?: ToastFn;
	/** Notifies the parent to refresh its sheet list after a successful install. */
	onSheetChanged?: () => void;
	/** Closes the modal. */
	onClose: () => void;
}

type Phase =
	| "idle"
	| "fetching"
	| "preview"
	| "installing"
	| "success"
	| "error";

/**
 * Modal for importing a sheet from a raw YAML URL or GitHub Gist URL.
 *
 * Flow: paste URL → Fetch (resolve Gist + download) → validate via Rust →
 * preview → Install (re-validate on the Rust side + write + reload).
 * Nothing is ever installed if the Rust validator rejects the content.
 *
 * States cycle: idle → fetching → preview → installing → success | error.
 */
const ImportModal: FC<ImportModalProps> = ({
	onToast,
	onSheetChanged,
	onClose,
}) => {
	const [url, setUrl] = useState("");
	const [phase, setPhase] = useState<Phase>("idle");
	const [content, setContent] = useState<string | null>(null);
	const [preview, setPreview] = useState<SheetMeta | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [installedName, setInstalledName] = useState<string | null>(null);
	const [existingUserApps, setExistingUserApps] = useState<Set<string>>(
		new Set(),
	);

	const urlInputRef = useRef<HTMLInputElement>(null);

	// Focus the URL input on open.
	useEffect(() => {
		urlInputRef.current?.focus();
	}, []);

	// Fetch the set of already-user-installed app ids so we can warn on override.
	// Non-critical: a fetch failure just disables the warning.
	useEffect(() => {
		invoke<SheetSource[]>("get_sheet_sources")
			.then((sources) => {
				setExistingUserApps(
					new Set(
						sources.filter((s) => s.source === "user").map((s) => s.meta.app),
					),
				);
			})
			.catch(() => {
				/* warning is non-critical */
			});
	}, []);

	const busy = phase === "fetching" || phase === "installing";

	// Escape closes when not mid-operation.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || busy) return;
			onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [busy, onClose]);

	const reset = () => {
		setPhase("idle");
		setContent(null);
		setPreview(null);
		setError(null);
		setInstalledName(null);
	};

	const handleFetch = async () => {
		setError(null);
		setPreview(null);
		setContent(null);
		setPhase("fetching");
		try {
			const rawUrl = await resolveGistUrl(url);
			const text = await invoke<string>("fetch_remote_text", { url: rawUrl });
			// Validate without installing — surface a readable error early.
			const meta = await invoke<SheetMeta>("validate_sheet_yaml", {
				content: text,
			});
			setContent(text);
			setPreview(meta);
			setPhase("preview");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setPhase("error");
		}
	};

	const handleInstall = async () => {
		if (!content) return;
		setPhase("installing");
		try {
			// install_sheet re-validates on the Rust side before writing.
			const meta = await invoke<SheetMeta>("install_sheet", { content });
			setInstalledName(meta.display_name);
			setPhase("success");
			// Refresh the parent list now; the sheets_updated event still
			// notifies other windows (e.g. the overlay).
			onSheetChanged?.();
			onToast?.("success", `Sheet installed: ${meta.display_name}`);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setPhase("error");
		}
	};

	const willOverride = preview !== null && existingUserApps.has(preview.app);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={() => {
				if (!busy) onClose();
			}}
		>
			<div
				className="w-[440px] max-w-[90vw] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-5 py-3">
					<h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
						Import Sheet from URL
					</h2>
					<button
						onClick={() => {
							if (!busy) onClose();
						}}
						disabled={busy}
						className="rounded p-1 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
						aria-label="Close"
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

				{/* Body */}
				<div className="px-5 py-4 space-y-4">
					{phase === "success" ? (
						<div className="flex items-center gap-3 py-2">
							<span
								className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-300"
								aria-hidden="true"
							>
								✓
							</span>
							<div>
								<p className="text-sm font-medium text-zinc-900 dark:text-white">
									Sheet installed
								</p>
								{installedName && (
									<p className="text-xs text-zinc-500 dark:text-zinc-400">
										{installedName}
									</p>
								)}
							</div>
						</div>
					) : (
						<>
							<div>
								<label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
									Paste a raw YAML URL or GitHub Gist URL
								</label>
								<div className="flex gap-2">
									<input
										ref={urlInputRef}
										type="url"
										value={url}
										onChange={(e) => setUrl(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && url.trim() && !busy) {
												void handleFetch();
											}
										}}
										placeholder="https://gist.github.com/..."
										disabled={busy}
										className="flex-1 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
									/>
									<button
										onClick={() => void handleFetch()}
										disabled={!url.trim() || busy}
										className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
									>
										{phase === "fetching" ? "Fetching…" : "Fetch"}
									</button>
								</div>
							</div>

							{phase === "preview" && preview && (
								<div className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-3 space-y-1">
									<div className="flex items-center gap-2">
										{preview.icon && preview.icon.type === "emoji" && (
											<span className="text-lg leading-none" aria-hidden="true">
												{preview.icon.value}
											</span>
										)}
										<span className="text-sm font-semibold text-zinc-900 dark:text-white">
											{preview.display_name}
										</span>
										{preview.author && (
											<span className="text-xs text-zinc-500 dark:text-zinc-400">
												· {preview.author}
											</span>
										)}
									</div>
									<p className="text-xs text-zinc-500 dark:text-zinc-400">
										{preview.version ? `v${preview.version} · ` : ""}
										Ready to install.
									</p>
									{willOverride && (
										<p className="text-xs text-amber-600 dark:text-amber-400">
											⚠ This will override your installed “{preview.app}” sheet.
										</p>
									)}
								</div>
							)}

							{error && (
								<div className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3">
									<p className="text-xs font-medium text-red-700 dark:text-red-300">
										Import failed
									</p>
									<p className="mt-1 text-xs text-red-600 dark:text-red-400 break-words">
										{error}
									</p>
								</div>
							)}
						</>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-700 px-5 py-3">
					{phase === "success" ? (
						<button
							onClick={onClose}
							className="rounded px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
						>
							Done
						</button>
					) : phase === "error" ? (
						<>
							<button
								onClick={onClose}
								className="rounded px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
							>
								Close
							</button>
							<button
								onClick={reset}
								className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
							>
								Try again
							</button>
						</>
					) : (
						<>
							<button
								onClick={() => {
									if (!busy) onClose();
								}}
								disabled={busy}
								className="rounded px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
							>
								Cancel
							</button>
							<button
								onClick={() => void handleInstall()}
								disabled={phase !== "preview" || busy}
								className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
							>
								{phase === "installing" ? "Installing…" : "Install"}
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default ImportModal;
