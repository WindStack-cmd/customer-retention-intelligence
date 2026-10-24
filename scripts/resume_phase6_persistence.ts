import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";

const ARTIFACT_DIR = process.env.PHASE6_ARTIFACT_DIR ?? "artifacts/phase6";
const SUMMARY_PATH = join(ARTIFACT_DIR, "explanation_summary.json");
const FEATURES_PATH = join(ARTIFACT_DIR, "explanation_features.ndjson");
const EXPECTED_EXPLANATIONS = 26600;
const EXPECTED_FEATURE_COUNT = 37;
const BATCH_SIZE = Math.min(
  1000,
  Math.max(50, Number(process.env.PHASE6_PERSIST_BATCH_SIZE ?? "1000"))
);

type DbRow = RowDataPacket & Record<string, unknown>;
type Summary = {
  modelRunId: number;
  featureVersion: string;
  explainerType: string;
  explainerVersion: string;
  outputSpace: string;
  topN: number;
  featureCount: number;
};
type FeatureRow = {
  snapshotId: number;
  featureName: string;
  featureValue: number;
  isMissing: number;
  shapValue: number;
  contributionDirection: string;
  rank: number;
};

function asNumber(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number))
    throw new Error(`Expected finite number, got ${String(value)}`);
  return number;
}

async function getRun(
  connection: mysql.Connection,
  summary: Summary
): Promise<{ id: number; runKey: string }> {
  const [rows] = await connection.query<DbRow[]>(
    `SELECT id, runKey FROM model_explanation_runs
     WHERE modelRunId = ? AND featureVersion = ? AND explainerType = ?
       AND explainerVersion = ? AND outputSpace = ? AND topN = ?
     ORDER BY id`,
    [
      summary.modelRunId,
      summary.featureVersion,
      summary.explainerType,
      summary.explainerVersion,
      summary.outputSpace,
      summary.topN,
    ]
  );
  if (rows.length !== 1)
    throw new Error(
      `Expected exactly one existing explanation run, found ${rows.length}`
    );
  return { id: asNumber(rows[0].id), runKey: String(rows[0].runKey) };
}

async function getCheckpoint(
  connection: mysql.Connection,
  explanationRunId: number
) {
  const [rows] = await connection.query<DbRow[]>(
    `SELECT ce.id, COUNT(cef.id) AS featureCount
     FROM customer_explanations ce
     LEFT JOIN customer_explanation_features cef ON cef.explanationId = ce.id
     WHERE ce.explanationRunId = ? GROUP BY ce.id ORDER BY ce.id`,
    [explanationRunId]
  );
  let contiguousFeatures = 0;
  let committedFeatures = 0;
  let gapSeen = false;
  for (const row of rows) {
    const count = asNumber(row.featureCount);
    committedFeatures += count;
    if (!gapSeen && count === EXPECTED_FEATURE_COUNT) {
      contiguousFeatures += EXPECTED_FEATURE_COUNT;
    } else if (count < EXPECTED_FEATURE_COUNT) {
      gapSeen = true;
    } else if (gapSeen) {
      throw new Error(
        "Unexpected complete explanation after a partial explanation"
      );
    }
  }
  return {
    explanationCount: rows.length,
    committedFeatures,
    contiguousFeatures,
  };
}

async function getExplanationIds(
  connection: mysql.Connection,
  explanationRunId: number
): Promise<Map<number, number>> {
  const [rows] = await connection.query<DbRow[]>(
    "SELECT id, snapshotId FROM customer_explanations WHERE explanationRunId = ?",
    [explanationRunId]
  );
  return new Map(rows.map(row => [asNumber(row.snapshotId), asNumber(row.id)]));
}

async function persistFromCursor(
  connection: mysql.Connection,
  ids: Map<number, number>,
  skipRows: number
) {
  const input = createInterface({
    input: createReadStream(FEATURES_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let lineIndex = 0;
  let writtenRows = 0;
  let batches = 0;
  let batch: FeatureRow[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const placeholders = batch.map(() => "(?,?,?,?,?,?,?)").join(",");
    const values = batch.flatMap(row => {
      const explanationId = ids.get(row.snapshotId);
      if (!explanationId)
        throw new Error(`No explanation for snapshot ${row.snapshotId}`);
      return [
        explanationId,
        row.featureName,
        row.featureValue,
        row.isMissing,
        row.shapValue,
        row.contributionDirection,
        row.rank,
      ];
    });
    await connection.query(
      `INSERT INTO customer_explanation_features (explanationId, featureName, featureValue, isMissing, shapValue, contributionDirection, \`rank\`)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE featureValue=VALUES(featureValue), isMissing=VALUES(isMissing), shapValue=VALUES(shapValue), contributionDirection=VALUES(contributionDirection), \`rank\`=VALUES(\`rank\`)`,
      values
    );
    writtenRows += batch.length;
    batches += 1;
    if (batches % 25 === 0)
      console.log(
        JSON.stringify({
          status: "progress",
          batches,
          writtenRows,
          nextFeatureRow: skipRows + writtenRows,
        })
      );
    batch = [];
  };
  for await (const line of input) {
    if (!line.trim()) continue;
    if (lineIndex++ < skipRows) continue;
    batch.push(JSON.parse(line) as FeatureRow);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();
  return { skippedRows: Math.min(lineIndex, skipRows), writtenRows, batches };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const summary = JSON.parse(await readFile(SUMMARY_PATH, "utf8")) as Summary;
  if (summary.featureCount !== EXPECTED_FEATURE_COUNT)
    throw new Error(
      `Expected ${EXPECTED_FEATURE_COUNT} features, got ${summary.featureCount}`
    );
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const run = await getRun(connection, summary);
    const before = await getCheckpoint(connection, run.id);
    if (before.explanationCount !== EXPECTED_EXPLANATIONS)
      throw new Error(
        `Expected ${EXPECTED_EXPLANATIONS} explanations, found ${before.explanationCount}`
      );
    const ids = await getExplanationIds(connection, run.id);
    const result = await persistFromCursor(
      connection,
      ids,
      before.contiguousFeatures
    );
    const after = await getCheckpoint(connection, run.id);
    const expectedFeatureRows = EXPECTED_EXPLANATIONS * EXPECTED_FEATURE_COUNT;
    console.log(
      JSON.stringify(
        {
          status: "completed",
          explanationRunId: run.id,
          runKey: run.runKey,
          batchSize: BATCH_SIZE,
          before,
          cursorStart: before.contiguousFeatures,
          result,
          after,
          expectedFeatureRows,
          remainingFeatureRows: expectedFeatureRows - after.committedFeatures,
        },
        null,
        2
      )
    );
    if (after.committedFeatures !== expectedFeatureRows)
      throw new Error("Phase 6 attribution persistence remains incomplete");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
