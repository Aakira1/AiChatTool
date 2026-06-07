// Classify an imported document so each app's single "Import" button can
// register the type and route the user to the right tool if it doesn't match.
import { analyzeChecklist } from "./checklist.js";
import { analyzeBpa } from "./bpa.js";

export const DOC_TYPE_LABEL = {
  companion: "Companion checklist",
  bpa: "BPA process",
  spreadsheet: "spreadsheet",
  t1pkg: "TechnologyOne package",
  unknown: "file",
};

export const DOC_TYPE_APP = {
  companion: "Companion",
  bpa: "BPA Helper",
  t1pkg: "Package Inspector",
};

/** Classify a parsed CSV/Excel grid. */
export function classifyRows(rows) {
  if (!rows || !rows.length) return "unknown";
  const first = String(rows[0]?.[0] ?? "");
  if (/BPM_BPDEFINITION/i.test(first)) return "bpa";
  if (analyzeBpa(rows)) return "bpa";
  if (analyzeChecklist(rows)) return "companion";
  return "spreadsheet";
}

/** Classify a File by name (used before parsing — e.g. packages). */
export function classifyFileName(name) {
  const n = String(name ?? "").toLowerCase();
  if (n.endsWith(".t1pkg")) return "t1pkg";
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "spreadsheet";
  if (n.endsWith(".csv")) return "spreadsheet";
  return "unknown";
}
