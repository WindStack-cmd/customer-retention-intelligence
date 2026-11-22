-- Phase 1 - 4: SaaS Upgrade: Multi-tenancy, Workspaces, Members, Invites, Scoring, Actions, Audit
CREATE TABLE IF NOT EXISTS `workspaces` (
  `id` varchar(64) NOT NULL PRIMARY KEY,
  `name` text NOT NULL,
  `slug` varchar(64) NOT NULL,
  `plan` enum('starter','pro','enterprise') NOT NULL DEFAULT 'pro',
  `stripeCustomerId` varchar(120),
  `stripeSubscriptionId` varchar(120),
  `subscriptionStatus` varchar(32) NOT NULL DEFAULT 'active',
  `customerLimit` int NOT NULL DEFAULT 10000,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `workspaces_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default workspace for existing demo data
INSERT IGNORE INTO `workspaces` (`id`, `name`, `slug`, `plan`, `customerLimit`)
VALUES ('ws_default', 'Default Workspace', 'default', 'pro', 10000);

CREATE TABLE IF NOT EXISTS `workspace_members` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspaceId` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `role` enum('admin','csm','analyst','viewer') NOT NULL DEFAULT 'viewer',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `workspace_members_user_ws_unique` (`workspaceId`, `userId`),
  KEY `workspace_members_ws_idx` (`workspaceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Assign user 1 as admin of default workspace if exists
INSERT IGNORE INTO `workspace_members` (`workspaceId`, `userId`, `role`)
VALUES ('ws_default', 1, 'admin');

CREATE TABLE IF NOT EXISTS `workspace_invites` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspaceId` varchar(64) NOT NULL,
  `email` varchar(320) NOT NULL,
  `role` enum('admin','csm','analyst','viewer') NOT NULL DEFAULT 'viewer',
  `token` varchar(128) NOT NULL,
  `invitedBy` int NOT NULL,
  `status` enum('pending','accepted','revoked') NOT NULL DEFAULT 'pending',
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `workspace_invites_token_unique` (`token`),
  KEY `workspace_invites_ws_idx` (`workspaceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workspace_api_keys` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspaceId` varchar(64) NOT NULL,
  `name` varchar(100) NOT NULL,
  `keyPrefix` varchar(16) NOT NULL,
  `keyHash` varchar(128) NOT NULL,
  `createdBy` int NOT NULL,
  `revokedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `workspace_api_keys_hash_unique` (`keyHash`),
  KEY `workspace_api_keys_ws_idx` (`workspaceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workspace_events` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspaceId` varchar(64) NOT NULL,
  `eventType` varchar(80) NOT NULL,
  `customerId` varchar(64) NULL,
  `properties` text NULL,
  `source` varchar(64) NOT NULL DEFAULT 'api',
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `workspace_events_ws_type_idx` (`workspaceId`, `eventType`),
  KEY `workspace_events_ws_cust_idx` (`workspaceId`, `customerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scoring_runs` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspaceId` varchar(64) NOT NULL,
  `status` enum('pending','running','completed','failed') NOT NULL,
  `triggerType` enum('scheduled','manual','sync') NOT NULL,
  `customersScored` int NOT NULL DEFAULT 0,
  `revenueAtRisk` decimal(16,2) NOT NULL DEFAULT 0.00,
  `summary` text NULL,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  `error` text NULL,
  KEY `scoring_runs_ws_status_idx` (`workspaceId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `interventions` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspaceId` varchar(64) NOT NULL,
  `customerId` int NOT NULL,
  `sourceCustomerId` varchar(64) NOT NULL,
  `playbookType` varchar(80) NOT NULL,
  `templateName` varchar(120) NULL,
  `recipientEmail` varchar(320) NULL,
  `incentiveCode` varchar(64) NULL,
  `incentiveAmount` decimal(10,2) NULL,
  `status` enum('sent','delivered','failed','simulated') NOT NULL,
  `performedBy` int NOT NULL,
  `performedByName` varchar(120) NULL,
  `outcome` enum('retained','churned','pending') NOT NULL DEFAULT 'pending',
  `revenueSaved` decimal(14,2) NOT NULL DEFAULT 0.00,
  `details` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `interventions_ws_cust_idx` (`workspaceId`, `customerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_notes` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspaceId` varchar(64) NOT NULL,
  `customerId` int NOT NULL,
  `authorId` int NOT NULL,
  `authorName` varchar(120) NOT NULL,
  `note` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `customer_notes_ws_cust_idx` (`workspaceId`, `customerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `alert_rules` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspaceId` varchar(64) NOT NULL,
  `name` varchar(120) NOT NULL,
  `channel` enum('slack','webhook','hubspot') NOT NULL,
  `webhookUrl` text NULL,
  `thresholdBand` enum('Urgent','High','Any') NOT NULL DEFAULT 'Urgent',
  `minRiskProbability` decimal(5,4) NOT NULL DEFAULT 0.7000,
  `minRevenueAtRisk` decimal(12,2) NOT NULL DEFAULT 1000.00,
  `enabled` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `alert_rules_ws_idx` (`workspaceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `workspaceId` varchar(64) NOT NULL,
  `userId` int NULL,
  `userName` varchar(120) NULL,
  `action` varchar(80) NOT NULL,
  `resourceType` varchar(64) NOT NULL,
  `resourceId` varchar(120) NULL,
  `details` text NULL,
  `ipAddress` varchar(64) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `audit_logs_ws_action_idx` (`workspaceId`, `action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
