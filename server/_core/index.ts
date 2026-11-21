import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { createRequestId, logger } from "./logger";
import { ENV } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") ?? createRequestId();
    const startedAt = Date.now();
    res.setHeader("x-request-id", requestId);
    res.on("finish", () => {
      // Filter out internal background debug telemetry so terminal stays clean
      if (
        req.path.startsWith("/__manus__") ||
        (req.path === "/" && req.method === "POST")
      ) {
        return;
      }
      logger.info("http.request", {
        request_id: requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
      });
    });
    next();
  });
  // Handle background telemetry cleanly without 404 or fallthrough
  app.post(["/", "/__manus__/logs"], (_req, res) => {
    res.status(200).json({ ok: true });
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: ENV.serviceName,
      environment: ENV.nodeEnv,
      demoMode: ENV.demoMode,
      databaseConfigured: Boolean(ENV.databaseUrl),
      timestamp: new Date().toISOString(),
    });
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (ENV.nodeEnv === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logger.warn("server.port_fallback", {
      preferred_port: preferredPort,
      port,
    });
    console.log(
      `  \x1b[33m➜  Notice: Port ${preferredPort} is in use, falling back to port ${port}\x1b[0m`
    );
  }

  server.listen(port, () => {
    logger.info("server.started", { port, environment: ENV.nodeEnv });
    console.log(
      `\n  \x1b[32m➜\x1b[0m  \x1b[1mLocal:\x1b[0m   \x1b[36mhttp://localhost:${port}/\x1b[0m`
    );
    console.log(
      `  \x1b[32m➜\x1b[0m  \x1b[1mHealth:\x1b[0m  \x1b[36mhttp://localhost:${port}/health\x1b[0m\n`
    );
  });
}

startServer().catch(error => {
  logger.error("server.start_failed", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  process.exitCode = 1;
});
