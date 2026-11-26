import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import {
  AIChatBox,
  type Message as AnalystMessage,
} from "@/components/AIChatBox";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { TeamManagement } from "@/components/TeamManagement";
import { IntegrationsSection } from "@/components/IntegrationsSection";
import { RetentionROISection } from "@/components/RetentionROISection";
import { CohortHeatmap } from "@/components/CohortHeatmap";
import { BillingAndSecuritySection } from "@/components/BillingAndSecuritySection";
import { CustomerDrawerEnhancements } from "@/components/CustomerDrawerEnhancements";
import {
  computeActiveSection,
  getVisibleNavIdsForRole,
  type NavSectionId,
} from "@/lib/scrollNav";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  CreditCard,
  Database,
  Grid,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCurrency, formatDate } from "./homeData";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function RiskBadge({
  band,
  probability,
}: {
  band: string;
  probability: number;
}) {
  const styles =
    band === "Urgent"
      ? "border-status-urgent-border bg-status-urgent-bg text-status-urgent-text"
      : band === "High"
        ? "border-status-high-border bg-status-high-bg text-status-high-text"
        : "border-status-medium-border bg-status-medium-bg text-status-medium-text";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles}`}
    >
      <CircleDot className="h-2.5 w-2.5" /> {band} ·{" "}
      {Math.round(probability * 100)}%
    </span>
  );
}

function MetricCard({
  title,
  value,
  note,
  accent,
}: {
  title: string;
  value: string;
  note: string;
  accent: string;
}) {
  return (
    <div className="flex min-h-[142px] flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          {title}
        </p>
        <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
      </div>
      <p className="font-display text-[28px] font-semibold tracking-[-0.04em] text-foreground">
        {value}
      </p>
      <p className="text-[11px] text-subtle-foreground">{note}</p>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      {label}
    </div>
  );
}

const navItemById = {
  overview: { id: "overview" as const, label: "Overview", icon: Activity },
  recommendations: { id: "recommendations" as const, label: "Actions", icon: Sparkles },
  customers: { id: "customers" as const, label: "Customers", icon: UsersRound },
  roi: { id: "roi" as const, label: "Impact/ROI", icon: TrendingUp },
  cohorts: { id: "cohorts" as const, label: "Cohorts", icon: Grid },
  integrations: { id: "integrations" as const, label: "Integrations", icon: Zap },
  team: { id: "team" as const, label: "Team", icon: ShieldCheck },
  billing: { id: "billing" as const, label: "Billing & security", icon: CreditCard },
  metadata: { id: "metadata" as const, label: "Data & model", icon: Database },
};

const adminNavIds = new Set<NavSectionId>(["integrations", "team", "billing"]);
const allNavItems = Object.values(navItemById);

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const currentWorkspaceQuery = trpc.workspace.current.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
  });
  const memberRole = currentWorkspaceQuery.data?.role;
  const isAdmin = user?.role === "admin" || memberRole === "admin";
  const isCsm = memberRole === "csm";
  const isViewer = memberRole === "viewer";
  const visibleNavIds = getVisibleNavIdsForRole(
    memberRole,
    user?.role === "admin"
  );
  const topMainNavItems = visibleNavIds
    .filter(id => !adminNavIds.has(id) && id !== "metadata")
    .map(id => navItemById[id]);
  const adminNavItems = visibleNavIds
    .filter(id => adminNavIds.has(id))
    .map(id => navItemById[id]);
  const footerNavItems = visibleNavIds
    .filter(id => id === "metadata")
    .map(id => navItemById[id]);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [riskFilter, setRiskFilter] = useState<"all" | "urgent" | "high">(
    "all"
  );
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [activeNav, setActiveNav] = useState(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.replace("#", "");
      if (allNavItems.some(item => item.id === hash)) {
        return hash;
      }
    }
    return "overview";
  });

  const isClickLockedRef = useRef(false);
  const clickLockTimeoutRef = useRef<number | null>(null);

  const unlockClick = useCallback(() => {
    if (clickLockTimeoutRef.current !== null) {
      window.clearTimeout(clickLockTimeoutRef.current);
      clickLockTimeoutRef.current = null;
    }
    isClickLockedRef.current = false;
  }, []);

  const handleNavClick = useCallback(
    (id: string) => {
      setActiveNav(id);
      setMobileNav(false);
      isClickLockedRef.current = true;

      if (clickLockTimeoutRef.current !== null) {
        window.clearTimeout(clickLockTimeoutRef.current);
      }

      const onScrollEnd = () => {
        window.removeEventListener("scrollend", onScrollEnd);
        unlockClick();
      };

      if ("onscrollend" in window) {
        window.addEventListener("scrollend", onScrollEnd, { once: true });
      }

      clickLockTimeoutRef.current = window.setTimeout(() => {
        window.removeEventListener("scrollend", onScrollEnd);
        unlockClick();
      }, 800);
    },
    [unlockClick]
  );

  useEffect(() => {
    // Initial sync on mount if location.hash is set
    if (typeof window !== "undefined" && window.location.hash) {
      const initialHash = window.location.hash.replace("#", "");
      if (allNavItems.some(item => item.id === initialHash)) {
        isClickLockedRef.current = true;
        const el = document.getElementById(initialHash);
        if (el) {
          el.scrollIntoView();
        }
        clickLockTimeoutRef.current = window.setTimeout(() => {
          isClickLockedRef.current = false;
        }, 500);
      }
    }

    const handleHashOrPopState = () => {
      if (isClickLockedRef.current) return;
      const hash = window.location.hash.replace("#", "");
      const targetId = allNavItems.some(item => item.id === hash)
        ? hash
        : allNavItems[0].id;
      setActiveNav(targetId);

      const el = document.getElementById(targetId);
      if (el) {
        isClickLockedRef.current = true;
        el.scrollIntoView({ behavior: "smooth" });
        const onScrollEnd = () => {
          window.removeEventListener("scrollend", onScrollEnd);
          unlockClick();
        };
        if ("onscrollend" in window) {
          window.addEventListener("scrollend", onScrollEnd, { once: true });
        }
        if (clickLockTimeoutRef.current !== null) {
          window.clearTimeout(clickLockTimeoutRef.current);
        }
        clickLockTimeoutRef.current = window.setTimeout(() => {
          window.removeEventListener("scrollend", onScrollEnd);
          unlockClick();
        }, 800);
      }
    };

    window.addEventListener("hashchange", handleHashOrPopState);
    window.addEventListener("popstate", handleHashOrPopState);

    let rafId: number | null = null;

    const updateActiveSectionOnScroll = () => {
      if (isClickLockedRef.current) return;

      const scrollY = window.scrollY || window.pageYOffset;
      const viewportHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      const sections = visibleNavIds
        .map(id => {
          const el = document.getElementById(id);
          if (!el) return null;
          return {
            id,
            top: el.getBoundingClientRect().top + scrollY,
          };
        })
        .filter((item): item is { id: NavSectionId; top: number } => item !== null);

      const nextActiveId = computeActiveSection({
        sections,
        visibleIds: visibleNavIds,
        scrollY,
        viewportHeight,
        documentHeight,
      });

      if (nextActiveId) {
        setActiveNav(prev => (prev === nextActiveId ? prev : nextActiveId));
      }
    };

    const onScrollOrResize = () => {
      if (isClickLockedRef.current) return;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateActiveSectionOnScroll();
      });
    };

    const handleUserInterruption = () => {
      if (isClickLockedRef.current) {
        unlockClick();
      }
    };

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    window.addEventListener("wheel", handleUserInterruption, { passive: true });
    window.addEventListener("touchmove", handleUserInterruption, {
      passive: true,
    });

    return () => {
      window.removeEventListener("hashchange", handleHashOrPopState);
      window.removeEventListener("popstate", handleHashOrPopState);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("wheel", handleUserInterruption);
      window.removeEventListener("touchmove", handleUserInterruption);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (clickLockTimeoutRef.current !== null) {
        window.clearTimeout(clickLockTimeoutRef.current);
      }
    };
  }, [unlockClick, isAdmin, isCsm, isViewer]);
  const [analystMessages, setAnalystMessages] = useState<AnalystMessage[]>([
    {
      role: "assistant",
      content:
        "I answer only from verified retention records. Ask about churn risk, priority customers, revenue at risk, CLV, SHAP signals, or existing recommendations.",
    },
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchDraft.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const enabled = Boolean(user);
  const canViewCustomers = isAdmin || isCsm;
  const canViewAnalyst = !isViewer;

  const overview = trpc.analytics.executiveOverview.useQuery(undefined, {
    enabled,
    retry: false,
  });
  const customers = trpc.analytics.customers.useQuery(
    {
      page,
      pageSize: 10,
      search,
      minRisk:
        riskFilter === "urgent"
          ? 0.8
          : riskFilter === "high"
            ? 0.65
            : undefined,
    },
    { enabled: enabled && canViewCustomers, retry: false }
  );
  const recommendations = trpc.analytics.recommendations.useQuery(
    { page: 1, pageSize: 5 },
    { enabled: enabled && canViewCustomers, retry: false }
  );
  const detail = trpc.analytics.customerDetail.useQuery(
    { customerId: selectedCustomer ?? 1 },
    { enabled: enabled && canViewCustomers && selectedCustomer !== null, retry: false }
  );

  const { data: analystQuota, refetch: refetchQuota } =
    trpc.analyst.quota.useQuery(undefined, {
      enabled: enabled && canViewAnalyst,
      retry: false,
    });

  const analyst = trpc.analyst.ask.useMutation({
    onSuccess: result => {
      refetchQuota();
      setAnalystMessages(current => [
        ...current,
        {
          role: "assistant",
          content: `${result.answer}\n\nSources: ${result.sources.join(", ")}\nScope: ${result.scope} · cutoff: ${formatDate(result.cutoffAt)} · model: ${result.model}`,
        },
      ]);
    },
    onError: error => {
      setAnalystMessages(current => [
        ...current,
        {
          role: "assistant",
          content:
            error.message ||
            "The grounded analyst is temporarily unavailable. Executive KPIs and customer recommendations remain accessible.",
        },
      ]);
      if (
        error.message?.includes("limit reached") ||
        error.data?.code === "TOO_MANY_REQUESTS"
      ) {
        setUpgradeModalOpen(true);
      }
    },
  });

  const askAnalyst = (question: string) => {
    setAnalystMessages(current => [
      ...current,
      { role: "user", content: question },
    ]);
    analyst.mutate({ question });
  };

  if (authLoading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Checking workspace access…
      </div>
    );
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-foreground">
        <div className="max-w-md">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold text-foreground">
            Sign in to Revenue Intelligence
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Phase 10 uses protected production APIs backed by the verified
            customer, model, explanation, value, and recommendation records.
          </p>
          <button
            onClick={() => startLogin()}
            className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary-hover"
          >
            Sign in to continue
          </button>
        </div>
      </div>
    );
  }

  const summary = overview.data?.summary;
  const metadata = overview.data?.metadata;
  const totalPages = customers.data
    ? Math.max(1, Math.ceil(customers.data.total / customers.data.pageSize))
    : 1;
  const priorityBands = overview.data?.priorityBands ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[238px] border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex h-[78px] items-center gap-3 border-b border-border px-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-display text-[15px] font-bold text-foreground">
              pulseboard
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[.19em] text-subtle-foreground">
              Revenue intelligence
            </span>
          </span>
        </div>
        <div className="px-3 pt-4 shrink-0">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[.2em] text-subtle-foreground">
            Workspace
          </p>
          <WorkspaceSwitcher />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          {topMainNavItems.map(item => {
            const isActive = activeNav === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => handleNavClick(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                  isActive
                    ? "bg-accent-soft text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <item.icon
                  className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                {item.label}
              </a>
            );
          })}

          {isAdmin && (
            <div className="pt-4">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-subtle-foreground">
                Admin
              </p>
              <div className="space-y-1">
                {adminNavItems.map(item => {
                  const isActive = activeNav === item.id;
                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={() => handleNavClick(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                        isActive
                          ? "bg-accent-soft text-foreground font-semibold"
                          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      }`}
                    >
                      <item.icon
                        className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                          isActive ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                      {item.label}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {footerNavItems.length > 0 && (
            <div className="pt-2">
              {footerNavItems.map(item => {
                const isActive = activeNav === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                      isActive
                        ? "bg-accent-soft text-foreground font-semibold"
                        : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <item.icon
                      className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                        isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    {item.label}
                  </a>
                );
              })}
            </div>
          )}
        </nav>
        <div className="mt-auto shrink-0 border-t border-border p-4 bg-surface-2/40">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 border border-border text-xs font-bold text-foreground">
              {(user.name ?? "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">
                {user.name ?? "Workspace user"}
              </p>
              <p className="truncate text-[11px] text-subtle-foreground">
                {user.role}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[238px]">
        <header className="sticky top-0 z-30 flex h-[78px] items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNav(!mobileNav)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-surface-hover hover:text-foreground lg:hidden transition-colors"
              aria-label="Toggle navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="font-display text-lg font-semibold tracking-[-.03em] text-foreground">
                Good morning{user.name ? `, ${user.name.split(" ")[0]}` : ""}{" "}
                <span className="hidden text-foreground sm:inline font-medium">
                  — here’s the pulse.
                </span>
              </p>
              <p className="mt-0.5 text-xs text-subtle-foreground">
                {currentWorkspaceQuery.data?.workspace?.id === "ws_default"
                  ? "Production workspace · protected API data"
                  : `${currentWorkspaceQuery.data?.workspace?.name ?? "Workspace"} · sample data`}
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] font-semibold text-foreground sm:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                currentWorkspaceQuery.data?.workspace?.id === "ws_default"
                  ? "bg-primary"
                  : "bg-status-medium-text"
              }`}
            />{" "}
            {currentWorkspaceQuery.data?.workspace?.id === "ws_default"
              ? "Real records"
              : "Sample data"}
          </div>
        </header>
        {mobileNav && (
          <div className="absolute inset-x-0 top-[78px] z-20 border-b border-border bg-card p-4 shadow-2xl lg:hidden">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[.18em] text-subtle-foreground">
              <span>Workspace</span>
              <button
                onClick={() => setMobileNav(false)}
                aria-label="Close navigation"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3">
              <WorkspaceSwitcher />
            </div>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {topMainNavItems.map(item => {
                const isActive = activeNav === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                      isActive
                        ? "bg-accent-soft text-foreground font-semibold"
                        : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <item.icon
                      className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                        isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    {item.label}
                  </a>
                );
              })}

              {isAdmin && (
                <div className="pt-3">
                  <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-subtle-foreground">
                    Admin
                  </p>
                  <div className="space-y-1">
                    {adminNavItems.map(item => {
                      const isActive = activeNav === item.id;
                      return (
                        <a
                          key={item.id}
                          href={`#${item.id}`}
                          onClick={() => handleNavClick(item.id)}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                            isActive
                              ? "bg-accent-soft text-foreground font-semibold"
                              : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                          }`}
                        >
                          <item.icon
                            className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                              isActive ? "text-primary" : "text-muted-foreground"
                            }`}
                          />
                          {item.label}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {footerNavItems.map(item => {
                const isActive = activeNav === item.id;
                return (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                      isActive
                        ? "bg-accent-soft text-foreground font-semibold"
                        : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <item.icon
                      className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                        isActive ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 sm:py-9">
          <section
            id="overview"
            className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
          >
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.15em] text-foreground">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      currentWorkspaceQuery.data?.workspace?.id === "ws_default"
                        ? "bg-primary"
                        : "bg-status-medium-text"
                    }`}
                  />{" "}
                  {currentWorkspaceQuery.data?.workspace?.id === "ws_default"
                    ? "Production data"
                    : "Sample data"}
                </span>
                <span className="text-[11px] text-subtle-foreground">
                  30-day behavioral horizon · cutoff{" "}
                  {formatDate(metadata?.cutoffAt ?? null)}
                </span>
              </div>
              <h1 className="font-display text-[30px] font-semibold tracking-[-.055em] sm:text-[36px] text-foreground">
                Retention overview
              </h1>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">
                Prioritize customers using verified churn risk, customer value,
                revenue exposure, and explainable signals.
              </p>
            </div>
          </section>

          {overview.isLoading ? (
            <LoadingState label="Loading executive intelligence…" />
          ) : overview.isError || !summary ? (
            <div className="rounded-2xl border border-status-urgent-border bg-status-urgent-bg p-5 text-sm text-status-urgent-text">
              Executive metrics are temporarily unavailable. No demo values are
              shown.
            </div>
          ) : (
            <section
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              aria-label="Key metrics"
            >
              <MetricCard
                title="Customers scored"
                value={formatNumber(summary.customerCount)}
                note="Recommendation cohort"
                accent="bg-primary"
              />
              <MetricCard
                title="Average churn risk"
                value={`${Math.round(summary.averageChurnProbability * 100)}%`}
                note="Calibrated probability"
                accent="bg-status-urgent-text"
              />
              <MetricCard
                title="Revenue at risk"
                value={formatCurrency(summary.totalRevenueAtRisk, true)}
                note="Model-derived exposure"
                accent="bg-status-high-text"
              />
              <MetricCard
                title="Behavioral CLV"
                value={formatCurrency(summary.totalBehavioralClv, true)}
                note="Signed historical + forward value"
                accent="bg-primary"
              />
            </section>
          )}

          {canViewAnalyst && (
            <section
              id="analyst"
              className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6"
            >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-[17px] font-semibold text-foreground">
                    Grounded AI analyst
                  </h2>
                  <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.13em] text-foreground">
                    Read only
                  </span>
                  {analystQuota && (
                    <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                      {analystQuota.limit >= 999999
                        ? `Unlimited queries (${analystQuota.plan})`
                        : `${analystQuota.remaining} of ${analystQuota.limit} queries left today (${analystQuota.plan})`}
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-subtle-foreground">
                  Answers use approved production records and include scope,
                  cutoff, and model provenance. No intervention uplift is
                  inferred.
                </p>
              </div>
              <BrainCircuit className="h-5 w-5 text-primary-text" />
            </div>
            <AIChatBox
              messages={analystMessages}
              onSendMessage={askAnalyst}
              isLoading={analyst.isPending}
              height={360}
              placeholder="Ask about risk, churn reasons, CLV, revenue at risk…"
              emptyStateMessage="Ask the retention analyst"
              suggestedPrompts={[
                "Which customers are highest priority?",
                "What are the main reasons for churn risk?",
                "How much revenue is at risk?",
              ]}
              className="border-border bg-surface-2"
            />
            </section>
          )}

          {canViewCustomers && (
            <>
              <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
            <div
              id="recommendations"
              className="rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-[17px] font-semibold text-foreground">
                    Priority distribution
                  </h2>
                  <p className="mt-1 text-xs text-subtle-foreground">
                    Recommendations grouped by verified priority
                  </p>
                </div>
                <Sparkles className="h-4 w-4 text-primary-text" />
              </div>
              <div className="mt-6 space-y-5">
                {priorityBands.map(band => (
                  <div key={band.priorityBand}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        {band.priorityBand}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatNumber(band.customerCount)} ·{" "}
                        {formatCurrency(band.revenueAtRisk, true)} exposed
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={`h-full rounded-full ${band.priorityBand === "Urgent" ? "bg-status-urgent-text" : band.priorityBand === "High" ? "bg-status-high-text" : "bg-primary"}`}
                        style={{
                          width: `${summary ? Math.min(100, (band.customerCount / summary.customerCount) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-border bg-surface-2 p-3.5 text-[11px] leading-5 text-muted-foreground">
                Risk and value are model outputs. Recommendations do not claim
                experimental uplift or guaranteed savings.
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-[17px] font-semibold text-foreground">
                    Next best actions
                  </h2>
                  <p className="mt-1 text-xs text-subtle-foreground">
                    Highest-priority persisted recommendations
                  </p>
                </div>
                <BrainCircuit className="h-4 w-4 text-primary-text" />
              </div>
              {recommendations.isLoading ? (
                <div className="mt-6 text-sm text-muted-foreground">
                  Loading actions…
                </div>
              ) : recommendations.isError ? (
                <div className="mt-6 text-sm text-status-urgent-text">
                  Recommendations unavailable.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {recommendations.data?.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedCustomer(item.customerId)}
                      className="w-full rounded-xl border border-border bg-surface-2 p-3 text-left transition hover:border-primary/40 hover:bg-surface-hover"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {item.recommendedAction}
                        </span>
                        <RiskBadge
                          band={item.priorityBand}
                          probability={Number(
                            item.supportingSignals.calibratedChurnProbability ??
                              0
                          )}
                        />
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
                        {item.rationale}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section
            id="customers"
            className="mt-5 rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-[17px] font-semibold text-foreground">
                    Priority customers
                  </h2>
                  <span className="rounded-md bg-surface-2 border border-border px-1.5 py-0.5 text-[10px] font-bold text-foreground">
                    {customers.data?.total ?? 0} total
                  </span>
                </div>
                <p className="mt-1 text-xs text-subtle-foreground">
                  Search and page through real recommendation records
                </p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  aria-label="Search customers"
                  value={searchDraft}
                  onChange={event => setSearchDraft(event.target.value)}
                  placeholder="Search customer or country"
                  className="h-9 w-[210px] rounded-lg border border-border bg-surface-2 pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-subtle-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-colors"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 sm:px-6">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[.15em] text-subtle-foreground">
                Risk
              </span>
              {(["all", "urgent", "high"] as const).map(filter => (
                <button
                  key={filter}
                  onClick={() => {
                    setRiskFilter(filter);
                    setPage(1);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize transition-all ${
                    riskFilter === filter
                      ? "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm"
                      : "bg-surface-2 text-muted-foreground border border-border hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {filter === "all"
                    ? "All"
                    : filter === "urgent"
                      ? "Urgent only"
                      : "High + urgent"}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              {customers.isLoading ? (
                <div className="p-8">
                  <LoadingState label="Loading customers…" />
                </div>
              ) : customers.isError ? (
                <div className="p-8 text-sm text-status-urgent-text">
                  Customer records are temporarily unavailable. No synthetic
                  fallback is shown.
                </div>
              ) : (
                <table className="w-full min-w-[850px] text-left">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/40 text-[10px] font-bold uppercase tracking-[.15em] text-subtle-foreground">
                      <th className="px-5 py-3.5 font-semibold sm:px-6">
                        Customer
                      </th>
                      <th className="px-4 py-3.5 font-semibold">Risk</th>
                      <th className="px-4 py-3.5 font-semibold">
                        Revenue at risk
                      </th>
                      <th className="px-4 py-3.5 font-semibold">Action</th>
                      <th className="px-4 py-3.5 font-semibold">
                        Last activity
                      </th>
                      <th className="px-4 py-3.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {customers.data?.items.map(item => (
                      <tr
                        key={item.customerId}
                        onClick={() => setSelectedCustomer(item.customerId)}
                        className="group cursor-pointer border-b border-border/50 text-xs transition last:border-0 hover:bg-surface-hover"
                      >
                        <td className="px-5 py-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 border border-border text-[10px] font-bold text-foreground">
                              {item.sourceCustomerId.slice(-2)}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">
                                Customer {item.sourceCustomerId}
                              </p>
                              <p className="mt-0.5 text-[11px] text-subtle-foreground">
                                {item.country ?? "Country not recorded"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <RiskBadge
                            band={item.priorityBand}
                            probability={item.calibratedChurnProbability}
                          />
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-semibold tabular-nums text-foreground">
                            {formatCurrency(item.revenueAtRisk)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-subtle-foreground">
                            CLV {formatCurrency(item.behavioralClv, true)}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-1.5 text-primary-text font-medium">
                            <Sparkles className="h-3.5 w-3.5" />
                            {item.recommendedAction}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground">
                          {formatDate(item.lastActivityAt)}
                        </td>
                        <td className="px-4 py-4">
                          <ChevronRight className="h-4 w-4 text-subtle-foreground transition group-hover:translate-x-0.5 group-hover:text-primary-text" />
                        </td>
                      </tr>
                    ))}
                    {customers.data?.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-12 text-center text-sm text-muted-foreground"
                        >
                          No customers match these filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage(value => Math.max(1, value - 1))}
                  className="rounded-lg border border-border bg-surface-2 p-2 text-foreground hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  aria-label="Next page"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage(value => Math.min(totalPages, value + 1))
                  }
                  className="rounded-lg border border-border bg-surface-2 p-2 text-foreground hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </section>
            </>
          )}

          {/* Phase 3: Retention Outcome & ROI Tracking */}
          <section id="roi" className="mt-8">
            <RetentionROISection />
          </section>

          {/* Phase 4: Cohort Retention Analytics */}
          <section id="cohorts" className="mt-8">
            <CohortHeatmap />
          </section>

          {/* Phase 2: Ingestion & Connectors, Team, Billing - Admin only */}
          {isAdmin && (
            <>
              <section id="integrations" className="mt-8">
                <IntegrationsSection />
              </section>

              <section id="team" className="mt-8">
                <TeamManagement />
              </section>

              <section id="billing" className="mt-8">
                <BillingAndSecuritySection />
              </section>
            </>
          )}

          {/* Data & model provenance - Kept for Admin, CSM, Analyst; hidden for Viewer */}
          {!isViewer && (
            <section
              id="metadata"
              className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-[11px] text-muted-foreground sm:px-6"
            >
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary-text" />
                <span>Dataset: {metadata?.datasetName ?? "Unavailable"}</span>
                <span className="text-subtle-foreground">·</span>
                <span>Model: {metadata?.modelVersion ?? "Unavailable"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>
                  Feature version: {metadata?.featureVersion ?? "Unavailable"}
                </span>
                <span className="text-subtle-foreground">·</span>
                <span>Cutoff: {formatDate(metadata?.cutoffAt ?? null)}</span>
              </div>
            </section>
          )}
        </main>
      </div>

      {selectedCustomer !== null && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Customer detail"
        >
          <button
            className="absolute inset-0 cursor-default"
            aria-label="Close customer detail"
            onClick={() => setSelectedCustomer(null)}
          />
          <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card p-5 shadow-2xl sm:p-7">
            {detail.isLoading ? (
              <LoadingState label="Loading customer intelligence…" />
            ) : detail.isError || !detail.data ? (
              <div className="text-sm text-status-urgent-text">
                Customer detail is unavailable.
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-subtle-foreground">
                      Customer detail
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-foreground">
                      Customer {detail.data.customer.sourceCustomerId}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {detail.data.customer.country ?? "Country not recorded"} ·
                      last activity{" "}
                      {formatDate(detail.data.customer.lastActivityAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    aria-label="Close detail"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-surface-2 p-4">
                    <p className="text-[11px] text-subtle-foreground">
                      Churn probability
                    </p>
                    <p className="mt-2 font-display text-2xl font-semibold text-status-urgent-text">
                      {Math.round(
                        detail.data.predictionAndValue
                          .calibratedChurnProbability * 100
                      )}
                      %
                    </p>
                    <p className="mt-1 text-[10px] text-subtle-foreground">
                      {detail.data.predictionAndValue.predictionVersion}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-2 p-4">
                    <p className="text-[11px] text-subtle-foreground">
                      Revenue at risk
                    </p>
                    <p className="mt-2 font-display text-2xl font-semibold text-status-high-text">
                      {formatCurrency(
                        detail.data.predictionAndValue.revenueAtRisk,
                        true
                      )}
                    </p>
                    <p className="mt-1 text-[10px] text-subtle-foreground">
                      Behavioral CLV{" "}
                      {formatCurrency(
                        detail.data.predictionAndValue.behavioralClv,
                        true
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-foreground">
                      {detail.data.recommendation.recommendedAction}
                    </span>
                    <RiskBadge
                      band={detail.data.recommendation.priorityBand}
                      probability={
                        detail.data.predictionAndValue
                          .calibratedChurnProbability
                      }
                    />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {detail.data.recommendation.rationale}
                  </p>
                  <p className="mt-3 text-[11px] text-subtle-foreground">
                    {detail.data.recommendation.benefitEvidence}
                  </p>
                </div>
                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold text-foreground">
                      SHAP explanations
                    </h3>
                    <span className="text-[10px] text-subtle-foreground">
                      Actual persisted contributions
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {detail.data.explanations.map(explanation => (
                      <div
                        key={`${explanation.featureName}-${explanation.rank}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs"
                      >
                        <span className="truncate text-foreground">
                          {explanation.featureName}
                        </span>
                        <span
                          className={
                            explanation.shapValue >= 0
                              ? "text-status-urgent-text font-medium"
                              : "text-status-protective-text font-medium"
                          }
                        >
                          {explanation.shapValue >= 0 ? "+" : ""}
                          {explanation.shapValue.toFixed(3)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
                  <div>
                    <span className="text-subtle-foreground">Orders</span>
                    <p className="mt-1 font-semibold text-foreground">
                      {formatNumber(detail.data.features.totalOrders)}
                    </p>
                  </div>
                  <div>
                    <span className="text-subtle-foreground">
                      Inactive days
                    </span>
                    <p className="mt-1 font-semibold text-foreground">
                      {formatNumber(detail.data.features.inactiveDays)}
                    </p>
                  </div>
                  <div>
                    <span className="text-subtle-foreground">Net value</span>
                    <p className="mt-1 font-semibold text-foreground">
                      {formatCurrency(detail.data.features.totalNetValue)}
                    </p>
                  </div>
                  <div>
                    <span className="text-subtle-foreground">Return rate</span>
                    <p className="mt-1 font-semibold text-foreground">
                      {(detail.data.features.returnRate * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                <CustomerDrawerEnhancements
                  customerId={selectedCustomer}
                  sourceCustomerId={detail.data.customer.sourceCustomerId}
                />

                <div className="mt-6 border-t border-border pt-4 text-[10px] leading-5 text-subtle-foreground">
                  Feature cutoff {formatDate(detail.data.features.cutoffAt)} ·
                  Model run {detail.data.recommendation.modelRunId} ·
                  Explanation run {detail.data.recommendation.explanationRunId}{" "}
                  · Value run {detail.data.recommendation.valueRunId}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {upgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-status-urgent-text">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-display text-base font-semibold text-foreground">
                Plan Limit Reached
              </h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              You have reached the usage limit for your current workspace plan. Upgrade your plan to increase customer scoring capacity and AI analyst query quotas.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setUpgradeModalOpen(false)}
                className="rounded-lg border border-border px-3.5 py-1.5 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setUpgradeModalOpen(false);
                  const el = document.getElementById("billing");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Upgrade Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
