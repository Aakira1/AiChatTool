import { useState } from "react";
import { AppNavbar } from "./components/layout/AppNavbar";
import { ToastProvider } from "./components/ui/ToastProvider.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ChatPage } from "./pages/ChatPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import "./styles/cia-assistant.css";

function AppShell() {
  const { isAuthenticated, loading } = useAuth();
  const [view, setView] = useState("chat");

  if (loading) {
    return <div className="t1-login-page">Checking session…</div>;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="cia-app">
      <AppNavbar activeView={view} onNavigate={setView} />
      <main key={view} className="t1-main t1-view-enter">
        {view === "dashboard" ? <DashboardPage /> : <ChatPage />}
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
