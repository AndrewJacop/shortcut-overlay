import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Sheet, SheetMeta } from "./types/sheet";
import type { UserConfig } from "./types/config";
import { useOverlayStore } from "./stores/useOverlayStore";
import { applyTheme, watchSystemTheme } from "./utils/theme";
import Overlay from "./components/Overlay/Overlay";
import SettingsPage from "./components/Settings/SettingsPage";

function App() {
	const isSettingsWindow = window.location.hash === "#settings";

	const {
		sheet,
		setAllSheets,
		switchSheet,
		loadSheet,
		setOverlayOpacity,
		setAllFullSheets,
		setCurrentConfig,
		setSwitcherOpen,
		currentConfig,
	} = useOverlayStore();

	useEffect(() => {
		if (isSettingsWindow) return;
		async function load() {
			try {
				const [allMeta, allFull, cfg] = await Promise.all([
					invoke<SheetMeta[]>("get_all_sheets"),
					invoke<Sheet[]>("get_all_sheets_full"),
					invoke<UserConfig>("get_config"),
				]);
				setAllSheets(allMeta);
				setAllFullSheets(allFull);
				setOverlayOpacity(cfg.overlay.opacity);
				setCurrentConfig(cfg);
				applyTheme(cfg.theme);

				// Restore the persisted active sheet (or fallback to first available)
				const targetId =
					cfg.active_sheet && allMeta.some((s) => s.app === cfg.active_sheet)
						? cfg.active_sheet
						: allMeta[0]?.app;
				if (targetId) {
					await switchSheet(targetId);
				}
			} catch (e) {
				console.error("[App] Failed to load:", e);
			}
		}
		if (!sheet) {
			load();
		}
	}, [
		sheet,
		setAllSheets,
		setAllFullSheets,
		switchSheet,
		setOverlayOpacity,
		setCurrentConfig,
		isSettingsWindow,
	]);

	// Settings window: load config on startup
	useEffect(() => {
		if (!isSettingsWindow) return;
		async function loadSettingsConfig() {
			try {
				const cfg = await invoke<UserConfig>("get_config");
				setCurrentConfig(cfg);
				applyTheme(cfg.theme);
			} catch (e) {
				console.error("[Settings] Failed to load config:", e);
			}
		}
		if (!currentConfig) {
			loadSettingsConfig();
		}
	}, [isSettingsWindow, setCurrentConfig, currentConfig]);

	// Both windows: listen for config_updated events
	useEffect(() => {
		const promise = listen<UserConfig>("config_updated", (event) => {
			setCurrentConfig(event.payload);
			applyTheme(event.payload.theme);
			if (!isSettingsWindow) {
				setOverlayOpacity(event.payload.overlay.opacity);
			}
		});
		return () => {
			promise.then((unlisten) => unlisten());
		};
	}, [isSettingsWindow, setCurrentConfig, setOverlayOpacity]);

	// Overlay window: listen for sheets_updated events so an install/uninstall
	// in another window reloads the sheet lists without a restart.
	useEffect(() => {
		if (isSettingsWindow) return;
		const promise = listen("sheets_updated", async () => {
			try {
				const [allMeta, allFull] = await Promise.all([
					invoke<SheetMeta[]>("get_all_sheets"),
					invoke<Sheet[]>("get_all_sheets_full"),
				]);
				setAllSheets(allMeta);
				setAllFullSheets(allFull);
				// Active-sheet protection: if the active sheet was removed (e.g.
				// uninstalled with no bundled fallback), fall back to the first
				// available so the overlay never goes blank.
				const active = useOverlayStore.getState().activeSheetId;
				const stillExists =
					active !== null && allMeta.some((s) => s.app === active);
				if (!stillExists && allMeta[0]) {
					await switchSheet(allMeta[0].app);
				}
			} catch (e) {
				console.error("[App] Failed to reload sheets:", e);
			}
		});
		return () => {
			promise.then((unlisten) => unlisten());
		};
	}, [isSettingsWindow, setAllSheets, setAllFullSheets, switchSheet]);

	// Overlay window: Rust runs pin → detect → manual on each hotkey-triggered
	// show and emits the matched sheet ids. Apply: exactly 1 → switch to it,
	// >1 → open the switcher, 0 → keep the current sheet (manual / fallback).
	useEffect(() => {
		if (isSettingsWindow) return;
		const promise = listen<string[]>("sheet_detected", (event) => {
			const ids = event.payload;
			if (ids.length === 1) {
				loadSheet(ids[0]);
			} else if (ids.length > 1) {
				setSwitcherOpen(true);
			}
			// 0 → keep current sheet
		});
		return () => {
			promise.then((unlisten) => unlisten());
		};
	}, [isSettingsWindow, loadSheet, setSwitcherOpen]);

	// Watch for OS theme preference changes when theme is 'system'
	useEffect(() => {
		if (!currentConfig || currentConfig.theme !== "system") return;
		const unwatch = watchSystemTheme(() => applyTheme("system"));
		return unwatch;
	}, [currentConfig?.theme]);

	return isSettingsWindow ? <SettingsPage /> : <Overlay />;
}

export default App;
