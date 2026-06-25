import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: "OneChat",
  short_name: "OneChat",
  description:
    "Your AI assistant in the browser. Click the floating bubble or right-click any selection to ask OneChat.",
  version: pkg.version,
  version_name: `${pkg.version}-dev`,
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_title: "Toggle OneChat",
    default_icon: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
    },
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  options_page: "src/options/index.html",
  background: {
    service_worker: "src/background/index.js",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.js"],
      run_at: "document_idle",
      all_frames: false,
    },
    {
      matches: ["<all_urls>"],
      js: ["src/content/floating-widget.js"],
      run_at: "document_idle",
      all_frames: false,
    },
  ],
  permissions: ["sidePanel", "storage", "unlimitedStorage", "contextMenus", "activeTab", "scripting", "tabs"],
  // Broad host access so page vision (captureVisibleTab) and the page-AI relay
  // (scripting.executeScript) work on ALL pages without per-site prompts. The
  // Privacy toggle in Settings disables page vision when the user wants it off.
  host_permissions: ["http://*/*", "https://*/*"],
  web_accessible_resources: [
    {
      resources: ["icons/*", "src/sidepanel/index.html", "assets/*"],
      matches: ["<all_urls>"],
    },
  ],
});
