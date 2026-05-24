const MAX_SCREENSHOT_CHARS = 550_000;

/**
 * Build a POST /api/chat pageContext object (only API-allowed string fields).
 * Returns undefined when there is nothing to send — never null.
 */
export function pickPageContextForApi(context) {
  if (!context || typeof context !== "object") {
    return undefined;
  }

  const out = {};
  if (context.url) out.url = String(context.url).slice(0, 2000);
  if (context.title) out.title = String(context.title).slice(0, 500);
  if (context.selection) out.selection = String(context.selection).slice(0, 8000);
  if (context.excerpt) out.excerpt = String(context.excerpt).slice(0, 8000);

  const screenshot = context.screenshot;
  if (typeof screenshot === "string" && screenshot.length > 0) {
    if (screenshot.length <= MAX_SCREENSHOT_CHARS) {
      out.screenshot = screenshot;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}
