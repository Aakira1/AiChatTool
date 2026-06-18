import { useState } from "react";
import { clearConnectorProvider, saveConnectorProvider, testConnectorProvider } from "../lib/api.js";

const PROVIDER_LABELS = {
  google: "Google (Drive)",
  microsoft: "Microsoft (OneDrive, SharePoint, Teams)",
  atlassian: "Atlassian (Jira, Confluence)",
};

const PROVIDER_HELP = {
  google: "console.cloud.google.com → APIs & Services → Credentials → OAuth client (Web).",
  microsoft: "portal.azure.com → App registrations → your app → Certificates & secrets.",
  atlassian: "developer.atlassian.com → your app → OAuth 2.0 (3LO) → Settings.",
};

function BasicAuthProviderSetup({ provider, onSaved }) {
  const [siteUrl, setSiteUrl] = useState(provider.siteUrl ?? "");
  const [email, setEmail] = useState(provider.email ?? "");
  const [apiToken, setApiToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [savedNote, setSavedNote] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const save = async () => {
    if (!siteUrl.trim() || !email.trim()) {
      setError("Site URL and Email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedNote(null);
    setTestResult(null);
    try {
      await saveConnectorProvider(provider.provider, {
        clientId: email.trim(),
        clientSecret: apiToken.trim() || undefined,
        redirectUri: siteUrl.trim().replace(/\/$/, ""),
      });
      setApiToken("");
      setSavedNote("Connected");
      onSaved?.();
    } catch (saveError) {
      setError(saveError.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await testConnectorProvider(provider.provider);
      setTestResult(result);
    } catch (testError) {
      setTestResult({ ok: false, error: testError.message });
    } finally {
      setTesting(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setError(null);
    setTestResult(null);
    try {
      await clearConnectorProvider(provider.provider);
      setSiteUrl("");
      setEmail("");
      setApiToken("");
      setSavedNote("Cleared");
      onSaved?.();
    } catch (clearError) {
      setError(clearError.message ?? "Failed to clear");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cia-ext-provider-setup">
      <div className="cia-ext-provider-setup-head">
        <strong>{PROVIDER_LABELS[provider.provider] ?? provider.provider}</strong>
        <span className="cia-ext-connector-badge">
          {provider.configured ? "Connected" : "Not connected"}
        </span>
      </div>
      <small className="cia-ext-options-help">
        {PROVIDER_HELP[provider.provider]}
        {" "}Uses your email + API token (Basic Auth) — no OAuth app needed.
      </small>

      <label>
        Site URL
        <input
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
          placeholder="https://your-org.atlassian.net"
          autoComplete="off"
        />
      </label>

      <label>
        Email
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourorg.com"
          autoComplete="off"
        />
      </label>

      <label>
        API Token
        <span className="cia-ext-secret-row">
          <input
            type={showToken ? "text" : "password"}
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={provider.hasToken ? "•••• stored — leave blank to keep" : "Paste API token here"}
            autoComplete="off"
          />
          <button type="button" className="cia-ext-secondary-btn" onClick={() => setShowToken((v) => !v)}>
            {showToken ? "Hide" : "Show"}
          </button>
        </span>
      </label>

      {error ? <p className="cia-ext-banner cia-ext-banner-error">{error}</p> : null}

      {testResult ? (
        <div className={`cia-ext-banner ${testResult.ok ? "cia-ext-banner-success" : "cia-ext-banner-error"}`}>
          {testResult.ok
            ? "✓ Connection verified — Jira and Confluence are reachable."
            : testResult.error ?? "Connection failed."}
          {testResult.results?.map((r) => (
            <div key={r.label}>
              {r.ok ? "✓" : "✗"} {r.label}: {r.ok ? "OK" : `HTTP ${r.status ?? r.error}`}
              {r.hint ? ` — ${r.hint}` : ""}
            </div>
          ))}
        </div>
      ) : null}

      <div className="cia-ext-provider-setup-actions">
        <button type="button" className="cia-ext-primary-btn" onClick={() => void save()} disabled={saving || testing}>
          {saving ? "Saving…" : "Save & Connect"}
        </button>
        {provider.configured ? (
          <>
            <button type="button" className="cia-ext-secondary-btn" onClick={() => void test()} disabled={saving || testing}>
              {testing ? "Testing…" : "Test connection"}
            </button>
            <button type="button" className="cia-ext-secondary-btn" onClick={() => void clear()} disabled={saving || testing}>
              Clear
            </button>
          </>
        ) : null}
        {savedNote ? <span className="cia-ext-options-saved">{savedNote} ✓</span> : null}
      </div>
    </div>
  );
}

export function ConnectorProviderSetup({ provider, onSaved }) {
  const [clientId, setClientId] = useState(provider.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [tenant, setTenant] = useState(provider.tenant ?? "common");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedNote, setSavedNote] = useState(null);

  if (provider.authType === "basic") {
    return <BasicAuthProviderSetup provider={provider} onSaved={onSaved} />;
  }

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedNote(null);
    try {
      await saveConnectorProvider(provider.provider, {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
        ...(provider.supportsTenant ? { tenant: tenant.trim() || "common" } : {}),
      });
      setClientSecret("");
      setSavedNote("Saved");
      onSaved?.();
    } catch (saveError) {
      setError(saveError.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setError(null);
    try {
      await clearConnectorProvider(provider.provider);
      setClientId("");
      setClientSecret("");
      setSavedNote("Cleared");
      onSaved?.();
    } catch (clearError) {
      setError(clearError.message ?? "Failed to clear");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cia-ext-provider-setup">
      <div className="cia-ext-provider-setup-head">
        <strong>{PROVIDER_LABELS[provider.provider] ?? provider.provider}</strong>
        <span className="cia-ext-connector-badge">
          {provider.configured ? (provider.fromEnv ? "From server/.env" : "Configured") : "Not configured"}
        </span>
      </div>
      <small className="cia-ext-options-help">{PROVIDER_HELP[provider.provider]}</small>

      <label>
        Redirect / callback URL (paste into the provider console)
        <input value={provider.redirectUri} readOnly onFocus={(event) => event.target.select()} />
      </label>

      <label>
        Client ID
        <input
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          placeholder="Client / Application ID"
          autoComplete="off"
        />
      </label>

      <label>
        Client secret
        <span className="cia-ext-secret-row">
          <input
            type={showSecret ? "text" : "password"}
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder={provider.hasSecret ? "•••• stored — leave blank to keep" : "Client secret"}
            autoComplete="off"
          />
          <button type="button" className="cia-ext-secondary-btn" onClick={() => setShowSecret((v) => !v)}>
            {showSecret ? "Hide" : "Show"}
          </button>
        </span>
      </label>

      {provider.supportsTenant ? (
        <label>
          Tenant
          <input value={tenant} onChange={(event) => setTenant(event.target.value)} placeholder="common" />
        </label>
      ) : null}

      {error ? <p className="cia-ext-banner cia-ext-banner-error">{error}</p> : null}
      <div className="cia-ext-provider-setup-actions">
        <button type="button" className="cia-ext-primary-btn" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save credentials"}
        </button>
        {provider.configured && !provider.fromEnv ? (
          <button type="button" className="cia-ext-secondary-btn" onClick={() => void clear()} disabled={saving}>
            Clear
          </button>
        ) : null}
        {savedNote ? <span className="cia-ext-options-saved">{savedNote} ✓</span> : null}
      </div>
    </div>
  );
}
