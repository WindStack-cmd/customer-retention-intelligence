import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  CreditCard,
  ShieldCheck,
  Check,
  Download,
  Trash2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

export function BillingAndSecuritySection() {
  const utils = trpc.useUtils();
  const { data: subscription } = trpc.billing.subscription.useQuery();
  const { data: plans } = trpc.billing.plans.useQuery();
  const { data: auditLogs } = trpc.security.auditLogs.useQuery({ limit: 25 });

  const [gdprCustomerId, setGdprCustomerId] = useState("");
  const [gdprMessage, setGdprMessage] = useState<string | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);

  const checkoutMutation = trpc.billing.createCheckout.useMutation({
    onSuccess: (res) => {
      if (res.mode === "mock") {
        setUpgradeMessage("Subscription tier successfully upgraded in simulated mode!");
        utils.billing.subscription.invalidate();
        utils.workspace.current.invalidate();
        setTimeout(() => setUpgradeMessage(null), 5000);
      } else if (res.url) {
        window.location.href = res.url;
      }
    },
  });

  const gdprExportMutation = trpc.security.gdprExport.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gdpr-export-customer-${data.customerId}.json`;
      a.click();
      setGdprMessage(`Exported GDPR archive for customer #${data.customerId}`);
      setTimeout(() => setGdprMessage(null), 4000);
    },
  });

  const gdprEraseMutation = trpc.security.gdprErase.useMutation({
    onSuccess: (data) => {
      setGdprMessage(`Customer #${data.customerId} successfully anonymized & erased.`);
      utils.security.auditLogs.invalidate();
      setTimeout(() => setGdprMessage(null), 4000);
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground">
          Billing, Security & Compliance
        </h3>
        <p className="text-xs text-muted-foreground">
          Manage your subscription tier, view immutable audit logs, and execute GDPR/CCPA privacy requests.
        </p>
      </div>

      {upgradeMessage && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>{upgradeMessage}</span>
        </div>
      )}

      {/* Subscription & Usage Card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <span>Current Subscription: {subscription?.plan.name || "Growth Pro"}</span>
            </h4>
            <p className="font-display text-2xl font-bold text-foreground mt-1">
              ${subscription?.plan.priceMonthly || 299} <span className="text-xs font-normal text-muted-foreground">/ month</span>
            </p>
          </div>
          <span className="rounded-full bg-status-protective-bg border border-status-protective-border px-3 py-1 text-xs font-semibold text-status-protective-text uppercase">
            {subscription?.status || "ACTIVE"}
          </span>
        </div>

        {/* Plan Limit Progress Bar */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Scored Accounts Usage</span>
            <span className="font-medium text-foreground">
              {subscription?.currentCustomerCount.toLocaleString()} / {subscription?.customerLimit.toLocaleString()} accounts ({subscription?.usagePercent}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${subscription?.usagePercent || 41}%` }}
            />
          </div>
        </div>

        {/* Tier Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {plans?.map((p) => {
            const isCurrent = p.id === subscription?.plan.id;
            return (
              <div
                key={p.id}
                className={`flex flex-col justify-between rounded-xl border p-4 ${
                  isCurrent
                    ? "border-primary bg-primary/5 shadow-lg"
                    : "border-border bg-background"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-foreground">{p.name}</span>
                    {isCurrent && (
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary uppercase">
                        Active Plan
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xl font-bold text-foreground">
                    ${p.priceMonthly} <span className="text-[10px] font-normal text-muted-foreground">/ mo</span>
                  </p>
                  <p className="text-[11px] text-primary font-medium mt-0.5">
                    Up to {p.customerLimit.toLocaleString()} accounts
                  </p>
                  <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                    {p.features.map((feat, idx) => (
                      <li key={idx} className="flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-primary shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 pt-3 border-t border-border">
                  <button
                    disabled={isCurrent || checkoutMutation.isPending}
                    onClick={() =>
                      checkoutMutation.mutate({
                        planId: p.id,
                        returnUrl: window.location.href,
                      })
                    }
                    className={`w-full rounded-lg py-1.5 text-xs font-semibold transition ${
                      isCurrent
                        ? "border border-border text-muted-foreground opacity-50 cursor-default"
                        : "bg-primary text-primary-foreground hover:brightness-110"
                    }`}
                  >
                    {isCurrent ? "Current Plan" : "Upgrade to " + p.name}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* GDPR / CCPA Compliance Panel */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>GDPR / CCPA Privacy Compliance</span>
        </h4>
        <p className="text-xs text-muted-foreground mb-4">
          Export full data archives or permanently anonymize customer records under Right to Erasure (Article 17).
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="number"
            placeholder="Target Customer ID (e.g. 17850)"
            value={gdprCustomerId}
            onChange={(e) => setGdprCustomerId(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => gdprExportMutation.mutate({ customerId: Number(gdprCustomerId) })}
            disabled={!gdprCustomerId || gdprExportMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-card-hover disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 text-primary" />
            <span>Export Archive</span>
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Permanently erase all data for customer #${gdprCustomerId}?`)) {
                gdprEraseMutation.mutate({ customerId: Number(gdprCustomerId) });
              }
            }}
            disabled={!gdprCustomerId || gdprEraseMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-status-urgent-border/40 bg-status-urgent-bg/30 px-4 py-2 text-xs font-medium text-status-urgent-text hover:bg-status-urgent-bg/60 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Erase Customer Data</span>
          </button>
        </div>

        {gdprMessage && (
          <p className="mt-3 text-xs text-primary font-medium">{gdprMessage}</p>
        )}
      </div>

      {/* Immutable Audit Log Table */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Security & Compliance Audit Logs
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-subtle-foreground">
                <th className="pb-2.5 font-medium">Timestamp</th>
                <th className="pb-2.5 font-medium">Actor</th>
                <th className="pb-2.5 font-medium">Action</th>
                <th className="pb-2.5 font-medium">Resource</th>
                <th className="pb-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {auditLogs?.map((log) => (
                <tr key={log.id} className="hover:bg-card-hover font-mono text-[11px]">
                  <td className="py-2.5 text-muted-foreground">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </td>
                  <td className="py-2.5 text-foreground">{log.userName || "System"}</td>
                  <td className="py-2.5 text-primary font-medium">{log.action}</td>
                  <td className="py-2.5 text-subtle-foreground">{log.resourceType}:{log.resourceId || "—"}</td>
                  <td className="py-2.5 text-muted-foreground truncate max-w-xs">{log.details || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
