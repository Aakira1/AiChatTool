import { useEffect, useState } from "react";
import { getConnections } from "../lib/storage.js";

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen({ user, healthState, threads = [], onNewChat, onNotepad, onCompanion, onSettings, onSelectThread }) {
  const [connectors, setConnectors] = useState([]);

  useEffect(() => {
    getConnections()
      .then((c) => {
        const agents = (c.agents ?? []).map((a) => ({
          id: a.id,
          icon: "🧠",
          label: a.name || "Unnamed agent",
          connected: a.enabled && Boolean(a.url),
        }));
        const apps = Object.entries(c.apps ?? {}).map(([id, cfg]) => ({
          id,
          icon: id === "jira" ? "🔷" : id === "confluence" ? "🔶" : "🔗",
          label: id.charAt(0).toUpperCase() + id.slice(1),
          connected: Boolean(cfg.siteUrl && cfg.email && cfg.apiToken),
        }));
        setConnectors([...agents, ...apps]);
      })
      .catch(() => {});
  }, []);

  // Only greet by name when it's a real one — skip generic placeholders.
  const rawName = user?.displayName || user?.email?.split("@")[0] || "";
  const name = /^(you|consultant|signed-in|local)$/i.test(rawName.trim()) ? "" : rawName.trim();
  const isOnline = healthState?.ok === true;

  const actions = [
    { icon: "💬", label: "New Chat", onClick: onNewChat },
    { icon: "📝", label: "Notepad", onClick: onNotepad },
    { icon: "✅", label: "Companion", onClick: onCompanion },
    { icon: "⚙️", label: "Settings", onClick: onSettings },
  ];

  const recentThreads = threads.slice(0, 6);

  return (
    <div className="cia-ext-home">
      {/* Hero */}
      <div className="cia-ext-home-hero">
        <div className="cia-ext-home-brand">
          <span className="cia-ext-home-logo">✦</span>
          <span className="cia-ext-home-brand-name">OneChat</span>
        </div>
        <div className="cia-ext-home-greeting">{timeGreeting()}{name ? `, ${name}` : ""}</div>
        <div className={`cia-ext-home-badge ${isOnline ? "is-on" : "is-off"}`}>
          <span className="cia-ext-home-badge-dot" />
          {isOnline ? "Connected" : healthState?.ok === false ? "Offline" : "Checking…"}
        </div>
      </div>

      <div className="cia-ext-home-body">
        {/* Quick actions */}
        <div className="cia-ext-home-section-label">Quick actions</div>
        <div className="cia-ext-home-actions">
          {actions.map((a) => (
            <button key={a.label} className="cia-ext-home-action" onClick={a.onClick} type="button">
              <span className="cia-ext-home-action-icon">{a.icon}</span>
              <span className="cia-ext-home-action-label">{a.label}</span>
            </button>
          ))}
        </div>

        {/* Connectors */}
        {connectors.length > 0 && (
          <>
            <div className="cia-ext-home-section-label">Connections</div>
            <div className="cia-ext-home-connectors">
              {connectors.map((c) => (
                <div key={c.id} className="cia-ext-home-connector">
                  <span className="cia-ext-home-conn-icon">{c.icon ?? "🔗"}</span>
                  <span className="cia-ext-home-conn-name">{c.label}</span>
                  <span className={`cia-ext-home-conn-pill ${c.connected ? "is-on" : ""}`}>
                    {c.connected ? "On" : "Off"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Recent threads */}
        {recentThreads.length > 0 && (
          <>
            <div className="cia-ext-home-section-label">Recent chats</div>
            <div className="cia-ext-home-recent">
              {recentThreads.map((t) => (
                <button
                  key={t.id}
                  className="cia-ext-home-recent-item"
                  onClick={() => onSelectThread(t.id)}
                  type="button"
                >
                  <span className="cia-ext-home-recent-icon">💬</span>
                  <span className="cia-ext-home-recent-title">{t.title || "Untitled chat"}</span>
                  <span className="cia-ext-home-recent-arrow">›</span>
                </button>
              ))}
            </div>
          </>
        )}

        {recentThreads.length === 0 && (
          <div className="cia-ext-home-empty">
            <p>No chats yet — tap <strong>New Chat</strong> to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
