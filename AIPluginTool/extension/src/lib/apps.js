// Single source of truth for the apps shown in the launcher, Quick actions and
// the floating-bubble quick-launch. Actions (onClick) are wired up where the
// catalog is consumed (SidePanelApp) so this stays a pure, importable list.
import { getStored } from "./storage.js";

export const APP_CATALOG = [
  { id: "chat", icon: "💬", label: "New Chat", desc: "Ask the assistant", accent: "#7c3aed" },
  { id: "notepad", icon: "📝", label: "Notepad", desc: "Notes & templates", accent: "#2563eb" },
  { id: "companion", icon: "✅", label: "Companion", desc: "Implementation checklist", accent: "#16a34a" },
  { id: "golive", icon: "🚀", label: "Go-Live", desc: "Cutover run sheets", accent: "#db2777" },
  { id: "appcreator", icon: "🧩", label: "App Creator", desc: "Build custom micro-apps", accent: "#8b5cf6" },
  { id: "settings", icon: "⚙️", label: "Settings", desc: "Preferences", accent: "#64748b" },
];

export function appById(id) {
  return APP_CATALOG.find((a) => a.id === id) ?? null;
}

// Count "to do" items inside a stored run-sheet/checklist payload without pulling
// in the (heavy) analyzers — a lightweight regex on the Status / completion
// columns is enough for a badge number.
function countOpenFromSheets(payload) {
  if (!payload?.sheets?.length) return 0;
  let open = 0;
  for (const sheet of payload.sheets) {
    const rows = sheet.rows ?? [];
    // Find a header row + the Status / Date columns.
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
      const cells = (rows[i] ?? []).map((c) => String(c ?? "").toLowerCase());
      if (cells.some((c) => /task description|^task$|functional group/.test(c))) { headerIdx = i; break; }
    }
    if (headerIdx < 0) continue;
    const header = (rows[headerIdx] ?? []).map((c) => String(c ?? "").toLowerCase().trim());
    const statusCol = header.findIndex((c) => /^status|% completed|completed.*status/.test(c));
    const dateCol = header.findIndex((c) => /date.*completed|date\/time|^date$/.test(c));
    const taskCol = header.findIndex((c) => /task description|^task$/.test(c));
    if (taskCol < 0) continue;
    for (let i = headerIdx + 1; i < rows.length; i += 1) {
      const task = String(rows[i]?.[taskCol] ?? "").trim();
      if (!task) continue;
      const status = statusCol >= 0 ? String(rows[i]?.[statusCol] ?? "").toLowerCase() : "";
      const date = dateCol >= 0 ? String(rows[i]?.[dateCol] ?? "").trim() : "";
      const done = /100\s*%|complete|done|finished/.test(status) || (statusCol < 0 && Boolean(date));
      if (!done) open += 1;
    }
  }
  return open;
}

/**
 * Compute badge numbers for launcher tiles. Returns a map of appId -> number
 * (only entries with a meaningful, non-zero count are included).
 */
export async function computeAppBadges() {
  const store = await getStored(["goLiveData", "checklistData", "notes"]);
  const badges = {};
  const golive = countOpenFromSheets(store.goLiveData);
  if (golive > 0) badges.golive = golive;
  const companion = countOpenFromSheets(store.checklistData);
  if (companion > 0) badges.companion = companion;
  const noteCount = store.notes?.notes?.length ?? 0;
  if (noteCount > 1) badges.notepad = noteCount;
  return badges;
}
