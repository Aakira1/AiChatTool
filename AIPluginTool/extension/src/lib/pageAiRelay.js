import { describeImageRemote } from "./api.js";
import { isPageVisionAllowed, isDebugHighlight, isWholePageVision } from "./settings.js";

// Page-AI relay: drive an AI chat widget that's already on the page (Rovo,
// Microsoft Copilot, ChatGPT…) using the user's logged-in session — no API key.
// We inject a self-contained function into every frame (the widget is often in
// an iframe), which detects a matching adapter, types the prompt, and reads the
// streamed reply back. Selectors are best-effort and may need tuning per site.

/**
 * This function is serialized (toString) and injected into each frame. It must
 * be fully self-contained — no outer references.
 */
function RELAY_IN_PAGE(mode, text, timeoutMs, debug, wholePage) {
  // ---- helpers ----
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const q = (sel, root = document) => {
    for (const s of [].concat(sel)) {
      const el = root.querySelector(s);
      if (el && visible(el)) return el;
    }
    return null;
  };
  const host = location.host;

  // ---- adapters (ordered; first match wins) ----
  const ADAPTERS = [
    {
      id: "rovo",
      name: "Rovo",
      test: () =>
        /atlassian\.net|atlassian\.com|jira|confluence/i.test(host) ||
        !!q('[data-testid*="rovo" i], [aria-label*="Rovo" i]'),
      input: () =>
        q([
          '[contenteditable="true"][role="textbox"]',
          '[data-testid*="chat" i] [contenteditable="true"]',
          'textarea[placeholder*="Describe" i]',
          '[contenteditable="true"]',
        ]),
      sendBtn: () =>
        q([
          'button[type="submit"]:not([disabled])',
          'button[aria-label*="Send" i]:not([disabled])',
          'button[aria-label*="Submit" i]:not([disabled])',
          'button[data-testid*="send" i]:not([disabled])',
          'button[data-test-id*="send" i]:not([disabled])',
          'button[data-testid*="submit" i]:not([disabled])',
          'button[data-testid*="rovo-conversation-send" i]:not([disabled])',
          '[role="button"][aria-label*="Send" i]:not([aria-disabled="true"])',
          '[role="button"][aria-label*="Submit" i]:not([aria-disabled="true"])',
        ]),
      // NB: never include the editor (.ProseMirror) here — it's the input, not a reply.
      replySel: '[data-testid*="message" i], [data-renderer-mark], [data-message-author]',
    },
    {
      id: "copilot-teams",
      name: "Microsoft Copilot",
      test: () => {
        const hostOk =
          /teams\.(microsoft|live)\.com|microsoftteams\.com|m365\.cloud\.microsoft|copilot\.(microsoft|cloud\.microsoft)\.com|(www\.)?(office|microsoft365)\.com|outlook\.office\.com|cloud\.microsoft/i.test(
            host,
          );
        if (hostOk) return true;
        // Fall back to on-page evidence: the "Copilot Chat" / "Message Copilot"
        // wording, or a Copilot-labelled control.
        const body = (document.body?.innerText || "").slice(0, 6000);
        if (/copilot chat|message copilot|ask copilot/i.test(body)) return true;
        return !!q('[aria-label*="Copilot" i], [data-tid*="copilot" i]');
      },
      input: () => {
        // 1) Direct attribute matches for the message composer.
        let el = q([
          'div[contenteditable="true"][aria-label*="Message Copilot" i]',
          'textarea[aria-label*="Message Copilot" i]',
          '[aria-placeholder*="Message Copilot" i]',
          '[placeholder*="Message Copilot" i]',
          'div[data-tid*="ckeditor" i][contenteditable="true"]',
        ]);
        if (el) return el;
        // 2) Otherwise pick a real composer: any visible editor that is NOT the
        // top "Search or ask Copilot" bar; prefer one near "Message Copilot"
        // text, else the bottom-most one (the chat box sits at the bottom).
        const editors = [
          ...document.querySelectorAll('[contenteditable="true"], textarea, [role="textbox"]'),
        ].filter((e) => {
          if (!visible(e)) return false;
          const lab = (
            (e.getAttribute("aria-label") || "") +
            " " +
            (e.getAttribute("placeholder") || "") +
            " " +
            (e.getAttribute("aria-placeholder") || "")
          ).toLowerCase();
          return !/search/.test(lab);
        });
        for (const e of editors) {
          const around =
            (e.parentElement?.textContent || "") +
            (e.closest("form, [role='form']")?.textContent || "");
          if (/message copilot/i.test(around)) return e;
        }
        // Bottom-most editor by vertical position.
        editors.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        return editors[editors.length - 1] || null;
      },
      sendBtn: () =>
        q([
          'button[aria-label*="Send" i]:not([disabled])',
          'button[data-tid*="send" i]:not([disabled])',
          'button[title*="Send" i]:not([disabled])',
          'button[name="send"]:not([disabled])',
        ]),
      replySel:
        '[data-tid*="chat-message" i], [data-tid*="message-body" i], [data-tid*="copilot" i] [role="article"], [role="article"]',
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      test: () => /chatgpt\.com|chat\.openai\.com/i.test(host),
      input: () => q(["#prompt-textarea", 'div[contenteditable="true"]', "textarea"]),
      sendBtn: () =>
        q(['button[data-testid="send-button"]:not([disabled])', 'button[aria-label*="Send" i]:not([disabled])']),
      replySel: '[data-message-author-role="assistant"]',
    },
  ];

  const adapter = ADAPTERS.find((a) => {
    try {
      return a.test() && a.input();
    } catch {
      return false;
    }
  });
  if (!adapter) return null;
  if (mode === "detect") return { id: adapter.id, name: adapter.name };

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const sent = norm(text);

  // ---- locate the input + its composer container (to exclude from replies) ----
  const el = adapter.input();
  if (!el) return { id: adapter.id, name: adapter.name, error: "Chat input not found" };
  let composer = el;
  for (let i = 0; i < 6 && composer.parentElement; i += 1) composer = composer.parentElement;

  // ---- type the prompt ----
  const typeInto = () => {
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, "");
      setter.call(el, text);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    } else {
      // contenteditable (ProseMirror / CKEditor / Lexical)
      const selr = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selr.removeAllRanges();
      selr.addRange(range);
      try {
        el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: text }));
      } catch {
        /* some editors don't like cancelable beforeinput */
      }
      const ok = document.execCommand("insertText", false, text);
      if (!ok || norm(el.innerText) !== sent) {
        el.textContent = text;
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  };

  // ---- find a send button. Score-based detection: each button gets points for
  // looking like "send" (label/icon/type=submit) and being near the bottom-right
  // of the composer. We pick the highest-scoring candidate. We must NEVER click
  // arbitrary toolbar buttons (mic/attach/menu) — those get explicit negatives.

  const labelOf = (b) =>
    (
      (b.getAttribute("aria-label") || "") +
      " " +
      (b.getAttribute("title") || "") +
      " " +
      (b.getAttribute("data-testid") || "") +
      " " +
      (b.getAttribute("data-tid") || "") +
      " " +
      (b.getAttribute("data-test-id") || "") +
      " " +
      (b.getAttribute("name") || "") +
      " " +
      // textContent matters — Rovo's stop control is labelled only via text
      // ("Stop generating"). Cap to avoid sucking in the whole reply text.
      (b.textContent || "").slice(0, 60)
    ).toLowerCase();

  const NEGATIVE_RE = /\b(reason|research|think|mic|voice|dictat|attach|upload|plus|menu|model|tool|emoji|gif|sticker|stop|halt|abort|clear|close|cancel|delete|edit|copy|search|expand|collapse|history|new chat|setting|generating|good response|bad response|thumbs|feedback|rating|like|dislike|share|bookmark|save|regenerate|retry|sources|citation|references|insert|continue|read aloud|speak|add|link|mention|format|file|view|skill|skills|more|options|insert|toolbar|action|browse|hide|show)\b/;
  const POSITIVE_RE = /\b(send|submit|enter|return)\b/;

  const findSend = () => {
    // 0. Adapter hint first.
    try {
      const hinted = adapter.sendBtn && adapter.sendBtn();
      if (hinted && !hinted.disabled && visible(hinted)) return hinted;
    } catch {
      /* ignore */
    }

    // 1. Walk up FAR — the send button can be many levels above the editor.
    let scope = el;
    for (let i = 0; i < 16 && scope.parentElement; i += 1) scope = scope.parentElement;
    if (scope === document.documentElement || !scope) scope = document.body || document;

    // 2. Collect candidate buttons. Include role=button divs (Rovo's send
    //    control is sometimes a styled div with role=button, not a <button>).
    const candidates = [
      ...scope.querySelectorAll(
        'button:not([disabled]), [role="button"]:not([aria-disabled="true"])',
      ),
    ].filter((b) => visible(b) && b !== el && !el.contains(b));

    if (candidates.length === 0) return null;

    // 3. Reference rect = the input box's bottom-right corner; the send button
    //    almost always lives right next to it.
    const elRect = el.getBoundingClientRect();
    const score = (b) => {
      const lab = labelOf(b);
      if (NEGATIVE_RE.test(lab)) return -1; // never click these
      let s = 0;
      if (POSITIVE_RE.test(lab)) s += 100; // explicit win
      if (b.type === "submit") s += 60;
      // SVG arrow / paper-plane icons → very likely a send control.
      const svg = b.querySelector("svg");
      if (svg) {
        const html = svg.outerHTML.toLowerCase();
        if (/paper|plane|send|arrow[- ]?up|arrow-right/.test(html)) s += 40;
        // Any SVG with an arrow-shaped path (M…L…Z with up/right movement).
        if (/<path[^>]+d=["'][^"']*(?:m\s*\d|l\s*\d)/.test(html) && !b.querySelector("svg svg")) s += 8;
      }
      // Position scoring: prefer buttons very close to the input's right edge
      // and at/below its baseline.
      const r = b.getBoundingClientRect();
      const dx = r.left - elRect.right;
      const dy = r.top - elRect.top;
      // Reject buttons that are nowhere near the composer at all.
      const farX = Math.abs(dx) > 400;
      const farY = Math.abs(dy) > 300 && Math.abs(r.bottom - elRect.bottom) > 300;
      if (farX || farY) return s; // keep the label-derived score but no proximity bonus
      // Close-by + small (icon-sized) → likely the send icon button.
      if (r.width < 64 && r.height < 64) s += 6;
      if (dx >= -32 && dx < 220) s += 5; // sits to the right of the input
      if (Math.abs(r.bottom - elRect.bottom) < 80) s += 5; // bottom-aligned
      // Rightmost button overall gets a small nudge.
      s += Math.max(0, 4 - Math.round(Math.abs(dx) / 60));
      return s;
    };

    let best = null;
    let bestScore = -Infinity;
    let secondBest = null;
    let secondBestScore = -Infinity;
    for (const b of candidates) {
      const s = score(b);
      if (s > bestScore) {
        secondBest = best;
        secondBestScore = bestScore;
        best = b;
        bestScore = s;
      } else if (s > secondBestScore) {
        secondBest = b;
        secondBestScore = s;
      }
    }
    // Stash the score for diagnostics.
    if (best) {
      try {
        best.__ciaSendScore = bestScore;
        best.__ciaCandidatesCount = candidates.length;
        best.__ciaSecondScore = secondBestScore;
        best.__ciaSecondLabel = secondBest ? labelOf(secondBest) : "";
      } catch {
        /* ignore */
      }
    }
    // Require a meaningful score so we don't click a random toolbar button.
    return bestScore >= 3 ? best : null;
  };

  const pressEnter = (opts = {}) => {
    const init = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
      ...opts, // e.g. { ctrlKey: true } for Ctrl+Enter
    };
    // Dispatch on input element + document (some apps capture at document level).
    for (const t of ["keydown", "keypress", "keyup"]) {
      el.dispatchEvent(new KeyboardEvent(t, init));
    }
    for (const t of ["keydown", "keyup"]) {
      document.dispatchEvent(new KeyboardEvent(t, init));
    }
  };

  // Real click: many React apps ignore a bare .click() — dispatch the full
  // pointer/mouse sequence at the target's centre. Also retry on the deepest
  // child (some apps put the listener on the SVG icon inside the button).
  const realClick = (btn) => {
    if (!btn) return;
    const targets = [btn];
    // Click the innermost child too — some apps attach listeners to the icon
    // (SVG / span) inside the button, and clicks on the outer <button> miss.
    const inner = btn.querySelector("svg, span, i");
    if (inner) targets.push(inner);
    for (const target of targets) {
      const r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const opts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
        button: 0,
        view: window,
      };
      for (const t of ["pointerover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        target.dispatchEvent(
          t.startsWith("pointer") ? new PointerEvent(t, opts) : new MouseEvent(t, opts),
        );
      }
    }
  };

  // Form-submit fallback: many chat composers are inside <form> and react to a
  // requestSubmit() even when no button was clickable.
  const submitForm = () => {
    const form = el.closest && el.closest("form");
    if (form && typeof form.requestSubmit === "function") {
      try {
        form.requestSubmit();
        return true;
      } catch {
        /* some forms reject programmatic submit */
      }
    }
    return false;
  };

  // ---- the chat panel = the ancestor of the composer that also holds the
  // message list. Scoping reads to it stops us "seeing" the host page behind
  // the chat widget (e.g. Jira content behind Rovo). ----
  const chatRoot = (() => {
    let node = el;
    for (let i = 0; i < 14 && node.parentElement; i += 1) {
      node = node.parentElement;
      // A plausible chat container: holds the composer AND other text blocks,
      // but is not the whole document body.
      if (node === document.body || node === document.documentElement) break;
      const role = node.getAttribute?.("role") || "";
      const tid = (node.getAttribute?.("data-testid") || "") + (node.getAttribute?.("data-tid") || "");
      if (/dialog|complementary|region/.test(role) || /chat|rovo|copilot|conversation|panel/i.test(tid)) {
        return node;
      }
      // Heuristic: a container noticeably taller than the composer that also
      // contains scrollable content is likely the chat panel.
      const r = node.getBoundingClientRect?.();
      const cr = composer.getBoundingClientRect?.();
      if (r && cr && r.height > cr.height * 3 && node.contains(composer)) return node;
    }
    return document;
  })();

  // ---- the reply = the newest substantial text block that is NOT the composer
  // and NOT an echo of what we just sent — searched INSIDE the chat panel.
  // We try (in order):
  //   1. Adapter-specific selectors (Rovo / Copilot / ChatGPT message containers)
  //   2. Generic "message"/"bubble" attribute matches
  //   3. Text-density scan: ANY visible block in the chat panel that holds
  //      substantial prose — this is the catch-all when the page AI rolls a
  //      new UI version that none of the above selectors match. ----
  // Walk a tree (including open shadow DOMs) and collect matching elements.
  const queryAllDeep = (root, selector) => {
    if (!root || !root.querySelectorAll) return [];
    const result = [...root.querySelectorAll(selector)];
    // Crawl any open shadow roots for elements we'd miss otherwise.
    const allEls = root.querySelectorAll("*");
    let crawled = 0;
    for (const node of allEls) {
      if (crawled++ > 3000) break;
      if (node.shadowRoot) {
        result.push(...queryAllDeep(node.shadowRoot, selector));
      }
    }
    return result;
  };

  const replyCandidates = () => {
    // Try chatRoot first; if empty, expand to the whole document. Some chat
    // widgets render messages in a sibling subtree the chatRoot heuristic
    // doesn't reach (especially when Atlaskit wraps things in extra layers).
    const scopes = [];
    if (chatRoot && chatRoot.querySelectorAll) scopes.push(chatRoot);
    if (document.body && !scopes.includes(document.body)) scopes.push(document.body);

    const selectorPrimary = adapter.replySel || "";
    const selectorBroad =
      '[data-message-author-role], [role="article"], [data-testid*="message" i], [data-tid*="message" i], [data-testid*="response" i], [data-testid*="answer" i], [data-testid*="result" i], [data-testid*="conversation" i], [data-renderer-document], [class*="message" i], [class*="bubble" i], [class*="response" i], [class*="answer" i]';
    const selectorDensity = "p, li, blockquote, article, section, div";

    const accept = (n) => visible(n) && !composer.contains(n) && !n.contains(el) && n !== el;

    for (const scope of scopes) {
      let nodes = [];
      if (selectorPrimary) nodes = queryAllDeep(scope, selectorPrimary);
      if (!nodes.length) nodes = queryAllDeep(scope, selectorBroad);
      let filtered = nodes.filter(accept);

      // Text-density fallback — broad sweep for any visible prose block.
      if (filtered.length === 0) {
        const all = queryAllDeep(scope, selectorDensity);
        filtered = all.filter((n) => {
          if (!accept(n)) return false;
          const r = n.getBoundingClientRect();
          if (r.height > window.innerHeight * 1.5) return false;
          const direct = (n.innerText || n.textContent || "").trim();
          if (direct.length < MIN_REPLY_LEN) return false;
          if (sent && (direct === sent || (direct.length < sent.length * 1.3 && direct.includes(sent)))) return false;
          return true;
        });
      }

      if (filtered.length > 0) return filtered;
    }
    return [];
  };
  // Whole-string status/progress labels that are NOT answers (step names,
  // suggestion chips, "Resuming response", etc.).
  const STEP_RE =
    /^(researching|synthesi[sz]e findings?|reading|searching|analy[sz]ing|planning|thinking|generating(?: a)? response|generating|gathering|reviewing|summari[sz]ing|working on it|resuming(?: response)?|rovo is thinking)[\s.…]*$/i;
  const MIN_REPLY_LEN = 60; // real answers are paragraphs; ignore chips/labels/fragments

  // Clean a candidate's text before judging it.
  // 1. Strip a leading "Copy" action label some message bubbles include.
  // 2. Strip Rovo's "Thinking completed / Completed N steps" trace header that
  //    appears at the TOP of the same DOM node as the real answer — without this
  //    the whole node would be filtered by TRACE_RE even though it contains a
  //    valid reply.
  const cleanText = (raw) => {
    let t = norm(raw).replace(/^copy\s+/i, "");
    t = t.replace(/^(?:thinking completed|rovo is thinking)\s*/i, "").trim();
    t = t.replace(/^(?:completed \d+[^.!?]*[.!?]?\s*)+/i, "").trim();
    return t;
  };

  // Is `t` an echo of what we just sent? The user's own message bubble repeats
  // the prompt (often with a "Copy" label), so it CONTAINS the sent text.
  const isEcho = (t) => t === sent || (sent && (sent.includes(t) || t.includes(sent)));

  // Rovo's thinking TRACE panel ("Rovo is thinking… / Analyzing… / Searching
  // internal company knowledge base / Searching: …") is not the answer — skip
  // any block that begins with those markers, even when it's long.
  const TRACE_RE =
    /^(rovo is thinking|thinking completed|analy[sz]ing|searching(?: internal| the)?\b|searching:|reading|browsing|planning|gathering|let me search)/i;

  // A node qualifies as an answer if it's substantial, not the echo, not a
  // status/trace label, and (when nested) is the leaf-most bubble for its text.
  const qualifies = (t) => t && t.length >= MIN_REPLY_LEN && !isEcho(t) && !STEP_RE.test(t) && !TRACE_RE.test(t);

  // Pick the answer NODE. For chat apps the newest reply is at the BOTTOM of
  // the panel, but the newest reply is also usually the LONGEST currently-on-
  // screen block. We combine both: score = bottom + length * 0.001 so bottom-
  // most dominates, length breaks ties. Also: prefer ancestors over their
  // descendants (so we get the whole bubble, not one paragraph inside it).
  const bestReplyNode = () => {
    const nodes = replyCandidates();
    const qualified = nodes
      .map((n) => ({ n, t: cleanText(n.innerText) }))
      .filter((x) => qualifies(x.t));
    if (!qualified.length) return null;
    // Drop descendants of other qualifying candidates — we want the OUTER
    // bubble, not the inner paragraph.
    const ancestorsOnly = qualified.filter(
      ({ n }) => !qualified.some(({ n: other }) => other !== n && other.contains(n)),
    );
    const pool = ancestorsOnly.length ? ancestorsOnly : qualified;
    let best = null;
    let bestScore = -Infinity;
    for (const { n, t } of pool) {
      const bottom = n.getBoundingClientRect().bottom;
      const score = bottom + t.length * 0.001;
      if (score > bestScore) {
        best = n;
        bestScore = score;
      }
    }
    return best;
  };
  const latestReply = () => {
    const n = bestReplyNode();
    return n ? cleanText(n.innerText) : "";
  };
  const latestReplyNode = () => bestReplyNode();

  // ---- debug highlighter: draw boxes on the page showing what we're reading ----
  // Poll-safe highlighter: reuses ONE layer (by id) across separate read
  // injections so boxes update smoothly instead of flickering/accumulating.
  const HL = debug
    ? (() => {
        const ID = "__cia_hl_layer";
        let layer = document.getElementById(ID);
        if (!layer) {
          layer = document.createElement("div");
          layer.id = ID;
          layer.style.cssText =
            "position:fixed;inset:0;z-index:2147483646;pointer-events:none;contain:layout style;";
          document.documentElement.appendChild(layer);
        }
        const draw = (key, target, color, label) => {
          let box = layer.querySelector('[data-cia-box="' + key + '"]');
          if (!target) {
            if (box) box.remove();
            return;
          }
          const r = target.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          if (!box) {
            box = document.createElement("div");
            box.setAttribute("data-cia-box", key);
            box.style.cssText =
              "position:fixed;box-sizing:border-box;border-radius:5px;pointer-events:none;transition:all .15s ease;";
            const lab = document.createElement("span");
            lab.className = "__cia_lab";
            lab.style.cssText =
              "position:absolute;top:-17px;left:-2px;font:700 11px/1.5 system-ui,sans-serif;padding:0 6px;border-radius:4px;color:#fff;white-space:nowrap;";
            box.appendChild(lab);
            layer.appendChild(box);
          }
          box.style.left = r.left + "px";
          box.style.top = r.top + "px";
          box.style.width = r.width + "px";
          box.style.height = r.height + "px";
          box.style.border = "2px solid " + color;
          box.style.boxShadow = "0 0 0 1px rgba(0,0,0,.2)";
          const lab = box.querySelector(".__cia_lab");
          lab.textContent = label;
          lab.style.background = color;
        };
        const statusBadge = (txt, color) => {
          let badge = layer.querySelector('[data-cia-box="__status"]');
          if (!badge) {
            badge = document.createElement("div");
            badge.setAttribute("data-cia-box", "__status");
            badge.style.cssText =
              "position:fixed;left:10px;bottom:10px;font:700 12px/1.6 system-ui,sans-serif;color:#fff;padding:4px 10px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.3);";
            layer.appendChild(badge);
          }
          badge.textContent = "🔎 AI: " + txt;
          badge.style.background = color;
        };
        // Whole-page outline (entire-page vision).
        const drawPage = (on) => {
          const PID = "__cia_hl_page";
          let pg = document.getElementById(PID);
          if (!on) {
            if (pg) pg.remove();
            return;
          }
          const w = Math.max(
            document.documentElement.scrollWidth,
            document.body ? document.body.scrollWidth : 0,
            window.innerWidth,
          );
          const h = Math.max(
            document.documentElement.scrollHeight,
            document.body ? document.body.scrollHeight : 0,
            window.innerHeight,
          );
          if (!pg) {
            pg = document.createElement("div");
            pg.id = PID;
            pg.style.cssText =
              "position:absolute;top:0;left:0;z-index:2147483645;pointer-events:none;box-sizing:border-box;border:3px dashed #16a34a;border-radius:8px;";
            const lab = document.createElement("div");
            lab.style.cssText =
              "position:fixed;top:10px;right:10px;background:#16a34a;color:#fff;font:700 12px/1.5 system-ui,sans-serif;padding:3px 9px;border-radius:7px;box-shadow:0 4px 14px rgba(0,0,0,.3);";
            lab.textContent = "👁 AI sees this entire page";
            pg.appendChild(lab);
            (document.body || document.documentElement).appendChild(pg);
          }
          pg.style.width = w + "px";
          pg.style.height = h + "px";
        };
        return {
          draw,
          status: statusBadge,
          drawPage,
          destroy: () => {
            layer.remove();
            document.getElementById("__cia_hl_page")?.remove();
          },
        };
      })()
    : null;
  const inputText = () =>
    norm(el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? el.value : el.innerText);

  // Is the page AI busy (thinking / "Researching" / generating)? While busy we
  // must NOT settle a reply or send a new message. Signals: a Stop button, a
  // progress/aria-busy element, or visible status text like "Researching".
  const isBusy = () => {
    if (
      q([
        'button[aria-label*="stop" i]',
        'button[aria-label*="cancel" i]',
        'button[title*="stop" i]',
        'button[data-testid*="stop" i]',
        'button[data-tid*="stop" i]',
        '[role="progressbar"]',
        '[aria-busy="true"]',
      ])
    ) {
      return true;
    }
    // Some chat apps (Rovo) label their stop control ONLY via textContent —
    // scan buttons near the composer for "Stop generating" / "Cancel".
    const stopTextRe = /\b(stop generating|stop response|stop|cancel|halt|abort)\b/i;
    const composerArea = el.closest && el.closest("form, [role='form'], [role='dialog'], section, main") || document.body;
    const nearbyBtns = composerArea?.querySelectorAll?.('button, [role="button"]') || [];
    let btnScanned = 0;
    for (const b of nearbyBtns) {
      if (btnScanned++ > 60) break;
      if (!visible(b)) continue;
      const t = (b.textContent || "").trim();
      if (!t || t.length > 40) continue;
      if (stopTextRe.test(t)) return true;
    }
    // "is thinking / Researching / Generating / Analyzing …" = busy.
    const busyRe =
      /\b(researching|is thinking|thinking|generating|working on it|loading|typing|reasoning|searching|analy[sz]ing|browsing|resuming response|in progress)\b/i;
    // …but "Thinking completed / complete / finished / done" means it's DONE —
    // never treat those as busy (the word "thinking" appears in both).
    const doneRe = /\b(complete|completed|finished|done|stopped)\b/i;
    // Scan the whole document (capped) — the "Researching"/"Rovo is thinking"
    // status can appear in the message area, not just near the composer.
    const nodes = document.querySelectorAll('[aria-live], [role="status"], button, span, div');
    let scanned = 0;
    for (const n of nodes) {
      if (scanned++ > 1400) break;
      if (!visible(n)) continue;
      const t = (n.childElementCount === 0 ? n.textContent : "") || n.getAttribute("aria-label") || "";
      if (!t || t.length >= 60) continue;
      if (doneRe.test(t)) continue; // "Thinking completed" → not busy
      if (busyRe.test(t)) return true;
    }
    return false;
  };

  // ── mode: clear (remove the debug overlay) ──
  if (mode === "clear") {
    document.getElementById("__cia_hl_layer")?.remove();
    document.getElementById("__cia_hl_page")?.remove();
    return { id: adapter.id, name: adapter.name, ok: true };
  }

  // ── mode: read — report the current state so the side panel can "check back"
  // (this is the AI kicking up to see if the page AI returned). ──
  if (mode === "read") {
    const busy = isBusy();
    const replyNode = latestReplyNode();
    const reply = replyNode ? cleanText(replyNode.innerText) : "";
    const candidatesFound = replyCandidates().length;
    if (HL) {
      HL.drawPage(wholePage);
      HL.draw("input", el, "#16a34a", "AI input");
      HL.draw("reply", replyNode, "#2563eb", "AI reads this reply");
      HL.status(busy ? "page AI is researching…" : "reading reply…", busy ? "#7c3aed" : "#2563eb");
    }
    return {
      id: adapter.id,
      name: adapter.name,
      busy,
      reply,
      candidatesFound,
      replyNodeFound: !!replyNode,
    };
  }

  // ── mode: idle — just report whether the page AI is currently busy. The
  // outer JS uses this to WAIT for Rovo to finish generating before typing,
  // so we never click "Stop generating" by mistake. ──
  if (mode === "idle") {
    const busy = isBusy();
    if (HL) {
      HL.drawPage(wholePage);
      HL.draw("input", el, "#16a34a", "AI input");
      HL.status(busy ? "waiting — page AI is busy" : "page AI is idle", busy ? "#7c3aed" : "#16a34a");
    }
    return { id: adapter.id, name: adapter.name, busy };
  }

  // ── mode: clickAt — click at viewport coordinates (used by vision fallback
  // when the AI has located the send button visually in a screenshot). ──
  if (mode === "clickAt") {
    // `text` is JSON-stringified { xPct, yPct } (0-100) OR { x, y } pixels.
    let coords;
    try {
      coords = JSON.parse(String(text));
    } catch {
      return { id: adapter.id, name: adapter.name, ok: false, error: "bad coords" };
    }
    // Convert percentages (preferred) → viewport pixels using this frame's
    // window. captureVisibleTab images are scaled to the visible viewport, so
    // percentage-of-image ≈ percentage-of-viewport.
    const x = coords.x != null ? coords.x : (coords.xPct / 100) * window.innerWidth;
    const y = coords.y != null ? coords.y : (coords.yPct / 100) * window.innerHeight;
    const target = document.elementFromPoint(x, y);
    if (!target) return { id: adapter.id, name: adapter.name, ok: false, error: "no element at coords", x, y };
    // Walk up to find a clickable ancestor (button or role=button).
    let clickTarget = target;
    for (let i = 0; i < 6; i += 1) {
      if (!clickTarget.parentElement) break;
      const tag = (clickTarget.tagName || "").toLowerCase();
      const role = clickTarget.getAttribute?.("role") || "";
      if (tag === "button" || tag === "a" || role === "button") break;
      clickTarget = clickTarget.parentElement;
    }
    const before = (el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? el.value : el.innerText || "").trim();
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, view: window };
    for (const t of ["pointerover", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      clickTarget.dispatchEvent(
        t.startsWith("pointer") ? new PointerEvent(t, opts) : new MouseEvent(t, opts),
      );
    }
    return {
      id: adapter.id,
      name: adapter.name,
      ok: true,
      clickedTag: (clickTarget.tagName || "").toLowerCase(),
      clickedLabel: (clickTarget.getAttribute?.("aria-label") || clickTarget.textContent || "").trim().slice(0, 60),
      inputClearedAfter: before === "" ? "n/a" : "polling",
    };
  }

  // ── mode: send — type ONE message and submit it (then return promptly). The
  // side panel polls "read" afterwards to await the answer. Outer JS has
  // already waited for the page AI to be idle, but we double-check here. ──
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const prepareDeadline = startedAt + 5000; // outer JS already waited for idle
    const hardCap = startedAt + 20000;
    let phase = "prepare";

    // Dismiss any open menus/popups first — a stale "+" menu over the
    // composer can hide the real send control AND offer fake "Add" targets.
    try {
      for (const t of ["keydown", "keyup"]) {
        document.dispatchEvent(
          new KeyboardEvent(t, {
            key: "Escape",
            code: "Escape",
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        );
      }
    } catch {
      /* ignore */
    }
    let typed = false;
    let sendTries = 0;
    let lastSendAt = 0;

    const done = (sent) => {
      clearInterval(tick);
      if (HL) {
        HL.draw("input", el, "#16a34a", "AI input");
        HL.status(sent ? "sent — waiting for the page AI…" : "couldn't send", sent ? "#7c3aed" : "#dc2626");
      }
      // Diagnostics: what the in-page script saw at the moment it gave up.
      const btn = findSend();
      // Also count enabled candidate buttons in a wide scope, so the user can
      // see if findSend has nothing to work with vs. it's just being picky.
      let candidateCount = 0;
      try {
        let probeScope = el;
        for (let i = 0; i < 16 && probeScope.parentElement; i += 1) probeScope = probeScope.parentElement;
        candidateCount = [
          ...probeScope.querySelectorAll(
            'button:not([disabled]), [role="button"]:not([aria-disabled="true"])',
          ),
        ].filter((b) => visible(b) && b !== el && !el.contains(b)).length;
      } catch {
        /* ignore */
      }
      const diag = {
        id: adapter.id,
        name: adapter.name,
        sent,
        sendTries,
        inputCleared: inputText() === "",
        busy: isBusy(),
        foundSendButton: !!btn,
        sendButtonLabel: btn
          ? (btn.getAttribute("aria-label") || btn.getAttribute("title") || btn.textContent || "").trim().slice(0, 80)
          : null,
        sendButtonScore: btn ? btn.__ciaSendScore : null,
        candidatesNearComposer: candidateCount,
        runnerUpLabel: btn ? (btn.__ciaSecondLabel || null) : null,
      };
      resolve(diag);
    };

    const tick = setInterval(() => {
      if (HL) {
        HL.drawPage(wholePage);
        HL.draw("input", el, "#16a34a", "AI input");
      }
      if (Date.now() > hardCap) {
        done(inputText() === "");
        return;
      }
      if (phase === "prepare") {
        if (HL) HL.status("waiting for page AI to be idle…", "#7c3aed");
        if (!isBusy() || Date.now() > prepareDeadline) {
          if (!typed) {
            typeInto();
            typed = true;
          }
          phase = "send";
          lastSendAt = 0;
        }
        return;
      }
      // phase === "send"
      if (HL) {
        HL.draw("send", findSend(), "#f59e0b", "send");
        HL.status("sending…", "#f59e0b");
      }
      if (inputText() === "") {
        done(true); // input cleared → accepted
        return;
      }
      if (isBusy()) {
        done(true); // AI started working → accepted
        return;
      }
      if (Date.now() - lastSendAt > 700 && sendTries < 16) {
        sendTries += 1;
        lastSendAt = Date.now();
        el.focus();
        const btn = findSend();
        // Cycle through 5 strategies so stubborn editors get every path:
        //   1: real pointer-sequence click on the send button
        //   2: press Enter inside the editor
        //   3: form.requestSubmit() if the composer is inside <form>
        //   4: Ctrl+Enter (some apps require modifier to send)
        //   5: real click again (state may have stabilised by now)
        const strategy = (sendTries - 1) % 5;
        if (strategy === 0 && btn) realClick(btn);
        else if (strategy === 1) pressEnter();
        else if (strategy === 2 && !submitForm()) pressEnter();
        else if (strategy === 3) pressEnter({ ctrlKey: true });
        else if (btn) realClick(btn);
        else pressEnter();
      }
    }, 300);
  });
}

