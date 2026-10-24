import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { pathToFileURL } from "node:url";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";

const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
const PROCESSED_FILE = path.join(
  DATA_DIR,
  "processed",
  "online_retail_processed.csv"
);
const STAGING_FILE = path.join(
  DATA_DIR,
  "staging",
  "online_retail_normalized.csv"
);
const QUALITY_FILE = path.join(
  DATA_DIR,
  "quality",
  "online_retail_quality.json"
);
const BATCH_SIZE = 50;
const TRANSFORMATION_VERSION = "phase2-stdlib-v1";

type CsvRow = Record<string, string>;
type QualityReport = {
  source: {
    dataset: string;
    sourceUrl: string;
    sourceFile: string;
    sourceSha256: string;
    archiveSha256?: string | null;
    retrievedAtUtc: string;
  };
  counts: { rowsBeforeCleaning: number; rowsAfterCleaning: number };
  overallQualityStatus: "PASS" | "WARNING" | "FAIL";
  duplicates: {
    exactDuplicateRows: number;
    duplicateInvoiceIds: number;
    duplicateCustomerIds: number;
  };
  invalidRecords: {
    missingCustomerId: number;
    invalidNumeric: number;
    invalidDate: number;
    rejectedFromCustomerLevelOutput: number;
  };
  numericalBusinessRules: {
    negativeQuantityRows: number;
    negativeUnitPriceRows: number;
    zeroUnitPriceRows: number;
  };
};

type CustomerAggregate = {
  sourceCustomerId: string;
  firstActivityAt: string;
  lastActivityAt: string;
  country: string | null;
};
type ProductAggregate = { sourceStockCode: string; description: string | null };
type OrderAggregate = {
  sourceInvoiceId: string;
  customerSourceId: string;
  invoiceDate: string;
  isCancellation: number;
};
type IdRow = RowDataPacket & { id: number };
type RunRow = RowDataPacket & { id: number; provenanceId: number };
type NamedIdRow = RowDataPacket & {
  id: number;
  sourceCustomerId?: string;
  sourceStockCode?: string;
  sourceInvoiceId?: string;
};

export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) {
      fields.push(field);
      field = "";
      continue;
    }
    field += character;
  }
  fields.push(field.replace(/\r$/, ""));
  return fields;
}

