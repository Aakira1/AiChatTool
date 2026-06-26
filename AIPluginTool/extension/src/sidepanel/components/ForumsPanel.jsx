import { useCallback, useEffect, useState } from "react";
import {
  listForums,
  createForum,
  deleteForum,
  listForumPosts,
  createForumPost,
  deleteForumPost,
  listForumComments,
  createForumComment,
  voteForumPost,
} from "../../lib/api.js";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

function Comments({ postId }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listForumComments(postId)
      .then((data) => active && setComments(data))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [postId]);

  const submit = async (event) => {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    try {
      const created = await createForumComment({ postId, body: text });
      setComments((prev) => [...prev, created]);
      setBody("");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="cia-ext-forum-comments">
      {loading ? (
        <p className="cia-ext-forum-muted">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="cia-ext-forum-muted">No comments yet.</p>
      ) : (
        comments.map((comment) => (
          <div key={comment.id} className="cia-ext-forum-comment">
            <span className="cia-ext-forum-comment-author">
              {comment.author_name || comment.author || "Anonymous"}
            </span>
            <p>{comment.body}</p>
          </div>
        ))
      )}
      <form className="cia-ext-forum-comment-form" onSubmit={submit}>
        <input
          type="text"
          value={body}
          placeholder="Add a comment…"
          onChange={(event) => setBody(event.target.value)}
        />
        <button type="submit" disabled={!body.trim()}>
          Reply
        </button>
      </form>
    </div>
  );
}

