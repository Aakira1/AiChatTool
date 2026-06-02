import { useEffect, useState } from "react";
import {
  listForums,
  createForum,
  deleteForum,
  listPosts,
  createPost,
  deletePost,
  listComments,
  createComment,
  votePost,
} from "../lib/api.js";
import { useToast } from "../components/ui/ToastProvider.jsx";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function CommentsSection({ postId }) {
  const toast = useToast();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    listComments(postId)
      .then((data) => {
        if (active) setComments(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postId]);

  const submit = async (event) => {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    try {
      const created = await createComment({ postId, body: text });
      setComments((prev) => [...prev, created]);
      setBody("");
    } catch (error) {
      toast.error(error.message || "Failed to add comment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cia-forum-comments">
      {loading ? (
        <p className="cia-forum-muted">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="cia-forum-muted">No comments yet. Be the first to reply.</p>
      ) : (
        <ul className="cia-forum-comment-list">
          {comments.map((comment) => (
            <li key={comment.id} className="cia-forum-comment">
              <div className="cia-forum-comment-meta">
                <span className="cia-forum-comment-author">{comment.author || "Anonymous"}</span>
                <span className="cia-forum-comment-date">{formatDate(comment.created_at)}</span>
              </div>
              <p className="cia-forum-comment-body">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="cia-forum-comment-form" onSubmit={submit}>
        <input
          type="text"
          value={body}
          placeholder="Add a comment…"
          onChange={(event) => setBody(event.target.value)}
        />
        <button type="submit" disabled={saving || !body.trim()}>
          {saving ? "…" : "Reply"}
        </button>
      </form>
    </div>
  );
}

function PostCard({ post, onVote, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="cia-forum-post">
      <div className="cia-forum-vote">
        <button
          type="button"
          className={`cia-forum-vote-btn ${post.my_vote === 1 ? "active up" : ""}`}
          onClick={() => onVote(post, post.my_vote === 1 ? 0 : 1)}
          aria-label="Upvote"
        >
          ▲
        </button>
        <span className="cia-forum-score">{post.score}</span>
        <button
          type="button"
          className={`cia-forum-vote-btn ${post.my_vote === -1 ? "active down" : ""}`}
          onClick={() => onVote(post, post.my_vote === -1 ? 0 : -1)}
          aria-label="Downvote"
        >
          ▼
        </button>
      </div>
      <div className="cia-forum-post-main">
        <h3 className="cia-forum-post-title">{post.title}</h3>
        {post.body ? <p className="cia-forum-post-body">{post.body}</p> : null}
        <div className="cia-forum-post-meta">
          <span>{post.author || "Anonymous"}</span>
          <span>·</span>
          <span>{formatDate(post.created_at)}</span>
          <button
            type="button"
            className="cia-forum-link-btn"
            onClick={() => setExpanded((value) => !value)}
          >
            {post.comment_count || 0} comment{post.comment_count === 1 ? "" : "s"}
          </button>
          <button
            type="button"
            className="cia-forum-link-btn danger"
            onClick={() => onDelete(post)}
          >
            Delete
          </button>
        </div>
        {expanded ? <CommentsSection postId={post.id} /> : null}
      </div>
    </article>
  );
}

export function ForumsPage() {
  const toast = useToast();
  const [forums, setForums] = useState([]);
  const [activeForum, setActiveForum] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingForums, setLoadingForums] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const [creatingForum, setCreatingForum] = useState(false);
  const [forumForm, setForumForm] = useState({ name: "", description: "" });

  const [postForm, setPostForm] = useState({ title: "", body: "" });
  const [showPostForm, setShowPostForm] = useState(false);

  const loadForums = async (selectId) => {
    setLoadingForums(true);
    try {
      const data = await listForums();
      setForums(data);
      const next = selectId
        ? data.find((forum) => forum.id === selectId)
        : data.find((forum) => forum.id === activeForum?.id) || data[0];
      setActiveForum(next || null);
    } catch (error) {
      toast.error(error.message || "Failed to load forums");
    } finally {
      setLoadingForums(false);
    }
  };

  useEffect(() => {
    loadForums();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeForum) {
      setPosts([]);
      return;
    }
    let active = true;
    setLoadingPosts(true);
    listPosts(activeForum.id)
      .then((data) => {
        if (active) setPosts(data);
      })
      .catch((error) => toast.error(error.message || "Failed to load posts"))
      .finally(() => {
        if (active) setLoadingPosts(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeForum?.id]);

  const submitForum = async (event) => {
    event.preventDefault();
    const name = forumForm.name.trim();
    if (!name) return;
    try {
      const created = await createForum({ name, description: forumForm.description.trim() });
      setForumForm({ name: "", description: "" });
      setCreatingForum(false);
      await loadForums(created.id);
      toast.success("Forum created");
    } catch (error) {
      toast.error(error.message || "Failed to create forum");
    }
  };

  const removeForum = async (forum) => {
    if (!window.confirm(`Delete forum "${forum.name}" and all its posts?`)) return;
    try {
      await deleteForum(forum.id);
      await loadForums();
      toast.success("Forum deleted");
    } catch (error) {
      toast.error(error.message || "Failed to delete forum");
    }
  };

  const submitPost = async (event) => {
    event.preventDefault();
    const title = postForm.title.trim();
    if (!title || !activeForum) return;
    try {
      const created = await createPost({
        forumId: activeForum.id,
        title,
        body: postForm.body.trim(),
      });
      setPosts((prev) => [created, ...prev]);
      setPostForm({ title: "", body: "" });
      setShowPostForm(false);
      setForums((prev) =>
        prev.map((forum) =>
          forum.id === activeForum.id
            ? { ...forum, post_count: (forum.post_count || 0) + 1 }
            : forum,
        ),
      );
    } catch (error) {
      toast.error(error.message || "Failed to create post");
    }
  };

  const handleVote = async (post, value) => {
    try {
      const result = await votePost({ postId: post.id, value });
      setPosts((prev) =>
        prev.map((item) =>
          item.id === post.id ? { ...item, score: result.score, my_vote: result.myVote } : item,
        ),
      );
    } catch (error) {
      toast.error(error.message || "Failed to vote");
    }
  };

  const handleDeletePost = async (post) => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await deletePost(post.id);
      setPosts((prev) => prev.filter((item) => item.id !== post.id));
    } catch (error) {
      toast.error(error.message || "Failed to delete post");
    }
  };

  return (
    <div className="cia-forums-page t1-animate-in">
      <aside className="cia-forums-sidebar">
        <div className="cia-forums-sidebar-header">
          <h2>Forums</h2>
          <button
            type="button"
            className="cia-forums-new-btn"
            onClick={() => setCreatingForum((value) => !value)}
          >
            {creatingForum ? "Cancel" : "+ New"}
          </button>
        </div>

        {creatingForum ? (
          <form className="cia-forums-create" onSubmit={submitForum}>
            <input
              type="text"
              placeholder="Forum name"
              value={forumForm.name}
              autoFocus
              onChange={(event) => setForumForm((form) => ({ ...form, name: event.target.value }))}
            />
            <textarea
              placeholder="Description (optional)"
              rows={2}
              value={forumForm.description}
              onChange={(event) =>
                setForumForm((form) => ({ ...form, description: event.target.value }))
              }
            />
            <button type="submit" disabled={!forumForm.name.trim()}>
              Create forum
            </button>
          </form>
        ) : null}

        {loadingForums ? (
          <p className="cia-forum-muted">Loading…</p>
        ) : forums.length === 0 ? (
          <p className="cia-forum-muted">No forums yet. Create the first one.</p>
        ) : (
          <ul className="cia-forums-list">
            {forums.map((forum) => (
              <li key={forum.id}>
                <button
                  type="button"
                  className={`cia-forums-list-item ${activeForum?.id === forum.id ? "active" : ""}`}
                  onClick={() => setActiveForum(forum)}
                >
                  <span className="cia-forums-list-name">{forum.name}</span>
                  <span className="cia-forums-list-count">{forum.post_count || 0}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="cia-forums-main">
        {activeForum ? (
          <>
            <div className="cia-forums-main-header">
              <div>
                <h1>{activeForum.name}</h1>
                {activeForum.description ? <p>{activeForum.description}</p> : null}
              </div>
              <div className="cia-forums-main-actions">
                <button
                  type="button"
                  className="cia-forums-new-btn"
                  onClick={() => setShowPostForm((value) => !value)}
                >
                  {showPostForm ? "Cancel" : "+ New post"}
                </button>
                <button
                  type="button"
                  className="cia-forum-link-btn danger"
                  onClick={() => removeForum(activeForum)}
                >
                  Delete forum
                </button>
              </div>
            </div>

            {showPostForm ? (
              <form className="cia-forums-post-form" onSubmit={submitPost}>
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
                  rows={4}
                  value={postForm.body}
                  onChange={(event) =>
                    setPostForm((form) => ({ ...form, body: event.target.value }))
                  }
                />
                <button type="submit" disabled={!postForm.title.trim()}>
                  Post
                </button>
              </form>
            ) : null}

            {loadingPosts ? (
              <p className="cia-forum-muted">Loading posts…</p>
            ) : posts.length === 0 ? (
              <p className="cia-forum-muted">No posts yet. Start the conversation.</p>
            ) : (
              <div className="cia-forum-post-list">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onVote={handleVote}
                    onDelete={handleDeletePost}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="cia-forums-empty">
            <h1>Forums</h1>
            <p>Create a forum to get started.</p>
          </div>
        )}
      </section>
    </div>
  );
}
