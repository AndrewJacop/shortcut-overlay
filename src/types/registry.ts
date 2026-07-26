/**
 * Types for the community sheet registry.
 *
 * The registry is a JSON index hosted remotely (see `useRegistry`'s
 * `REGISTRY_URL`) that lists community-contributed sheets available for
 * one-click install. The app fetches the index from the frontend and
 * downloads each sheet's YAML via its `download_url`, then installs it
 * through the existing `install_sheet` command (which validates first).
 *
 * This is an external, community-controlled document, so every
 * non-essential field is optional and the UI must tolerate its absence.
 * Only `id`, `display_name`, and `download_url` are required for an entry
 * to be meaningful.
 */

/** A single sheet entry in the community registry index. */
export interface RegistryEntry {
	/** Unique id; must match the installed sheet's `app` id to detect "installed". */
	id: string;
	/** Human-readable name shown in the browser. */
	display_name: string;
	/** Direct URL to the raw YAML content (fetched + validated on install). */
	download_url: string;
	/** One-line description of what the sheet covers. */
	description?: string;
	/** Semver-ish version string, e.g. "1.2.0". */
	version?: string;
	/** Author attribution. */
	author?: string;
	/** Emoji or image URL rendered as the sheet icon. */
	icon?: string;
	/** Free-form tags used by the search filter. */
	tags?: string[];
}

/** Top-level shape of the registry index document. */
export interface RegistryIndex {
	/** Index schema version ("1" for the current format). */
	version: string;
	/** ISO date string of when the index was last regenerated. */
	updated_at?: string;
	/** The list of available community sheets. */
	sheets: RegistryEntry[];
}
