import { useEffect, useState } from "react";
import { getConnections, setConnections } from "../../lib/storage.js";
import { getAiProviders, setAiProviders, PROVIDER_TYPES, providerMeta } from "../../lib/aiProviders.js";

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

function blankProvider(type = "openai") {
  const m = providerMeta(type);
  return { id: `ai-${Date.now()}`, type, label: m.label, apiKey: "", baseUrl: m.defaultBase, model: m.defaultModel, enabled: true };
}

export function ConnectionsSettings() {
  const [conn, setConn] = useState(null);
  const [ai, setAi] = useState(null); // { providers, activeId }
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getConnections().then(setConn);
    getAiProviders().then(setAi);
  }, []);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500); };

  const persist = (next) => { setConn(next); void setConnections(next); flash(); };
  const persistAi = (next) => { setAi(next); void setAiProviders(next); flash(); };

  if (!conn || !ai) return <p className="cia-ext-options-help">Loading…</p>;

  // ── AI providers ─────────────────────────────────────────────────────────────
  const addProvider = () => {
    const p = blankProvider();
    // Newly added providers are active by default (the chat can use several).
    persistAi({ providers: [...ai.providers, p], activeIds: [...ai.activeIds, p.id] });
  };
  const updateProvider = (id, patch) => {
    const providers = ai.providers.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p, ...patch };
      // Reset base/model defaults when the type changes.
      if (patch.type && patch.type !== p.type) {
        const m = providerMeta(patch.type);
        next.baseUrl = m.defaultBase;
        next.model = m.defaultModel;
        if (!p.label || p.label === providerMeta(p.type).label) next.label = m.label;
      }
      return next;
    });
    persistAi({ ...ai, providers });
  };
  const removeProvider = (id) =>
    persistAi({ providers: ai.providers.filter((p) => p.id !== id), activeIds: ai.activeIds.filter((x) => x !== id) });
  const toggleActive = (id) =>
    persistAi({ ...ai, activeIds: ai.activeIds.includes(id) ? ai.activeIds.filter((x) => x !== id) : [...ai.activeIds, id] });

  // ── App connectors ─────────────────────────────────────────────────────────
  const updateApp = (id, patch) =>
    persist({ ...conn, apps: { ...conn.apps, [id]: { ...(conn.apps[id] ?? {}), ...patch } } });

  return (
    <div className="cia-ext-conn">
      {/* AI Providers */}
      <section className="cia-ext-conn-section">
        <div className="cia-ext-conn-head">
          <h4>🤖 AI Providers</h4>
          <button type="button" className="cia-ext-secondary-btn cia-ext-conn-add" onClick={addProvider}>
            + Add provider
          </button>
        </div>
        <p className="cia-ext-options-help">
          Bring your own AI — add an OpenAI-compatible, Anthropic (Claude) or Google Gemini key.
          Mark <strong>several active</strong> to have the chat answer with all of them at once. Keys
          are stored locally in this browser.
        </p>

        {ai.providers.length === 0 ? (
          <div className="cia-ext-conn-empty">No providers yet — add one to use your own AI (otherwise the built-in model is used).</div>
        ) : (
          <div className="cia-ext-conn-list">
            {ai.providers.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                active={ai.activeIds.includes(p.id)}
                onChange={(patch) => updateProvider(p.id, patch)}
                onRemove={() => removeProvider(p.id)}
                onActivate={() => toggleActive(p.id)}
              />
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

function ProviderCard({ provider, active, onChange, onRemove, onActivate }) {
  const [showKey, setShowKey] = useState(false);
  const meta = providerMeta(provider.type);
  const ready = Boolean(provider.apiKey && provider.model);

  return (
    <div className={`cia-ext-conn-card${active ? " is-configured" : ""}`}>
      <div className="cia-ext-conn-card-top">
        <span className="cia-ext-conn-card-icon">🧠</span>
        <select
          className="cia-ext-conn-name-input"
          value={provider.type}
          onChange={(e) => onChange({ type: e.target.value })}
          title="Provider type"
        >
          {PROVIDER_TYPES.map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>
        <button
          type="button"
          className={`cia-ext-conn-pill${active ? " is-on" : ""}`}
          onClick={onActivate}
          title={active ? "Active — used for AI" : "Use this provider"}
        >
          {active ? "✓ Active" : "Use"}
        </button>
        <button type="button" className="cia-ext-conn-remove" onClick={onRemove} title="Remove">×</button>
      </div>

      <div className="cia-ext-conn-fields">
        <label className="cia-ext-field">
          <span>API key</span>
          <div className="cia-ext-account-row">
            <input
              type={showKey ? "text" : "password"}
              value={provider.apiKey ?? ""}
              placeholder="Paste your API key"
              autoComplete="off"
              onChange={(e) => onChange({ apiKey: e.target.value })}
            />
            <button type="button" className="cia-ext-secondary-btn" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <label className="cia-ext-field">
          <span>Model</span>
          <input
            value={provider.model ?? ""}
            placeholder={meta.defaultModel}
            autoComplete="off"
            onChange={(e) => onChange({ model: e.target.value })}
          />
        </label>

        {meta.needsBase ? (
          <label className="cia-ext-field">
            <span>Base URL</span>
            <input
              value={provider.baseUrl ?? ""}
              placeholder={meta.defaultBase}
              autoComplete="off"
              onChange={(e) => onChange({ baseUrl: e.target.value })}
            />
          </label>
        ) : null}

        <p className="cia-ext-options-help">
          {meta.keyHint}
          {!ready ? " — add a key and model, then click “Use”." : ""}
        </p>
      </div>
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
