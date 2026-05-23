import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/cia-assistant.css";
import App from "./App.jsx";
import { applySettings, subscribeSettings } from "./lib/settings.js";

applySettings();
subscribeSettings(applySettings);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
