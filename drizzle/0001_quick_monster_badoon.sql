CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceCustomerId` varchar(64) NOT NULL,
	`firstActivityAt` timestamp NOT NULL,
	`lastActivityAt` timestamp NOT NULL,
	`country` varchar(128),
	`provenanceId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_source_customer_unique` UNIQUE(`sourceCustomerId`)
);
--> statement-breakpoint
CREATE TABLE `data_provenance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`datasetName` varchar(160) NOT NULL,
	`sourceUrl` text NOT NULL,
	`sourceFile` varchar(255) NOT NULL,
	`sourceSha256` varchar(64) NOT NULL,
	`archiveSha256` varchar(64),
	`transformationVersion` varchar(80) NOT NULL,
	`retrievedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `data_provenance_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_provenance_source_sha256_unique` UNIQUE(`sourceSha256`)
);
--> statement-breakpoint
CREATE TABLE `data_quality_issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`issueType` varchar(80) NOT NULL,
	`severity` enum('INFO','WARNING','ERROR') NOT NULL,
	`entityName` varchar(80) NOT NULL,
	`entityKey` varchar(160),
	`description` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `data_quality_issues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `data_quality_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provenanceId` int NOT NULL,
	`runKey` varchar(160) NOT NULL,
	`status` enum('PASS','WARNING','FAIL') NOT NULL,
	`rowsInspected` int NOT NULL,
	`rowsAccepted` int NOT NULL,
	`rowsRejected` int NOT NULL,
	`qualitySummary` text NOT NULL,
	`executedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `data_quality_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_quality_runs_run_key_unique` UNIQUE(`runKey`)
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceRowNumber` int NOT NULL,
	`sourceRowHash` varchar(64) NOT NULL,
	`orderId` int NOT NULL,
	`productId` int NOT NULL,
	`description` text,
	`quantity` decimal(14,3) NOT NULL,
	`unitPrice` decimal(14,4) NOT NULL,
	`lineRevenue` decimal(16,2) NOT NULL,
	`isCancellation` int NOT NULL DEFAULT 0,
	`provenanceId` int NOT NULL,
	`ingestionRunId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoice_items_source_row_hash_unique` UNIQUE(`sourceRowHash`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceInvoiceId` varchar(64) NOT NULL,
	`customerId` int,
	`invoiceDate` timestamp NOT NULL,
	`isCancellation` int NOT NULL DEFAULT 0,
	`provenanceId` int NOT NULL,
	`ingestionRunId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_source_invoice_unique` UNIQUE(`sourceInvoiceId`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceStockCode` varchar(64) NOT NULL,
	`description` text,
	`provenanceId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_source_stock_code_unique` UNIQUE(`sourceStockCode`)
);
--> statement-breakpoint
CREATE TABLE `retail_source_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceRowNumber` int NOT NULL,
	`sourceRowHash` varchar(64) NOT NULL,
	`invoiceNo` varchar(64) NOT NULL,
	`stockCode` varchar(64) NOT NULL,
	`description` text,
	`quantity` decimal(14,3),
	`invoiceDate` timestamp,
	`unitPrice` decimal(14,4),
	`sourceCustomerId` varchar(64),
	`country` varchar(128),
	`isCancellation` int NOT NULL DEFAULT 0,
	`quantityValid` int NOT NULL DEFAULT 1,
	`unitPriceValid` int NOT NULL DEFAULT 1,
	`invoiceDateValid` int NOT NULL DEFAULT 1,
	`lineRevenue` decimal(16,2),
	`provenanceId` int NOT NULL,
	`ingestionRunId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `retail_source_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `retail_source_rows_hash_unique` UNIQUE(`sourceRowHash`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_provenanceId_data_provenance_id_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `data_quality_issues` ADD CONSTRAINT `data_quality_issues_runId_data_quality_runs_id_fk` FOREIGN KEY (`runId`) REFERENCES `data_quality_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `data_quality_runs` ADD CONSTRAINT `data_quality_runs_provenanceId_data_provenance_id_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_provenanceId_data_provenance_id_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_ingestionRunId_data_quality_runs_id_fk` FOREIGN KEY (`ingestionRunId`) REFERENCES `data_quality_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_provenanceId_data_provenance_id_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_ingestionRunId_data_quality_runs_id_fk` FOREIGN KEY (`ingestionRunId`) REFERENCES `data_quality_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_provenanceId_data_provenance_id_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `retail_source_rows` ADD CONSTRAINT `retail_source_rows_provenanceId_data_provenance_id_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `retail_source_rows` ADD CONSTRAINT `retail_source_rows_ingestionRunId_data_quality_runs_id_fk` FOREIGN KEY (`ingestionRunId`) REFERENCES `data_quality_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customers_last_activity_idx` ON `customers` (`lastActivityAt`);--> statement-breakpoint
CREATE INDEX `customers_provenance_idx` ON `customers` (`provenanceId`);--> statement-breakpoint
CREATE INDEX `data_provenance_dataset_idx` ON `data_provenance` (`datasetName`);--> statement-breakpoint
CREATE INDEX `data_quality_issues_run_idx` ON `data_quality_issues` (`runId`);--> statement-breakpoint
CREATE INDEX `data_quality_issues_type_idx` ON `data_quality_issues` (`issueType`);--> statement-breakpoint
CREATE INDEX `data_quality_runs_provenance_idx` ON `data_quality_runs` (`provenanceId`);--> statement-breakpoint
CREATE INDEX `invoice_items_order_idx` ON `invoice_items` (`orderId`);--> statement-breakpoint
CREATE INDEX `invoice_items_product_idx` ON `invoice_items` (`productId`);--> statement-breakpoint
CREATE INDEX `invoice_items_provenance_idx` ON `invoice_items` (`provenanceId`);--> statement-breakpoint
CREATE INDEX `orders_customer_date_idx` ON `orders` (`customerId`,`invoiceDate`);--> statement-breakpoint
CREATE INDEX `orders_provenance_idx` ON `orders` (`provenanceId`);--> statement-breakpoint
CREATE INDEX `products_provenance_idx` ON `products` (`provenanceId`);--> statement-breakpoint
CREATE INDEX `retail_source_rows_invoice_idx` ON `retail_source_rows` (`invoiceNo`);--> statement-breakpoint
CREATE INDEX `retail_source_rows_customer_idx` ON `retail_source_rows` (`sourceCustomerId`);--> statement-breakpoint
CREATE INDEX `retail_source_rows_provenance_idx` ON `retail_source_rows` (`provenanceId`);