// Run the injected function in every frame of the tab; return the first frame
// that produced a result (the one hosting the widget).
async function runInFrames(tabId, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: RELAY_IN_PAGE,
    args,
  });
  for (const r of results || []) {
    if (r?.result) return r.result;
  }
  return null;
}

// Hosts that carry a supported AI chat — used to locate the right tab even when
// our panel is popped out into its own window (so "active tab" is us, not the AI).
const AI_HOST_RE =
  /atlassian\.net|atlassian\.com|\bjira\b|confluence|teams\.(?:microsoft|live)\.com|microsoftteams\.com|m365\.cloud\.microsoft|cloud\.microsoft|copilot\.(?:microsoft|cloud\.microsoft)\.com|(?:www\.)?(?:office|microsoft365)\.com|outlook\.office\.com|chatgpt\.com|chat\.openai\.com/i;

// Find the tab hosting the AI chat. Prefers a tab on a known AI host (across ALL
// windows, so it works from the popout); falls back to the focused tab.
async function findAiTabId() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    tabs = [];
  }
  const candidates = tabs.filter(
    (t) => t.id != null && t.url && /^https?:/i.test(t.url) && AI_HOST_RE.test(t.url),
  );
  if (candidates.length) {
    candidates.sort(
      (a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || (b.lastAccessed || 0) - (a.lastAccessed || 0),
    );
    return candidates[0].id;
  }
  // Fallback: the active tab of the last focused normal window (docked panel case).
  const all = tabs.filter((t) => t.active && t.url && /^https?:/i.test(t.url) && !t.url.startsWith(chrome.runtime.getURL("")));
  if (all.length) {
    all.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    return all[0].id;
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id ?? null;
}

async function ensureHostAccess(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url || !/^https?:/.test(tab.url)) return true;
    const origin = new URL(tab.url).origin + "/*";
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (has) return true;
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return true; // fall back to activeTab
  }
}

