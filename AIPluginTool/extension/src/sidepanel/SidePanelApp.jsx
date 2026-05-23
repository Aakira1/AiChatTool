import { useCallback, useEffect, useRef, useState } from "react";
import {
  SessionExpiredError,
  createConversation,
  getAuthMe,
  getConversation,
  listConversations,
  login,
  logout,
  pingHealth,
  streamChat,
} from "../lib/api.js";
import { openWebApp } from "../lib/storage.js";
import { getPageContext } from "../lib/pageContext.js";
import { LoginScreen } from "./components/LoginScreen.jsx";
import { ConversationPicker } from "./components/ConversationPicker.jsx";
import { MessageList } from "./components/MessageList.jsx";
import { Composer } from "./components/Composer.jsx";
import { PageContextChip } from "./components/PageContextChip.jsx";
import { TopBar } from "./components/TopBar.jsx";
import { Banner } from "./components/Banner.jsx";

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
  const [fallbackHint, setFallbackHint] = useState(null);
  const messagesRef = useRef(null);
  const abortRef = useRef(null);

  const refreshPageContext = useCallback(async () => {
    const ctx = await getPageContext({ includeExcerpt: false });
    setPageContext(ctx);
  }, []);

  const loadThreads = useCallback(async () => {
    const list = await listConversations();
    setThreads(list);
    return list;
  }, []);

  const loadConversation = useCallback(async (id) => {
    if (!id) {
      setMessages([WELCOME_MESSAGE]);
      return;
    }
    const conversation = await getConversation(id);
    setMessages(
      conversation.messages.length > 0 ? conversation.messages : [WELCOME_MESSAGE],
    );
  }, []);

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
      setUser(me.user ?? { email: me.email ?? "signed-in" });

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
    const created = await createConversation("New chat");
    await loadThreads();
    setConversationId(created.id);
    setMessages([WELCOME_MESSAGE]);
    setError("");
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(false);
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || pending) return;

    let activeId = conversationId;
    if (!activeId) {
      const created = await createConversation("New chat");
      activeId = created.id;
      setConversationId(activeId);
    }

    setError("");
    setPending(true);
    setInput("");

    const userId = localId("local-user");
    const assistantId = localId("local-assistant");

    setMessages((current) => [
      ...current.filter((message) => message.id !== "welcome"),
      { id: userId, role: "user", content, metadata: {} },
      { id: assistantId, role: "assistant", content: "", metadata: {} },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    let streamed = "";
    try {
      const ctx = includeContext ? pageContext ?? (await getPageContext()) : null;
      await streamChat({
        conversationId: activeId,
        message: content,
        attachments: [],
        pageContext: ctx,
        signal: controller.signal,
        onToken: (token) => {
          streamed += token;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: streamed } : message,
            ),
          );
        },
        onComplete: async () => {
          await loadConversation(activeId);
          await loadThreads();
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
        <LoginScreen onLogin={handleLogin} healthState={healthState} />
      </div>
    );
  }

  return (
    <div className="cia-ext-shell">
      <TopBar
        healthState={healthState}
        user={user}
        onLogout={handleLogout}
        onOpenOptions={() => chrome.runtime.openOptionsPage?.()}
      />

      <ConversationPicker
        threads={threads}
        activeId={conversationId}
        onSelect={handleSelectThread}
        onNew={handleNewThread}
      />

      {fallbackHint ? (
        <FallbackBanner hint={fallbackHint} onDismiss={() => setFallbackHint(null)} />
      ) : null}

      {error ? <Banner tone="error" message={error} onDismiss={() => setError("")} /> : null}

      <MessageList ref={messagesRef} messages={messages} pending={pending} />

      <PageContextChip
        context={pageContext}
        included={includeContext}
        onToggle={() => setIncludeContext((value) => !value)}
        onRefresh={refreshPageContext}
      />

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        onStop={handleStop}
        pending={pending}
      />
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
