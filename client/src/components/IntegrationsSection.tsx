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
} from "lucide-react";

export function IntegrationsSection() {
  const utils = trpc.useUtils();
  const { data: status } = trpc.integrations.status.useQuery();
  const { data: apiKeys } = trpc.integrations.apiKeys.useQuery();
  const { data: events } = trpc.integrations.events.useQuery({ limit: 20 });
  const { data: scoringRuns } = trpc.integrations.scoringRuns.useQuery({ limit: 5 });

  const [newKeyName, setNewKeyName] = useState("");
  const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [scoringMessage, setScoringMessage] = useState<string | null>(null);

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
                {status?.stripe.mode || "MOCK MODE"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Syncs invoice renewals, failed charges, refund disputes, and cancellations.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-border">
            <span className="text-[10px] text-subtle-foreground">Synced 2d ago</span>
            <button
              onClick={() => triggerSyncMutation.mutate({ source: "stripe" })}
              disabled={triggerSyncMutation.isPending}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              Sync Now
            </button>
          </div>
        </div>

        {/* Shopify */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xl">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-foreground">Shopify Commerce</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase font-medium text-primary">
                <Radio className="h-2 w-2 text-primary" />
                {status?.shopify.mode || "MOCK MODE"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Ingests customer order history, return quantities, cart abandonments, and CLV.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-border">
            <span className="text-[10px] text-subtle-foreground">Synced 1d ago</span>
            <button
              onClick={() => triggerSyncMutation.mutate({ source: "shopify" })}
              disabled={triggerSyncMutation.isPending}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              Sync Now
            </button>
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
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span>Recent Scoring Runs</span>
        </h4>
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
    </div>
  );
}
