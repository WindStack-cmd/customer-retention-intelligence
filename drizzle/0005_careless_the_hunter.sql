CREATE TABLE `customer_retention_recommendations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`customerId` int NOT NULL,
	`snapshotId` int NOT NULL,
	`modelRunId` int NOT NULL,
	`explanationRunId` int NOT NULL,
	`explanationId` int NOT NULL,
	`valueRunId` int NOT NULL,
	`cutoffAt` timestamp NOT NULL,
	`featureVersion` varchar(80) NOT NULL,
	`methodologyVersion` varchar(100) NOT NULL,
	`priorityScore` decimal(12,6) NOT NULL,
	`priorityBand` varchar(30) NOT NULL,
	`recommendedAction` varchar(100) NOT NULL,
	`rationale` text NOT NULL,
	`supportingSignals` text NOT NULL,
	`interventionCost` decimal(18,2),
	`expectedBenefit` decimal(18,2),
	`benefitEvidence` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_retention_recommendations_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_retention_recommendations_run_customer_unique` UNIQUE(`runId`,`customerId`)
);
--> statement-breakpoint
CREATE TABLE `retention_recommendation_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runKey` varchar(260) NOT NULL,
	`provenanceId` int NOT NULL,
	`modelRunId` int NOT NULL,
	`explanationRunId` int NOT NULL,
	`valueRunId` int NOT NULL,
	`featureVersion` varchar(80) NOT NULL,
	`cutoffAt` timestamp NOT NULL,
	`methodologyVersion` varchar(100) NOT NULL,
	`rationaleVersion` varchar(100) NOT NULL,
	`status` varchar(40) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `retention_recommendation_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `retention_recommendation_runs_key_unique` UNIQUE(`runKey`)
);
--> statement-breakpoint
ALTER TABLE `customer_retention_recommendations` ADD CONSTRAINT `crr_run_fk` FOREIGN KEY (`runId`) REFERENCES `retention_recommendation_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_retention_recommendations` ADD CONSTRAINT `crr_customer_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_retention_recommendations` ADD CONSTRAINT `crr_snapshot_fk` FOREIGN KEY (`snapshotId`) REFERENCES `customer_feature_snapshots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_retention_recommendations` ADD CONSTRAINT `crr_model_fk` FOREIGN KEY (`modelRunId`) REFERENCES `churn_model_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_retention_recommendations` ADD CONSTRAINT `crr_value_fk` FOREIGN KEY (`valueRunId`) REFERENCES `revenue_intelligence_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `retention_recommendation_runs` ADD CONSTRAINT `rrr_provenance_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `retention_recommendation_runs` ADD CONSTRAINT `rrr_model_fk` FOREIGN KEY (`modelRunId`) REFERENCES `churn_model_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `retention_recommendation_runs` ADD CONSTRAINT `rrr_value_fk` FOREIGN KEY (`valueRunId`) REFERENCES `revenue_intelligence_runs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_retention_recommendations_snapshot_idx` ON `customer_retention_recommendations` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `customer_retention_recommendations_priority_idx` ON `customer_retention_recommendations` (`runId`,`priorityScore`);--> statement-breakpoint
CREATE INDEX `customer_retention_recommendations_model_idx` ON `customer_retention_recommendations` (`modelRunId`);--> statement-breakpoint
CREATE INDEX `retention_recommendation_runs_provenance_idx` ON `retention_recommendation_runs` (`provenanceId`);--> statement-breakpoint
CREATE INDEX `retention_recommendation_runs_model_idx` ON `retention_recommendation_runs` (`modelRunId`);--> statement-breakpoint
CREATE INDEX `retention_recommendation_runs_value_idx` ON `retention_recommendation_runs` (`valueRunId`);
