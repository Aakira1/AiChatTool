// Registry of optional features ("plugins") whose access is permission-gated.
// Admins implicitly have all of them; other users must be granted access by an
// admin in the Admin → Plugins tab. Add new gated features here.
export const PLUGINS = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Analytics dashboard, metrics, and data imports.",
  },
  {
    id: "checklist",
    label: "Companion",
    description: "Import an implementation companion CSV, track progress, export it back.",
  },
];

export const PLUGIN_IDS = PLUGINS.map((p) => p.id);

export function isValidPlugin(id) {
  return PLUGIN_IDS.includes(id);
}
