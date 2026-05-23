import { useEffect, useState } from "react";
import { environmentLabel, getInitials, normalizeProfile } from "../../lib/profile.js";
import { getProfile, updateProfile } from "../../lib/api.js";
import {
  AI_PROVIDERS,
  DENSITIES,
  THEMES,
  applySettings,
  getSettings,
  maskApiKey,
  saveSettings,
} from "../../lib/settings.js";

const ENV_OPTIONS = [
  { value: "demo", label: "Demo" },
  { value: "uat", label: "UAT" },
  { value: "production", label: "Production" },
];

export function ProfilePanel({ open, initialTab = "profile", onClose, onSaved }) {
  const [tab, setTab] = useState(initialTab);
  const [form, setForm] = useState(normalizeProfile());
  const [settings, setSettings] = useState(() => getSettings());
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTab(initialTab);
    setError(null);
    setSettings(getSettings());
    setShowApiKey(false);
    getProfile()
      .then((data) => setForm(normalizeProfile(data)))
      .catch(() => setForm(normalizeProfile()));
  }, [open, initialTab]);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateSetting = (updates) => {
    const next = saveSettings(updates);
    setSettings(next);
    applySettings(next);
  };

  const updateAiSetting = (updates) => {
    const next = saveSettings({ ai: { ...settings.ai, ...updates } });
    setSettings(next);
  };

  const handleSave = async () => {
    if (tab === "settings") {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await updateProfile(form);
      const normalized = normalizeProfile(saved);
      setForm(normalized);
      onSaved?.(normalized);
      onClose();
    } catch (saveError) {
      setError(saveError.message ?? "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  const initials = getInitials(form.profile_name);

  return (
    <div className="t1-profile-overlay" role="presentation" onClick={onClose}>
      <div
        className="t1-profile-panel"
        role="dialog"
        aria-labelledby="profile-panel-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="t1-profile-panel-header">
          <div className="t1-profile-panel-user">
            <span className="t1-profile-avatar large">{initials}</span>
            <div>
              <h2 id="profile-panel-title">{form.profile_name}</h2>
              <p>{form.profile_role}</p>
              <span className={`t1-env-badge ${form.profile_environment}`}>
                {environmentLabel(form.profile_environment)}
              </span>
            </div>
          </div>
          <button type="button" className="t1-profile-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="t1-profile-tabs">
          <button
            type="button"
            className={tab === "profile" ? "active" : ""}
            onClick={() => setTab("profile")}
          >
            Profile
          </button>
          <button
            type="button"
            className={tab === "preferences" ? "active" : ""}
            onClick={() => setTab("preferences")}
          >
            Preferences
          </button>
          <button
            type="button"
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
        </div>

        <div className="t1-profile-panel-body">
          {tab === "profile" ? (
            <div className="t1-profile-form">
              <label>
                Full name
                <input
                  value={form.profile_name}
                  onChange={(event) => updateField("profile_name", event.target.value)}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.profile_email}
                  onChange={(event) => updateField("profile_email", event.target.value)}
                />
              </label>
              <label>
                Role
                <input
                  value={form.profile_role}
                  onChange={(event) => updateField("profile_role", event.target.value)}
                />
              </label>
              <label>
                Team
                <input
                  value={form.profile_team}
                  onChange={(event) => updateField("profile_team", event.target.value)}
                />
              </label>
              <label>
                Environment
                <select
                  value={form.profile_environment}
                  onChange={(event) => updateField("profile_environment", event.target.value)}
                >
                  {ENV_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : tab === "preferences" ? (
            <div className="t1-profile-form">
              <label>
                Response style
                <textarea
                  rows={2}
                  value={form.response_style}
                  onChange={(event) => updateField("response_style", event.target.value)}
                />
              </label>
              <label>
                Tone
                <input value={form.tone} onChange={(event) => updateField("tone", event.target.value)} />
              </label>
              <label>
                Format
                <input value={form.format} onChange={(event) => updateField("format", event.target.value)} />
              </label>
              <label className="t1-profile-toggle">
                <input
                  type="checkbox"
                  checked={form.notifications_enabled === "true"}
                  onChange={(event) =>
                    updateField("notifications_enabled", event.target.checked ? "true" : "false")
                  }
                />
                Email notifications for case insights
              </label>
            </div>
          ) : (
            <SettingsTab
              settings={settings}
              showApiKey={showApiKey}
              onToggleApiKey={() => setShowApiKey((value) => !value)}
              onUpdate={updateSetting}
              onUpdateAi={updateAiSetting}
            />
          )}

          {error ? <p className="t1-profile-error">{error}</p> : null}
        </div>

        <footer className="t1-profile-panel-footer">
          <button type="button" className="t1-btn-secondary" onClick={onClose}>
            {tab === "settings" ? "Close" : "Cancel"}
          </button>
          {tab === "settings" ? (
            <button type="button" className="t1-btn-primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <button type="button" className="t1-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function SettingsTab({ settings, showApiKey, onToggleApiKey, onUpdate, onUpdateAi }) {
  const provider = AI_PROVIDERS.find((p) => p.id === settings.ai.provider) ?? AI_PROVIDERS[0];

  const handleProviderChange = (event) => {
    const next = AI_PROVIDERS.find((p) => p.id === event.target.value) ?? AI_PROVIDERS[0];
    onUpdateAi({
      provider: next.id,
      baseUrl: next.defaultBaseUrl ?? "",
      model: next.defaultModel ?? "",
    });
  };

  return (
    <div className="t1-profile-form">
      <div className="t1-settings-section">
        <h3>Theme</h3>
        <p>Pick a colour scheme for the assistant.</p>
        <div className="t1-settings-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`t1-theme-swatch ${settings.theme === theme.id ? "active" : ""}`}
              onClick={() => onUpdate({ theme: theme.id })}
            >
              <span className="t1-theme-dot" style={{ background: theme.swatch }} />
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      <div className="t1-settings-section">
        <h3>Density</h3>
        <p>Adjust spacing across the assistant.</p>
        <div className="t1-density-row">
          {DENSITIES.map((density) => (
            <button
              key={density.id}
              type="button"
              className={settings.density === density.id ? "active" : ""}
              onClick={() => onUpdate({ density: density.id })}
            >
              {density.label}
            </button>
          ))}
        </div>
      </div>

      <div className="t1-settings-section">
        <h3>Insights panel</h3>
        <p>Auto-expand the insights panel under assistant replies.</p>
        <label className="t1-profile-toggle">
          <input
            type="checkbox"
            checked={Boolean(settings.showArtifactsByDefault)}
            onChange={(event) => onUpdate({ showArtifactsByDefault: event.target.checked })}
          />
          Always show insights when available
        </label>
      </div>

      <div className="t1-settings-section">
        <h3>AI connection</h3>
        <p>{provider.description}</p>

        <label>
          Provider
          <select value={settings.ai.provider} onChange={handleProviderChange}>
            {AI_PROVIDERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {provider.requiresKey ? (
          <>
            {provider.id === "cloudflare" ? (
              <label>
                Account ID
                <input
                  className="t1-api-key-input"
                  value={settings.ai.accountId ?? ""}
                  onChange={(event) => onUpdateAi({ accountId: event.target.value })}
                  placeholder="cloudflare-account-id"
                />
              </label>
            ) : null}

            <label>
              API key
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="t1-api-key-input"
                  type={showApiKey ? "text" : "password"}
                  value={settings.ai.apiKey ?? ""}
                  onChange={(event) => onUpdateAi({ apiKey: event.target.value })}
                  placeholder={
                    settings.ai.apiKey
                      ? maskApiKey(settings.ai.apiKey)
                      : "sk-..."
                  }
                  autoComplete="off"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="t1-btn-secondary"
                  onClick={onToggleApiKey}
                  style={{ padding: "0 12px" }}
                >
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>
              <small className="t1-settings-help">
                Stored locally in your browser only — never synced. Clear it anytime by emptying the field.
              </small>
            </label>

            <label>
              Base URL
              <input
                value={settings.ai.baseUrl ?? ""}
                onChange={(event) => onUpdateAi({ baseUrl: event.target.value })}
                placeholder={provider.defaultBaseUrl}
              />
            </label>

            <label>
              Model
              <input
                value={settings.ai.model ?? ""}
                onChange={(event) => onUpdateAi({ model: event.target.value })}
                placeholder={provider.defaultModel}
              />
            </label>

            <small className="t1-settings-help">
              Note: API key overrides are not yet wired into the backend. Today these settings are stored
              for upcoming per-user model routing — the server's configured provider still serves chat.
            </small>
          </>
        ) : null}
      </div>
    </div>
  );
}