async function* readCsv(filePath: string): AsyncGenerator<CsvRow> {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input, crlfDelay: Infinity });
  let headers: string[] | undefined;
  try {
    for await (const line of reader) {
      if (!headers) {
        headers = parseCsvLine(line);
        continue;
      }
      if (!line.trim()) continue;
      const values = parseCsvLine(line);
      yield Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""])
      );
    }
  } finally {
    input.destroy();
  }
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing required value: ${label}`);
  return value;
}

function nullable(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function numberOrNull(value: string | undefined): number | null {
  const normalized = nullable(value);
  if (normalized === null) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number))
    throw new Error(`Invalid numeric value: ${value}`);
  return number;
}

function flag(value: string | undefined): number {
  return value === "true" ? 1 : 0;
}

export function rowHash(sourceSha256: string, rowNumber: string): string {
  return createHash("sha256")
    .update(`${sourceSha256}:row:${rowNumber}`)
    .digest("hex");
}

async function readQualityReport(): Promise<QualityReport> {
  const raw = JSON.parse(await readFile(QUALITY_FILE, "utf8")) as Record<
    string,
    any
  >;
  return {
    source: {
      dataset: raw.source.dataset,
      sourceUrl: raw.source.source_url,
      sourceFile: raw.source.source_filename,
      sourceSha256: raw.source.sha256,
      archiveSha256: raw.source.archive_sha256,
      retrievedAtUtc: raw.source.retrieved_at_utc,
    },
    counts: {
      rowsBeforeCleaning: raw.counts.rows_before_cleaning,
      rowsAfterCleaning: raw.counts.rows_after_cleaning,
    },
    overallQualityStatus: raw.overall_quality_status,
    duplicates: {
      exactDuplicateRows: raw.duplicates.exact_duplicate_rows,
      duplicateInvoiceIds: raw.duplicates.duplicate_invoice_ids,
      duplicateCustomerIds: raw.duplicates.duplicate_customer_ids,
    },
    invalidRecords: {
      missingCustomerId: raw.invalid_records.missing_customer_id,
      invalidNumeric: raw.invalid_records.invalid_numeric,
      invalidDate: raw.invalid_records.invalid_date,
      rejectedFromCustomerLevelOutput:
        raw.invalid_records.rejected_from_customer_level_output,
    },
    numericalBusinessRules: {
      negativeQuantityRows: raw.numerical_business_rules.negative_quantity_rows,
      negativeUnitPriceRows:
        raw.numerical_business_rules.negative_unit_price_rows,
      zeroUnitPriceRows: raw.numerical_business_rules.zero_unit_price_rows,
    },
  };
}

async function insertBatch(
  connection: Connection,
  table: string,
  columns: string[],
  rows: unknown[][],
  duplicateClause: string
): Promise<void> {
  if (rows.length === 0) return;
  const placeholders = rows
    .map(() => `(${columns.map(() => "?").join(",")})`)
    .join(",");
  await connection.query(
    `INSERT INTO \`${table}\` (${columns.map(column => `\`${column}\``).join(",")}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${duplicateClause}`,
    rows.flat()
  );
}

async function queryIds(
  connection: Connection,
  table: string,
  column: string,
  provenanceId: number
): Promise<Map<string, number>> {
  const [rows] = await connection.query<NamedIdRow[]>(
    `SELECT id, \`${column}\` FROM \`${table}\` WHERE provenanceId = ?`,
    [provenanceId]
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = row[column as keyof NamedIdRow];
    if (typeof value === "string") map.set(value, row.id);
  }
  return map;
}

async function getRun(
  connection: Connection,
  runKey: string
): Promise<RunRow | null> {
  const [rows] = await connection.query<RunRow[]>(
    "SELECT id, provenanceId FROM data_quality_runs WHERE runKey = ? LIMIT 1",
    [runKey]
  );
  return rows[0] ?? null;
}

async function ensureRun(
  connection: Connection,
  quality: QualityReport,
  runKey: string
): Promise<{ provenanceId: number; ingestionRunId: number; resumed: boolean }> {
  const existing = await getRun(connection, runKey);
  if (existing)
    return {
      provenanceId: existing.provenanceId,
      ingestionRunId: existing.id,
      resumed: true,
    };

  await connection.query(
    "INSERT INTO data_provenance (datasetName, sourceUrl, sourceFile, sourceSha256, archiveSha256, transformationVersion, retrievedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
    [
      quality.source.dataset,
      quality.source.sourceUrl,
      quality.source.sourceFile,
      quality.source.sourceSha256,
      quality.source.archiveSha256 ?? null,
      TRANSFORMATION_VERSION,
      new Date(quality.source.retrievedAtUtc),
    ]
  );
  const [provenanceRows] = await connection.query<IdRow[]>(
    "SELECT id FROM data_provenance WHERE sourceSha256 = ? LIMIT 1",
    [quality.source.sourceSha256]
  );
  const provenanceId = provenanceRows[0]?.id;
  if (!provenanceId)
    throw new Error("Unable to create or find data provenance row");

  await connection.query(
    "INSERT INTO data_quality_runs (provenanceId, runKey, status, rowsInspected, rowsAccepted, rowsRejected, qualitySummary, executedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      provenanceId,
      runKey,
      quality.overallQualityStatus,
      quality.counts.rowsBeforeCleaning,
      quality.counts.rowsAfterCleaning,
      quality.invalidRecords.rejectedFromCustomerLevelOutput,
      JSON.stringify(quality),
      new Date(quality.source.retrievedAtUtc),
    ]
  );
  const run = await getRun(connection, runKey);
  if (!run) throw new Error("Unable to create data quality run");
  return { provenanceId, ingestionRunId: run.id, resumed: false };
}

