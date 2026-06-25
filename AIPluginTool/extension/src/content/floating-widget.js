/**
 * Copilot-style floating chat widget.
 *
 * Injects a Shadow DOM container with:
 *   - a small bubble (collapsed)  -> click to expand
 *   - a draggable, resizable panel containing an iframe that loads the side panel UI
 *
 * Communicates with the side panel iframe by postMessage for prefill/close
 * actions, and with the background service worker for context-menu prefills.
 */

const HOST_ID = "cia-floating-widget-host";
const STORAGE_KEY = "ciaFloatingWidget";
const PANEL_URL = chrome.runtime.getURL("src/sidepanel/index.html?embedded=1");

// NOTE: the entry-point IIFE lives at the BOTTOM of this file. `initFloatingWidget`
// references `SHADOW_CSS` which is a `const` declared near the end of this module —
// invoking the entry point up here would dereference it inside its temporal dead
// zone and throw `ReferenceError: Cannot access 'SHADOW_CSS' before initialization`
// once Vite bundles everything into a single IIFE.

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

async function captureCurrentPageForWidget() {
  let screenshot = null;
  let captureError = null;

  try {
    const shot = await chrome.runtime.sendMessage({ type: "CIA_CAPTURE_SCREENSHOT" });
    if (shot?.ok && shot.dataUrl) {
      screenshot = shot.dataUrl;
    } else {
      captureError = shot?.error ?? "Could not capture the visible tab.";
    }
  } catch (error) {
    captureError = error?.message ?? "Screenshot capture failed.";
  }

  return {
    url: window.location.href,
    title: document.title,
    selection: (window.getSelection?.()?.toString().trim() ?? "").slice(0, 8000),
    excerpt: pickMainExcerpt().slice(0, 8000),
    screenshot,
    captureError,
    restricted: false,
    capturedAt: screenshot ? Date.now() : null,
  };
}

function postPageCaptureToIframe(iframe, context) {
  const send = () => {
    iframe.contentWindow?.postMessage({ type: "CIA_PAGE_CAPTURE", context }, "*");
  };
  if (iframe.src === "about:blank") {
    return;
  }
  try {
    if (iframe.contentDocument?.readyState === "complete") {
      send();
    } else {
      iframe.addEventListener("load", send, { once: true });
    }
  } catch {
    send();
  }
}

