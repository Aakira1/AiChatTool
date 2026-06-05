import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantArtifacts } from "../components/chat/AssistantArtifacts";
import { detectRequestedDocFormats } from "../lib/fileBlocks";
import { ChatComposer } from "../components/chat/ChatComposer";
import { CiaSidePanel } from "../components/chat/CiaSidePanel";
import { CiaThreadList } from "../components/chat/CiaThreadList";
import { MessageActions } from "../components/chat/MessageActions";
import { PostToForumModal } from "../components/chat/PostToForumModal";
import { UserMessageContent } from "../components/chat/UserMessageContent";
import { useToast } from "../components/ui/ToastProvider.jsx";
import {
  createConversation,
  deleteConversation,
  editChatMessage,
  getAnalyticsSummary,
  getConversation,
  listConversations,
  rateMessage,
  regenerateChat,
  streamChat,
  updateConversation,
} from "../lib/api";
import { downloadChatMarkdown } from "../lib/exportChat";
import { buildPromptsFromHotTopics, DEFAULT_HOT_TOPIC_PROMPTS } from "../lib/hotTopicPrompts";
import { getPageContext } from "../lib/pageContext";
import "../styles/cia-assistant.css";

const WELCOME_MESSAGE = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm your CiA Transition Assistant.",
  metadata: {},
};

function getLastAssistantInsights(messages) {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  return lastAssistant?.metadata?.insights ?? null;
}

