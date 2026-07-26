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
  /** Shortcuts belonging to this page. */
  shortcuts: Shortcut[];
}

export interface Sheet {
  /** Unique identifier, lowercase, no spaces. */
  app: string;
  /** Display name shown in the UI. */
  display_name: string;
  /** Schema version. */
  version?: string;
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
  source: 'bundled' | 'user';
}
