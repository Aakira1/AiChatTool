import { useCallback, useEffect, useState } from "react";
import { ConnectorIcon } from "../../lib/ConnectorIcon.jsx";
import {
  disconnectConnector,
  getConnectorConnectUrl,
  listConnectors,
  updateDisplayName,
  changePassword,
  pingHealth,
} from "../../lib/api.js";
import { getSettings, saveSettings, THEMES } from "../../lib/settings.js";
import { APP_CATALOG } from "../../lib/apps.js";
import { getAiProviders, providerMeta } from "../../lib/aiProviders.js";
import {
  getApiBaseUrl,
  setApiBaseUrl,
  getWorkerAuthToken,
  setWorkerAuthToken,
  getConnections,
} from "../../lib/storage.js";
import { ConnectionsSettings } from "./ConnectionsSettings.jsx";

export function SettingsPanel({ onClose, onOpenFullOptions, user, standaloneMode, onProfileUpdated }) {
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState(() => getSettings());

  const load = useCallback(async () => {
    // Standalone mode manages connectors locally — no server call needed.
    if (standaloneMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await listConnectors();
      setConnectors(data.connectors ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError.message ?? "Failed to load connectors");
    } finally {
      setLoading(false);
    }
  }, [standaloneMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateSetting = (updates) => setSettings(saveSettings(updates));

  const handleConnect = async (connectorId) => {
    const url = await getConnectorConnectUrl(connectorId);
    if (chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank", "noopener");
    }
  };

  const handleDisconnect = async (provider) => {
    try {
      await disconnectConnector(provider);
      await load();
    } catch (disconnectError) {
      setError(disconnectError.message ?? "Failed to disconnect");
    }
  };

  return (
    <div className="cia-ext-settings-overlay" role="dialog" aria-label="Settings">
      <div className="cia-ext-settings-header">
        <strong>Settings</strong>
        <button
          type="button"
          className="cia-ext-icon-btn"
          onClick={onClose}
          aria-label="Close settings"
        >
          ×
        </button>
      </div>

      <div className="cia-ext-settings-body">
        <ConnectionStatus standaloneMode={standaloneMode} />
        <BackendSection standaloneMode={standaloneMode} />
        {!standaloneMode && <AccountSection user={user} onProfileUpdated={onProfileUpdated} />}

        {standaloneMode ? (
          <ConnectionsSettings />
        ) : (
          <section>
            <h4>App connectors</h4>
            <p className="cia-ext-options-help">
              Connect apps the assistant can search while you chat.
            </p>
            {error ? <p className="cia-ext-banner cia-ext-banner-error">{error}</p> : null}
            {loading ? (
              <p className="cia-ext-options-help">Loading…</p>
            ) : (
              <div className="cia-ext-connector-list">
                {connectors.map((connector) => (
                  <div key={connector.id} className="cia-ext-connector-row">
                    <span className="cia-ext-connector-icon"><ConnectorIcon id={connector.icon} /></span>
                    <div className="cia-ext-connector-meta">
                      <strong>{connector.label}</strong>
                    </div>
                    {!connector.configured ? (
                      <span className="cia-ext-connector-badge">Not set up</span>
                    ) : connector.connected ? (
                      <button
                        type="button"
                        className="cia-ext-secondary-btn"
                        onClick={() => void handleDisconnect(connector.provider)}
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cia-ext-primary-btn"
                        onClick={() => void handleConnect(connector.id)}
                      >
                        Connect
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <h4>Appearance</h4>
          <p className="cia-ext-options-help">Theme</p>
          <div className="cia-ext-theme-grid">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`cia-ext-theme-swatch${settings.theme === t.id ? " is-active" : ""}`}
                onClick={() => updateSetting({ theme: t.id })}
                title={t.label}
                aria-label={`${t.label} theme`}
                aria-pressed={settings.theme === t.id}
              >
                <span className="cia-ext-theme-chip" style={{ background: t.swatch }} />
                <span className="cia-ext-theme-name">{t.label}</span>
              </button>
            ))}
          </div>

          <p className="cia-ext-options-help" style={{ marginTop: 12 }}>Density</p>
          <div className="cia-ext-segmented">
            {[
              { id: "comfortable", label: "Comfortable" },
              { id: "compact", label: "Compact" },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                className={`cia-ext-segmented-btn${(settings.density ?? "comfortable") === d.id ? " is-active" : ""}`}
                onClick={() => updateSetting({ density: d.id })}
              >
                {d.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>Floating bubble</h4>
          <p className="cia-ext-options-help">
            Pin an app to the on-page chat bubble for one-tap access — a small launcher button
            appears next to it on every page.
          </p>
          <label className="cia-ext-field">
            <span>Quick-launch app</span>
            <select
              value={settings.pinnedApp ?? ""}
              onChange={(e) => updateSetting({ pinnedApp: e.target.value })}
            >
              <option value="">None</option>
              {APP_CATALOG.filter((a) => a.id !== "settings").map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.label}</option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <h4>Uploaded files (memory)</h4>
          <label className="cia-ext-options-toggle">
            <input
              type="checkbox"
              checked={settings.rememberUploads !== false}
              onChange={(event) => updateSetting({ rememberUploads: event.target.checked })}
            />
            Remember uploaded files across this chat (RAG)
          </label>
          <p className="cia-ext-options-help">
            When on, files you attach are indexed so the assistant can recall them in later
            messages of the same conversation. Turn off to use an attachment for a single message
            only — nothing is stored or retrieved. (Requires the backend RAG index to be enabled.)
          </p>
        </section>

        <section>
          <h4>Insights under replies</h4>
          <label className="cia-ext-options-toggle">
            <input
              type="checkbox"
              checked={settings.showInsights !== false}
              onChange={(event) => updateSetting({ showInsights: event.target.checked })}
            />
            Show insights under replies
          </label>
        </section>

        <section>
          <h4>Page vision &amp; privacy</h4>
          <label className="cia-ext-options-toggle">
            <input
              type="checkbox"
              checked={settings.privacyMode === true}
              onChange={(event) => updateSetting({ privacyMode: event.target.checked })}
            />
            Privacy mode — never read or screenshot pages
          </label>
          <p className="cia-ext-options-help">
            By default the assistant can see the current page (text + screenshots) on all sites to
            answer about what you&apos;re viewing. Turn this on to disable page vision everywhere —
            nothing is read or captured.
          </p>
          <label className="cia-ext-options-toggle">
            <input
              type="checkbox"
              checked={settings.debugHighlight === true}
              onChange={(event) => updateSetting({ debugHighlight: event.target.checked })}
            />
            Highlight what the AI sees (debug)
          </label>
          <p className="cia-ext-options-help">
            When relaying to a page AI (Rovo / Copilot), draw boxes on that page showing the chat
            input, the reply being read, the send button, and the busy state.
          </p>
          <label className="cia-ext-options-toggle">
            <input
              type="checkbox"
              checked={settings.wholePageVision === true}
              onChange={(event) => updateSetting({ wholePageVision: event.target.checked })}
            />
            Entire page vision — outline the whole page when the AI reads it
          </label>
        </section>

        {onOpenFullOptions ? (
          <button type="button" className="cia-ext-secondary-btn" onClick={onOpenFullOptions}>
            Open full settings page ↗
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ConnectionStatus({ standaloneMode }) {
  const [phase, setPhase] = useState("checking"); // checking | online | offline
  const [host, setHost] = useState("");
  const [connectors, setConnectors] = useState([]);
  const [providers, setProviders] = useState([]);
  const [activeIds, setActiveIds] = useState([]);

  useEffect(() => {
    let alive = true;

    // AI providers + connectors — refreshed live so toggling "Use" updates the fork.
    const loadConfig = async () => {
      const d = await getAiProviders();
      if (alive) { setProviders(d.providers || []); setActiveIds(d.activeIds || []); }
      try {
        let list = [];
        if (standaloneMode) {
          const c = await getConnections();
          list = [
            ...(c.agents ?? [])
              .filter((a) => a.enabled && a.url)
              .map((a) => ({ id: a.id, label: a.name || "Agent", icon: "🧠" })),
            ...Object.entries(c.apps ?? {})
              .filter(([, cfg]) => cfg.siteUrl && cfg.email && cfg.apiToken)
              .map(([id]) => ({
                id,
                label: id.charAt(0).toUpperCase() + id.slice(1),
                icon: id === "jira" ? "🔷" : id === "confluence" ? "🔶" : "🔗",
              })),
          ];
        } else {
          const data = await listConnectors();
          list = (data.connectors ?? []).filter((c) => c.connected).map((c) => ({ id: c.id, label: c.label, iconId: c.icon }));
        }
        if (alive) setConnectors(list);
      } catch { /* ignore — connectors are best-effort */ }
    };

    (async () => {
      const base = await getApiBaseUrl();
      if (alive) setHost(base.replace(/^https?:\/\//, "").replace(/\/$/, ""));
      try {
        const h = await pingHealth();
        if (alive) setPhase(h?.ok ? "online" : "offline");
      } catch {
        if (alive) setPhase("offline");
      }
      await loadConfig();
    })();

    const onChanged = (changes, area) => {
      if (area === "local" && (changes.aiProviders || changes.connections)) loadConfig();
    };
    chrome.storage?.onChanged?.addListener?.(onChanged);
    return () => { alive = false; chrome.storage?.onChanged?.removeListener?.(onChanged); };
  }, [standaloneMode]);

  const label = phase === "online" ? "Connected" : phase === "offline" ? "Can't reach backend" : "Connecting…";
  const activeProviders = providers.filter((p) => activeIds.includes(p.id) && p.enabled !== false && p.apiKey && p.model);

  // The fork connects to the backend plus each ACTIVE (ticked) AI provider and
  // any connected connector — one line per active model.
  const branches = [
    { id: "backend", icon: "☁", tone: phase },
    ...providers
      .filter((p) => activeIds.includes(p.id) && p.enabled !== false && p.apiKey && p.model)
      .map((p) => ({ id: p.id, icon: "🧠", tone: "online", active: true })),
    ...connectors.map((c) => ({ id: c.id, icon: c.icon ?? "🔗", iconId: c.iconId, tone: "online" })),
  ];

  return (
    <section className={`cia-ext-connstatus is-${phase}`}>
      <WireDiagram phase={phase} branches={branches} />

      <div className="cia-ext-cs-meta">
        <span className="cia-ext-cs-badge">
          <span className="cia-ext-cs-dot" />
          {label}
        </span>
        {host ? <span className="cia-ext-cs-host" title={host}>{host}</span> : null}
      </div>

      <div className="cia-ext-cs-conns">
        <span className="cia-ext-cs-conns-label">{activeProviders.length > 1 ? `AI models (${activeProviders.length} at once)` : "AI model"}</span>
        <div className="cia-ext-cs-chips">
          {activeProviders.length ? (
            activeProviders.map((p) => (
              <span key={p.id} className="cia-ext-cs-chip">
                <span aria-hidden="true">🧠</span>
                {providerMeta(p.type).label} · {p.model}
                <span className="cia-ext-cs-chip-tick" aria-hidden="true">✓</span>
              </span>
            ))
          ) : (
            <span className="cia-ext-cs-chip">
              <span aria-hidden="true">🧠</span>
              Built-in model
              <span className="cia-ext-cs-chip-tick" aria-hidden="true">✓</span>
            </span>
          )}
        </div>
      </div>

      <div className="cia-ext-cs-conns">
        <span className="cia-ext-cs-conns-label">{standaloneMode ? "Connections" : "Connected apps"}</span>
        {connectors.length ? (
          <div className="cia-ext-cs-chips">
            {connectors.map((c, i) => (
              <span key={c.id} className="cia-ext-cs-chip" style={{ animationDelay: `${i * 60}ms` }}>
                {c.iconId ? <ConnectorIcon id={c.iconId} /> : <span aria-hidden="true">{c.icon}</span>}
                {c.label}
                <span className="cia-ext-cs-chip-tick" aria-hidden="true">✓</span>
              </span>
            ))}
          </div>
        ) : (
          <span className="cia-ext-cs-none">Nothing connected yet</span>
        )}
      </div>
    </section>
  );
}

// App → backend wire that forks into a branch for each added API / connector.
function WireDiagram({ phase, branches }) {
  const W = 300;
  const rowH = 34;
  const n = Math.max(1, branches.length);
  const H = Math.max(58, n * rowH + 8);
  const appX = 22;
  const appY = H / 2;
  const endX = W - 24;
  const startX = appX + 13; // right edge of the app node — branches attach here
  const topY = (H - n * rowH) / 2 + rowH / 2;
  const ys = branches.map((_, i) => topY + i * rowH);
  const toneStroke = (t) =>
    t === "online" ? "#16a34a" : t === "offline" ? "#dc2626" : t === "idle" ? "#94a3b8" : "#7c3aed";

  return (
    <svg
      className={`cia-ext-cs-svg is-${phase}`}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      aria-hidden="true"
    >
      <defs>
        {/* userSpaceOnUse so the gradient renders even for a flat (single) line,
            which has a zero-height bounding box. */}
        <linearGradient id="cia-cs-grad" gradientUnits="userSpaceOnUse" x1={startX} y1="0" x2={endX} y2="0">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
      </defs>

      {/* One branch per endpoint, all attached to the app node on the left */}
      {branches.map((b, i) => {
        const d = `M ${startX} ${appY} C ${startX + 70} ${appY}, ${endX - 52} ${ys[i]}, ${endX - 14} ${ys[i]}`;
        return (
          <g key={`b-${b.id}`}>
            <path className="cia-ext-cs-path" d={d} />
            {phase === "online" ? (
              <path className="cia-ext-cs-pulse" pathLength="100" d={d} style={{ animationDelay: `${i * 0.35}s` }} />
            ) : null}
          </g>
        );
      })}

      {/* App node */}
      <circle className="cia-ext-cs-svgnode-app" cx={appX} cy={appY} r="13" />
      <text className="cia-ext-cs-svgicon" x={appX} y={appY}>✦</text>

      {/* Endpoint nodes */}
      {branches.map((b, i) => (
        <g key={`n-${b.id}`}>
          <circle
            cx={endX}
            cy={ys[i]}
            r="13"
            fill="#fff"
            stroke={toneStroke(b.tone)}
            strokeWidth={b.active ? 3 : 2}
          />
          <text className="cia-ext-cs-svgicon" x={endX} y={ys[i]}>{b.icon}</text>
        </g>
      ))}
    </svg>
  );
}

function BackendSection({ standaloneMode }) {
  const [apiUrl, setApiUrlState] = useState("");
  const [authToken, setAuthTokenState] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getApiBaseUrl().then(setApiUrlState);
    getWorkerAuthToken().then(setAuthTokenState);
  }, []);

  const save = async () => {
    await setApiBaseUrl(apiUrl.trim());
    await setWorkerAuthToken(authToken.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section>
      <h4>Backend / Worker URL</h4>
      <p className="cia-ext-options-help">
        {standaloneMode
          ? "Running in standalone mode — connected directly to your Cloudflare Worker."
          : "Point to your Cloudflare Worker or local server (http://localhost:3001)."}
      </p>
      <label className="cia-ext-field">
        <span>API base URL</span>
        <input
          type="url"
          value={apiUrl}
          onChange={(e) => setApiUrlState(e.target.value)}
          placeholder="https://cia-assistant.yourname.workers.dev"
          autoComplete="off"
        />
      </label>
      <label className="cia-ext-field">
        <span>Auth token <small>(optional — set via AUTH_TOKEN in Worker)</small></span>
        <div className="cia-ext-account-row">
          <input
            type={showToken ? "text" : "password"}
            value={authToken}
            onChange={(e) => setAuthTokenState(e.target.value)}
            placeholder="Leave blank if no token required"
            autoComplete="off"
          />
          <button type="button" className="cia-ext-secondary-btn" onClick={() => setShowToken((v) => !v)}>
            {showToken ? "Hide" : "Show"}
          </button>
        </div>
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button type="button" className="cia-ext-primary-btn" onClick={() => void save()}>
          Save
        </button>
        {saved && <span className="cia-ext-options-saved">Saved ✓ — reload the extension to apply</span>}
      </div>
    </section>
  );
}

function AccountSection({ user, onProfileUpdated }) {
  const email = user?.email ?? "signed-in";
  const isRegistered = Boolean(user?.email) && email !== "signed-in";
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
  }, [user?.displayName]);

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setStatus({ tone: "error", text: "Display name cannot be empty" });
      return;
    }
    setSavingName(true);
    setStatus(null);
    try {
      const result = await updateDisplayName(trimmed);
      onProfileUpdated?.({ displayName: result.displayName ?? trimmed });
      setStatus({ tone: "ok", text: "Display name updated" });
    } catch (error) {
      setStatus({ tone: "error", text: error.message ?? "Failed to update name" });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      setStatus({ tone: "error", text: "New password must be at least 8 characters" });
      return;
    }
    setSavingPassword(true);
    setStatus(null);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setStatus({ tone: "ok", text: "Password changed" });
    } catch (error) {
      setStatus({ tone: "error", text: error.message ?? "Failed to change password" });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <section className="cia-ext-account">
      <h4>Account</h4>
      <p className="cia-ext-options-help">Signed in as {email}</p>

      {status ? (
        <p className={`cia-ext-banner cia-ext-banner-${status.tone === "ok" ? "success" : "error"}`}>
          {status.text}
        </p>
      ) : null}

      {isRegistered ? (
        <>
          <label className="cia-ext-field">
            <span>Display name</span>
            <div className="cia-ext-account-row">
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name"
              />
              <button
                type="button"
                className="cia-ext-secondary-btn"
                onClick={() => void handleSaveName()}
                disabled={savingName}
              >
                {savingName ? "…" : "Save"}
              </button>
            </div>
          </label>

          <label className="cia-ext-field">
            <span>Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="cia-ext-field">
            <span>New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button
            type="button"
            className="cia-ext-secondary-btn"
            onClick={() => void handleChangePassword()}
            disabled={savingPassword || !currentPassword || !newPassword}
          >
            {savingPassword ? "Updating…" : "Change password"}
          </button>
        </>
      ) : (
        <p className="cia-ext-options-help">
          You&apos;re using the shared demo account — register a personal account in the web app to
          manage your own profile.
        </p>
      )}
    </section>
  );
}
