import { useEffect, useState } from "react";
import {
  listAdminUsers,
  setUserRole,
  listAdminPlugins,
  setUserPlugin,
  listAdminContent,
  listAuditLog,
  deleteForum,
  deletePost,
  deleteComment,
  listComments,
} from "../lib/api.js";
import { useToast } from "../components/ui/ToastProvider.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

// ---- Users tab ----------------------------------------------------------

function UsersTab() {
  const toast = useToast();
  const { user } = useAuth();
  const myEmail = user?.email?.toLowerCase() ?? "";
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState(null);

  useEffect(() => {
    listAdminUsers()
      .then(({ users: list }) => setUsers(list))
      .catch((error) => toast.error(error.message || "Failed to load users"))
      .finally(() => setLoading(false));
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

  if (loading) return <p className="cia-forum-muted">Loading users…</p>;
  if (users.length === 0) return <p className="cia-forum-muted">No registered users yet.</p>;

  return (
    <div className="cia-admin-table">
      <div className="cia-admin-row cia-admin-row-head cia-admin-row-users">
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
          <div key={u.email} className="cia-admin-row cia-admin-row-users">
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
                  {savingEmail === u.email ? "…" : isAdminRole ? "Revoke admin" : "Make admin"}
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Plugins tab --------------------------------------------------------

function PluginsTab() {
  const toast = useToast();
  const [plugins, setPlugins] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    Promise.all([listAdminPlugins(), listAdminUsers()])
      .then(([{ plugins: reg }, { users: list }]) => {
        setPlugins(reg);
        setUsers(list);
      })
      .catch((error) => toast.error(error.message || "Failed to load plugins"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (target, plugin, enabled) => {
    const key = `${target.email}:${plugin.id}`;
    setSaving(key);
    try {
      const { plugins: granted } = await setUserPlugin(target.email, plugin.id, enabled);
      setUsers((prev) =>
        prev.map((u) => (u.email === target.email ? { ...u, plugins: granted } : u)),
      );
      toast.success(
        `${enabled ? "Granted" : "Revoked"} ${plugin.label} for ${target.display_name || target.email}`,
      );
    } catch (error) {
      toast.error(error.message || "Failed to update plugin access");
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <p className="cia-forum-muted">Loading plugins…</p>;

  return (
    <div className="cia-admin-plugins">
      {plugins.map((plugin) => (
        <div key={plugin.id} className="cia-plugin-card">
          <div className="cia-plugin-card-head">
            <strong>{plugin.label}</strong>
            <p className="cia-forum-muted">{plugin.description}</p>
          </div>
          <div className="cia-admin-table">
            <div className="cia-admin-row cia-admin-row-head cia-admin-row-plugin">
              <span>User</span>
              <span>Email</span>
              <span>Access</span>
            </div>
            {users.map((u) => {
              const isAdminRole = u.role === "admin";
              const enabled = isAdminRole || (u.plugins ?? []).includes(plugin.id);
              const key = `${u.email}:${plugin.id}`;
              return (
                <div key={u.email} className="cia-admin-row cia-admin-row-plugin">
                  <span className="cia-admin-name">{u.display_name || "—"}</span>
                  <span className="cia-admin-email">{u.email}</span>
                  <span className="cia-admin-actions">
                    {isAdminRole ? (
                      <span className="cia-admin-badge admin">All (admin)</span>
                    ) : (
                      <button
                        type="button"
                        className={`cia-admin-toggle ${enabled ? "danger" : ""}`}
                        disabled={saving === key}
                        onClick={() => toggle(u, plugin, !enabled)}
                      >
                        {saving === key ? "…" : enabled ? "Revoke" : "Grant"}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Moderation tab -----------------------------------------------------

function PostRow({ post, onDeleted }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState(null);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && comments === null) {
      try {
        setComments(await listComments(post.id));
      } catch (error) {
        toast.error(error.message || "Failed to load comments");
        setComments([]);
      }
    }
  };

  const removePost = async () => {
    if (!window.confirm(`Delete post "${post.title}"? This removes its comments too.`)) return;
    try {
      await deletePost(post.id);
      onDeleted();
      toast.success("Post deleted");
    } catch (error) {
      toast.error(error.message || "Failed to delete post");
    }
  };

  const removeComment = async (comment) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteComment(comment.id);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
      toast.success("Comment deleted");
    } catch (error) {
      toast.error(error.message || "Failed to delete comment");
    }
  };

  return (
    <li className="cia-mod-post">
      <div className="cia-mod-post-head">
        <button type="button" className="cia-mod-expand" onClick={toggle}>
          {expanded ? "▾" : "▸"}
        </button>
        <span className="cia-mod-post-title">{post.title}</span>
        <span className="cia-mod-post-meta">
          {post.author_name || post.author || "Anonymous"} · {post.score} pts ·{" "}
          {post.comment_count} comment{post.comment_count === 1 ? "" : "s"}
        </span>
        <button type="button" className="cia-admin-toggle danger" onClick={removePost}>
          Delete
        </button>
      </div>
      {expanded ? (
        <ul className="cia-mod-comments">
          {comments === null ? (
            <li className="cia-forum-muted">Loading…</li>
          ) : comments.length === 0 ? (
            <li className="cia-forum-muted">No comments.</li>
          ) : (
            comments.map((comment) => (
              <li key={comment.id} className="cia-mod-comment">
                <span className="cia-mod-comment-body">{comment.body}</span>
                <span className="cia-mod-comment-meta">
                  {comment.author_name || comment.author || "Anonymous"}
                </span>
                <button
                  type="button"
                  className="cia-admin-toggle danger"
                  onClick={() => removeComment(comment)}
                >
                  Delete
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </li>
  );
}

function ModerationTab() {
  const toast = useToast();
  const [forums, setForums] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { forums: list } = await listAdminContent();
      setForums(list);
    } catch (error) {
      toast.error(error.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeForum = async (forum) => {
    if (!window.confirm(`Delete forum "${forum.name}" and all its posts?`)) return;
    try {
      await deleteForum(forum.id);
      setForums((prev) => prev.filter((f) => f.id !== forum.id));
      toast.success("Forum deleted");
    } catch (error) {
      toast.error(error.message || "Failed to delete forum");
    }
  };

  const removePostFromState = (forumId, postId) => {
    setForums((prev) =>
      prev.map((f) =>
        f.id === forumId
          ? { ...f, posts: f.posts.filter((p) => p.id !== postId) }
          : f,
      ),
    );
  };

  if (loading) return <p className="cia-forum-muted">Loading content…</p>;
  if (forums.length === 0) return <p className="cia-forum-muted">No forums yet.</p>;

  return (
    <div className="cia-mod-list">
      {forums.map((forum) => (
        <section key={forum.id} className="cia-mod-forum">
          <div className="cia-mod-forum-head">
            <h3>{forum.name}</h3>
            <span className="cia-forum-muted">
              {forum.posts.length} post{forum.posts.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              className="cia-admin-toggle danger"
              onClick={() => removeForum(forum)}
            >
              Delete forum
            </button>
          </div>
          {forum.posts.length === 0 ? (
            <p className="cia-forum-muted">No posts.</p>
          ) : (
            <ul className="cia-mod-posts">
              {forum.posts.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  onDeleted={() => removePostFromState(forum.id, post.id)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

// ---- Audit tab ----------------------------------------------------------

const ACTION_LABELS = {
  delete_forum: "Deleted forum",
  delete_post: "Deleted post",
  delete_comment: "Deleted comment",
  set_role: "Changed role",
};

function AuditTab() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAuditLog(200)
      .then(({ entries: list }) => setEntries(list))
      .catch((error) => toast.error(error.message || "Failed to load audit log"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="cia-forum-muted">Loading audit log…</p>;
  if (entries.length === 0)
    return <p className="cia-forum-muted">No admin actions recorded yet.</p>;

  return (
    <div className="cia-admin-table">
      <div className="cia-admin-row cia-admin-row-audit cia-admin-row-head">
        <span>When</span>
        <span>Who</span>
        <span>Action</span>
        <span>Details</span>
      </div>
      {entries.map((entry) => (
        <div key={entry.id} className="cia-admin-row cia-admin-row-audit">
          <span className="cia-admin-joined">{formatDate(entry.created_at)}</span>
          <span className="cia-admin-email">{entry.actor_email || "—"}</span>
          <span>
            <span className="cia-admin-badge">
              {ACTION_LABELS[entry.action] || entry.action}
            </span>
          </span>
          <span className="cia-mod-comment-body">{entry.summary || "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Page ---------------------------------------------------------------

const TABS = [
  ["users", "Users"],
  ["plugins", "Plugins"],
  ["moderation", "Moderation"],
  ["audit", "Audit log"],
];

export function AdminPage() {
  const [tab, setTab] = useState("users");

  return (
    <div className="cia-admin-page t1-animate-in">
      <div className="cia-admin-header">
        <div>
          <h1>Admin</h1>
          <p>Manage users, moderate forum content, and review admin activity.</p>
        </div>
      </div>

      <div className="cia-admin-tabs">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`cia-admin-tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "users" ? (
        <UsersTab />
      ) : tab === "plugins" ? (
        <PluginsTab />
      ) : tab === "moderation" ? (
        <ModerationTab />
      ) : (
        <AuditTab />
      )}
    </div>
  );
}
