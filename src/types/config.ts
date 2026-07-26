export type MonitorTarget =
	| { type: "primary" }
	| { type: "cursor" }
	| { type: "active_window" }
	| { type: "index"; value: number };

export type OverlayPosition =
	| "top_left"
	| "top_center"
	| "top_right"
	| "mid_left"
	| "center"
	| "mid_right"
	| "bottom_left"
	| "bottom_center"
	| "bottom_right";

export interface OverlayConfig {
	monitor: MonitorTarget;
	position: OverlayPosition;
	offset_x: number;
	offset_y: number;
	width: number;
	height: number;
	/** Background opacity of the overlay card, 0.0–1.0. Default 0.85. */
	opacity: number;
	/** When true, overlay fills the whole selected monitor; ignores anchor/offset/size. */
	fullscreen: boolean;
}

export interface UserConfig {
	hotkey: string;
	overlay: OverlayConfig;
	theme: "dark" | "light" | "system";
	active_sheet: string;
}

/** Default UserConfig — mirrors Rust `UserConfig::default()`. */
export const DEFAULT_CONFIG: UserConfig = {
	hotkey: "Alt+Shift+/",
	overlay: {
		monitor: { type: "primary" },
		position: "bottom_right",
		offset_x: 0,
		offset_y: 0,
		width: 700,
		height: 560,
		opacity: 0.85,
		fullscreen: false,
	},
	theme: "dark",
	active_sheet: "tmux",
};
