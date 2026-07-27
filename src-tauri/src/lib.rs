mod commands;
mod config;
mod detection;
mod sheets;

use config::{ConfigState, MonitorTarget, UserConfig};
use sheets::SheetsState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// Resolve the target monitor and return its geometry in logical pixels.
/// Falls back to the primary monitor if the target is unavailable.
fn resolve_monitor(app: &tauri::AppHandle, target: &MonitorTarget) -> Option<(f64, f64, f64, f64)> {
    // Each match arm yields Option<Monitor>; the trailing `?` unwraps to Monitor.
    let monitor = match target {
        MonitorTarget::Primary => app.primary_monitor().ok().flatten(),

        MonitorTarget::Cursor => {
            // Get the cursor position in physical pixels, then find which monitor
            // contains that point. Falls back to primary on failure.
            let mon = (|| -> Option<tauri::Monitor> {
                let pos = app.cursor_position().ok()?;
                app.monitor_from_point(pos.x, pos.y).ok().flatten()
            })();
            mon.or_else(|| app.primary_monitor().ok().flatten())
        }

        MonitorTarget::ActiveWindow => {
            // Deferred to v1.0 (requires platform window detection APIs).
            // Falls back to primary monitor.
            eprintln!("[monitor] ActiveWindow detection not yet implemented, using primary");
            app.primary_monitor().ok().flatten()
        }

        MonitorTarget::Index(n) => app
            .available_monitors()
            .ok()
            .and_then(|monitors| monitors.into_iter().nth(*n)),
    }?;

    let scale = monitor.scale_factor();
    let x = monitor.position().x as f64 / scale;
    let y = monitor.position().y as f64 / scale;
    let w = monitor.size().width as f64 / scale;
    let h = monitor.size().height as f64 / scale;
    Some((x, y, w, h))
}

/// Tell Windows DWM which corner style to use.
/// Windows 11 rounds every window's corners by default, which bleeds through
/// a transparent borderless overlay. We force square when fullscreen and let
/// the default (round) apply otherwise. No-op on non-Windows.
#[cfg(windows)]
fn set_corner_preference(hwnd: isize, square: bool) {
    // DWMWA_WINDOW_CORNER_PREFERENCE = 33; DWMWCP_RECT = 1 (square), DWMWCP_DEFAULT = 0.
    use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE};
    let pref: i32 = if square { 1 } else { 0 };
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd as _,
            DWMWA_WINDOW_CORNER_PREFERENCE as _,
            &pref as *const _ as _,
            std::mem::size_of::<i32>() as _,
        );
    }
}

/// Compensate for tao's undecorated-shadow inset: on Windows a transparent
/// borderless window has an invisible shadow border, so `set_position` places
/// the *outer* frame at the target but the visible client area lands inset.
/// We measure the real client origin via ClientToScreen(0,0) and shift the
/// outer position so the client lands exactly at (target_x, target_y).
/// No-op on non-Windows.
#[cfg(windows)]
fn shift_to_client_origin(w: &tauri::WebviewWindow, target_x: f64, target_y: f64) {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::Graphics::Gdi::ClientToScreen;
    let Ok(hwnd) = w.hwnd() else { return };
    let hwnd = hwnd.0 as isize;
    let scale = w.scale_factor().unwrap_or(1.0);
    unsafe {
        let mut origin = POINT { x: 0, y: 0 };
        // BOOL is i32: nonzero = success.
        if ClientToScreen(hwnd as _, &mut origin) != 0 {
            let dx = target_x - (origin.x as f64 / scale);
            let dy = target_y - (origin.y as f64 / scale);
            if dx != 0.0 || dy != 0.0 {
                let _ = w.set_position(tauri::LogicalPosition::new(target_x + dx, target_y + dy));
            }
        }
    }
}

/// Resize and reposition the overlay window according to the current config.
fn position_overlay(app: &tauri::AppHandle, cfg: &UserConfig) {
    let Some(w) = app.get_webview_window("main") else {
        return;
    };
    let Some((mon_x, mon_y, mon_w, mon_h)) = resolve_monitor(app, &cfg.overlay.monitor) else {
        return;
    };

    // Fullscreen: fill the whole selected monitor, ignore anchor/offset/size.
    let (ow, oh, x, y) = if cfg.overlay.fullscreen {
        (mon_w, mon_h, mon_x, mon_y)
    } else {
        let ow = cfg.overlay.width;
        let oh = cfg.overlay.height;
        let (x, y) = config::compute_overlay_position(
            mon_x,
            mon_y,
            mon_w,
            mon_h,
            ow,
            oh,
            &cfg.overlay.position,
            cfg.overlay.offset_x,
            cfg.overlay.offset_y,
        );
        (ow, oh, x, y)
    };

    let _ = w.set_size(LogicalSize::new(ow, oh));
    let _ = w.set_position(LogicalPosition::new(x, y));

    #[cfg(windows)]
    {
        // Corner preference: square when fullscreen, default (round) otherwise.
        // Also fix the shadow inset so the visible client area sits at (x, y).
        if let Ok(h) = w.hwnd() {
            set_corner_preference(h.0 as isize, cfg.overlay.fullscreen);
        }
        shift_to_client_origin(&w, x, y);
    }
}

