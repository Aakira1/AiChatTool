function pickMainExcerpt() {
  const candidates = [
    document.querySelector("main"),
    document.querySelector("article"),
    document.querySelector('[role="main"]'),
    document.body,
  ].filter(Boolean);

  for (const node of candidates) {
    const text = node.innerText?.trim();
    if (text && text.length > 200) {
      return text;
    }
  }
  return document.body?.innerText?.trim() ?? "";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CIA_GET_PAGE_CONTEXT") {
    return false;
  }

  try {
    const selection = window.getSelection?.()?.toString().trim() ?? "";
    const excerpt = message.includeExcerpt ? pickMainExcerpt() : "";
    sendResponse({
      url: window.location.href,
      title: document.title,
      selection: selection.slice(0, 8000),
      excerpt: excerpt.slice(0, 8000),
    });
  } catch (error) {
    sendResponse({ error: error?.message ?? String(error) });
  }
  return true;
});
