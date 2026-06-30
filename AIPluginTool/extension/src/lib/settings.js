import { appById } from "./apps.js";

const STORAGE_KEY = "cia.settings.v1";
const EVENT_NAME = "cia:settings:changed";

// Theme presets mapped onto the side panel's --cia-* CSS variables. "magenta"
// reproduces the original palette exactly so the default look is unchanged.
export const THEMES = [
  {
    id: "magenta",
    label: "Magenta",
    swatch: "linear-gradient(135deg, #e4007c, #f7941d)",
    vars: {
      "--cia-deep": "#1a0f3d",
      "--cia-navy": "#2d1b69",
      "--cia-magenta": "#e4007c",
      "--cia-magenta-dark": "#b80064",
      "--cia-orange": "#f7941d",
      "--cia-purple": "#7c3aed",
      "--cia-light": "#faf7ff",
      "--cia-soft": "#f4eefb",
      "--cia-border": "rgba(124, 58, 237, 0.15)",
      "--cia-body": "#1f1235",
      "--cia-muted": "#6b6285",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    swatch: "linear-gradient(135deg, #0ea5e9, #6366f1)",
    vars: {
      "--cia-deep": "#0b1e3d",
      "--cia-navy": "#0f2a52",
      "--cia-magenta": "#0ea5e9",
      "--cia-magenta-dark": "#0284c7",
      "--cia-orange": "#06b6d4",
      "--cia-purple": "#3b82f6",
      "--cia-light": "#f0f9ff",
      "--cia-soft": "#eff6ff",
      "--cia-border": "rgba(59, 130, 246, 0.18)",
      "--cia-body": "#1e3a5f",
      "--cia-muted": "#475569",
    },
  },
  {
    id: "forest",
    label: "Forest",
    swatch: "linear-gradient(135deg, #16a34a, #65a30d)",
    vars: {
      "--cia-deep": "#0a2e1a",
      "--cia-navy": "#14532d",
      "--cia-magenta": "#16a34a",
      "--cia-magenta-dark": "#15803d",
      "--cia-orange": "#84cc16",
      "--cia-purple": "#15803d",
      "--cia-light": "#f0fdf4",
      "--cia-soft": "#ecfdf3",
      "--cia-border": "rgba(22, 163, 74, 0.18)",
      "--cia-body": "#14532d",
      "--cia-muted": "#4d7c0f",
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    swatch: "linear-gradient(135deg, #475569, #64748b)",
    vars: {
      "--cia-deep": "#0f172a",
      "--cia-navy": "#1e293b",
      "--cia-magenta": "#475569",
      "--cia-magenta-dark": "#334155",
      "--cia-orange": "#f59e0b",
      "--cia-purple": "#475569",
      "--cia-light": "#f8fafc",
      "--cia-soft": "#f1f5f9",
      "--cia-border": "rgba(71, 85, 105, 0.2)",
      "--cia-body": "#1e293b",
      "--cia-muted": "#64748b",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    swatch: "linear-gradient(135deg, #f97316, #db2777)",
    vars: {
      "--cia-deep": "#3b0a2e", "--cia-navy": "#7c2d52",
      "--cia-magenta": "#db2777", "--cia-magenta-dark": "#be185d",
      "--cia-orange": "#f97316", "--cia-purple": "#e11d48",
      "--cia-light": "#fff7f3", "--cia-soft": "#ffeee6",
      "--cia-border": "rgba(219, 39, 119, 0.16)", "--cia-body": "#4a1130", "--cia-muted": "#9d6b80",
    },
  },
  {
    id: "grape",
    label: "Grape",
    swatch: "linear-gradient(135deg, #7c3aed, #c026d3)",
    vars: {
      "--cia-deep": "#2e1065", "--cia-navy": "#4c1d95",
      "--cia-magenta": "#a21caf", "--cia-magenta-dark": "#86198f",
      "--cia-orange": "#c026d3", "--cia-purple": "#7c3aed",
      "--cia-light": "#faf5ff", "--cia-soft": "#f3e8ff",
      "--cia-border": "rgba(124, 58, 237, 0.16)", "--cia-body": "#3b0764", "--cia-muted": "#7e6b9c",
    },
  },
  {
    id: "rose",
    label: "Rose",
    swatch: "linear-gradient(135deg, #f43f5e, #fb7185)",
    vars: {
      "--cia-deep": "#4c0519", "--cia-navy": "#881337",
      "--cia-magenta": "#e11d48", "--cia-magenta-dark": "#be123c",
      "--cia-orange": "#fb7185", "--cia-purple": "#f43f5e",
      "--cia-light": "#fff1f3", "--cia-soft": "#ffe4e8",
      "--cia-border": "rgba(244, 63, 94, 0.16)", "--cia-body": "#4c0519", "--cia-muted": "#a16270",
    },
  },
  {
    id: "teal",
    label: "Teal",
    swatch: "linear-gradient(135deg, #0d9488, #14b8a6)",
    vars: {
      "--cia-deep": "#042f2e", "--cia-navy": "#134e4a",
      "--cia-magenta": "#0d9488", "--cia-magenta-dark": "#0f766e",
      "--cia-orange": "#14b8a6", "--cia-purple": "#0891b2",
      "--cia-light": "#f0fdfa", "--cia-soft": "#ccfbf1",
      "--cia-border": "rgba(13, 148, 136, 0.18)", "--cia-body": "#134e4a", "--cia-muted": "#5a8a85",
    },
  },
  {
    id: "amber",
    label: "Amber",
    swatch: "linear-gradient(135deg, #d97706, #f59e0b)",
    vars: {
      "--cia-deep": "#451a03", "--cia-navy": "#78350f",
      "--cia-magenta": "#d97706", "--cia-magenta-dark": "#b45309",
      "--cia-orange": "#f59e0b", "--cia-purple": "#ea580c",
      "--cia-light": "#fffbeb", "--cia-soft": "#fef3c7",
      "--cia-border": "rgba(217, 119, 6, 0.18)", "--cia-body": "#78350f", "--cia-muted": "#9a7b4f",
    },
  },
  {
    id: "indigo",
    label: "Indigo",
    swatch: "linear-gradient(135deg, #4f46e5, #818cf8)",
    vars: {
      "--cia-deep": "#1e1b4b", "--cia-navy": "#312e81",
      "--cia-magenta": "#4f46e5", "--cia-magenta-dark": "#4338ca",
      "--cia-orange": "#6366f1", "--cia-purple": "#4f46e5",
      "--cia-light": "#f5f5ff", "--cia-soft": "#eef2ff",
      "--cia-border": "rgba(79, 70, 229, 0.16)", "--cia-body": "#312e81", "--cia-muted": "#6e6c9c",
    },
  },
  {
    id: "crimson",
    label: "Crimson",
    swatch: "linear-gradient(135deg, #dc2626, #991b1b)",
    vars: {
      "--cia-deep": "#450a0a", "--cia-navy": "#7f1d1d",
      "--cia-magenta": "#dc2626", "--cia-magenta-dark": "#b91c1c",
      "--cia-orange": "#ef4444", "--cia-purple": "#dc2626",
      "--cia-light": "#fef5f5", "--cia-soft": "#fee2e2",
      "--cia-border": "rgba(220, 38, 38, 0.16)", "--cia-body": "#7f1d1d", "--cia-muted": "#a36868",
    },
  },
];

// Dark mode overrides — applied on top of the active theme.
const DARK_OVERRIDES = {
  "--cia-light": "#1a1a2e",
  "--cia-soft": "#22223a",
  "--cia-border": "rgba(255,255,255,0.1)",
  "--cia-body": "#e4e4ef",
  "--cia-muted": "#9e9eb8",
};

export function applyDarkMode(on) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (on) {
    root.dataset.darkMode = "true";
    Object.entries(DARK_OVERRIDES).forEach(([k, v]) => root.style.setProperty(k, v));
  } else {
    delete root.dataset.darkMode;
    const settings = getSettings();
    const theme = THEMES.find((t) => t.id === settings.theme) ?? THEMES[0];
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  }
}

// User-created custom theme colors stored in settings.customThemes.
// Each: { id, label, swatch, vars }
export function getCustomThemes(settings) {
  return Array.isArray(settings?.customThemes) ? settings.customThemes : [];
}
export function allThemes(settings) {
  return [...THEMES, ...getCustomThemes(settings)];
}

const DEFAULTS = {
  showInsights: true,
  showArtifactsByDefault: false,
  provider: "server",
  reasoning: "auto",
  theme: "magenta",
  darkMode: false,
  density: "comfortable",
  pinnedApp: "",
  chatModel: "",
  rememberUploads: true,
  sources: { webSearch: false, companyKnowledge: true },
  connectorSources: [],
  privacyMode: false,
  debugHighlight: false,
  wholePageVision: false,
  customThemes: [],
};

// Mirror flags into chrome.storage.local so the background service worker and
// content scripts (which can't see the side panel's localStorage) can read them.
function syncPrivacyToChromeStorage(settings) {
  try {
    const app = settings?.pinnedApp ? appById(settings.pinnedApp) : null;
    chrome?.storage?.local?.set?.({
      ciaPrivacyMode: Boolean(settings?.privacyMode),
      ciaDebugHighlight: Boolean(settings?.debugHighlight),
      ciaWholePageVision: Boolean(settings?.wholePageVision),
      // Mirror the bubble-pinned app so the content script can render its button.
      ciaPinnedApp: app ? { id: app.id, icon: app.icon, label: app.label } : null,
    });
  } catch {
    /* ignore */
  }
}

/** Whether page vision is allowed (i.e. Privacy mode is OFF). */
export function isPageVisionAllowed() {
  return getSettings().privacyMode !== true;
}

/** Whether to draw debug highlight boxes for what the relay AI sees. */
export function isDebugHighlight() {
  return getSettings().debugHighlight === true;
}

/** Whether to outline the whole page when the AI reads it. */
export function isWholePageVision() {
  return getSettings().wholePageVision === true;
}

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
  syncPrivacyToChromeStorage(next);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  return next;
}

export function subscribeSettings(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(event.detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

// Apply a theme's colors to the document root (live, no reload).
export function applyTheme(themeId) {
  if (typeof document === "undefined") return;
  const all = allThemes(getSettings());
  const theme = all.find((t) => t.id === themeId) ?? THEMES[0];
  Object.entries(theme.vars).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
  document.documentElement.dataset.theme = theme.id;
}

// Apply UI density to the document root (CSS keys off [data-density]).
export function applyDensity(density) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = density === "compact" ? "compact" : "comfortable";
}

export function applySettings(settings = getSettings()) {
  applyTheme(settings.theme);
  applyDensity(settings.density);
  if (settings.darkMode) applyDarkMode(true);
  syncPrivacyToChromeStorage(settings);
}
