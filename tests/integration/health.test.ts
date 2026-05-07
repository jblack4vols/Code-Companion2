import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import { createServer, type Server } from "http";

function createTestApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.0",
    });
  });

  return app;
}

describe("Health Endpoints (mock server)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createTestApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    return () => {
      server.close();
    };
  });

  it("GET /health should return 200 OK", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("OK");
  });

  it("GET /api/health should return JSON with status ok", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(typeof body.uptime).toBe("number");
    expect(body.version).toBe("1.0.0");
  });

  it("GET /api/health should have valid ISO timestamp", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });
});
