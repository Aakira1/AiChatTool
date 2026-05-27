import { useEffect, useRef, useState } from "react";
import { getProfile } from "../../lib/api.js";
import { environmentLabel, getInitials, normalizeProfile } from "../../lib/profile.js";
import { ProfilePanel } from "./ProfilePanel.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../ui/ToastProvider.jsx";
import tneIcon from "../../assets/TNE_icon.svg";

export function AppNavbar({ activeView, onNavigate }) {
  const toast = useToast();
  const { logout, authDisabled } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState("profile");
  const [profile, setProfile] = useState(normalizeProfile());
  const menuRef = useRef(null);

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

  const initials = getInitials(profile.profile_name);

  return (
    <>
      <header className="t1-navbar">
        <div className="t1-navbar-brand">
          <div>
            <div className="t1-navbar-title-row">
              <div className="cia-logo">
                <img src={tneIcon} alt="TechnologyOne" />
              </div>
              <p className="t1-navbar-title">OneChat AI Assistant</p>
            </div>
            <p className="t1-navbar-subtitle">Transitions</p>
          </div>
        </div>

        <nav className="t1-navbar-links" aria-label="Main navigation">
          <button
            type="button"
            className={`t1-nav-link ${activeView === "chat" ? "active" : ""}`}
            onClick={() => onNavigate("chat")}
          >
            Assistant
          </button>
          <button
            type="button"
            className={`t1-nav-link ${activeView === "dashboard" ? "active" : ""}`}
            onClick={() => onNavigate("dashboard")}
          >
            Dashboard
          </button>
        </nav>

        <div className="t1-navbar-actions">
          <div className="cia-status cia-status-online" title="Assistant is connected">
            AI online
          </div>

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
              <span className="t1-profile-avatar">{initials}</span>
              <span className="t1-profile-text">
                <span className="t1-profile-name">{profile.profile_name}</span>
                <span className="t1-profile-role">{profile.profile_role}</span>
              </span>
              <span className="t1-profile-caret">▾</span>
            </button>

            {menuOpen ? (
              <div className="t1-profile-menu" role="menu">
                <div className="t1-profile-menu-header">
                  <span className="t1-profile-avatar">{initials}</span>
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
                  My profile
                </button>
                <button type="button" role="menuitem" onClick={() => openPanel("preferences")}>
                  Preferences
                </button>
                <button type="button" role="menuitem" onClick={() => openPanel("settings")}>
                  Settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onNavigate("dashboard");
                    setMenuOpen(false);
                  }}
                >
                  Data & imports
                </button>
                <button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>
                  Help & support
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
