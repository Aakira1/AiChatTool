export function getPageContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const selection = window.getSelection()?.toString().trim() ?? "";

  return {
    url: window.location.href,
    title: document.title,
    selection: selection.slice(0, 8000),
  };
}
