import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Sheet, SheetMeta } from "../types/sheet";
import type { UserConfig } from "../types/config";

interface OverlayStore {
	// existing
	sheet: Sheet | null;
	activePage: number;
	/** Background opacity of the overlay card, 0.0–1.0. */
	overlayOpacity: number;
	setSheet: (sheet: Sheet) => void;
	setActivePage: (index: number) => void;
	setOverlayOpacity: (opacity: number) => void;

	// multi-sheet state
	allSheets: SheetMeta[];
	setAllSheets: (sheets: SheetMeta[]) => void;
	activeSheetId: string | null;
	/** Load a sheet into the store WITHOUT persisting it — used by auto-detection
	 * (ephemeral) so a manually chosen `active_sheet` isn't churned on every
	 * window switch. Manual selection uses `switchSheet`, which persists. */
	loadSheet: (id: string) => Promise<void>;
	switchSheet: (id: string) => Promise<void>;

	// sheet switcher
	switcherOpen: boolean;
	setSwitcherOpen: (open: boolean) => void;

	// global search
	allFullSheets: Sheet[];
	setAllFullSheets: (sheets: Sheet[]) => void;
	searchOpen: boolean;
	setSearchOpen: (open: boolean) => void;

	// config state
	currentConfig: UserConfig | null;
	setCurrentConfig: (cfg: UserConfig) => void;
	updateConfig: (patch: Partial<UserConfig>) => Promise<void>;
}

export const useOverlayStore = create<OverlayStore>((set, get) => ({
	sheet: null,
	activePage: 0,
	overlayOpacity: 0.85,
	setSheet: (sheet) => set({ sheet, activePage: 0 }),
	setActivePage: (index) => set({ activePage: index }),
	setOverlayOpacity: (opacity) => set({ overlayOpacity: opacity }),

	// multi-sheet
	// multi-sheet
	allSheets: [],
	setAllSheets: (sheets) => set({ allSheets: sheets }),
	activeSheetId: null,

	// sheet switcher
	switcherOpen: false,
	setSwitcherOpen: (open) => set({ switcherOpen: open }),

	// global search
	allFullSheets: [],
	setAllFullSheets: (sheets) => set({ allFullSheets: sheets }),
	searchOpen: false,
	setSearchOpen: (open) => set({ searchOpen: open }),

	// config state
	currentConfig: null,
	setCurrentConfig: (cfg) => set({ currentConfig: cfg }),
	updateConfig: async (patch) => {
		const cfg = { ...get().currentConfig!, ...patch };
		await invoke("set_config", { config: cfg });
		set({ currentConfig: cfg });
	},

	loadSheet: async (id) => {
		const loaded = await invoke<Sheet>("get_sheet", { id });
		set({
			sheet: loaded,
			activePage: 0,
			activeSheetId: id,
		});
	},

	switchSheet: async (id) => {
		await get().loadSheet(id);
		// Persist active sheet to config — read from store to avoid race
		const cfg = get().currentConfig;
		if (cfg) {
			const updated = { ...cfg, active_sheet: id };
			await invoke("set_config", { config: updated });
			set({ currentConfig: updated });
		} else {
			console.warn("[switchSheet] currentConfig is null, falling back to IPC");
			const fallbackCfg = await invoke<UserConfig>("get_config");
			const updated = { ...fallbackCfg, active_sheet: id };
			await invoke("set_config", { config: updated });
			set({ currentConfig: updated });
		}
	},
}));
