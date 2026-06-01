import { useCallback, useEffect, useState } from "react";
import {
  disconnectConnector,
  getConnectorConnectUrl,
  listConnectors,
} from "../../lib/api.js";
import { getSettings, saveSettings } from "../../lib/settings.js";

export function SettingsPanel({ onClose, onOpenFullOptions }) {
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
                  <span className="cia-ext-connector-icon">{connector.icon ?? "🔌"}</span>
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
