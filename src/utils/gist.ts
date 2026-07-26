/**
 * Convert a GitHub Gist page URL into a raw content URL.
 *
 * Handles:
 *   https://gist.github.com/user/abc123
 *   https://gist.github.com/user/abc123/raw
 *   https://gist.github.com/user/abc123/raw/filename.yaml
 *
 * URLs that are not Gist *pages* — raw Gist URLs, raw YAML URLs on other
 * hosts, anything that already points at file content — are returned as-is.
 *
 * The Gist REST API is called only when the URL looks like a Gist page (no
 * `/raw` segment). Direct raw URLs bypass the API entirely, which avoids the
 * unauthenticated rate limit (60 req/hr). Throws on API failure or an empty
 * Gist.
 */
export async function resolveGistUrl(url: string): Promise<string> {
	const trimmed = url.trim();
	if (!trimmed) {
		throw new Error("URL is empty");
	}

	// Only Gist page URLs need API resolution. Everything else (raw URLs,
	// other hosts) is fetched directly.
	const isGistPage =
		trimmed.includes("gist.github.com") && !trimmed.includes("/raw");
	if (!isGistPage) {
		return trimmed;
	}

	// Extract the gist id (last non-empty path segment).
	const gistId = trimmed.split("/").filter(Boolean).at(-1);
	if (!gistId) {
		throw new Error("Could not extract Gist id from URL");
	}

	const apiUrl = `https://api.github.com/gists/${gistId}`;
	const res = await fetch(apiUrl);
	if (!res.ok) {
		throw new Error(`Could not fetch Gist metadata (HTTP ${res.status})`);
	}

	const data = (await res.json()) as {
		files: Record<string, { raw_url: string }>;
	};
	const files = Object.values(data.files);
	if (files.length === 0) {
		throw new Error("No files found in Gist");
	}

	// Prefer a .yaml file; otherwise fall back to the first file.
	const yamlFile = files.find((f) => f.raw_url.endsWith(".yaml")) ?? files[0];
	if (!yamlFile) {
		throw new Error("No usable file found in Gist");
	}

	return yamlFile.raw_url;
}