/** Detect whether a known page-AI widget is present on the active tab. */
export async function detectPageAi() {
  const tabId = await findAiTabId();
  if (!tabId) return null;
  await ensureHostAccess(tabId);
  try {
    return await runInFrames(tabId, ["detect", "", 0, false]);
  } catch {
    return null;
  }
}

// "Eyes": screenshot the AI tab so the assistant can visually read the page.
async function captureAiTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 70,
    });
    return dataUrl || null;
  } catch {
    return null;
  }
}

// A reply is "weak" when DOM capture failed (empty or a parenthetical note).
function isWeakReply(reply) {
  const t = (reply || "").trim();
  return !t || t.startsWith("(");
}

// Vision-based locator: take a screenshot of the AI tab, ask the model where
// the send button is, return PERCENTAGE coordinates. We let the in-page script
// convert percentages → viewport pixels using its own window dimensions.
async function locateSendButtonViaVision({ dataUrl, via }) {
  const prompt = [
    `This is a screenshot of the ${via} AI chat panel. Locate the SEND button —`,
    `the control the user would click to submit the message currently in the`,
    `chat input box. It's almost always a small up-arrow / paper-plane icon`,
    `near the bottom-right of the chat input. Do NOT pick:`,
    `- thumbs-up / thumbs-down (feedback)`,
    `- "+" or attach / upload icons`,
    `- microphone / voice icons`,
    `- the "Stop generating" / "Cancel" control`,
    `- menu items inside a popup ("Add link", "View skills", etc.)`,
    ``,
    `Return ONLY compact JSON, no prose, in this exact shape:`,
    `{"found": true, "x_pct": <0-100>, "y_pct": <0-100>}`,
    `or`,
    `{"found": false}`,
    `where x_pct/y_pct are the CENTER of the send button as percentages of the`,
    `image's width/height (0,0 = top-left, 100,100 = bottom-right).`,
  ].join("\n");
  let raw;
  try {
    raw = await describeImageRemote({ dataUrl, prompt, name: `${via} chat` });
  } catch {
    return null;
  }
  if (!raw) return null;
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed?.found) return null;
  const xPct = Number(parsed.x_pct);
  const yPct = Number(parsed.y_pct);
  if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) return null;
  if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return null;
  return { xPct, yPct };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Relay ONE prompt to the page AI, then poll back ("kick up to check") until it
 * has fully returned a settled answer. Real back-and-forth: send → wait for the
 * page AI to finish → read the complete reply. Long budget because Rovo "Deep
 * Research" can produce thousands of words over several minutes.
 *
 * @param {string} text - prompt to send
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]
 * @param {AbortSignal} [opts.signal] - abort the relay (Stop button). All
 *        long-running loops (wait-idle + reply polling) check this between
 *        iterations and bail out promptly.
 * @param {function(string):void} [opts.onStatus] - called with real-time log messages
 * @param {function({text:string,busy:boolean,phase:string}):void} [opts.onReply]
 *        - called every poll with the live reply text and phase so the user can
 *        SEE exactly what the AI is currently reading.
 */
