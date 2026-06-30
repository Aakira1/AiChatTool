import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SidePanelApp } from "./SidePanelApp.jsx";
import { applySettings } from "../lib/settings.js";
import "../styles/extension.css";

// Apply the saved theme + dark mode immediately (before React mounts) so the
// side panel, popped-out window and embedded widget all boot in the right look
// with no flash of the wrong theme.
applySettings();

// When loaded inside the on-page floating widget (iframe carries ?embedded=1),
// run transparent so the webpage shows through the frosted-glass panel.
if (new URLSearchParams(window.location.search).has("embedded")) {
  document.documentElement.setAttribute("data-embedded", "1");
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>,
);
