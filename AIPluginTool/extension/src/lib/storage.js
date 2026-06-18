const DEFAULT_API_BASE_URL = "https://cia-assistant.aydenbeggs.workers.dev";
const DEFAULT_WEB_APP_URL = "http://localhost:5173";

export const STORAGE_KEYS = {
  apiBaseUrl: "apiBaseUrl",
  webAppUrl: "webAppUrl",
  lastConversationId: "lastConversationId",
};

function safeStorage() {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    return chrome.storage.local;
  }
  return {
    get(keys, callback) {
      const result = {};
      const list = Array.isArray(keys) ? keys : Object.keys(keys ?? {});
      list.forEach((key) => {
        const raw = window.localStorage.getItem(`cia-ext:${key}`);
        if (raw !== null) {
          try {
            result[key] = JSON.parse(raw);
          } catch {
            result[key] = raw;
          }
        }
      });
      callback?.(result);
      return Promise.resolve(result);
    },
    set(items) {
      Object.entries(items).forEach(([key, value]) => {
        window.localStorage.setItem(`cia-ext:${key}`, JSON.stringify(value));
      });
      return Promise.resolve();
    },
    remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((key) => window.localStorage.removeItem(`cia-ext:${key}`));
      return Promise.resolve();
    },
    onChanged: { addListener() {}, removeListener() {} },
  };
}

export async function getStored(keys) {
  const storage = safeStorage();
  return new Promise((resolve) => {
    const result = storage.get(keys, (data) => resolve(data));
    if (result && typeof result.then === "function") {
      result.then((data) => resolve(data));
    }
  });
}

export async function setStored(items) {
  const storage = safeStorage();
  const result = storage.set(items);
  if (result && typeof result.then === "function") {
    await result;
  }
}

export async function getApiBaseUrl() {
  const { [STORAGE_KEYS.apiBaseUrl]: stored } = await getStored([STORAGE_KEYS.apiBaseUrl]);
  return (stored || DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export async function setApiBaseUrl(url) {
  await setStored({ [STORAGE_KEYS.apiBaseUrl]: url.replace(/\/$/, "") });
}

export async function getWebAppUrl() {
  const { [STORAGE_KEYS.webAppUrl]: stored } = await getStored([STORAGE_KEYS.webAppUrl]);
  return (stored || DEFAULT_WEB_APP_URL).replace(/\/$/, "");
}

export async function setWebAppUrl(url) {
  await setStored({ [STORAGE_KEYS.webAppUrl]: url.replace(/\/$/, "") });
}

export async function openWebApp() {
  const url = await getWebAppUrl();
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    chrome.tabs.create({ url });
  } else if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener");
  }
}

/**
 * Pop the assistant out into its own detached window. This is still a Chrome
 * window (type "popup" — no tabs/toolbar), which is the closest you can get to
 * "outside the browser" without packaging a native app. Falls back to a plain
 * window.open when the windows API isn't available.
 */
export async function openPopoutWindow() {
  const path = "src/sidepanel/index.html";
  if (typeof chrome !== "undefined" && chrome.windows?.create) {
    const url = chrome.runtime.getURL(path);
    chrome.windows.create({ url, type: "popup", width: 440, height: 760 });
  } else if (typeof window !== "undefined") {
    window.open(path, "_blank", "popup,width=440,height=760");
  }
}

export async function getWorkerAuthToken() {
  const { workerAuthToken } = await getStored(["workerAuthToken"]);
  return workerAuthToken ?? "";
}

// ── Local connections (standalone mode) ──────────────────────────────────────
// Shape: { agents: [{ id, name, url, enabled }], apps: { jira: {...}, confluence: {...} } }
const DEFAULT_CONNECTIONS = { agents: [], apps: {} };

export async function getConnections() {
  const { connections } = await getStored(["connections"]);
  return { ...DEFAULT_CONNECTIONS, ...(connections ?? {}) };
}

export async function setConnections(connections) {
  await setStored({ connections });
}

// ── Notepad (shared across every screen of the plugin) ───────────────────────
// Stored in chrome.storage.local under the "notes" key so it is NOT partitioned
// per website (unlike localStorage) and stays in sync across the floating
// widget, side panel and popout window.
const NOTEPAD_KEY = "notes";

export async function getNotepad() {
  const { [NOTEPAD_KEY]: data } = await getStored([NOTEPAD_KEY]);
  return data ?? null; // { notes: [...], folders: [...] }
}

export async function saveNotepad(payload) {
  await setStored({ [NOTEPAD_KEY]: payload });
}

/** Live-sync: fire callback whenever the notes change in any other screen. */
export function subscribeNotepad(callback) {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return () => {};
  const handler = (changes, area) => {
    if (area === "local" && changes[NOTEPAD_KEY]) callback(changes[NOTEPAD_KEY].newValue ?? null);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export async function setWorkerAuthToken(token) {
  await setStored({ workerAuthToken: token });
}

// Local conversation threads for standalone mode
export async function getLocalThreads() {
  const { localThreads } = await getStored(["localThreads"]);
  return localThreads ?? [];
}

export async function saveLocalThread(thread) {
  const threads = await getLocalThreads();
  const idx = threads.findIndex((t) => t.id === thread.id);
  if (idx >= 0) {
    threads[idx] = { ...threads[idx], ...thread };
  } else {
    threads.unshift(thread);
  }
  await setStored({ localThreads: threads.slice(0, 50) });
}

export async function getLocalThread(id) {
  const threads = await getLocalThreads();
  return threads.find((t) => t.id === id) ?? null;
}

export async function deleteLocalThread(id) {
  const threads = await getLocalThreads();
  await setStored({ localThreads: threads.filter((t) => t.id !== id) });
}

export { DEFAULT_API_BASE_URL, DEFAULT_WEB_APP_URL };
