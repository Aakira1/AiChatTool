import { useEffect, useState } from "react";
import { listAdminUsers, setUserRole } from "../lib/api.js";
import { useToast } from "../components/ui/ToastProvider.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export function AdminPage() {
  const toast = useToast();
  const { user } = useAuth();
  const myEmail = user?.email?.toLowerCase() ?? "";
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { users: list } = await listAdminUsers();
      setUsers(list);
    } catch (error) {
      toast.error(error.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeRole = async (target, nextRole) => {
    setSavingEmail(target.email);
    try {
      await setUserRole(target.email, nextRole);
      setUsers((prev) =>
        prev.map((u) => (u.email === target.email ? { ...u, role: nextRole } : u)),
      );
      toast.success(
        nextRole === "admin"
          ? `${target.display_name || target.email} is now an admin`
          : `${target.display_name || target.email} is now a standard user`,
      );
    } catch (error) {
      toast.error(error.message || "Failed to update role");
    } finally {
      setSavingEmail(null);
    }
  };

  const adminCount = users.filter((u) => u.role === "admin").length;

  return (
    <div className="cia-admin-page t1-animate-in">
      <div className="cia-admin-header">
        <div>
          <h1>Admin</h1>
          <p>Manage who can moderate forums and access admin tools.</p>
        </div>
        <div className="cia-admin-stats">
          <span>{users.length} user{users.length === 1 ? "" : "s"}</span>
          <span>·</span>
          <span>{adminCount} admin{adminCount === 1 ? "" : "s"}</span>
        </div>
      </div>

      {loading ? (
        <p className="cia-forum-muted">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="cia-forum-muted">No registered users yet.</p>
      ) : (
        <div className="cia-admin-table">
          <div className="cia-admin-row cia-admin-row-head">
            <span>User</span>
            <span>Email</span>
            <span>Joined</span>
            <span>Role</span>
            <span></span>
          </div>
          {users.map((u) => {
            const isMe = u.email.toLowerCase() === myEmail;
            const isAdminRole = u.role === "admin";
            return (
              <div key={u.email} className="cia-admin-row">
                <span className="cia-admin-name">
                  {u.display_name || "—"}
                  {isMe ? <span className="cia-admin-you">you</span> : null}
                </span>
                <span className="cia-admin-email">{u.email}</span>
                <span className="cia-admin-joined">{formatDate(u.created_at)}</span>
                <span>
                  <span className={`cia-admin-badge ${isAdminRole ? "admin" : ""}`}>
                    {isAdminRole ? "Admin" : "User"}
                  </span>
                </span>
                <span className="cia-admin-actions">
                  {u.locked ? (
                    <span className="cia-forum-muted" title="Primary admin account">
                      Locked
                    </span>
                  ) : isMe ? (
                    <span className="cia-forum-muted">—</span>
                  ) : (
                    <button
                      type="button"
                      className={`cia-admin-toggle ${isAdminRole ? "danger" : ""}`}
                      disabled={savingEmail === u.email}
                      onClick={() => changeRole(u, isAdminRole ? "user" : "admin")}
                    >
                      {savingEmail === u.email
                        ? "…"
                        : isAdminRole
                          ? "Revoke admin"
                          : "Make admin"}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
