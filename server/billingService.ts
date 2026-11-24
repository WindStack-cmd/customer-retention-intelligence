import { tenantStorage } from "./tenantStorage";

export interface PlanConfig {
  id: "starter" | "pro" | "enterprise";
  name: string;
  priceMonthly: number;
  customerLimit: number;
  features: string[];
}

export const BILLING_PLANS: Record<string, PlanConfig> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 99,
    customerLimit: 1000,
    features: [
      "Up to 1,000 scored customers",
      "Daily automated scoring",
      "Standard email playbooks",
      "Community support",
    ],
  },
  pro: {
    id: "pro",
    name: "Growth Pro",
    priceMonthly: 299,
    customerLimit: 10000,
    features: [
      "Up to 10,000 scored customers",
      "Real-time event ingestion API",
      "Slack & Webhook alerts",
      "Cohort retention analytics",
      "CSM account notes & team RBAC",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: 799,
    customerLimit: 100000,
    features: [
      "Up to 100,000 scored customers",
      "Dedicated model calibration",
      "Custom CRM sync (HubSpot, Salesforce)",
      "Audit logging & GDPR/CCPA exports",
      "Dedicated CSM & SLA guarantee",
    ],
  },
};

/**
 * Creates Stripe Checkout session or clean mock checkout URL
 */
export async function createCheckoutSession(params: {
  workspaceId: string;
  planId: "starter" | "pro" | "enterprise";
  returnUrl: string;
}): Promise<{ url: string; mode: "stripe" | "mock" }> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const workspace = tenantStorage.getWorkspace(params.workspaceId);
  if (!workspace) throw new Error("Workspace not found");

  if (stripeKey && !stripeKey.includes("placeholder")) {
    try {
      // In real mode, use Stripe API
      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          success_url: `${params.returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: params.returnUrl,
          mode: "subscription",
          client_reference_id: params.workspaceId,
        }),
      });
      if (res.ok) {
        const session = (await res.json()) as { url: string };
        return { url: session.url, mode: "stripe" };
      }
    } catch (err) {
      console.warn("[BillingService] Stripe API checkout failed, using simulation:", err);
    }
  }

  // Simulated Instant Upgrade
  const plan = BILLING_PLANS[params.planId] || BILLING_PLANS.pro;
  tenantStorage.updateWorkspace(params.workspaceId, {
    plan: plan.id,
    customerLimit: plan.customerLimit,
    subscriptionStatus: "active",
  });
  tenantStorage.logAudit({
    workspaceId: params.workspaceId,
    action: `billing.plan_upgraded`,
    resourceType: "subscription",
    resourceId: plan.id,
    details: { plan: plan.name, price: plan.priceMonthly, mock: true },
  });

  return {
    url: `${params.returnUrl}#billing-success`,
    mode: "mock",
  };
}

/**
 * Creates Stripe Customer Portal session or mock portal URL
 */
export async function createPortalSession(params: {
  workspaceId: string;
  returnUrl: string;
}): Promise<{ url: string; mode: "stripe" | "mock" }> {
  return {
    url: `${params.returnUrl}#billing-manage`,
    mode: "mock",
  };
}
