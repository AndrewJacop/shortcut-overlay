use tauri::{Manager, WebviewWindow};

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn hide_overlay(window: WebviewWindow) -> Result<(), String> {
    window
        .hide()
        .map_err(|e| format!("Failed to hide window: {}", e))
}

#[tauri::command]
pub fn show_settings(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
pub fn hide_settings(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.hide();
    }
}
