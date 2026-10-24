CREATE TABLE `customer_feature_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provenanceId` int NOT NULL,
	`runKey` varchar(200) NOT NULL,
	`featureVersion` varchar(80) NOT NULL,
	`cutoffAt` timestamp NOT NULL,
	`horizonDays` int NOT NULL,
	`observationStartAt` timestamp NOT NULL,
	`observationEndAt` timestamp NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_feature_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_feature_runs_key_unique` UNIQUE(`runKey`)
);
--> statement-breakpoint
CREATE TABLE `customer_feature_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`provenanceId` int NOT NULL,
	`customerId` int NOT NULL,
	`cutoffAt` timestamp NOT NULL,
	`featureVersion` varchar(80) NOT NULL,
	`daysSinceLastPurchase` int NOT NULL,
	`totalOrders` int NOT NULL,
	`purchaseFrequency` decimal(16,6) NOT NULL,
	`totalGrossValue` decimal(18,2) NOT NULL,
	`totalNetValue` decimal(18,2) NOT NULL,
	`averageOrderValue` decimal(18,2) NOT NULL,
	`totalItems` decimal(18,3) NOT NULL,
	`averageItemsPerOrder` decimal(18,6) NOT NULL,
	`uniqueProducts` int NOT NULL,
	`activeMonths` int NOT NULL,
	`purchaseCount` int NOT NULL,
	`averageQuantityPerOrder` decimal(18,6) NOT NULL,
	`averageDaysBetweenOrders` decimal(18,6),
	`purchaseIntervalVariance` decimal(20,6),
	`firstPurchaseDate` timestamp NOT NULL,
	`lastPurchaseDate` timestamp NOT NULL,
	`customerLifetimeDays` int NOT NULL,
	`inactiveDays` int NOT NULL,
	`returnCount` int NOT NULL,
	`returnQuantity` decimal(18,3) NOT NULL,
	`returnValue` decimal(18,2) NOT NULL,
	`returnRate` decimal(16,6) NOT NULL,
	`cancellationCount` int NOT NULL,
	`cancellationRate` decimal(16,6) NOT NULL,
	`productDiversity` decimal(16,6) NOT NULL,
	`purchasesLast7d` int NOT NULL,
	`purchasesLast30d` int NOT NULL,
	`purchasesLast60d` int NOT NULL,
	`purchasesLast90d` int NOT NULL,
	`spendLast30d` decimal(18,2) NOT NULL,
	`spendLast60d` decimal(18,2) NOT NULL,
	`spendLast90d` decimal(18,2) NOT NULL,
	`ordersLast30d` int NOT NULL,
	`ordersLast60d` int NOT NULL,
	`ordersLast90d` int NOT NULL,
	`recentVsPreviousOrderRate` decimal(16,6) NOT NULL,
	`recentVsPreviousSpend` decimal(16,6) NOT NULL,
	`recentVsPreviousQuantity` decimal(16,6) NOT NULL,
	`acquisitionMonth` varchar(7) NOT NULL,
	`acquisitionQuarter` varchar(7) NOT NULL,
	`cohortMonth` varchar(7) NOT NULL,
	`customerAgeAtCutoff` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_feature_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_feature_snapshot_unique` UNIQUE(`runId`,`customerId`)
);
--> statement-breakpoint
ALTER TABLE `customer_feature_runs` ADD CONSTRAINT `customer_feature_runs_provenanceId_data_provenance_id_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_feature_snapshots` ADD CONSTRAINT `customer_feature_snapshots_runId_customer_feature_runs_id_fk` FOREIGN KEY (`runId`) REFERENCES `customer_feature_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_feature_snapshots` ADD CONSTRAINT `customer_feature_snapshots_provenanceId_data_provenance_id_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_feature_snapshots` ADD CONSTRAINT `customer_feature_snapshots_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_feature_runs_provenance_idx` ON `customer_feature_runs` (`provenanceId`);--> statement-breakpoint
CREATE INDEX `customer_feature_snapshot_customer_idx` ON `customer_feature_snapshots` (`customerId`,`cutoffAt`);--> statement-breakpoint
CREATE INDEX `customer_feature_snapshot_run_idx` ON `customer_feature_snapshots` (`runId`);