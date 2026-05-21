import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadApp() {
  vi.resetModules();
  const { createApp } = await import("../app.js");
  return createApp();
}

describe("auth routes", () => {
  beforeEach(() => {
    process.env.AUTH_ENABLED = "false";
    process.env.AUTH_SECRET = "test-secret-key-with-enough-length-12345";
    process.env.AUTH_EMAIL = "test@example.com";
    process.env.AUTH_PASSWORD = "test-password-123";
  });

  it("rejects unauthenticated API access", async () => {
    const app = await loadApp();
    const response = await request(app).get("/api/conversations");
    expect(response.status).toBe(401);
  });

  it("logs in and accesses protected routes", async () => {
    const app = await loadApp();
    const agent = request.agent(app);

    const login = await agent.post("/api/auth/login").send({
      email: "test@example.com",
      password: "test-password-123",
    });
    expect(login.status).toBe(200);

    const list = await agent.get("/api/conversations");
    expect(list.status).toBe(200);
  });

  it("accepts demo.local email addresses", async () => {
    process.env.AUTH_EMAIL = "admin@demo.local";
    process.env.AUTH_PASSWORD = "Admin12345!";
    const app = await loadApp();

    const response = await request(app).post("/api/auth/login").send({
      email: "admin@demo.local",
      password: "Admin12345!",
    });

    expect(response.status).toBe(200);
    expect(response.body.email).toBe("admin@demo.local");
  });
});
