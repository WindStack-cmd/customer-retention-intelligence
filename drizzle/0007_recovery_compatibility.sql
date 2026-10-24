CREATE TABLE IF NOT EXISTS `model_explanation_runs` (
  `id` int NOT NULL,
  `runKey` varchar(260) NOT NULL,
  `modelRunId` int NOT NULL,
  `featureVersion` varchar(80) NOT NULL,
  `explainerType` varchar(120) NOT NULL,
  `explainerVersion` varchar(80) NOT NULL,
  `outputSpace` varchar(80) NOT NULL,
  `topN` int NOT NULL,
  `featureCount` int NOT NULL,
  `configJson` text NOT NULL,
  `artifactPath` varchar(300) NOT NULL,
  `artifactSha256` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL,
  CONSTRAINT `model_explanation_runs_id` PRIMARY KEY(`id`),
  CONSTRAINT `model_explanation_runs_key_unique` UNIQUE(`runKey`),
  CONSTRAINT `model_explanation_runs_model_fk` FOREIGN KEY (`modelRunId`) REFERENCES `churn_model_runs`(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_explanations` (
  `id` int NOT NULL,
  `explanationRunId` int NOT NULL,
  `modelRunId` int NOT NULL,
  `snapshotId` int NOT NULL,
  `customerId` int NOT NULL,
  `cutoffAt` timestamp NOT NULL,
  `rawProbability` decimal(12,8) NOT NULL,
  `calibratedProbability` decimal(12,8) NOT NULL,
  `predictedClass` int NOT NULL,
  `baseValue` decimal(18,10) NOT NULL,
  `modelOutput` decimal(18,10) NOT NULL,
  `additivityError` decimal(18,12) NOT NULL,
  `createdAt` timestamp NOT NULL,
  CONSTRAINT `customer_explanations_id` PRIMARY KEY(`id`),
  CONSTRAINT `customer_explanations_run_fk` FOREIGN KEY (`explanationRunId`) REFERENCES `model_explanation_runs`(`id`),
  CONSTRAINT `customer_explanations_model_fk` FOREIGN KEY (`modelRunId`) REFERENCES `churn_model_runs`(`id`),
  CONSTRAINT `customer_explanations_snapshot_fk` FOREIGN KEY (`snapshotId`) REFERENCES `customer_feature_snapshots`(`id`),
  CONSTRAINT `customer_explanations_customer_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_explanation_features` (
  `id` int NOT NULL AUTO_INCREMENT,
  `explanationId` int NOT NULL,
  `featureName` varchar(120) NOT NULL,
  `featureValue` decimal(18,10),
  `isMissing` int NOT NULL DEFAULT 0,
  `shapValue` decimal(18,10) NOT NULL,
  `contributionDirection` varchar(30) NOT NULL,
  `rank` int NOT NULL,
  CONSTRAINT `customer_explanation_features_id` PRIMARY KEY(`id`),
  CONSTRAINT `customer_explanation_features_unique` UNIQUE(`explanationId`,`featureName`),
  CONSTRAINT `customer_explanation_features_explanation_fk` FOREIGN KEY (`explanationId`) REFERENCES `customer_explanations`(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_monitoring_runs` (
  `id` int NOT NULL,
  `runKey` varchar(260) NOT NULL,
  `modelRunId` int NOT NULL,
  `provenanceId` int NOT NULL,
  `modelVersion` varchar(80) NOT NULL,
  `featureVersion` varchar(80) NOT NULL,
  `snapshotCutoffAt` timestamp NOT NULL,
  `referenceStartAt` timestamp NOT NULL,
  `referenceEndAt` timestamp NOT NULL,
  `monitoredStartAt` timestamp NOT NULL,
  `monitoredEndAt` timestamp NOT NULL,
  `referenceSampleCount` int NOT NULL,
  `monitoredSampleCount` int NOT NULL,
  `performanceSampleCount` int NOT NULL,
  `status` varchar(40) NOT NULL,
  `performanceStatus` varchar(40) NOT NULL,
  `statusReason` text NOT NULL,
  `methodologyVersion` varchar(80) NOT NULL,
  `configJson` text NOT NULL,
  `executedAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL,
  CONSTRAINT `model_monitoring_runs_id` PRIMARY KEY(`id`),
  CONSTRAINT `model_monitoring_runs_key_unique` UNIQUE(`runKey`),
  CONSTRAINT `model_monitoring_runs_model_fk` FOREIGN KEY (`modelRunId`) REFERENCES `churn_model_runs`(`id`),
  CONSTRAINT `model_monitoring_runs_provenance_fk` FOREIGN KEY (`provenanceId`) REFERENCES `data_provenance`(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_monitoring_findings` (
  `id` int NOT NULL,
  `monitoringRunId` int NOT NULL,
  `category` varchar(60) NOT NULL,
  `metricName` varchar(120) NOT NULL,
  `status` varchar(40) NOT NULL,
  `metricValue` decimal(18,10),
  `referenceValue` decimal(18,10),
  `threshold` decimal(18,10),
  `sampleCount` int NOT NULL,
  `details` text NOT NULL,
  `createdAt` timestamp NOT NULL,
  CONSTRAINT `model_monitoring_findings_id` PRIMARY KEY(`id`),
  CONSTRAINT `model_monitoring_findings_run_fk` FOREIGN KEY (`monitoringRunId`) REFERENCES `model_monitoring_runs`(`id`)
);
