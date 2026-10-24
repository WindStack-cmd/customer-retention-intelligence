import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function validate(): Promise<void> {
  const root = process.cwd();
  const schema = await readFile(join(root, "drizzle", "schema.ts"), "utf8");
  const journal = JSON.parse(
    await readFile(join(root, "drizzle", "meta", "_journal.json"), "utf8")
  ) as { entries?: Array<{ idx: number; tag: string }> };

  if (!schema.includes('mysqlTable("users"')) {
    throw new Error("Drizzle schema does not contain the users table");
  }
  if (!schema.includes('mysqlTable(\n  "monitoring_runs"')) {
    throw new Error("Drizzle schema does not contain monitoring_runs");
  }
  if (!schema.includes('mysqlTable(\n  "monitoring_metrics"')) {
    throw new Error("Drizzle schema does not contain monitoring_metrics");
  }

  const entries = journal.entries ?? [];
  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index]?.idx !== index) {
      throw new Error(`Drizzle journal index ${index} is not contiguous`);
    }
    const migrationPath = join(root, "drizzle", `${entries[index]?.tag}.sql`);
    try {
      await readFile(migrationPath, "utf8");
    } catch {
      throw new Error(`Missing migration file for ${entries[index]?.tag}`);
    }
  }
  console.log(
    `Schema validation passed: ${entries.length} migrations and monitoring tables present.`
  );
}

validate().catch(error => {
  console.error(
    error instanceof Error ? error.message : "Schema validation failed"
  );
  process.exitCode = 1;
});
