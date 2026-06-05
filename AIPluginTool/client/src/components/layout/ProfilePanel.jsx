import { useEffect, useRef, useState } from "react";
import { environmentLabel, getInitials, normalizeProfile } from "../../lib/profile.js";
import { ConnectorsManager } from "./ConnectorsManager.jsx";
import {
  getProfile,
  updateProfile,
  updateDisplayName as apiUpdateDisplayName,
  changePassword as apiChangePassword,
} from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../ui/ToastProvider.jsx";
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
  const fileInputRef = useRef(null);
  const toast = useToast();
  const { user, authDisabled, updateUserDisplayName } = useAuth();

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

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      const msg = "File size too large — image must be smaller than 2 MB";
      console.error("[ProfilePanel] Avatar upload rejected:", msg, { fileName: file.name, size: file.size });
      toast.error(msg);
      setError(msg);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      updateField("profile_picture", e.target.result);
      toast.success("Profile picture updated");
    };
    reader.onerror = (e) => {
      console.error("[ProfilePanel] FileReader error:", e);
      setError("Failed to read image file");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
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
      console.error("[ProfilePanel] Save failed:", saveError);
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
            {form.profile_picture ? (
              <img src={form.profile_picture} className="t1-profile-avatar large t1-profile-avatar-img" alt={form.profile_name} />
            ) : (
              <span className="t1-profile-avatar large">{initials}</span>
            )}
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
              <div className="t1-avatar-upload">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="t1-avatar-file-input"
                  onChange={handleAvatarChange}
                />
                <button
                  type="button"
                  className="t1-avatar-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload profile picture"
                >
                  {form.profile_picture ? (
                    <img src={form.profile_picture} className="t1-avatar-preview" alt="Profile" />
                  ) : (
                    <span className="t1-profile-avatar large">{initials}</span>
                  )}
                  <span className="t1-avatar-upload-overlay">Change photo</span>
                </button>
                {form.profile_picture ? (
                  <button
                    type="button"
                    className="t1-avatar-remove"
                    onClick={() => updateField("profile_picture", "")}
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
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

              {!authDisabled ? (
                <AccountSection
                  user={user}
                  toast={toast}
                  onDisplayNameChanged={updateUserDisplayName}
                />
              ) : null}
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

function AccountSection({ user, toast, onDisplayNameChanged }) {
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
  }, [user?.displayName]);

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error("Display name cannot be empty");
      return;
    }
    setSavingName(true);
    try {
      const result = await apiUpdateDisplayName(trimmed);
      onDisplayNameChanged?.(result.displayName ?? trimmed);
      toast.success("Display name updated");
    } catch (error) {
      toast.error(error.message ?? "Failed to update display name");
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      await apiChangePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (error) {
      toast.error(error.message ?? "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="t1-settings-section t1-account-section">
      <h3>Account</h3>
      <p>Change how your name appears across the app and forums, or update your password.</p>

      <label>
        Display name
        <div className="t1-account-row">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
          />
          <button
            type="button"
            className="t1-btn-secondary"
            onClick={handleSaveName}
            disabled={savingName}
          >
            {savingName ? "Saving…" : "Update"}
          </button>
        </div>
      </label>

      <h4 className="t1-account-subhead">Change password</h4>
      <label>
        Current password
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
        />
      </label>
      <label>
        New password
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirm new password
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
        />
      </label>
      <button
        type="button"
        className="t1-btn-secondary"
        onClick={handleChangePassword}
        disabled={savingPassword || !currentPassword || !newPassword}
      >
        {savingPassword ? "Updating…" : "Change password"}
      </button>
    </div>
  );
}

function SettingsTab({ settings, showApiKey, onToggleApiKey, onUpdate, onUpdateAi }) {
  const provider = AI_PROVIDERS.find((p) => p.id === settings.ai.provider) ?? AI_PROVIDERS[0];

  const handleProviderChange = (event) => {
    const next = AI_PROVIDERS.find((p) => p.id === event.target.value) ?? AI_PROVIDERS[0];
    const updates = {
      provider: next.id,
      baseUrl: next.defaultBaseUrl ?? "",
      model: next.defaultModel ?? "",
    };
    onUpdateAi(updates);
  };

  const updateCopilotStudio = (updates) => {
    onUpdateAi({
      copilotStudio: { ...settings.ai.copilotStudio, ...updates },
    });
  };

  // ---- Multiple Copilot Studio agents ----
  const agents = settings.ai.copilotAgents ?? [];
  const activeAgentId = settings.ai.activeCopilotAgentId ?? "";
  const newAgentId = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const addAgent = () => {
    const id = newAgentId();
    const next = [...agents, { id, name: "", directLineSecret: "" }];
    onUpdateAi({
      copilotAgents: next,
      ...(agents.length === 0 ? { activeCopilotAgentId: id } : {}),
    });
  };
  const updateAgent = (id, patch) =>
    onUpdateAi({ copilotAgents: agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const removeAgent = (id) => {
    const next = agents.filter((a) => a.id !== id);
    onUpdateAi({
      copilotAgents: next,
      ...(activeAgentId === id ? { activeCopilotAgentId: next[0]?.id ?? "" } : {}),
    });
  };
  const selectAgent = (id) => onUpdateAi({ activeCopilotAgentId: id });

  return (
    <div className="t1-profile-form">
      <ConnectorsManager />

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
        <h3>Insights under replies</h3>
        <p>
          Charts, comparisons, and takeaways below assistant messages. Turn off to hide the insights
          block entirely.
        </p>
        <label className="t1-profile-toggle">
          <input
            type="checkbox"
            checked={settings.showInsights !== false}
            onChange={(event) => onUpdate({ showInsights: event.target.checked })}
          />
          Show insights under replies
        </label>
        <label
          className={`t1-profile-toggle${settings.showInsights === false ? " is-disabled" : ""}`}
        >
          <input
            type="checkbox"
            checked={Boolean(settings.showArtifactsByDefault)}
            disabled={settings.showInsights === false}
            onChange={(event) => onUpdate({ showArtifactsByDefault: event.target.checked })}
          />
          Always expand insights under replies
        </label>
        <p className="t1-settings-hint">
          When insights are shown, they stay collapsed until you expand them unless this option is on.
        </p>
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

        {provider.connector === "copilot-studio" ? (
          <div className="t1-copilot-agents">
            <div className="t1-copilot-agents-head">
              <span>Copilot Studio agents</span>
              <button type="button" className="t1-add-agent-btn" onClick={addAgent}>
                + Add agent
              </button>
            </div>
            {agents.length === 0 ? (
              <p className="t1-settings-hint">
                No agents yet. Add one with its Direct Line secret (Copilot Studio → Channels →
                Direct Line) to route chat through it.
              </p>
            ) : (
              <div className="t1-agent-list">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`t1-agent-card${activeAgentId === agent.id ? " is-active" : ""}`}
                  >
                    <div className="t1-agent-card-row">
                      <label
                        className="t1-agent-radio"
                        title={
                          settings.ai.copilotBroadcast && agents.length > 1
                            ? "Disabled while broadcasting to all agents"
                            : "Use this agent for chats"
                        }
                      >
                        <input
                          type="radio"
                          name="active-copilot-agent"
                          checked={activeAgentId === agent.id}
                          disabled={settings.ai.copilotBroadcast && agents.length > 1}
                          onChange={() => selectAgent(agent.id)}
                        />
                        <span>Use</span>
                      </label>
                      <input
                        className="t1-agent-name"
                        placeholder="Agent name"
                        value={agent.name ?? ""}
                        onChange={(event) => updateAgent(agent.id, { name: event.target.value })}
                      />
                      <button
                        type="button"
                        className="t1-agent-remove"
                        onClick={() => removeAgent(agent.id)}
                        aria-label="Remove agent"
                      >
                        ×
                      </button>
                    </div>
                    <div className="t1-api-key-row">
                      <input
                        className="t1-api-key-input"
                        type={showApiKey ? "text" : "password"}
                        placeholder="Direct Line secret"
                        value={agent.directLineSecret ?? ""}
                        onChange={(event) =>
                          updateAgent(agent.id, { directLineSecret: event.target.value })
                        }
                      />
                      <button type="button" className="t1-api-key-toggle" onClick={onToggleApiKey}>
                        {showApiKey ? "Hide" : "Show"}
                      </button>
                    </div>
                    <input
                      className="t1-agent-keywords"
                      placeholder="Routing keywords (e.g. billing, invoices, payments)"
                      value={agent.keywords ?? ""}
                      onChange={(event) => updateAgent(agent.id, { keywords: event.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}
            {agents.length > 1 ? (
              <label className="t1-profile-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(settings.ai.copilotBroadcast)}
                  onChange={(event) => onUpdateAi({ copilotBroadcast: event.target.checked })}
                />
                Broadcast each prompt to all agents and auto-route the best answer
              </label>
            ) : null}
            <p className="t1-settings-hint">
              {settings.ai.copilotBroadcast && agents.length > 1
                ? "Routing keywords win first: a prompt that matches an agent's keywords goes straight to that agent. If nothing matches, the prompt is broadcast to all agents and the most relevant reply is returned."
                : "Switch the active agent here; the selected agent handles your chats while the provider is set to Copilot Studio."}
            </p>
          </div>
        ) : provider.requiresKey ? (
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
              <div className="t1-api-key-row">
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
                />
                <button type="button" className="t1-btn-secondary" onClick={onToggleApiKey}>
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

            <div className="t1-settings-callout" role="note">
              <strong>What this connects to</strong>
              <ul>
                <li>
                  <strong>Works today:</strong> chat uses the server&apos;s provider (Cloudflare Workers AI
                  from <code>server/.env</code>). Pick <em>Use server default</em> above.
                </li>
                <li>
                  <strong>OpenAI-compatible endpoints</strong> (Ollama, Groq, Together, Azure OpenAI)
                  can be saved here for a future release — they do <em>not</em> drive chat yet.
                </li>
                <li>
                  <strong>Microsoft Copilot</strong> (browser / M365 / GitHub Copilot) is a separate
                  product and is <em>not</em> plugged in via this URL field. Use Azure OpenAI or your
                  server token for this assistant instead.
                </li>
              </ul>
            </div>
          </>
        ) : (
          <p className="t1-settings-callout" role="note">
            Chat uses the API server configuration (Cloudflare Workers AI from{" "}
            <code>server/.env</code>). To use a Copilot Studio agent instead, pick{" "}
            <strong>Copilot Studio agent</strong> above and configure Direct Line on the server.
          </p>
        )}
      </div>
    </div>
  );
}

function CopilotStudioConnectorForm({ copilotStudio, showSecret, onToggleSecret, onChange }) {
  return (
    <div className="t1-copilot-connector">
      <label>
        Agent display name
        <input
          value={copilotStudio.agentName ?? ""}
          onChange={(event) => onChange({ agentName: event.target.value })}
          placeholder="e.g. CiA Transition Agent"
        />
        <small className="t1-settings-help">Label for your reference; optional on server.</small>
      </label>

      <label>
        Environment ID
        <input
          value={copilotStudio.environmentId ?? ""}
          onChange={(event) => onChange({ environmentId: event.target.value })}
          placeholder="Power Platform environment GUID"
        />
      </label>

      <label>
        Bot / schema name
        <input
          value={copilotStudio.botId ?? ""}
          onChange={(event) => onChange({ botId: event.target.value })}
          placeholder="copilots_header_… or bot schema name"
        />
      </label>

      <label>
        Microsoft Entra tenant ID
        <input
          value={copilotStudio.tenantId ?? ""}
          onChange={(event) => onChange({ tenantId: event.target.value })}
          placeholder="Optional — for your records"
        />
      </label>

      <label>
        Direct Line secret (reference only)
        <div className="t1-api-key-row">
          <input
            className="t1-api-key-input"
            type={showSecret ? "text" : "password"}
            value={copilotStudio.directLineSecret ?? ""}
            onChange={(event) => onChange({ directLineSecret: event.target.value })}
            placeholder="Paste from Copilot Studio → Channels → Direct Line"
            autoComplete="off"
          />
          <button type="button" className="t1-btn-secondary" onClick={onToggleSecret}>
            {showSecret ? "Hide" : "Show"}
          </button>
        </div>
        <small className="t1-settings-help">
          Stored locally for your notes only — chat uses{" "}
          <code>COPILOT_STUDIO_DIRECT_LINE_SECRET</code> in <code>server/.env</code>, not this field.
        </small>
      </label>

      <div className="t1-settings-callout" role="note">
        <strong>Enable on the server</strong>
        <ol>
          <li>
            In Copilot Studio, publish your agent and open <strong>Channels → Direct Line</strong>.
            Copy the secret.
          </li>
          <li>
            Add to <code>server/.env</code>:
            <pre className="t1-env-snippet">{`COPILOT_STUDIO_ENABLED=true
COPILOT_STUDIO_DIRECT_LINE_SECRET=your-direct-line-secret
COPILOT_STUDIO_AGENT_NAME=CiA Transition Agent`}</pre>
          </li>
          <li>Restart the API server, then select this provider and send a chat message.</li>
        </ol>
        <p>
          This is <strong>not</strong> the same as Microsoft 365 Copilot in Teams (Graph + Entra).
          It routes through your custom Copilot Studio bot via Direct Line.
        </p>
      </div>
    </div>
  );
}
