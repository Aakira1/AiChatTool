import { useState } from "react";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from "../lib/authDefaults.js";
import { useAuth } from "../context/AuthContext.jsx";
import t1Logo from "../assets/T1_Logo.svg";

export { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD };

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(DEMO_ADMIN_EMAIL);
  const [password, setPassword] = useState(DEMO_ADMIN_PASSWORD);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const isRegister = mode === "register";

  const submitLogin = async (loginEmail, loginPassword) => {
    setError("");
    setPending(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (loginError) {
      setError(loginError.message ?? "Login failed");
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isRegister) {
      setError("");
      setPending(true);
      try {
        await register({ email, password, displayName });
      } catch (registerError) {
        setError(registerError.message ?? "Registration failed");
      } finally {
        setPending(false);
      }
      return;
    }
    await submitLogin(email, password);
  };

  const handleDemoLogin = async () => {
    setEmail(DEMO_ADMIN_EMAIL);
    setPassword(DEMO_ADMIN_PASSWORD);
    await submitLogin(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    if (nextMode === "register") {
      setEmail("");
      setPassword("");
      setDisplayName("");
    } else {
      setEmail(DEMO_ADMIN_EMAIL);
      setPassword(DEMO_ADMIN_PASSWORD);
    }
  };

  return (
    <div className="t1-login-page">
      <form className="t1-login-card" onSubmit={(event) => void handleSubmit(event)}>
        <div className="t1-login-logo">
          <img src={t1Logo} alt="TechnologyOne" />
        </div>
        <h1>TechnologyOne AI Assistant</h1>
        <p className="t1-login-subtitle">
          {isRegister
            ? "Create an account to join the forums and chat"
            : "Sign in to access OneChat transition tools"}
        </p>

        <div className="t1-login-tabs">
          <button
            type="button"
            className={`t1-login-tab ${!isRegister ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`t1-login-tab ${isRegister ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Create account
          </button>
        </div>

        {!isRegister ? (
          <div className="t1-login-demo">
            <strong>Demo admin</strong>
            <br />
            Email: {DEMO_ADMIN_EMAIL}
            <br />
            Password: {DEMO_ADMIN_PASSWORD}
          </div>
        ) : null}

        {isRegister ? (
          <label htmlFor="register-name">
            Display name
            <input
              id="register-name"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="How others see you in forums"
              autoComplete="name"
              required
              maxLength={80}
            />
          </label>
        ) : null}

        <label htmlFor="login-email">
          Email
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@technologyone.com"
            autoComplete="username"
            required
          />
        </label>

        <label htmlFor="login-password">
          Password
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isRegister ? "Choose a password (min 8 chars)" : "Enter your password"}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            minLength={8}
          />
        </label>

        {error ? <p className="t1-login-error">{error}</p> : null}

        <button type="submit" className="t1-login-btn" disabled={pending}>
          {pending
            ? isRegister
              ? "Creating account…"
              : "Signing in…"
            : isRegister
              ? "Create account"
              : "Sign in"}
        </button>

        {!isRegister ? (
          <button
            type="button"
            className="t1-login-demo-btn"
            disabled={pending}
            onClick={() => void handleDemoLogin()}
          >
            Sign in as demo admin
          </button>
        ) : null}
      </form>
    </div>
  );
}
