import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAuthMe, login as apiLogin, logout as apiLogout } from "../lib/api.js";
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
        setUser({ email: session.email });
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
    if (!import.meta.env.DEV || import.meta.env.VITE_AUTO_LOGIN === "false") {
      return;
    }
    void (async () => {
      try {
        const session = await apiLogin(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
        setUser({ email: session.email });
      } catch {
        // User can sign in manually with pre-filled demo credentials.
      }
    })();
  }, [loading, user, authDisabled]);

  const login = useCallback(
    async (email, password) => {
      sessionStorage.removeItem(MANUAL_LOGOUT_KEY);
      const session = await apiLogin(email, password);
      setUser({ email: session.email });
      setAuthDisabled(false);
      return session;
    },
    [],
  );

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
      logout,
      refresh,
    }),
    [user, authDisabled, loading, login, logout, refresh],
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
