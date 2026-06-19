import { useCallback, useEffect, useRef, useState } from "react";
import {
  SessionExpiredError,
  createConversation,
  deleteConversation,
  getAuthMe,
  getConversation,
  listConversations,
  login,
  logout,
  rateMessage,
  regenerateChat,
  register,
  pingHealth,
  streamChat,
  relayPlanStep,
  relayConclude,
} from "../lib/api.js";
import { openWebApp, openPopoutWindow } from "../lib/storage.js";
import { pickPageContextForApi } from "../lib/pageContextPayload.js";
import { capturePageView, getPageContext } from "../lib/pageContext.js";
import { detectPageAi, relayToPageAi, flashPageVision } from "../lib/pageAiRelay.js";
import {
  getSettings,
  saveSettings,
  applySettings,
  applyTheme,
  applyDensity,
  subscribeSettings,
  isPageVisionAllowed,
} from "../lib/settings.js";
import { LoginScreen } from "./components/LoginScreen.jsx";
import { ConversationPicker } from "./components/ConversationPicker.jsx";
import { MessageList } from "./components/MessageList.jsx";
import { Composer } from "./components/Composer.jsx";
import { ComposerToolbar } from "./components/ComposerToolbar.jsx";
import { TopBar } from "./components/TopBar.jsx";
import { Banner } from "./components/Banner.jsx";
import { SettingsPanel } from "./components/SettingsPanel.jsx";
import { ForumsPanel } from "./components/ForumsPanel.jsx";
import { ChecklistPanel } from "./components/ChecklistPanel.jsx";
import { GoLivePanel } from "./components/GoLivePanel.jsx";
import { NotepadPanel } from "./components/NotepadPanel.jsx";
import { AppLauncher, LayersIcon } from "./components/AppLauncher.jsx";
import { APP_CATALOG, computeAppBadges } from "../lib/apps.js";
import { HomeScreen } from "./HomeScreen.jsx";

const WELCOME_MESSAGE = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm your CiA Transition Assistant. Ask me anything, or right-click selected text on any page to send it to me.",
  metadata: {},
};

function localId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeContextForSend(context) {
  if (!context) return undefined;
  const payload = pickPageContextForApi(context);
  if (payload) return payload;
  if (typeof context.screenshot === "string" && context.screenshot.length > 550_000) {
    return pickPageContextForApi({ ...context, screenshot: undefined });
  }
  return undefined;
}