export function ChatPage() {
  const toast = useToast();
  const [threads, setThreads] = useState([]);
  const [archivedThreads, setArchivedThreads] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [insights, setInsights] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [connectorSources, setConnectorSources] = useState([]);
  const [reasoning, setReasoning] = useState("auto");
  const [provider, setProvider] = useState("server");
  const [threadsCollapsed, setThreadsCollapsed] = useState(false);
  const [insightsCollapsed, setInsightsCollapsed] = useState(true);
  const [promptsCollapsed, setPromptsCollapsed] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [hotTopicPrompts, setHotTopicPrompts] = useState(DEFAULT_HOT_TOPIC_PROMPTS);
  const messagesRef = useRef(null);
  const abortRef = useRef(null);

  const persistedMessages = useMemo(
    () => messages.filter((message) => message.id !== "welcome" && !message.id?.startsWith("local-")),
    [messages],
  );

  const lastAssistantId = useMemo(() => {
    const last = [...persistedMessages].reverse().find((message) => message.role === "assistant");
    return last?.id ?? null;
  }, [persistedMessages]);

  const lastUserId = useMemo(() => {
    const last = [...persistedMessages].reverse().find((message) => message.role === "user");
    return last?.id ?? null;
  }, [persistedMessages]);

  const loadHotTopicPrompts = useCallback(async () => {
    try {
      const summary = await getAnalyticsSummary();
      setHotTopicPrompts(buildPromptsFromHotTopics(summary.hotTopics));
    } catch {
      setHotTopicPrompts(DEFAULT_HOT_TOPIC_PROMPTS);
    }
  }, []);

  const loadThreads = useCallback(async () => {
    const [active, archived] = await Promise.all([
      listConversations(),
      listConversations({ archived: true }),
    ]);
    setThreads(active);
    setArchivedThreads(archived);
    return active;
  }, []);

  const loadConversation = useCallback(async (id) => {
    const conversation = await getConversation(id);
    if (conversation.messages.length > 0) {
      setMessages(conversation.messages);
      setInsights(getLastAssistantInsights(conversation.messages));
    } else {
      setMessages([WELCOME_MESSAGE]);
      setInsights(null);
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      const allThreads = await loadThreads();
      if (allThreads.length > 0) {
        setConversationId(allThreads[0].id);
        await loadConversation(allThreads[0].id);
        return;
      }
      const created = await createConversation("New chat");
      await loadThreads();
      setConversationId(created.id);
      setMessages([WELCOME_MESSAGE]);
      setInsights(null);
    };
    void boot().catch((bootError) => setError(bootError.message));
    void loadHotTopicPrompts();
  }, [loadConversation, loadThreads, loadHotTopicPrompts]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, pending]);

  const runStream = useCallback(
    async ({ streamFn, assistantId }) => {
      const controller = new AbortController();
      abortRef.current = controller;
      let streamedContent = "";
      let latestArtifacts = null;

      try {
        await streamFn({
          signal: controller.signal,
          onToken: (token) => {
            streamedContent += token;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId ? { ...message, content: streamedContent } : message,
              ),
            );
          },
          onInsights: (payload) => setInsights(payload),
          onArtifacts: (payload) => {
            latestArtifacts = payload;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, metadata: { ...message.metadata, artifacts: payload } }
                  : message,
              ),
            );
          },
          onComplete: async () => {
            await loadConversation(conversationId);
            await loadThreads();
            await loadHotTopicPrompts();
          },
        });
      } catch (streamError) {
        setError(streamError.message);
        toast.error(streamError.message);
        if (!streamedContent && latestArtifacts) {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content:
                      "I reviewed your stored submitted records and prepared comparison insights below.",
                    metadata: { artifacts: latestArtifacts },
                  }
                : message,
            ),
          );
        }
      } finally {
        setPending(false);
        abortRef.current = null;
      }
    },
    [conversationId, loadConversation, loadHotTopicPrompts, loadThreads, toast],
  );

  const handleSelectThread = async (id) => {
    if (id === conversationId || pending) {
      return;
    }
    setConversationId(id);
    setError("");
    await loadConversation(id);
  };

  const handleCreateThread = async () => {
    const created = await createConversation("New chat");
    await loadThreads();
    setConversationId(created.id);
    setMessages([WELCOME_MESSAGE]);
    setInsights(null);
    setError("");
  };

  const handleDeleteThread = async (thread) => {
    if (pending) {
      setError("Wait for the current response to finish before deleting a chat.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${thread.title}"?\n\nThis removes the chat and all saved messages.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingId(thread.id);
    setError("");

    try {
      await deleteConversation(thread.id);
      const refreshed = await loadThreads();

      if (thread.id === conversationId) {
        if (refreshed.length > 0) {
          setConversationId(refreshed[0].id);
          await loadConversation(refreshed[0].id);
        } else {
          const created = await createConversation("New chat");
          await loadThreads();
          setConversationId(created.id);
          setMessages([WELCOME_MESSAGE]);
          setInsights(null);
        }
      }
      toast.success("Chat deleted");
    } catch (deleteError) {
      setError(deleteError.message);
      toast.error(deleteError.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRenameThread = async (thread, nextTitle) => {
    const trimmed = nextTitle?.trim();
    if (!trimmed || trimmed === thread.title) {
      return;
    }
    try {
      await updateConversation(thread.id, { title: trimmed });
      await loadThreads();
      toast.success("Chat renamed");
    } catch (renameError) {
      toast.error(renameError.message);
    }
  };

  const handlePinThread = async (thread) => {
    try {
      await updateConversation(thread.id, { pinned: !thread.pinned });
      await loadThreads();
      toast.info(thread.pinned ? "Chat unpinned" : "Chat pinned");
    } catch (pinError) {
      toast.error(pinError.message);
    }
  };

  const handleArchiveThread = async (thread) => {
    try {
      await updateConversation(thread.id, { archived: !thread.archived });
      await loadThreads();
      if (thread.id === conversationId && !thread.archived) {
        const refreshed = await listConversations();
        if (refreshed.length > 0) {
          setConversationId(refreshed[0].id);
          await loadConversation(refreshed[0].id);
        } else {
          await handleCreateThread();
        }
      }
      toast.info(thread.archived ? "Chat restored" : "Chat archived");
    } catch (archiveError) {
      toast.error(archiveError.message);
    }
  };

  const handleSend = async (rawText, overrideAttachments = null) => {
    const content = rawText.trim();
    const filesToSend = overrideAttachments ?? attachments;
    if ((!content && filesToSend.length === 0) || !conversationId || pending) {
      return;
    }

    setError("");
    setPending(true);
    setInsights(null);
    setInput("");
    setAttachments([]);

    const attachmentMeta = filesToSend.map(({ name, type, size }) => ({ name, type, size }));
    const assistantId = `local-assistant-${Date.now()}`;
    setMessages((current) => [
      ...current.filter((message) => message.id !== "welcome"),
      {
        id: `local-user-${Date.now()}`,
        role: "user",
        content: content || "(see attached documents)",
        metadata: { attachments: attachmentMeta },
      },
      { id: assistantId, role: "assistant", content: "", metadata: {} },
    ]);

    await runStream({
      assistantId,
      streamFn: (callbacks) =>
        streamChat({
          conversationId,
          message: content || "Please analyze the attached document(s).",
          attachments: filesToSend,
          pageContext: getPageContext(),
          connectorSources,
          reasoning,
          aiProvider: provider === "copilot-studio" ? "copilot-studio" : "default",
          ...callbacks,
        }),
    });
  };

  const handleRegenerate = async () => {
    if (!conversationId || pending || !lastAssistantId) {
      return;
    }

    setError("");
    setPending(true);
    setInsights(null);

    const assistantId = `local-assistant-${Date.now()}`;
    setMessages((current) => {
      const withoutLastAssistant = current.filter(
        (message) => message.id !== lastAssistantId && message.id !== "welcome",
      );
      return [...withoutLastAssistant, { id: assistantId, role: "assistant", content: "", metadata: {} }];
    });

    await runStream({
      assistantId,
      streamFn: (callbacks) => regenerateChat({ conversationId, ...callbacks }),
    });
  };

  const handleEditUserMessage = async (message) => {
    const nextContent = window.prompt("Edit your message", message.content);
    if (!nextContent?.trim() || !conversationId || pending) {
      return;
    }

    setError("");
    setPending(true);
    setInsights(null);

    const assistantId = `local-assistant-${Date.now()}`;
    const messageIndex = messages.findIndex((entry) => entry.id === message.id);
    setMessages((current) => [
      ...current.slice(0, messageIndex).filter((entry) => entry.id !== "welcome"),
      { ...message, content: nextContent.trim() },
      { id: assistantId, role: "assistant", content: "", metadata: {} },
    ]);

    await runStream({
      assistantId,
      streamFn: (callbacks) =>
        editChatMessage({
          conversationId,
          messageId: message.id,
          content: nextContent.trim(),
          ...callbacks,
        }),
    });
  };

  const [forumPostContent, setForumPostContent] = useState(null);

  const handleCopy = async (content) => {
    try {
      await navigator.clipboard.writeText(content ?? "");
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleRate = async (messageId, rating) => {
    try {
      await rateMessage(messageId, rating);
      await loadConversation(conversationId);
      toast.success("Feedback saved");
    } catch (rateError) {
      toast.error(rateError.message);
    }
  };

  const handleExport = () => {
    downloadChatMarkdown({
      title: activeThread?.title ?? "Conversation",
      messages,
    });
    toast.success("Chat exported as Markdown");
  };

  const activeThread =
    threads.find((thread) => thread.id === conversationId) ??
    archivedThreads.find((thread) => thread.id === conversationId);

  return (
    <div
      className={`cia-layout${threadsCollapsed ? " threads-collapsed" : ""}${
        insightsCollapsed ? " insights-collapsed" : ""
      }`}
    >
      <CiaThreadList
        collapsed={threadsCollapsed}
        onToggleCollapsed={() => setThreadsCollapsed((value) => !value)}
        threads={threads}
        archivedThreads={archivedThreads}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived((value) => !value)}
        activeId={conversationId}
        deletingId={deletingId}
        onSelect={handleSelectThread}
        onCreate={handleCreateThread}
        onDelete={handleDeleteThread}
        onRename={handleRenameThread}
        onPin={handlePinThread}
        onArchive={handleArchiveThread}
      />

      <section className={`cia-chat-panel${pending ? " is-thinking" : ""}`}>
        <div className="cia-chat-header">
          <div>
            <div className="cia-chat-title">Conversation</div>
            {activeThread ? (
              <div className="text-xs text-[var(--t1-muted)]">{activeThread.title}</div>
            ) : null}
          </div>
          <div className="cia-chat-header-actions">
            <button type="button" className="cia-header-btn" onClick={handleExport} disabled={pending}>
              Export
            </button>
            <div className="cia-badge">⚡ AI Powered</div>
          </div>
        </div>

        <div className="cia-messages" ref={messagesRef}>
          {messages.map((message, index) => (
            <article
              key={message.id}
              className={`cia-message ${message.role}${message.id === "welcome" ? " cia-message-welcome" : ""}`}
              style={{ animationDelay: `${Math.min(index, 12) * 0.045}s` }}
            >
              <div className="cia-avatar">{message.role === "assistant" ? "AI" : "You"}</div>
              <div className="cia-bubble-wrap">
                <div className="cia-bubble">
                  {message.role === "assistant" ? (
                    <AssistantArtifacts
                      content={message.content}
                      artifacts={message.metadata?.artifacts}
                      requestedDocFormats={detectRequestedDocFormats(
                        [...messages.slice(0, index)].reverse().find((m) => m.role === "user")
                          ?.content,
                      )}
                    />
                  ) : (
                    <UserMessageContent
                      content={message.content}
                      attachments={message.metadata?.attachments ?? []}
                    />
                  )}
                </div>
                <MessageActions
                  message={message}
                  isLastAssistant={message.id === lastAssistantId}
                  isLastUser={message.id === lastUserId}
                  pending={pending}
                  onCopy={handleCopy}
                  onRegenerate={() => void handleRegenerate()}
                  onEdit={handleEditUserMessage}
                  onRate={handleRate}
                  onPostToForum={
                    message.role === "assistant"
                      ? (msg) => setForumPostContent(msg.content ?? "")
                      : undefined
                  }
                />
              </div>
            </article>
          ))}
          {pending ? (
            <article className="cia-message assistant cia-message-pending">
              <div className="cia-avatar">AI</div>
              <div className="cia-bubble cia-bubble-pending">
                <span className="cia-typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="cia-typing-label">Thinking</span>
              </div>
            </article>
          ) : null}
        </div>

        {error ? <p className="px-6 pb-2 text-sm text-red-500">{error}</p> : null}

        <div className={`cia-quick-prompts-wrap${promptsCollapsed ? " is-collapsed" : ""}`}>
          <button
            type="button"
            className="cia-quick-prompts-label cia-quick-prompts-toggle"
            onClick={() => setPromptsCollapsed((value) => !value)}
            aria-expanded={!promptsCollapsed}
          >
            <span>
              Popular searches{" "}
              <span className="cia-quick-prompts-hint">📊 imports · 💬 chat</span>
            </span>
            <span className="cia-quick-prompts-caret" aria-hidden="true">
              {promptsCollapsed ? "▸" : "▾"}
            </span>
          </button>
          <div className="cia-quick-prompts" hidden={promptsCollapsed}>
            {hotTopicPrompts.map((prompt) => (
              <button
                key={`${prompt.term}-${prompt.sources?.join("-") ?? "default"}`}
                type="button"
                className="cia-chip"
                title={prompt.text}
                onClick={() => void handleSend(prompt.text)}
                disabled={pending}
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>

        <ChatComposer
          input={input}
          onInputChange={setInput}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onSubmit={() => void handleSend(input)}
          pending={pending}
          connectorSources={connectorSources}
          onConnectorSourcesChange={setConnectorSources}
          reasoning={reasoning}
          onReasoningChange={setReasoning}
          provider={provider}
          onProviderChange={setProvider}
          onTopicSelect={(text) => setInput((cur) => (cur ? `${cur} ${text}` : text))}
          onTemplateSelect={(text) => setInput(text)}
          onError={(message) => {
            setError(message);
            toast.error(message);
          }}
        />
      </section>

      <CiaSidePanel
        insights={insights}
        onAskTerm={(text) => void handleSend(text)}
        collapsed={insightsCollapsed}
        onToggleCollapsed={() => setInsightsCollapsed((value) => !value)}
      />

      <PostToForumModal
        open={forumPostContent !== null}
        content={forumPostContent ?? ""}
        onClose={() => setForumPostContent(null)}
      />
    </div>
  );
}
