import crypto from "crypto";
import type { Request, Response } from "express";
import { tenantStorage } from "./tenantStorage";
import { isDevLike } from "./_core/env";

export interface StripeWebhookResult {
  handled: boolean;
  action?: string;
  workspaceId?: string;
  plan?: string;
  status?: string;
  error?: string;
}

export function verifyStripeSignature(
  payload: string | Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  try {
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find(p => p.startsWith("t="));
    const signaturePart = parts.find(p => p.startsWith("v1="));
    if (!timestampPart || !signaturePart) return false;

    const timestamp = timestampPart.slice(2);
    const signature = signaturePart.slice(3);
    const signedPayload = `${timestamp}.${payload}`;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload, "utf8")
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

export function handleStripeWebhookEvent(event: any): StripeWebhookResult {
  const eventType = event?.type;
  const dataObject = event?.data?.object || {};

  // Find workspaceId from metadata or client_reference_id or stripe ids
  let workspaceId: string | undefined =
    dataObject.metadata?.workspaceId || dataObject.client_reference_id;

  if (!workspaceId && dataObject.subscription) {
    const ws = tenantStorage.findWorkspaceByStripeSubscription(
      String(dataObject.subscription)
    );
    if (ws) workspaceId = ws.id;
  }

  if (!workspaceId && dataObject.customer) {
    const ws = tenantStorage.findWorkspaceByStripeCustomer(
      String(dataObject.customer)
    );
    if (ws) workspaceId = ws.id;
  }

  // Handle events
  switch (eventType) {
    case "checkout.session.completed": {
      if (!workspaceId) return { handled: false, error: "Missing workspaceId" };
      const plan = (dataObject.metadata?.plan || "pro") as
        | "starter"
        | "pro"
        | "enterprise";
      tenantStorage.updateSubscription(workspaceId, {
        plan,
        subscriptionStatus: "active",
        stripeCustomerId: dataObject.customer
          ? String(dataObject.customer)
          : null,
        stripeSubscriptionId: dataObject.subscription
          ? String(dataObject.subscription)
          : null,
      });
      return {
        handled: true,
        action: "checkout.session.completed",
        workspaceId,
        plan,
        status: "active",
      };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      if (!workspaceId) return { handled: false, error: "Missing workspaceId" };
      const status = dataObject.status || "active";
      const plan = (dataObject.metadata?.plan || "pro") as
        | "starter"
        | "pro"
        | "enterprise";
      tenantStorage.updateSubscription(workspaceId, {
        plan,
        subscriptionStatus: status,
        stripeCustomerId: dataObject.customer
          ? String(dataObject.customer)
          : undefined,
        stripeSubscriptionId: dataObject.id
          ? String(dataObject.id)
          : undefined,
      });
      return { handled: true, action: eventType, workspaceId, plan, status };
    }

    case "customer.subscription.deleted": {
      if (!workspaceId) return { handled: false, error: "Missing workspaceId" };
      tenantStorage.updateSubscription(workspaceId, {
        subscriptionStatus: "canceled",
      });
      return {
        handled: true,
        action: "customer.subscription.deleted",
        workspaceId,
        status: "canceled",
      };
    }

    case "invoice.payment_failed": {
      if (!workspaceId) return { handled: false, error: "Missing workspaceId" };
      tenantStorage.updateSubscription(workspaceId, {
        subscriptionStatus: "past_due",
      });
      return {
        handled: true,
        action: "invoice.payment_failed",
        workspaceId,
        status: "past_due",
      };
    }

    default:
      return { handled: false, action: eventType || "unhandled" };
  }
}

export function stripeWebhookMiddleware(req: Request, res: Response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.header("stripe-signature");

  if (secret) {
    const rawPayload = (req as any).rawBody || JSON.stringify(req.body);
    const isValid = verifyStripeSignature(rawPayload, signature, secret);
    if (!isValid) {
      console.warn("[Stripe Webhook] Invalid signature rejected");
      return res.status(400).json({ error: "Invalid Stripe webhook signature" });
    }
    console.log("[Stripe Webhook VERIFIED] Signature verified successfully");
  } else if (!isDevLike()) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET missing in production mode");
    return res.status(500).json({ error: "Stripe webhook secret not configured" });
  } else {
    console.log(
      `[Stripe Webhook MOCK] STRIPE_WEBHOOK_SECRET not set, processing event in mock mode: ${req.body?.type || "unknown"}`
    );
  }

  const result = handleStripeWebhookEvent(req.body);
  return res.status(200).json({ received: true, ...result });
}
