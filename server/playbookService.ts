import crypto from "node:crypto";
import { tenantStorage } from "./tenantStorage";
import { isDevLike } from "./_core/env";

export interface PlaybookEmailPayload {
  to: string;
  templateName: string;
  customerName?: string;
  discountCode?: string;
  discountPercent?: number;
  workspaceName?: string;
  subject?: string;
  body?: string;
}

export interface WebhookAlertPayload {
  channel: "slack" | "webhook" | "hubspot" | "salesforce";
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
 * Uses Resend or SendGrid when environment keys are present,
 * with graceful fallback to Mock Mode with structured telemetry.
 */
export async function sendPlaybookEmail(
  payload: PlaybookEmailPayload
): Promise<{ status: "sent" | "simulated"; messageId: string; provider: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  const sendgridKey = process.env.SENDGRID_API_KEY;

  if (resendKey && !resendKey.includes("placeholder")) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.PLAYBOOK_FROM_EMAIL || "retention@pulseboard.io",
          to: [payload.to],
          subject:
            payload.subject ||
            `Exclusive Retention Offer: ${payload.templateName}`,
          html:
            payload.body ||
            `<p>Hello ${payload.customerName || "Valued Customer"},</p>
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
      console.warn(
        "[PlaybookService] Resend API error, checking SendGrid fallback:",
        err
      );
    }
  }

  // SendGrid API fallback
  if (sendgridKey && !sendgridKey.includes("placeholder")) {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.to }] }],
          from: {
            email: process.env.PLAYBOOK_FROM_EMAIL || "retention@pulseboard.io",
            name: payload.workspaceName || "Pulseboard Retention",
          },
          subject:
            payload.subject ||
            `Exclusive Retention Offer: ${payload.templateName}`,
          content: [
            {
              type: "text/html",
              value:
                payload.body ||
                `<p>Hello ${payload.customerName || "Valued Customer"},</p>
                 <p>We noticed you haven't visited recently. Here is an exclusive offer for your next order: <strong>${payload.discountCode || "SAVE15"}</strong>.</p>`,
            },
          ],
        }),
      });
      if (res.ok || res.status === 202) {
        return {
          status: "sent",
          messageId: `sg_${Date.now()}`,
          provider: "sendgrid",
        };
      }
    } catch (err) {
      console.warn(
        "[PlaybookService] SendGrid API error, falling back to mock:",
        err
      );
    }
  }

  // Realistic mock simulation (dev/test only)
  if (!isDevLike()) {
    throw new Error("Email gateway not configured in production");
  }
  const mockId = `mock_msg_${crypto.randomBytes(8).toString("hex")}`;
  console.log(
    `[PlaybookService MOCK] Sent playbook email "${payload.templateName}" to ${payload.to} with incentive ${payload.discountCode || "N/A"} (ID: ${mockId})`
  );
  return {
    status: "simulated",
    messageId: mockId,
    provider: "mock_email_gateway",
  };
}

/**
 * Dispatches automated alerts to Slack, Webhooks, HubSpot, or Salesforce CRM.
 */
export async function dispatchAlert(
  payload: WebhookAlertPayload
): Promise<{ success: boolean; status: "dispatched" | "simulated"; detail: string }> {
  // 1. HubSpot CRM Task API
  if (payload.channel === "hubspot") {
    const isProduction = !isDevLike();
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (token && !token.includes("placeholder")) {
      try {
        const res = await fetch("https://api.hubapi.com/crm/v3/objects/tasks", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            properties: {
              hs_task_body: `Urgent Retention Alert: Customer ${payload.sourceCustomerId} (${payload.customerName}) has ${(payload.riskProbability * 100).toFixed(1)}% churn risk with $${payload.revenueAtRisk.toLocaleString()} revenue at risk. Recommended Action: ${payload.recommendedAction}`,
              hs_task_subject: `🚨 High Churn Risk: Customer ${payload.sourceCustomerId}`,
              hs_task_status: "NOT_STARTED",
              hs_task_priority: "HIGH",
            },
          }),
        });
        if (res.ok) {
          return {
            success: true,
            status: "dispatched",
            detail: `Created HubSpot CRM task for Account ${payload.sourceCustomerId}`,
          };
        }
      } catch (err) {
        console.warn("[AlertService] HubSpot API error, falling back to mock:", err);
      }
    }
    if (isProduction) {
      return {
        success: false,
        status: "simulated",
        detail: "HubSpot credentials not configured in production",
      };
    }
    console.log(
      `[CRM Alert MOCK] Created Task for Account ${payload.sourceCustomerId} (HubSpot: Priority High, Risk: ${(payload.riskProbability * 100).toFixed(0)}%)`
    );
    return {
      success: true,
      status: "simulated",
      detail: `[CRM Alert MOCK] Created Task for Account ${payload.sourceCustomerId}`,
    };
  }

  // 2. Salesforce CRM Task API
  if (payload.channel === "salesforce") {
    const isProduction = !isDevLike();
    const token = process.env.SALESFORCE_ACCESS_TOKEN;
    const instanceUrl = process.env.SALESFORCE_INSTANCE_URL || "https://login.salesforce.com";
    if (token && !token.includes("placeholder")) {
      try {
        const res = await fetch(`${instanceUrl}/services/data/v58.0/sobjects/Task/`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Subject: `🚨 Urgent Churn Risk: Customer ${payload.sourceCustomerId}`,
            Description: `Customer ${payload.sourceCustomerId} (${payload.customerName}) shows high churn probability of ${(payload.riskProbability * 100).toFixed(1)}% ($${payload.revenueAtRisk.toLocaleString()} revenue at risk). Action: ${payload.recommendedAction}`,
            Priority: "High",
            Status: "Not Started",
          }),
        });
        if (res.ok) {
          return {
            success: true,
            status: "dispatched",
            detail: `Created Salesforce CRM task for Account ${payload.sourceCustomerId}`,
          };
        }
      } catch (err) {
        console.warn("[AlertService] Salesforce API error, falling back to mock:", err);
      }
    }
    if (isProduction) {
      return {
        success: false,
        status: "simulated",
        detail: "Salesforce credentials not configured in production",
      };
    }
    console.log(
      `[CRM Alert MOCK] Created Task for Account ${payload.sourceCustomerId} (Salesforce: Priority High, Risk: ${(payload.riskProbability * 100).toFixed(0)}%)`
    );
    return {
      success: true,
      status: "simulated",
      detail: `[CRM Alert MOCK] Created Task for Account ${payload.sourceCustomerId}`,
    };
  }

  // 3. Webhook / Slack
  if (payload.webhookUrl && payload.webhookUrl.startsWith("http") && !payload.webhookUrl.includes("MOCK")) {
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

  if (!isDevLike()) {
    return {
      success: false,
      status: "simulated",
      detail: `${payload.channel} webhook not configured in production`,
    };
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
