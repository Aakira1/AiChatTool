import { useCallback, useEffect, useState } from "react";
import { ConnectorIcon } from "../../lib/ConnectorIcon.jsx";
import {
  disconnectConnector,
  getConnectorConnectUrl,
  listConnectors,
  updateDisplayName,
  changePassword,
} from "../../lib/api.js";
import { getSettings, saveSettings, THEMES } from "../../lib/settings.js";
import { APP_CATALOG } from "../../lib/apps.js";
import {
  getApiBaseUrl,
  setApiBaseUrl,
  getWorkerAuthToken,
  setWorkerAuthToken,
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
