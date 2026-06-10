const CONTEXT_MENU_ID = "cia-ask-about-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Ask CiA about "%s"',
    contexts: ["selection"],
  });

  // The toolbar action manages the floating widget itself, so don't auto-open
  // the side panel on action click.
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: false })
    .catch((error) => {
      console.warn("[CiA] sidePanel.setPanelBehavior failed", error);
    });
});

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

/**
 * IMPORTANT: chrome.sidePanel.open() must be invoked SYNCHRONOUSLY inside the
 * user-gesture handler that triggered it. Any `await` (or .then() callback)
 * before the call yields to the microtask queue and Chrome will reject it with
 *   "sidePanel.open() may only be called in response to a user gesture."
 *
 * So we call sidePanel.open *first* and only do async storage writes afterward.
 */
function openSidePanelWithFallbackHint(tab, reason) {
  if (tab?.windowId != null) {
    // Synchronous call — preserves the gesture token from the action click.
    chrome.sidePanel
      .open({ windowId: tab.windowId })
      .catch((error) => console.warn("[CiA] sidePanel.open fallback failed", error));
  }
  // Fire-and-forget storage write so the side panel can render its hint banner.
  chrome.storage.local
    .set({
      sidePanelFallback: {
        reason,
        url: tab?.url ?? "",
        title: tab?.title ?? "",
        createdAt: Date.now(),
      },
    })
    .catch(() => {});
}

function toggleWidget(tab) {
  if (!tab?.id) return;

  // Branch on the URL synchronously so we can open the side panel inside the
  // user-gesture window if needed.
  if (isRestrictedUrl(tab.url)) {
    openSidePanelWithFallbackHint(tab, "restricted");
    return;
  }

  // Normal pages — try the content script. From here on we're past the gesture
  // window after any await, so we can no longer fall back to sidePanel.open();
  // we route through chrome.scripting.executeScript instead.
  void (async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "CIA_TOGGLE_WIDGET" });
      chrome.storage.local.remove("sidePanelFallback").catch(() => {});
    } catch (sendError) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["src/content/floating-widget.js"],
        });
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { type: "CIA_TOGGLE_WIDGET" }).catch(() => {});
        }, 100);
        chrome.storage.local.remove("sidePanelFallback").catch(() => {});
      } catch (injectError) {
        console.warn("[CiA] failed to inject floating widget", injectError, sendError);
        // Can't open the side panel from here — the gesture token is gone.
        // Surface a notification instead so the user isn't left guessing.
        chrome.notifications
          ?.create?.({
            type: "basic",
            iconUrl: "icons/icon-128.png",
            title: "CiA Assistant",
            message:
              "Couldn't show the floating chat on this page. Try reloading the tab, or open the full web app from the toolbar.",
          })
          .catch(() => {});
      }
    }
  })();
}

chrome.action.onClicked.addListener((tab) => {
  void toggleWidget(tab);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  if (!tab?.id) return;

  const selection = (info.selectionText ?? "").slice(0, 8000);
  const payload = {
    type: "CIA_PREFILL_FROM_SELECTION",
    selection,
    url: tab.url ?? info.pageUrl ?? "",
    title: tab.title ?? "",
  };

  // Queue the prefill so the widget/side panel can pick it up after mounting.
  chrome.storage.local.set({
    pendingPrefill: { ...payload, createdAt: Date.now() },
  });

  // Toggle widget open (or fall back to side panel for restricted pages).
  await toggleWidget(tab);

  // Best-effort: forward immediately to whichever surface is listening.
  setTimeout(() => {
    chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    chrome.runtime.sendMessage(payload).catch(() => {});
  }, 250);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CIA_OPEN_SIDE_PANEL") {
    // Must call sidePanel.open synchronously inside the gesture-bearing
    // message handler. Read windowId from the sender (the tab the click
    // happened in) so we don't have to await tabs.query first.
    const windowId = sender?.tab?.windowId;
    if (windowId != null) {
      chrome.sidePanel
        .open({ windowId })
        .catch((error) => console.warn("[CiA] sidePanel.open from message failed", error));
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "CIA_OPEN_WEB_APP") {
    chrome.storage.local.get(["webAppUrl"], (data) => {
      const url = (data?.webAppUrl || "http://localhost:5173").replace(/\/$/, "");
      chrome.tabs.create({ url }).catch(() => {});
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "CIA_CAPTURE_SCREENSHOT") {
    void (async () => {
      // Respect Privacy mode — no page screenshots when it's on.
      const { ciaPrivacyMode } = await chrome.storage.local.get(["ciaPrivacyMode"]);
      if (ciaPrivacyMode) {
        sendResponse({ ok: false, error: "Page vision is off (Privacy mode is on in Settings)." });
        return;
      }
      let windowId = sender?.tab?.windowId;
      if (windowId == null) {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        windowId = tab?.windowId;
      }
      if (windowId == null) {
        sendResponse({ ok: false, error: "No active browser window to capture." });
        return;
      }
      chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 72 }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError?.message ?? "Screenshot capture failed.",
          });
          return;
        }
        sendResponse({ ok: true, dataUrl });
      });
    })();
    return true;
  }

  if (message?.type === "CIA_TOGGLE_WIDGET_FROM_PANEL") {
    // Reading the active tab requires await, so by the time we return we've
    // lost the gesture. This message path is only used when the side panel
    // wants to summon the floating widget on the current tab (no sidePanel.open
    // involved), so it's safe.
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
      if (tab) toggleWidget(tab);
    });
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// ── Side-panel / popout presence ──────────────────────────────────────────
// The docked side panel and the popout window connect a long-lived port while
// they're open. We broadcast their presence to content scripts so the floating
// bubble can hide itself until they close (and reappear when the last one goes).
const ciaPanelPorts = new Set();

function broadcastPanelPresence() {
  const open = ciaPanelPorts.size > 0;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { type: "CIA_PANEL_PRESENCE", open }).catch(() => {});
    }
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "cia-panel-presence") return;
  ciaPanelPorts.add(port);
  broadcastPanelPresence();
  port.onDisconnect.addListener(() => {
    ciaPanelPorts.delete(port);
    broadcastPanelPresence();
  });
});

// Let a freshly-loaded content script ask whether a panel is currently open.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CIA_GET_PANEL_PRESENCE") {
    sendResponse({ open: ciaPanelPorts.size > 0 });
    return false;
  }
  return false;
});
