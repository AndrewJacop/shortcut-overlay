use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::Manager;

// ---------------------------------------------------------------------------
// Public structs — serialized to JSON for the frontend
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Sheet {
    pub app: String,
    pub display_name: String,
    pub version: Option<String>,
    pub author: Option<String>,
    pub icon: Option<SheetIcon>,
    #[serde(rename = "match")]
    pub match_rules: Option<Vec<String>>,
    pub pages: Vec<Page>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SheetIcon {
    #[serde(rename = "type")]
    pub icon_type: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Page {
    pub name: String,
    pub shortcuts: Vec<Shortcut>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Shortcut {
    pub keys: Vec<String>,
    pub description: String,
    pub tags: Option<Vec<String>>,
}

#[derive(Serialize, Clone, Debug)]
pub struct SheetMeta {
    pub app: String,
    pub display_name: String,
    pub version: Option<String>,
    pub author: Option<String>,
    pub icon: Option<SheetIcon>,
}

impl From<&Sheet> for SheetMeta {
    fn from(sheet: &Sheet) -> Self {
        SheetMeta {
            app: sheet.app.clone(),
            display_name: sheet.display_name.clone(),
            version: sheet.version.clone(),
            author: sheet.author.clone(),
            icon: sheet.icon.clone(),
        }
    }
}

/// A sheet's metadata paired with its install source.
/// Returned by `get_sheet_sources` so the settings UI can show
/// "Bundled" vs "Installed" badges.
#[derive(Serialize, Clone, Debug)]
pub struct SheetSource {
    pub meta: SheetMeta,
    /// "bundled" (ships with the app) or "user" (installed to filesystem).
    pub source: String,
}

// ---------------------------------------------------------------------------
// State — managed by Tauri
// ---------------------------------------------------------------------------

pub struct SheetsState {
    pub sheets: Mutex<HashMap<String, Sheet>>,
    /// IDs of sheets loaded from the user's filesystem (not bundled).
    /// Used to show "user" vs "bundled" source badges in the UI.
    pub user_sheet_ids: Mutex<HashSet<String>>,
}

// ---------------------------------------------------------------------------
// Raw YAML deserialization (handles icon shorthand)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RawSheet {
    app: String,
    display_name: String,
    version: Option<String>,
    author: Option<String>,
    icon: Option<RawIcon>,
    r#match: Option<Vec<String>>,
    pages: Vec<Page>,
}

/// The YAML schema allows two icon forms:
///   icon: "🖥️"                        → emoji shorthand
///   icon: { type: url, value: "..." } → structured
#[derive(Deserialize)]
#[serde(untagged)]
enum RawIcon {
    Emoji(String),
    Detailed {
        #[serde(rename = "type")]
        icon_type: String,
        value: String,
    },
}

fn normalize_icon(raw: RawIcon) -> SheetIcon {
    match raw {
        RawIcon::Emoji(emoji) => SheetIcon {
            icon_type: "emoji".to_string(),
            value: emoji,
        },
        RawIcon::Detailed { icon_type, value } => SheetIcon { icon_type, value },
    }
}

fn raw_to_sheet(raw: RawSheet) -> Sheet {
    Sheet {
        app: raw.app,
        display_name: raw.display_name,
        version: raw.version,
        author: raw.author,
        icon: raw.icon.map(normalize_icon),
        match_rules: raw.r#match,
        pages: raw.pages,
    }
}

// ---------------------------------------------------------------------------
// Validation — the single gate for every sheet install
// ---------------------------------------------------------------------------

/// Parse + fully validate a YAML sheet string in a single pass.
///
/// This is the single source of truth for sheet validation: URL imports,
/// registry installs, and (eventually) user-dropped files all flow through
/// here before anything is written to disk. On success returns both the
/// parsed `Sheet` and its `SheetMeta`; on failure returns a specific,
/// human-readable error describing the first violation.
///
/// Returning the parsed `Sheet` lets `install_sheet` validate and obtain the
/// live data to insert into `SheetsState` in one parse, without exposing the
/// private `RawSheet` / `raw_to_sheet` internals.
///
/// Checks run in priority order:
///   1. YAML parses to `RawSheet` (structural errors → "YAML parse error")
///   2. `app` present + non-empty
///   3. `app` is lowercase with no spaces (used as filename + map key)
///   4. `display_name` present + non-empty
///   5. at least one page
///   6. each page has a non-empty `name`
///   7. each page has at least one shortcut
///   8. each shortcut has non-empty `keys`
///   9. each shortcut has a non-empty `description`
///
/// Note: struct fields that are required by serde (`app`, `display_name`,
/// page `name`/`shortcuts`, shortcut `keys`/`description`) are caught at parse
/// time when entirely absent — they surface as a "YAML parse error". The
/// explicit checks below catch present-but-empty values (e.g. `app: ""`),
/// which serde would otherwise happily accept.
pub(crate) fn validate_and_parse_sheet(content: &str) -> Result<(Sheet, SheetMeta), String> {
    let raw: RawSheet =
        serde_yaml::from_str(content).map_err(|e| format!("YAML parse error: {}", e))?;

    // `app` — required, non-empty.
    if raw.app.trim().is_empty() {
        return Err("Missing required field: 'app'".to_string());
    }
    // `app` — lowercase with no spaces (it becomes a filename + lookup key).
    if raw.app != raw.app.to_lowercase() || raw.app.contains(' ') {
        return Err(format!(
            "'app' must be lowercase with no spaces (got: '{}')",
            raw.app
        ));
    }
    // `display_name` — required, non-empty.
    if raw.display_name.trim().is_empty() {
        return Err("Missing required field: 'display_name'".to_string());
    }
    // At least one page.
    if raw.pages.is_empty() {
        return Err("Sheet must have at least one page".to_string());
    }
    // Each page is well-formed.
    for (pi, page) in raw.pages.iter().enumerate() {
        // Label pages by name when present, otherwise by 1-based index.
        let page_label = if page.name.trim().is_empty() {
            format!("Page {}", pi + 1)
        } else {
            format!("Page '{}'", page.name)
        };
        if page.name.trim().is_empty() {
            return Err(format!("{}: missing 'name' field", page_label));
        }
        if page.shortcuts.is_empty() {
            return Err(format!("{}: must have at least one shortcut", page_label));
        }
        for (si, shortcut) in page.shortcuts.iter().enumerate() {
            if shortcut.keys.is_empty() {
                return Err(format!(
                    "{} shortcut {}: missing or empty 'keys'",
                    page_label,
                    si + 1
                ));
            }
            if shortcut.description.trim().is_empty() {
                return Err(format!(
                    "{} shortcut {}: missing 'description'",
                    page_label,
                    si + 1
                ));
            }
        }
    }

    let sheet = raw_to_sheet(raw);
    let meta = SheetMeta::from(&sheet);
    Ok((sheet, meta))
}

/// Validate a YAML sheet string and return its metadata if valid.
///
/// Thin wrapper over `validate_and_parse_sheet` that discards the full
/// `Sheet`. Used by the import preview flow (`validate_sheet_yaml` command),
/// which only needs the metadata to render a preview before committing to an
/// install. Install paths call `validate_and_parse_sheet` directly to reuse
/// the parsed data.
pub(crate) fn validate_sheet_yaml(content: &str) -> Result<SheetMeta, String> {
    validate_and_parse_sheet(content).map(|(_, meta)| meta)
}

// ---------------------------------------------------------------------------
// Loader — bundled sheets embedded at compile time
// ---------------------------------------------------------------------------

/// Load all bundled YAML sheets into a HashMap keyed by `app` id.
/// Malformed sheets are logged to stderr and skipped (never panic).
pub fn load_bundled_sheets() -> HashMap<String, Sheet> {
    let mut sheets = HashMap::new();

    let bundled: Vec<&str> = vec![
        include_str!("../../../sheets/tmux.yaml"),
        include_str!("../../../sheets/vim.yaml"),
        include_str!("../../../sheets/git.yaml"),
    ];

    for (i, yaml) in bundled.iter().enumerate() {
        match serde_yaml::from_str::<RawSheet>(yaml) {
            Ok(raw) => {
                let sheet = raw_to_sheet(raw);
                eprintln!(
                    "[sheets] Loaded bundled sheet: {} ({})",
                    sheet.app, sheet.display_name
                );
                sheets.insert(sheet.app.clone(), sheet);
            }
            Err(e) => {
                eprintln!(
                    "[sheets] ERROR: Failed to parse bundled sheet #{}: {}",
                    i, e
                );
            }
        }
    }

    eprintln!("[sheets] {} sheet(s) loaded successfully", sheets.len());
    sheets
}

// ---------------------------------------------------------------------------
// Loader — user sheets from the filesystem
// ---------------------------------------------------------------------------

/// Load user-installed sheets from `{app_config_dir}/sheets/*.yaml`.
/// Creates the directory if it doesn't exist so users can drop files in.
/// Malformed files are logged to stderr and skipped (never panic).
/// Returns a HashMap keyed by `app` id.
pub fn load_user_sheets(app: &tauri::AppHandle) -> HashMap<String, Sheet> {
    let mut sheets = HashMap::new();

    let Ok(config_dir) = app.path().app_config_dir() else {
        return sheets;
    };
    let sheets_dir = config_dir.join("sheets");

    if !sheets_dir.exists() {
        // Create the dir so users can drop files into it later.
        let _ = std::fs::create_dir_all(&sheets_dir);
        return sheets;
    }

    let Ok(entries) = std::fs::read_dir(&sheets_dir) else {
        return sheets;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("yaml") {
            continue;
        }
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_yaml::from_str::<RawSheet>(&content) {
                Ok(raw) => {
                    let sheet = raw_to_sheet(raw);
                    eprintln!(
                        "[sheets] Loaded user sheet: {} from {}",
                        sheet.app,
                        path.display()
                    );
                    sheets.insert(sheet.app.clone(), sheet);
                }
                Err(e) => eprintln!("[sheets] WARN: Could not parse {}: {}", path.display(), e),
            },
            Err(e) => eprintln!("[sheets] WARN: Could not read {}: {}", path.display(), e),
        }
    }

    sheets
}

/// Load bundled sheets, then overlay user sheets from the filesystem.
/// A user sheet with the same `app` id as a bundled sheet overrides it.
/// Returns the merged map plus the set of IDs that came from the filesystem.
pub fn load_all_sheets(app: &tauri::AppHandle) -> (HashMap<String, Sheet>, HashSet<String>) {
    let mut sheets = load_bundled_sheets();
    let user = load_user_sheets(app);
    let user_ids: HashSet<String> = user.keys().cloned().collect();
    // User sheets override bundled ones on the same `app` id.
    sheets.extend(user);
    (sheets, user_ids)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_tmux_sheet_from_disk() {
        let yaml = include_str!("../../../sheets/tmux.yaml");
        let raw: RawSheet = serde_yaml::from_str(yaml).expect("tmux.yaml should parse");
        let sheet = raw_to_sheet(raw);

        assert_eq!(sheet.app, "tmux");
        assert_eq!(sheet.display_name, "tmux");
        assert_eq!(sheet.version.as_deref(), Some("1.0.0"));
        assert!(sheet.icon.is_some());

        let icon = sheet.icon.unwrap();
        assert_eq!(icon.icon_type, "emoji");
        // Emoji value is present
        assert!(!icon.value.is_empty());

        // Should have multiple pages
        assert!(
            sheet.pages.len() >= 4,
            "expected at least 4 pages, got {}",
            sheet.pages.len()
        );

        // First page should be Sessions
        assert_eq!(sheet.pages[0].name, "Sessions");
        assert!(!sheet.pages[0].shortcuts.is_empty());

        // Check a shortcut has keys and description
        let first = &sheet.pages[0].shortcuts[0];
        assert!(!first.keys.is_empty());
        assert!(!first.description.is_empty());
    }

    #[test]
    fn parse_structured_icon() {
        let yaml = r#"
app: test
display_name: Test
pages:
  - name: Main
    shortcuts:
      - keys: ["Ctrl+A"]
        description: Test
icon:
  type: url
  value: "https://example.com/icon.png"
"#;
        let raw: RawSheet = serde_yaml::from_str(yaml).unwrap();
        let sheet = raw_to_sheet(raw);
        let icon = sheet.icon.unwrap();
        assert_eq!(icon.icon_type, "url");
        assert_eq!(icon.value, "https://example.com/icon.png");
    }

    #[test]
    fn parse_emoji_icon_shorthand() {
        let yaml = r#"
app: test
display_name: Test
pages:
  - name: Main
    shortcuts:
      - keys: ["Ctrl+A"]
        description: Test
icon: "🖥️"
"#;
        let raw: RawSheet = serde_yaml::from_str(yaml).unwrap();
        let sheet = raw_to_sheet(raw);
        let icon = sheet.icon.unwrap();
        assert_eq!(icon.icon_type, "emoji");
        assert_eq!(icon.value, "🖥️");
    }

    #[test]
    fn sheet_meta_from_sheet() {
        let sheets = load_bundled_sheets();
        let tmux = sheets.get("tmux").expect("tmux sheet should be loaded");
        let meta = SheetMeta::from(tmux);
        assert_eq!(meta.app, "tmux");
        assert_eq!(meta.display_name, "tmux");
        assert!(meta.icon.is_some());
    }

    #[test]
    fn match_rules_parsed() {
        let sheets = load_bundled_sheets();
        let tmux = sheets.get("tmux").unwrap();
        let rules = tmux.match_rules.as_ref().expect("match should be set");
        assert!(rules.contains(&"tmux".to_string()));
        assert!(rules.contains(&"tmux:server".to_string()));
    }

    #[test]
    fn tags_parsed_when_present() {
        let sheets = load_bundled_sheets();
        let tmux = sheets.get("tmux").unwrap();
        let first = &tmux.pages[0].shortcuts[0];
        assert!(first.tags.is_some());
        assert!(first
            .tags
            .as_ref()
            .unwrap()
            .contains(&"session".to_string()));
    }

    #[test]
    fn load_bundled_sheets_returns_tmux() {
        let sheets = load_bundled_sheets();
        assert!(
            sheets.contains_key("tmux"),
            "bundled sheets should contain tmux"
        );
    }

    #[test]
    fn load_bundled_sheets_returns_all_three() {
        let sheets = load_bundled_sheets();
        assert!(sheets.contains_key("tmux"), "missing tmux");
        assert!(sheets.contains_key("vim"), "missing vim");
        assert!(sheets.contains_key("git"), "missing git");
        assert_eq!(sheets.len(), 3);
    }

    #[test]
    fn user_sheet_overrides_bundled_on_same_id() {
        // Simulate the merge that `load_all_sheets` performs: a user sheet
        // with the same `app` id as a bundled sheet replaces it entirely.
        // (A real AppHandle isn't available in unit tests, so we replicate
        // the `sheets.extend(user)` step directly.)
        let mut sheets = load_bundled_sheets();
        assert_eq!(
            sheets.get("tmux").unwrap().display_name,
            "tmux",
            "bundled tmux display_name should be 'tmux' before override"
        );

        let override_yaml = r#"
app: tmux
display_name: "tmux (override)"
pages:
  - name: Test
    shortcuts:
      - keys: ["Ctrl+B"]
        description: test
"#;
        let raw: RawSheet = serde_yaml::from_str(override_yaml).unwrap();
        let user_sheet = raw_to_sheet(raw);

        // `load_all_sheets` does `sheets.extend(user)` — user entries win.
        sheets.insert("tmux".to_string(), user_sheet);

        assert_eq!(sheets["tmux"].display_name, "tmux (override)");
        // The override completely replaces the bundled sheet.
        assert_eq!(sheets["tmux"].pages.len(), 1);
        assert_eq!(sheets["tmux"].pages[0].name, "Test");
    }

    #[test]
    fn sheet_source_serializes_with_source_field() {
        let sheets = load_bundled_sheets();
        let tmux = sheets.get("tmux").unwrap();
        let source = SheetSource {
            meta: SheetMeta::from(tmux),
            source: "user".to_string(),
        };
        let json = serde_json::to_string(&source).expect("serialize SheetSource");
        assert!(
            json.contains("\"source\":\"user\""),
            "expected source field in JSON, got: {}",
            json
        );
        assert!(json.contains("\"app\":\"tmux\""));
    }
}
