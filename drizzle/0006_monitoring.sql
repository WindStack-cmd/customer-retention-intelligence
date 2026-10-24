CREATE TABLE `monitoring_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `runKey` varchar(220) NOT NULL,
  `monitoringVersion` varchar(80) NOT NULL,
  `modelRunId` int,
  `baselineCutoffAt` timestamp,
  `currentCutoffAt` timestamp,
  `status` varchar(40) NOT NULL,
  `summary` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `monitoring_runs_id` PRIMARY KEY(`id`),
  CONSTRAINT `monitoring_runs_key_unique` UNIQUE(`runKey`)
);
--> statement-breakpoint
CREATE TABLE `monitoring_metrics` (
  `id` int AUTO_INCREMENT NOT NULL,
  `runId` int NOT NULL,
  `metricType` varchar(40) NOT NULL,
  `metricName` varchar(120) NOT NULL,
  `status` varchar(40) NOT NULL,
  `metricValue` decimal(18,10),
  `details` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `monitoring_metrics_id` PRIMARY KEY(`id`),
  CONSTRAINT `monitoring_metrics_unique` UNIQUE(`runId`,`metricType`,`metricName`)
);
--> statement-breakpoint
ALTER TABLE `monitoring_runs` ADD CONSTRAINT `monitoring_runs_model_fk` FOREIGN KEY (`modelRunId`) REFERENCES `churn_model_runs`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `monitoring_metrics` ADD CONSTRAINT `monitoring_metrics_run_fk` FOREIGN KEY (`runId`) REFERENCES `monitoring_runs`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `monitoring_runs_model_idx` ON `monitoring_runs` (`modelRunId`);
--> statement-breakpoint
CREATE INDEX `monitoring_metrics_run_idx` ON `monitoring_metrics` (`runId`);
