import { useCallback, useEffect, useState } from "react";
import {
  connectConnectorUrl,
  disconnectConnector,
  listConnectorProviders,
  listConnectors,
} from "../../lib/api.js";
import { ConnectorProviderSetup } from "./ConnectorProviderSetup.jsx";

export function ConnectorsManager() {
  const [connectors, setConnectors] = useState([]);
  const [providers, setProviders] = useState([]);
  const [showSetup, setShowSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [connectorData, providerData] = await Promise.all([
        listConnectors(),
        listConnectorProviders(),
      ]);
      setConnectors(connectorData.connectors ?? []);
      setProviders(providerData.providers ?? []);
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

  // After OAuth redirect back to the app, the hash carries the status.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("connector=")) {
      void load();
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [load]);

  const handleConnect = (connectorId) => {
    window.location.href = connectConnectorUrl(connectorId);
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
    <div className="t1-settings-section">
      <h3>App connectors</h3>
      <p>Connect external apps so the assistant can search them while you chat.</p>
      {error ? <p className="t1-profile-error">{error}</p> : null}

      <button
        type="button"
        className="t1-btn-secondary"
        onClick={() => setShowSetup((value) => !value)}
      >
        {showSetup ? "Hide credential setup" : "Set up OAuth credentials"}
      </button>

      {showSetup ? (
        <div className="t1-provider-setup-list">
          <p className="t1-settings-hint">
            Register an OAuth app with each provider, then paste the Client ID and secret here. One
            app per provider lights up all its connectors.
          </p>
          {providers.map((provider) => (
            <ConnectorProviderSetup key={provider.provider} provider={provider} onSaved={load} />
          ))}
        </div>
      ) : null}
      {loading ? (
        <p className="t1-settings-hint">Loading connectors…</p>
      ) : (
        <div className="t1-connector-list">
          {connectors.map((connector) => (
            <div key={connector.id} className="t1-connector-row">
              <span className="t1-connector-icon" aria-hidden="true">
                {connector.icon ?? "🔌"}
              </span>
              <div className="t1-connector-meta">
                <strong>{connector.label}</strong>
                <small>{connector.description}</small>
              </div>
              {!connector.configured ? (
                <span className="t1-connector-badge muted" title="Add client ID/secret to server/.env">
                  Not configured
                </span>
              ) : connector.connected ? (
                <button
                  type="button"
                  className="t1-btn-secondary"
                  onClick={() => void handleDisconnect(connector.provider)}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  className="t1-btn-primary"
                  onClick={() => handleConnect(connector.id)}
                >
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
