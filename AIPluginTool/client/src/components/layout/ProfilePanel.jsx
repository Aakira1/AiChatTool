import { useEffect, useState } from "react";
import { environmentLabel, getInitials, normalizeProfile } from "../../lib/profile.js";
import { getProfile, updateProfile } from "../../lib/api.js";

const ENV_OPTIONS = [
  { value: "demo", label: "Demo" },
  { value: "uat", label: "UAT" },
  { value: "production", label: "Production" },
];

export function ProfilePanel({ open, initialTab = "profile", onClose, onSaved }) {
  const [tab, setTab] = useState(initialTab);
  const [form, setForm] = useState(normalizeProfile());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTab(initialTab);
    setError(null);
    getProfile()
      .then((data) => setForm(normalizeProfile(data)))
      .catch(() => setForm(normalizeProfile()));
  }, [open, initialTab]);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
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
          ) : (
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
          )}

          {error ? <p className="t1-profile-error">{error}</p> : null}
        </div>

        <footer className="t1-profile-panel-footer">
          <button type="button" className="t1-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="t1-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}
