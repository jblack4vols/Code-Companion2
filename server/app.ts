import "dotenv/config";
import express from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { validateEnv } from "./middleware/envValidation";
import { globalErrorHandler } from "./middleware/errorHandler";

validateEnv();

const app = express();
app.set("trust proxy", 1);

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

const httpServer = createServer(app);

let initialized = false;

/** Initialize routes, middleware, and static serving. Idempotent. */
export async function initializeApp() {
  if (initialized) return;
  initialized = true;

  await registerRoutes(httpServer, app);
  app.use(globalErrorHandler as any);

  if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
    serveStatic(app);
  }

  log("Application initialized");
}

export { app, httpServer };

// Serverless handler: initializes on first request, then delegates to Express
const init = initializeApp();
export default async function handler(req: any, res: any) {
  await init;
  return app(req, res);
}