async function isComplete(
  connection: Connection,
  runId: number,
  quality: QualityReport
): Promise<boolean> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT (SELECT COUNT(*) FROM retail_source_rows WHERE ingestionRunId = ?) AS sourceRows, (SELECT COUNT(*) FROM invoice_items WHERE ingestionRunId = ?) AS invoiceItems",
    [runId, runId]
  );
  const current = rows[0] as { sourceRows: number; invoiceItems: number };
  return (
    Number(current.sourceRows) === quality.counts.rowsBeforeCleaning &&
    Number(current.invoiceItems) === quality.counts.rowsAfterCleaning
  );
}

function maxBatchesPerInvocation(): number {
  const value = Number(process.env.IMPORT_MAX_BATCHES ?? "200");
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new Error(
      "IMPORT_MAX_BATCHES must be an integer between 1 and 10000"
    );
  }
  return value;
}

function maxChunksPerInvocation(): number {
  if (process.env.IMPORT_MAX_CHUNKS === "unlimited")
    return Number.POSITIVE_INFINITY;
  const value = Number(process.env.IMPORT_MAX_CHUNKS ?? "1");
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("IMPORT_MAX_CHUNKS must be an integer between 1 and 100");
  }
  return value;
}

function itemBatchSize(): number {
  const value = Number(process.env.IMPORT_ITEM_BATCH_SIZE ?? BATCH_SIZE);
  if (!Number.isInteger(value) || value < BATCH_SIZE || value > 500) {
    throw new Error(
      "IMPORT_ITEM_BATCH_SIZE must be an integer between 50 and 500"
    );
  }
  return value;
}

