use crate::sheets::{Sheet, SheetMeta, SheetSource, SheetsState};
use tauri::{Emitter, Manager, State};

#[tauri::command]
pub fn get_sheet(id: String, state: State<'_, SheetsState>) -> Result<Sheet, String> {
    let sheets = state
        .sheets
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    sheets
        .get(&id)
        .cloned()
        .ok_or_else(|| format!("Sheet '{}' not found", id))
}

#[tauri::command]
pub fn get_all_sheets(state: State<'_, SheetsState>) -> Result<Vec<SheetMeta>, String> {
    let sheets = state
        .sheets
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let mut result: Vec<SheetMeta> = sheets.values().map(SheetMeta::from).collect();
    result.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(result)
}

/// Returns all loaded sheets with full page/shortcut data.
/// Used by the frontend for global search across all sheets.
#[tauri::command]
pub fn get_all_sheets_full(state: State<'_, SheetsState>) -> Result<Vec<Sheet>, String> {
    let sheets = state
        .sheets
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let mut result: Vec<Sheet> = sheets.values().cloned().collect();
    result.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(result)
}

/// Returns all loaded sheets as `SheetSource` (metadata + install source).
/// Used by the settings UI to show "Bundled" vs "Installed" badges.
#[tauri::command]
pub fn get_sheet_sources(state: State<'_, SheetsState>) -> Result<Vec<SheetSource>, String> {
    let sheets = state
        .sheets
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let user_ids = state
        .user_sheet_ids
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let mut result: Vec<SheetSource> = sheets
        .values()
        .map(|s| SheetSource {
            meta: SheetMeta::from(s),
            source: if user_ids.contains(&s.app) {
                "user".to_string()
            } else {
                "bundled".to_string()
            },
        })
        .collect();
    result.sort_by(|a, b| a.meta.display_name.cmp(&b.meta.display_name));
    Ok(result)
}

/// Validate a YAML sheet string without installing it.
/// Used by the import flow to preview a sheet (and surface a readable error)
/// before anything is written to disk. Delegates to the core validator in
/// `sheets::validate_sheet_yaml`, which is the single gate every install
/// passes through. Returns `SheetMeta` on success or a specific error
/// string on failure.
#[tauri::command]
pub fn validate_sheet_yaml(content: String) -> Result<SheetMeta, String> {
    crate::sheets::validate_sheet_yaml(&content)
}

/// Install a sheet from a YAML string.
///
/// Validates first (never installs unvalidated content), then writes the
/// YAML to `{app_config_dir}/sheets/{app_id}.yaml`, updates the in-memory
/// `SheetsState` (marking the sheet as user-installed), and emits
/// `sheets_updated` so every window re-fetches its sheet list without a
/// restart. Returns the installed sheet's metadata.
///
/// A sheet whose `app` id matches an existing user sheet overwrites that
/// file; a sheet matching a bundled id overrides the bundled version in
/// memory until uninstalled.
#[tauri::command]
pub fn install_sheet(
    app: tauri::AppHandle,
    sheets_state: State<'_, SheetsState>,
    content: String,
) -> Result<SheetMeta, String> {
    // Safety cap: reject oversized payloads fetched from untrusted URLs.
    const MAX_CONTENT_BYTES: usize = 512 * 1024; // 500 KB
    if content.len() > MAX_CONTENT_BYTES {
        return Err(format!(
            "Sheet content too large ({} bytes); maximum is {} bytes",
            content.len(),
            MAX_CONTENT_BYTES
        ));
    }

    // Validate + parse in a single pass. Never write before this succeeds.
    let (sheet, meta) = crate::sheets::validate_and_parse_sheet(&content)?;

    // Write to the user sheets dir so it survives restarts.
    let sheets_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("sheets");
    std::fs::create_dir_all(&sheets_dir).map_err(|e| e.to_string())?;
    let path = sheets_dir.join(format!("{}.yaml", meta.app));
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;

    // Update SheetsState in place so the new sheet is live without a restart.
    {
        let mut sheets = sheets_state
            .sheets
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        sheets.insert(meta.app.clone(), sheet);
    }
    {
        let mut user_ids = sheets_state
            .user_sheet_ids
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        user_ids.insert(meta.app.clone());
    }

    // Notify all windows so they re-fetch their sheet lists.
    app.emit("sheets_updated", ()).map_err(|e| e.to_string())?;

    Ok(meta)
}

