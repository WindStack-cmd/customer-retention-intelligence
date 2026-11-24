import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  TrendingUp,
  ShieldAlert,
  Send,
  Bell,
  CheckCircle2,
  Percent,
  Play,
  RotateCw,
  Edit3,
  X,
} from "lucide-react";

export function RetentionROISection() {
  const utils = trpc.useUtils();
  const { data: roi } = trpc.actions.roiSummary.useQuery();
  const { data: playbooks } = trpc.actions.playbooks.useQuery();
  const { data: alerts } = trpc.actions.alerts.useQuery();

  const [testAlertMessage, setTestAlertMessage] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<{
    id: string;
    name: string;
    category: string;
    subject: string;
    body: string;
    discountPercent: number;
    cooldownDays: number;
  } | null>(null);

  const saveTemplateMutation = trpc.actions.savePlaybookTemplate.useMutation({
    onSuccess: () => {
      utils.actions.playbooks.invalidate();
      setEditingTemplate(null);
    },
  });

  const testAlertMutation = trpc.actions.testAlert.useMutation({
    onSuccess: (res) => {
      setTestAlertMessage(`Test alert dispatched: ${res.detail}`);
      setTimeout(() => setTestAlertMessage(null), 4000);
    },
  });

  return (
    <div className="space-y-6">
      {/* ROI & Saved Revenue Highlight */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {roi?.sampleData && (
          <div className="mb-5 rounded-xl border border-primary/20 bg-primary/10 p-3.5 text-xs text-primary flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                <strong>SAMPLE ESTIMATES</strong> — no interventions recorded yet. Connect playbooks and record actions to measure real impact.
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">
              Retention Outcome & ROI Tracking
            </h3>
            <p className="text-xs text-muted-foreground">
              Direct measurement of recovered revenue and pre/post retention difference from recorded playbooks.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <TrendingUp className="h-4 w-4" />
            <span>
              {roi?.retentionUpliftPercentage != null
                ? `+${roi.retentionUpliftPercentage}% Observed Difference`
                : "Awaiting Interventions"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">Revenue Saved This Month</p>
            <p className="font-display text-2xl font-bold text-foreground mt-1">
              £{(roi?.revenueSavedThisMonth ?? 0).toLocaleString()}
            </p>
            <p className="text-[11px] text-primary mt-1">
              {roi?.sampleData ? "Awaiting recovered accounts" : "Based on verified recovered accounts"}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">Contacted Cohort Retention</p>
            <p className="font-display text-2xl font-bold text-status-protective-text mt-1">
              {roi?.contactedRetentionRate != null ? `${roi.contactedRetentionRate}%` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              vs {roi?.nonContactedRetentionRate ?? 32.1}% baseline benchmark
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">Executed Playbooks</p>
            <p className="font-display text-2xl font-bold text-foreground mt-1">
              {roi?.totalInterventions ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">Recorded playbook interventions</p>
          </div>
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground italic border-t border-border pt-2.5">
          Methodology: Observed outcomes, not guaranteed causal impact. Causal uplift requires prospective randomized holdout testing.
        </p>
      </div>

      {/* Playbook Templates */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          <span>Active Retention Playbooks</span>
        </h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {playbooks?.map((pb) => (
            <div
              key={pb.id}
              className="flex flex-col justify-between rounded-xl border border-border bg-background p-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-foreground">{pb.name}</span>
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-medium">
                    {pb.category}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{pb.description || pb.subject}</p>
              </div>
              <div className="mt-4 flex items-center justify-between pt-3 border-t border-border text-[11px]">
                <span className="text-subtle-foreground">
                  Incentive: {pb.discountPercent ? `${pb.discountPercent}% off` : "None"} · {pb.cooldownDays}d cooldown
                </span>
                <button
                  onClick={() => setEditingTemplate(pb)}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <Edit3 className="h-3 w-3" />
                  <span>Customize</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert Rules & Dispatch */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span>Automated Churn Alert Rules</span>
          </h4>
          <button
            onClick={() =>
              testAlertMutation.mutate({
                channel: "slack",
                webhookUrl: "https://hooks.slack.com/services/MOCK",
              })
            }
            disabled={testAlertMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {testAlertMutation.isPending ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>Send Test Alert</span>
          </button>
        </div>

        {testAlertMessage && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{testAlertMessage}</span>
          </div>
        )}

        <div className="space-y-2">
          {alerts?.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between rounded-xl border border-border bg-background p-3.5 text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{rule.name}</span>
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase font-medium">
                    {rule.channel}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Triggers on Band <strong className="text-foreground">{rule.thresholdBand}</strong> with Churn Prob ≥ {Math.round(Number(rule.minRiskProbability) * 100)}%
                </p>
              </div>
              <span className="rounded-full bg-status-protective-bg border border-status-protective-border px-2 py-0.5 text-[10px] text-status-protective-text font-medium">
                Active
              </span>
            </div>
          ))}
        </div>
      </div>

      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-foreground">
                Customize Playbook: {editingTemplate.name}
              </h3>
              <button
                onClick={() => setEditingTemplate(null)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveTemplateMutation.mutate(editingTemplate);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={editingTemplate.subject}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      subject: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Email Body Template (supports {"{{customerName}}"} and {"{{discountCode}}"})
                </label>
                <textarea
                  rows={4}
                  required
                  value={editingTemplate.body}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      body: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-border bg-background p-3 text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">
                    Discount Percentage (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editingTemplate.discountPercent}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        discountPercent: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">
                    Re-engagement Cooldown (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={editingTemplate.cooldownDays}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        cooldownDays: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="rounded-lg border border-border px-3.5 py-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveTemplateMutation.isPending}
                  className="rounded-lg bg-primary px-4 py-1.5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                >
                  {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
