import { useEffect, useState } from "react";
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_WEB_APP_URL,
  getApiBaseUrl,
  getWebAppUrl,
  openWebApp,
  setApiBaseUrl,
  setWebAppUrl,
} from "../lib/storage.js";
import { getSettings, saveSettings } from "../lib/settings.js";
import { pingHealth } from "../lib/api.js";
import { ConnectorsSection } from "./ConnectorsSection.jsx";

export function OptionsApp() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_BASE_URL);
  const [webUrl, setWebUrl] = useState(DEFAULT_WEB_APP_URL);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [insightsSettings, setInsightsSettings] = useState(() => getSettings());

  useEffect(() => {
    void Promise.all([getApiBaseUrl(), getWebAppUrl()]).then(([api, web]) => {
      setApiUrl(api);
      setWebUrl(web);
    });
    setInsightsSettings(getSettings());
  }, []);

  const updateInsightsSetting = (updates) => {
    setInsightsSettings(saveSettings(updates));
  };

  const requestOriginPermission = async (url) => {
    try {
      const origin = new URL(url).origin + "/*";
      if (chrome?.permissions?.request) {
        await chrome.permissions.request({ origins: [origin] }).catch(() => undefined);
      }
    } catch {
      // invalid URL — surface via test ping below
    }
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaved(false);
    await setApiBaseUrl(apiUrl.trim() || DEFAULT_API_BASE_URL);
    await setWebAppUrl(webUrl.trim() || DEFAULT_WEB_APP_URL);
    setSaved(true);
    await requestOriginPermission(apiUrl);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await setApiBaseUrl(apiUrl.trim() || DEFAULT_API_BASE_URL);
      const result = await pingHealth();
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="cia-ext-options">
      <h1>OneChat Assistant — Settings</h1>
      <p>
        Connect this extension to your OneChat Assistant server and the full web app. The defaults work
        when you run <code>npm run dev</code> at the project root.
      </p>

      <section className="cia-ext-options-cta">
        <div>
          <h3>Open the full web app</h3>
          <p>The browser-based dashboard with imports, analytics, and the full chat experience.</p>
        </div>
        <button
          type="button"
          className="cia-ext-primary-btn"
          onClick={() => void openWebApp()}
        >
          Open in new tab ↗
        </button>
      </section>

      <section className="cia-ext-options-insights">
        <h3>Insights under replies</h3>
        <p className="cia-ext-options-help">
          Same behavior as the web app settings. Turn off to hide charts and comparisons below
          assistant messages in the side panel.
        </p>
        <label className="cia-ext-options-toggle">
          <input
            type="checkbox"
            checked={insightsSettings.showInsights !== false}
            onChange={(event) => updateInsightsSetting({ showInsights: event.target.checked })}
          />
          Show insights under replies
        </label>
        <label
          className={`cia-ext-options-toggle${insightsSettings.showInsights === false ? " is-disabled" : ""}`}
        >
          <input
            type="checkbox"
            checked={Boolean(insightsSettings.showArtifactsByDefault)}
            disabled={insightsSettings.showInsights === false}
            onChange={(event) =>
              updateInsightsSetting({ showArtifactsByDefault: event.target.checked })
            }
          />
          Always expand insights under replies
        </label>
      </section>

      <ConnectorsSection />

      <form onSubmit={handleSave}>
        <label>
          API base URL
          <input
            type="url"
            value={apiUrl}
            placeholder={DEFAULT_API_BASE_URL}
            onChange={(event) => {
              setApiUrl(event.target.value);
              setSaved(false);
              setTestResult(null);
            }}
            required
          />
          <small className="cia-ext-options-help">
            Where the chat backend (Express server) is running. Used by the side panel and floating widget.
          </small>
        </label>

        <label>
          Web app URL
          <input
            type="url"
            value={webUrl}
            placeholder={DEFAULT_WEB_APP_URL}
            onChange={(event) => {
              setWebUrl(event.target.value);
              setSaved(false);
            }}
            required
          />
          <small className="cia-ext-options-help">
            Where the full React web app is hosted. Opened by the "↗ Open web app" buttons throughout the extension.
          </small>
        </label>

        <div className="cia-ext-options-actions">
          <button type="submit" className="cia-ext-primary-btn">
            Save
          </button>
          <button
            type="button"
            className="cia-ext-secondary-btn"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? "Testing…" : "Test API connection"}
          </button>
          {saved ? <span className="cia-ext-options-saved">Saved ✓</span> : null}
        </div>

        {testResult ? (
          <p
            className={`cia-ext-banner cia-ext-banner-${testResult.ok ? "info" : "error"}`}
            style={{ marginTop: 16 }}
          >
            {testResult.ok
              ? `API healthy — auth: ${testResult.authEnabled ? "on" : "off"}, RAG: ${testResult.ragEnabled ? "on" : "off"}.`
              : `Could not reach the API${testResult.error ? `: ${testResult.error}` : ` (${testResult.status ?? "?"})`}.`}
          </p>
        ) : null}
      </form>

      <section className="cia-ext-options-tips">
        <h3>How to use the extension</h3>
        <ol>
          <li>
            <strong>Floating chat bubble</strong> — visit any normal web page (e.g. google.com). A
            small magenta bubble appears in the bottom-right corner. Click it to open the chat
            overlay on that page.
          </li>
          <li>
            <strong>Right-click on selected text</strong> on any page → <em>Ask CiA about "..."</em>{" "}
            to send the selection straight to the chat.
          </li>
          <li>
            <strong>Toolbar icon</strong> — click it to toggle the floating bubble's panel. On
            restricted pages (Chrome settings, the web store, this options page), it falls back to
            opening the browser side panel.
          </li>
          <li>
            <strong>Open the web app</strong> — use the button above or the ↗ icon in the chat header
            for the full experience (dashboard, analytics, document imports).
          </li>
        </ol>
      </section>
    </div>
  );
}
