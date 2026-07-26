import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import GeneralTab from "./GeneralTab";
import SheetsTab from "./SheetsTab";
import ToastStack, { type ToastItem, type ToastKind } from "./Toast";

type Tab = "general" | "sheets";

/**
 * Settings window root. v0.4 (Step 5) splits the single-scroll settings into
 * a tabbed shell: [ General ] [ Sheets ]. The shell owns the window chrome
 * (title bar + close + Escape-to-close) and the tab navigation; each tab
 * renders its own scroll area and (optionally) footer.
 *
 * The Sheets tab is the home for the community library browser and URL
 * import (previously temporary header buttons in v0.3/early-v0.4).
 */
const SettingsPage: FC = () => {
	const [tab, setTab] = useState<Tab>("general");
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const toastIdRef = useRef(0);

	// Transient install/uninstall feedback (v0.4 Step 6). Auto-dismisses after
	// 3s; click a toast to dismiss early. Pure UI state — not in Zustand.
	const pushToast = useCallback((kind: ToastKind, message: string) => {
		const id = ++toastIdRef.current;
		setToasts((prev) => [...prev, { id, kind, message }]);
		window.setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, 3000);
	}, []);

	const dismissToast = useCallback((id: number) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	// Escape key closes settings
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				invoke("hide_settings").catch(console.error);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const tabs: { id: Tab; label: string }[] = [
		{ id: "general", label: "General" },
		{ id: "sheets", label: "Sheets" },
	];

	return (
		<div className="flex h-screen w-screen flex-col bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white overflow-hidden">
			{/* Header */}
			<header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-6 py-4">
				<h1 className="text-lg font-semibold">⚙ Settings</h1>
				<button
					onClick={() => invoke("hide_settings").catch(console.error)}
					className="rounded p-1 text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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

			{/* Tab bar */}
			<nav
				className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 px-4"
				aria-label="Settings sections"
			>
				{tabs.map((t) => (
					<button
						key={t.id}
						onClick={() => setTab(t.id)}
						aria-current={tab === t.id ? "page" : undefined}
						className={`border-b-2 -mb-px px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
							tab === t.id
								? "border-blue-600 text-zinc-900 dark:text-white"
								: "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
						}`}
					>
						{t.label}
					</button>
				))}
			</nav>

			{/* Body — each tab owns its scroll area + optional footer */}
			<div className="flex-1 overflow-hidden">
				{tab === "general" ? <GeneralTab /> : <SheetsTab onToast={pushToast} />}
			</div>

			{/* Transient install/uninstall feedback (v0.4 Step 6) */}
			<ToastStack toasts={toasts} onDismiss={dismissToast} />
		</div>
	);
};

export default SettingsPage;