async function getCheckpoint(
  connection: Connection,
  table: "retail_source_rows" | "invoice_items",
  runId: number
): Promise<number> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COALESCE(MAX(sourceRowNumber), 0) AS checkpoint FROM ${table} WHERE ingestionRunId = ?`,
    [runId]
  );
  return Number(rows[0]?.checkpoint ?? 0);
}

async function processSourceChunk(
  connection: Connection,
  quality: QualityReport,
  provenanceId: number,
  ingestionRunId: number,
  sourceIterator: AsyncGenerator<CsvRow>,
  startCheckpoint: number,
  maxBatches: number
): Promise<{
  checkpoint: number;
  batches: number;
  rows: number;
  complete: boolean;
}> {
  let checkpoint = startCheckpoint;
  let batches = 0;
  let rows = 0;
  let batch: unknown[][] = [];
  while (true) {
    const next = await sourceIterator.next();
    if (next.done) break;
    const row = next.value;
    const rowNumber = Number(required(row._row_number, "staging _row_number"));
    if (rowNumber <= startCheckpoint) continue;
    batch.push([
      rowNumber,
      rowHash(quality.source.sourceSha256, String(rowNumber)),
      required(row.InvoiceNo, "staging InvoiceNo"),
      required(row.StockCode, "staging StockCode"),
      nullable(row.Description),
      numberOrNull(row.Quantity),
      nullable(row.InvoiceDate),
      numberOrNull(row.UnitPrice),
      nullable(row.CustomerID),
      nullable(row.Country),
      flag(row.invoice_is_cancellation),
      flag(row.quantity_valid),
      flag(row.unit_price_valid),
      flag(row.invoice_date_valid),
      numberOrNull(row.line_revenue_gbp),
      provenanceId,
      ingestionRunId,
    ]);
    if (batch.length < BATCH_SIZE) continue;
    await insertBatch(
      connection,
      "retail_source_rows",
      [
        "sourceRowNumber",
        "sourceRowHash",
        "invoiceNo",
        "stockCode",
        "description",
        "quantity",
        "invoiceDate",
        "unitPrice",
        "sourceCustomerId",
        "country",
        "isCancellation",
        "quantityValid",
        "unitPriceValid",
        "invoiceDateValid",
        "lineRevenue",
        "provenanceId",
        "ingestionRunId",
      ],
      batch,
      "sourceRowHash = VALUES(sourceRowHash)"
    );
    checkpoint = rowNumber;
    rows += batch.length;
    batches += 1;
    batch = [];
    if (batches >= maxBatches)
      return { checkpoint, batches, rows, complete: false };
  }
  if (batch.length > 0) {
    await insertBatch(
      connection,
      "retail_source_rows",
      [
        "sourceRowNumber",
        "sourceRowHash",
        "invoiceNo",
        "stockCode",
        "description",
        "quantity",
        "invoiceDate",
        "unitPrice",
        "sourceCustomerId",
        "country",
        "isCancellation",
        "quantityValid",
        "unitPriceValid",
        "invoiceDateValid",
        "lineRevenue",
        "provenanceId",
        "ingestionRunId",
      ],
      batch,
      "sourceRowHash = VALUES(sourceRowHash)"
    );
    checkpoint = Number(batch[0]?.[0] ?? checkpoint) + batch.length - 1;
    rows += batch.length;
    batches += 1;
  }
  return {
    checkpoint,
    batches,
    rows,
    complete: checkpoint >= quality.counts.rowsBeforeCleaning,
  };
}

async function processItemChunk(
  connection: Connection,
  quality: QualityReport,
  provenanceId: number,
  ingestionRunId: number,
  itemIterator: AsyncGenerator<CsvRow>,
  startCheckpoint: number,
  orderIds: Map<string, number>,
  productIds: Map<string, number>,
  maxBatches: number,
  batchSize: number
): Promise<{
  checkpoint: number;
  batches: number;
  rows: number;
  complete: boolean;
}> {
  let checkpoint = startCheckpoint;
  let batches = 0;
  let rows = 0;
  let batch: unknown[][] = [];
  while (true) {
    const next = await itemIterator.next();
    if (next.done) break;
    const row = next.value;
    const rowNumber = Number(
      required(row._row_number, "processed _row_number")
    );
    if (rowNumber <= startCheckpoint) continue;
    const orderId = orderIds.get(
      required(row.InvoiceNo, "processed InvoiceNo")
    );
    const productId = productIds.get(
      required(row.StockCode, "processed StockCode")
    );
    if (!orderId || !productId)
      throw new Error(`Missing relationship mapping for row ${rowNumber}`);
    batch.push([
      rowNumber,
      rowHash(quality.source.sourceSha256, String(rowNumber)),
      orderId,
      productId,
      nullable(row.Description),
      numberOrNull(row.Quantity),
      numberOrNull(row.UnitPrice),
      numberOrNull(row.line_revenue_gbp),
      flag(row.invoice_is_cancellation),
      provenanceId,
      ingestionRunId,
    ]);
    if (batch.length < batchSize) continue;
    await insertBatch(
      connection,
      "invoice_items",
      [
        "sourceRowNumber",
        "sourceRowHash",
        "orderId",
        "productId",
        "description",
        "quantity",
        "unitPrice",
        "lineRevenue",
        "isCancellation",
        "provenanceId",
        "ingestionRunId",
      ],
      batch,
      "sourceRowHash = VALUES(sourceRowHash)"
    );
    checkpoint = rowNumber;
    rows += batch.length;
    batches += 1;
    batch = [];
    if (batches >= maxBatches)
      return { checkpoint, batches, rows, complete: false };
  }
  if (batch.length > 0) {
    await insertBatch(
      connection,
      "invoice_items",
      [
        "sourceRowNumber",
        "sourceRowHash",
        "orderId",
        "productId",
        "description",
        "quantity",
        "unitPrice",
        "lineRevenue",
        "isCancellation",
        "provenanceId",
        "ingestionRunId",
      ],
      batch,
      "sourceRowHash = VALUES(sourceRowHash)"
    );
    checkpoint = Number(batch[0]?.[0] ?? checkpoint) + batch.length - 1;
    rows += batch.length;
    batches += 1;
  }
  return {
    checkpoint,
    batches,
    rows,
    complete: checkpoint >= quality.counts.rowsAfterCleaning,
  };
}

async function importData(): Promise<void> {
  await access(PROCESSED_FILE);
  await access(STAGING_FILE);
  await access(QUALITY_FILE);
  const quality = await readQualityReport();
  const databaseUrl = required(process.env.DATABASE_URL, "DATABASE_URL");
  const runKey = `uci-online-retail:${quality.source.sourceSha256}:${TRANSFORMATION_VERSION}`;
  const connection = await mysql.createConnection({
    uri: databaseUrl,
    connectTimeout: 120_000,
  });

  try {
    const { provenanceId, ingestionRunId, resumed } = await ensureRun(
      connection,
      quality,
      runKey
    );
    if (await isComplete(connection, ingestionRunId, quality)) {
      console.log(
        JSON.stringify(
          { status: "already_imported", runKey, runId: ingestionRunId },
          null,
          2
        )
      );
      return;
    }
    if (resumed)
      console.log(
        JSON.stringify(
          { status: "resuming", runKey, runId: ingestionRunId },
          null,
          2
        )
      );

    const sourceCheckpointBeforeDimensions = await getCheckpoint(
      connection,
      "retail_source_rows",
      ingestionRunId
    );
    const dimensionsReady =
      sourceCheckpointBeforeDimensions >= quality.counts.rowsBeforeCleaning;
    let customerIds: Map<string, number>;
    const productIds: Map<string, number> = await queryIds(
      connection,
      "products",
      "sourceStockCode",
      provenanceId
    );
    if (!dimensionsReady) {
      const customers = new Map<string, CustomerAggregate>();
      const products = new Map<string, ProductAggregate>();
      const orders = new Map<string, OrderAggregate>();
      for await (const row of readCsv(PROCESSED_FILE)) {
        const customerId = required(row.CustomerID, "processed CustomerID");
        const invoiceId = required(row.InvoiceNo, "processed InvoiceNo");
        const stockCode = required(row.StockCode, "processed StockCode");
        const invoiceDate = required(row.InvoiceDate, "processed InvoiceDate");
        const customer = customers.get(customerId);
        if (!customer)
          customers.set(customerId, {
            sourceCustomerId: customerId,
            firstActivityAt: invoiceDate,
            lastActivityAt: invoiceDate,
            country: nullable(row.Country),
          });
        else {
          if (invoiceDate < customer.firstActivityAt)
            customer.firstActivityAt = invoiceDate;
          if (invoiceDate > customer.lastActivityAt)
            customer.lastActivityAt = invoiceDate;
          if (!customer.country) customer.country = nullable(row.Country);
        }
        const product = products.get(stockCode);
        if (!product)
          products.set(stockCode, {
            sourceStockCode: stockCode,
            description: nullable(row.Description),
          });
        else if (!product.description)
          product.description = nullable(row.Description);
        if (!orders.has(invoiceId))
          orders.set(invoiceId, {
            sourceInvoiceId: invoiceId,
            customerSourceId: customerId,
            invoiceDate,
            isCancellation: flag(row.invoice_is_cancellation),
          });
      }
      await insertBatch(
        connection,
        "customers",
        [
          "sourceCustomerId",
          "firstActivityAt",
          "lastActivityAt",
          "country",
          "provenanceId",
        ],
        Array.from(customers.values()).map(customer => [
          customer.sourceCustomerId,
          customer.firstActivityAt,
          customer.lastActivityAt,
          customer.country,
          provenanceId,
        ]),
        "firstActivityAt = VALUES(firstActivityAt), lastActivityAt = VALUES(lastActivityAt), country = COALESCE(customers.country, VALUES(country))"
      );
      await insertBatch(
        connection,
        "products",
        ["sourceStockCode", "description", "provenanceId"],
        Array.from(products.values()).map(product => [
          product.sourceStockCode,
          product.description,
          provenanceId,
        ]),
        "description = COALESCE(products.description, VALUES(description))"
      );
      customerIds = await queryIds(
        connection,
        "customers",
        "sourceCustomerId",
        provenanceId
      );
      await insertBatch(
        connection,
        "orders",
        [
          "sourceInvoiceId",
          "customerId",
          "invoiceDate",
          "isCancellation",
          "provenanceId",
          "ingestionRunId",
        ],
        Array.from(orders.values()).map(order => [
          order.sourceInvoiceId,
          customerIds.get(order.customerSourceId) ?? null,
          order.invoiceDate,
          order.isCancellation,
          provenanceId,
          ingestionRunId,
        ]),
        "customerId = VALUES(customerId), invoiceDate = VALUES(invoiceDate), isCancellation = VALUES(isCancellation), provenanceId = VALUES(provenanceId), ingestionRunId = VALUES(ingestionRunId)"
      );
    } else {
      const [dimensionCounts] = await connection.query<RowDataPacket[]>(
        "SELECT (SELECT COUNT(*) FROM customers WHERE provenanceId = ?) AS customers, (SELECT COUNT(*) FROM products WHERE provenanceId = ?) AS products, (SELECT COUNT(*) FROM orders WHERE provenanceId = ?) AS orders",
        [provenanceId, provenanceId, provenanceId]
      );
      if (
        Number(dimensionCounts[0]?.customers) < 4372 ||
        Number(dimensionCounts[0]?.products) < 3684 ||
        Number(dimensionCounts[0]?.orders) < 22190
      )
        throw new Error(
          "Verified source completion but dimension counts are incomplete"
        );
    }
    customerIds = await queryIds(
      connection,
      "customers",
      "sourceCustomerId",
      provenanceId
    );
    const [orderRows] = await connection.query<NamedIdRow[]>(
      "SELECT id, sourceInvoiceId FROM orders WHERE provenanceId = ?",
      [provenanceId]
    );
    const orderIds = new Map(
      orderRows.map(row => [String(row.sourceInvoiceId), row.id])
    );

    const maxBatches = maxBatchesPerInvocation();
    const maxChunks = maxChunksPerInvocation();
    const invoiceItemBatchSize = itemBatchSize();
    let sourceCheckpoint = await getCheckpoint(
      connection,
      "retail_source_rows",
      ingestionRunId
    );
    let sourceComplete = sourceCheckpoint >= quality.counts.rowsBeforeCleaning;
    if (!sourceComplete) {
      const sourceIterator = readCsv(STAGING_FILE);
      for (let chunkNumber = 1; chunkNumber <= maxChunks; chunkNumber += 1) {
        const sourceChunk = await processSourceChunk(
          connection,
          quality,
          provenanceId,
          ingestionRunId,
          sourceIterator,
          sourceCheckpoint,
          maxBatches
        );
        console.log(
          JSON.stringify(
            {
              status: sourceChunk.complete
                ? "source_complete"
                : "source_chunk_complete",
              chunkNumber,
              maxChunks,
              runKey,
              ingestionRunId,
              startingSourceCheckpoint: sourceCheckpoint,
              endingSourceCheckpoint: sourceChunk.checkpoint,
              sourceRowsProcessed: sourceChunk.rows,
              batches: sourceChunk.batches,
            },
            null,
            2
          )
        );
        sourceCheckpoint = sourceChunk.checkpoint;
        sourceComplete = sourceChunk.complete;
        if (sourceComplete) break;
      }
    }
    if (!sourceComplete) return;
    if (process.env.IMPORT_SOURCE_ONLY === "true") {
      console.log(
        JSON.stringify(
          {
            status: "source_stage_complete",
            runKey,
            ingestionRunId,
            sourceCheckpoint,
            sourceRowsProcessed: quality.counts.rowsBeforeCleaning,
            invoiceItems: 0,
          },
          null,
          2
        )
      );
      return;
    }

    let itemCheckpoint = await getCheckpoint(
      connection,
      "invoice_items",
      ingestionRunId
    );
    const itemIterator = readCsv(PROCESSED_FILE);
    const [initialItemCountRows] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS itemCount FROM invoice_items WHERE ingestionRunId = ?",
      [ingestionRunId]
    );
    let itemComplete =
      Number(initialItemCountRows[0]?.itemCount ?? 0) >=
      quality.counts.rowsAfterCleaning;
    for (
      let chunkNumber = 1;
      !itemComplete && chunkNumber <= maxChunks;
      chunkNumber += 1
    ) {
      const itemChunk = await processItemChunk(
        connection,
        quality,
        provenanceId,
        ingestionRunId,
        itemIterator,
        itemCheckpoint,
        orderIds,
        productIds,
        maxBatches,
        invoiceItemBatchSize
      );
      const [itemCountRows] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS itemCount FROM invoice_items WHERE ingestionRunId = ?",
        [ingestionRunId]
      );
      console.log(
        JSON.stringify(
          {
            status:
              Number(itemCountRows[0]?.itemCount ?? 0) >=
              quality.counts.rowsAfterCleaning
                ? "items_complete"
                : "items_chunk_complete",
            chunkNumber,
            maxChunks,
            runKey,
            ingestionRunId,
            startingItemCheckpoint: itemCheckpoint,
            endingItemCheckpoint: itemChunk.checkpoint,
            invoiceItemsProcessed: itemChunk.rows,
            batches: itemChunk.batches,
          },
          null,
          2
        )
      );
      itemCheckpoint = itemChunk.checkpoint;
      itemComplete =
        Number(itemCountRows[0]?.itemCount ?? 0) >=
        quality.counts.rowsAfterCleaning;
    }
    if (!itemComplete) return;

    await connection.query("DELETE FROM data_quality_issues WHERE runId = ?", [
      ingestionRunId,
    ]);
    const issueRows = [
      [
        ingestionRunId,
        "missing_customer_id",
        "WARNING",
        "retail_source_rows",
        null,
        `${quality.invalidRecords.missingCustomerId} source rows have no CustomerID and remain only in the source/staging layer.`,
      ],
      [
        ingestionRunId,
        "exact_duplicate_rows",
        "WARNING",
        "retail_source_rows",
        null,
        `${quality.duplicates.exactDuplicateRows} exact duplicate line rows were reported and preserved.`,
      ],
      [
        ingestionRunId,
        "negative_quantity",
        "WARNING",
        "invoice_items",
        null,
        `${quality.numericalBusinessRules.negativeQuantityRows} rows have negative quantities and remain distinguishable as returns/cancellations.`,
      ],
      [
        ingestionRunId,
        "negative_unit_price",
        "WARNING",
        "retail_source_rows",
        null,
        `${quality.numericalBusinessRules.negativeUnitPriceRows} rows have negative unit prices and require later revenue policy.`,
      ],
      [
        ingestionRunId,
        "zero_unit_price",
        "INFO",
        "retail_source_rows",
        null,
        `${quality.numericalBusinessRules.zeroUnitPriceRows} rows have zero unit prices and are retained without fabricated correction.`,
      ],
    ];
    await insertBatch(
      connection,
      "data_quality_issues",
      [
        "runId",
        "issueType",
        "severity",
        "entityName",
        "entityKey",
        "description",
      ],
      issueRows,
      "description = VALUES(description)"
    );

    console.log(
      JSON.stringify(
        {
          status: "imported",
          runKey,
          provenanceId,
          ingestionRunId,
          customers: customerIds.size,
          products: productIds.size,
          orders: orderIds.size,
          processedRows: quality.counts.rowsAfterCleaning,
          sourceRowsProcessed: quality.counts.rowsBeforeCleaning,
          itemRowsProcessed: quality.counts.rowsAfterCleaning,
        },
        null,
        2
      )
    );
  } finally {
    await connection.end();
  }
}

export async function main(): Promise<void> {
  await importData();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
