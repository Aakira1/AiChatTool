import { useEffect, useState } from "react";
import { listForums, createPost } from "../../lib/api.js";
import { useToast } from "../ui/ToastProvider.jsx";

export function PostToForumModal({ open, content, onClose }) {
  const toast = useToast();
  const [forums, setForums] = useState([]);
  const [forumId, setForumId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBody(content ?? "");
    setTitle("");
    listForums()
      .then((data) => {
        setForums(data);
        setForumId((current) => current || data[0]?.id || "");
      })
      .catch(() => setForums([]));
  }, [open, content]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!forumId || !title.trim()) return;
    setSaving(true);
    try {
      await createPost({ forumId, title: title.trim(), body: body.trim() });
      toast.success("Posted to forum");
      onClose();
    } catch (error) {
      toast.error(error.message || "Failed to post to forum");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="t1-profile-overlay" role="presentation" onClick={onClose}>
      <div
        className="t1-profile-panel t1-post-forum-modal"
        role="dialog"
        aria-label="Post to forum"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="t1-profile-panel-header">
          <h2>Post to a forum</h2>
          <button type="button" className="t1-profile-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <form className="t1-profile-form t1-profile-panel-body" onSubmit={handleSubmit}>
          {forums.length === 0 ? (
            <p className="cia-forum-muted">No forums available. Create one in the Forums tab first.</p>
          ) : (
            <label>
              Forum
              <select value={forumId} onChange={(event) => setForumId(event.target.value)}>
                {forums.map((forum) => (
                  <option key={forum.id} value={forum.id}>
                    {forum.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Give your post a title"
              autoFocus
            />
          </label>
          <label>
            Body
            <textarea rows={8} value={body} onChange={(event) => setBody(event.target.value)} />
          </label>
          <footer className="t1-profile-panel-footer">
            <button type="button" className="t1-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="t1-btn-primary"
              disabled={saving || !forumId || !title.trim()}
            >
              {saving ? "Posting…" : "Post"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
