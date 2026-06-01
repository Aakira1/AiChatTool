const STORAGE_KEY = "cia.settings.v1";
const EVENT_NAME = "cia:settings:changed";

const DEFAULTS = {
  showInsights: true,
  showArtifactsByDefault: false,
  provider: "server",
  reasoning: "auto",
  sources: { webSearch: false, companyKnowledge: true },
  connectorSources: [],
};

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getSettings() {
  if (typeof window === "undefined") return DEFAULTS;
  const stored = safeParse(window.localStorage.getItem(STORAGE_KEY));
  return { ...DEFAULTS, ...(stored ?? {}) };
}

export function saveSettings(updates) {
  if (typeof window === "undefined") return DEFAULTS;
  const next = { ...getSettings(), ...updates };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  return next;
}

export function subscribeSettings(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(event.detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
