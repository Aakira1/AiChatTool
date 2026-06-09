import { useCallback, useEffect, useState } from "react";
import { ConnectorIcon } from "../../lib/ConnectorIcon.jsx";
import {
  disconnectConnector,
  getConnectorConnectUrl,
  listConnectors,
  updateDisplayName,
  changePassword,
} from "../../lib/api.js";
import { getSettings, saveSettings } from "../../lib/settings.js";

export function SettingsPanel({ onClose, onOpenFullOptions, user, onProfileUpdated }) {
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState(() => getSettings());

  const load = useCallback(async () => {
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
  }, []);

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
        <AccountSection user={user} onProfileUpdated={onProfileUpdated} />

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

        {onOpenFullOptions ? (
          <button type="button" className="cia-ext-secondary-btn" onClick={onOpenFullOptions}>
            Open full settings page ↗
          </button>
        ) : null}
      </div>
    </div>
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
