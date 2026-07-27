/**
 * TypeScript types mirroring the Rust sheet structs.
 * These match the YAML schema defined in sheets/_schema.yaml.
 */

export interface SheetIcon {
	/** "url" | "path" | "emoji" | "bundled" */
	type: string;
	value: string;
}

export interface Shortcut {
	/** Key sequence or chord. Array of strings. */
	keys: string[];
	/** Human-readable description of what this shortcut does. */
	description: string;
	/** Optional tags for filtering. */
	tags?: string[];
}

export interface Page {
	/** Tab label displayed in the page navigation. */
	name: string;
	/** Legacy flat shortcut list. Rendered as a single untitled section when
	 * `sections` is absent (backward compatibility with v1 sheets). */
	shortcuts: Shortcut[];
	/** Grid column count for laid-out sections. Optional; CSS auto-flows when
	 * omitted. Ignored when there are no `sections`. */
	columns?: number;
	/** Titled, optionally positioned groups of shortcuts. When present, the
	 * page renders as a grid of sections instead of the flat `shortcuts`. */
	sections?: Section[];
}

/** A titled group of shortcuts, optionally placed on the page grid.
 *
 * `column` / `row` hold the 0-based grid indices the section occupies
 * (already normalized from single-int-or-array by Rust). Either may be
 * `undefined`, in which case CSS auto-flows that axis. */
export interface Section {
	/** Section title. */
	name: string;
	/** Grid column indices this section fills (0-based); undefined → auto-flow. */
	column?: number[];
	/** Grid row indices this section fills (0-based); undefined → auto-flow. */
	row?: number[];
	/** Shortcuts belonging to this section. */
	shortcuts: Shortcut[];
}

export interface Sheet {
	/** Unique identifier, lowercase, no spaces. */
	app: string;
	/** Display name shown in the UI. */
	display_name: string;
	/** Content semver of this sheet file (author's, e.g. "1.0.0"). */
	version?: string;
	/** Schema revision this sheet targets; normalized to the current version
	 * after Rust-side migration. Absent in legacy (v1) files. */
	schema_version?: number;
	/** Author attribution. */
	author?: string;
	/** Optional app icon. */
	icon?: SheetIcon;
	/** Process names for auto-detection (v1.0 feature). */
	match?: string[];
	/** Pages of shortcuts, each displayed as a tab. */
	pages: Page[];
}

/** Minimal metadata for sheet listing (no page content). */
export interface SheetMeta {
	app: string;
	display_name: string;
	version?: string;
	author?: string;
	icon?: SheetIcon;
}

/** A sheet's metadata paired with its install source. */
export interface SheetSource {
	meta: SheetMeta;
	/** "bundled" (ships with the app) or "user" (installed to filesystem). */
	source: "bundled" | "user";
}
