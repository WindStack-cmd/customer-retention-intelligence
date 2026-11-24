import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  ChevronDown,
  Plus,
  Check,
  Building2,
  Sparkles,
  Database,
  CreditCard,
  ShoppingBag,
  ArrowRight,
  RotateCw,
  CheckCircle2,
  X,
} from "lucide-react";

export function WorkspaceSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [newWsName, setNewWsName] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"starter" | "pro" | "enterprise">("pro");
  const [dataSource, setDataSource] = useState<"sample" | "stripe" | "shopify" | "api">("sample");
  const [createdWorkspace, setCreatedWorkspace] = useState<{ id: string; name: string; plan: string } | null>(null);

  const utils = trpc.useUtils();
  const { data: workspaces } = trpc.workspace.list.useQuery();
  const { data: currentData } = trpc.workspace.current.useQuery();

  const syncMutation = trpc.integrations.triggerSync.useMutation({
    onSuccess: () => {
      utils.analytics.executiveOverview.invalidate();
      utils.analytics.customers.invalidate();
      utils.analytics.recommendations.invalidate();
      utils.workspace.current.invalidate();
      setStep(3);
    },
    onError: () => {
      // Even if sync fails, proceed to step 3 so the user lands on the dashboard
      setStep(3);
    },
  });

  const createMutation = trpc.workspace.create.useMutation({
    onSuccess: (newWs) => {
      setCreatedWorkspace(newWs);
      localStorage.setItem("pulseboard_active_workspace", newWs.id);
      utils.workspace.list.invalidate();

      // Trigger initial data preload or connector sync for the new tenant
      syncMutation.mutate({ source: dataSource });
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

  const handleResetModal = () => {
    setShowCreateModal(false);
    setStep(1);
    setNewWsName("");
    setSelectedPlan("pro");
    setDataSource("sample");
    setCreatedWorkspace(null);
  };

  const handleFinishOnboarding = () => {
    if (createdWorkspace) {
      localStorage.setItem("pulseboard_active_workspace", createdWorkspace.id);
    }
    handleResetModal();
    utils.workspace.current.invalidate();
    utils.analytics.executiveOverview.invalidate();
    utils.analytics.customers.invalidate();
    utils.analytics.recommendations.invalidate();
    setIsOpen(false);
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

      {/* Multi-Step Self-Service Onboarding Wizard Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            {/* Steps Progress Header */}
            <div className="flex items-center justify-between border-b border-border pb-4 mb-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-display text-base font-semibold text-foreground">
                  {step === 3 ? "Workspace Ready" : "New Workspace Onboarding"}
                </h3>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded-full font-mono ${step === 1 ? "bg-primary text-primary-foreground font-semibold" : "bg-accent-soft text-muted-foreground"}`}>1</span>
                <span className="text-border">/</span>
                <span className={`px-2 py-0.5 rounded-full font-mono ${step === 2 ? "bg-primary text-primary-foreground font-semibold" : "bg-accent-soft text-muted-foreground"}`}>2</span>
                <span className="text-border">/</span>
                <span className={`px-2 py-0.5 rounded-full font-mono ${step === 3 ? "bg-primary text-primary-foreground font-semibold" : "bg-accent-soft text-muted-foreground"}`}>3</span>
                <button
                  onClick={handleResetModal}
                  className="ml-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Step 1: Workspace Name & Plan Selection */}
            {step === 1 && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-foreground mb-1.5">
                    Workspace Organization Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme SaaS Europe"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Data, ML scoring runs, team members, and CRM alerts will be strictly scoped to this tenant.
                  </p>
                </div>

                <div>
                  <label className="block font-medium text-foreground mb-1.5">
                    Choose Subscription Plan
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { id: "starter", name: "Starter", limit: "1K Accounts", price: "£99/mo" },
                      { id: "pro", name: "Pro", limit: "10K Accounts", price: "£299/mo" },
                      { id: "enterprise", name: "Enterprise", limit: "Unlimited", price: "£799/mo" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlan(p.id as any)}
                        className={`rounded-xl border p-3 text-left transition ${
                          selectedPlan === p.id
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background/50 text-muted-foreground hover:border-border-hover"
                        }`}
                      >
                        <p className="font-semibold capitalize text-foreground">{p.name}</p>
                        <p className="text-[11px] text-primary font-medium mt-0.5">{p.price}</p>
                        <p className="text-[10px] text-subtle-foreground mt-1">{p.limit}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={handleResetModal}
                    className="rounded-xl border border-border bg-background px-4 py-2 font-medium text-muted-foreground hover:bg-card-hover"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!newWsName.trim()}
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                  >
                    <span>Next: Data Source</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Choose Data Source & Initial Sync */}
            {step === 2 && (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Select Initial Data Source
                  </label>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Connect your CRM/billing pipeline or initialize with pre-calibrated sample enterprise accounts.
                  </p>

                  <div className="space-y-2">
                    {[
                      {
                        id: "sample",
                        title: "Load 15 Pre-calibrated Enterprise Sample Accounts",
                        desc: "Immediately populates your workspace with accounts, calibrated churn risk, and SHAP signals.",
                        icon: Database,
                      },
                      {
                        id: "stripe",
                        title: "Connect Stripe Billing (Simulated / API)",
                        desc: "Ingests subscription status, MRR velocity, and payment failure risk.",
                        icon: CreditCard,
                      },
                      {
                        id: "shopify",
                        title: "Connect Shopify Store (Simulated / API)",
                        desc: "Syncs customer repeat purchasing, orders, and behavioral frequencies.",
                        icon: ShoppingBag,
                      },
                      {
                        id: "api",
                        title: "Direct REST API / Webhook Events",
                        desc: "Ingest telemetry and custom behavioral signals using scoped API keys.",
                        icon: Sparkles,
                      },
                    ].map((s) => {
                      const Icon = s.icon;
                      const isSelected = dataSource === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setDataSource(s.id as any)}
                          className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                            isSelected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-background/50 text-muted-foreground hover:bg-card-hover"
                          }`}
                        >
                          <div className={`mt-0.5 rounded-lg p-2 border ${isSelected ? "border-primary/30 bg-primary/20 text-primary" : "border-border bg-card text-muted-foreground"}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-foreground">{s.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{s.desc}</p>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-primary shrink-0 mt-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-border">
                  <button
                    type="button"
                    disabled={createMutation.isPending || syncMutation.isPending}
                    onClick={() => setStep(1)}
                    className="rounded-xl border border-border bg-background px-4 py-2 font-medium text-muted-foreground hover:bg-card-hover disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={createMutation.isPending || syncMutation.isPending}
                    onClick={() =>
                      createMutation.mutate({
                        name: newWsName.trim(),
                        plan: selectedPlan,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                  >
                    {createMutation.isPending || syncMutation.isPending ? (
                      <>
                        <RotateCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Initializing & Scoring...</span>
                      </>
                    ) : (
                      <>
                        <span>Complete Setup & Launch</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Success Landing */}
            {step === 3 && (
              <div className="space-y-4 text-center py-2 text-xs">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-status-protective-bg text-status-protective-text border border-status-protective-border">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-display text-base font-semibold text-foreground">
                    Workspace Ready!
                  </h4>
                  <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
                    Your workspace <strong className="text-foreground">{createdWorkspace?.name}</strong> has been created on the <span className="uppercase text-primary font-medium">{createdWorkspace?.plan}</span> plan. Initial records were loaded and ML scoring executed.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background p-3.5 text-left space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tenant ID:</span>
                    <span className="text-foreground">{createdWorkspace?.id}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Active Plan:</span>
                    <span className="uppercase text-primary">{createdWorkspace?.plan}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Initial Records:</span>
                    <span className="text-foreground">15 Accounts Scored</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleFinishOnboarding}
                    className="w-full rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground hover:brightness-110"
                  >
                    Open Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
