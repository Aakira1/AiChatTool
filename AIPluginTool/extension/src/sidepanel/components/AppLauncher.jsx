import { useEffect, useMemo, useState } from "react";
import { getStored, setStored } from "../../lib/storage.js";

const ORDER_KEY = "appLauncherOrder";
const FOLDERS_KEY = "appLauncherFolders";

// Stacked-layers glyph used for the launcher (and the centre nav button).
export function LayersIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M12 3 2.6 7.6 12 12.2l9.4-4.6L12 3Z" fill="currentColor" opacity="0.95" />
      <path d="M2.6 12 12 16.6 21.4 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" opacity="0.7" />
      <path d="M2.6 16.4 12 21l9.4-4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" opacity="0.45" />
    </svg>
  );
}

/**
 * Drag-and-drop, reorderable grid of apps with optional folders. Order, folder
 * membership and folder metadata are persisted to chrome.storage so everything
 * survives reloads and stays in sync across screens. Apps not in any folder
 * appear in the ungrouped grid; new apps are always shown.
 */
export function AppLauncher({ apps }) {
  const [order, setOrder] = useState(null); // ungrouped order; null until loaded
  const [folders, setFolders] = useState([]); // [{ id, name, collapsed, appIds }]
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [overFolder, setOverFolder] = useState(null);
  const [overUngrouped, setOverUngrouped] = useState(false);
  const [justMoved, setJustMoved] = useState(null);
  const [editingFolder, setEditingFolder] = useState(null);

  useEffect(() => {
    getStored([ORDER_KEY, FOLDERS_KEY]).then((s) => {
      setOrder(Array.isArray(s[ORDER_KEY]) ? s[ORDER_KEY] : []);
      setFolders(Array.isArray(s[FOLDERS_KEY]) ? s[FOLDERS_KEY] : []);
    });
  }, []);

  const inFolder = useMemo(() => {
    const map = {};
    folders.forEach((f) => (f.appIds ?? []).forEach((id) => { map[id] = f.id; }));
    return map;
  }, [folders]);

  const ungrouped = useMemo(() => {
    const known = apps.map((a) => a.id).filter((id) => !inFolder[id]);
    const saved = (order ?? []).filter((id) => known.includes(id));
    for (const id of known) if (!saved.includes(id)) saved.push(id);
    return saved.map((id) => apps.find((a) => a.id === id)).filter(Boolean);
  }, [apps, order, inFolder]);

  const byId = (id) => apps.find((a) => a.id === id);

  const persistOrder = (ids) => { setOrder(ids); void setStored({ [ORDER_KEY]: ids }); };
  const persistFolders = (next) => { setFolders(next); void setStored({ [FOLDERS_KEY]: next }); };

  const reorderUngrouped = (targetId) => {
    if (!dragId || dragId === targetId || inFolder[dragId] || inFolder[targetId]) return;
    const ids = ungrouped.map((a) => a.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    persistOrder(ids);
  };

  const assignToFolder = (appId, folderId) => {
    persistFolders(folders.map((f) => ({
      ...f,
      appIds: f.id === folderId
        ? [...new Set([...(f.appIds ?? []), appId])]
        : (f.appIds ?? []).filter((id) => id !== appId),
    })));
  };

  const removeFromFolders = (appId) => {
    if (!inFolder[appId]) return;
    persistFolders(folders.map((f) => ({ ...f, appIds: (f.appIds ?? []).filter((id) => id !== appId) })));
    if (!(order ?? []).includes(appId)) persistOrder([...(order ?? []), appId]);
  };

  const endDrag = () => {
    if (dragId) { setJustMoved(dragId); setTimeout(() => setJustMoved(null), 420); }
    setDragId(null); setOverId(null); setOverFolder(null); setOverUngrouped(false);
  };

  const addFolder = () => persistFolders([...folders, { id: `f-${Date.now()}`, name: "New folder", collapsed: false, appIds: [] }]);
  const renameFolder = (id, name) => persistFolders(folders.map((f) => (f.id === id ? { ...f, name: name || "Folder" } : f)));
  const toggleFolder = (id) => persistFolders(folders.map((f) => (f.id === id ? { ...f, collapsed: !f.collapsed } : f)));
  const deleteFolder = (id) => persistFolders(folders.filter((f) => f.id !== id)); // apps fall back to ungrouped

  const resetAll = () => { persistOrder(apps.map((a) => a.id)); persistFolders([]); };
  const isCustom = (order && order.length > 0) || folders.length > 0;

  const renderTile = (app, i) => (
    <button
      key={app.id}
      type="button"
      draggable
      onDragStart={(e) => { setDragId(app.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={endDrag}
      onDragOver={(e) => { e.preventDefault(); if (overId !== app.id) setOverId(app.id); reorderUngrouped(app.id); }}
      onDragLeave={() => setOverId((cur) => (cur === app.id ? null : cur))}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); endDrag(); }}
      onClick={() => { if (!dragId) app.onClick?.(); }}
      className={[
        "cia-ext-app-tile",
        dragId === app.id ? "is-dragging" : "",
        overId === app.id && dragId && dragId !== app.id ? "is-over" : "",
        justMoved === app.id ? "is-landed" : "",
      ].filter(Boolean).join(" ")}
      style={{ "--app-accent": app.accent, animationDelay: `${i * 40}ms` }}
      aria-label={app.label}
    >
      <span className="cia-ext-app-tile-grip" aria-hidden="true">⠿</span>
      {app.badge ? (
        <span className="cia-ext-app-tile-badge" title={`${app.badge} to do`}>{app.badge > 99 ? "99+" : app.badge}</span>
      ) : null}
      <span className="cia-ext-app-tile-icon">{app.icon}</span>
      <span className="cia-ext-app-tile-label">{app.label}</span>
      {app.desc ? <span className="cia-ext-app-tile-desc">{app.desc}</span> : null}
    </button>
  );

  return (
    <div className="cia-ext-applauncher">
      <div className="cia-ext-applauncher-head">
        <div>
          <div className="cia-ext-applauncher-title">Apps</div>
          <div className="cia-ext-applauncher-hint">Drag tiles to arrange · drop onto a folder to group</div>
        </div>
        <div className="cia-ext-applauncher-actions">
          <button type="button" className="cia-ext-applauncher-reset" onClick={addFolder}>📁 New folder</button>
          {isCustom ? (
            <button type="button" className="cia-ext-applauncher-reset" onClick={resetAll} title="Reset layout">↺ Reset</button>
          ) : null}
        </div>
      </div>

      {/* Folders */}
      {folders.map((folder) => {
        const folderApps = (folder.appIds ?? []).map(byId).filter(Boolean);
        return (
          <section
            key={folder.id}
            className={`cia-ext-app-folder${overFolder === folder.id && dragId ? " is-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOverFolder(folder.id); }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setOverFolder(null); }}
            onDrop={(e) => { e.preventDefault(); if (dragId) assignToFolder(dragId, folder.id); endDrag(); }}
          >
            <div className="cia-ext-app-folder-head">
              <button type="button" className="cia-ext-app-folder-caret" onClick={() => toggleFolder(folder.id)}>
                {folder.collapsed ? "▸" : "▾"} 📁
              </button>
              {editingFolder === folder.id ? (
                <input
                  className="cia-ext-app-folder-input"
                  defaultValue={folder.name}
                  autoFocus
                  onBlur={(e) => { renameFolder(folder.id, e.target.value.trim()); setEditingFolder(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingFolder(null); }}
                />
              ) : (
                <span
                  className="cia-ext-app-folder-name"
                  title="Double-click to rename"
                  onDoubleClick={() => setEditingFolder(folder.id)}
                >
                  {folder.name}
                </span>
              )}
              <span className="cia-ext-app-folder-count">{folderApps.length}</span>
              <button type="button" className="cia-ext-app-folder-del" onClick={() => deleteFolder(folder.id)} title="Delete folder (keeps apps)">×</button>
            </div>
            {!folder.collapsed ? (
              folderApps.length ? (
                <div className="cia-ext-app-grid">{folderApps.map((a, i) => renderTile(a, i))}</div>
              ) : (
                <p className="cia-ext-app-folder-empty">Drop apps here to add them.</p>
              )
            ) : null}
          </section>
        );
      })}

      {/* Ungrouped apps — also the zone that removes an app from a folder */}
      <div
        className={`cia-ext-app-grid cia-ext-app-ungrouped${dragId ? " is-dragging-any" : ""}${overUngrouped && dragId ? " is-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (!overId) setOverUngrouped(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setOverUngrouped(false); }}
        onDrop={(e) => { e.preventDefault(); if (dragId && inFolder[dragId]) removeFromFolders(dragId); endDrag(); }}
      >
        {ungrouped.map((a, i) => renderTile(a, i))}
      </div>
    </div>
  );
}
