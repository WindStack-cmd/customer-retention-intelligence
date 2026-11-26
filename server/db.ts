import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let lastDbFailureTime = 0;
const DB_FAILURE_COOLDOWN_MS = 60_000;
const CONNECT_TIMEOUT_MS = 2000;

export function isDbConnectionSkipped(): boolean {
  if (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.SKIP_DB_CONNECTION === "true"
  ) {
    return true;
  }
  if (lastDbFailureTime > 0 && Date.now() - lastDbFailureTime < DB_FAILURE_COOLDOWN_MS) {
    return true;
  }
  return false;
}

export function recordDbFailure(err?: unknown): void {
  lastDbFailureTime = Date.now();
  _db = null;
  console.warn(
    `[Database Fallback] MySQL unreachable (${(err as any)?.message ?? "connection failed"}). Remembering failure for 60s cooldown; skipping DB and using labelled dev fallback.`
  );
}

export function resetDbFailureCooldown(): void {
  lastDbFailureTime = 0;
  _db = null;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
// When MySQL is unreachable, uses a ~2s connect timeout and remembers failure for 60s.
export async function getDb() {
  if (isDbConnectionSkipped()) {
    return null;
  }
  if (!process.env.DATABASE_URL) {
    return null;
  }
  if (_db) {
    return _db;
  }

  try {
    const conn = await Promise.race([
      mysql.createConnection({
        uri: process.env.DATABASE_URL,
        connectTimeout: CONNECT_TIMEOUT_MS,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`MySQL connection timeout (${CONNECT_TIMEOUT_MS}ms)`)
            ),
          CONNECT_TIMEOUT_MS
        )
      ),
    ]);
    await conn.ping();
    await conn.end().catch(() => {});
    _db = drizzle(process.env.DATABASE_URL);
    lastDbFailureTime = 0;
    return _db;
  } catch (error) {
    recordDbFailure(error);
    return null;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