/// Resolve which sheet(s) the overlay should show and notify the frontend.
///
/// Implements the precedence **pin → detect → manual**, emitting a
/// `sheet_detected` event carrying the matched sheet ids. The frontend applies:
/// exactly 1 → switch to it; 0 → keep the current sheet (manual / last); >1 →
/// open the SheetSwitcher.
///
/// MUST run before the overlay window takes focus, otherwise we'd detect our
/// own window. Any detection failure (elevated target, no window) collapses to
/// an empty match list so the overlay falls back to the last sheet.
fn detect_and_notify(app: &tauri::AppHandle) {
    let cfg = app.state::<ConfigState>().config.lock().unwrap().clone();

    // Resolve the foreground app before locking sheets, so the (fast, blocking)
    // native call isn't made while holding the lock. Only needed when
    // auto-detect is on; skipped entirely when off.
    let detected_app = if cfg.auto_detect {
        detection::active_process_stem()
    } else {
        None
    };

    let ids: Vec<String> = {
        // Bind State to a local so the MutexGuard outlives the temporary —
        // borrowing `app.state().sheets.lock()` directly drops the State temp
        // before the guard is used.
        let sheets_state = app.state::<SheetsState>();
        let sheets = sheets_state.sheets.lock().unwrap();
        // Pin is meaningful only in auto-detect mode — in manual mode the
        // current sheet already persists, so there's nothing to override.
        // (Checking pin before this guard would let a lingering pin hijack
        // manual selection.)
        if !cfg.auto_detect {
            Vec::new()
        } else if let Some(id) = &cfg.pinned_sheet {
            // Pin overrides detection; a dangling pin (uninstalled sheet)
            // falls through to detection / fallback.
            if sheets.contains_key(id) {
                vec![id.clone()]
            } else {
                Vec::new()
            }
        } else if let Some(name) = detected_app {
            detection::match_sheets(&name, &sheets)
        } else {
            Vec::new()
        }
    };

    let _ = app.emit("sheet_detected", &ids);
}

/// Show the overlay: detect which sheet to show, reposition (in case config or
/// monitor changed), then focus. Detection lives here so every show path
/// (hotkey + tray) is consistent — and runs before the window takes focus so we
/// don't detect ourselves.
fn show_overlay(app: &tauri::AppHandle) {
    detect_and_notify(app);
    let cfg = app.state::<ConfigState>().config.lock().unwrap().clone();
    position_overlay(app, &cfg);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                show_overlay(app);
                            }
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::set_config,
            commands::sheets::get_sheet,
            commands::sheets::get_all_sheets,
            commands::sheets::get_all_sheets_full,
            commands::sheets::get_sheet_sources,
            commands::http::fetch_remote_text,
            commands::sheets::validate_sheet_yaml,
            commands::sheets::install_sheet,
            commands::sheets::uninstall_sheet,
            commands::window::hide_overlay,
            commands::window::show_settings,
            commands::window::hide_settings,
            commands::window::get_app_version,
            commands::hotkey::update_hotkey,
        ])
        .setup(|app| {
            // Load persisted config (or defaults) and register it as managed state.
            let cfg = config::load_config(app.handle());
            app.manage(ConfigState {
                config: std::sync::Mutex::new(cfg.clone()),
            });

            // Load bundled + user sheets and register as managed state.
            // Done inside setup() so we have an AppHandle to resolve the
            // user sheets dir ({app_config_dir}/sheets/).
            let (loaded_sheets, user_ids) = sheets::load_all_sheets(app.handle());
            app.manage(SheetsState {
                sheets: std::sync::Mutex::new(loaded_sheets),
                user_sheet_ids: std::sync::Mutex::new(user_ids),
            });

            // Register the global hotkey from persisted config.
            let shortcut =
                commands::hotkey::parse_hotkey(&cfg.hotkey).expect("Failed to parse saved hotkey");
            app.global_shortcut().register(shortcut)?;

            // System tray
            let show_item = MenuItem::with_id(app, "show", "Show Overlay", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &settings_item, &quit_item])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("ShortcutOverlay")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_overlay(app),
                    "settings" => {
                        if let Some(w) = app.get_webview_window("settings") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .icon(app.default_window_icon().unwrap().clone())
                .build(app)?;

            // Pre-position the window so it's ready for first show.
            position_overlay(app.handle(), &cfg);

            Ok(())
        })
        .on_window_event(|window, event| {
            match window.label() {
                "main" => {
                    // Auto-hide overlay when it loses focus
                    if let tauri::WindowEvent::Focused(false) = event {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        }
                    }
                }
                "settings" => {
                    // Hide instead of destroy on close
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
