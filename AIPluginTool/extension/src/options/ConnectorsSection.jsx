import { useCallback, useEffect, useState } from "react";
import {
  disconnectConnector,
  getConnectorConnectUrl,
  listConnectorProviders,
  listConnectors,
} from "../lib/api.js";
import { ConnectorProviderSetup } from "./ConnectorProviderSetup.jsx";

export function ConnectorsSection() {
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

  const handleConnect = async (connectorId) => {
    const url = await getConnectorConnectUrl(connectorId);
    chrome.tabs?.create
      ? chrome.tabs.create({ url })
      : window.open(url, "_blank", "noopener");
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
    <section className="cia-ext-options-connectors">
      <h3>App connectors</h3>
      <p className="cia-ext-options-help">
        Connect external apps so the assistant can search them while you chat. After connecting in
        the new tab, return here and refresh.
      </p>
      {error ? <p className="cia-ext-banner cia-ext-banner-error">{error}</p> : null}

      <button
        type="button"
        className="cia-ext-secondary-btn"
        onClick={() => setShowSetup((value) => !value)}
      >
        {showSetup ? "Hide credential setup" : "Set up OAuth credentials"}
      </button>

      {showSetup ? (
        <div className="cia-ext-provider-setup-list">
          <p className="cia-ext-options-help">
            Register an OAuth app with each provider, then paste the Client ID and secret here. One
            app per provider enables all its connectors.
          </p>
          {providers.map((provider) => (
            <ConnectorProviderSetup key={provider.provider} provider={provider} onSaved={load} />
          ))}
        </div>
      ) : null}

      {loading ? (
        <p className="cia-ext-options-help">Loading connectors…</p>
      ) : (
        <div className="cia-ext-connector-list">
          {connectors.map((connector) => (
            <div key={connector.id} className="cia-ext-connector-row">
              <span className="cia-ext-connector-icon">{connector.icon ?? "🔌"}</span>
              <div className="cia-ext-connector-meta">
                <strong>{connector.label}</strong>
                <small>{connector.description}</small>
              </div>
              {!connector.configured ? (
                <span className="cia-ext-connector-badge">Not configured</span>
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
  );
}
