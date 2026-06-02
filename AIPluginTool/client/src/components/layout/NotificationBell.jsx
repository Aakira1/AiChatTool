import { useCallback, useEffect, useRef, useState } from "react";
import {
  listNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  clearAllNotifications,
} from "../../lib/api.js";

const POLL_INTERVAL_MS = 30_000;

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(`${iso}Z`).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return "";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  const refreshCount = useCallback(async () => {
    try {
      const { unread: count } = await getUnreadCount();
      setUnread(count);
    } catch {
      /* ignore polling errors */
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const timer = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const { notifications, unread: count } = await listNotifications();
        setItems(notifications);
        setUnread(count);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((n) => ({ ...n, read: 1 })));
      setUnread(0);
    } catch {
      /* ignore */
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllNotifications();
      setItems([]);
      setUnread(0);
    } catch {
      /* ignore */
    }
  };

  const handleItemClick = async (item) => {
    if (!item.read) {
      try {
        const { unread: count } = await markNotificationRead(item.id);
        setUnread(count);
        setItems((current) =>
          current.map((n) => (n.id === item.id ? { ...n, read: 1 } : n)),
        );
      } catch {
        /* ignore */
      }
    }
    if (item.post_id) {
      onNavigate?.("forums");
    }
    setOpen(false);
  };

  return (
    <div className="t1-notif" ref={wrapRef}>
      <button
        type="button"
        className="t1-notif-trigger"
        onClick={toggle}
        aria-label="Notifications"
        title="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span className="t1-notif-badge">{unread > 99 ? "99+" : unread}</span>
        ) : null}
      </button>

      {open ? (
        <div className="t1-notif-menu" role="menu">
          <div className="t1-notif-header">
            <span>Notifications</span>
            <div className="t1-notif-header-actions">
              {unread > 0 ? (
                <button type="button" className="t1-notif-markall" onClick={handleMarkAll}>
                  Mark all read
                </button>
              ) : null}
              {items.length > 0 ? (
                <button type="button" className="t1-notif-clear" onClick={handleClearAll}>
                  Clear all
                </button>
              ) : null}
            </div>
          </div>
          <div className="t1-notif-list">
            {loading ? (
              <p className="t1-notif-empty">Loading…</p>
            ) : items.length === 0 ? (
              <p className="t1-notif-empty">No notifications yet</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`t1-notif-item ${item.read ? "" : "unread"}`}
                  onClick={() => handleItemClick(item)}
                >
                  <span className="t1-notif-message">{item.message}</span>
                  <span className="t1-notif-time">{timeAgo(item.created_at)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
