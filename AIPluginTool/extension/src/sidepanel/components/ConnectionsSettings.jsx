import { useEffect, useState } from "react";
import { getConnections, setConnections } from "../../lib/storage.js";

// App connectors available in standalone mode (Basic Auth — credentials stored locally).
const APP_CONNECTORS = [
  {
    id: "jira",
    label: "Jira",
    icon: "🔷",
    help: "id.atlassian.com → Security → API tokens. Use the email of the account that owns the token.",
  },
  {
    id: "confluence",
    label: "Confluence",
    icon: "🔶",
    help: "Same Atlassian API token as Jira. Site URL like https://your-org.atlassian.net.",
  },
];

function blankAgent() {
  return { id: `agent-${Date.now()}`, name: "", url: "", enabled: true };
}

export function ConnectionsSettings() {
  const [conn, setConn] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getConnections().then(setConn);
  }, []);

  const persist = (next) => {
    setConn(next);
    void setConnections(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  if (!conn) return <p className="cia-ext-options-help">Loading…</p>;

  // ── AI agents ──────────────────────────────────────────────────────────────
  const addAgent = () => persist({ ...conn, agents: [...conn.agents, blankAgent()] });
  const updateAgent = (id, patch) =>
    persist({ ...conn, agents: conn.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const removeAgent = (id) => persist({ ...conn, agents: conn.agents.filter((a) => a.id !== id) });

  // ── App connectors ─────────────────────────────────────────────────────────
  const updateApp = (id, patch) =>
    persist({ ...conn, apps: { ...conn.apps, [id]: { ...(conn.apps[id] ?? {}), ...patch } } });

  return (
    <div className="cia-ext-conn">
      {/* AI Agents */}
      <section className="cia-ext-conn-section">
        <div className="cia-ext-conn-head">
          <h4>🤖 AI Agents</h4>
          <button type="button" className="cia-ext-secondary-btn cia-ext-conn-add" onClick={addAgent}>
            + Add agent
          </button>
        </div>
        <p className="cia-ext-options-help">
          Connect Microsoft Copilot or other agents by name and endpoint. Add as many as you need.
        </p>

        {conn.agents.length === 0 ? (
          <div className="cia-ext-conn-empty">No agents yet — add a Copilot agent to get started.</div>
        ) : (
          <div className="cia-ext-conn-list">
            {conn.agents.map((agent) => (
              <div key={agent.id} className="cia-ext-conn-card">
                <div className="cia-ext-conn-card-top">
                  <span className="cia-ext-conn-card-icon">🧠</span>
                  <input
                    className="cia-ext-conn-name-input"
                    value={agent.name}
                    placeholder="Agent name (e.g. M365 Copilot)"
                    onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                  />
                  <label className="cia-ext-conn-switch" title="Enable / disable">
                    <input
                      type="checkbox"
                      checked={agent.enabled}
                      onChange={(e) => updateAgent(agent.id, { enabled: e.target.checked })}
                    />
                    <span className="cia-ext-conn-switch-track" />
                  </label>
                  <button
                    type="button"
                    className="cia-ext-conn-remove"
                    onClick={() => removeAgent(agent.id)}
                    title="Remove agent"
                  >
                    ×
                  </button>
                </div>
                <input
                  className="cia-ext-conn-url-input"
                  value={agent.url}
                  placeholder="Endpoint URL (e.g. https://…/copilot/agent)"
                  autoComplete="off"
                  onChange={(e) => updateAgent(agent.id, { url: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* App Connectors */}
      <section className="cia-ext-conn-section">
        <div className="cia-ext-conn-head">
          <h4>🔗 App Connectors</h4>
        </div>
        <p className="cia-ext-options-help">
          Let the assistant search your apps while you chat. Credentials are stored locally in this browser.
        </p>

        <div className="cia-ext-conn-list">
          {APP_CONNECTORS.map((c) => {
            const cfg = conn.apps[c.id] ?? {};
            const configured = Boolean(cfg.siteUrl && cfg.email && cfg.apiToken);
            return (
              <AppConnectorCard
                key={c.id}
                meta={c}
                cfg={cfg}
                configured={configured}
                onChange={(patch) => updateApp(c.id, patch)}
              />
            );
          })}
        </div>
      </section>

      {saved ? <p className="cia-ext-conn-saved">Saved ✓</p> : null}
    </div>
  );
}

function AppConnectorCard({ meta, cfg, configured, onChange }) {
  const [open, setOpen] = useState(!configured);
  const [showToken, setShowToken] = useState(false);

  return (
    <div className={`cia-ext-conn-card${configured ? " is-configured" : ""}`}>
      <div className="cia-ext-conn-card-top">
        <span className="cia-ext-conn-card-icon">{meta.icon}</span>
        <strong className="cia-ext-conn-card-title">{meta.label}</strong>
        <span className={`cia-ext-conn-pill${configured ? " is-on" : ""}`}>
          {configured ? "Connected" : "Not set up"}
        </span>
        <button type="button" className="cia-ext-conn-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▸"}
        </button>
      </div>

      {open ? (
        <div className="cia-ext-conn-fields">
          <label className="cia-ext-field">
            <span>Site URL</span>
            <input
              value={cfg.siteUrl ?? ""}
              placeholder="https://your-org.atlassian.net"
              autoComplete="off"
              onChange={(e) => onChange({ siteUrl: e.target.value })}
            />
          </label>
          <label className="cia-ext-field">
            <span>Email</span>
            <input
              value={cfg.email ?? ""}
              placeholder="you@yourorg.com"
              autoComplete="off"
              onChange={(e) => onChange({ email: e.target.value })}
            />
          </label>
          <label className="cia-ext-field">
            <span>API token</span>
            <div className="cia-ext-account-row">
              <input
                type={showToken ? "text" : "password"}
                value={cfg.apiToken ?? ""}
                placeholder="Paste Atlassian API token"
                autoComplete="off"
                onChange={(e) => onChange({ apiToken: e.target.value })}
              />
              <button type="button" className="cia-ext-secondary-btn" onClick={() => setShowToken((v) => !v)}>
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <p className="cia-ext-options-help">{meta.help}</p>
        </div>
      ) : null}
    </div>
  );
}
