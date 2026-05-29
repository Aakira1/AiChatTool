import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OptionsApp } from "./OptionsApp.jsx";
import "../styles/extension.css";

document.body.classList.add("cia-ext-options-page");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);
