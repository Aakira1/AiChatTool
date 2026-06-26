import { useCallback, useEffect, useState } from "react";
import { ConnectorIcon } from "../../lib/ConnectorIcon.jsx";
import {
  disconnectConnector,
  getConnectorConnectUrl,
  listConnectors,
  updateDisplayName,
  changePassword,
  pingHealth,
} from "../../lib/api.js";
import { getSettings, saveSettings, THEMES, applyDarkMode, allThemes, getCustomThemes } from "../../lib/settings.js";
import { APP_CATALOG } from "../../lib/apps.js";
import { getAiProviders, providerMeta } from "../../lib/aiProviders.js";
import {
  getApiBaseUrl,
  setApiBaseUrl,
  getWorkerAuthToken,
  setWorkerAuthToken,
  getConnections,
} from "../../lib/storage.js";
import { ConnectionsSettings } from "./ConnectionsSettings.jsx";

// ── Collapsible section ─────────────────────────────────────────────────────
function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="cia-ext-set-section">
      <button type="button" className={`cia-ext-set-section-head${open ? " is-open" : ""}`} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="cia-ext-set-chevron">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="cia-ext-set-section-body">{children}</div>}
    </section>
  );
}

// ── Color builder for custom themes ─────────────────────────────────────────
function buildThemeVars(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const darker = `rgb(${Math.round(r * 0.8)},${Math.round(g * 0.8)},${Math.round(b * 0.8)})`;
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  const bodyColor = lum > 140 ? "#1f1235" : "#1e293b";
  return {
    "--cia-deep": bodyColor,
    "--cia-navy": bodyColor,
    "--cia-magenta": hex,
    "--cia-magenta-dark": darker,
    "--cia-orange": hex,
    "--cia-purple": hex,
    "--cia-light": `rgba(${r},${g},${b},0.04)`,
    "--cia-soft": `rgba(${r},${g},${b},0.08)`,
    "--cia-border": `rgba(${r},${g},${b},0.18)`,
    "--cia-body": bodyColor,
    "--cia-muted": "#64748b",
  };
}