export async function relayToPageAi(text, { timeoutMs = 600000, signal, onStatus, onReply } = {}) {
  const checkAbort = () => {
    if (signal?.aborted) {
      const err = new Error("Relay stopped");
      err.name = "AbortError";
      throw err;
    }
  };
  // Interruptible sleep — wakes immediately on abort.
  const abortableSleep = (ms) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        signal?.removeEventListener?.("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(t);
        const err = new Error("Relay stopped");
        err.name = "AbortError";
        reject(err);
      };
      if (signal?.aborted) {
        clearTimeout(t);
        const err = new Error("Relay stopped");
        err.name = "AbortError";
        reject(err);
        return;
      }
      signal?.addEventListener?.("abort", onAbort, { once: true });
    });
  const tabId = await findAiTabId();
  if (!tabId) throw new Error("No active tab to relay to");
  const ok = await ensureHostAccess(tabId);
  if (!ok) throw new Error("Permission to access this page was denied");
  // Force the on-page highlighter ON during a relay run, regardless of the
  // user's debug-highlight setting — that's the "AI vision" the user wants
  // to see (boxes on the page showing input/reply/send).
  const debug = true;
  const whole = isWholePageVision();

  // 1) Send the single message. If it doesn't go through (page AI mid-work,
  //    send control briefly disabled), wait and retry once before giving up.
  // 0) Wait for the page AI to be idle FIRST. If we send while Rovo is still
  //    generating a previous response, the "send" control reads "Stop
  //    generating" and clicking it cancels Rovo's reply — leaving us stuck.
  //    Poll up to 3 minutes; checks every 2s.
  const idleDeadline = Date.now() + 180_000;
  let waitedForIdle = false;
  let idlePolls = 0;
  while (Date.now() < idleDeadline) {
    checkAbort();
    const idle = await runInFrames(tabId, ["idle", "", 0, debug, whole]);
    idlePolls += 1;
    if (!idle) break; // adapter not present → fall through to send so we error meaningfully
    onReply?.({ text: "", busy: idle.busy, phase: "waiting-idle" });
    if (!idle.busy) {
      if (waitedForIdle) onStatus?.(`✅ Page AI is idle — proceeding (waited ${idlePolls * 2}s)`);
      break;
    }
    if (!waitedForIdle) {
      onStatus?.(`⏸ Page AI is still thinking — waiting for it to finish before sending…`);
      waitedForIdle = true;
    } else if (idlePolls % 5 === 0) {
      onStatus?.(`⏸ Still waiting (${idlePolls * 2}s)… page AI hasn't finished yet`);
    }
    await abortableSleep(2000);
  }
  checkAbort();

  const fmtDiag = (d) =>
    !d
      ? "no response from page"
      : `tries=${d.sendTries} btn=${d.foundSendButton ? `"${d.sendButtonLabel || "?"}"(score=${d.sendButtonScore})` : "none"} candidates=${d.candidatesNearComposer ?? "?"} busy=${d.busy} input-cleared=${d.inputCleared}`;

  // Retry the whole send up to 4 times. After the 2nd failure, use VISION:
  // screenshot the page and ask AI to locate the send button — "see it like a
  // human would". Then click at the returned viewport coords.
  let sendRes = null;
  const MAX_SEND_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    checkAbort();
    onStatus?.(
      `📝 Attempt ${attempt}/${MAX_SEND_ATTEMPTS} — typing prompt (${String(text).length} chars)…`,
    );
    sendRes = await runInFrames(tabId, ["send", String(text), 0, debug, whole]);
    if (!sendRes)
      throw new Error(
        "No Rovo / Copilot / ChatGPT chat found in an open Chrome tab (desktop apps can't be reached — open it in a browser tab).",
      );
    if (sendRes.error) throw new Error(sendRes.error);
    if (sendRes.sent !== false) break;

    onStatus?.(`⚠️ Attempt ${attempt} not accepted (${fmtDiag(sendRes)})`);

    // Vision fallback after the 2nd failure (gives DOM strategies a fair go
    // first, but doesn't waste 4 attempts of pure-DOM retry). Respects the
    // user's Privacy mode — no screenshots taken when it's off.
    if (attempt >= 2 && attempt < MAX_SEND_ATTEMPTS && isPageVisionAllowed()) {
      try {
        onStatus?.("👁 Looking at the page like a human — locating send button via vision…");
        const shot = await captureAiTab(tabId);
        if (shot) {
          const coords = await locateSendButtonViaVision({
            dataUrl: shot,
            via: sendRes.name || "page AI",
          });
          if (coords) {
            onStatus?.(
              `👁 Vision spotted send button at ${coords.xPct.toFixed(1)}% × ${coords.yPct.toFixed(1)}% — clicking there`,
            );
            const clickRes = await runInFrames(tabId, [
              "clickAt",
              JSON.stringify(coords),
              0,
              debug,
              whole,
            ]);
            onStatus?.(
              `👁 Clicked ${clickRes?.clickedTag || "?"} "${clickRes?.clickedLabel || ""}" — verifying…`,
            );
            // Give the page a beat to process the click, then re-check.
            await abortableSleep(1500);
            const verify = await runInFrames(tabId, ["send", String(text), 0, debug, whole]);
            if (verify?.sent !== false) {
              sendRes = verify;
              break;
            }
            sendRes = verify || sendRes;
            onStatus?.(`⚠️ Vision click didn't take — falling back to text retry`);
          } else {
            onStatus?.("👁 Vision couldn't locate a send button — falling back to text retry");
          }
        }
      } catch (visionErr) {
        onStatus?.(`👁 Vision fallback errored: ${visionErr.message || "unknown"} — continuing with text retry`);
      }
    }

    if (attempt < MAX_SEND_ATTEMPTS) {
      const wait = 4000 + attempt * 2000; // 6s, 8s, 10s — progressive backoff
      onStatus?.(`🔁 Retrying in ${wait / 1000}s (attempt ${attempt + 1}/${MAX_SEND_ATTEMPTS})…`);
      await abortableSleep(wait);
    }
  }

  if (!sendRes || sendRes.sent === false) {
    onStatus?.(`❌ Send failed after ${MAX_SEND_ATTEMPTS} attempts: ${fmtDiag(sendRes)}`);
    throw new Error(
      `Couldn't send to ${sendRes?.name ?? "the page AI"} after ${MAX_SEND_ATTEMPTS} attempts — ${
        sendRes?.foundSendButton
          ? `clicked "${sendRes.sendButtonLabel || "send"}", input still has text`
          : `no send button found (saw ${sendRes?.candidatesNearComposer ?? 0} buttons near the input)`
      }. ${sendRes?.busy ? "Page AI looks busy — wait for it to finish then retry." : "The page layout may have changed."}`,
    );
  }
  const via = sendRes.name;
  onStatus?.(`📤 Sent to ${via} — watching for reply…`);

  // 2) Poll back every few seconds and check if the page AI has returned. We
  //    settle once it is no longer busy AND its reply has been stable for a
  //    quiet window. Long answers stream in chunks AND can have a beat between
  //    "thinking" markers being removed and the actual answer appearing —
  //    paced like a human reading the page, not a tight loop.
  const deadline = Date.now() + timeoutMs;
  const STABLE_MS = 8000; // reply must be unchanged for 8s before we trust it
  const IDLE_CONFIRMS_NEEDED = 3; // need 3 consecutive idle polls (~12s) to call it done
  let lastReply = "";
  let stableSince = Date.now();
  let sawReply = false;
  let sawBusy = false;
  let timedOut = false;
  let pollCount = 0;
  let idleStreak = 0; // consecutive non-busy polls
  await abortableSleep(3000); // human-paced first look — let Rovo start typing
  let visionReadAttempts = 0;
  let domEmptyStreak = 0; // consecutive idle-but-empty polls
  while (true) {
    checkAbort();
    const r = await runInFrames(tabId, ["read", String(text), 0, debug, whole]);
    const busy = Boolean(r?.busy);
    let reply = r?.reply || "";
    pollCount += 1;
    if (busy) {
      sawBusy = true;
      idleStreak = 0;
      domEmptyStreak = 0;
    } else {
      idleStreak += 1;
      if (!reply) domEmptyStreak += 1;
      else domEmptyStreak = 0;
    }

    // If Rovo looks idle but the DOM scraper keeps returning nothing, USE
    // VISION to read what's on the page — exactly what a human would do. Try
    // every 4 idle-empty polls (~16s), and only while privacy mode is off.
    if (
      !busy &&
      !reply &&
      domEmptyStreak >= 4 &&
      visionReadAttempts < 3 &&
      isPageVisionAllowed()
    ) {
      visionReadAttempts += 1;
      onStatus?.(`👁 DOM came back empty ${domEmptyStreak}×. Reading the page visually (vision attempt ${visionReadAttempts}/3)…`);
      try {
        const shot = await captureAiTab(tabId);
        if (shot) {
          const seen = await describeImageRemote({
            dataUrl: shot,
            name: `${via} chat`,
            prompt:
              `This is a screenshot of the ${via} AI chat. Transcribe the most recent assistant/AI reply ` +
              `shown — the LATEST answer text, including paragraphs, lists, headings, and any numbered ` +
              `or bulleted points. Do NOT include the user's question, the input box placeholder, ` +
              `buttons, source chips, or UI chrome. Return ONLY the reply text, fully and verbatim. ` +
              `If the assistant hasn't started replying yet, return exactly the word "EMPTY".`,
          });
          const cleaned = (seen || "").trim();
          if (cleaned && !/^empty$/i.test(cleaned) && cleaned.length >= 40) {
            reply = cleaned;
            if (reply !== lastReply) {
              lastReply = reply;
              sawReply = true;
              stableSince = Date.now();
            }
            onStatus?.(`👁 Vision read ${reply.length} chars — using that`);
          } else {
            onStatus?.(`👁 Vision saw no reply yet — keep watching`);
          }
        }
      } catch (visionErr) {
        onStatus?.(`👁 Vision read failed: ${visionErr.message || "?"}`);
      }
    }

    // Stream the live reply text to the side panel so the user can SEE what
    // the AI is reading from the page in real time — full text, not truncated.
    // Fall back to lastReply so a flicker of DOM-empty mid-stream doesn't
    // blank the preview (especially when vision provided the text earlier).
    const displayText = reply || lastReply;
    const phaseKey = busy ? "thinking" : displayText ? "reading" : "watching";
    onReply?.({ text: displayText, busy, phase: phaseKey });

    // Short status line for the vision log.
    const preview = reply
      ? `: "${reply.slice(0, 50).replace(/\s+/g, " ")}${reply.length > 50 ? "…" : ""}"`
      : "";
    const candDiag =
      !busy && !reply && r?.candidatesFound !== undefined
        ? ` · scanned ${r.candidatesFound} blocks`
        : "";
    const idleNote =
      !busy && sawReply
        ? ` · idle ${idleStreak}/${IDLE_CONFIRMS_NEEDED}`
        : "";
    const phase = busy
      ? "⏳ thinking"
      : sawReply
        ? `✓ reading ${reply.length} chars${preview}${idleNote}${Date.now() - stableSince > 2000 ? " · settling…" : ""}`
        : `👀 watching${candDiag}…`;
    onStatus?.(`🔄 Poll ${pollCount} · ${phase}`);

    const stable = Date.now() - stableSince > STABLE_MS;
    // Done when: we've seen a reply + Rovo has been idle for ≥N consecutive
    // polls + the reply text has been stable for the quiet window. The
    // idle-streak requirement is the "give Rovo time like a human" guard —
    // a single idle blip mid-generation no longer settles the answer.
    if (sawReply && !busy && idleStreak >= IDLE_CONFIRMS_NEEDED && stable && lastReply) break;
    if (Date.now() > deadline) {
      timedOut = !lastReply || (sawBusy && !stable);
      onStatus?.("⏱️ Timed out — returning partial reply");
      break;
    }
    await abortableSleep(4000); // slower, more human cadence
  }

  let reply = lastReply;
  let read = "dom";
  // Screenshot "eyes" fallback only if it finished but DOM text failed.
  if (!timedOut && isWeakReply(reply) && isPageVisionAllowed()) {
    onStatus?.("👁 DOM text empty — taking screenshot…");
    const shot = await captureAiTab(tabId);
    if (shot) {
      const seen = await describeImageRemote({
        dataUrl: shot,
        name: `${via} chat`,
        prompt:
          `This is a screenshot of the ${via} AI chat. Transcribe the most recent assistant/AI reply ` +
          `shown (the last answer, not the question or UI chrome). Return ONLY that reply text, fully ` +
          `and verbatim, including any lists or numbers. If it is still loading, say "still loading".`,
      });
      if (seen && seen.trim() && !/still loading/i.test(seen)) {
        reply = seen.trim();
        read = "vision";
        onStatus?.(`👁 Vision captured ${reply.length} chars`);
      }
    }
  }

  if (debug) await runInFrames(tabId, ["clear", "", 0, false]).catch(() => {});
  if (!reply) reply = "(no reply captured)";
  onStatus?.(`✅ Done — ${reply.length} chars via ${read}`);
  return { reply, via, timedOut, read };
}

