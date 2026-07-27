import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOverlayStore } from "../../stores/useOverlayStore";
import PageNav from "../PageNav/PageNav";
import ShortcutGrid from "../ShortcutGrid/ShortcutGrid";
import SheetIcon from "../SheetIcon/SheetIcon";
import SheetSwitcher from "../SheetSwitcher/SheetSwitcher";
import SearchBar from "../SearchBar/SearchBar";
import SearchResults from "../SearchResults/SearchResults";
import { useSheetSearch } from "../../hooks/useSheetSearch";
import type { SearchResult } from "../../hooks/useSheetSearch";

/**
 * Root overlay layout.
 * - Frameless, semi-transparent dark background
 * - Handles Escape → hide_overlay
 * - Renders header, page tabs, shortcut grid
 */
const Overlay: FC = () => {
	const {
		sheet,
		activePage,
		setActivePage,
		overlayOpacity,
		switcherOpen,
		setSwitcherOpen,
		searchOpen,
		setSearchOpen,
		allFullSheets,
		activeSheetId,
		switchSheet,
		currentConfig,
	} = useOverlayStore();

	const fullscreen = currentConfig?.overlay.fullscreen ?? false;

	const [searchQuery, setSearchQuery] = useState("");
	const searchContainerRef = useRef<HTMLDivElement>(null);
	const searchResults = useSheetSearch(searchQuery, allFullSheets);
	const searchCapped = searchResults.length >= 30;

	const handleClose = useCallback(() => {
		invoke("hide_overlay").catch(console.error);
	}, []);

	// Handle search result selection: switch to sheet + page, close search
	const handleSearchSelect = useCallback(
		async (result: SearchResult) => {
			setSearchOpen(false);
			setSearchQuery("");
			// Switch sheet if needed
			if (result.sheetId !== activeSheetId) {
				await switchSheet(result.sheetId);
			}
			// Navigate to the correct page
			setActivePage(result.pageIndex);
		},
		[activeSheetId, switchSheet, setActivePage, setSearchOpen],
	);

	// Keyboard handlers: Escape → close overlay, Ctrl+K → open switcher, / → open search
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				// Close in priority order: search → switcher → overlay
				if (searchOpen) {
					setSearchOpen(false);
					setSearchQuery("");
				} else if (switcherOpen) {
					setSwitcherOpen(false);
				} else {
					handleClose();
				}
			}
			if ((e.ctrlKey || e.metaKey) && e.key === "k") {
				e.preventDefault();
				if (searchOpen) return; // Don't open switcher while searching
				setSwitcherOpen(!switcherOpen);
			}
			// `/` opens search (only when not already in an input)
			if (
				e.key === "/" &&
				!searchOpen &&
				!switcherOpen &&
				!(
					e.target instanceof HTMLInputElement ||
					e.target instanceof HTMLTextAreaElement
				)
			) {
				e.preventDefault();
				setSearchOpen(true);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleClose, switcherOpen, searchOpen, setSwitcherOpen, setSearchOpen]);

	if (!sheet) {
		return (
			<div
				className={`relative flex h-screen w-screen flex-col ${fullscreen ? "rounded-none pt-8 px-6 pb-6" : "rounded-xl"} backdrop-blur-md overflow-hidden animate-pulse`}
				style={{
					backgroundColor: `rgba(var(--overlay-bg-rgb), ${overlayOpacity})`,
				}}
			>
				{/* Skeleton header */}
				<div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-3">
					<div className="flex items-center gap-2">
						<div className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-700" />
						<div className="h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-700" />
					</div>
					<div className="h-4 w-4 rounded bg-zinc-700" />
				</div>
				{/* Skeleton tabs */}
				<div className="flex gap-1 px-4 py-2">
					<div className="h-7 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
					<div className="h-7 w-20 rounded bg-zinc-200 dark:bg-zinc-700" />
					<div className="h-7 w-14 rounded bg-zinc-200 dark:bg-zinc-700" />
				</div>
				{/* Skeleton grid */}
				<div className="flex-1 px-4 py-3 space-y-2">
					{[...Array(6)].map((_, i) => (
						<div key={i} className="grid grid-cols-[1fr_1.5fr] gap-x-4">
							<div className="h-7 rounded bg-zinc-200 dark:bg-zinc-700" />
							<div className="h-7 rounded bg-zinc-200/50 dark:bg-zinc-700/50" />
						</div>
					))}
				</div>
			</div>
		);
	}

	const activePageData = sheet.pages[activePage] ?? sheet.pages[0];
	return (
		<div
			className={`relative flex h-screen w-screen flex-col ${fullscreen ? "rounded-none shadow-none pt-8 px-6 pb-6" : "rounded-xl shadow-2xl"} backdrop-blur-md text-zinc-900 dark:text-white overflow-hidden`}
			style={{
				backgroundColor: `rgba(var(--overlay-bg-rgb), ${overlayOpacity})`,
			}}
		>
			{/* Header */}
			<header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-3">
				<button
					onClick={() => setSwitcherOpen(true)}
					className="flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
					aria-label="Open sheet switcher"
				>
					<SheetIcon
						appId={sheet.app}
						displayName={sheet.display_name}
						icon={sheet.icon}
						className="h-5 w-5"
					/>
					<h1 className="text-base font-semibold">{sheet.display_name}</h1>
					<kbd className="ml-1 rounded border border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
						Ctrl+K
					</kbd>
				</button>
				<div className="flex items-center gap-2">
					{/* Search button */}
					<button
						onClick={() => setSearchOpen(true)}
						className="flex items-center gap-1 rounded px-1.5 py-1 text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
						aria-label="Search shortcuts"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-4 w-4"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fillRule="evenodd"
								d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
								clipRule="evenodd"
							/>
						</svg>
						<kbd className="rounded border border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
							/
						</kbd>
					</button>
					{/* Settings button */}
					<button
						onClick={() => invoke("show_settings").catch(console.error)}
						className="rounded p-1 text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
						aria-label="Open settings"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-4 w-4"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fillRule="evenodd"
								d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
								clipRule="evenodd"
							/>
						</svg>
					</button>
					{/* Close button */}
					<button
						onClick={handleClose}
						className="rounded p-1 text-zinc-500 dark:text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
						aria-label="Close overlay"
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
			</header>

			{/* Search mode or normal view */}
			{searchOpen ? (
				<div
					ref={searchContainerRef}
					className="contents"
					onKeyDown={(e) => {
						// Focus trap: keep Tab within search area elements
						if (e.key === "Tab") {
							e.preventDefault();
							const container = searchContainerRef.current;
							if (!container) return;
							const focusable = container.querySelectorAll<HTMLElement>(
								"input, button, [tabindex]",
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
						}
					}}
				>
					<SearchBar
						query={searchQuery}
						onQueryChange={setSearchQuery}
						onClose={() => {
							setSearchOpen(false);
							setSearchQuery("");
						}}
					/>
					<SearchResults
						results={searchResults}
						capped={searchCapped}
						onSelect={handleSearchSelect}
					/>
				</div>
			) : (
				<>
					{/* Page tabs */}
					<PageNav
						pages={sheet.pages}
						activeIndex={activePage}
						onSelect={setActivePage}
					/>

					{/* Shortcut grid */}
					<div className="flex-1 overflow-y-auto">
						<ShortcutGrid shortcuts={activePageData.shortcuts} />
					</div>
				</>
			)}

			{/* Sheet switcher overlay */}
			{switcherOpen && <SheetSwitcher />}
		</div>
	);
};

export default Overlay;
