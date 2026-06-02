import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getAuthMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from "../lib/api.js";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from "../lib/authDefaults.js";

const AuthContext = createContext(null);
const MANUAL_LOGOUT_KEY = "t1_manual_logout";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authDisabled, setAuthDisabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const session = await getAuthMe();
      if (session.authenticated) {
        setUser({ email: session.email, displayName: session.displayName ?? null, role: session.role ?? "user" });
        setAuthDisabled(Boolean(session.authDisabled));
      } else {
        setUser(null);
        setAuthDisabled(false);
      }
    } catch {
      setUser(null);
      setAuthDisabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (loading || user || authDisabled) {
      return;
    }
    if (sessionStorage.getItem(MANUAL_LOGOUT_KEY)) {
      return;
    }
    // Auto-login as the demo admin is now opt-in (set VITE_AUTO_LOGIN=true).
    // With real user accounts available, defaulting to demo admin would
    // override a freshly registered/signed-in account.
    if (import.meta.env.VITE_AUTO_LOGIN !== "true") {
      return;
    }
    void (async () => {
      try {
        const session = await apiLogin(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
        setUser({ email: session.email, role: session.role ?? "user" });
      } catch {
        // User can sign in manually with pre-filled demo credentials.
      }
    })();
  }, [loading, user, authDisabled]);

  const login = useCallback(
    async (email, password) => {
      sessionStorage.removeItem(MANUAL_LOGOUT_KEY);
      const session = await apiLogin(email, password);
      setUser({ email: session.email, displayName: session.displayName ?? null, role: session.role ?? "user" });
      setAuthDisabled(false);
      return session;
    },
    [],
  );

  const register = useCallback(async ({ email, password, displayName }) => {
    sessionStorage.removeItem(MANUAL_LOGOUT_KEY);
    const session = await apiRegister({ email, password, displayName });
    setUser({ email: session.email, displayName: session.displayName ?? null, role: session.role ?? "user" });
    setAuthDisabled(false);
    return session;
  }, []);

  const updateUserDisplayName = useCallback((displayName) => {
    setUser((current) => (current ? { ...current, displayName } : current));
  }, []);

  const logout = useCallback(async () => {
    sessionStorage.setItem(MANUAL_LOGOUT_KEY, "1");
    await apiLogout();
    setUser(null);
    setAuthDisabled(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      authDisabled,
      loading,
      isAuthenticated: Boolean(user) || authDisabled,
      login,
      register,
      logout,
      refresh,
      updateUserDisplayName,
    }),
    [user, authDisabled, loading, login, register, logout, refresh, updateUserDisplayName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
