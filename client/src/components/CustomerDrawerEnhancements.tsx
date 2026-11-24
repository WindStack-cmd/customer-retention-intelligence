import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Send,
  MessageSquare,
  Clock,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileText,
} from "lucide-react";

export function CustomerDrawerEnhancements({
  customerId,
  sourceCustomerId,
}: {
  customerId: number;
  sourceCustomerId: string;
}) {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"journey" | "shap" | "notes" | "playbook">("journey");
  const [newNote, setNewNote] = useState("");
  const [selectedPlaybook, setSelectedPlaybook] = useState("winback-discount-15");
  const [customIncentive, setCustomIncentive] = useState("WINBACK15");
  const [playbookStatus, setPlaybookStatus] = useState<string | null>(null);

  const { data: timeline } = trpc.analytics.journeyTimeline.useQuery({ customerId });
  const { data: shapData } = trpc.analytics.shapWaterfall.useQuery({ customerId });
  const { data: notes } = trpc.actions.notes.useQuery({ customerId });
  const { data: playbooks } = trpc.actions.playbooks.useQuery();

  const addNoteMutation = trpc.actions.addNote.useMutation({
    onSuccess: () => {
      setNewNote("");
      utils.actions.notes.invalidate({ customerId });
      utils.analytics.journeyTimeline.invalidate({ customerId });
    },
  });

  const executePlaybookMutation = trpc.actions.executePlaybook.useMutation({
    onSuccess: (res) => {
      setPlaybookStatus(`Playbook dispatched! Message ID: ${res.messageId}`);
      utils.actions.interventions.invalidate();
      utils.actions.roiSummary.invalidate();
      utils.analytics.journeyTimeline.invalidate({ customerId });
      setTimeout(() => setPlaybookStatus(null), 5000);
    },
  });

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    addNoteMutation.mutate({ customerId, note: newNote.trim() });
  };

  const handleExecutePlaybook = (e: React.FormEvent) => {
    e.preventDefault();
    executePlaybookMutation.mutate({
      customerId,
      sourceCustomerId,
      playbookType: selectedPlaybook,
      incentiveCode: customIncentive,
      recipientEmail: `customer-${sourceCustomerId}@company.com`,
    });
  };

  return (
    <div className="mt-6 border-t border-border pt-6">
      {/* Tab Navigation */}
      <div className="flex border-b border-border text-xs mb-4">
        {[
          { id: "journey", label: "Journey Timeline", icon: Clock },
          { id: "shap", label: "SHAP Waterfall", icon: Sparkles },
          { id: "notes", label: `Notes (${notes?.length || 0})`, icon: MessageSquare },
          { id: "playbook", label: "Trigger Playbook", icon: Send },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-2 font-medium border-b-2 transition ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Journey Timeline */}
      {activeTab === "journey" && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground mb-3">
            Chronological audit trail of orders, scoring updates, notes, and retention interventions.
          </p>
          <div className="relative pl-6 space-y-4 before:absolute before:bottom-2 before:left-2.5 before:top-2 before:w-[2px] before:bg-border">
            {timeline?.map((ev) => (
              <div key={ev.id} className="relative">
                <span className="absolute -left-6 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary ring-4 ring-card" />
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-foreground">{ev.title}</span>
                  {ev.badge && (
                    <span className="rounded bg-accent-soft px-1.5 py-0.2 text-[9px] font-semibold text-primary uppercase">
                      {ev.badge}
                    </span>
                  )}
                  <span className="text-[10px] text-subtle-foreground ml-auto">{ev.date}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: SHAP Waterfall */}
      {activeTab === "shap" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Baseline Prior Churn Rate:</span>
            <span className="font-mono font-medium text-foreground">
              {Math.round((shapData?.baseValue || 0.32) * 100)}%
            </span>
          </div>

          <div className="space-y-2">
            {shapData?.features.map((feat) => {
              const isRisk = feat.direction === "risk";
              return (
                <div key={feat.name} className="rounded-xl border border-border bg-background p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{feat.name}</span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        isRisk ? "text-status-urgent-text" : "text-status-protective-text"
                      }`}
                    >
                      {feat.shapValue > 0 ? `+${(feat.shapValue * 100).toFixed(1)}%` : `${(feat.shapValue * 100).toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isRisk ? "bg-status-urgent-border" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, Math.abs(feat.shapValue) * 300)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-subtle-foreground">
                      Cumulative: {Math.round(feat.cumulative * 100)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-border">
            <span className="font-semibold text-foreground">Calibrated Churn Probability:</span>
            <span className="font-mono font-bold text-status-urgent-text text-sm">
              {Math.round((shapData?.finalValue || 0.7) * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Tab 3: Customer Notes */}
      {activeTab === "notes" && (
        <div className="space-y-4">
          <form onSubmit={handleAddNote} className="space-y-2">
            <textarea
              required
              rows={2}
              placeholder="Add CSM note (e.g. Discussed renewal discounts with CFO...)"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={addNoteMutation.isPending}
                className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
              >
                {addNoteMutation.isPending ? "Saving..." : "Add Note"}
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {notes?.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No CSM notes recorded yet.</p>
            ) : (
              notes?.map((n) => (
                <div key={n.id} className="rounded-xl border border-border bg-background p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-foreground">{n.authorName}</span>
                    <span className="text-[10px] text-subtle-foreground">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{n.note}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Trigger Retention Playbook */}
      {activeTab === "playbook" && (
        <form onSubmit={handleExecutePlaybook} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Select Retention Playbook
            </label>
            <select
              value={selectedPlaybook}
              onChange={(e) => setSelectedPlaybook(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
            >
              {playbooks?.map((pb) => (
                <option key={pb.id} value={pb.id}>
                  {pb.name} ({pb.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Incentive / Voucher Code
            </label>
            <input
              type="text"
              value={customIncentive}
              onChange={(e) => setCustomIncentive(e.target.value)}
              placeholder="e.g. WINBACK15"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Target Email Address
            </label>
            <input
              type="email"
              disabled
              value={`customer-${sourceCustomerId}@client-domain.com`}
              className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-muted-foreground opacity-75"
            />
          </div>

          {playbookStatus && (
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-primary flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{playbookStatus}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={executePlaybookMutation.isPending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{executePlaybookMutation.isPending ? "Dispatching Offer..." : "Execute Playbook Now"}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
