use serde::{Deserialize, Serialize};
use tauri::Manager;

const MARGIN: f64 = 16.0;

/// Which monitor the overlay should appear on.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
#[derive(Default)]
pub enum MonitorTarget {
    #[default]
    Primary,
    /// Use whichever monitor the mouse cursor is currently on.
    Cursor,
    /// Use the monitor containing the active (focused) window.
    /// Stub — falls back to primary until v1.0.
    ActiveWindow,
    /// Zero-based index into the system monitor list.
    Index(usize),
}

/// Where on the chosen monitor the overlay is anchored.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum OverlayPosition {
    TopLeft,
    TopCenter,
    TopRight,
    MidLeft,
    Center,
    MidRight,
    BottomLeft,
    BottomCenter,
    #[default]
    BottomRight,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayConfig {
    #[serde(default)]
    pub monitor: MonitorTarget,
    #[serde(default)]
    pub position: OverlayPosition,
    #[serde(default)]
    pub offset_x: f64,
    #[serde(default)]
    pub offset_y: f64,
    #[serde(default = "default_width")]
    pub width: f64,
    #[serde(default = "default_height")]
    pub height: f64,
    /// Background opacity of the overlay card, 0.0 (invisible) – 1.0 (opaque).
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    /// When true, the overlay fills the whole selected monitor and
    /// position/offset/width/height are ignored.
    #[serde(default)]
    pub fullscreen: bool,
}

fn default_width() -> f64 {
    700.0
}
fn default_height() -> f64 {
    560.0
}
fn default_opacity() -> f64 {
    0.85
}

impl Default for OverlayConfig {
    fn default() -> Self {
        Self {
            monitor: MonitorTarget::default(),
            position: OverlayPosition::default(),
            offset_x: 0.0,
            offset_y: 0.0,
            width: default_width(),
            height: default_height(),
            opacity: default_opacity(),
            fullscreen: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserConfig {
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
    #[serde(default)]
    pub overlay: OverlayConfig,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_active_sheet")]
    pub active_sheet: String,
    /// When true (default), the overlay auto-selects a sheet matching the
    /// focused window's process on each hotkey press. When false, the last
    /// manually chosen sheet is always shown.
    #[serde(default = "default_auto_detect")]
    pub auto_detect: bool,
    /// When set, this sheet is shown regardless of the focused window —
    /// auto-detection is bypassed until it is cleared.
    #[serde(default)]
    pub pinned_sheet: Option<String>,
}

fn default_hotkey() -> String {
    "Alt+Shift+/".to_string()
}
fn default_theme() -> String {
    "dark".to_string()
}
fn default_active_sheet() -> String {
    "tmux".to_string()
}
fn default_auto_detect() -> bool {
    true
}

impl Default for UserConfig {
    fn default() -> Self {
        Self {
            hotkey: default_hotkey(),
            overlay: OverlayConfig::default(),
            theme: default_theme(),
            active_sheet: default_active_sheet(),
            auto_detect: default_auto_detect(),
            pinned_sheet: None,
        }
    }
}

pub struct ConfigState {
    pub config: std::sync::Mutex<UserConfig>,
}

/// Load config from the app config directory, falling back to defaults.
pub fn load_config(app: &tauri::AppHandle) -> UserConfig {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return UserConfig::default();
    };
    let config_path = config_dir.join("config.json");
    let Ok(content) = std::fs::read_to_string(config_path) else {
        return UserConfig::default();
    };
    serde_json::from_str::<UserConfig>(&content).unwrap_or_default()
}

/// Persist config to disk.
pub fn save_config(app: &tauri::AppHandle, config: &UserConfig) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(config_dir.join("config.json"), content).map_err(|e| e.to_string())
}

/// Calculate the top-left corner (logical px) for the overlay window given
/// the monitor geometry and the configured anchor position.
pub fn compute_overlay_position(
    mon_x: f64,
    mon_y: f64,
    mon_w: f64,
    mon_h: f64,
    overlay_w: f64,
    overlay_h: f64,
    position: &OverlayPosition,
    offset_x: f64,
    offset_y: f64,
) -> (f64, f64) {
    let (base_x, base_y) = match position {
        OverlayPosition::TopLeft => (mon_x + MARGIN, mon_y + MARGIN),
        OverlayPosition::TopCenter => (mon_x + (mon_w - overlay_w) / 2.0, mon_y + MARGIN),
        OverlayPosition::TopRight => (mon_x + mon_w - overlay_w - MARGIN, mon_y + MARGIN),
        OverlayPosition::MidLeft => (mon_x + MARGIN, mon_y + (mon_h - overlay_h) / 2.0),
        OverlayPosition::Center => (
            mon_x + (mon_w - overlay_w) / 2.0,
            mon_y + (mon_h - overlay_h) / 2.0,
        ),
        OverlayPosition::MidRight => (
            mon_x + mon_w - overlay_w - MARGIN,
            mon_y + (mon_h - overlay_h) / 2.0,
        ),
        OverlayPosition::BottomLeft => (mon_x + MARGIN, mon_y + mon_h - overlay_h - MARGIN),
        OverlayPosition::BottomCenter => (
            mon_x + (mon_w - overlay_w) / 2.0,
            mon_y + mon_h - overlay_h - MARGIN,
        ),
        OverlayPosition::BottomRight => (
            mon_x + mon_w - overlay_w - MARGIN,
            mon_y + mon_h - overlay_h - MARGIN,
        ),
    };
    (base_x + offset_x, base_y + offset_y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monitor_target_serde_roundtrip() {
        // Verify all MonitorTarget variants serialize and deserialize correctly.
        let variants: Vec<MonitorTarget> = vec![
            MonitorTarget::Primary,
            MonitorTarget::Cursor,
            MonitorTarget::ActiveWindow,
            MonitorTarget::Index(2),
        ];
        for v in &variants {
            let json = serde_json::to_string(v).unwrap();
            let back: MonitorTarget = serde_json::from_str(&json).unwrap();
            assert_eq!(
                serde_json::to_string(v).unwrap(),
                serde_json::to_string(&back).unwrap(),
                "roundtrip failed for {:?}",
                v
            );
        }
    }

    #[test]
    fn active_window_serializes_as_snake_case() {
        let target = MonitorTarget::ActiveWindow;
        let json = serde_json::to_string(&target).unwrap();
        assert!(
            json.contains("active_window"),
            "expected snake_case, got: {}",
            json
        );
    }

    #[test]
    fn cursor_target_deserializes_from_json() {
        let json = r#"{"type":"cursor"}"#;
        let target: MonitorTarget = serde_json::from_str(json).unwrap();
        assert!(matches!(target, MonitorTarget::Cursor));
    }
}