export function ForumsPanel({ onClose, initialDraft = null }) {
  const [forums, setForums] = useState([]);
  const [activeForum, setActiveForum] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [creatingForum, setCreatingForum] = useState(false);
  const [forumName, setForumName] = useState("");

  const [showPostForm, setShowPostForm] = useState(Boolean(initialDraft));
  const [postForm, setPostForm] = useState({
    title: initialDraft?.title ?? "",
    body: initialDraft?.body ?? "",
  });
  const [openComments, setOpenComments] = useState({});

  const loadForums = useCallback(
    async (selectId) => {
      setLoading(true);
      try {
        const data = await listForums();
        setForums(data);
        setActiveForum((current) => {
          if (selectId) return data.find((forum) => forum.id === selectId) || null;
          return data.find((forum) => forum.id === current?.id) || data[0] || null;
        });
        setError(null);
      } catch (loadError) {
        setError(loadError.message ?? "Failed to load forums");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadForums();
  }, [loadForums]);

  useEffect(() => {
    if (!activeForum) {
      setPosts([]);
      return;
    }
    let active = true;
    listForumPosts(activeForum.id)
      .then((data) => active && setPosts(data))
      .catch(() => active && setError("Failed to load posts"));
    return () => {
      active = false;
    };
  }, [activeForum]);

  const submitForum = async (event) => {
    event.preventDefault();
    const name = forumName.trim();
    if (!name) return;
    try {
      const created = await createForum({ name });
      setForumName("");
      setCreatingForum(false);
      await loadForums(created.id);
    } catch (createError) {
      setError(createError.message ?? "Failed to create forum");
    }
  };

  const removeForum = async () => {
    if (!activeForum) return;
    try {
      await deleteForum(activeForum.id);
      await loadForums();
    } catch (deleteError) {
      setError(deleteError.message ?? "Failed to delete forum");
    }
  };

  const submitPost = async (event) => {
    event.preventDefault();
    const title = postForm.title.trim();
    if (!title || !activeForum) return;
    try {
      const created = await createForumPost({
        forumId: activeForum.id,
        title,
        body: postForm.body.trim(),
      });
      setPosts((prev) => [created, ...prev]);
      setPostForm({ title: "", body: "" });
      setShowPostForm(false);
    } catch (postError) {
      setError(postError.message ?? "Failed to create post");
    }
  };

  const handleVote = async (post, value) => {
    try {
      const result = await voteForumPost({ postId: post.id, value });
      setPosts((prev) =>
        prev.map((item) =>
          item.id === post.id ? { ...item, score: result.score, my_vote: result.myVote } : item,
        ),
      );
    } catch {
      /* ignore */
    }
  };

  const removePost = async (post) => {
    try {
      await deleteForumPost(post.id);
      setPosts((prev) => prev.filter((item) => item.id !== post.id));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="cia-ext-settings-overlay" role="dialog" aria-label="Forums">
      <div className="cia-ext-settings-header">
        <strong>Forums</strong>
      </div>

      <div className="cia-ext-settings-body">
        {error ? <p className="cia-ext-banner cia-ext-banner-error">{error}</p> : null}

        <div className="cia-ext-forum-bar">
          <select
            value={activeForum?.id ?? ""}
            onChange={(event) =>
              setActiveForum(forums.find((forum) => forum.id === event.target.value) || null)
            }
          >
            {forums.length === 0 ? <option value="">No forums yet</option> : null}
            {forums.map((forum) => (
              <option key={forum.id} value={forum.id}>
                {forum.name} ({forum.post_count || 0})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="cia-ext-secondary-btn"
            onClick={() => setCreatingForum((value) => !value)}
          >
            {creatingForum ? "Cancel" : "+ Forum"}
          </button>
        </div>

        {creatingForum ? (
          <form className="cia-ext-forum-create" onSubmit={submitForum}>
            <input
              type="text"
              placeholder="Forum name"
              value={forumName}
              autoFocus
              onChange={(event) => setForumName(event.target.value)}
            />
            <button type="submit" className="cia-ext-primary-btn" disabled={!forumName.trim()}>
              Create
            </button>
          </form>
        ) : null}

        {loading ? (
          <p className="cia-ext-forum-muted">Loading…</p>
        ) : activeForum ? (
          <>
            <div className="cia-ext-forum-actions">
              <button
                type="button"
                className="cia-ext-primary-btn"
                onClick={() => setShowPostForm((value) => !value)}
              >
                {showPostForm ? "Cancel" : "+ New post"}
              </button>
              <button type="button" className="cia-ext-link-danger" onClick={removeForum}>
                Delete forum
              </button>
            </div>

            {showPostForm ? (
              <form className="cia-ext-forum-create" onSubmit={submitPost}>
                <input
                  type="text"
                  placeholder="Post title"
                  value={postForm.title}
                  autoFocus
                  onChange={(event) =>
                    setPostForm((form) => ({ ...form, title: event.target.value }))
                  }
                />
                <textarea
                  placeholder="Write something… (optional)"
                  rows={3}
                  value={postForm.body}
                  onChange={(event) =>
                    setPostForm((form) => ({ ...form, body: event.target.value }))
                  }
                />
                <button type="submit" className="cia-ext-primary-btn" disabled={!postForm.title.trim()}>
                  Post
                </button>
              </form>
            ) : null}

            {posts.length === 0 ? (
              <p className="cia-ext-forum-muted">No posts yet.</p>
            ) : (
              <div className="cia-ext-forum-posts">
                {posts.map((post) => (
                  <div key={post.id} className="cia-ext-forum-post">
                    <div className="cia-ext-forum-vote">
                      <button
                        type="button"
                        className={post.my_vote === 1 ? "active" : ""}
                        onClick={() => handleVote(post, post.my_vote === 1 ? 0 : 1)}
                        aria-label="Upvote"
                      >
                        ▲
                      </button>
                      <span>{post.score}</span>
                      <button
                        type="button"
                        className={post.my_vote === -1 ? "active" : ""}
                        onClick={() => handleVote(post, post.my_vote === -1 ? 0 : -1)}
                        aria-label="Downvote"
                      >
                        ▼
                      </button>
                    </div>
                    <div className="cia-ext-forum-post-main">
                      <strong>{post.title}</strong>
                      {post.body ? <p>{post.body}</p> : null}
                      <div className="cia-ext-forum-post-meta">
                        <span>{post.author_name || post.author || "Anonymous"}</span>
                        <span>{formatDate(post.created_at)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenComments((state) => ({ ...state, [post.id]: !state[post.id] }))
                          }
                        >
                          {post.comment_count || 0} comments
                        </button>
                        <button
                          type="button"
                          className="cia-ext-link-danger"
                          onClick={() => removePost(post)}
                        >
                          Delete
                        </button>
                      </div>
                      {openComments[post.id] ? <Comments postId={post.id} /> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="cia-ext-forum-muted">Create a forum to get started.</p>
        )}
      </div>
    </div>
  );
}
