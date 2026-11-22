import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronDown, Plus, Check, Building2, Sparkles } from "lucide-react";

export function WorkspaceSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"starter" | "pro" | "enterprise">("pro");

  const utils = trpc.useUtils();
  const { data: workspaces } = trpc.workspace.list.useQuery();
  const { data: currentData } = trpc.workspace.current.useQuery();

  const createMutation = trpc.workspace.create.useMutation({
    onSuccess: (newWs) => {
      localStorage.setItem("pulseboard_active_workspace", newWs.id);
      setShowCreateModal(false);
      setNewWsName("");
      utils.workspace.list.invalidate();
      utils.workspace.current.invalidate();
      utils.analytics.executiveOverview.invalidate();
      utils.analytics.customers.invalidate();
      utils.analytics.recommendations.invalidate();
      setIsOpen(false);
    },
  });

  const activeWorkspace = currentData?.workspace;
  const userRole = currentData?.role || "viewer";

  const handleSelectWorkspace = (id: string) => {
    localStorage.setItem("pulseboard_active_workspace", id);
    setIsOpen(false);
    utils.workspace.current.invalidate();
    utils.analytics.executiveOverview.invalidate();
    utils.analytics.customers.invalidate();
    utils.analytics.recommendations.invalidate();
    utils.integrations.events.invalidate();
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    createMutation.mutate({ name: newWsName.trim(), plan: selectedPlan });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-left transition hover:border-primary/50 hover:bg-card"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">
              {activeWorkspace?.name || "Pulseboard Workspace"}
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="uppercase tracking-wider text-primary font-medium">
                {activeWorkspace?.plan || "PRO"}
              </span>
              <span>•</span>
              <span className="capitalize">{userRole}</span>
            </div>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-border bg-card p-1.5 shadow-2xl backdrop-blur-md">
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-subtle-foreground">
            Workspaces
          </div>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {workspaces?.map((w) => {
              const isActive = w.id === activeWorkspace?.id;
              return (
                <button
                  key={w.id}
                  onClick={() => handleSelectWorkspace(w.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition ${
                    isActive
                      ? "bg-accent-soft text-foreground font-medium"
                      : "text-muted-foreground hover:bg-card-hover hover:text-foreground"
                  }`}
                >
                  <div className="truncate text-left">
                    <p className="truncate">{w.name}</p>
                    <span className="text-[10px] text-subtle-foreground uppercase">{w.plan}</span>
                  </div>
                  {isActive && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="mt-1 border-t border-border pt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                setShowCreateModal(true);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-primary transition hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Workspace</span>
            </button>
          </div>
        </div>
      )}

      {/* Create Workspace Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-foreground font-semibold text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              <span>Create New Workspace</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Workspaces isolate customer data, models, retention playbooks, and integrations.
            </p>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corp EU"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Plan Tier
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["starter", "pro", "enterprise"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelectedPlan(p)}
                      className={`rounded-lg border px-3 py-2 text-center text-xs capitalize transition ${
                        selectedPlan === p
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-border-hover"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-card-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
                >
                  {createMutation.isPending ? "Creating..." : "Create Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
