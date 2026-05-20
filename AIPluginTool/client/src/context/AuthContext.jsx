import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAuthMe, login as apiLogin, logout as apiLogout } from "../lib/api.js";

const AuthContext = createContext(null);

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

  const login = useCallback(
    async (email, password) => {
      const session = await apiLogin(email, password);
      setUser({ email: session.email });
      setAuthDisabled(false);
      return session;
    },
    [],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
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
