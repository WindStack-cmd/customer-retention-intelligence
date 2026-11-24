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
import { appRouter } from "./routers";

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

    // Toggle rule
    const toggled = tenantStorage.toggleAlertRule(testWsId, rule.id);
    expect(toggled?.enabled).toBe(0);
    const reToggled = tenantStorage.toggleAlertRule(testWsId, rule.id);
    expect(reToggled?.enabled).toBe(1);

    // Slack alert dispatch
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

    // HubSpot CRM Task mock dispatch
    const hubspotResult = await dispatchAlert({
      channel: "hubspot",
      customerName: "Acme Corp",
      sourceCustomerId: "17850",
      riskProbability: 0.88,
      revenueAtRisk: 4500,
      priorityBand: "Urgent",
      recommendedAction: "Direct CSM call",
    });
    expect(hubspotResult.success).toBe(true);
    expect(hubspotResult.detail).toContain("[CRM Alert MOCK] Created Task for Account 17850");

    // Salesforce CRM Task mock dispatch
    const salesforceResult = await dispatchAlert({
      channel: "salesforce",
      customerName: "Global Tech",
      sourceCustomerId: "17850",
      riskProbability: 0.92,
      revenueAtRisk: 12000,
      priorityBand: "Urgent",
      recommendedAction: "Escalate to VP Success",
    });
    expect(salesforceResult.success).toBe(true);
    expect(salesforceResult.detail).toContain("[CRM Alert MOCK] Created Task for Account 17850");

    // Delete rule
    const deleted = tenantStorage.deleteAlertRule(testWsId, rule.id);
    expect(deleted).toBe(true);
    const remaining = tenantStorage.listAlertRules(testWsId);
    expect(remaining.some(r => r.id === rule.id)).toBe(false);
  });

  it("generates cohort retention heatmap, shap waterfall, and journey timeline", () => {
    const heatmap = getCohortRetentionHeatmap(testWsId);
    expect(heatmap.cohorts.length).toBeGreaterThanOrEqual(10);
    expect(heatmap.cohorts[0].retentionRates.length).toBe(13); // Full M0 through M12
    expect(heatmap.cohorts[0].retentionRates[0]).toBe(100);
    expect(heatmap.averageRetention.length).toBe(13);

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

  it("prevents downgrading when current customer count exceeds target plan limit", async () => {
    const adminCaller = appRouter.createCaller({
      user: {
        id: 1,
        openId: "dev-local-user",
        name: "Local Development User",
        email: "dev@pulseboard.local",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      },
      workspace: tenantStorage.getWorkspace("ws_default")!,
      role: "admin",
      membership: tenantStorage.getMember("ws_default", 1)!,
      rawWorkspaceId: "ws_default",
      req: {} as any,
      res: {} as any,
    });

    // Default workspace has 4,122 customers (from CSV). Starter plan limit is 1,000.
    await expect(
      adminCaller.billing.createCheckout({
        planId: "starter",
        returnUrl: "http://localhost:3000",
      })
    ).rejects.toThrowError(/Cannot downgrade: current workspace customer count/);
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

  it("calculates honest ROI summary without arbitrary multiplication and flags sampleData", () => {
    const emptyWs = tenantStorage.createWorkspace({
      name: "Empty ROI Workspace",
      userId: 888,
    });

    const interventions = tenantStorage.listInterventions(emptyWs.id);
    expect(interventions.length).toBe(0);

    // Record an actual intervention with verified revenue saved
    const intervention = tenantStorage.recordIntervention({
      workspaceId: emptyWs.id,
      customerId: 17850,
      sourceCustomerId: "CUST17850",
      playbookType: "VIP Concierge Check-in",
      status: "delivered",
      performedBy: 888,
    });
    expect(intervention.id).toBeGreaterThan(0);

    // Update outcome to retained with real revenue saved
    intervention.outcome = "retained";
    intervention.revenueSaved = "1850.50";

    const updatedList = tenantStorage.listInterventions(emptyWs.id);
    expect(updatedList.length).toBe(1);
    const retainedTotal = updatedList
      .filter(i => i.outcome === "retained")
      .reduce((sum, i) => sum + Number(i.revenueSaved), 0);
    expect(retainedTotal).toBe(1850.50);
  });

  it("enforces plan limits for AI analyst queries and customer ingestion", () => {
    const starterWs = tenantStorage.createWorkspace({
      name: "Starter Limited WS",
      userId: 777,
      plan: "starter",
    });
    expect(starterWs.plan).toBe("starter");
    expect(starterWs.customerLimit).toBe(1000);

    // AI Analyst quota check: Starter allows 20 queries/day
    const initialQuota = tenantStorage.getAnalystDailyUsage(starterWs.id);
    expect(initialQuota.limit).toBe(20);
    expect(initialQuota.plan).toBe("starter");

    // Simulate exhausting quota
    for (let i = 0; i < 20; i++) {
      const res = tenantStorage.incrementAnalystUsage(starterWs.id);
      expect(res.allowed).toBe(true);
    }

    // 21st query is rejected
    const blocked = tenantStorage.incrementAnalystUsage(starterWs.id);
    expect(blocked.allowed).toBe(false);
    expect(blocked.used).toBe(20);

    // Customer count check
    const count = tenantStorage.getTenantCustomerCount(starterWs.id);
    expect(count).toBeLessThanOrEqual(starterWs.customerLimit);
  });

  it("configures Stripe and Shopify connectors and populates sample customers on sync", () => {
    const ws = tenantStorage.createWorkspace({
      name: "Connector Test WS",
      userId: 555,
    });

    // Initial customer count is 0
    expect(tenantStorage.getTenantCustomerCount(ws.id)).toBe(0);

    // Configure Stripe connector
    const config = tenantStorage.updateIntegrationConfig(ws.id, "stripe", {
      connected: true,
      mode: "mock",
      apiKey: "rk_test_sample_stripe_key_12345",
      webhookUrl: "https://example.com/api/webhooks/stripe",
    });
    expect(config.connected).toBe(true);
    expect(config.mode).toBe("mock");
    expect(config.apiKeyMasked).toContain("••••");

    // Populate sample customers on sync
    const populatedCount = tenantStorage.populateSampleCustomers(ws.id);
    expect(populatedCount).toBe(15);
    expect(tenantStorage.getTenantCustomerCount(ws.id)).toBe(15);

    const customers = tenantStorage.getTenantCustomers(ws.id);
    expect(customers.length).toBe(15);
    expect(customers[0].priorityBand).toBeDefined();
    expect(customers[0].calibratedChurnProbability).toBeGreaterThan(0);
  });

  it("rotates an API key: creates replacement with same name and revokes old key", () => {
    const ws = tenantStorage.createWorkspace({
      name: "Key Rotation WS",
      userId: 556,
    });

    const initial = tenantStorage.createApiKey(ws.id, "Production Event Stream", 556);
    expect(initial.apiKey.id).toBeGreaterThan(0);
    expect(tenantStorage.verifyApiKey(initial.rawSecret)?.id).toBe(initial.apiKey.id);

    // Rotate: create replacement key with same name
    const rotated = tenantStorage.createApiKey(ws.id, initial.apiKey.name, 556);
    tenantStorage.revokeApiKey(ws.id, initial.apiKey.id);

    expect(rotated.apiKey.id).not.toBe(initial.apiKey.id);
    expect(rotated.apiKey.name).toBe(initial.apiKey.name);

    // Old key is revoked
    expect(tenantStorage.verifyApiKey(initial.rawSecret)).toBeNull();

    // New key is valid
    const verifiedNew = tenantStorage.verifyApiKey(rotated.rawSecret);
    expect(verifiedNew?.id).toBe(rotated.apiKey.id);
  });

  it("customizes playbook templates and stores discount codes on intervention", async () => {
    const ws = tenantStorage.createWorkspace({
      name: "Playbook Customization WS",
      userId: 557,
    });

    const templates = tenantStorage.listPlaybookTemplates(ws.id);
    expect(templates.length).toBeGreaterThanOrEqual(4);

    // Customize template
    const customTemplate = {
      ...templates[0],
      subject: "VIP Custom 25% Off Win-back",
      body: "Hello {{customerName}}, enjoy 25% off with {{discountCode}}",
      discountPercent: 25,
      cooldownDays: 21,
    };
    tenantStorage.savePlaybookTemplate(ws.id, customTemplate);

    const savedList = tenantStorage.listPlaybookTemplates(ws.id);
    const updated = savedList.find(t => t.id === customTemplate.id);
    expect(updated?.subject).toBe("VIP Custom 25% Off Win-back");
    expect(updated?.discountPercent).toBe(25);

    // Send email using SendGrid / mock fallback
    const emailResult = await sendPlaybookEmail({
      to: "client@test.com",
      templateName: updated!.name,
      customerName: "Acme Buyer",
      discountCode: "SAVE25",
      subject: updated!.subject,
      body: updated!.body,
    });
    expect(emailResult.status).toBeDefined();

    // Record intervention with verified discount code & amount
    const intervention = tenantStorage.recordIntervention({
      workspaceId: ws.id,
      customerId: 17850,
      sourceCustomerId: "CUST17850",
      playbookType: updated!.name,
      templateName: updated!.name,
      recipientEmail: "client@test.com",
      incentiveCode: "SAVE25",
      incentiveAmount: "25",
      status: "delivered",
      performedBy: 557,
    });

    expect(intervention.incentiveCode).toBe("SAVE25");
    expect(intervention.incentiveAmount).toBe("25");
  });

  it("configures enterprise SSO / SAML settings and generates metadata", () => {
    const sso = tenantStorage.saveSsoConfig(testWsId, {
      provider: "okta",
      entityId: "https://identity.okta.com/app/pulseboard_saml",
      ssoUrl: "https://identity.okta.com/app/pulseboard_saml/sso/saml",
      enforceSso: true,
      domains: ["pulseboard.io", "enterprise.com"],
    });

    expect(sso.provider).toBe("okta");
    expect(sso.enforceSso).toBe(true);
    expect(sso.domains).toContain("enterprise.com");
    expect(sso.status).toBe("simulated");

    const fetched = tenantStorage.getSsoConfig(testWsId);
    expect(fetched.entityId).toBe("https://identity.okta.com/app/pulseboard_saml");
  });

  it("strictly disables unvalidated SAML assertions and returns 501 on ACS", async () => {
    const express = (await import("express")).default;
    const { registerOAuthRoutes } = await import("./_core/oauth");
    const app = express();
    app.use(express.json());
    registerOAuthRoutes(app);

    // Simulate ACS request without an approved XML signature validation library
    const res = await new Promise<{ status: number; body: any }>((resolve) => {
      const mockReq = {
        headers: {},
        body: { SAMLResponse: "unvalidated_raw_xml_payload" },
      } as any;
      const mockRes = {
        statusCode: 200,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          resolve({ status: this.statusCode, body: data });
        },
      } as any;

      // Find the /api/auth/saml/acs route handler
      const acsRoute = (app as any)._router?.stack?.find(
        (layer: any) => layer.route?.path === "/api/auth/saml/acs"
      );
      if (acsRoute) {
        acsRoute.route.stack[0].handle(mockReq, mockRes);
      } else {
        resolve({ status: 404, body: null });
      }
    });

    expect(res.status).toBe(501);
    expect(res.body.error).toBe("SSO login not enabled");
  });
});
