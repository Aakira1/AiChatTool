import { useState } from "react";
import { clearConnectorProvider, saveConnectorProvider } from "../lib/api.js";

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

export function ConnectorProviderSetup({ provider, onSaved }) {
  const [clientId, setClientId] = useState(provider.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [tenant, setTenant] = useState(provider.tenant ?? "common");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedNote, setSavedNote] = useState(null);

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