function initFloatingWidget() {
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = `
    position: fixed;
    inset: auto 0 0 auto;
    width: 0;
    height: 0;
    z-index: 2147483647;
    pointer-events: none;
  `;
  const root = host.attachShadow({ mode: "open" });

  const styles = document.createElement("style");
  styles.textContent = SHADOW_CSS;
  root.appendChild(styles);

  // Use the bundled PNG icon (the previous TNE.AX.svg / TNE_icon.svg files were
  // never shipped, which left a broken image in the bubble and header).
  const svgUrl = chrome.runtime.getURL("icons/icon-128.png");
  const svgHoverUrl = chrome.runtime.getURL("icons/icon-128.png");

  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "cia-fw-bubble";
  bubble.title = "Open CiA Assistant";
  bubble.setAttribute("aria-label", "Open CiA Assistant");
  const logoUrl = chrome.runtime.getURL("icons/icon-128.png");
  bubble.innerHTML = `
    <span class="cia-fw-bubble-glow" aria-hidden="true"></span>
    <img src="${svgUrl}" class="cia-fw-bubble-mark" aria-hidden="true" alt="" />
    <img src="${svgHoverUrl}" class="cia-fw-bubble-mark-hover" aria-hidden="true" alt="" />
  `;
  root.appendChild(bubble);

  // Optional quick-launch button (pinned app) that floats just above the bubble.
  const quickBtn = document.createElement("button");
  quickBtn.type = "button";
  quickBtn.className = "cia-fw-quick is-hidden";
  quickBtn.innerHTML = `<span class="cia-fw-quick-icon" aria-hidden="true"></span>`;
  root.appendChild(quickBtn);

  // Collapsed-idle handle: a small 3-dot tab on the page edge. Hover/click
  // brings the bubble back (and a click opens the assistant).
  const dotsTab = document.createElement("button");
  dotsTab.type = "button";
  dotsTab.className = "cia-fw-dots";
  dotsTab.title = "Open CiA Assistant";
  dotsTab.setAttribute("aria-label", "Open CiA Assistant");
  dotsTab.innerHTML = `<span></span><span></span><span></span>`;
  root.appendChild(dotsTab);

  const panel = document.createElement("section");
  panel.className = "cia-fw-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "CiA Assistant");
  panel.innerHTML = `
    <header class="cia-fw-header" data-drag-handle>
      <div class="cia-fw-handle-grip" aria-hidden="true"></div>
      <div class="cia-fw-title">
        <img src="${svgUrl}" class="cia-fw-logo" aria-hidden="true" alt="" />
        <span class="cia-fw-brand-name"><span class="cia-fw-brand-one">One</span>Chat</span>
      </div>
      <div class="cia-fw-actions">
        <button type="button" class="cia-fw-icon-btn" data-action="capture" title="Capture visible page (screenshot + text)" aria-label="Capture visible page">👁</button>
        <button type="button" class="cia-fw-icon-btn" data-action="dock" title="Open in browser side panel">⇲</button>
        <button type="button" class="cia-fw-icon-btn" data-action="popout" title="Pop out into its own window" aria-label="Pop out">⤢</button>
        <button type="button" class="cia-fw-icon-btn" data-action="minimize" title="Minimize">—</button>
        <button type="button" class="cia-fw-icon-btn" data-action="close" title="Close">×</button>
      </div>
    </header>
    <iframe class="cia-fw-iframe" src="about:blank" title="CiA Assistant" loading="lazy"></iframe>
    <div class="cia-fw-resizer" aria-hidden="true"></div>
  `;
  root.appendChild(panel);

  document.documentElement.appendChild(host);

  const iframe = panel.querySelector(".cia-fw-iframe");
  const captureBtn = panel.querySelector('[data-action="capture"]');
  const dockBtn = panel.querySelector('[data-action="dock"]');
  const popoutBtn = panel.querySelector('[data-action="popout"]');
  const minimizeBtn = panel.querySelector('[data-action="minimize"]');
  const closeBtn = panel.querySelector('[data-action="close"]');
  const dragHandle = panel.querySelector("[data-drag-handle]");
  const resizer = panel.querySelector(".cia-fw-resizer");

  const widget = createWidgetState(host, bubble, panel, iframe, quickBtn, dotsTab);

  // Pinned-app quick launch: deep-link the panel to the chosen app, then open.
  let pinnedAppId = null;
  const applyPinnedApp = (app) => {
    pinnedAppId = app?.id ?? null;
    quickBtn.dataset.appId = pinnedAppId ?? "";
    quickBtn.title = app ? `Open ${app.label}` : "";
    quickBtn.querySelector(".cia-fw-quick-icon").textContent = app?.icon ?? "";
    quickBtn.classList.toggle("has-app", Boolean(app));
    widget.refresh();
  };
  chrome.storage?.local?.get?.(["ciaPinnedApp"], (d) => applyPinnedApp(d?.ciaPinnedApp));
  quickBtn.addEventListener("click", () => {
    if (!pinnedAppId) return;
    chrome.storage?.local?.set?.({ ciaPendingApp: { id: pinnedAppId, at: Date.now() } });
    widget.expand();
  });

  // Both header buttons collapse to the bubble. We deliberately don't expose a
  // "fully hide the bubble" affordance here — the bubble is the only way users
  // can summon the panel back without leaving the page.
  minimizeBtn.addEventListener("click", () => widget.collapse());
  closeBtn.addEventListener("click", () => widget.collapse());

  // First-run hint removed — no start-up tooltip/pulse. Kept as a no-op so the
  // bubble-drag click handler below can still call it safely.
  const firstRunDismiss = null;

  attachBubbleDrag(bubble, widget, () => {
    firstRunDismiss?.();
    widget.expand();
  });
  captureBtn.addEventListener("click", () => {
    void (async () => {
      captureBtn.disabled = true;
      captureBtn.classList.add("is-capturing");
      const wasOpen = widget.getState().open;
      if (!wasOpen) {
        widget.expand();
      }
      const context = await captureCurrentPageForWidget();
      captureBtn.disabled = false;
      captureBtn.classList.remove("is-capturing");
      if (context.screenshot) {
        captureBtn.classList.add("has-shot");
        captureBtn.title = "Page captured — send a message to analyse it";
      } else {
        captureBtn.classList.remove("has-shot");
        captureBtn.title = context.captureError ?? "Capture failed";
      }
      postPageCaptureToIframe(iframe, context);
    })();
  });

  dockBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CIA_OPEN_SIDE_PANEL" }).catch(() => {});
    widget.collapse();
  });
  popoutBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CIA_OPEN_POPOUT" }).catch(() => {});
    widget.collapse();
  });

  attachDrag(panel, dragHandle, widget);
  attachResize(panel, resizer, widget);

  // Auto-collapse the idle bubble to the nearest screen edge after a period of
  // inactivity — it peeks at the side and slides back out on hover/click.
  const IDLE_MS = 15000;
  let idleTimer = null;
  const dockBubble = () => {
    const st = widget.getState();
    if (st.open || !st.visible || st.externalPanelOpen) return;
    const rect = bubble.getBoundingClientRect();
    const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
    const y = Math.min(Math.max(rect.top + rect.height / 2 - 22, 8), window.innerHeight - 52);
    dotsTab.dataset.dock = side;
    dotsTab.style.top = `${y}px`;
    dotsTab.style.left = side === "left" ? "0px" : "auto";
    dotsTab.style.right = side === "right" ? "0px" : "auto";
    bubble.classList.add("is-docked"); // fades the full bubble out
    dotsTab.classList.add("is-shown"); // shows the 3-dot edge tab
  };
  const resetIdle = () => {
    bubble.classList.remove("is-docked");
    dotsTab.classList.remove("is-shown");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(dockBubble, IDLE_MS);
  };
  bubble.addEventListener("pointerenter", resetIdle);
  bubble.addEventListener("pointerdown", resetIdle);
  panel.addEventListener("pointerdown", resetIdle);
  minimizeBtn.addEventListener("click", resetIdle);
  closeBtn.addEventListener("click", resetIdle);
  dotsTab.addEventListener("pointerenter", resetIdle);
  dotsTab.addEventListener("click", () => { resetIdle(); widget.expand(); });
  resetIdle();

  // If a side panel / popout is already open when this page loads, hide now.
  chrome.runtime.sendMessage({ type: "CIA_GET_PANEL_PRESENCE" }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.open) widget.setExternalPanelOpen(true);
  });

  // Hide the page-vision (capture) button when Privacy mode is on.
  const applyPrivacy = (on) => {
    captureBtn.style.display = on ? "none" : "";
  };
  chrome.storage?.local?.get?.(["ciaPrivacyMode"], (d) => applyPrivacy(Boolean(d?.ciaPrivacyMode)));
  chrome.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== "local") return;
    if (changes.ciaPrivacyMode) applyPrivacy(Boolean(changes.ciaPrivacyMode.newValue));
    if (changes.ciaPinnedApp) applyPinnedApp(changes.ciaPinnedApp.newValue);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CIA_PANEL_PRESENCE") {
      // Hide the bubble while the docked side panel / popout window is open.
      widget.setExternalPanelOpen(Boolean(message.open));
    } else if (message?.type === "CIA_TOGGLE_WIDGET") {
      widget.toggle();
    } else if (message?.type === "CIA_PREFILL_FROM_SELECTION") {
      widget.expand();
      // Forward to iframe as well in case it's already loaded.
      iframe.contentWindow?.postMessage(
        { type: "CIA_PREFILL_FROM_SELECTION", ...message },
        "*",
      );
    }
  });

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "CIA_PANEL_CLOSE") widget.collapse();
    if (data.type === "CIA_PANEL_DOCK") {
      chrome.runtime.sendMessage({ type: "CIA_OPEN_SIDE_PANEL" }).catch(() => {});
      widget.collapse();
    }
    if (data.type === "CIA_CAPTURE_CLEARED") {
      captureBtn.classList.remove("has-shot");
      captureBtn.title = "Capture visible page (screenshot + text)";
    }
  });
}

