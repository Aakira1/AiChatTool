import { useState } from "react";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from "../lib/authDefaults.js";
import { useAuth } from "../context/AuthContext.jsx";
import t1Logo from "../assets/T1_Logo.svg";

export { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD };

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState(DEMO_ADMIN_EMAIL);
  const [password, setPassword] = useState(DEMO_ADMIN_PASSWORD);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

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
    await submitLogin(email, password);
  };

  const handleDemoLogin = async () => {
    setEmail(DEMO_ADMIN_EMAIL);
    setPassword(DEMO_ADMIN_PASSWORD);
    await submitLogin(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
  };

  return (
    <div className="t1-login-page">
      <form className="t1-login-card" onSubmit={(event) => void handleSubmit(event)}>
        <div className="t1-login-logo">
          <img src={t1Logo} alt="TechnologyOne" />
        </div>
        <h1>TechnologyOne AI Assistant</h1>
        <p className="t1-login-subtitle">Sign in to access OneChat transition tools</p>

        <div className="t1-login-demo">
          <strong>Demo admin</strong>
          <br />
          Email: {DEMO_ADMIN_EMAIL}
          <br />
          Password: {DEMO_ADMIN_PASSWORD}
        </div>

        <label htmlFor="login-email">
          Email
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@demo.local"
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
            placeholder="Enter your password"
            autoComplete="current-password"
            required
            minLength={8}
          />
        </label>

        {error ? <p className="t1-login-error">{error}</p> : null}

        <button type="submit" className="t1-login-btn" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>

        <button
          type="button"
          className="t1-login-demo-btn"
          disabled={pending}
          onClick={() => void handleDemoLogin()}
        >
          Sign in as demo admin
        </button>
      </form>
    </div>
  );
}
