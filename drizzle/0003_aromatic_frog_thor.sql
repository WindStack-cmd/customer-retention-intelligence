CREATE TABLE `churn_model_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelRunId` int NOT NULL,
	`split` varchar(30) NOT NULL,
	`metricName` varchar(80) NOT NULL,
	`metricValue` decimal(18,10),
	`metricJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `churn_model_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `churn_model_metrics_unique` UNIQUE(`modelRunId`,`split`,`metricName`)
);
--> statement-breakpoint
CREATE TABLE `churn_model_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runKey` varchar(220) NOT NULL,
	`modelName` varchar(80) NOT NULL,
	`modelVersion` varchar(80) NOT NULL,
	`featureVersion` varchar(80) NOT NULL,
	`labelVersion` varchar(80) NOT NULL,
	`datasetVersion` varchar(200) NOT NULL,
	`provenanceId` int NOT NULL,
	`trainStartAt` timestamp NOT NULL,
	`trainEndAt` timestamp NOT NULL,
	`validationStartAt` timestamp NOT NULL,
	`validationEndAt` timestamp NOT NULL,
	`testStartAt` timestamp NOT NULL,
	`testEndAt` timestamp NOT NULL,
	`threshold` decimal(12,8) NOT NULL,
	`status` varchar(40) NOT NULL,
	`configJson` text NOT NULL,
	`artifactPath` varchar(300) NOT NULL,
	`artifactSha256` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `churn_model_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `churn_model_runs_key_unique` UNIQUE(`runKey`)
);
--> statement-breakpoint
CREATE TABLE `churn_predictions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelRunId` int NOT NULL,
	`snapshotId` int NOT NULL,
	`customerId` int NOT NULL,
	`cutoffAt` timestamp NOT NULL,
	`rawProbability` decimal(12,8) NOT NULL,
	`calibratedProbability` decimal(12,8) NOT NULL,
	`predictedClass` int NOT NULL,
	`threshold` decimal(12,8) NOT NULL,
	`predictionVersion` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `churn_predictions_id` PRIMARY KEY(`id`),
	CONSTRAINT `churn_predictions_unique` UNIQUE(`modelRunId`,`snapshotId`)
);
--> statement-breakpoint
CREATE TABLE `customer_behavior_labels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`snapshotId` int NOT NULL,
	`runId` int NOT NULL,
	`provenanceId` int NOT NULL,
	`customerId` int NOT NULL,
	`cutoffAt` timestamp NOT NULL,
	`horizonEndAt` timestamp NOT NULL,
	`labelVersion` varchar(80) NOT NULL,
	`inactivityLabel` int NOT NULL,
	`futureOrderCount` int NOT NULL,
	`labelable` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_behavior_labels_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_behavior_labels_snapshot_unique` UNIQUE(`snapshotId`),
	CONSTRAINT `customer_behavior_labels_customer_cutoff_unique` UNIQUE(`customerId`,`cutoffAt`,`labelVersion`)
);
--> statement-breakpoint
ALTER TABLE `churn_model_metrics` ADD CONSTRAINT `cmm_model_run_fk` FOREIGN KEY (`modelRunId`) REFERENCES `churn_model_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `churn_model_runs` ADD CONSTRAINT `cmr_provenance_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `churn_predictions` ADD CONSTRAINT `cp_model_run_fk` FOREIGN KEY (`modelRunId`) REFERENCES `churn_model_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `churn_predictions` ADD CONSTRAINT `cp_snapshot_fk` FOREIGN KEY (`snapshotId`) REFERENCES `customer_feature_snapshots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `churn_predictions` ADD CONSTRAINT `cp_customer_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_behavior_labels` ADD CONSTRAINT `cbl_snapshot_fk` FOREIGN KEY (`snapshotId`) REFERENCES `customer_feature_snapshots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_behavior_labels` ADD CONSTRAINT `cbl_run_fk` FOREIGN KEY (`runId`) REFERENCES `customer_feature_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_behavior_labels` ADD CONSTRAINT `cbl_provenance_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_behavior_labels` ADD CONSTRAINT `cbl_customer_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `churn_model_metrics_run_idx` ON `churn_model_metrics` (`modelRunId`);--> statement-breakpoint
CREATE INDEX `churn_model_runs_provenance_idx` ON `churn_model_runs` (`provenanceId`);--> statement-breakpoint
CREATE INDEX `churn_predictions_customer_idx` ON `churn_predictions` (`customerId`,`cutoffAt`);--> statement-breakpoint
CREATE INDEX `churn_predictions_run_idx` ON `churn_predictions` (`modelRunId`);--> statement-breakpoint
CREATE INDEX `customer_behavior_labels_run_idx` ON `customer_behavior_labels` (`runId`);
