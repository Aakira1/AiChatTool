function isExtensionContext() {
  return typeof chrome !== "undefined" && Boolean(chrome.tabs);
}

export async function getActiveTab() {
  if (!isExtensionContext()) {
    return null;
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ?? null;
}

const RESTRICTED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "view-source:",
  "https://chrome.google.com/webstore",
  "https://chromewebstore.google.com",
];

function isRestrictedUrl(url) {
  if (!url) return true;
  return RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function fallbackContextFromTab(tab) {
  return {
    url: tab?.url ?? "",
    title: tab?.title ?? "",
    selection: "",
    excerpt: "",
    restricted: isRestrictedUrl(tab?.url),
  };
}

export async function getPageContext({ includeExcerpt = false } = {}) {
  const tab = await getActiveTab();
  if (!tab) {
    return { url: "", title: "", selection: "", excerpt: "", restricted: true };
  }

  if (isRestrictedUrl(tab.url)) {
    return fallbackContextFromTab(tab);
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "CIA_GET_PAGE_CONTEXT",
      includeExcerpt,
    });
    if (response && typeof response === "object") {
      return {
        url: response.url ?? tab.url ?? "",
        title: response.title ?? tab.title ?? "",
        selection: (response.selection ?? "").slice(0, 8000),
        excerpt: includeExcerpt ? (response.excerpt ?? "").slice(0, 8000) : "",
        restricted: false,
      };
    }
  } catch {
    // Content script may not be injected yet (e.g. tab loaded before extension install).
    // Try a one-off scripting injection as a fallback.
    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (wantExcerpt) => {
          const selection = window.getSelection?.()?.toString().trim() ?? "";
          const excerpt = wantExcerpt ? (document.body?.innerText ?? "").slice(0, 8000) : "";
          return {
            url: window.location.href,
            title: document.title,
            selection: selection.slice(0, 8000),
            excerpt,
          };
        },
        args: [includeExcerpt],
      });
      if (result) {
        return { ...result, restricted: false };
      }
    } catch {
      // ignore — fall through to tab-only fallback
    }
  }

  return fallbackContextFromTab(tab);
}

export { isRestrictedUrl };
