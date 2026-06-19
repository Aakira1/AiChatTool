import { useEffect, useMemo, useState } from "react";
import { getConnections, getStored, setStored } from "../lib/storage.js";
import { getSettings } from "../lib/settings.js";

const QA_KEY = "quickActionIds"; // which apps are pinned to Quick actions
const GS_KEY = "gettingStartedDismissed";

function GettingStarted({ apps, threads }) {
  const [store, setStore] = useState(null);
  const [dismissed, setDismissed] = useState(true); // hidden until we know

  useEffect(() => {
    getStored(["checklistData", "goLiveData", "notes", GS_KEY]).then((s) => {
      setStore(s);
      setDismissed(Boolean(s[GS_KEY]));
    });
  }, []);

  const open = (id) => apps.find((a) => a.id === id)?.onClick?.();

  if (dismissed || !store) return null;

  const noteWithContent = (store.notes?.notes ?? []).some((n) => (n.content || "").replace(/<[^>]*>/g, "").trim());
  const steps = [
    { id: "chat", label: "Send your first message", done: threads.length > 0, app: "chat" },
    { id: "import", label: "Import a checklist or run sheet", done: Boolean(store.checklistData?.sheets?.length || store.goLiveData?.sheets?.length), app: "companion" },
    { id: "note", label: "Take your first note", done: noteWithContent, app: "notepad" },
    { id: "theme", label: "Make it yours — pick a theme", done: getSettings().theme !== "magenta", app: "settings" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const dismiss = () => { setDismissed(true); void setStored({ [GS_KEY]: true }); };

  return (
    <div className="cia-ext-gs">
      <div className="cia-ext-gs-head">
        <span className="cia-ext-gs-title">✨ Getting started</span>
        <span className="cia-ext-gs-count">{doneCount}/{steps.length}</span>
        <button type="button" className="cia-ext-gs-dismiss" onClick={dismiss} aria-label="Dismiss">×</button>
      </div>
      <div className="cia-ext-gs-bar"><span style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ul className="cia-ext-gs-steps">
        {steps.map((s) => (
          <li key={s.id} className={`cia-ext-gs-step${s.done ? " is-done" : ""}`}>
            <span className="cia-ext-gs-check">{s.done ? "✓" : ""}</span>
            <span className="cia-ext-gs-label">{s.label}</span>
            {!s.done ? (
              <button type="button" className="cia-ext-gs-go" onClick={() => open(s.app)}>Go ›</button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen({ user, healthState, threads = [], apps = [], onSelectThread }) {
  const [connectors, setConnectors] = useState([]);
  const [pinned, setPinned] = useState(null); // array of ids; null until loaded
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getConnections()
      .then((c) => {
        const agents = (c.agents ?? []).map((a) => ({
          id: a.id,
          icon: "🧠",
          label: a.name || "Unnamed agent",
          connected: a.enabled && Boolean(a.url),
        }));
        const appConns = Object.entries(c.apps ?? {}).map(([id, cfg]) => ({
          id,
          icon: id === "jira" ? "🔷" : id === "confluence" ? "🔶" : "🔗",
          label: id.charAt(0).toUpperCase() + id.slice(1),
          connected: Boolean(cfg.siteUrl && cfg.email && cfg.apiToken),
        }));
        setConnectors([...agents, ...appConns]);
      })
      .catch(() => {});
  }, []);

  // Load the pinned set once; default to every app the first time.
  useEffect(() => {
    getStored([QA_KEY]).then((s) => {
      setPinned(Array.isArray(s[QA_KEY]) ? s[QA_KEY] : apps.map((a) => a.id));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (ids) => { setPinned(ids); void setStored({ [QA_KEY]: ids }); };

  const pinnedApps = useMemo(() => {
    if (!pinned) return [];
    return pinned.map((id) => apps.find((a) => a.id === id)).filter(Boolean);
  }, [pinned, apps]);

  const addableApps = useMemo(
    () => apps.filter((a) => !(pinned ?? []).includes(a.id)),
    [pinned, apps],
  );

  const removeApp = (id) => persist((pinned ?? []).filter((x) => x !== id));
  const addApp = (id) => { persist([...(pinned ?? []), id]); setAdding(false); };

  // Only greet by name when it's a real one — skip generic placeholders.
  const rawName = user?.displayName || user?.email?.split("@")[0] || "";
  const name = /^(you|consultant|signed-in|local)$/i.test(rawName.trim()) ? "" : rawName.trim();
  const isOnline = healthState?.ok === true;

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
        {/* First-run onboarding checklist (dismissible) */}
        <GettingStarted apps={apps} threads={threads} />

        {/* Quick actions — pinned apps you can add to / remove from */}
        <div className="cia-ext-home-section-head">
          <span className="cia-ext-home-section-label">Quick actions</span>
          {addableApps.length > 0 ? (
            <span className="cia-ext-home-section-note">Tap ＋ to add · hover a tile to remove</span>
          ) : null}
        </div>
        <div className="cia-ext-home-actions">
          {pinnedApps.map((a) => (
            <div
              key={a.id}
              className="cia-ext-home-action"
              role="button"
              tabIndex={0}
              style={{ "--app-accent": a.accent }}
              onClick={() => a.onClick?.()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); a.onClick?.(); } }}
            >
              <button
                type="button"
                className="cia-ext-home-action-remove"
                title={`Remove ${a.label}`}
                aria-label={`Remove ${a.label}`}
                onClick={(e) => { e.stopPropagation(); removeApp(a.id); }}
              >
                ×
              </button>
              {a.badge ? (
                <span className="cia-ext-home-action-badge" title={`${a.badge} to do`}>{a.badge > 99 ? "99+" : a.badge}</span>
              ) : null}
              <span className="cia-ext-home-action-icon">{a.icon}</span>
              <span className="cia-ext-home-action-label">{a.label}</span>
            </div>
          ))}

          {addableApps.length > 0 ? (
            <div className="cia-ext-home-action cia-ext-home-action-add">
              <button
                type="button"
                className="cia-ext-home-add-trigger"
                onClick={() => setAdding((v) => !v)}
                aria-expanded={adding}
              >
                <span className="cia-ext-home-action-icon">＋</span>
                <span className="cia-ext-home-action-label">Add app</span>
              </button>
              {adding ? (
                <>
                  <div className="cia-ext-home-add-backdrop" onClick={() => setAdding(false)} />
                  <div className="cia-ext-home-add-pop" role="menu">
                    <div className="cia-ext-home-add-pop-label">Add to quick actions</div>
                    {addableApps.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="cia-ext-home-add-item"
                        onClick={() => addApp(a.id)}
                        role="menuitem"
                      >
                        <span>{a.icon}</span>
                        <span>{a.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {pinnedApps.length === 0 && addableApps.length === 0 ? (
            <p className="cia-ext-home-empty" style={{ gridColumn: "1 / -1" }}>No apps available.</p>
          ) : null}
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
