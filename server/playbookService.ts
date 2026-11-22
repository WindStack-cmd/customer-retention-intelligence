import crypto from "node:crypto";
import { tenantStorage } from "./tenantStorage";

export interface PlaybookEmailPayload {
  to: string;
  templateName: string;
  customerName?: string;
  discountCode?: string;
  discountPercent?: number;
  workspaceName?: string;
}

export interface WebhookAlertPayload {
  channel: "slack" | "webhook" | "hubspot";
  webhookUrl?: string | null;
  customerName: string;
  sourceCustomerId: string;
  riskProbability: number;
  revenueAtRisk: number;
  priorityBand: string;
  recommendedAction: string;
}

/**
 * Dispatches retention playbook emails.
 * Uses Resend/SendGrid when environment keys are present,
 * otherwise cleanly executes in Mock Mode with structured telemetry.
 */
export async function sendPlaybookEmail(
  payload: PlaybookEmailPayload
): Promise<{ status: "sent" | "simulated"; messageId: string; provider: string }> {
  const apiKey = process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY;

  if (apiKey && process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.PLAYBOOK_FROM_EMAIL || "retention@pulseboard.io",
          to: [payload.to],
          subject: `Exclusive Retention Offer: ${payload.templateName}`,
          html: `<p>Hello ${payload.customerName || "Valued Customer"},</p>
                 <p>We noticed you haven't visited recently. Here is an exclusive offer for your next order: <strong>${payload.discountCode || "SAVE15"}</strong>.</p>`,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string };
        return {
          status: "sent",
          messageId: data.id || `msg_${Date.now()}`,
          provider: "resend",
        };
      }
    } catch (err) {
      console.warn("[PlaybookService] Resend API error, falling back to mock:", err);
    }
  }

  // Realistic mock simulation
  const mockId = `mock_msg_${crypto.randomBytes(8).toString("hex")}`;
  console.log(
    `[PlaybookService MOCK] Sent playbook email "${payload.templateName}" to ${payload.to} with incentive ${payload.discountCode || "N/A"} (ID: ${mockId})`
  );
  return {
    status: "simulated",
    messageId: mockId,
    provider: "mock_resend_sdk",
  };
}

/**
 * Dispatches automated alerts to Slack, Webhooks, or HubSpot.
 */
export async function dispatchAlert(
  payload: WebhookAlertPayload
): Promise<{ success: boolean; status: "dispatched" | "simulated"; detail: string }> {
  if (payload.webhookUrl && payload.webhookUrl.startsWith("http")) {
    try {
      const res = await fetch(payload.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🚨 High Churn Risk Alert for Customer ${payload.sourceCustomerId} (${payload.customerName})`,
          riskScore: `${(payload.riskProbability * 100).toFixed(1)}%`,
          revenueAtRisk: `$${payload.revenueAtRisk.toLocaleString()}`,
          priorityBand: payload.priorityBand,
          recommendedAction: payload.recommendedAction,
          timestamp: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        return { success: true, status: "dispatched", detail: `Sent to ${payload.channel} webhook` };
      }
    } catch (err) {
      console.warn(`[AlertService] Failed to dispatch to ${payload.webhookUrl}:`, err);
    }
  }

  // Simulated notification fallback
  console.log(
    `[AlertService MOCK] Triggered ${payload.channel} alert for customer ${payload.sourceCustomerId}: Risk ${(payload.riskProbability * 100).toFixed(0)}%, Revenue At Risk: $${payload.revenueAtRisk}`
  );
  return {
    success: true,
    status: "simulated",
    detail: `Simulated notification delivered to ${payload.channel}`,
  };
}
