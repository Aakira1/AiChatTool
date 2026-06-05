// Per-user layout for the app launcher: which apps sit in the primary navbar vs.
// the multi-app panel, and their order. Persisted in localStorage per account.
const KEY_PREFIX = "cia.applayout.";

function keyFor(email) {
  return `${KEY_PREFIX}${(email || "default").toLowerCase()}`;
}

export function loadLayout(email) {
  try {
    const raw = localStorage.getItem(keyFor(email));
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.primary) && Array.isArray(parsed.drawer)) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveLayout(email, layout) {
  try {
    localStorage.setItem(keyFor(email), JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

/**
 * Merge a stored layout with the apps actually available now: drop ids the user
 * can no longer see, and place any newly-available apps in their default slot
 * (drawer if `defaultDrawer`, else primary).
 */
export function reconcileLayout(stored, available) {
  const ids = available.map((a) => a.id);
  const primary = (stored?.primary ?? []).filter((id) => ids.includes(id));
  const drawer = (stored?.drawer ?? []).filter((id) => ids.includes(id));
  const placed = new Set([...primary, ...drawer]);
  for (const app of available) {
    if (!placed.has(app.id)) {
      (app.defaultDrawer ? drawer : primary).push(app.id);
    }
  }
  return { primary, drawer };
}