export function SidePanelApp() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [healthState, setHealthState] = useState({ ok: null });
  const [threads, setThreads] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [pageContext, setPageContext] = useState(null);
  const [includeContext, setIncludeContext] = useState(true);
  const [capturingPage, setCapturingPage] = useState(false);
  const [fallbackHint, setFallbackHint] = useState(null);
  const [view, setView] = useState("home"); // "home" | "chat" | "notepad" | "settings"
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [showForums, setShowForums] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showGoLive, setShowGoLive] = useState(false);
  const [appBadges, setAppBadges] = useState({});
  const [forumDraft, setForumDraft] = useState(null);
  const [provider, setProvider] = useState(() => getSettings().provider ?? "server");
  const [reasoning, setReasoning] = useState(() => getSettings().reasoning ?? "auto");
  const [sources, setSources] = useState(() => getSettings().sources ?? { webSearch: false, companyKnowledge: true });
  const [connectorSources, setConnectorSources] = useState(() => getSettings().connectorSources ?? []);
  const [relay, setRelay] = useState({ mode: "off", target: null, busy: false, maxTurns: 1 }); // off | relay | agent
  const [attachments, setAttachments] = useState([]);
  const [visionLog, setVisionLog] = useState([]);
  const [livePreview, setLivePreview] = useState(null); // { text, busy, phase, updatedAt }
  const [wholePageVision, setWholePageVision] = useState(() => getSettings().wholePageVision === true);
  const relayStopRef = useRef(false);
  const messagesRef = useRef(null);
  const abortRef = useRef(null);
  const latestMessagesRef = useRef(messages);
  latestMessagesRef.current = messages;

  const handleProviderChange = (value) => { setProvider(value); saveSettings({ provider: value }); };
  const handleReasoningChange = (value) => { setReasoning(value); saveSettings({ reasoning: value }); };
  const handleSourcesChange = (value) => { setSources(value); saveSettings({ sources: value }); };
  const handleConnectorSourcesChange = (value) => { setConnectorSources(value); saveSettings({ connectorSources: value }); };

  const addVisionLog = useCallback((msg) => {
    const time = new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setVisionLog((prev) => [...prev.slice(-49), { time, msg }]);
  }, []);

  const updateLivePreview = useCallback((snap) => {
    setLivePreview({ ...snap, updatedAt: Date.now() });
  }, []);

  const refreshPageContext = useCallback(async () => {
    // Privacy mode: never read the page.
    if (!isPageVisionAllowed()) {
      setPageContext(null);
      return;
    }
    const ctx = await getPageContext({ includeExcerpt: includeContext });
    setPageContext((current) => ({
      ...ctx,
      screenshot: current?.screenshot ?? null,
      capturedAt: current?.capturedAt ?? null,
    }));
  }, [includeContext]);

  const handleCapturePage = useCallback(async () => {
    if (!isPageVisionAllowed()) {
      setError("Page vision is off — turn off Privacy mode in Settings to capture the page.");
      return;
    }
    setCapturingPage(true);
    setError("");
    try {
      const ctx = await capturePageView();
      void flashPageVision();
      setPageContext(ctx);
      setIncludeContext(true);
      if (ctx.screenshot) {
        chrome.storage?.local?.set?.({ lastPageCaptureHint: ctx.capturedAt }).catch(() => {});
      }
    } catch (captureError) {
      setError(captureError.message ?? "Failed to capture page");
    } finally {
      setCapturingPage(false);
    }
  }, []);

  const handleClearScreenshot = useCallback(() => {
    setPageContext((current) =>
      current ? { ...current, screenshot: null, capturedAt: null, captureError: null } : current,
    );
    if (window.parent !== window) {
      window.parent.postMessage({ type: "CIA_CAPTURE_CLEARED" }, "*");
    }
  }, []);

  const loadThreads = useCallback(async () => {
    if (standaloneMode) {
      const { getLocalThreads } = await import("../lib/storage.js");
      const list = await getLocalThreads();
      setThreads(list);
      return list;
    }
    const list = await listConversations();
    setThreads(list);
    return list;
  }, [standaloneMode]);

  const loadConversation = useCallback(async (id) => {
    if (!id) {
      setMessages([WELCOME_MESSAGE]);
      return;
    }
    if (standaloneMode) {
      const { getLocalThread } = await import("../lib/storage.js");
      const thread = await getLocalThread(id);
      setMessages(thread?.messages?.length ? thread.messages : [WELCOME_MESSAGE]);
      return;
    }
    const conversation = await getConversation(id);
    setMessages(
      conversation.messages.length > 0 ? conversation.messages : [WELCOME_MESSAGE],
    );
  }, [standaloneMode]);

  const ensureConversation = useCallback(
    async (existing) => {
      if (existing && existing.length > 0) {
        return existing[0];
      }
      const created = await createConversation("New chat");
      const refreshed = await listConversations();
      setThreads(refreshed);
      return created;
    },
    [],
  );

  const bootstrap = useCallback(async () => {
    setAuthLoading(true);
    setError("");
    try {
      const me = await getAuthMe();
      const health = await pingHealth();
      setHealthState(health);

      if (!me?.authenticated) {
        setUser(null);
        return;
      }

      const isStandalone = me.standalone === true;
      setStandaloneMode(isStandalone);
      setUser({
        email: me.user?.email ?? me.email ?? "signed-in",
        displayName: me.user?.displayName ?? me.displayName ?? null,
        role: me.role ?? me.user?.role ?? "user",
        plugins: me.plugins ?? me.user?.plugins ?? [],
      });

      if (isStandalone) {
        // In standalone/Worker mode: create a local conversation ID, don't fetch history from server
        const { getLocalThreads } = await import("../lib/storage.js");
        const localList = await getLocalThreads();
        setThreads(localList);
        const newId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setConversationId(newId);
        setMessages([WELCOME_MESSAGE]);
        return;
      }

      const list = await loadThreads();
      const active = await ensureConversation(list);
      setConversationId(active.id);
      await loadConversation(active.id);
    } catch (bootError) {
      console.warn("[CiA] bootstrap failed", bootError);
      setError(bootError.message ?? "Could not contact the API. Open the extension options to update the API URL.");
    } finally {
      setAuthLoading(false);
    }
  }, [ensureConversation, loadConversation, loadThreads]);

  // While this docked side panel / popout window is open, tell the background so
  // it can hide the floating bubble on pages. The embedded floating-widget iframe
  // (carries ?embedded=1 and runs inside a frame) must NOT count.
  useEffect(() => {
    let port;
    try {
      const embedded =
        new URLSearchParams(window.location.search).has("embedded") || window.top !== window;
      if (!embedded && chrome?.runtime?.connect) {
        port = chrome.runtime.connect({ name: "cia-panel-presence" });
      }
    } catch {
      /* ignore */
    }
    return () => {
      try {
        port?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    void bootstrap();
    void refreshPageContext();

    // Pick up any "fell-back to side panel" hint from the background SW.
    chrome.storage?.local?.get?.(["sidePanelFallback"], (data) => {
      const hint = data?.sidePanelFallback;
      if (hint && Date.now() - (hint.createdAt ?? 0) < 30_000) {
        setFallbackHint(hint);
        chrome.storage.local.remove("sidePanelFallback");
      }
    });

    const handleTabUpdate = () => void refreshPageContext();
    chrome.tabs?.onActivated?.addListener(handleTabUpdate);
    chrome.tabs?.onUpdated?.addListener(handleTabUpdate);
    return () => {
      chrome.tabs?.onActivated?.removeListener(handleTabUpdate);
      chrome.tabs?.onUpdated?.removeListener(handleTabUpdate);
    };
  }, [bootstrap, refreshPageContext]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, pending]);

  // Apply theme colors on mount and live-update whenever settings change.
  useEffect(() => {
    applySettings();
    return subscribeSettings((next) => { applyTheme(next.theme); applyDensity(next.density); });
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const handleMessage = (message) => {
      if (message?.type === "CIA_PREFILL_FROM_SELECTION" && message.selection) {
        const prefill = `From this page (${message.title || message.url || "current tab"}):\n\n"${message.selection}"\n\nPlease analyse this in the CiA context.`;
        setInput((current) => (current ? current : prefill));
        setIncludeContext(true);
        void refreshPageContext();
      }
    };

    chrome.runtime?.onMessage?.addListener(handleMessage);

    // Also listen for postMessage from the floating widget host (when running
    // embedded in an iframe inside a content script).
    const handleWindowMessage = (event) => {
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.type === "CIA_PREFILL_FROM_SELECTION") {
        handleMessage(event.data);
      }
      if (event.data.type === "CIA_PAGE_CAPTURE" && event.data.context) {
        setPageContext(event.data.context);
        setIncludeContext(true);
        if (event.data.context.captureError) {
          setError(event.data.context.captureError);
        } else {
          setError("");
        }
      }
    };
    window.addEventListener("message", handleWindowMessage);

    chrome.storage?.local?.get?.(["pendingPrefill"], (data) => {
      const queued = data?.pendingPrefill;
      if (queued?.selection && Date.now() - (queued.createdAt ?? 0) < 60_000) {
        handleMessage({
          type: "CIA_PREFILL_FROM_SELECTION",
          ...queued,
        });
        chrome.storage.local.remove("pendingPrefill");
      }
    });

    return () => {
      chrome.runtime?.onMessage?.removeListener(handleMessage);
      window.removeEventListener("message", handleWindowMessage);
    };
  }, [user, refreshPageContext]);

  const handleLogin = async (email, password) => {
    await login(email, password);
    await bootstrap();
  };

  const handleRegister = async ({ email, password, displayName }) => {
    await register({ email, password, displayName });
    await bootstrap();
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (logoutError) {
      console.warn("[CiA] logout failed", logoutError);
    }
    setUser(null);
    setMessages([WELCOME_MESSAGE]);
    setThreads([]);
    setConversationId(null);
  };

  const handleSelectThread = async (id) => {
    if (id === conversationId || pending) return;
    setError("");
    setConversationId(id);
    await loadConversation(id);
  };

  const handleNewThread = async () => {
    if (standaloneMode) {
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setConversationId(id);
      setMessages([WELCOME_MESSAGE]);
      setError("");
      return;
    }
    const created = await createConversation("New chat");
    await loadThreads();
    setConversationId(created.id);
    setMessages([WELCOME_MESSAGE]);
    setError("");
  };

  // Bulk delete from the manage overlay; keep the active conversation valid.
  const handleBulkDeleteThreads = async (ids) => {
    if (pending) {
      setError("Wait for the current response to finish before deleting chats.");
      return;
    }
    setError("");
    if (standaloneMode) {
      const { deleteLocalThread } = await import("../lib/storage.js");
      for (const id of ids) await deleteLocalThread(id);
    } else {
      for (const id of ids) {
        try {
          await deleteConversation(id);
        } catch {
          /* keep deleting the rest */
        }
      }
    }
    const refreshed = await loadThreads();
    if (ids.includes(conversationId)) {
      if (refreshed.length > 0) {
        setConversationId(refreshed[0].id);
        await loadConversation(refreshed[0].id);
      } else {
        setConversationId(null);
        setMessages([WELCOME_MESSAGE]);
      }
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    relayStopRef.current = true; // halt an in-progress agent loop after the current turn
    addVisionLog("🛑 Stop requested — bailing out of current operation…");
    setPending(false);
  };

  const lastAssistantId =
    [...messages].reverse().find((m) => m.role === "assistant" && m.id !== "welcome")?.id ?? null;

  const handleRate = async (messageId, rating) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              metadata: {
                ...message.metadata,
                feedback: message.metadata?.feedback === rating ? null : rating,
              },
            }
          : message,
      ),
    );
    // Only server-persisted messages have stable ids; skip optimistic-only locals.
    if (messageId.startsWith("local-")) return;
    try {
      await rateMessage(messageId, rating);
    } catch {
      /* keep the optimistic state; feedback is best-effort */
    }
  };

  const handlePostToForum = (message) => {
    const content = message?.content?.trim();
    if (!content) return;
    const firstLine = content.split("\n").find((line) => line.trim()) ?? "Shared from chat";
    setForumDraft({
      title: firstLine.replace(/[#*`>_]/g, "").trim().slice(0, 80) || "Shared from chat",
      body: content,
    });
    setShowForums(true);
  };

  const handleRegenerate = async () => {
    if (!conversationId || pending) return;
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.id !== "welcome");
    if (!lastAssistant) return;

    setError("");
    setPending(true);

    // In standalone (Worker) mode the server keeps no history, so send the prior
    // turns (minus the assistant message we're regenerating) for context.
    const regenHistory = standaloneMode
      ? messages.filter((m) => m.id !== "welcome" && m.id !== lastAssistant.id && m.role && m.content)
      : undefined;

    const assistantId = localId("local-assistant");
    setMessages((current) => [
      ...current.filter((m) => m.id !== lastAssistant.id && m.id !== "welcome"),
      { id: assistantId, role: "assistant", content: "", metadata: {} },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    let streamed = "";
    try {
      await regenerateChat({
        conversationId,
        history: regenHistory,
        provider,
        reasoning,
        signal: controller.signal,
        onToken: (token) => {
          streamed += token;
          setMessages((current) =>
            current.map((m) => (m.id === assistantId ? { ...m, content: streamed } : m)),
          );
        },
        onArtifacts: (payload) => {
          setMessages((current) =>
            current.map((m) =>
              m.id === assistantId ? { ...m, metadata: { ...m.metadata, artifacts: payload } } : m,
            ),
          );
        },
        onInsights: (payload) => {
          setMessages((current) =>
            current.map((m) =>
              m.id === assistantId ? { ...m, metadata: { ...m.metadata, insights: payload } } : m,
            ),
          );
        },
        onComplete: async () => {
          if (standaloneMode) {
            const { saveLocalThread } = await import("../lib/storage.js");
            const cur = latestMessagesRef.current.filter((m) => m.id !== "welcome");
            const firstUser = cur.find((m) => m.role === "user");
            const title = (firstUser?.content || "New chat").replace(/\s+/g, " ").trim().slice(0, 40);
            await saveLocalThread({ id: conversationId, title, messages: cur, updatedAt: new Date().toISOString() });
            await loadThreads();
          } else {
            await loadConversation(conversationId);
            await loadThreads();
          }
        },
      });
    } catch (regenError) {
      if (regenError instanceof SessionExpiredError) {
        setUser(null);
        setError("Your session expired. Please sign in again.");
      } else if (regenError.name !== "AbortError") {
        setError(regenError.message ?? "Failed to regenerate");
      }
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  };

  // Detect a page AI and turn relay on (one-shot mode); click again to turn off.
  const handleToggleRelay = async () => {
    if (relay.mode !== "off") {
      setRelay({ mode: "off", target: null, busy: false });
      setVisionLog([]);
      setLivePreview(null);
      return;
    }
    setRelay((r) => ({ ...r, busy: true }));
    try {
      const target = await detectPageAi();
      if (target) {
        setRelay({ mode: "relay", target, busy: false });
        setError("");
      } else {
        setRelay({ mode: "off", target: null, busy: false });
        setError(
          "No Rovo / Copilot / ChatGPT chat found in an open Chrome tab. Open it as a browser tab " +
            "(e.g. m365.cloud.microsoft for Copilot) — the relay can't reach desktop apps like the " +
            "Teams/Copilot or VS Code clients.",
        );
      }
    } catch (e) {
      setRelay({ mode: "off", target: null, busy: false });
      setError(e.message || "Couldn't access the page to detect an AI chat.");
    }
  };

  const ensureConvId = async () => {
    if (conversationId) return conversationId;
    const created = await createConversation("New chat");
    setConversationId(created.id);
    return created.id;
  };

  // One-shot: type the message into the page AI and bring back its reply.
  const handleRelay = async (content) => {
    await ensureConvId();
    setError("");
    setPending(true);
    setInput("");
    const userId = localId("local-user");
    const assistantId = localId("local-assistant");
    const viaName = relay.target?.name || "page AI";
    setMessages((current) => [
      ...current.filter((message) => message.id !== "welcome"),
      { id: userId, role: "user", content, metadata: {} },
      { id: assistantId, role: "assistant", content: `*Asking ${viaName} on the page…*`, metadata: {} },
    ]);
    const relayController = new AbortController();
    abortRef.current = relayController;
    try {
      const { reply, via } = await relayToPageAi(content, {
        signal: relayController.signal,
        onStatus: addVisionLog,
        onReply: updateLivePreview,
      });
      setMessages((current) =>
        current.map((m) => (m.id === assistantId ? { ...m, content: `**↳ via ${via}**\n\n${reply}` } : m)),
      );
    } catch (e) {
      if (e.name === "AbortError" || relayStopRef.current) {
        setMessages((current) =>
          current.map((m) => (m.id === assistantId ? { ...m, content: `_(Relay stopped by user.)_` } : m)),
        );
        addVisionLog("✋ Relay stopped");
      } else {
        setMessages((current) =>
          current.map((m) => (m.id === assistantId ? { ...m, content: `⚠️ Relay failed: ${e.message}` } : m)),
        );
        setError(e.message || "Relay failed");
      }
    } finally {
      if (abortRef.current === relayController) abortRef.current = null;
      setPending(false);
    }
  };

  // Agent: our AI holds a multi-turn conversation with the page AI to reach the goal.
  const handleAgentRelay = async (goal) => {
    await ensureConvId();
    setError("");
    setPending(true);
    setInput("");
    const userId = localId("local-user");
    const assistantId = localId("local-assistant");
    const partnerName = relay.target?.name || "the page AI";
    const maxTurns = relay.maxTurns || 4;
    relayStopRef.current = false;
    // One AbortController for the whole agent run — Stop calls .abort() and
    // every long-running await (planner stream + relayToPageAi polling) bails.
    const agentController = new AbortController();
    abortRef.current = agentController;
    setMessages((current) => [
      ...current.filter((message) => message.id !== "welcome"),
      { id: userId, role: "user", content: goal, metadata: {} },
      { id: assistantId, role: "assistant", content: `*Working with ${partnerName}…*`, metadata: {} },
    ]);

    const transcript = [];
    const log = [];
    const render = (status, final) => {
      const steps = log
        .map(
          (s, i) =>
            `**${i + 1}. Asked ${partnerName}:** ${s.q}\n\n> ${(s.a || "…").replace(/\n/g, "\n> ")}`,
        )
        .join("\n\n");
      const head = final
        ? `**↳ via ${partnerName}** (agent · ${log.length} turn${log.length === 1 ? "" : "s"})\n\n${final}`
        : `*${status}*`;
      return steps ? `${head}\n\n---\n\n**Exchange with ${partnerName}:**\n\n${steps}` : head;
    };
    const update = (status, final) =>
      setMessages((current) =>
        current.map((m) => (m.id === assistantId ? { ...m, content: render(status, final) } : m)),
      );

    // Always finish with a clean, synthesised conclusion (never raw JSON).
    const conclude = async (note = "") => {
      let final = "";
      try {
        final = await relayConclude({ goal, transcript, partnerName });
      } catch {
        final = "";
      }
      if (!final) {
        final = transcript.length
          ? `I couldn't synthesise a clean conclusion. Here's the latest from ${partnerName}:\n\n> ${
              (transcript[transcript.length - 1]?.text || "(no reply)").replace(/\n/g, "\n> ")
            }`
          : `I couldn't get a usable answer from ${partnerName}.`;
      }
      return note ? `${note}\n\n${final}` : final;
    };

    // Two strings are "essentially the same question" if they overlap a lot
    // after normalisation. Used to halt agent loops that keep re-asking and
    // would otherwise cause duplicate submissions to the page AI.
    const isNearDuplicate = (a, b) => {
      const n = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      const na = n(a);
      const nb = n(b);
      if (!na || !nb) return false;
      if (na === nb) return true;
      // Substring containment — one question almost entirely inside the other
      // (catches "Hey Rovo X" vs "Hey Rovo X please clarify").
      const shorter = na.length < nb.length ? na : nb;
      const longer = na.length < nb.length ? nb : na;
      if (shorter.length >= 30 && longer.includes(shorter)) return true;
      // Jaccard on word tokens — 0.80+ means it's effectively the same prompt.
      const ta = new Set(na.split(" "));
      const tb = new Set(nb.split(" "));
      const inter = [...ta].filter((w) => tb.has(w)).length;
      const union = new Set([...ta, ...tb]).size;
      return union > 0 && inter / union >= 0.80;
    };

    try {
      let final = "";
      for (let turn = 1; turn <= maxTurns; turn += 1) {
        if (relayStopRef.current) break;
        update(`Planning step ${turn}…`);
        const step = await relayPlanStep({ goal, transcript, turn, maxTurns, partnerName });
        // A "done" with real content ends it; otherwise we synthesise below.
        if (step.action === "done" && step.final && !step.needsConclusion) {
          final = step.final;
          break;
        }
        if (step.action === "done") break; // needs conclusion → synthesise after loop

        // Loop guard: if the planner is re-asking a question it already asked,
        // we MUST NOT send it again — that's how Rovo ends up with duplicate
        // submissions and an "An unknown error occurred". Halt on the FIRST
        // duplicate and synthesise from what we already have.
        const recentAsks = transcript.filter((t) => t.from === "agent").map((t) => t.text);
        if (recentAsks.some((prev) => isNearDuplicate(prev, step.message))) {
          addVisionLog("🔁 Planner tried to re-ask a question — halting to avoid a duplicate submission");
          update("Halting loop — building conclusion (planner repeated itself)…");
          final = await conclude(
            `_(${partnerName} already answered that — I stopped before sending a duplicate message.)_`,
          );
          break;
        }

        log.push({ q: step.message, a: "" });
        update(`Asked ${partnerName} (turn ${turn}) — waiting for it to finish (can take a few minutes)…`);
        const { reply, read, timedOut } = await relayToPageAi(step.message, {
          signal: agentController.signal,
          onStatus: addVisionLog,
          onReply: updateLivePreview,
        });
        transcript.push({ from: "agent", text: step.message });
        transcript.push({ from: "rovo", text: reply });
        log[log.length - 1].a = read === "vision" ? `${reply}\n\n_(read visually 👁)_` : reply;
        if (timedOut) {
          update("Building conclusion…");
          final = await conclude(
            `_(${partnerName} didn't fully finish in time — conclusion is based on what it returned so far. Tip: try "Quick answers" mode.)_`,
          );
          break;
        }
        if (relayStopRef.current) break;
        update(`Read ${partnerName}'s reply — checking it…`);
      }
      if (!final) {
        update("Building conclusion…");
        final = await conclude(relayStopRef.current ? "_(Stopped early.)_" : "");
      }
      update("", final);
    } catch (e) {
      // Clean stop, not a real failure — render a friendly "stopped" message
      // instead of a scary error banner.
      if (e.name === "AbortError" || relayStopRef.current) {
        addVisionLog("✋ Agent run stopped");
        update("", `_(Agent run stopped by user.)_${log.length ? `\n\n---\n\n**Exchange so far:**\n\n${log
          .map((s, i) => `**${i + 1}. Asked ${partnerName}:** ${s.q}\n\n> ${(s.a || "(no reply)").replace(/\n/g, "\n> ")}`)
          .join("\n\n")}` : ""}`);
      } else {
        update("", `⚠️ Agent run failed: ${e.message}`);
        setError(e.message || "Agent run failed");
      }
    } finally {
      if (abortRef.current === agentController) abortRef.current = null;
      setPending(false);
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    const sendAttachments = attachments;
    if ((!content && sendAttachments.length === 0) || pending) return;

    // Route through the on-page AI when relay mode is active (text only).
    if (relay.mode === "agent" && relay.target && content) {
      await handleAgentRelay(content);
      return;
    }
    if (relay.mode === "relay" && relay.target && content) {
      await handleRelay(content);
      return;
    }

    let activeId = conversationId;
    if (!activeId) {
      if (standaloneMode) {
        activeId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setConversationId(activeId);
      } else {
        const created = await createConversation("New chat");
        activeId = created.id;
        setConversationId(activeId);
      }
    }

    setError("");
    setPending(true);
    setInput("");
    setAttachments([]);

    const userId = localId("local-user");
    const assistantId = localId("local-assistant");

    const attachNote = sendAttachments.length
      ? `\n\n📎 ${sendAttachments.map((a) => a.name).join(", ")}`
      : "";
    setMessages((current) => [
      ...current.filter((message) => message.id !== "welcome"),
      { id: userId, role: "user", content: `${content}${attachNote}`, metadata: {} },
      { id: assistantId, role: "assistant", content: "", metadata: {} },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    let streamed = "";
    try {
      // Privacy mode: send no page context at all.
      const rawCtx = !isPageVisionAllowed()
        ? null
        : includeContext
          ? pageContext ?? (await getPageContext({ includeExcerpt: true }))
          : pageContext?.screenshot
            ? {
                url: pageContext.url,
                title: pageContext.title,
                screenshot: pageContext.screenshot,
              }
            : null;
      const ctx = sanitizeContextForSend(rawCtx);
      // Entire-page vision debug: flash a whole-page outline showing what we read.
      if (ctx) void flashPageVision();
      if (
        rawCtx?.screenshot &&
        typeof rawCtx.screenshot === "string" &&
        rawCtx.screenshot.length > 550_000 &&
        !ctx?.screenshot
      ) {
        setError(
          "Screenshot was too large to send. Page text context is still included — try recapturing after zooming out.",
        );
      }
      // In standalone mode, send full conversation history so the Worker has context
      const historyForWorker = standaloneMode
        ? messages.filter((m) => m.id !== "welcome" && m.role && m.content)
        : undefined;

      await streamChat({
        conversationId: activeId,
        history: historyForWorker,
        message: content || "(see attached)",
        attachments: sendAttachments.map(({ name, type, encoding, content: c }) => ({
          name,
          type,
          ...(encoding ? { encoding } : {}),
          content: c,
        })),
        pageContext: ctx,
        provider,
        reasoning,
        sources,
        connectorSources,
        signal: controller.signal,
        onToken: (token) => {
          streamed += token;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: streamed } : message,
            ),
          );
        },
        onArtifacts: (payload) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, metadata: { ...message.metadata, artifacts: payload } }
                : message,
            ),
          );
        },
        onInsights: (payload) => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, metadata: { ...message.metadata, insights: payload } }
                : message,
            ),
          );
        },
        onComplete: async () => {
          handleClearScreenshot();
          if (standaloneMode) {
            // Persist the conversation locally so it appears in the picker.
            const { saveLocalThread } = await import("../lib/storage.js");
            const cur = latestMessagesRef.current.filter((m) => m.id !== "welcome");
            const firstUser = cur.find((m) => m.role === "user");
            const title = (firstUser?.content || "New chat").replace(/\s+/g, " ").trim().slice(0, 40);
            await saveLocalThread({
              id: activeId,
              title,
              messages: cur,
              updatedAt: new Date().toISOString(),
            });
            await loadThreads();
          } else {
            await loadConversation(activeId);
            await loadThreads();
          }
        },
      });
    } catch (sendError) {
      if (sendError instanceof SessionExpiredError) {
        setUser(null);
        setError("Your session expired. Please sign in again.");
      } else if (sendError.name === "AbortError") {
        // user cancelled — keep partial response
      } else {
        setError(sendError.message ?? "Failed to send message");
      }
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  };

  // Open a given app by id — used by the launcher, Quick actions and the
  // floating-bubble quick-launch (deep link). Declared before the early returns
  // below so hook order stays stable (Rules of Hooks).
  const openApp = useCallback((id) => {
    switch (id) {
      case "chat": void handleNewThread(); setView("chat"); break;
      case "notepad": setView("notepad"); break;
      case "companion": setShowChecklist(true); break;
      case "golive": setShowGoLive(true); break;
      case "settings": setView("settings"); break;
      case "apps": setView("apps"); break;
      default: break;
    }
  }, [handleNewThread]);

  // Recompute launcher badges on mount and whenever the underlying data changes.
  useEffect(() => {
    let alive = true;
    const refresh = () => computeAppBadges().then((b) => { if (alive) setAppBadges(b); }).catch(() => {});
    refresh();
    const handler = (changes, area) => {
      if (area === "local" && (changes.goLiveData || changes.checklistData || changes.notes)) refresh();
    };
    chrome.storage?.onChanged?.addListener?.(handler);
    return () => { alive = false; chrome.storage?.onChanged?.removeListener?.(handler); };
  }, [showChecklist, showGoLive]);

  // Floating bubble quick-launch: it writes ciaPendingApp, we act on it here.
  useEffect(() => {
    if (!user) return undefined;
    const act = (pending) => {
      if (pending?.id && Date.now() - (pending.at ?? 0) < 60_000) {
        openApp(pending.id);
        chrome.storage?.local?.remove?.("ciaPendingApp");
      }
    };
    chrome.storage?.local?.get?.(["ciaPendingApp"], (d) => act(d?.ciaPendingApp));
    const handler = (changes, area) => {
      if (area === "local" && changes.ciaPendingApp?.newValue) act(changes.ciaPendingApp.newValue);
    };
    chrome.storage?.onChanged?.addListener?.(handler);
    return () => chrome.storage?.onChanged?.removeListener?.(handler);
  }, [user, openApp]);

  if (authLoading) {
    return (
      <div className="cia-ext-shell">
        <div className="cia-ext-loading">Connecting to CiA Assistant…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="cia-ext-shell">
        <TopBar healthState={healthState} compact />
        <LoginScreen onLogin={handleLogin} onRegister={handleRegister} healthState={healthState} />
      </div>
    );
  }

  const chatView = (
    <div className="cia-ext-chat-view">
      <TopBar
        healthState={healthState}
        user={user}
        apps={[
          { label: "Companion", icon: "✅", onClick: () => setShowChecklist(true) },
          { label: "Go-Live", icon: "🚀", onClick: () => setShowGoLive(true) },
          // Forums temporarily disabled.
          { label: "Pop out", icon: "⤢", onClick: () => void openPopoutWindow() },
        ]}
      />

      <ConversationPicker
        threads={threads}
        activeId={conversationId}
        onSelect={handleSelectThread}
        onNew={handleNewThread}
        onBulkDelete={handleBulkDeleteThreads}
      />

      {fallbackHint ? (
        <FallbackBanner hint={fallbackHint} onDismiss={() => setFallbackHint(null)} />
      ) : null}

      {error ? <Banner tone="error" message={error} onDismiss={() => setError("")} /> : null}

      <MessageList
        ref={messagesRef}
        messages={messages}
        pending={pending}
        lastAssistantId={lastAssistantId}
        onRegenerate={() => void handleRegenerate()}
        onRate={handleRate}
        onPostToForum={handlePostToForum}
      />

      <ComposerToolbar
        sources={sources}
        onSourcesChange={handleSourcesChange}
        connectorSources={connectorSources}
        onConnectorSourcesChange={handleConnectorSourcesChange}
        reasoning={reasoning}
        onReasoningChange={handleReasoningChange}
        provider={provider}
        onProviderChange={handleProviderChange}
        onTopicSelect={(text) => {
          const prefix = includeContext && pageContext?.selection ? `${text} ${pageContext.selection}` : text;
          setInput(prefix);
        }}
        pageContext={pageContext}
        includeContext={includeContext}
        capturingPage={capturingPage}
        onToggleContext={() => setIncludeContext((value) => !value)}
        onRefreshContext={refreshPageContext}
        onCapturePage={() => void handleCapturePage()}
        onClearScreenshot={handleClearScreenshot}
        wholePageVision={wholePageVision}
        onToggleWholePageVision={() => {
          const next = !wholePageVision;
          setWholePageVision(next);
          saveSettings({ wholePageVision: next });
          if (next) void flashPageVision();
        }}
        disabled={pending}
      />

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        onStop={handleStop}
        pending={pending}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        onError={setError}
      />
    </div>
  );

  // Apps shown in the drag-and-drop launcher / Quick actions, with live badges.
  const launcherApps = APP_CATALOG.map((a) => ({
    ...a,
    badge: appBadges[a.id] ?? 0,
    onClick: () => openApp(a.id),
  }));

  return (
    <div className="cia-ext-shell cia-ext-with-nav">
      {/* Views */}
      {view === "home" && (
        <HomeScreen
          user={user}
          healthState={healthState}
          threads={threads}
          apps={launcherApps}
          onSelectThread={(id) => {
            void handleSelectThread(id);
            setView("chat");
          }}
        />
      )}

      {view === "chat" && chatView}

      {view === "apps" && (
        <div className="cia-ext-apps-view">
          <AppLauncher apps={launcherApps} />
        </div>
      )}

      {view === "notepad" && (
        <NotepadPanel
          onClose={() => setView("home")}
          onGenerate={(text, title) => {
            const reportPrompt = `Please generate a professional **Project Manager Status Report** based on the following project notes titled "${title}".\n\nInclude: executive summary, key accomplishments, current status, risks & issues, actions required, and next steps.\n\n---\n\n${text}`;
            setInput(reportPrompt);
            setView("chat");
          }}
        />
      )}

      {view === "settings" && (
        <SettingsPanel
          onClose={() => setView("home")}
          onOpenFullOptions={() => chrome.runtime.openOptionsPage?.()}
          user={user}
          standaloneMode={standaloneMode}
          onProfileUpdated={(updates) =>
            setUser((current) => (current ? { ...current, ...updates } : current))
          }
        />
      )}

      {/* Overlays that float above any view */}
      {showForums ? (
        <ForumsPanel
          initialDraft={forumDraft}
          onClose={() => {
            setShowForums(false);
            setForumDraft(null);
          }}
        />
      ) : null}

      {showChecklist ? <ChecklistPanel onClose={() => setShowChecklist(false)} /> : null}

      {showGoLive ? <GoLivePanel onClose={() => setShowGoLive(false)} /> : null}

      {/* Bottom navigation — with a raised centre button for the app launcher */}
      <nav className="cia-ext-bottom-nav" aria-label="Main navigation">
        {[
          { id: "home", icon: "🏠", label: "Home" },
          { id: "chat", icon: "💬", label: "Chat" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`cia-ext-nav-btn${view === tab.id ? " is-active" : ""}`}
            onClick={() => setView(tab.id)}
            aria-label={tab.label}
          >
            <span className="cia-ext-nav-icon">{tab.icon}</span>
            <span className="cia-ext-nav-label">{tab.label}</span>
          </button>
        ))}

        <button
          type="button"
          className={`cia-ext-nav-fab${view === "apps" ? " is-active" : ""}`}
          onClick={() => setView("apps")}
          aria-label="Apps"
          title="Apps"
        >
          <span className="cia-ext-nav-fab-btn"><LayersIcon size={24} /></span>
          <span className="cia-ext-nav-fab-label">Apps</span>
        </button>

        {[
          { id: "notepad", icon: "📝", label: "Notes" },
          { id: "settings", icon: "⚙️", label: "Settings" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`cia-ext-nav-btn${view === tab.id ? " is-active" : ""}`}
            onClick={() => setView(tab.id)}
            aria-label={tab.label}
          >
            <span className="cia-ext-nav-icon">{tab.icon}</span>
            <span className="cia-ext-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function LivePreview({ snap, target }) {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [snap?.text]);

  const phaseLabel =
    snap.phase === "waiting-idle"
      ? `Waiting — ${target} is still thinking`
      : snap.phase === "thinking"
        ? `${target} is generating…`
        : snap.phase === "reading"
          ? `Reading ${target}'s reply (${snap.text.length} chars)`
          : `Watching ${target}…`;

  const phaseIcon = snap.busy ? "⏳" : snap.text ? "👁" : "👀";
  const phaseClass = snap.busy ? "is-busy" : snap.text ? "is-reading" : "is-watching";

  return (
    <div className={`cia-ext-live-preview ${phaseClass}`} role="status" aria-live="polite">
      <div className="cia-ext-live-preview-head">
        <span className="cia-ext-live-preview-icon" aria-hidden="true">{phaseIcon}</span>
        <span className="cia-ext-live-preview-title">{phaseLabel}</span>
        <span className="cia-ext-live-preview-dot" aria-hidden="true" />
      </div>
      <div ref={bodyRef} className="cia-ext-live-preview-body">
        {snap.text ? snap.text : <span className="cia-ext-live-preview-empty">(no reply yet — watching the page)</span>}
      </div>
    </div>
  );
}

function VisionLog({ entries }) {
  const [collapsed, setCollapsed] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!collapsed) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, collapsed]);

  return (
    <div className="cia-ext-vision-log">
      <div
        className="cia-ext-vision-log-header"
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span>Vision log</span>
        <span>{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed ? (
        <div className="cia-ext-vision-log-entries">
          {entries.map((entry, i) => (
            <div key={i} className="cia-ext-vision-log-entry">
              <span className="log-time">{entry.time}</span>
              <span className="log-msg">{entry.msg}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      ) : null}
    </div>
  );
}

function FallbackBanner({ hint, onDismiss }) {
  const message =
    hint.reason === "restricted"
      ? "Browsers don't let extensions inject scripts on this page (chrome://, web store, extension pages). The floating chat bubble appears on regular web pages — try Google or any news site."
      : "Couldn't show the floating bubble on that page. The side panel works as a fallback, or open the full web app for the complete experience.";

  return (
    <div className="cia-ext-fallback-banner" role="status">
      <div className="cia-ext-fallback-banner-text">
        <strong>You're seeing the side panel because the floating widget can't run here.</strong>
        <span>{message}</span>
      </div>
      <div className="cia-ext-fallback-banner-actions">
        <button
          type="button"
          className="cia-ext-primary-btn"
          onClick={() => void openWebApp()}
        >
          Open web app ↗
        </button>
        <button type="button" className="cia-ext-banner-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
