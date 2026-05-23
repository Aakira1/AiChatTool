import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SidePanelApp } from "./SidePanelApp.jsx";
import "../styles/extension.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>,
);
