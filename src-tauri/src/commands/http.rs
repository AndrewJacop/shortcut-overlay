//! Generic remote-content fetching.
//!
//! A single Tauri command for HTTP GETs that return text. Routing the
//! request through Rust (rather than the webview's `fetch`) sidesteps
//! browser CORS restrictions entirely, so any reachable raw URL works —
//! a registry index (JSON), a sheet (YAML), a Gist, paste.rs, …
//!
//! Validation and size limits are the caller's responsibility: this only
//! moves bytes from a URL to a String.

use std::time::Duration;

/// Fetch a URL over HTTP GET and return the response body as text.
///
/// Not subject to CORS (runs in Rust, not the webview). Follows redirects
/// (so Gist/raw short URLs resolve) and enforces a 20s timeout so an
/// unreachable host fails fast with a readable error instead of hanging.
#[tauri::command]
pub async fn fetch_remote_text(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("shortcut-overlay")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Fetch error: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| format!("Read error: {}", e))
}
