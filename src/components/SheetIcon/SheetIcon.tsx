import { type FC, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { SheetIcon as SheetIconType } from "../../types/sheet";

/**
 * Deterministic avatar background color based on app ID string.
 * Uses a simple character-code hash to pick from 8 dark zinc/slate shades.
 */
const AVATAR_COLORS = [
  "bg-zinc-600",
  "bg-slate-600",
  "bg-stone-600",
  "bg-neutral-600",
  "bg-blue-800",
  "bg-indigo-800",
  "bg-violet-800",
  "bg-teal-800",
];

function avatarColor(appId: string): string {
  const hash = [...appId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

interface SheetIconProps {
  /** The sheet's unique app ID — used for fallback avatar color. */
  appId: string;
  /** The sheet's display name — used for fallback avatar letter. */
  displayName: string;
  /** Optional icon definition. */
  icon?: SheetIconType;
  /** Additional CSS classes for the outer wrapper. */
  className?: string;
}

/**
 * Renders a sheet icon: emoji, image (url/path), or a first-letter fallback avatar.
 */
const SheetIcon: FC<SheetIconProps> = ({ appId, displayName, icon, className = "" }) => {
  const [imgFailed, setImgFailed] = useState(false);

  // No icon or image load failure → avatar fallback
  if (!icon || imgFailed) {
    const letter = (displayName[0] ?? "?").toUpperCase();
    return (
      <div
        className={`flex items-center justify-center rounded text-sm font-bold text-white ${avatarColor(appId)} ${className}`}
        aria-hidden="true"
      >
        {letter}
      </div>
    );
  }

  // Emoji icon
  if (icon.type === "emoji") {
    return (
      <span className={`text-lg leading-none ${className}`} aria-hidden="true">
        {icon.value}
      </span>
    );
  }

  // Bundled icon — not yet supported, fall back to avatar
  if (icon.type === "bundled") {
    const letter = (displayName[0] ?? "?").toUpperCase();
    return (
      <div
        className={`flex items-center justify-center rounded text-sm font-bold text-white ${avatarColor(appId)} ${className}`}
        aria-hidden="true"
      >
        {letter}
      </div>
    );
  }

  // URL or path icon — render as <img>
  // Path icons are converted to Tauri asset:// URLs via convertFileSrc.
  // URL icons use the raw value directly.
  const src = icon.type === "path" ? convertFileSrc(icon.value) : icon.value;

  return (
    <img
      src={src}
      alt=""
      className={`object-contain ${className}`}
      onError={() => setImgFailed(true)}
    />
  );
};

export default SheetIcon;
