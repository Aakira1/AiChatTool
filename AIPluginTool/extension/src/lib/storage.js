const DEFAULT_API_BASE_URL = "http://localhost:3001";
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

export { DEFAULT_API_BASE_URL, DEFAULT_WEB_APP_URL };
