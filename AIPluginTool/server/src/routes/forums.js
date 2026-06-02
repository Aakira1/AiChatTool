import { Router } from "express";
import { z } from "zod";
import {
  createForum,
  listForums,
  getForum,
  deleteForum,
  createPost,
  listPosts,
  getPost,
  deletePost,
  createComment,
  listComments,
  getComment,
  deleteComment,
  setAcceptedComment,
  setVote,
  searchPosts,
} from "../db/repositories/forumRepo.js";
import { createNotification } from "../db/repositories/notificationRepo.js";
import { getUserByEmail, listMentionableUsers } from "../db/repositories/userRepo.js";
import { summarizeThread } from "../services/forumAiService.js";
import { canModify } from "../utils/permissions.js";
import { recordAudit } from "../db/repositories/auditRepo.js";

/**
 * Find users mentioned in a body via @token. Matches a token against the start
 * of an email local-part or a display name (case-insensitive, spaces removed).
 * Returns a de-duplicated list of { email, display_name }.
 */
function findMentionedUsers(body) {
  const tokens = [...String(body ?? "").matchAll(/@([\w.-]{2,})/g)].map((m) =>
    m[1].toLowerCase(),
  );
  if (tokens.length === 0) return [];
  const users = listMentionableUsers();
  const matched = new Map();
  for (const user of users) {
    const local = (user.email ?? "").split("@")[0].toLowerCase();
    const name = (user.display_name ?? "").replace(/\s+/g, "").toLowerCase();
    if (tokens.some((t) => local === t || (name && name.startsWith(t)))) {
      matched.set(user.email, user);
    }
  }
  return [...matched.values()];
}

export const forumsRouter = Router();

const forumSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).optional(),
});

const postSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(20_000).optional(),
});

const commentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
});

const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

// ---- Forums -------------------------------------------------------------

forumsRouter.get("/", (request, response) => {
  response.json(listForums());
});

forumsRouter.post("/", (request, response) => {
  const parsed = forumSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid forum payload" });
    return;
  }
  const created = createForum({
    name: parsed.data.name,
    description: parsed.data.description ?? "",
    createdBy: request.user?.email ?? null,
  });
  response.status(201).json(created);
});

forumsRouter.delete("/:forumId", (request, response) => {
  const forum = getForum(request.params.forumId);
  if (!forum) {
    response.status(404).json({ error: "Forum not found" });
    return;
  }
  if (!canModify(request.user, forum.created_by)) {
    response.status(403).json({ error: "You can only delete forums you created" });
    return;
  }
  deleteForum(request.params.forumId);
  recordAudit({
    actorEmail: request.user?.email ?? null,
    action: "delete_forum",
    targetType: "forum",
    targetId: forum.id,
    summary: `Deleted forum "${forum.name}"`,
  });
  response.status(204).end();
});

// ---- Posts --------------------------------------------------------------

forumsRouter.get("/:forumId/posts", (request, response) => {
  const forum = getForum(request.params.forumId);
  if (!forum) {
    response.status(404).json({ error: "Forum not found" });
    return;
  }
  response.json(listPosts(request.params.forumId, request.user?.email ?? ""));
});

forumsRouter.post("/:forumId/posts", (request, response) => {
  const forum = getForum(request.params.forumId);
  if (!forum) {
    response.status(404).json({ error: "Forum not found" });
    return;
  }
  const parsed = postSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid post payload" });
    return;
  }
  const created = createPost({
    forumId: request.params.forumId,
    title: parsed.data.title,
    body: parsed.data.body ?? "",
    author: request.user?.email ?? null,
  });
  response.status(201).json(created);
});

forumsRouter.delete("/posts/:postId", (request, response) => {
  const post = getPost(request.params.postId);
  if (!post) {
    response.status(404).json({ error: "Post not found" });
    return;
  }
  if (!canModify(request.user, post.author)) {
    response.status(403).json({ error: "You can only delete your own posts" });
    return;
  }
  deletePost(request.params.postId);
  recordAudit({
    actorEmail: request.user?.email ?? null,
    action: "delete_post",
    targetType: "post",
    targetId: post.id,
    summary: `Deleted post "${post.title}"${post.author ? ` by ${post.author}` : ""}`,
  });
  response.status(204).end();
});

// ---- Comments -----------------------------------------------------------

forumsRouter.get("/posts/:postId/comments", (request, response) => {
  const post = getPost(request.params.postId);
  if (!post) {
    response.status(404).json({ error: "Post not found" });
    return;
  }
  response.json(listComments(request.params.postId));
});

