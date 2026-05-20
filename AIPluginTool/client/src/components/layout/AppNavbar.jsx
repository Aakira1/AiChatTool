import { useEffect, useRef, useState } from "react";
import { getProfile } from "../../lib/api.js";
import { environmentLabel, getInitials, normalizeProfile } from "../../lib/profile.js";
import { ProfilePanel } from "./ProfilePanel.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../ui/ToastProvider.jsx";

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
          <div className="cia-logo">T1</div>
          <div>
            <p className="t1-navbar-title">TechnologyOne AI Assistant</p>
            <p className="t1-navbar-subtitle">Ci → CiA Transitions</p>
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
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    if (authDisabled) {
                      toast.info("Auth is disabled on this server.");
                      return;
                    }
                    void logout().then(() => toast.info("Signed out"));
                  }}
                >
                  Sign out
                </button>
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
