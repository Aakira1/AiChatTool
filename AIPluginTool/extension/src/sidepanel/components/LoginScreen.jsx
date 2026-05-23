import { useState } from "react";

const DEMO_EMAIL = "admin@demo.local";
const DEMO_PASSWORD = "Admin12345!";

export function LoginScreen({ onLogin, healthState }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (overrideEmail, overridePassword) => {
    setPending(true);
    setError("");
    try {
      await onLogin(overrideEmail ?? email, overridePassword ?? password);
    } catch (loginError) {
      setError(loginError.message ?? "Login failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="cia-ext-login"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h1>Sign in</h1>
      <p className="cia-ext-login-subtitle">
        Connect this extension to your CiA Assistant server.
      </p>

      {healthState?.ok === false ? (
        <div className="cia-ext-banner cia-ext-banner-warn">
          Couldn't reach the API. Check your API URL in the extension options.
        </div>
      ) : null}

      <label className="cia-ext-field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={DEMO_EMAIL}
          autoComplete="username"
          required
        />
      </label>

      <label className="cia-ext-field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
          minLength={8}
        />
      </label>

      {error ? <p className="cia-ext-login-error">{error}</p> : null}

      <button type="submit" className="cia-ext-primary-btn" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <button
        type="button"
        className="cia-ext-secondary-btn"
        disabled={pending}
        onClick={() => {
          setEmail(DEMO_EMAIL);
          setPassword(DEMO_PASSWORD);
          void submit(DEMO_EMAIL, DEMO_PASSWORD);
        }}
      >
        Use demo admin
      </button>

      <p className="cia-ext-login-hint">
        API URL is configured in the <button type="button" className="cia-ext-link" onClick={() => chrome.runtime.openOptionsPage?.()}>extension options</button>.
      </p>
    </form>
  );
}
