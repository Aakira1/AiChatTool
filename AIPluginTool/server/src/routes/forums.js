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
  setVote,
} from "../db/repositories/forumRepo.js";

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
  const deleted = deleteForum(request.params.forumId);
  if (!deleted) {
    response.status(404).json({ error: "Forum not found" });
    return;
  }
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
  const deleted = deletePost(request.params.postId);
  if (!deleted) {
    response.status(404).json({ error: "Post not found" });
    return;
  }
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
  const created = createComment({
    postId: request.params.postId,
    body: parsed.data.body,
    author: request.user?.email ?? null,
  });
  response.status(201).json(created);
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
