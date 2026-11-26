import path from "path";
import os from "os";
import fs from "fs";
import { beforeAll, afterAll, beforeEach } from "vitest";

const tempDir = path.resolve(os.tmpdir(), "pulseboard_test_data");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const testCachePath = path.resolve(tempDir, `test_cache_${process.pid}.json`);
process.env.TENANT_CACHE_FILE = testCachePath;
process.env.SKIP_DB_CONNECTION = "true";
process.env.ORDERS_CSV_PATH =
  process.env.ORDERS_CSV_PATH ??
  path.resolve("server/fixtures/orders_sample.csv");

let tenantStorage: typeof import("./tenantStorage").tenantStorage;

beforeAll(async () => {
  process.env.TENANT_CACHE_FILE = testCachePath;
  if (fs.existsSync(testCachePath)) {
    try {
      fs.unlinkSync(testCachePath);
    } catch {}
  }
  ({ tenantStorage } = await import("./tenantStorage"));
  tenantStorage.reloadFromDisk();
});

beforeEach(async () => {
  if (!tenantStorage) {
    ({ tenantStorage } = await import("./tenantStorage"));
  }
  // Ensure test runs against an isolated store in temp file
  tenantStorage.resetStore();
});

afterAll(() => {
  if (fs.existsSync(testCachePath)) {
    try {
      fs.unlinkSync(testCachePath);
    } catch {}
  }
});
