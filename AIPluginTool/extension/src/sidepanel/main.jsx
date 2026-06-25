import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SidePanelApp } from "./SidePanelApp.jsx";
import "../styles/extension.css";

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
