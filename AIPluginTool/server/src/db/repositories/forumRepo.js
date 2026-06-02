import { randomUUID } from "node:crypto";
import { db } from "../client.js";

// ---- Forums -------------------------------------------------------------

const insertForumStmt = db.prepare(`
  INSERT INTO forums (id, name, description, created_by) VALUES (?, ?, ?, ?)
`);

const listForumsStmt = db.prepare(`
  SELECT
    f.id, f.name, f.description, f.created_by, f.created_at,
    (SELECT COUNT(*) FROM forum_posts p WHERE p.forum_id = f.id) AS post_count
  FROM forums f
  ORDER BY f.created_at DESC
`);

const getForumStmt = db.prepare(`SELECT * FROM forums WHERE id = ?`);
const deleteForumStmt = db.prepare(`DELETE FROM forums WHERE id = ?`);
const deletePostsByForumStmt = db.prepare(`DELETE FROM forum_posts WHERE forum_id = ?`);

export function createForum({ name, description = "", createdBy = null }) {
  const id = randomUUID();
  insertForumStmt.run(id, name, description, createdBy);
  return getForum(id);
}

export function listForums() {
  return listForumsStmt.all();
}

export function getForum(id) {
  return getForumStmt.get(id) ?? null;
}

export function deleteForum(id) {
  deletePostsByForumStmt.run(id);
  return deleteForumStmt.run(id).changes > 0;
}

// ---- Posts --------------------------------------------------------------

const insertPostStmt = db.prepare(`
  INSERT INTO forum_posts (id, forum_id, title, body, author) VALUES (?, ?, ?, ?, ?)
`);

const listPostsStmt = db.prepare(`
  SELECT
    p.id, p.forum_id, p.title, p.body, p.author, p.created_at,
    COALESCE((SELECT SUM(value) FROM forum_votes v WHERE v.post_id = p.id), 0) AS score,
    (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) AS comment_count,
    COALESCE((SELECT value FROM forum_votes v WHERE v.post_id = p.id AND v.user_email = ?), 0) AS my_vote
  FROM forum_posts p
  WHERE p.forum_id = ?
  ORDER BY score DESC, p.created_at DESC
`);

const getPostStmt = db.prepare(`SELECT * FROM forum_posts WHERE id = ?`);
const deletePostStmt = db.prepare(`DELETE FROM forum_posts WHERE id = ?`);
const deleteCommentsByPostStmt = db.prepare(`DELETE FROM forum_comments WHERE post_id = ?`);
const deleteVotesByPostStmt = db.prepare(`DELETE FROM forum_votes WHERE post_id = ?`);

export function createPost({ forumId, title, body = "", author = null }) {
  const id = randomUUID();
  insertPostStmt.run(id, forumId, title, body, author);
  return getPostStmt.get(id);
}

export function listPosts(forumId, userEmail = "") {
  return listPostsStmt.all(userEmail, forumId);
}

export function getPost(id) {
  return getPostStmt.get(id) ?? null;
}

export function deletePost(id) {
  deleteCommentsByPostStmt.run(id);
  deleteVotesByPostStmt.run(id);
  return deletePostStmt.run(id).changes > 0;
}

// ---- Comments -----------------------------------------------------------

const insertCommentStmt = db.prepare(`
  INSERT INTO forum_comments (id, post_id, body, author) VALUES (?, ?, ?, ?)
`);

const listCommentsStmt = db.prepare(`
  SELECT id, post_id, body, author, created_at
  FROM forum_comments
  WHERE post_id = ?
  ORDER BY created_at ASC
`);

export function createComment({ postId, body, author = null }) {
  const id = randomUUID();
  insertCommentStmt.run(id, postId, body, author);
  return listCommentsStmt.all(postId).find((c) => c.id === id);
}

export function listComments(postId) {
  return listCommentsStmt.all(postId);
}

// ---- Votes --------------------------------------------------------------

const upsertVoteStmt = db.prepare(`
  INSERT INTO forum_votes (user_email, post_id, value) VALUES (?, ?, ?)
  ON CONFLICT(user_email, post_id) DO UPDATE SET value = excluded.value
`);

const deleteVoteStmt = db.prepare(`
  DELETE FROM forum_votes WHERE user_email = ? AND post_id = ?
`);

const scoreStmt = db.prepare(`
  SELECT COALESCE(SUM(value), 0) AS score FROM forum_votes WHERE post_id = ?
`);

/** value: 1 (up), -1 (down), or 0 (clear). Returns the new score + the user's vote. */
export function setVote({ userEmail, postId, value }) {
  if (value === 0) {
    deleteVoteStmt.run(userEmail, postId);
  } else {
    upsertVoteStmt.run(userEmail, postId, value);
  }
  return { score: scoreStmt.get(postId).score, myVote: value };
}
