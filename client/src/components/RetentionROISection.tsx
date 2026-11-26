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
  Plus,
  Trash2,
  Power,
} from "lucide-react";

export function RetentionROISection() {
  const utils = trpc.useUtils();
  const { data: roi } = trpc.actions.roiSummary.useQuery();
  const { data: playbooks } = trpc.actions.playbooks.useQuery();
  const { data: alerts } = trpc.actions.alerts.useQuery();

  const [testAlertMessage, setTestAlertMessage] = useState<string | null>(null);
  const [testAlertChannel, setTestAlertChannel] = useState<"slack" | "webhook" | "hubspot" | "salesforce">("slack");
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<{
    id?: number;
    name: string;
    channel: "slack" | "webhook" | "hubspot" | "salesforce";
    webhookUrl: string;
    thresholdBand: "Urgent" | "High" | "Any";
    minRiskProbability: string;
    minRevenueAtRisk: string;
  } | null>(null);

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

  const saveRuleMutation = trpc.actions.saveAlertRule.useMutation({
    onSuccess: () => {
      utils.actions.alerts.invalidate();
      setIsRuleModalOpen(false);
      setEditingRule(null);
    },
  });

  const toggleRuleMutation = trpc.actions.toggleAlertRule.useMutation({
    onSuccess: () => {
      utils.actions.alerts.invalidate();
    },
  });

  const deleteRuleMutation = trpc.actions.deleteAlertRule.useMutation({
    onSuccess: () => {
      utils.actions.alerts.invalidate();
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
              {roi?.totalInterventions === 0 || roi?.retentionUpliftPercentage == null
                ? "Awaiting Interventions"
                : `+${roi.retentionUpliftPercentage}% Observed Difference`}
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
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Contacted Cohort Retention</p>
              {roi?.sampleData && (
                <span className="rounded bg-status-medium-bg border border-status-medium-border px-1.5 py-0.5 text-[9px] font-bold text-status-medium-text uppercase">
                  Sample data
                </span>
              )}
            </div>
            <p className="font-display text-2xl font-bold text-status-protective-text mt-1">
              {roi?.contactedRetentionRate != null ? `${roi.contactedRetentionRate}%` : "—"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              vs {roi?.nonContactedRetentionRate ?? 32.1}% baseline (Sample benchmark) {roi?.sampleData ? "(Sample data)" : ""}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <span>Automated Churn Alert Rules</span>
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Notify Slack channels, webhooks, or dispatch tasks directly to CRM accounts when accounts cross churn thresholds.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1">
              <span className="text-[11px] text-muted-foreground">Test:</span>
              <select
                value={testAlertChannel}
                onChange={(e) =>
                  setTestAlertChannel(e.target.value as "slack" | "webhook" | "hubspot" | "salesforce")
                }
                className="bg-transparent text-xs text-foreground focus:outline-none"
              >
                <option value="slack">Slack</option>
                <option value="webhook">Webhook</option>
                <option value="hubspot">HubSpot (CRM Mock)</option>
                <option value="salesforce">Salesforce (CRM Mock)</option>
              </select>
            </div>
            <button
              onClick={() =>
                testAlertMutation.mutate({
                  channel: testAlertChannel,
                  webhookUrl: testAlertChannel === "slack" || testAlertChannel === "webhook"
                    ? "https://hooks.slack.com/services/MOCK"
                    : undefined,
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
              <span>Send Test</span>
            </button>
            <button
              onClick={() => {
                setEditingRule({
                  name: "",
                  channel: "slack",
                  webhookUrl: "",
                  thresholdBand: "Urgent",
                  minRiskProbability: "0.7500",
                  minRevenueAtRisk: "1000.00",
                });
                setIsRuleModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Rule</span>
            </button>
          </div>
        </div>

        {testAlertMessage && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{testAlertMessage}</span>
          </div>
        )}

        <div className="space-y-2">
          {alerts?.length === 0 && (
            <div className="rounded-xl border border-border/60 bg-background/50 p-6 text-center text-xs text-muted-foreground">
              No alert rules defined yet. Click "Create Rule" to configure an automated retention rule.
            </div>
          )}
          {alerts?.map((rule) => {
            const isEnabled = rule.enabled === 1;
            const isCrmChannel = rule.channel === "hubspot" || rule.channel === "salesforce";
            return (
              <div
                key={rule.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3.5 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{rule.name}</span>
                    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase font-medium">
                      {rule.channel}
                    </span>
                    {isCrmChannel && (
                      <span className="rounded bg-accent-soft/80 border border-border px-1.5 py-0.5 text-[10px] text-subtle-foreground font-mono">
                        Mock Mode Fallback
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Triggers on Band <strong className="text-foreground">{rule.thresholdBand}</strong> with Churn Prob ≥ {Math.round(Number(rule.minRiskProbability) * 100)}% · Min Exposure £{Number(rule.minRevenueAtRisk).toLocaleString()}
                    {rule.webhookUrl ? ` · ${rule.webhookUrl}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => toggleRuleMutation.mutate({ ruleId: rule.id })}
                    disabled={toggleRuleMutation.isPending}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                      isEnabled
                        ? "bg-status-protective-bg border-status-protective-border text-status-protective-text hover:opacity-80"
                        : "bg-muted border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Power className="h-3 w-3" />
                    <span>{isEnabled ? "Active" : "Paused"}</span>
                  </button>
                  <button
                    onClick={() => {
                      setEditingRule({
                        id: rule.id,
                        name: rule.name,
                        channel: rule.channel as "slack" | "webhook" | "hubspot" | "salesforce",
                        webhookUrl: rule.webhookUrl || "",
                        thresholdBand: rule.thresholdBand as "Urgent" | "High" | "Any",
                        minRiskProbability: rule.minRiskProbability,
                        minRevenueAtRisk: rule.minRevenueAtRisk,
                      });
                      setIsRuleModalOpen(true);
                    }}
                    className="rounded-lg border border-border bg-card p-1.5 text-muted-foreground hover:bg-card-hover hover:text-foreground"
                    title="Edit Rule"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete alert rule "${rule.name}"?`)) {
                        deleteRuleMutation.mutate({ ruleId: rule.id });
                      }
                    }}
                    disabled={deleteRuleMutation.isPending}
                    className="rounded-lg border border-status-urgent-border/40 bg-status-urgent-bg/20 p-1.5 text-status-urgent-text hover:bg-status-urgent-bg/40 disabled:opacity-50"
                    title="Delete Rule"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alert Rule Create / Edit Modal */}
      {isRuleModalOpen && editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-foreground">
                {editingRule.id ? "Edit Alert Rule" : "Create New Alert Rule"}
              </h3>
              <button
                onClick={() => {
                  setIsRuleModalOpen(false);
                  setEditingRule(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveRuleMutation.mutate({
                  id: editingRule.id,
                  name: editingRule.name,
                  channel: editingRule.channel,
                  webhookUrl: editingRule.webhookUrl ? editingRule.webhookUrl : undefined,
                  thresholdBand: editingRule.thresholdBand,
                  minRiskProbability: editingRule.minRiskProbability,
                  minRevenueAtRisk: editingRule.minRevenueAtRisk,
                });
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-medium text-foreground mb-1">
                  Rule Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Urgent Risk Account to Salesforce Task"
                  value={editingRule.name}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, name: e.target.value })
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Channel Destination
                  </label>
                  <select
                    value={editingRule.channel}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        channel: e.target.value as "slack" | "webhook" | "hubspot" | "salesforce",
                      })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="slack">Slack Incoming Webhook</option>
                    <option value="webhook">Custom HTTP Webhook</option>
                    <option value="hubspot">HubSpot CRM Task (Mock / API)</option>
                    <option value="salesforce">Salesforce CRM Task (Mock / API)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Risk Threshold Band
                  </label>
                  <select
                    value={editingRule.thresholdBand}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        thresholdBand: e.target.value as "Urgent" | "High" | "Any",
                      })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="Urgent">Urgent Priority Only</option>
                    <option value="High">High & Urgent</option>
                    <option value="Any">Any Priority Band</option>
                  </select>
                </div>
              </div>

              {(editingRule.channel === "slack" || editingRule.channel === "webhook") && (
                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Webhook Destination URL
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://hooks.slack.com/services/..."
                    value={editingRule.webhookUrl}
                    onChange={(e) =>
                      setEditingRule({ ...editingRule, webhookUrl: e.target.value })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Min Churn Probability (%)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={Math.round(Number(editingRule.minRiskProbability) * 100)}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        minRiskProbability: (Number(e.target.value) / 100).toFixed(4),
                      })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Min Revenue at Risk (£)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={Number(editingRule.minRevenueAtRisk)}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        minRevenueAtRisk: Number(e.target.value).toFixed(2),
                      })
                    }
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRuleModalOpen(false);
                    setEditingRule(null);
                  }}
                  className="rounded-xl border border-border bg-background px-4 py-2 font-medium text-foreground hover:bg-card-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveRuleMutation.isPending}
                  className="rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                >
                  {saveRuleMutation.isPending ? "Saving..." : "Save Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
