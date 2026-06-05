const STORAGE_KEY = "cia.settings.v1";
const EVENT_NAME = "cia:settings:changed";

export const THEMES = [
  {
    id: "magenta",
    label: "Magenta sunset",
    swatch: "linear-gradient(135deg, #e4007c, #f7941d)",
    vars: {
      "--t1-deep": "#1a0b2e",
      "--t1-navy": "#2a1446",
      "--t1-purple": "#6b2b8c",
      "--t1-magenta": "#e4007c",
      "--t1-magenta-dark": "#c2006b",
      "--t1-orange": "#f7941d",
      "--t1-orange-dark": "#e86a10",
      "--t1-light": "#fde8f3",
      "--t1-soft": "#faf7fc",
      "--t1-border": "#e8dff0",
      "--t1-body": "#3b2a4d",
      "--t1-muted": "#6f5f82",
      "--t1-gray": "#9b8cab",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    swatch: "linear-gradient(135deg, #0ea5e9, #6366f1)",
    vars: {
      "--t1-deep": "#0b1e3d",
      "--t1-navy": "#0f2a52",
      "--t1-purple": "#3b82f6",
      "--t1-magenta": "#0ea5e9",
      "--t1-magenta-dark": "#0284c7",
      "--t1-orange": "#06b6d4",
      "--t1-orange-dark": "#0891b2",
      "--t1-light": "#e0f2fe",
      "--t1-soft": "#f0f9ff",
      "--t1-border": "#dbeafe",
      "--t1-body": "#1e3a5f",
      "--t1-muted": "#475569",
      "--t1-gray": "#94a3b8",
    },
  },
  {
    id: "forest",
    label: "Forest",
    swatch: "linear-gradient(135deg, #16a34a, #65a30d)",
    vars: {
      "--t1-deep": "#0a2e1a",
      "--t1-navy": "#14532d",
      "--t1-purple": "#15803d",
      "--t1-magenta": "#16a34a",
      "--t1-magenta-dark": "#15803d",
      "--t1-orange": "#84cc16",
      "--t1-orange-dark": "#65a30d",
      "--t1-light": "#dcfce7",
      "--t1-soft": "#f0fdf4",
      "--t1-border": "#d1fae5",
      "--t1-body": "#14532d",
      "--t1-muted": "#4d7c0f",
      "--t1-gray": "#84cc16",
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    swatch: "linear-gradient(135deg, #475569, #64748b)",
    vars: {
      "--t1-deep": "#0f172a",
      "--t1-navy": "#1e293b",
      "--t1-purple": "#475569",
      "--t1-magenta": "#475569",
      "--t1-magenta-dark": "#334155",
      "--t1-orange": "#f59e0b",
      "--t1-orange-dark": "#d97706",
      "--t1-light": "#f1f5f9",
      "--t1-soft": "#f8fafc",
      "--t1-border": "#e2e8f0",
      "--t1-body": "#1e293b",
      "--t1-muted": "#64748b",
      "--t1-gray": "#94a3b8",
    },
  },
];

export const DENSITIES = [
  { id: "compact", label: "Compact", scale: "0.92" },
  { id: "comfortable", label: "Comfortable", scale: "1" },
  { id: "spacious", label: "Spacious", scale: "1.08" },
];

export const AI_PROVIDERS = [
  {
    id: "server",
    label: "Use server default",
    description: "The server uses its own configured provider (recommended).",
    requiresKey: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Requires an OpenAI API key. Stored only in this browser.",
    requiresKey: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    description:
      "Microsoft Azure OpenAI Service (enterprise). Not the same as the Copilot consumer app.",
    requiresKey: true,
    defaultBaseUrl:
      "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT",
    defaultModel: "gpt-4o",
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    description: "Use a Cloudflare account ID + API token for Workers AI.",
    requiresKey: true,
    defaultBaseUrl: "",
    defaultModel: "@cf/meta/llama-3.1-8b-instruct",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    description: "Any OpenAI-compatible endpoint (e.g. Ollama, Together, Groq).",
    requiresKey: true,
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
  },
  {
    id: "copilot-studio",
    label: "Copilot Studio agent",
    description:
      "Route chat through a Microsoft Copilot Studio bot (Direct Line). Requires server configuration.",
    connector: "copilot-studio",
    requiresKey: false,
  },
];

const DEFAULTS = {
  theme: "magenta",
  density: "comfortable",
  showInsights: true,
  showArtifactsByDefault: false,
  lockAppLayout: false,
  ai: {
    provider: "server",
    apiKey: "",
    baseUrl: "",
    model: "",
    accountId: "",
    copilotStudio: {
      agentName: "",
      environmentId: "",
      botId: "",
      tenantId: "",
      directLineSecret: "",
    },
  },
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
  return {
    ...DEFAULTS,
    ...(stored ?? {}),
    ai: {
      ...DEFAULTS.ai,
      ...(stored?.ai ?? {}),
      copilotStudio: {
        ...DEFAULTS.ai.copilotStudio,
        ...(stored?.ai?.copilotStudio ?? {}),
      },
    },
  };
}

export function saveSettings(updates) {
  if (typeof window === "undefined") return DEFAULTS;
  const current = getSettings();
  const next = {
    ...current,
    ...updates,
    ai: {
      ...current.ai,
      ...(updates.ai ?? {}),
      copilotStudio: {
        ...current.ai.copilotStudio,
        ...(updates.ai?.copilotStudio ?? {}),
      },
    },
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  return next;
}

export function applyTheme(themeId) {
  if (typeof document === "undefined") return;
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  Object.entries(theme.vars).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
  document.documentElement.dataset.theme = theme.id;
}

export function applyDensity(densityId) {
  if (typeof document === "undefined") return;
  const density = DENSITIES.find((d) => d.id === densityId) ?? DENSITIES[1];
  document.documentElement.style.setProperty("--cia-density", density.scale);
  document.documentElement.dataset.density = density.id;
}

export function applySettings(settings = getSettings()) {
  applyTheme(settings.theme);
  applyDensity(settings.density);
}

export function subscribeSettings(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => handler(event.detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

export function maskApiKey(key) {
  if (!key) return "";
  const last = key.slice(-4);
  return `••••••••${last}`;
}

/** Payload sent with chat requests — secrets stay on the server. */
export function getChatAiProvider() {
  const { ai } = getSettings();
  if (ai.provider === "copilot-studio") {
    return { aiProvider: "copilot-studio" };
  }
  return { aiProvider: "default" };
}
