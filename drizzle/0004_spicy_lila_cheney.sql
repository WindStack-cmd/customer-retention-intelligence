CREATE TABLE `customer_value_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`snapshotId` int NOT NULL,
	`customerId` int NOT NULL,
	`modelRunId` int NOT NULL,
	`cutoffAt` timestamp NOT NULL,
	`featureVersion` varchar(80) NOT NULL,
	`methodologyVersion` varchar(100) NOT NULL,
	`horizonDays` int NOT NULL,
	`historicalGrossRevenue` decimal(18,2) NOT NULL,
	`historicalNetRevenue` decimal(18,2) NOT NULL,
	`returnValue` decimal(18,2) NOT NULL,
	`orderCount` int NOT NULL,
	`averageOrderValue` decimal(18,2) NOT NULL,
	`purchaseFrequency` decimal(16,6) NOT NULL,
	`lifetimeActivityDays` int NOT NULL,
	`calibratedChurnProbability` decimal(12,8) NOT NULL,
	`expectedFutureValue` decimal(18,2) NOT NULL,
	`behavioralClv` decimal(18,2) NOT NULL,
	`revenueAtRisk` decimal(18,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_value_snapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_value_snapshots_run_snapshot_unique` UNIQUE(`runId`,`snapshotId`),
	CONSTRAINT `customer_value_snapshots_run_customer_unique` UNIQUE(`runId`,`customerId`)
);
--> statement-breakpoint
CREATE TABLE `revenue_intelligence_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runKey` varchar(240) NOT NULL,
	`provenanceId` int NOT NULL,
	`modelRunId` int NOT NULL,
	`featureVersion` varchar(80) NOT NULL,
	`cutoffAt` timestamp NOT NULL,
	`horizonDays` int NOT NULL,
	`methodologyVersion` varchar(100) NOT NULL,
	`revenueSemantics` text NOT NULL,
	`status` varchar(40) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `revenue_intelligence_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `revenue_intelligence_runs_key_unique` UNIQUE(`runKey`)
);
--> statement-breakpoint
ALTER TABLE `customer_value_snapshots` ADD CONSTRAINT `cvs_run_fk` FOREIGN KEY (`runId`) REFERENCES `revenue_intelligence_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_value_snapshots` ADD CONSTRAINT `cvs_snapshot_fk` FOREIGN KEY (`snapshotId`) REFERENCES `customer_feature_snapshots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_value_snapshots` ADD CONSTRAINT `cvs_customer_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_value_snapshots` ADD CONSTRAINT `cvs_model_fk` FOREIGN KEY (`modelRunId`) REFERENCES `churn_model_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `revenue_intelligence_runs` ADD CONSTRAINT `rir_provenance_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `revenue_intelligence_runs` ADD CONSTRAINT `rir_model_fk` FOREIGN KEY (`modelRunId`) REFERENCES `churn_model_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_value_snapshots_customer_cutoff_idx` ON `customer_value_snapshots` (`customerId`,`cutoffAt`);--> statement-breakpoint
CREATE INDEX `customer_value_snapshots_model_idx` ON `customer_value_snapshots` (`modelRunId`);--> statement-breakpoint
CREATE INDEX `revenue_intelligence_runs_provenance_idx` ON `revenue_intelligence_runs` (`provenanceId`);--> statement-breakpoint
CREATE INDEX `revenue_intelligence_runs_model_idx` ON `revenue_intelligence_runs` (`modelRunId`);