export function SettingsPanel({ onClose, onOpenFullOptions, user, standaloneMode, onProfileUpdated }) {
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState(() => getSettings());
  const [newColor, setNewColor] = useState("#e74c3c");
  const [newColorName, setNewColorName] = useState("");

  const load = useCallback(async () => {
    if (standaloneMode) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await listConnectors();
      setConnectors(data.connectors ?? []);
      setError(null);
    } catch (e) { setError(e.message ?? "Failed to load connectors"); }
    finally { setLoading(false); }
  }, [standaloneMode]);

  useEffect(() => { void load(); }, [load]);

  const updateSetting = (updates) => {
    const next = saveSettings(updates);
    setSettings(next);
    if ("darkMode" in updates) applyDarkMode(next.darkMode);
  };

  const handleConnect = async (connectorId) => {
    const url = await getConnectorConnectUrl(connectorId);
    if (chrome.tabs?.create) chrome.tabs.create({ url });
    else window.open(url, "_blank", "noopener");
  };
  const handleDisconnect = async (provider) => {
    try { await disconnectConnector(provider); await load(); }
    catch (e) { setError(e.message ?? "Failed to disconnect"); }
  };

  const themes = allThemes(settings);
  const customThemes = getCustomThemes(settings);

  const addCustomTheme = () => {
    const name = newColorName.trim() || newColor;
    const id = `custom-${Date.now()}`;
    const t = { id, label: name, swatch: newColor, vars: buildThemeVars(newColor) };
    updateSetting({ customThemes: [...customThemes, t], theme: id });
    setNewColorName("");
  };
  const removeCustomTheme = (id) => {
    const next = customThemes.filter((t) => t.id !== id);
    const updates = { customThemes: next };
    if (settings.theme === id) updates.theme = "magenta";
    updateSetting(updates);
  };

  return (
    <div className="cia-ext-settings-overlay" role="dialog" aria-label="Settings">
      <div className="cia-ext-settings-header">
        <strong>Settings</strong>
      </div>
      <div className="cia-ext-settings-body">

        {/* ── Appearance ─────────────────────────────────────── */}
        <Section title="Appearance" defaultOpen>
          <div className="cia-ext-set-row">
            <span className="cia-ext-set-label">Dark mode</span>
            <button
              type="button"
              className={`cia-ext-toggle ${settings.darkMode ? "is-on" : ""}`}
              onClick={() => updateSetting({ darkMode: !settings.darkMode })}
              aria-label="Toggle dark mode"
            >
              <span className="cia-ext-toggle-thumb" />
            </button>
          </div>

          <span className="cia-ext-set-label">Theme</span>
          <div className="cia-ext-theme-grid">
            {themes.map((t) => (
              <div key={t.id} className={`cia-ext-theme-swatch${settings.theme === t.id ? " is-active" : ""}`}>
                <button
                  type="button"
                  onClick={() => updateSetting({ theme: t.id })}
                  title={t.label}
                  aria-label={`${t.label} theme`}
                  aria-pressed={settings.theme === t.id}
                  className="cia-ext-theme-swatch-btn"
                >
                  <span className="cia-ext-theme-chip" style={{ background: t.swatch }} />
                  <span className="cia-ext-theme-name">{t.label}</span>
                </button>
                {t.id.startsWith("custom-") && (
                  <button className="cia-ext-theme-remove" onClick={() => removeCustomTheme(t.id)} title="Remove">×</button>
                )}
              </div>
            ))}
          </div>

          <div className="cia-ext-set-custom-color">
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="cia-ext-set-color-input" title="Pick a color" />
            <input type="text" value={newColorName} onChange={(e) => setNewColorName(e.target.value)} placeholder="Color name" className="cia-ext-set-color-name" maxLength={20} />
            <button type="button" className="cia-ext-set-color-add" onClick={addCustomTheme}>Add</button>
          </div>

          <span className="cia-ext-set-label" style={{ marginTop: 10 }}>Density</span>
          <div className="cia-ext-segmented">
            {[{ id: "comfortable", label: "Comfortable" }, { id: "compact", label: "Compact" }].map((d) => (
              <button
                key={d.id}
                type="button"
                className={`cia-ext-segmented-btn${(settings.density ?? "comfortable") === d.id ? " is-active" : ""}`}
                onClick={() => updateSetting({ density: d.id })}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Section>

        {/* ── Connection status ───────────────────────────────── */}
        <Section title="Connection" defaultOpen>
          <ConnectionStatus standaloneMode={standaloneMode} />
        </Section>

        {/* ── Backend ─────────────────────────────────────────── */}
        <Section title="Backend">
          <BackendSection standaloneMode={standaloneMode} />
        </Section>

        {/* ── Account ─────────────────────────────────────────── */}
        {!standaloneMode && (
          <Section title="Account">
            <AccountSection user={user} onProfileUpdated={onProfileUpdated} />
          </Section>
        )}

        {/* ── AI & Connectors ─────────────────────────────────── */}
        <Section title="AI & Connections">
          {standaloneMode ? (
            <ConnectionsSettings />
          ) : (
            <>
              <p className="cia-ext-set-hint">Connect apps the assistant can search while you chat.</p>
              {error ? <p className="cia-ext-banner cia-ext-banner-error">{error}</p> : null}
              {loading ? (
                <p className="cia-ext-set-hint">Loading…</p>
              ) : (
                <div className="cia-ext-connector-list">
                  {connectors.map((connector) => (
                    <div key={connector.id} className="cia-ext-connector-row">
                      <span className="cia-ext-connector-icon"><ConnectorIcon id={connector.icon} /></span>
                      <div className="cia-ext-connector-meta"><strong>{connector.label}</strong></div>
                      {!connector.configured ? (
                        <span className="cia-ext-connector-badge">Not set up</span>
                      ) : connector.connected ? (
                        <button type="button" className="cia-ext-secondary-btn" onClick={() => void handleDisconnect(connector.provider)}>Disconnect</button>
                      ) : (
                        <button type="button" className="cia-ext-primary-btn" onClick={() => void handleConnect(connector.id)}>Connect</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Section>

        {/* ── Floating bubble ─────────────────────────────────── */}
        <Section title="Floating bubble">
          <p className="cia-ext-set-hint">Pin an app to the on-page bubble for one-tap access.</p>
          <label className="cia-ext-field">
            <span>Quick-launch app</span>
            <select value={settings.pinnedApp ?? ""} onChange={(e) => updateSetting({ pinnedApp: e.target.value })}>
              <option value="">None</option>
              {APP_CATALOG.filter((a) => a.id !== "settings").map((a) => (
                <option key={a.id} value={a.id}>{a.icon} {a.label}</option>
              ))}
            </select>
          </label>
        </Section>

        {/* ── Privacy & Vision ────────────────────────────────── */}
        <Section title="Privacy & Vision">
          <div className="cia-ext-set-row">
            <div>
              <span className="cia-ext-set-label">Privacy mode</span>
              <p className="cia-ext-set-hint">Never read or screenshot pages</p>
            </div>
            <button
              type="button"
              className={`cia-ext-toggle ${settings.privacyMode ? "is-on" : ""}`}
              onClick={() => updateSetting({ privacyMode: !settings.privacyMode })}
            >
              <span className="cia-ext-toggle-thumb" />
            </button>
          </div>
          <div className="cia-ext-set-row">
            <div>
              <span className="cia-ext-set-label">Whole page vision</span>
              <p className="cia-ext-set-hint">AI sees the entire page</p>
            </div>
            <button
              type="button"
              className={`cia-ext-toggle ${settings.wholePageVision ? "is-on" : ""}`}
              onClick={() => updateSetting({ wholePageVision: !settings.wholePageVision })}
            >
              <span className="cia-ext-toggle-thumb" />
            </button>
          </div>
          <div className="cia-ext-set-row">
            <div>
              <span className="cia-ext-set-label">Remember uploads (RAG)</span>
              <p className="cia-ext-set-hint">Index files for later recall</p>
            </div>
            <button
              type="button"
              className={`cia-ext-toggle ${settings.rememberUploads !== false ? "is-on" : ""}`}
              onClick={() => updateSetting({ rememberUploads: !(settings.rememberUploads !== false) })}
            >
              <span className="cia-ext-toggle-thumb" />
            </button>
          </div>
          <div className="cia-ext-set-row">
            <div>
              <span className="cia-ext-set-label">Show insights</span>
              <p className="cia-ext-set-hint">Under AI replies</p>
            </div>
            <button
              type="button"
              className={`cia-ext-toggle ${settings.showInsights !== false ? "is-on" : ""}`}
              onClick={() => updateSetting({ showInsights: !(settings.showInsights !== false) })}
            >
              <span className="cia-ext-toggle-thumb" />
            </button>
          </div>
        </Section>

      </div>
    </div>
  );
}

// ── Connection status (wire diagram) ────────────────────────────────────────
function ConnectionStatus({ standaloneMode }) {
  const [phase, setPhase] = useState("checking");
  const [host, setHost] = useState("");
  const [connectors, setConnectors] = useState([]);
  const [providers, setProviders] = useState([]);
  const [activeIds, setActiveIds] = useState([]);

  useEffect(() => {
    let alive = true;
    const loadConfig = async () => {
      const d = await getAiProviders();
      if (alive) { setProviders(d.providers || []); setActiveIds(d.activeIds || []); }
      try {
        let list = [];
        if (standaloneMode) {
          const c = await getConnections();
          list = [
            ...(c.agents ?? []).filter((a) => a.enabled && a.url).map((a) => ({ id: a.id, label: a.name || "Agent", icon: "🧠" })),
            ...Object.entries(c.apps ?? {}).filter(([, cfg]) => cfg.siteUrl && cfg.email && cfg.apiToken).map(([id]) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1), icon: id === "jira" ? "🔷" : id === "confluence" ? "🔶" : "🔗" })),
          ];
        } else {
          const data = await listConnectors();
          list = (data.connectors ?? []).filter((c) => c.connected).map((c) => ({ id: c.id, label: c.label, iconId: c.icon }));
        }
        if (alive) setConnectors(list);
      } catch { /* ignore */ }
    };
    (async () => {
      const base = await getApiBaseUrl();
      if (alive) setHost(base.replace(/^https?:\/\//, "").replace(/\/$/, ""));
      try { const h = await pingHealth(); if (alive) setPhase(h?.ok ? "online" : "offline"); }
      catch { if (alive) setPhase("offline"); }
      await loadConfig();
    })();
    const onChanged = (changes, area) => { if (area === "local" && (changes.aiProviders || changes.connections)) loadConfig(); };
    chrome.storage?.onChanged?.addListener?.(onChanged);
    return () => { alive = false; chrome.storage?.onChanged?.removeListener?.(onChanged); };
  }, [standaloneMode]);

  const label = phase === "online" ? "Connected" : phase === "offline" ? "Can't reach backend" : "Connecting…";
  const activeProviders = providers.filter((p) => activeIds.includes(p.id) && p.enabled !== false && p.apiKey && p.model);
  const branches = [
    { id: "backend", icon: "☁", tone: phase },
    ...providers.filter((p) => activeIds.includes(p.id) && p.enabled !== false && p.apiKey && p.model).map((p) => ({ id: p.id, icon: "🧠", tone: "online", active: true })),
    ...connectors.map((c) => ({ id: c.id, icon: c.icon ?? "🔗", iconId: c.iconId, tone: "online" })),
  ];

  return (
    <div className={`cia-ext-connstatus is-${phase}`}>
      <WireDiagram phase={phase} branches={branches} />
      <div className="cia-ext-cs-meta">
        <span className="cia-ext-cs-badge"><span className="cia-ext-cs-dot" />{label}</span>
        {host ? <span className="cia-ext-cs-host" title={host}>{host}</span> : null}
      </div>
      <div className="cia-ext-cs-conns">
        <span className="cia-ext-cs-conns-label">{activeProviders.length > 1 ? `AI models (${activeProviders.length})` : "AI model"}</span>
        <div className="cia-ext-cs-chips">
          {activeProviders.length ? activeProviders.map((p) => (
            <span key={p.id} className="cia-ext-cs-chip"><span aria-hidden="true">🧠</span>{providerMeta(p.type).label} · {p.model}<span className="cia-ext-cs-chip-tick" aria-hidden="true">✓</span></span>
          )) : (
            <span className="cia-ext-cs-chip"><span aria-hidden="true">🧠</span>Built-in model<span className="cia-ext-cs-chip-tick" aria-hidden="true">✓</span></span>
          )}
        </div>
      </div>
    </div>
  );
}

function WireDiagram({ phase, branches }) {
  const W = 300;
  const rowH = 34;
  const n = Math.max(1, branches.length);
  const H = Math.max(58, n * rowH + 8);
  const appX = 22;
  const appY = H / 2;
  const endX = W - 24;
  const startX = appX + 13;
  const topY = (H - n * rowH) / 2 + rowH / 2;
  const ys = branches.map((_, i) => topY + i * rowH);
  const toneStroke = (t) => t === "online" ? "#16a34a" : t === "offline" ? "#dc2626" : t === "idle" ? "#94a3b8" : "#7c3aed";

  return (
    <svg className={`cia-ext-cs-svg is-${phase}`} viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true">
      <defs>
        <linearGradient id="cia-cs-grad" gradientUnits="userSpaceOnUse" x1={startX} y1="0" x2={endX} y2="0">
          <stop offset="0" stopColor="#7c3aed" /><stop offset="1" stopColor="#16a34a" />
        </linearGradient>
      </defs>
      {branches.map((b, i) => {
        const d = `M ${startX} ${appY} C ${startX + 70} ${appY}, ${endX - 52} ${ys[i]}, ${endX - 14} ${ys[i]}`;
        return (<g key={`b-${b.id}`}><path className="cia-ext-cs-path" d={d} />{phase === "online" ? <path className="cia-ext-cs-pulse" pathLength="100" d={d} style={{ animationDelay: `${i * 0.35}s` }} /> : null}</g>);
      })}
      <circle className="cia-ext-cs-svgnode-app" cx={appX} cy={appY} r="13" />
      <text className="cia-ext-cs-svgicon" x={appX} y={appY}>✦</text>
      {branches.map((b, i) => (
        <g key={`n-${b.id}`}><circle cx={endX} cy={ys[i]} r="13" fill="#fff" stroke={toneStroke(b.tone)} strokeWidth={b.active ? 3 : 2} /><text className="cia-ext-cs-svgicon" x={endX} y={ys[i]}>{b.icon}</text></g>
      ))}
    </svg>
  );
}

function BackendSection({ standaloneMode }) {
  const [apiUrl, setApiUrlState] = useState("");
  const [authToken, setAuthTokenState] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { getApiBaseUrl().then(setApiUrlState); getWorkerAuthToken().then(setAuthTokenState); }, []);

  const save = async () => {
    await setApiBaseUrl(apiUrl.trim());
    await setWorkerAuthToken(authToken.trim());
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <p className="cia-ext-set-hint">{standaloneMode ? "Running standalone — connected to your Cloudflare Worker." : "Point to your Cloudflare Worker or local server."}</p>
      <label className="cia-ext-field"><span>API base URL</span><input type="url" value={apiUrl} onChange={(e) => setApiUrlState(e.target.value)} placeholder="https://your-worker.workers.dev" autoComplete="off" /></label>
      <label className="cia-ext-field"><span>Auth token</span>
        <div className="cia-ext-account-row">
          <input type={showToken ? "text" : "password"} value={authToken} onChange={(e) => setAuthTokenState(e.target.value)} placeholder="Optional" autoComplete="off" />
          <button type="button" className="cia-ext-secondary-btn" onClick={() => setShowToken((v) => !v)}>{showToken ? "Hide" : "Show"}</button>
        </div>
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button type="button" className="cia-ext-primary-btn" onClick={() => void save()}>Save</button>
        {saved && <span className="cia-ext-options-saved">Saved ✓</span>}
      </div>
    </>
  );
}

function AccountSection({ user, onProfileUpdated }) {
  const email = user?.email ?? "signed-in";
  const isRegistered = Boolean(user?.email) && email !== "signed-in";
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => { setDisplayName(user?.displayName ?? ""); }, [user?.displayName]);

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) { setStatus({ tone: "error", text: "Name cannot be empty" }); return; }
    setSavingName(true); setStatus(null);
    try { const r = await updateDisplayName(trimmed); onProfileUpdated?.({ displayName: r.displayName ?? trimmed }); setStatus({ tone: "ok", text: "Updated" }); }
    catch (e) { setStatus({ tone: "error", text: e.message ?? "Failed" }); }
    finally { setSavingName(false); }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { setStatus({ tone: "error", text: "Min 8 characters" }); return; }
    setSavingPassword(true); setStatus(null);
    try { await changePassword({ currentPassword, newPassword }); setCurrentPassword(""); setNewPassword(""); setStatus({ tone: "ok", text: "Password changed" }); }
    catch (e) { setStatus({ tone: "error", text: e.message ?? "Failed" }); }
    finally { setSavingPassword(false); }
  };

  return (
    <>
      <p className="cia-ext-set-hint">Signed in as {email}</p>
      {status ? <p className={`cia-ext-banner cia-ext-banner-${status.tone === "ok" ? "success" : "error"}`}>{status.text}</p> : null}
      {isRegistered ? (
        <>
          <label className="cia-ext-field"><span>Display name</span>
            <div className="cia-ext-account-row">
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
              <button type="button" className="cia-ext-secondary-btn" onClick={() => void handleSaveName()} disabled={savingName}>{savingName ? "…" : "Save"}</button>
            </div>
          </label>
          <label className="cia-ext-field"><span>Current password</span><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" /></label>
          <label className="cia-ext-field"><span>New password</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></label>
          <button type="button" className="cia-ext-secondary-btn" onClick={() => void handleChangePassword()} disabled={savingPassword || !currentPassword || !newPassword}>{savingPassword ? "Updating…" : "Change password"}</button>
        </>
      ) : (
        <p className="cia-ext-set-hint">Using shared demo — register for profile management.</p>
      )}
    </>
  );
}
