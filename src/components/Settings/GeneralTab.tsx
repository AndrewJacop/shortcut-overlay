import { type FC, useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOverlayStore } from "../../stores/useOverlayStore";
import { applyTheme } from "../../utils/theme";
import { useDebouncedCallback } from "../../utils/debounce";
import HotkeyRecorder from "./HotkeyRecorder";
import PositionPicker from "./PositionPicker";
import MonitorSelector from "./MonitorSelector";
import OpacitySlider from "./OpacitySlider";
import type { OverlayPosition, MonitorTarget } from "../../types/config";
import { DEFAULT_CONFIG } from "../../types/config";

/**
 * The "General" settings tab: hotkey, appearance, and overlay position/size.
 *
 * This is the exact content the single-scroll SettingsPage rendered in v0.3
 * (Step 5 just wraps it behind a tab). Owns its own scroll area + footer so
 * it can be swapped in and out of the settings shell without affecting the
 * Sheets tab's layout.
 */
const GeneralTab: FC = () => {
	const { currentConfig, updateConfig, setCurrentConfig } = useOverlayStore();
	const theme = currentConfig?.theme ?? "dark";
	const overlay = currentConfig?.overlay;

	const [appVersion, setAppVersion] = useState("...");

	// Load app version once
	useEffect(() => {
		invoke<string>("get_app_version")
			.then(setAppVersion)
			.catch(() => setAppVersion("?.?.?"));
	}, []);

	// ── Handlers ──

	const handleThemeChange = async (newTheme: "dark" | "light" | "system") => {
		applyTheme(newTheme);
		await updateConfig({ theme: newTheme });
	};

	const handlePositionChange = useCallback(
		async (position: OverlayPosition) => {
			if (!currentConfig) return;
			await updateConfig({
				overlay: { ...currentConfig.overlay, position },
			});
		},
		[currentConfig, updateConfig],
	);

	const handleMonitorChange = useCallback(
		async (monitor: MonitorTarget) => {
			if (!currentConfig) return;
			await updateConfig({
				overlay: { ...currentConfig.overlay, monitor },
			});
		},
		[currentConfig, updateConfig],
	);

	const handleOpacityChange = useCallback(
		async (opacity: number) => {
			if (!currentConfig) return;
			await updateConfig({
				overlay: { ...currentConfig.overlay, opacity },
			});
		},
		[currentConfig, updateConfig],
	);

	// Debounced handlers for number inputs (avoid spamming config writes)
	const handleSizeChange = useDebouncedCallback(
		async (field: "width" | "height", value: number) => {
			if (!currentConfig) return;
			const clamped =
				field === "width"
					? Math.min(1400, Math.max(400, value))
					: Math.min(1200, Math.max(300, value));
			await updateConfig({
				overlay: { ...currentConfig.overlay, [field]: clamped },
			});
		},
		300,
	);

	const handleOffsetChange = useDebouncedCallback(
		async (field: "offset_x" | "offset_y", value: number) => {
			if (!currentConfig) return;
			await updateConfig({
				overlay: { ...currentConfig.overlay, [field]: value },
			});
		},
		300,
	);

	// ── Local state for number inputs (controlled, synced from config) ──
	const [localWidth, setLocalWidth] = useState(overlay?.width ?? 700);
	const [localHeight, setLocalHeight] = useState(overlay?.height ?? 560);
	const [localOffsetX, setLocalOffsetX] = useState(overlay?.offset_x ?? 0);
	const [localOffsetY, setLocalOffsetY] = useState(overlay?.offset_y ?? 0);

	// Sync local state when config changes externally (e.g. reset to defaults)
	useEffect(() => {
		if (!overlay) return;
		setLocalWidth(overlay.width);
		setLocalHeight(overlay.height);
		setLocalOffsetX(overlay.offset_x);
		setLocalOffsetY(overlay.offset_y);
	}, [overlay?.width, overlay?.height, overlay?.offset_x, overlay?.offset_y]);

	const handleResetDefaults = async () => {
		applyTheme(DEFAULT_CONFIG.theme);
		await updateConfig(DEFAULT_CONFIG);
		setCurrentConfig(DEFAULT_CONFIG);
	};

	if (!overlay) return null;

	return (
		<div className="flex h-full flex-col">
			{/* Body */}
			<main className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
				{/* Hotkey section */}
				<section>
					<h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
						Hotkey
					</h2>
					<HotkeyRecorder />
				</section>

				{/* Appearance section */}
				<section>
					<h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
						Appearance
					</h2>
					<div className="space-y-4">
						{/* Theme */}
						<div className="flex items-center gap-3">
							<span className="text-sm text-zinc-600 dark:text-zinc-300 w-20">
								Theme
							</span>
							<div className="flex rounded-lg border border-zinc-300 dark:border-zinc-600 overflow-hidden">
								{(["dark", "light", "system"] as const).map((t) => (
									<button
										key={t}
										onClick={() => void handleThemeChange(t)}
										className={`px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
											theme === t
												? "bg-blue-600 text-white"
												: "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
										}`}
									>
										{t.charAt(0).toUpperCase() + t.slice(1)}
									</button>
								))}
							</div>
						</div>
						{/* Opacity */}
						<div className="flex items-center gap-3">
							<span className="text-sm text-zinc-600 dark:text-zinc-300 w-20">
								Opacity
							</span>
							<OpacitySlider
								value={overlay.opacity}
								onChange={(o) => void handleOpacityChange(o)}
							/>
						</div>
					</div>
				</section>

				{/* Position & Overlay section */}
				<section>
					<h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
						Position &amp; Overlay
					</h2>
					<div className="space-y-5">
						{/* Position picker + Monitor selector side by side */}
						<div className="flex gap-8">
							<div>
								<span className="text-sm text-zinc-600 dark:text-zinc-300 block mb-2">
									Anchor
								</span>
								<PositionPicker
									value={overlay.position}
									onChange={(p) => void handlePositionChange(p)}
								/>
							</div>
							<div>
								<span className="text-sm text-zinc-600 dark:text-zinc-300 block mb-2">
									Monitor
								</span>
								<MonitorSelector
									value={overlay.monitor}
									onChange={(m) => void handleMonitorChange(m)}
								/>
							</div>
						</div>

						{/* Size controls */}
						<div className="flex items-center gap-6">
							<div className="flex items-center gap-2">
								<span className="text-sm text-zinc-600 dark:text-zinc-300">
									Width
								</span>
								<input
									type="number"
									min={400}
									max={1400}
									value={localWidth}
									onChange={(e) =>
										setLocalWidth(parseInt(e.target.value, 10) || 700)
									}
									onBlur={() => void handleSizeChange("width", localWidth)}
									className="w-20 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
								<span className="text-xs text-zinc-400 dark:text-zinc-500">
									px
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-sm text-zinc-600 dark:text-zinc-300">
									Height
								</span>
								<input
									type="number"
									min={300}
									max={1200}
									value={localHeight}
									onChange={(e) =>
										setLocalHeight(parseInt(e.target.value, 10) || 560)
									}
									onBlur={() => void handleSizeChange("height", localHeight)}
									className="w-20 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
								<span className="text-xs text-zinc-400 dark:text-zinc-500">
									px
								</span>
							</div>
						</div>

						{/* Offset controls */}
						<div className="flex items-center gap-6">
							<div className="flex items-center gap-2">
								<span className="text-sm text-zinc-600 dark:text-zinc-300">
									Offset X
								</span>
								<input
									type="number"
									value={localOffsetX}
									onChange={(e) =>
										setLocalOffsetX(parseInt(e.target.value, 10) || 0)
									}
									onBlur={() =>
										void handleOffsetChange("offset_x", localOffsetX)
									}
									className="w-20 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
								<span className="text-xs text-zinc-400 dark:text-zinc-500">
									px
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-sm text-zinc-600 dark:text-zinc-300">
									Offset Y
								</span>
								<input
									type="number"
									value={localOffsetY}
									onChange={(e) =>
										setLocalOffsetY(parseInt(e.target.value, 10) || 0)
									}
									onBlur={() =>
										void handleOffsetChange("offset_y", localOffsetY)
									}
									className="w-20 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
								<span className="text-xs text-zinc-400 dark:text-zinc-500">
									px
								</span>
							</div>
						</div>
					</div>
				</section>
			</main>

			{/* Footer */}
			<footer className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-700 px-6 py-3">
				<span className="text-xs text-zinc-400 dark:text-zinc-500">
					v{appVersion}
				</span>
				<button
					onClick={() => void handleResetDefaults()}
					className="rounded px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
				>
					Reset to defaults
				</button>
			</footer>
		</div>
	);
};

export default GeneralTab;
