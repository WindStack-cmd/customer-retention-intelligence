-- Migration 0009: Add salesforce to alert_rules channel enum
ALTER TABLE `alert_rules` 
MODIFY COLUMN `channel` enum('slack','webhook','hubspot','salesforce') NOT NULL;