forumsRouter.post("/posts/:postId/comments", (request, response) => {
  const post = getPost(request.params.postId);
  if (!post) {
    response.status(404).json({ error: "Post not found" });
    return;
  }
  const parsed = commentSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid comment payload" });
    return;
  }
  const author = request.user?.email ?? null;
  const created = createComment({
    postId: request.params.postId,
    body: parsed.data.body,
    author,
  });

  const actor = author ? getUserByEmail(author) : null;
  const actorName = actor?.display_name || author || "Someone";

  // Notify the post author that someone replied (skipped if they replied to themselves).
  if (post.author && post.author !== author) {
    createNotification({
      userEmail: post.author,
      type: "comment",
      actorEmail: author,
      actorName,
      postId: post.id,
      commentId: created.id,
      message: `${actorName} commented on your post "${post.title}"`,
    });
  }

  // Notify anyone @mentioned in the comment (skip the author and the post owner
  // who already got the comment notification above).
  for (const mentioned of findMentionedUsers(parsed.data.body)) {
    if (mentioned.email === author || mentioned.email === post.author) continue;
    createNotification({
      userEmail: mentioned.email,
      type: "mention",
      actorEmail: author,
      actorName,
      postId: post.id,
      commentId: created.id,
      message: `${actorName} mentioned you in "${post.title}"`,
    });
  }

  response.status(201).json(created);
});

forumsRouter.delete("/comments/:commentId", (request, response) => {
  const comment = getComment(request.params.commentId);
  if (!comment) {
    response.status(404).json({ error: "Comment not found" });
    return;
  }
  if (!canModify(request.user, comment.author)) {
    response.status(403).json({ error: "You can only delete your own comments" });
    return;
  }
  deleteComment(request.params.commentId);
  recordAudit({
    actorEmail: request.user?.email ?? null,
    action: "delete_comment",
    targetType: "comment",
    targetId: comment.id,
    summary: `Deleted a comment${comment.author ? ` by ${comment.author}` : ""}`,
  });
  response.status(204).end();
});

// ---- Accepted answer ----------------------------------------------------

const acceptSchema = z.object({
  commentId: z.string().min(1).nullable(),
});

forumsRouter.post("/posts/:postId/accept", (request, response) => {
  const post = getPost(request.params.postId);
  if (!post) {
    response.status(404).json({ error: "Post not found" });
    return;
  }
  if (!canModify(request.user, post.author)) {
    response.status(403).json({ error: "Only the post author can accept an answer" });
    return;
  }
  const parsed = acceptSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid accept payload" });
    return;
  }
  const { commentId } = parsed.data;
  if (commentId) {
    const comment = getComment(commentId);
    if (!comment || comment.post_id !== post.id) {
      response.status(400).json({ error: "Comment does not belong to this post" });
      return;
    }
  }
  setAcceptedComment(post.id, commentId);

  // Notify the answer's author that their reply was accepted.
  if (commentId) {
    const comment = getComment(commentId);
    if (comment?.author && comment.author !== request.user?.email) {
      const actor = request.user?.email ? getUserByEmail(request.user.email) : null;
      const actorName = actor?.display_name || request.user?.email || "Someone";
      createNotification({
        userEmail: comment.author,
        type: "accepted",
        actorEmail: request.user?.email ?? null,
        actorName,
        postId: post.id,
        commentId,
        message: `${actorName} accepted your answer on "${post.title}"`,
      });
    }
  }

  response.json({ accepted_comment_id: commentId });
});

// ---- Votes --------------------------------------------------------------

forumsRouter.post("/posts/:postId/vote", (request, response) => {
  const post = getPost(request.params.postId);
  if (!post) {
    response.status(404).json({ error: "Post not found" });
    return;
  }
  const parsed = voteSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid vote payload" });
    return;
  }
  const email = request.user?.email;
  if (!email) {
    response.status(401).json({ error: "Authentication required to vote" });
    return;
  }
  const result = setVote({
    userEmail: email,
    postId: request.params.postId,
    value: parsed.data.value,
  });
  response.json(result);
});

// ---- AI crossover -------------------------------------------------------

// Search across all forums for related threads (used for "suggest existing threads").
forumsRouter.get("/search/posts", (request, response) => {
  const query = String(request.query.q ?? "").trim();
  if (query.length < 2) {
    response.json([]);
    return;
  }
  response.json(searchPosts(query, 6));
});

// Summarize a post + its comments with the assistant.
forumsRouter.post("/posts/:postId/summarize", async (request, response) => {
  const post = getPost(request.params.postId);
  if (!post) {
    response.status(404).json({ error: "Post not found" });
    return;
  }
  const comments = listComments(request.params.postId);
  try {
    const summary = await summarizeThread(post, comments);
    response.json({ summary });
  } catch (error) {
    response.status(502).json({ error: error.message ?? "Failed to summarize thread" });
  }
});
