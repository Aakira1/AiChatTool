// The navigable "apps" (plugins) that can live either in the primary navbar or
// in the multi-app launcher panel. Availability is gated by role/plugin perms.
export const APPS = [
  { id: "chat", label: "Assistant", icon: "💬" },
  { id: "dashboard", label: "Dashboard", icon: "📊", plugin: "dashboard" },
  { id: "checklist", label: "Companion", icon: "✅", plugin: "checklist", defaultDrawer: true },
  { id: "forums", label: "Forums", icon: "💡" },
  { id: "admin", label: "Admin", icon: "🛡️", adminOnly: true },
  { id: "help", label: "Help & Support", icon: "❓", defaultDrawer: true },
];

export function appById(id) {
  return APPS.find((a) => a.id === id) ?? null;
}

/** Apps the current user may see, given their role and granted plugins. */
export function availableApps({ isAdmin, hasPlugin }) {
  return APPS.filter((app) => {
    if (app.adminOnly && !isAdmin) return false;
    if (app.plugin && !hasPlugin(app.plugin)) return false;
    return true;
  });
}