/// Uninstall a user-installed sheet.
///
/// Only sheets loaded from the filesystem (`source: "user"`) can be
/// uninstalled — bundled sheets are rejected with an error. Deletes the
/// `{app_config_dir}/sheets/{app_id}.yaml` file, removes the entry from
/// `SheetsState`, restores the bundled version if one exists, and emits
/// `sheets_updated` so every window re-fetches.
#[tauri::command]
pub fn uninstall_sheet(
    app: tauri::AppHandle,
    sheets_state: State<'_, SheetsState>,
    app_id: String,
) -> Result<(), String> {
    // Only user sheets can be uninstalled.
    {
        let user_ids = sheets_state
            .user_sheet_ids
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        if !user_ids.contains(&app_id) {
            return Err(format!(
                "'{}' is a bundled sheet and cannot be uninstalled",
                app_id
            ));
        }
    }

    // Delete the file (a missing file is not an error — state is the source
    // of truth for "installed").
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("sheets")
        .join(format!("{}.yaml", app_id));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }

    // Remove from state, then restore the bundled version if one exists.
    sheets_state
        .user_sheet_ids
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?
        .remove(&app_id);
    {
        let mut sheets = sheets_state
            .sheets
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        sheets.remove(&app_id);
        let bundled = crate::sheets::load_bundled_sheets();
        if let Some(bundled_sheet) = bundled.get(&app_id) {
            sheets.insert(app_id.clone(), bundled_sheet.clone());
        }
    }

    app.emit("sheets_updated", ()).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests — exercise the validation command (the public IPC contract)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// A complete, valid sheet exercising every supported field.
    const VALID_YAML: &str = r#"
app: tmux
display_name: tmux
version: "1.0.0"
author: community
icon: "🖥️"
pages:
  - name: Sessions
    shortcuts:
      - keys: ["Ctrl+B", "D"]
        description: Detach from session
      - keys: ["Ctrl+B+$"]
        description: Rename session
  - name: Panes
    shortcuts:
      - keys: ["Ctrl+B", "%"]
        description: Split pane vertically
"#;

    #[test]
    fn validate_valid_sheet_returns_meta() {
        let meta = validate_sheet_yaml(VALID_YAML.to_string())
            .expect("a complete, well-formed sheet should pass validation");
        assert_eq!(meta.app, "tmux");
        assert_eq!(meta.display_name, "tmux");
        assert_eq!(meta.version.as_deref(), Some("1.0.0"));
        assert_eq!(meta.author.as_deref(), Some("community"));
        assert!(
            meta.icon.is_some(),
            "emoji icon should round-trip into meta"
        );
    }

    #[test]
    fn validate_missing_app_field() {
        // Present-but-empty `app` (a truly absent key is caught by serde at
        // parse time; this exercises our explicit empty-value check).
        let yaml = r#"
app: ""
display_name: tmux
pages:
  - name: Main
    shortcuts:
      - keys: ["Ctrl+A"]
        description: test
"#;
        let err =
            validate_sheet_yaml(yaml.to_string()).expect_err("empty app id should be rejected");
        assert!(
            err.contains("Missing required field: 'app'"),
            "expected missing-app error, got: {}",
            err
        );
    }

    #[test]
    fn validate_empty_pages() {
        let yaml = r#"
app: tmux
display_name: tmux
pages: []
"#;
        let err = validate_sheet_yaml(yaml.to_string())
            .expect_err("a sheet with no pages should be rejected");
        assert!(
            err.contains("at least one page"),
            "expected empty-pages error, got: {}",
            err
        );
    }

    #[test]
    fn validate_shortcut_missing_description() {
        // Present-but-empty description (absent description is caught by serde).
        let yaml = r#"
app: tmux
display_name: tmux
pages:
  - name: Sessions
    shortcuts:
      - keys: ["Ctrl+B"]
        description: ""
"#;
        let err = validate_sheet_yaml(yaml.to_string())
            .expect_err("a shortcut with an empty description should be rejected");
        assert!(
            err.contains("missing 'description'"),
            "expected missing-description error, got: {}",
            err
        );
        // The message should localize the failure: page name + shortcut index.
        assert!(err.contains("Sessions"), "should name the page: {}", err);
        assert!(
            err.contains("shortcut 1"),
            "should name the 1-based shortcut index: {}",
            err
        );
    }

    #[test]
    fn validate_app_id_must_be_lowercase() {
        // Uppercase + spaces — must be rejected and echoed back.
        let yaml = r#"
app: "My App"
display_name: tmux
pages:
  - name: Main
    shortcuts:
      - keys: ["Ctrl+A"]
        description: test
"#;
        let err = validate_sheet_yaml(yaml.to_string())
            .expect_err("an app id with capitals/spaces should be rejected");
        assert!(
            err.contains("must be lowercase with no spaces"),
            "expected lowercase-rule error, got: {}",
            err
        );
        assert!(
            err.contains("My App"),
            "should echo the offending id: {}",
            err
        );
    }
}
