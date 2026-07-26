import { type FC, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOverlayStore } from "../../stores/useOverlayStore";
import KeyBadge from "../KeyBadge/KeyBadge";

type RecorderState = "idle" | "recording" | "pending" | "error";

/** Convert a KeyboardEvent.code (physical key) to the display format stored in config. */
function codeToDisplayKey(code: string): string {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase(); // KeyA → a
  if (code.startsWith("Digit")) return code.slice(5); // Digit1 → 1
  const map: Record<string, string> = {
    Slash: "/",
    Period: ".",
    Comma: ",",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Escape: "Escape",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Insert: "Insert",
    CapsLock: "CapsLock",
  };
  // Function keys F1–F12 pass through as-is
  if (/^F\d{1,2}$/.test(code)) return code;
  return map[code] ?? code;
}

const HotkeyRecorder: FC = () => {
  const { currentConfig, setCurrentConfig } = useOverlayStore();
  const [state, setState] = useState<RecorderState>("idle");
  const [pending, setPending] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hotkey = currentConfig?.hotkey ?? "Alt+Shift+/";
  const keys = hotkey.split("+");

  const resetToIdle = () => {
    setState("idle");
    setPending(null);
    setErrorMsg(null);
  };

  const startRecording = () => {
    setState("recording");
    setPending(null);
    setErrorMsg(null);
  };

  const save = async () => {
    if (!pending) return;
    try {
      await invoke("update_hotkey", { newHotkey: pending });
      // Update store immediately so UI reflects the change without
      // waiting for the config_updated event round-trip.
      if (currentConfig) {
        setCurrentConfig({ ...currentConfig, hotkey: pending });
      }
      resetToIdle();
    } catch (e) {
      setErrorMsg(String(e));
      setState("error");
    }
  };

  // Capture key presses during recording state.
  // Uses capture phase + stopImmediatePropagation so the SettingsPage's
  // Escape handler (bubble phase) does NOT fire — Escape cancels recording
  // instead of closing the window.
  useEffect(() => {
    if (state !== "recording") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Escape cancels recording
      if (e.key === "Escape") {
        resetToIdle();
        return;
      }

      // Ignore bare modifier presses — wait for a non-modifier key
      const modifierCodes = [
        "ControlLeft", "ControlRight",
        "AltLeft", "AltRight",
        "ShiftLeft", "ShiftRight",
        "MetaLeft", "MetaRight",
      ];
      if (modifierCodes.includes(e.code)) return;

      // Build modifier list
      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.altKey) mods.push("Alt");
      if (e.shiftKey) mods.push("Shift");
      if (e.metaKey) mods.push("Super");

      // Require at least one modifier
      if (mods.length === 0) return;

      const key = codeToDisplayKey(e.code);
      const combo = [...mods, key].join("+");
      setPending(combo);
      setState("pending");
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Escape during pending state also cancels (same capture-phase trick)
  useEffect(() => {
    if (state !== "pending") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        resetToIdle();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-600 dark:text-zinc-300 w-28 shrink-0">
          Trigger shortcut
        </span>

        {/* Idle — show current hotkey + Change button */}
        {state === "idle" && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {keys.map((k, i) => (
                <KeyBadge key={i} keyStr={k} />
              ))}
            </div>
            <button
              onClick={startRecording}
              className="ml-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Change
            </button>
          </div>
        )}

        {/* Recording — waiting for key press */}
        {state === "recording" && (
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-dashed border-zinc-400 dark:border-zinc-500 px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 animate-pulse">
              Press your shortcut…
            </span>
            <button
              onClick={resetToIdle}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Pending — captured combo, awaiting Save/Cancel */}
        {state === "pending" && pending && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {pending.split("+").map((k, i) => (
                <KeyBadge key={i} keyStr={k} />
              ))}
            </div>
            <button
              onClick={() => void save()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Save
            </button>
            <button
              onClick={resetToIdle}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Error — show message + retry */}
        {state === "error" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-red-500 dark:text-red-400">
              ⚠ {errorMsg}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={startRecording}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Try again
              </button>
              <button
                onClick={resetToIdle}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hint text aligned with the content area (past label + gap) */}
      {state === "recording" && (
        <p className="mt-1.5 ml-[7.75rem] text-xs text-zinc-400 dark:text-zinc-500">
          Must include at least one modifier (Ctrl, Alt, Shift, or Super).
          Press Escape to cancel.
        </p>
      )}
    </div>
  );
};

export default HotkeyRecorder;
