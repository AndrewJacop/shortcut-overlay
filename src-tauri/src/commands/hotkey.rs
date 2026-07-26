use tauri::{Emitter, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

use crate::config::{save_config, ConfigState};

/// Parse a display-format hotkey string (e.g. "Alt+Shift+/") into a Shortcut.
pub(crate) fn parse_hotkey(input: &str) -> Result<Shortcut, String> {
    let parts: Vec<&str> = input.split('+').collect();
    if parts.len() < 2 {
        return Err(format!(
            "Hotkey '{}' must have at least one modifier + one key",
            input
        ));
    }

    let mut modifiers = Modifiers::empty();
    for &part in &parts[..parts.len() - 1] {
        match part.trim() {
            "Ctrl" | "Control" => modifiers |= Modifiers::CONTROL,
            "Alt" => modifiers |= Modifiers::ALT,
            "Shift" => modifiers |= Modifiers::SHIFT,
            "Super" | "Meta" | "Win" => modifiers |= Modifiers::SUPER,
            other => return Err(format!("Unknown modifier: '{}'", other)),
        }
    }

    let key_str = parts.last().unwrap().trim();
    let code = str_to_code(key_str).ok_or_else(|| format!("Unknown key: '{}'", key_str))?;

    Ok(Shortcut::new(Some(modifiers), code))
}

/// Map a display key string to a keyboard `Code`.
fn str_to_code(s: &str) -> Option<Code> {
    use Code::*;

    // Single ASCII letter → KeyX
    if s.len() == 1 {
        let c = s.chars().next().unwrap();
        if c.is_ascii_alphabetic() {
            return match c.to_ascii_lowercase() {
                'a' => Some(KeyA),
                'b' => Some(KeyB),
                'c' => Some(KeyC),
                'd' => Some(KeyD),
                'e' => Some(KeyE),
                'f' => Some(KeyF),
                'g' => Some(KeyG),
                'h' => Some(KeyH),
                'i' => Some(KeyI),
                'j' => Some(KeyJ),
                'k' => Some(KeyK),
                'l' => Some(KeyL),
                'm' => Some(KeyM),
                'n' => Some(KeyN),
                'o' => Some(KeyO),
                'p' => Some(KeyP),
                'q' => Some(KeyQ),
                'r' => Some(KeyR),
                's' => Some(KeyS),
                't' => Some(KeyT),
                'u' => Some(KeyU),
                'v' => Some(KeyV),
                'w' => Some(KeyW),
                'x' => Some(KeyX),
                'y' => Some(KeyY),
                'z' => Some(KeyZ),
                _ => None,
            };
        }
    }

    match s {
        // Digits
        "0" => Some(Digit0),
        "1" => Some(Digit1),
        "2" => Some(Digit2),
        "3" => Some(Digit3),
        "4" => Some(Digit4),
        "5" => Some(Digit5),
        "6" => Some(Digit6),
        "7" => Some(Digit7),
        "8" => Some(Digit8),
        "9" => Some(Digit9),
        // Symbols
        "/" => Some(Slash),
        "." => Some(Period),
        "," => Some(Comma),
        ";" => Some(Semicolon),
        "'" => Some(Quote),
        "[" => Some(BracketLeft),
        "]" => Some(BracketRight),
        "\\" => Some(Backslash),
        "`" => Some(Backquote),
        "-" => Some(Minus),
        "=" => Some(Equal),
        " " => Some(Space),
        // Named keys
        "Space" => Some(Space),
        "Enter" => Some(Enter),
        "Tab" => Some(Tab),
        "Backspace" => Some(Backspace),
        "Delete" => Some(Delete),
        "Escape" | "Esc" => Some(Escape),
        "Up" => Some(ArrowUp),
        "Down" => Some(ArrowDown),
        "Left" => Some(ArrowLeft),
        "Right" => Some(ArrowRight),
        "Home" => Some(Home),
        "End" => Some(End),
        "PageUp" => Some(PageUp),
        "PageDown" => Some(PageDown),
        "Insert" => Some(Insert),
        "CapsLock" => Some(CapsLock),
        // Function keys
        "F1" => Some(F1),
        "F2" => Some(F2),
        "F3" => Some(F3),
        "F4" => Some(F4),
        "F5" => Some(F5),
        "F6" => Some(F6),
        "F7" => Some(F7),
        "F8" => Some(F8),
        "F9" => Some(F9),
        "F10" => Some(F10),
        "F11" => Some(F11),
        "F12" => Some(F12),
        _ => None,
    }
}

/// Rebind the global hotkey at runtime.
///
/// Unregisters the current shortcut, registers the new one, persists to
/// config, and emits `config_updated` so all windows stay in sync.
#[tauri::command]
pub fn update_hotkey(
    app: tauri::AppHandle,
    state: State<'_, ConfigState>,
    new_hotkey: String,
) -> Result<(), String> {
    let new_shortcut = parse_hotkey(&new_hotkey)?;

    // Unregister all current shortcuts
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;

    // Register the new shortcut
    app.global_shortcut()
        .register(new_shortcut)
        .map_err(|e| format!("Could not register '{}': {}", new_hotkey, e))?;

    // Persist to config
    {
        let mut cfg = state.config.lock().unwrap();
        cfg.hotkey = new_hotkey;
    }
    let cfg = state.config.lock().unwrap().clone();
    save_config(&app, &cfg).map_err(|e| e.to_string())?;
    app.emit("config_updated", &cfg)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_alt_shift_slash() {
        let result = parse_hotkey("Alt+Shift+/").unwrap();
        let expected = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::Slash);
        assert_eq!(result, expected);
    }

    #[test]
    fn parse_ctrl_k() {
        let result = parse_hotkey("Ctrl+k").unwrap();
        let expected = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyK);
        assert_eq!(result, expected);
    }

    #[test]
    fn parse_requires_modifier() {
        let result = parse_hotkey("a");
        assert!(result.is_err());
    }

    #[test]
    fn parse_unknown_modifier() {
        let result = parse_hotkey("Foo+a");
        assert!(result.is_err());
    }

    #[test]
    fn parse_unknown_key() {
        let result = parse_hotkey("Ctrl+foobar");
        assert!(result.is_err());
    }

    #[test]
    fn parse_function_key() {
        let result = parse_hotkey("Alt+F5").unwrap();
        let expected = Shortcut::new(Some(Modifiers::ALT), Code::F5);
        assert_eq!(result, expected);
    }
}