function createWidgetState(host, bubble, panel, iframe, quickBtn, dotsTab) {
  let state = {
    open: false,
    visible: true,
    externalPanelOpen: false,
    x: null,
    y: null,
    width: 380,
    height: 560,
    bubbleX: null,
    bubbleY: null,
  };

  const restore = () => {
    chrome.storage?.local?.get?.([STORAGE_KEY], (data) => {
      const saved = data?.[STORAGE_KEY];
      if (saved) {
        // Only restore geometry. `visible` and `open` are session-only so the
        // bubble always reappears on a fresh page load — otherwise clicking the
        // × close button would persistently hide the widget on every site.
        state = {
          ...state,
          x: saved.x ?? state.x,
          y: saved.y ?? state.y,
          width: saved.width ?? state.width,
          height: saved.height ?? state.height,
          bubbleX: saved.bubbleX ?? state.bubbleX,
          bubbleY: saved.bubbleY ?? state.bubbleY,
          open: false,
          visible: true,
        };
      }
      apply();
    });
  };

  const persist = () => {
    const { x, y, width, height, bubbleX, bubbleY } = state;
    chrome.storage?.local?.set?.({
      [STORAGE_KEY]: { x, y, width, height, bubbleX, bubbleY },
    });
  };

  const apply = () => {
    // While a docked side panel / popout window is open, hide the entire
    // floating widget (both the bubble AND any open panel) — it returns when the
    // external panel closes.
    const panelOpen = state.open && !state.externalPanelOpen;
    const bubbleHidden = state.open || !state.visible || state.externalPanelOpen;
    host.dataset.state = state.externalPanelOpen ? "hidden" : state.open ? "open" : state.visible ? "collapsed" : "hidden";
    panel.classList.toggle("is-open", panelOpen);
    bubble.classList.toggle("is-hidden", bubbleHidden);
    bubble.style.pointerEvents = bubbleHidden ? "none" : "auto";
    panel.style.pointerEvents = panelOpen ? "auto" : "none";
    // Never keep the "docked to edge" state while the bubble is hidden/open.
    if (bubbleHidden) {
      bubble.classList.remove("is-docked");
      if (dotsTab) dotsTab.classList.remove("is-shown");
    }

    // Position the bubble. If the user has dragged it, honor the saved
    // coordinates (clamped to the viewport so resized windows don't strand it
    // off-screen). Otherwise clear inline styles so the CSS default — pinned to
    // the bottom-right corner — applies.
    const bubbleSize = 56;
    let bx = null;
    let by = null;
    if (state.bubbleX != null && state.bubbleY != null) {
      bx = clamp(state.bubbleX, 4, Math.max(window.innerWidth - bubbleSize - 4, 4));
      by = clamp(state.bubbleY, 4, Math.max(window.innerHeight - bubbleSize - 4, 4));
      bubble.style.left = `${bx}px`;
      bubble.style.top = `${by}px`;
      bubble.style.right = "auto";
      bubble.style.bottom = "auto";
    } else {
      bubble.style.left = "";
      bubble.style.top = "";
      bubble.style.right = "";
      bubble.style.bottom = "";
    }

    // Keep the pinned-app quick-launch button tucked just above the bubble,
    // and hide it whenever the bubble itself is hidden.
    if (quickBtn) {
      const showQuick = !bubbleHidden && quickBtn.classList.contains("has-app");
      quickBtn.classList.toggle("is-hidden", !showQuick);
      quickBtn.style.pointerEvents = showQuick ? "auto" : "none";
      if (bx != null && by != null) {
        quickBtn.style.left = `${bx + 8}px`;
        quickBtn.style.top = `${by - 44}px`;
        quickBtn.style.right = "auto";
        quickBtn.style.bottom = "auto";
      } else {
        quickBtn.style.left = "";
        quickBtn.style.top = "";
        quickBtn.style.right = "";
        quickBtn.style.bottom = "";
      }
    }

    if (panelOpen) {
      const w = clamp(state.width, 320, Math.min(window.innerWidth - 24, 720));
      const h = clamp(state.height, 360, Math.min(window.innerHeight - 24, 900));
      // Default-dock to the LEFT side of the viewport so the panel doesn't
      // visually clash with the bubble in the bottom-right corner. Drag-positions
      // are still respected via state.x / state.y.
      const x = state.x ?? 24;
      const y = state.y ?? Math.max(Math.round((window.innerHeight - h) / 2), 24);
      panel.style.width = `${w}px`;
      panel.style.height = `${h}px`;
      panel.style.left = `${clamp(x, 8, window.innerWidth - w - 8)}px`;
      panel.style.top = `${clamp(y, 8, window.innerHeight - h - 8)}px`;

      if (iframe.src === "about:blank") {
        iframe.src = PANEL_URL;
      }
    }
  };

  const widget = {
    expand() {
      state = { ...state, open: true, visible: true };
      apply();
      persist();
      bubble.blur();
    },
    collapse() {
      state = { ...state, open: false, visible: true };
      apply();
      persist();
    },
    toggle() {
      if (state.open) {
        widget.collapse();
      } else {
        widget.expand();
      }
    },
    setRect({ x, y, width, height }) {
      state = {
        ...state,
        x: x ?? state.x,
        y: y ?? state.y,
        width: width ?? state.width,
        height: height ?? state.height,
      };
      apply();
    },
    setBubbleRect({ x, y }) {
      state = {
        ...state,
        bubbleX: x ?? state.bubbleX,
        bubbleY: y ?? state.bubbleY,
      };
      apply();
    },
    setExternalPanelOpen(open) {
      state = { ...state, externalPanelOpen: Boolean(open) };
      apply();
    },
    persist,
    refresh: apply,
    getState: () => ({ ...state }),
  };

  restore();
  window.addEventListener("resize", apply);
  return widget;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function attachDrag(panel, handle, widget) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".cia-fw-icon-btn")) return;
    dragging = true;
    handle.setPointerCapture(event.pointerId);
    panel.classList.add("is-dragging");
    const rect = panel.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    widget.setRect({ x: startLeft + dx, y: startTop + dy });
  });

  const release = (event) => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove("is-dragging");
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    widget.persist();
  };
  handle.addEventListener("pointerup", release);
  handle.addEventListener("pointercancel", release);
}

