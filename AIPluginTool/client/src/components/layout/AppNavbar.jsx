import { useEffect, useMemo, useRef, useState } from "react";
import { getProfile } from "../../lib/api.js";
import { environmentLabel, getInitials, normalizeProfile } from "../../lib/profile.js";
import { ProfilePanel } from "./ProfilePanel.jsx";
import { NotificationBell } from "./NotificationBell.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../ui/ToastProvider.jsx";
import { availableApps, appById } from "../../lib/appRegistry.js";
import { loadLayout, saveLayout, reconcileLayout } from "../../lib/appLayout.js";
import tneIcon from "../../assets/TNE_icon.svg";

export function AppNavbar({ activeView, onNavigate }) {
  const toast = useToast();
  const { logout, authDisabled, user, hasPlugin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState("profile");
  const [baseProfile, setProfile] = useState(normalizeProfile());
  const menuRef = useRef(null);

  // ---- App launcher (primary nav vs. multi-app panel, drag & drop) --------
  const isAdmin = authDisabled || user?.role === "admin";
  const apps = useMemo(() => availableApps({ isAdmin, hasPlugin }), [isAdmin, hasPlugin]);
  const email = user?.email ?? "default";

  const [layout, setLayout] = useState(() =>
    reconcileLayout(loadLayout(email), availableApps({ isAdmin, hasPlugin })),
  );
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState(null); // "primary" | "drawer"
  const launcherRef = useRef(null);

  // Re-reconcile when the account or available apps change.
  useEffect(() => {
    setLayout(reconcileLayout(loadLayout(email), apps));
  }, [email, apps]);

  const persist = (next) => {
    setLayout(next);
    saveLayout(email, next);
  };

  const moveApp = (id, target) => {
    if (!id || !appById(id)) return;
    const primary = layout.primary.filter((x) => x !== id);
    const drawer = layout.drawer.filter((x) => x !== id);
    if (target === "primary") primary.push(id);
    else drawer.push(id);
    persist({ primary, drawer });
  };

  const onDragStart = (event, id, { openPanel = false } = {}) => {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    // Reveal the multi-app panel so it's an available drop target mid-drag.
    if (openPanel) setLauncherOpen(true);
  };
  const allowDrop = (event, target) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(target);
  };
  const handleDrop = (event, target) => {
    event.preventDefault();
    setDropTarget(null);
    moveApp(event.dataTransfer.getData("text/plain"), target);
  };

  useEffect(() => {
    if (!launcherOpen) return undefined;
    const onClick = (event) => {
      if (launcherRef.current && !launcherRef.current.contains(event.target)) {
        setLauncherOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [launcherOpen]);

  useEffect(() => {
    getProfile()
      .then((data) => setProfile(normalizeProfile(data)))
      .catch(() => setProfile(normalizeProfile()));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openPanel = (tab) => {
    setPanelTab(tab);
    setPanelOpen(true);
    setMenuOpen(false);
  };

  // The per-user profile (from /api/profile) is authoritative once loaded; fall
  // back to the authenticated session identity for the initial render before the
  // profile fetch resolves, so the navbar never shows another user's identity.
  const profile = {
    ...baseProfile,
    profile_name: baseProfile.profile_name || user?.displayName || "",
    profile_email: baseProfile.profile_email || user?.email || "",
  };

  const initials = getInitials(profile.profile_name);
  const profilePicture = profile.profile_picture;

  return (
    <>
      <header className="t1-navbar">
        <div className="t1-navbar-brand">
          <div className="t1-navbar-title-row">
            <div className="cia-logo">
              <img src={tneIcon} alt="TechnologyOne" />
            </div>
            <div>
              <p className="t1-navbar-title"><span style={{ color: "#f9bd1c" }}>One</span>Chat AI Assistant</p>
              <p className="t1-navbar-subtitle">Property & Rating Transitions</p>
            </div>
          </div>
        </div>

        <nav
          className={`t1-navbar-links${dropTarget === "primary" ? " is-drop" : ""}`}
          aria-label="Main navigation"
          onDragOver={(event) => allowDrop(event, "primary")}
          onDragLeave={() => setDropTarget((t) => (t === "primary" ? null : t))}
          onDrop={(event) => handleDrop(event, "primary")}
        >
          {layout.primary.map((id) => {
            const app = appById(id);
            if (!app) return null;
            return (
              <button
                key={id}
                type="button"
                draggable
                onDragStart={(event) => onDragStart(event, id, { openPanel: true })}
                className={`t1-nav-link ${activeView === id ? "active" : ""}`}
                onClick={() => onNavigate(id)}
                title="Drag into the apps panel to move it there"
              >
                {app.label}
              </button>
            );
          })}

          <div className="t1-launcher" ref={launcherRef}>
            <button
              type="button"
              className={`t1-launcher-btn${launcherOpen ? " active" : ""}${
                dropTarget === "drawer" ? " is-drop" : ""
              }`}
              onClick={() => setLauncherOpen((open) => !open)}
              onDragOver={(event) => allowDrop(event, "drawer")}
              onDragLeave={() => setDropTarget((t) => (t === "drawer" ? null : t))}
              onDrop={(event) => handleDrop(event, "drawer")}
              aria-label="Apps"
              aria-expanded={launcherOpen}
              title="Apps — drag an app here to move it into the panel"
            >
              <span className="t1-launcher-grid" aria-hidden="true">
                <i /><i /><i />
                <i /><i /><i />
                <i /><i /><i />
              </span>
            </button>

            {launcherOpen ? (
              <div
                className={`t1-launcher-panel${dropTarget === "drawer" ? " is-drop" : ""}`}
                role="menu"
                onDragOver={(event) => allowDrop(event, "drawer")}
                onDragLeave={() => setDropTarget((t) => (t === "drawer" ? null : t))}
                onDrop={(event) => handleDrop(event, "drawer")}
              >
                <p className="t1-launcher-title">Apps</p>
                <div className="t1-launcher-apps">
                  {layout.drawer.length === 0 ? (
                    <p className="t1-launcher-empty">
                      Drag an app here to keep it in this panel.
                    </p>
                  ) : (
                    layout.drawer.map((id) => {
                      const app = appById(id);
                      if (!app) return null;
                      return (
                        <button
                          key={id}
                          type="button"
                          draggable
                          onDragStart={(event) => onDragStart(event, id)}
                          className={`t1-launcher-app${activeView === id ? " active" : ""}`}
                          onClick={() => {
                            onNavigate(id);
                            setLauncherOpen(false);
                          }}
                          title={app.label}
                        >
                          <span className="t1-launcher-app-icon" aria-hidden="true">
                            {app.icon}
                          </span>
                          <span className="t1-launcher-app-label">{app.label}</span>
                        </button>
                      );
                    })
                  )}
                </div>
                <p className="t1-launcher-hint">Drag apps in or out to customise your navbar.</p>
              </div>
            ) : null}
          </div>
        </nav>

        <div className="t1-navbar-actions">
          <div className="cia-status cia-status-online" title="Assistant is connected">
            AI online
          </div>

          {!authDisabled ? <NotificationBell onNavigate={onNavigate} /> : null}

          <button
            type="button"
            className="t1-navbar-cog"
            onClick={() => openPanel("settings")}
            title="Settings"
            aria-label="Open settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <div className="t1-profile" ref={menuRef}>
            <button
              type="button"
              className="t1-profile-trigger"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              {profilePicture ? (
                <img src={profilePicture} className="t1-profile-avatar t1-profile-avatar-img" alt={profile.profile_name} />
              ) : (
                <span className="t1-profile-avatar">{initials}</span>
              )}
              <span className="t1-profile-text">
                <span className="t1-profile-name">{profile.profile_name}</span>
                <span className="t1-profile-role">{profile.profile_role}</span>
              </span>
              <span className="t1-profile-caret">▾</span>
            </button>

            {menuOpen ? (
              <div className="t1-profile-menu" role="menu">
                <div className="t1-profile-menu-header">
                  {profilePicture ? (
                    <img src={profilePicture} className="t1-profile-avatar t1-profile-avatar-img" alt={profile.profile_name} />
                  ) : (
                    <span className="t1-profile-avatar">{initials}</span>
                  )}
                  <div>
                    <p className="t1-profile-menu-name">{profile.profile_name}</p>
                    <p className="t1-profile-menu-email">{profile.profile_email}</p>
                    <p className="t1-profile-menu-team">{profile.profile_team}</p>
                    <span className={`t1-env-badge ${profile.profile_environment}`}>
                      {environmentLabel(profile.profile_environment)}
                    </span>
                  </div>
                </div>

                <button type="button" role="menuitem" onClick={() => openPanel("profile")}>
                  My Profile
                </button>
                <button type="button" role="menuitem" onClick={() => openPanel("preferences")}>
                  Preferences
                </button>
                <button type="button" role="menuitem" onClick={() => openPanel("settings")}>
                  Settings
                </button>
                {hasPlugin("dashboard") ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onNavigate("dashboard");
                      setMenuOpen(false);
                    }}
                  >
                    Data & Imports
                  </button>
                ) : null}
                <button type="button" role="menuitem" onClick={() => { onNavigate("help"); setMenuOpen(false); }}>
                  Help & Support
                </button>
                <hr />
                {!authDisabled ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      setMenuOpen(false);
                      void logout().then(() => {
                        toast.info("Signed out");
                      });
                    }}
                  >
                    Sign out
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <ProfilePanel
        open={panelOpen}
        initialTab={panelTab}
        onClose={() => setPanelOpen(false)}
        onSaved={setProfile}
      />
    </>
  );
}
