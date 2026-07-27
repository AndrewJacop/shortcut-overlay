import { Fragment, type CSSProperties, type FC } from "react";
import type { Page, Shortcut } from "../../types/sheet";
import KeyBadge from "../KeyBadge/KeyBadge";

interface ShortcutGridProps {
	/** Active page — rendered as titled sections when `sections` is present,
	 * otherwise as a flat key|description grid (legacy v1 layout). */
	page: Page;
}

/**
 * Renders the active page.
 *
 * - Sections present → a grid of titled section blocks. Each section pins
 *   itself with CSS `grid-column` / `grid-row` derived from its index arrays
 *   (0-based → CSS 1-based, end exclusive). Omitted axes auto-flow.
 * - Otherwise → a single flat two-column key|description list (v1 layout).
 */
const ShortcutGrid: FC<ShortcutGridProps> = ({ page }) => {
	const sections = page.sections?.filter((s) => s.shortcuts.length > 0);

	if (sections && sections.length > 0) {
		const containerStyle: CSSProperties = page.columns
			? {
					display: "grid",
					gridTemplateColumns: `repeat(${page.columns}, minmax(0, 1fr))`,
					gap: "0.75rem",
					alignItems: "start",
				}
			: { display: "flex", flexDirection: "column", gap: "0.75rem" };

		return (
			<div className="px-4 py-3" style={containerStyle}>
				{sections.map((section, i) => (
					<section
						key={i}
						className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-700/60"
						style={{
							gridColumn: gridTrack(section.column),
							gridRow: gridTrack(section.row),
						}}
					>
						<h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
							{section.name}
						</h3>
						<ShortcutRows shortcuts={section.shortcuts} />
					</section>
				))}
			</div>
		);
	}

	// Legacy flat layout (v1 sheets, or pages without sections).
	return (
		<div className="px-4 py-3">
			<ShortcutRows shortcuts={page.shortcuts} />
		</div>
	);
};

/**
 * Two-column key|description rows. For sequences like ["Ctrl+B", "D"], renders:
 * [Ctrl+B] → [D]. For chords like ["Ctrl+B+$"], renders: [Ctrl+B+$].
 */
const ShortcutRows: FC<{ shortcuts: Shortcut[] }> = ({ shortcuts }) => (
	<div className="grid grid-cols-[1fr_1.5fr] gap-x-4 gap-y-1.5">
		{shortcuts.map((shortcut, i) => (
			<Fragment key={i}>
				{/* Key column */}
				<div className="flex items-center gap-1">
					{shortcut.keys.map((k, j) => (
						<span key={j} className="flex items-center gap-1">
							{j > 0 && (
								<span
									className="text-xs text-zinc-400 dark:text-zinc-500"
									aria-hidden="true"
								>
									→
								</span>
							)}
							<KeyBadge keyStr={k} />
						</span>
					))}
				</div>
				{/* Description column */}
				<div className="flex items-center text-sm text-zinc-600 dark:text-zinc-300">
					{shortcut.description}
				</div>
			</Fragment>
		))}
	</div>
);

export default ShortcutGrid;

/**
 * Map a 0-based index array to a CSS grid track (`start / end`, 1-based,
 * end-exclusive). e.g. [0,1] → "1 / 3", [0] → "1 / 2". Returns undefined for
 * an absent/empty axis so CSS auto-flows it.
 */
function gridTrack(indices?: number[]): string | undefined {
	if (!indices || indices.length === 0) return undefined;
	const min = Math.min(...indices);
	const max = Math.max(...indices);
	return `${min + 1} / ${max + 2}`;
}
