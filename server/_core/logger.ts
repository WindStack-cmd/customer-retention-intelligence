import { randomUUID } from "node:crypto";
import { ENV } from "./env";

type LogLevel = "info" | "warn" | "error";
type LogContext = Record<string, string | number | boolean | null | undefined>;

const REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "apiKey",
  "api_key",
  "databaseUrl",
]);

function sanitize(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      REDACTED_KEYS.has(key) ? "[REDACTED]" : value,
    ])
  );
}

function write(level: LogLevel, event: string, context: LogContext = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: ENV.serviceName,
    event,
    ...sanitize(context),
  };

  if (ENV.isProduction) {
    console[level === "error" ? "error" : level](JSON.stringify(payload));
    return;
  }

  const details = Object.entries(payload)
    .filter(
      ([key]) => key !== "timestamp" && key !== "level" && key !== "event"
    )
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console[level === "error" ? "error" : level](
    `[${level.toUpperCase()}] ${event}${details ? ` ${details}` : ""}`
  );
}

export const logger = {
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) =>
    write("error", event, context),
};

export function createRequestId() {
  return randomUUID();
}
