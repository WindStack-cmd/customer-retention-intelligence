import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Zap,
  Key,
  Play,
  RotateCw,
  Plus,
  Trash2,
  Check,
  Copy,
  Radio,
  Clock,
  Settings,
  X,
} from "lucide-react";

export function IntegrationsSection() {
  const utils = trpc.useUtils();
  const { data: status } = trpc.integrations.status.useQuery();
  const { data: apiKeys } = trpc.integrations.apiKeys.useQuery();
  const { data: events } = trpc.integrations.events.useQuery({ limit: 20 });
  const { data: scoringRuns } = trpc.integrations.scoringRuns.useQuery({ limit: 5 });
  const { data: schedule } = trpc.integrations.schedulerStatus.useQuery();

  const [newKeyName, setNewKeyName] = useState("");
  const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [scoringMessage, setScoringMessage] = useState<string | null>(null);
  const [connectorModal, setConnectorModal] = useState<{
    source: "stripe" | "shopify";
    mode: "mock" | "live";
    apiKey: string;
    webhookUrl: string;
  } | null>(null);

  const configureConnectorMutation =
    trpc.integrations.configureConnector.useMutation({
      onSuccess: () => {
        utils.integrations.status.invalidate();
        setConnectorModal(null);
      },
    });

  const createKeyMutation = trpc.integrations.createApiKey.useMutation({
    onSuccess: (data) => {
      setCreatedKeySecret(data.rawSecret);
      setNewKeyName("");
      utils.integrations.apiKeys.invalidate();
    },
  });

  const revokeKeyMutation = trpc.integrations.revokeApiKey.useMutation({
    onSuccess: () => {
      utils.integrations.apiKeys.invalidate();
    },
  });

  const triggerSyncMutation = trpc.integrations.triggerSync.useMutation({
    onSuccess: () => {
      utils.integrations.events.invalidate();
      utils.analytics.executiveOverview.invalidate();
    },
  });

  const triggerScoringMutation = trpc.integrations.triggerScoring.useMutation({
    onSuccess: (res) => {
      setScoringMessage(`Scored ${res.customersScored.toLocaleString()} accounts successfully.`);
      utils.integrations.scoringRuns.invalidate();
      utils.analytics.executiveOverview.invalidate();
      setTimeout(() => setScoringMessage(null), 5000);
    },
  });

  const handleCopySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Automated Ingestion & Connectors
          </h3>
          <p className="text-xs text-muted-foreground">
            Stream customer transactions in real-time or sync via pre-built commerce integrations.
          </p>
        </div>
        <button
          onClick={() => triggerScoringMutation.mutate()}
          disabled={triggerScoringMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-lg transition hover:brightness-110 disabled:opacity-50"
        >
          {triggerScoringMutation.isPending ? (
            <RotateCw className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
          <span>{triggerScoringMutation.isPending ? "Computing Churn Scores..." : "Run Scoring Now"}</span>
        </button>
      </div>

      {scoringMessage && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" />
          <span>{scoringMessage}</span>
        </div>
      )}

      {/* Integration Connectors Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Stripe */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-foreground">Stripe Billing</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase font-medium text-primary">
                <Radio className="h-2 w-2 text-primary" />
                {status?.stripe.connected ? `Connected (${status.stripe.mode === "live" ? "Live" : "Mock mode"})` : "Not connected"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Syncs invoice renewals, failed charges, refund disputes, and cancellations.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-border">
            <span className="text-[10px] text-subtle-foreground">
              {status?.stripe.lastSyncAt ? `Synced ${new Date(status.stripe.lastSyncAt).toLocaleDateString()}` : "Synced recently"}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  setConnectorModal({
                    source: "stripe",
                    mode: status?.stripe.mode || "mock",
                    apiKey: "",
                    webhookUrl: "",
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-3 w-3" />
                <span>Configure</span>
              </button>
              <button
                onClick={() => triggerSyncMutation.mutate({ source: "stripe" })}
                disabled={triggerSyncMutation.isPending}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              >
                Sync Now
              </button>
            </div>
          </div>
        </div>

        {/* Shopify */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-foreground">Shopify Commerce</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase font-medium text-primary">
                <Radio className="h-2 w-2 text-primary" />
                {status?.shopify.connected ? `Connected (${status.shopify.mode === "live" ? "Live" : "Mock mode"})` : "Not connected"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Ingests customer order history, return quantities, cart abandonments, and CLV.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-border">
            <span className="text-[10px] text-subtle-foreground">
              {status?.shopify.lastSyncAt ? `Synced ${new Date(status.shopify.lastSyncAt).toLocaleDateString()}` : "Synced recently"}
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  setConnectorModal({
                    source: "shopify",
                    mode: status?.shopify.mode || "mock",
                    apiKey: "",
                    webhookUrl: "",
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-3 w-3" />
                <span>Configure</span>
              </button>
              <button
                onClick={() => triggerSyncMutation.mutate({ source: "shopify" })}
                disabled={triggerSyncMutation.isPending}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
              >
                Sync Now
              </button>
            </div>
          </div>
        </div>

        {/* REST API */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-foreground">Inbound Events API</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase font-medium text-status-protective-text">
                LIVE
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Send custom events directly via <code className="text-foreground">POST /api/v1/events</code> with rate-limiting.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-border">
            <span className="text-[10px] text-subtle-foreground">100 req/min limit</span>
            <span className="text-xs font-medium text-primary">Ready</span>
          </div>
        </div>
      </div>

      {/* API Keys Management */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Key className="h-4 w-4 text-primary" />
          <span>Workspace API Keys</span>
        </h4>
        <p className="text-xs text-muted-foreground mb-4">
          Authenticate programmatic event streams using the <code className="text-foreground">x-api-key</code> header.
        </p>

        {/* Create API Key Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newKeyName.trim()) return;
            createKeyMutation.mutate({ name: newKeyName.trim() });
          }}
          className="flex flex-col gap-3 sm:flex-row mb-4"
        >
          <input
            type="text"
            required
            placeholder="Key label (e.g. Production Ingestion Stream)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={createKeyMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Generate Key</span>
          </button>
        </form>

        {/* Just Created Secret Banner */}
        {createdKeySecret && (
          <div className="mb-4 rounded-xl border border-primary/40 bg-primary/10 p-3">
            <p className="text-xs font-semibold text-primary mb-1">
              Save your API Key Secret now — it will not be shown again!
            </p>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-background p-2 font-mono text-xs text-foreground">
              <span className="truncate">{createdKeySecret}</span>
              <button
                onClick={() => handleCopySecret(createdKeySecret)}
                className="inline-flex items-center gap-1 rounded bg-card px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {copiedSecret ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                <span>{copiedSecret ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Existing Keys Table */}
        <div className="space-y-2">
          {apiKeys?.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">No active API keys yet.</p>
          ) : (
            apiKeys?.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-xs"
              >
                <div>
                  <p className="font-medium text-foreground">{k.name}</p>
                  <p className="font-mono text-[11px] text-subtle-foreground">
                    {k.keyPrefix}••••••••••••••••••••••••
                  </p>
                </div>
                <button
                  onClick={() => revokeKeyMutation.mutate({ id: k.id })}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-status-urgent-bg hover:text-status-urgent-text"
                  title="Revoke Key"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Scoring Runs History */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span>Recent Scoring Runs</span>
          </h4>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Auto-scoring: {schedule?.scheduleDescription || "Active (daily at 02:00 UTC)"}
          </span>
        </div>
        {schedule?.nextScheduledRun && (
          <p className="text-[11px] text-muted-foreground mb-3">
            Next scheduled run: {new Date(schedule.nextScheduledRun).toUTCString()}
          </p>
        )}
        <div className="space-y-2">
          {scoringRuns?.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No scoring runs recorded yet.</p>
          ) : (
            scoringRuns?.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      Run #{run.id} ({run.triggerType.toUpperCase()})
                    </span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary uppercase font-semibold">
                      {run.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {run.summary || `Scored ${run.customersScored} accounts`}
                  </p>
                </div>
                <div className="text-right text-[11px] text-subtle-foreground">
                  {new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {connectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-foreground">
                Configure {connectorModal.source === "stripe" ? "Stripe Billing" : "Shopify Commerce"}
              </h3>
              <button
                onClick={() => setConnectorModal(null)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                configureConnectorMutation.mutate({
                  source: connectorModal.source,
                  connected: true,
                  mode: connectorModal.mode,
                  apiKey: connectorModal.apiKey || undefined,
                  webhookUrl: connectorModal.webhookUrl || undefined,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Integration Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConnectorModal({ ...connectorModal, mode: "mock" })}
                    className={`rounded-xl border p-2.5 text-xs text-left transition ${
                      connectorModal.mode === "mock"
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    <p className="font-semibold">Mock Mode</p>
                    <p className="text-[10px] mt-0.5 opacity-80">Simulated test events</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConnectorModal({ ...connectorModal, mode: "live" })}
                    className={`rounded-xl border p-2.5 text-xs text-left transition ${
                      connectorModal.mode === "live"
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    <p className="font-semibold">Live Mode</p>
                    <p className="text-[10px] mt-0.5 opacity-80">Real API credentials</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  {connectorModal.source === "stripe" ? "Stripe Restricted Secret Key" : "Shopify Admin API Token"}
                </label>
                <input
                  type="password"
                  placeholder={connectorModal.source === "stripe" ? "rk_live_... or leave empty for mock" : "shpat_... or leave empty for mock"}
                  value={connectorModal.apiKey}
                  onChange={(e) => setConnectorModal({ ...connectorModal, apiKey: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Webhook Endpoint URL
                </label>
                <input
                  type="text"
                  placeholder="https://your-domain.com/api/webhooks/..."
                  value={connectorModal.webhookUrl}
                  onChange={(e) => setConnectorModal({ ...connectorModal, webhookUrl: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setConnectorModal(null)}
                  className="rounded-lg border border-border px-3.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={configureConnectorMutation.isPending}
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                >
                  {configureConnectorMutation.isPending ? "Connecting..." : "Save Connection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
