//! Active-window sheet detection.
//!
//! Resolves which sheet(s) to show based on the foreground window's process.
//! The pure matching core (`match_sheets`) lives here and is fully unit-tested;
//! the native foreground-window call lands in Step 2 alongside the hotkey
//! wiring (see PLAN.md: pin → detect → manual precedence).

use crate::sheets::Sheet;
use std::collections::HashMap;

/// Normalize a process name or `match` token: trimmed, lowercased, with a
/// trailing `.exe` removed.
///
/// `tmux`, `Tmux`, and `tmux.exe` all collapse to `tmux`. This mirrors
/// PowerToys' `WindowFilter` leniency (case-insensitive, `.exe` optional) so a
/// single `match` value works against either a bare process name or a full
/// executable name.
fn exe_stem(s: &str) -> String {
    let lower = s.trim().to_lowercase();
    if let Some(rest) = lower.strip_suffix(".exe") {
        rest.to_string()
    } else {
        lower
    }
}

/// Return the ids of every loaded sheet whose `match` list contains `app_name`
/// (case-insensitive, `.exe`-optional) or the wildcard `"*"`.
///
/// Pure and deterministic over a given `sheets` map (iteration order aside;
/// callers that need a stable order sort the result). Sheets with no `match`
/// rules never auto-match — they stay reachable only via manual selection.
///
pub fn match_sheets(app_name: &str, sheets: &HashMap<String, Sheet>) -> Vec<String> {
    let target = exe_stem(app_name);
    sheets
        .iter()
        .filter(|(_, sheet)| match &sheet.match_rules {
            Some(rules) => rules
                .iter()
                .any(|rule| rule.trim() == "*" || exe_stem(rule) == target),
            None => false,
        })
        .map(|(id, _)| id.clone())
        .collect()
}

/// Read the foreground window's process exe stem (e.g. `"explorer"`,
/// `"code"`, `"chrome"`) — derived from the process PATH, not the window's
/// display name.
///
/// This matters: active-win-pos-rs' `app_name` field is the process's friendly
/// name (FileDescription), which is locale-dependent and often differs from
/// the exe name (explorer.exe reports "Windows Explorer"; a French install
/// reports "Explorateur Windows"). The exe stem from `process_path` is stable
/// and locale-independent — the same identifier PowerToys matches on.
///
/// Returns `None` on any failure — no foreground window, an elevated target
/// we're not allowed to inspect, no resolvable exe path, or an unsupported
/// platform. Callers treat `None` as "no detection" and fall back to the last
/// sheet.
//
// ponytail: elevated processes are unreadable by a non-elevated app — the same
// ceiling PowerToys has (their code catches Win32Exception "Access denied").
// No fix without running elevated, which we avoid; we just fall back.
pub fn active_process_stem() -> Option<String> {
    let w = active_win_pos_rs::get_active_window().ok()?;
    let exe = std::path::Path::new(&w.process_path)
        .file_name()?
        .to_string_lossy()
        .into_owned();
    Some(exe_stem(&exe))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sheets::{Page, Shortcut};

    /// Build a sheet with the given `match` rules and a single throwaway page.
    fn sheet_with(id: &str, rules: Option<Vec<&str>>) -> Sheet {
        Sheet {
            app: id.to_string(),
            display_name: id.to_string(),
            version: None,
            schema_version: None,
            author: None,
            icon: None,
            match_rules: rules.map(|r| r.iter().map(|s| s.to_string()).collect()),
            pages: vec![Page {
                name: "Main".to_string(),
                shortcuts: vec![Shortcut {
                    keys: vec!["Ctrl+A".to_string()],
                    description: "test".to_string(),
                    tags: None,
                }],
                columns: None,
                sections: None,
            }],
        }
    }

    fn sheets_of(items: &[(&str, Option<Vec<&str>>)]) -> HashMap<String, Sheet> {
        let mut m = HashMap::new();
        for (id, rules) in items {
            m.insert(id.to_string(), sheet_with(id, rules.clone()));
        }
        m
    }

    /// Sort helper so multi-match assertions don't depend on HashMap order.
    fn matched_sorted(app: &str, sheets: &HashMap<String, Sheet>) -> Vec<String> {
        let mut v = match_sheets(app, sheets);
        v.sort();
        v
    }

    // --- exe_stem ----------------------------------------------------------

    #[test]
    fn exe_stem_lowercases() {
        assert_eq!(exe_stem("Tmux"), "tmux");
        assert_eq!(exe_stem("WindowsTerminal"), "windowsterminal");
    }

    #[test]
    fn exe_stem_strips_exe_suffix() {
        assert_eq!(exe_stem("tmux.exe"), "tmux");
        assert_eq!(exe_stem("Chrome.EXE"), "chrome");
        assert_eq!(exe_stem("foo.bar.exe"), "foo.bar");
    }

    #[test]
    fn exe_stem_trims_whitespace() {
        assert_eq!(exe_stem("  tmux.exe "), "tmux");
    }

    #[test]
    fn exe_stem_passes_through_non_exe() {
        assert_eq!(exe_stem("tmux:server"), "tmux:server");
        assert_eq!(exe_stem("*"), "*");
    }

    // --- match_sheets ------------------------------------------------------

    #[test]
    fn matches_exact_process_name() {
        let sheets = sheets_of(&[("tmux", Some(vec!["tmux"]))]);
        assert_eq!(matched_sorted("tmux", &sheets), vec!["tmux"]);
    }

    #[test]
    fn matches_regardless_of_exe_suffix_and_case() {
        // rule bare, app name with .exe + caps
        let sheets = sheets_of(&[("tmux", Some(vec!["tmux"]))]);
        assert_eq!(matched_sorted("Tmux.exe", &sheets), vec!["tmux"]);

        // rule carries .exe, app name bare
        let sheets = sheets_of(&[("chrome", Some(vec!["Chrome.exe"]))]);
        assert_eq!(matched_sorted("chrome", &sheets), vec!["chrome"]);
    }

    #[test]
    fn does_not_match_unrelated_process() {
        let sheets = sheets_of(&[("tmux", Some(vec!["tmux"]))]);
        assert!(match_sheets("vim", &sheets).is_empty());
    }

    #[test]
    fn wildcard_matches_any_app() {
        let sheets = sheets_of(&[("global", Some(vec!["*"]))]);
        assert_eq!(
            matched_sorted("literally-anything", &sheets),
            vec!["global"]
        );
        assert_eq!(matched_sorted("code.exe", &sheets), vec!["global"]);
    }

    #[test]
    fn multiple_sheets_can_match() {
        let sheets = sheets_of(&[
            ("a", Some(vec!["explorer"])),
            ("b", Some(vec!["explorer", "explorer.exe"])),
        ]);
        assert_eq!(matched_sorted("Explorer.exe", &sheets), vec!["a", "b"]);
    }

    #[test]
    fn sheet_without_match_rules_never_auto_matches() {
        let sheets = sheets_of(&[("ghost", None)]);
        // Even when the app name equals the sheet's own id, no match rules ⇒ no auto-match.
        assert!(match_sheets("ghost", &sheets).is_empty());
    }

    #[test]
    fn any_rule_in_list_matches() {
        let sheets = sheets_of(&[("tmux", Some(vec!["tmux", "tmux:server"]))]);
        assert_eq!(matched_sorted("tmux", &sheets), vec!["tmux"]);
        assert_eq!(matched_sorted("tmux:server", &sheets), vec!["tmux"]);
    }
}
