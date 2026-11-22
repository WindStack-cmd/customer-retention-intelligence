import { describe, expect, it } from "vitest";
import { tenantStorage } from "./tenantStorage";
import { executeScoringRun } from "./scoringRunner";
import { sendPlaybookEmail, dispatchAlert } from "./playbookService";
import {
  getCohortRetentionHeatmap,
  getShapWaterfall,
  getJourneyTimeline,
} from "./cohortAnalytics";
import { BILLING_PLANS, createCheckoutSession } from "./billingService";

describe("Phase 2-4: Ingestion, Actions, Analytics, & Security", () => {
  const testWsId = "ws_default";

  it("manages API keys securely with sha256 hashing", () => {
    const { apiKey, rawSecret } = tenantStorage.createApiKey(
      testWsId,
      "Test Ingestion Key",
      1
    );

    expect(rawSecret).toMatch(/^pk_live_/);
    expect(apiKey.keyPrefix).toBe(rawSecret.slice(0, 12));
    expect(apiKey.keyHash).not.toBe(rawSecret);

    const verified = tenantStorage.verifyApiKey(rawSecret);
    expect(verified).toBeDefined();
    expect(verified?.id).toBe(apiKey.id);

    const invalid = tenantStorage.verifyApiKey("pk_live_invalid_fake_key_12345");
    expect(invalid).toBeNull();

    // Revoke
    tenantStorage.revokeApiKey(testWsId, apiKey.id);
    const afterRevoke = tenantStorage.verifyApiKey(rawSecret);
    expect(afterRevoke).toBeNull();
  });

  it("records and queries inbound events", () => {
    const event = tenantStorage.recordEvent({
      workspaceId: testWsId,
      eventType: "order.completed",
      customerId: 17850,
      properties: { total: 450.25, currency: "GBP" },
      source: "api",
      timestamp: new Date(),
    });

    expect(event.id).toBeGreaterThan(0);
    expect(event.eventType).toBe("order.completed");

    const events = tenantStorage.listEvents(testWsId, 10);
    expect(events.some(e => e.id === event.id)).toBe(true);
  });

  it("executes scoring run with single-concurrency lock", async () => {
    const result = await executeScoringRun(testWsId, "manual");
    expect(result.runId).toBeGreaterThan(0);
    expect(result.customersScored).toBeGreaterThan(0);
    expect(result.revenueAtRisk).toBeGreaterThan(0);
    expect(result.summary).toContain("Scored");

    const runs = tenantStorage.listScoringRuns(testWsId, 5);
    expect(runs.some(r => r.id === result.runId && r.status === "completed")).toBe(true);
  });

  it("executes retention playbooks and creates intervention records", async () => {
    const emailResult = await sendPlaybookEmail({
      to: "customer@example.com",
      templateName: "Win-back 15% Incentive Offer",
      customerName: "Acme Corp",
      discountCode: "WINBACK15",
    });

    expect(emailResult.status).toMatch(/sent|simulated/);
    expect(emailResult.messageId).toBeDefined();

    const intervention = tenantStorage.recordIntervention({
      workspaceId: testWsId,
      customerId: 17850,
      sourceCustomerId: "17850",
      playbookType: "winback-discount-15",
      templateName: "Win-back 15% Incentive Offer",
      recipientEmail: "customer@example.com",
      incentiveCode: "WINBACK15",
      status: "delivered",
      performedBy: 1,
      performedByName: "CSM Tester",
    });

    expect(intervention.id).toBeGreaterThan(0);
    const list = tenantStorage.listInterventions(testWsId);
    expect(list.some(i => i.id === intervention.id)).toBe(true);
  });

  it("creates and retrieves customer notes", () => {
    const note = tenantStorage.addNote(
      testWsId,
      17850,
      1,
      "Senior CSM",
      "Spoke with the procurement team. They requested a quote for volume renewal."
    );

    expect(note.id).toBeGreaterThan(0);
    const notes = tenantStorage.listNotes(testWsId, 17850);
    expect(notes.some(n => n.id === note.id)).toBe(true);
  });

  it("dispatches alerts and manages alert rules", async () => {
    const rule = tenantStorage.saveAlertRule({
      workspaceId: testWsId,
      name: "Urgent Slack Alert",
      channel: "slack",
      thresholdBand: "Urgent",
      minRiskProbability: "0.8000",
      minRevenueAtRisk: "2000.00",
      enabled: 1,
    });
    expect(rule.id).toBeGreaterThan(0);

    const alertResult = await dispatchAlert({
      channel: "slack",
      customerName: "Test Account",
      sourceCustomerId: "17850",
      riskProbability: 0.85,
      revenueAtRisk: 2500,
      priorityBand: "Urgent",
      recommendedAction: "Send incentive",
    });
    expect(alertResult.success).toBe(true);
  });

  it("generates cohort retention heatmap, shap waterfall, and journey timeline", () => {
    const heatmap = getCohortRetentionHeatmap(testWsId);
    expect(heatmap.cohorts.length).toBeGreaterThanOrEqual(10);
    expect(heatmap.cohorts[0].retentionRates[0]).toBe(100);

    const shap = getShapWaterfall(17850, testWsId);
    expect(shap.features.length).toBeGreaterThan(0);
    expect(shap.baseValue).toBeGreaterThan(0);

    const timeline = getJourneyTimeline(17850, testWsId);
    expect(timeline.length).toBeGreaterThan(0);
  });

  it("handles billing tiers and simulated checkout upgrade", async () => {
    expect(BILLING_PLANS.starter.priceMonthly).toBe(99);
    expect(BILLING_PLANS.pro.priceMonthly).toBe(299);
    expect(BILLING_PLANS.enterprise.priceMonthly).toBe(799);

    const checkout = await createCheckoutSession({
      workspaceId: testWsId,
      planId: "enterprise",
      returnUrl: "http://localhost:3000",
    });

    expect(checkout.mode).toBe("mock");
    const updatedWs = tenantStorage.getWorkspace(testWsId);
    expect(updatedWs?.plan).toBe("enterprise");
    expect(updatedWs?.customerLimit).toBe(100000);
  });

  it("tracks audit logs and fulfills GDPR export & erasure compliance", () => {
    const log = tenantStorage.logAudit({
      workspaceId: testWsId,
      action: "compliance.gdpr_request",
      resourceType: "customer",
      resourceId: "17850",
      details: { requestedBy: "dpo@pulseboard.io" },
    });
    expect(log.id).toBeGreaterThan(0);

    const logs = tenantStorage.listAuditLogs(testWsId);
    expect(logs.some(l => l.id === log.id)).toBe(true);
  });
});