// Injected into the active page: flash a dashed outline around the WHOLE page to
// show the user the entire region the AI is reading. Self-removes after ~2.5s.
function PAGE_VISION_FLASH() {
  const ID = "__cia_pagevision";
  document.getElementById(ID)?.remove();
  const w = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, window.innerWidth);
  const h = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight);
  const box = document.createElement("div");
  box.id = ID;
  box.style.cssText =
    "position:absolute;top:0;left:0;width:" +
    w +
    "px;height:" +
    h +
    "px;z-index:2147483646;pointer-events:none;box-sizing:border-box;border:3px dashed #16a34a;border-radius:8px;transition:opacity .5s ease;";
  const lab = document.createElement("div");
  lab.style.cssText =
    "position:fixed;top:10px;left:10px;background:#16a34a;color:#fff;font:700 12px/1.5 system-ui,sans-serif;padding:4px 10px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.3);";
  lab.textContent = "👁 AI is reading this entire page";
  box.appendChild(lab);
  (document.body || document.documentElement).appendChild(box);
  setTimeout(() => {
    box.style.opacity = "0";
    setTimeout(() => box.remove(), 500);
  }, 2200);
}

/** Flash a whole-page outline on the active tab to show what the AI reads. */
export async function flashPageVision() {
  if (!isWholePageVision() || !isPageVisionAllowed()) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: PAGE_VISION_FLASH });
  } catch {
    /* ignore */
  }
}
