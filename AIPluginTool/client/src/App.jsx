import { useState } from "react";
import { AppNavbar } from "./components/layout/AppNavbar";
import { ToastProvider } from "./components/ui/ToastProvider.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ChatPage } from "./pages/ChatPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ForumsPage } from "./pages/ForumsPage";
import { AdminPage } from "./pages/AdminPage";
import { HelpPage } from "./pages/HelpPage";
import { LoginPage } from "./pages/LoginPage";
import "./styles/cia-assistant.css";

function AppShell() {
  const { isAuthenticated, loading, hasPlugin } = useAuth();
  const [view, setView] = useState("chat");

  if (loading) {
    return <div className="t1-login-page">Checking session…</div>;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Permission-gated views fall back to chat if the user lacks access.
  const effectiveView = view === "dashboard" && !hasPlugin("dashboard") ? "chat" : view;

  return (
    <div className="cia-app">
      <AppNavbar activeView={effectiveView} onNavigate={setView} />
      <main key={effectiveView} className="t1-main t1-view-enter">
        {effectiveView === "dashboard" ? (
          <DashboardPage />
        ) : effectiveView === "forums" ? (
          <ForumsPage />
        ) : effectiveView === "admin" ? (
          <AdminPage />
        ) : effectiveView === "help" ? (
          <HelpPage />
        ) : (
          <ChatPage />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ToastProvider>
  );
}
