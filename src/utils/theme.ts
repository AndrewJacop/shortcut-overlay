export type Theme = "dark" | "light" | "system";

/**
 * Apply theme by toggling the `dark` class on <html> and setting
 * the --overlay-bg-rgb CSS custom property for the overlay background.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  let isDark: boolean;

  if (theme === "dark") {
    isDark = true;
  } else if (theme === "light") {
    isDark = false;
  } else {
    isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  root.classList.toggle("dark", isDark);
  root.style.setProperty(
    "--overlay-bg-rgb",
    isDark ? "24, 24, 27" : "255, 255, 255",
  );
}

/**
 * Watch for OS-level theme preference changes.
 * Returns an unsubscribe function.
 */
export function watchSystemTheme(cb: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
