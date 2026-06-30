import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OptionsApp } from "./OptionsApp.jsx";
import { applySettings, subscribeSettings, applyTheme, applyDensity, applyDarkMode } from "../lib/settings.js";
import "../styles/extension.css";

document.body.classList.add("cia-ext-options-page");

// The options page is a standalone window — apply the saved theme + dark mode
// here too (it has no SidePanelApp to do it) and keep it live on changes.
applySettings();
subscribeSettings((next) => {
  applyTheme(next.theme);
  applyDensity(next.density);
  applyDarkMode(next.darkMode === true);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);
