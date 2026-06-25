import { useState } from "react";

const DEMO_EMAIL = "admin@demo.local";
const DEMO_PASSWORD = "Admin12345!";

export function LoginScreen({ onLogin, onRegister, healthState }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const isRegister = mode === "register";

  const submit = async (overrideEmail, overridePassword) => {
    setPending(true);
    setError("");
    try {
      if (isRegister) {
        await onRegister({ email, password, displayName });
      } else {
        await onLogin(overrideEmail ?? email, overridePassword ?? password);
      }
    } catch (loginError) {
      setError(loginError.message ?? (isRegister ? "Registration failed" : "Login failed"));
    } finally {
      setPending(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
  };

  return (
    <form
      className="cia-ext-login"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h1>{isRegister ? "Create account" : "Sign in"}</h1>
      <p className="cia-ext-login-subtitle">
        {isRegister
          ? "Set up an account to join the forums and chat."
          : "Connect this extension to your OneChat server."}
      </p>

      {healthState?.ok === false ? (
        <div className="cia-ext-banner cia-ext-banner-warn">
          Couldn't reach the API. Check your API URL in the extension options.
        </div>
      ) : null}

      <div className="cia-ext-login-tabs">
        <button
          type="button"
          className={`cia-ext-login-tab ${!isRegister ? "active" : ""}`}
          onClick={() => switchMode("login")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`cia-ext-login-tab ${isRegister ? "active" : ""}`}
          onClick={() => switchMode("register")}
        >
          Create account
        </button>
      </div>

      {isRegister ? (
        <label className="cia-ext-field">
          <span>Display name</span>
          <input
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
          placeholder={isRegister ? "Choose a password (min 8 chars)" : "Enter your password"}
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={8}
        />
      </label>

      {error ? <p className="cia-ext-login-error">{error}</p> : null}

      <button type="submit" className="cia-ext-primary-btn" disabled={pending}>
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
      ) : null}

      <p className="cia-ext-login-hint">
        API URL is configured in the{" "}
        <button
          type="button"
          className="cia-ext-link"
          onClick={() => chrome.runtime.openOptionsPage?.()}
        >
          extension options
        </button>
        .
      </p>
    </form>
  );
}
