import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { tenantStorage } from "./tenantStorage";
import {
  handleStripeWebhookEvent,
  verifyStripeSignature,
} from "./stripeWebhook";

describe("Phase 4: Stripe Billing Webhook Handler", () => {
  it("verifies HMAC SHA-256 signatures accurately", () => {
    const payload = JSON.stringify({ id: "evt_test_123", type: "ping" });
    const secret = "whsec_test_secret_abc123";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload, "utf8")
      .digest("hex");
    const header = `t=${timestamp},v1=${signature}`;

    const isValid = verifyStripeSignature(payload, header, secret);
    expect(isValid).toBe(true);

    const isInvalid = verifyStripeSignature(payload, header, "whsec_wrong_secret");
    expect(isInvalid).toBe(false);

    const badHeader = `t=${timestamp},v1=fake_signature_hex`;
    expect(verifyStripeSignature(payload, badHeader, secret)).toBe(false);
  });

  it("handles checkout.session.completed and activates workspace subscription", () => {
    const ws = tenantStorage.createWorkspace({
      name: "Stripe Webhook WS 1",
      userId: 501,
      plan: "starter",
    });

    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: ws.id,
          customer: "cus_mock_123",
          subscription: "sub_mock_abc",
          metadata: {
            workspaceId: ws.id,
            plan: "pro",
          },
        },
      },
    };

    const res = handleStripeWebhookEvent(event);
    expect(res.handled).toBe(true);
    expect(res.status).toBe("active");
    expect(res.plan).toBe("pro");

    const updated = tenantStorage.getWorkspace(ws.id);
    expect(updated?.plan).toBe("pro");
    expect(updated?.subscriptionStatus).toBe("active");
    expect(updated?.stripeCustomerId).toBe("cus_mock_123");
    expect(updated?.stripeSubscriptionId).toBe("sub_mock_abc");
    expect(updated?.customerLimit).toBe(10000);
  });

  it("handles customer.subscription.updated and syncs status & plan", () => {
    const ws = tenantStorage.createWorkspace({
      name: "Stripe Webhook WS 2",
      userId: 502,
      plan: "pro",
    });

    const event = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_mock_xyz",
          customer: "cus_mock_456",
          status: "active",
          metadata: {
            workspaceId: ws.id,
            plan: "enterprise",
          },
        },
      },
    };

    const res = handleStripeWebhookEvent(event);
    expect(res.handled).toBe(true);
    expect(res.plan).toBe("enterprise");

    const updated = tenantStorage.getWorkspace(ws.id);
    expect(updated?.plan).toBe("enterprise");
    expect(updated?.customerLimit).toBe(100000);
  });

  it("handles customer.subscription.deleted and marks status as canceled", () => {
    const ws = tenantStorage.createWorkspace({
      name: "Stripe Webhook WS 3",
      userId: 503,
      plan: "pro",
    });

    // Set initial active sub
    tenantStorage.updateSubscription(ws.id, {
      subscriptionStatus: "active",
      stripeSubscriptionId: "sub_to_delete",
    });

    const event = {
      type: "customer.subscription.deleted",
      data: {
        object: {
          subscription: "sub_to_delete",
          metadata: {
            workspaceId: ws.id,
          },
        },
      },
    };

    const res = handleStripeWebhookEvent(event);
    expect(res.handled).toBe(true);
    expect(res.status).toBe("canceled");

    const updated = tenantStorage.getWorkspace(ws.id);
    expect(updated?.subscriptionStatus).toBe("canceled");
  });

  it("handles invoice.payment_failed and marks status as past_due", () => {
    const ws = tenantStorage.createWorkspace({
      name: "Stripe Webhook WS 4",
      userId: 504,
      plan: "pro",
    });

    const event = {
      type: "invoice.payment_failed",
      data: {
        object: {
          metadata: {
            workspaceId: ws.id,
          },
        },
      },
    };

    const res = handleStripeWebhookEvent(event);
    expect(res.handled).toBe(true);
    expect(res.status).toBe("past_due");

    const updated = tenantStorage.getWorkspace(ws.id);
    expect(updated?.subscriptionStatus).toBe("past_due");
  });
});