// Drag-or-click handler for the floating bubble. A pointerup that never moved
// past `DRAG_THRESHOLD` pixels is treated as a click (calls `onClick`); anything
// past the threshold is a drag that repositions the bubble and persists the
// new coordinates.
function attachBubbleDrag(bubble, widget, onClick) {
  const DRAG_THRESHOLD = 4;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let moved = false;

  bubble.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    moved = false;
    const rect = bubble.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    bubble.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  bubble.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    bubble.classList.add("is-dragging");
    widget.setBubbleRect({ x: startLeft + dx, y: startTop + dy });
  });

  const release = (event) => {
    if (event.pointerId !== pointerId) return;
    const wasDrag = moved;
    pointerId = null;
    moved = false;
    bubble.classList.remove("is-dragging");
    try {
      bubble.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    if (wasDrag) {
      widget.persist();
    } else {
      onClick();
    }
  };
  bubble.addEventListener("pointerup", release);
  bubble.addEventListener("pointercancel", release);
}

function attachResize(panel, resizer, widget) {
  let resizing = false;
  let startW = 0;
  let startH = 0;
  let startX = 0;
  let startY = 0;

  resizer.addEventListener("pointerdown", (event) => {
    resizing = true;
    resizer.setPointerCapture(event.pointerId);
    panel.classList.add("is-resizing");
    const rect = panel.getBoundingClientRect();
    startW = rect.width;
    startH = rect.height;
    startX = event.clientX;
    startY = event.clientY;
    event.preventDefault();
  });

  resizer.addEventListener("pointermove", (event) => {
    if (!resizing) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    widget.setRect({ width: startW + dx, height: startH + dy });
  });

  const release = (event) => {
    if (!resizing) return;
    resizing = false;
    panel.classList.remove("is-resizing");
    try {
      resizer.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    widget.persist();
  };
  resizer.addEventListener("pointerup", release);
  resizer.addEventListener("pointercancel", release);
}

const SHADOW_CSS = `
  :host {
    all: initial;
  }

  .cia-fw-bubble,
  .cia-fw-panel,
  .cia-fw-bubble * {
    font-family: "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif;
    box-sizing: border-box;
  }

  /* Squircle bubble (soft rounded-square edges, like the Rovo app icon) */
  .cia-fw-bubble {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 46px;
    height: 46px;
    border-radius: 32%;
    padding: 0;
    cursor: pointer;
    color: white;
    /* Frosted-glass look */
    background: rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(12px) saturate(170%);
    -webkit-backdrop-filter: blur(12px) saturate(170%);
    border: 1px solid rgba(255, 255, 255, 0.45);
    box-shadow:
      0 10px 26px rgba(26, 11, 46, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.55);
    display: grid;
    place-items: center;
    transition: transform 200ms cubic-bezier(.4,1.4,.6,1), box-shadow 200ms ease, background 200ms ease, opacity 200ms ease;
    pointer-events: auto;
    z-index: 2;
  }

  .cia-fw-bubble:hover {
    background: rgba(255, 255, 255, 0.28);
    transform: translateY(-3px) scale(1.06);
    box-shadow:
      0 16px 34px rgba(26, 11, 46, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }

  .cia-fw-bubble:active {
    transform: translateY(-1px) scale(0.97);
  }

  .cia-fw-bubble.is-dragging {
    cursor: grabbing;
    transition: none;
    transform: scale(1.08);
    box-shadow:
      0 20px 40px rgba(228, 0, 124, 0.5),
      0 8px 18px rgba(26, 11, 46, 0.28);
  }

  .cia-fw-bubble.is-hidden {
    opacity: 0;
    transform: translateY(8px) scale(0.6);
    pointer-events: none;
  }

  /* Idle: the full bubble fades away and a small 3-dot tab takes its place on
     the page edge (see .cia-fw-dots). Hover/click restores the bubble. */
  .cia-fw-bubble.is-docked {
    opacity: 0;
    transform: scale(0.5);
    pointer-events: none;
  }

  .cia-fw-dots {
    position: fixed;
    width: 15px;
    height: 44px;
    padding: 0;
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    z-index: 2;
    pointer-events: auto;
    /* Frosted-glass edge tab */
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(10px) saturate(160%);
    -webkit-backdrop-filter: blur(10px) saturate(160%);
    border: 1px solid rgba(255, 255, 255, 0.4);
    box-shadow: 0 6px 16px rgba(26, 11, 46, 0.2);
    transition: width 160ms ease, background 160ms ease;
    animation: cia-fw-dots-in 200ms ease both;
  }
  .cia-fw-dots.is-shown { display: flex; }
  .cia-fw-dots[data-dock="left"] { border-radius: 0 12px 12px 0; }
  .cia-fw-dots[data-dock="right"] { border-radius: 12px 0 0 12px; }
  .cia-fw-dots:hover { width: 19px; background: rgba(255, 255, 255, 0.32); }
  .cia-fw-dots span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e4007c, #7c3aed);
  }
  @keyframes cia-fw-dots-in {
    from { opacity: 0; transform: translateX(var(--dx, 0)); }
    to { opacity: 1; transform: translateX(0); }
  }
  .cia-fw-dots[data-dock="left"] { --dx: -8px; }
  .cia-fw-dots[data-dock="right"] { --dx: 8px; }

  .cia-fw-bubble.is-first-run {
    animation: cia-fw-pulse 1.6s ease-in-out infinite;
  }

  @keyframes cia-fw-pulse {
    0%, 100% {
      box-shadow:
        0 12px 28px rgba(228, 0, 124, 0.35),
        0 4px 10px rgba(26, 11, 46, 0.18),
        0 0 0 0 rgba(228, 0, 124, 0.55);
    }
    50% {
      box-shadow:
        0 12px 28px rgba(228, 0, 124, 0.45),
        0 4px 10px rgba(26, 11, 46, 0.22),
        0 0 0 14px rgba(228, 0, 124, 0);
    }
  }

  /* Pinned-app quick-launch button (floats just above the bubble) */
  .cia-fw-quick {
    position: fixed;
    right: 32px;
    bottom: 88px;
    width: 40px;
    height: 40px;
    border-radius: 28%;
    border: 2px solid #fff;
    padding: 0;
    cursor: pointer;
    background: linear-gradient(135deg, #7c3aed, #e4007c);
    box-shadow: 0 8px 18px rgba(124, 58, 237, 0.4);
    display: grid;
    place-items: center;
    transition: transform 180ms cubic-bezier(.4,1.4,.6,1), opacity 180ms ease, box-shadow 180ms ease;
    z-index: 2;
  }
  .cia-fw-quick:hover { transform: translateY(-2px) scale(1.08); box-shadow: 0 12px 24px rgba(124, 58, 237, 0.5); }
  .cia-fw-quick:active { transform: scale(0.94); }
  .cia-fw-quick.is-hidden { opacity: 0; transform: translateY(8px) scale(0.6); pointer-events: none; }
  .cia-fw-quick-icon { font-size: 18px; line-height: 1; }

  .cia-fw-tooltip {
    position: fixed;
    right: 88px;
    bottom: 32px;
    max-width: 220px;
    padding: 10px 14px;
    background: #1f1235;
    color: white;
    font-size: 13px;
    line-height: 1.4;
    border-radius: 12px;
    box-shadow: 0 12px 28px rgba(26, 11, 46, 0.35);
    pointer-events: none;
    animation: cia-fw-tooltip-in 320ms ease 200ms both;
    z-index: 1;
  }

  .cia-fw-tooltip::after {
    content: "";
    position: absolute;
    right: -6px;
    bottom: 16px;
    width: 12px;
    height: 12px;
    background: #1f1235;
    transform: rotate(45deg);
    border-radius: 2px;
  }

  @keyframes cia-fw-tooltip-in {
    from { opacity: 0; transform: translateX(8px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  .cia-fw-bubble-glow {
    position: absolute;
    inset: -3px;
    border-radius: 30%;
    background: radial-gradient(closest-side, rgba(228,0,124,0.18), transparent 72%);
    opacity: 0.7;
    filter: blur(2px);
    pointer-events: none;
  }

  .cia-fw-bubble-mark,
  .cia-fw-bubble-mark-hover {
    position: absolute;
    z-index: 1;
    width: 28px;
    height: 28px;
    object-fit: contain;
    display: block;
    transition: opacity 200ms ease;
  }

  .cia-fw-bubble-mark {
    opacity: 1;
  }

  .cia-fw-bubble-mark-hover {
    opacity: 0;
  }

  .cia-fw-bubble:hover .cia-fw-bubble-mark {
    opacity: 0;
  }

  .cia-fw-bubble:hover .cia-fw-bubble-mark-hover {
    opacity: 1;
  }

  .cia-fw-panel {
    position: fixed;
    width: 380px;
    height: 560px;
    border-radius: 18px;
    /* Frosted glass over the actual webpage behind the panel — light tint so
       the page reads through clearly. */
    background: rgba(255, 255, 255, 0.22);
    backdrop-filter: blur(22px) saturate(165%);
    -webkit-backdrop-filter: blur(22px) saturate(165%);
    color: #1f1235;
    overflow: hidden;
    display: none;
    flex-direction: column;
    box-shadow:
      0 24px 60px rgba(26, 11, 46, 0.32),
      0 8px 20px rgba(26, 11, 46, 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.6),
      0 0 0 1px rgba(255, 255, 255, 0.35);
    transform-origin: top left;
    animation: cia-fw-pop 220ms cubic-bezier(.2,1,.4,1);
    pointer-events: none;
  }

  .cia-fw-panel.is-open {
    display: flex;
    pointer-events: auto;
  }

  @keyframes cia-fw-pop {
    from { opacity: 0; transform: translateX(-12px) scale(0.97); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }

  .cia-fw-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.5);
    /* Apple-style frosted glass — steady white base + restrained saturation so
       it looks the same on every page, with a bright glass edge highlight. */
    background: rgba(255, 255, 255, 0.55);
    backdrop-filter: blur(28px) saturate(135%);
    -webkit-backdrop-filter: blur(28px) saturate(135%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
    cursor: grab;
    user-select: none;
  }

  .cia-fw-panel.is-dragging .cia-fw-header,
  .cia-fw-panel.is-dragging {
    cursor: grabbing;
  }

  .cia-fw-handle-grip {
    width: 28px;
    height: 4px;
    border-radius: 999px;
    background: rgba(124, 58, 237, 0.25);
  }

  .cia-fw-title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .cia-fw-brand-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .cia-fw-brand-name {
    font-size: 15px;
    font-weight: 700;
    color: #1f1235;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cia-fw-brand-one {
    color: #f9bd1c;
  }

  .cia-fw-brand-sub {
    font-size: 10px;
    font-weight: 500;
    color: #6f5f82;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cia-fw-logo {
    width: 18px;
    height: 18px;
    border-radius: 7px;
    display: block;
    object-fit: contain;
    background: white;
    padding: 2px;
    flex-shrink: 0;
  }

  .cia-fw-actions {
    display: flex;
    gap: 4px;
  }

  .cia-fw-icon-btn {
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: #6b6285;
    font-size: 13px;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 120ms ease, color 120ms ease;
  }

  .cia-fw-icon-btn:hover {
    background: rgba(124, 58, 237, 0.1);
    color: #1f1235;
  }

  .cia-fw-icon-btn[data-action="capture"] {
    font-size: 14px;
  }

  .cia-fw-icon-btn[data-action="capture"].has-shot {
    background: rgba(34, 197, 94, 0.18);
    color: #15803d;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
  }

  .cia-fw-icon-btn[data-action="capture"].is-capturing {
    opacity: 0.65;
    cursor: wait;
  }

  .cia-fw-iframe {
    flex: 1;
    width: 100%;
    border: none;
    /* Transparent so the panel's frosted-page backdrop shows through the app. */
    background: transparent;
    color-scheme: light;
  }

  .cia-fw-resizer {
    position: absolute;
    width: 18px;
    height: 18px;
    right: 0;
    bottom: 0;
    cursor: nwse-resize;
    background:
      linear-gradient(135deg,
        transparent 0%,
        transparent 40%,
        rgba(124, 58, 237, 0.4) 40%,
        rgba(124, 58, 237, 0.4) 50%,
        transparent 50%,
        transparent 65%,
        rgba(124, 58, 237, 0.4) 65%,
        rgba(124, 58, 237, 0.4) 75%,
        transparent 75%);
  }

  @media (max-width: 480px) {
    .cia-fw-panel {
      width: calc(100vw - 24px) !important;
      height: calc(100vh - 80px) !important;
      left: 12px !important;
      top: 12px !important;
    }
    .cia-fw-resizer {
      display: none;
    }
  }
`;

// Entry point — placed last so all module-scope `const`s above (notably
// SHADOW_CSS) are fully initialized before initFloatingWidget executes.
if (window.top === window && !document.getElementById(HOST_ID)) {
  try {
    initFloatingWidget();
    console.info("[CiA] floating widget injected on", location.href);
  } catch (error) {
    console.warn("[CiA] floating widget failed to init", error);
  }
}
