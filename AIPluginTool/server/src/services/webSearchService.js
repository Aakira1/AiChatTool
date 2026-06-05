// Lightweight web search via DuckDuckGo's HTML endpoint — no API key required.
// Returns a small list of { title, url, snippet } results, best-effort.

const ENDPOINT = "https://html.duckduckgo.com/html/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function stripTags(html) {
  return String(html ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// DDG wraps result links as //duckduckgo.com/l/?uddg=<encoded-url>. Unwrap them.
function resolveUrl(href) {
  try {
    const match = /[?&]uddg=([^&]+)/.exec(href);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    /* fall through */
  }
  if (href.startsWith("//")) return `https:${href}`;
  return href;
}

export async function searchWeb(query, { limit = 5, signal } = {}) {
  const q = String(query ?? "").trim();
  if (!q) return [];

  let html = "";
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ q }).toString(),
      signal,
    });
    if (!response.ok) return [];
    html = await response.text();
  } catch {
    return [];
  }

  const results = [];
  // Tolerate extra classes / attribute ordering: capture the anchor's attribute
  // blob (for href) and its inner text separately.
  const linkRe = /<a\b([^>]*\bclass="[^"]*\bresult__a\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a\b[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

  const snippets = [];
  let s;
  while ((s = snippetRe.exec(html)) !== null) snippets.push(stripTags(s[1]));

  let m;
  let i = 0;
  while ((m = linkRe.exec(html)) !== null && results.length < limit) {
    const hrefMatch = /href="([^"]+)"/.exec(m[1]);
    const title = stripTags(m[2]);
    const url = hrefMatch ? resolveUrl(hrefMatch[1]) : "";
    if (title && url) {
      results.push({ title, url, snippet: snippets[i] ?? "" });
    }
    i += 1;
  }
  return results;
}

/** Render web results into a prompt context block, or "" if none. */
export function buildWebContext(results) {
  if (!results?.length) return "";
  const lines = results.map(
    (r, index) =>
      `${index + 1}. ${r.title} — ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`,
  );
  return [
    "Web search results (use these for current/external facts and cite the source URL when you rely on one):",
    ...lines,
  ].join("\n");
}
