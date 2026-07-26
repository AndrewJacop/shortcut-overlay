use tauri::{Emitter, State};

use crate::config::{save_config, ConfigState, UserConfig};

#[tauri::command]
pub fn get_config(state: State<'_, ConfigState>) -> UserConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_config(
    app: tauri::AppHandle,
    state: State<'_, ConfigState>,
    config: UserConfig,
) -> Result<(), String> {
    save_config(&app, &config)?;
    *state.config.lock().unwrap() = config.clone();
    // Notify all windows that config changed
    app.emit("config_updated", &config)
        .map_err(|e| e.to_string())?;
    Ok(())
}
