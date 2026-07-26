import type { FC } from "react";
import type { Page } from "../../types/sheet";

interface PageNavProps {
  /** Pages from the loaded sheet. */
  pages: Page[];
  /** Currently active page index. */
  activeIndex: number;
  /** Callback when a page tab is clicked. */
  onSelect: (index: number) => void;
}

/**
 * Horizontal tab bar — one tab per page.
 * Keyboard: Left/Right arrows switch tabs.
 */
const PageNav: FC<PageNavProps> = ({ pages, activeIndex, onSelect }) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onSelect((activeIndex + 1) % pages.length);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSelect((activeIndex - 1 + pages.length) % pages.length);
    }
  };

  return (
    <nav
      className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700 px-4 py-2"
      onKeyDown={handleKeyDown}
      role="tablist"
      aria-label="Sheet pages"
    >
      {pages.map((page, i) => (
        <button
          key={page.name}
          role="tab"
          aria-selected={i === activeIndex}
          className={`rounded-t px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            i === activeIndex
              ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-white"
              : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200"
          }`}
          onClick={() => onSelect(i)}
          tabIndex={i === activeIndex ? 0 : -1}
        >
          {page.name}
        </button>
      ))}
    </nav>
  );
};

export default PageNav;
