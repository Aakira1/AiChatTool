import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("createApp", () => {
  it("returns health response", async () => {
    const app = createApp();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("creates and lists conversations", async () => {
    const app = createApp();
    const createResponse = await request(app)
      .post("/api/conversations")
      .send({ title: "Test thread" });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.title).toBe("Test thread");

    const listResponse = await request(app).get("/api/conversations");
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body.length).toBeGreaterThan(0);
  });

  it("deletes a conversation and its messages", async () => {
    const app = createApp();
    const createResponse = await request(app)
      .post("/api/conversations")
      .send({ title: "Delete me" });
    const conversationId = createResponse.body.id;

    const deleteResponse = await request(app).delete(`/api/conversations/${conversationId}`);
    expect(deleteResponse.status).toBe(204);

    const getResponse = await request(app).get(`/api/conversations/${conversationId}`);
    expect(getResponse.status).toBe(404);
  });

  it("imports cases and returns analytics summary", async () => {
    const app = createApp();
    const importResponse = await request(app)
      .post("/api/import/ci")
      .send({
        rows: [
          {
            caseId: "CI-9001",
            status: "open",
            createdAt: "2026-05-10",
            searchTerm: "vpn issue",
            searchSuccess: false,
            topic: "network",
          },
        ],
      });
    expect(importResponse.status).toBe(201);

    const summaryResponse = await request(app).get("/api/analytics/summary");
    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.hasData).toBe(true);
    expect(summaryResponse.body.ci.total).toBeGreaterThan(0);
  });
});
