import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import {
  AIChatBox,
  type Message as AnalystMessage,
} from "@/components/AIChatBox";
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
  Database,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
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
      ? "border-[#6b3838] bg-[#321d20] text-[#ffaaa0]"
      : band === "High"
        ? "border-[#6b5731] bg-[#312717] text-[#f7c978]"
        : "border-[#285244] bg-[#142d25] text-[#8ee6be]";
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
    <div className="flex min-h-[142px] flex-col justify-between rounded-2xl border border-[#1c3930] bg-[#0d1b18] p-5 shadow-[0_16px_45px_rgba(0,0,0,.12)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-[#8ba69b]">
          {title}
        </p>
        <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
      </div>
      <p className="font-display text-[28px] font-semibold tracking-[-0.04em] text-[#f2f7f4]">
        {value}
      </p>
      <p className="text-[11px] text-[#6e8d81]">{note}</p>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center gap-3 rounded-2xl border border-[#1c3930] bg-[#0d1b18] text-sm text-[#8ba69b]">
      <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ee6be]" />
      {label}
    </div>
  );
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [riskFilter, setRiskFilter] = useState<"all" | "urgent" | "high">(
    "all"
  );
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
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
    { enabled, retry: false }
  );
  const recommendations = trpc.analytics.recommendations.useQuery(
    { page: 1, pageSize: 5 },
    { enabled, retry: false }
  );
  const detail = trpc.analytics.customerDetail.useQuery(
    { customerId: selectedCustomer ?? 1 },
    { enabled: enabled && selectedCustomer !== null, retry: false }
  );
  const analyst = trpc.analyst.ask.useMutation({
    onSuccess: result => {
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
            "The grounded analyst could not answer. No unsupported answer was generated.",
        },
      ]);
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
      <div className="flex min-h-screen items-center justify-center bg-[#07110f] text-sm text-[#8ba69b]">
        Checking workspace access…
      </div>
    );
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07110f] px-6 text-center text-[#f2f7f4]">
        <div className="max-w-md">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#8ee6be] text-[#062018]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold">
            Sign in to Revenue Intelligence
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#8ba69b]">
            Phase 10 uses protected production APIs backed by the verified
            customer, model, explanation, value, and recommendation records.
          </p>
          <button
            onClick={() => startLogin()}
            className="mt-6 rounded-xl bg-[#8ee6be] px-5 py-3 text-sm font-bold text-[#062018] transition hover:bg-[#a8f0cb]"
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
    <div className="min-h-screen bg-[#07110f] text-[#f2f7f4]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[238px] border-r border-[#19352d] bg-[#091612] lg:flex lg:flex-col">
        <div className="flex h-[78px] items-center gap-3 border-b border-[#19352d] px-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#8ee6be] text-[#062018]">
            <Activity className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-display text-[15px] font-bold">
              pulseboard
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[.19em] text-[#648a7b]">
              Revenue intelligence
            </span>
          </span>
        </div>
        <nav className="space-y-1 px-3 py-7" aria-label="Main navigation">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-[#547567]">
            Workspace
          </p>
          <a
            href="#overview"
            className="flex items-center gap-3 rounded-xl bg-[#16352b] px-3 py-2.5 text-sm font-semibold text-[#a7f0ca]"
          >
            <Activity className="h-[17px] w-[17px]" />
            Overview
          </a>
          <a
            href="#customers"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#8ba69b] hover:bg-[#10251f]"
          >
            <UsersRound className="h-[17px] w-[17px]" />
            Customers
          </a>
          <a
            href="#recommendations"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#8ba69b] hover:bg-[#10251f]"
          >
            <Sparkles className="h-[17px] w-[17px]" />
            Actions
          </a>
          <a
            href="#metadata"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#8ba69b] hover:bg-[#10251f]"
          >
            <Database className="h-[17px] w-[17px]" />
            Data & model
          </a>
        </nav>
        <div className="mt-auto border-t border-[#19352d] p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#d69a77] text-xs font-bold text-[#2a1712]">
              {(user.name ?? "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[#d9eee4]">
                {user.name ?? "Workspace user"}
              </p>
              <p className="truncate text-[11px] text-[#6e8d81]">{user.role}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[238px]">
        <header className="sticky top-0 z-30 flex h-[78px] items-center justify-between border-b border-[#19352d] bg-[#07110f]/95 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNav(!mobileNav)}
              className="rounded-lg p-2 text-[#8ba69b] hover:bg-[#132822] lg:hidden"
              aria-label="Toggle navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="font-display text-lg font-semibold tracking-[-.03em]">
                Good morning{user.name ? `, ${user.name.split(" ")[0]}` : ""}{" "}
                <span className="hidden text-[#8ee6be] sm:inline">
                  — here’s the pulse.
                </span>
              </p>
              <p className="mt-0.5 text-xs text-[#6e8d81]">
                Production workspace · protected API data
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-lg border border-[#24453a] bg-[#0d1b18] px-3 py-2 text-[11px] font-semibold text-[#8ee6be] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8ee6be]" /> Real
            records
          </div>
        </header>
        {mobileNav && (
          <div className="absolute inset-x-0 top-[78px] z-20 border-b border-[#19352d] bg-[#0b1915] p-4 shadow-2xl lg:hidden">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[.18em] text-[#547567]">
              Workspace{" "}
              <button
                onClick={() => setMobileNav(false)}
                aria-label="Close navigation"
              >
                <X className="h-4 w-4 text-[#8ba69b]" />
              </button>
            </div>
            {["Overview", "Customers", "Actions", "Data & model"].map(item => (
              <a
                key={item}
                href={`#${item === "Overview" ? "overview" : item === "Customers" ? "customers" : item === "Actions" ? "recommendations" : "metadata"}`}
                onClick={() => setMobileNav(false)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-[#8ba69b]"
              >
                {item}
              </a>
            ))}
          </div>
        )}

        <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 sm:py-9">
          <section
            id="overview"
            className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
          >
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2c614d] bg-[#11281f] px-2 py-1 text-[10px] font-bold uppercase tracking-[.15em] text-[#8ee6be]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#8ee6be]" />{" "}
                  Production data
                </span>
                <span className="text-[11px] text-[#6e8d81]">
                  30-day behavioral horizon · cutoff{" "}
                  {formatDate(metadata?.cutoffAt ?? null)}
                </span>
              </div>
              <h1 className="font-display text-[30px] font-semibold tracking-[-.055em] sm:text-[36px]">
                Retention overview
              </h1>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#8ba69b]">
                Prioritize customers using verified churn risk, customer value,
                revenue exposure, and explainable signals.
              </p>
            </div>
          </section>

          {overview.isLoading ? (
            <LoadingState label="Loading executive intelligence…" />
          ) : overview.isError || !summary ? (
            <div className="rounded-2xl border border-[#6b3838] bg-[#321d20] p-5 text-sm text-[#ffaaa0]">
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
                accent="bg-[#8ee6be]"
              />
              <MetricCard
                title="Average churn risk"
                value={`${Math.round(summary.averageChurnProbability * 100)}%`}
                note="Calibrated probability"
                accent="bg-[#ffaaa0]"
              />
              <MetricCard
                title="Revenue at risk"
                value={formatCurrency(summary.totalRevenueAtRisk, true)}
                note="Model-derived exposure"
                accent="bg-[#f7c978]"
              />
              <MetricCard
                title="Behavioral CLV"
                value={formatCurrency(summary.totalBehavioralClv, true)}
                note="Signed historical + forward value"
                accent="bg-[#8cc6ff]"
              />
            </section>
          )}

          <section
            id="analyst"
            className="mt-5 rounded-2xl border border-[#1c3930] bg-[#0d1b18] p-5 shadow-[0_16px_45px_rgba(0,0,0,.12)] sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-[17px] font-semibold">
                    Grounded AI analyst
                  </h2>
                  <span className="rounded-full border border-[#2c614d] bg-[#11281f] px-2 py-1 text-[10px] font-bold uppercase tracking-[.13em] text-[#8ee6be]">
                    Read only
                  </span>
                </div>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-[#6e8d81]">
                  Answers use approved production records and include scope,
                  cutoff, and model provenance. No intervention uplift is
                  inferred.
                </p>
              </div>
              <BrainCircuit className="h-5 w-5 text-[#8ee6be]" />
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
              className="border-[#203e34] bg-[#091612]"
            />
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
            <div
              id="recommendations"
              className="rounded-2xl border border-[#1c3930] bg-[#0d1b18] p-5 shadow-[0_16px_45px_rgba(0,0,0,.12)] sm:p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-[17px] font-semibold">
                    Priority distribution
                  </h2>
                  <p className="mt-1 text-xs text-[#6e8d81]">
                    Recommendations grouped by verified priority
                  </p>
                </div>
                <Sparkles className="h-4 w-4 text-[#8ee6be]" />
              </div>
              <div className="mt-6 space-y-5">
                {priorityBands.map(band => (
                  <div key={band.priorityBand}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#d9eee4]">
                        {band.priorityBand}
                      </span>
                      <span className="text-xs text-[#8ba69b]">
                        {formatNumber(band.customerCount)} ·{" "}
                        {formatCurrency(band.revenueAtRisk, true)} exposed
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#173129]">
                      <div
                        className={`h-full rounded-full ${band.priorityBand === "Urgent" ? "bg-[#ffaaa0]" : band.priorityBand === "High" ? "bg-[#f7c978]" : "bg-[#8ee6be]"}`}
                        style={{
                          width: `${summary ? Math.min(100, (band.customerCount / summary.customerCount) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl border border-[#264c3e] bg-[#10251e] p-3.5 text-[11px] leading-5 text-[#9bbcaf]">
                Risk and value are model outputs. Recommendations do not claim
                experimental uplift or guaranteed savings.
              </div>
            </div>
            <div className="rounded-2xl border border-[#1c3930] bg-[#0d1b18] p-5 shadow-[0_16px_45px_rgba(0,0,0,.12)] sm:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-[17px] font-semibold">
                    Next best actions
                  </h2>
                  <p className="mt-1 text-xs text-[#6e8d81]">
                    Highest-priority persisted recommendations
                  </p>
                </div>
                <BrainCircuit className="h-4 w-4 text-[#8cc6ff]" />
              </div>
              {recommendations.isLoading ? (
                <div className="mt-6 text-sm text-[#8ba69b]">
                  Loading actions…
                </div>
              ) : recommendations.isError ? (
                <div className="mt-6 text-sm text-[#ffaaa0]">
                  Recommendations unavailable.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {recommendations.data?.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedCustomer(item.customerId)}
                      className="w-full rounded-xl border border-[#203e34] bg-[#0a1713] p-3 text-left transition hover:border-[#477766]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-semibold text-[#d9eee4]">
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
                      <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[#8ba69b]">
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
            className="mt-5 rounded-2xl border border-[#1c3930] bg-[#0d1b18] shadow-[0_16px_45px_rgba(0,0,0,.12)]"
          >
            <div className="flex flex-col gap-4 border-b border-[#19352d] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-[17px] font-semibold">
                    Priority customers
                  </h2>
                  <span className="rounded-md bg-[#1b352b] px-1.5 py-0.5 text-[10px] font-bold text-[#8ee6be]">
                    {customers.data?.total ?? 0} total
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#6e8d81]">
                  Search and page through real recommendation records
                </p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#648a7b]" />
                <input
                  aria-label="Search customers"
                  value={searchDraft}
                  onChange={event => setSearchDraft(event.target.value)}
                  placeholder="Search customer or country"
                  className="h-9 w-[210px] rounded-lg border border-[#24453a] bg-[#091612] pl-8 pr-3 text-xs text-[#d9eee4] outline-none placeholder:text-[#5f8174] focus:border-[#5b917b]"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-[#19352d] px-5 py-3 sm:px-6">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[.15em] text-[#547567]">
                Risk
              </span>
              {(["all", "urgent", "high"] as const).map(filter => (
                <button
                  key={filter}
                  onClick={() => {
                    setRiskFilter(filter);
                    setPage(1);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold capitalize ${riskFilter === filter ? "bg-[#8ee6be] text-[#062018]" : "bg-[#142820] text-[#8ba69b] hover:bg-[#1b3930]"}`}
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
                <div className="p-8 text-sm text-[#ffaaa0]">
                  Customer records are temporarily unavailable. No synthetic
                  fallback is shown.
                </div>
              ) : (
                <table className="w-full min-w-[850px] text-left">
                  <thead>
                    <tr className="border-b border-[#19352d] text-[10px] font-bold uppercase tracking-[.15em] text-[#547567]">
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
                        className="group cursor-pointer border-b border-[#162f27] text-xs transition last:border-0 hover:bg-[#10231d]"
                      >
                        <td className="px-5 py-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1d4033] text-[10px] font-bold text-[#a7f0ca]">
                              {item.sourceCustomerId.slice(-2)}
                            </div>
                            <div>
                              <p className="font-semibold text-[#e5f1eb]">
                                Customer {item.sourceCustomerId}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[#6e8d81]">
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
                          <p className="font-semibold tabular-nums text-[#e5f1eb]">
                            {formatCurrency(item.revenueAtRisk)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#6e8d81]">
                            CLV {formatCurrency(item.behavioralClv, true)}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-1.5 text-[#8ee6be]">
                            <Sparkles className="h-3.5 w-3.5" />
                            {item.recommendedAction}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-[#8ba69b]">
                          {formatDate(item.lastActivityAt)}
                        </td>
                        <td className="px-4 py-4">
                          <ChevronRight className="h-4 w-4 text-[#4d7565] transition group-hover:translate-x-0.5 group-hover:text-[#8ee6be]" />
                        </td>
                      </tr>
                    ))}
                    {customers.data?.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-12 text-center text-sm text-[#6e8d81]"
                        >
                          No customers match these filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-[#19352d] px-5 py-3 text-xs text-[#8ba69b] sm:px-6">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage(value => Math.max(1, value - 1))}
                  className="rounded-lg border border-[#24453a] p-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  aria-label="Next page"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage(value => Math.min(totalPages, value + 1))
                  }
                  className="rounded-lg border border-[#24453a] p-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </section>

          <section
            id="metadata"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#1c3930] bg-[#0d1b18] px-5 py-4 text-[11px] text-[#8ba69b] sm:px-6"
          >
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#8ee6be]" />
              <span>Dataset: {metadata?.datasetName ?? "Unavailable"}</span>
              <span className="text-[#355a4d]">·</span>
              <span>Model: {metadata?.modelVersion ?? "Unavailable"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>
                Feature version: {metadata?.featureVersion ?? "Unavailable"}
              </span>
              <span className="text-[#355a4d]">·</span>
              <span>Cutoff: {formatDate(metadata?.cutoffAt ?? null)}</span>
            </div>
          </section>
        </main>
      </div>

      {selectedCustomer !== null && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="Customer detail"
        >
          <button
            className="absolute inset-0 cursor-default"
            aria-label="Close customer detail"
            onClick={() => setSelectedCustomer(null)}
          />
          <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-[#315b4d] bg-[#091612] p-5 shadow-2xl sm:p-7">
            {detail.isLoading ? (
              <LoadingState label="Loading customer intelligence…" />
            ) : detail.isError || !detail.data ? (
              <div className="text-sm text-[#ffaaa0]">
                Customer detail is unavailable.
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#547567]">
                      Customer detail
                    </p>
                    <h2 className="mt-2 font-display text-2xl font-semibold">
                      Customer {detail.data.customer.sourceCustomerId}
                    </h2>
                    <p className="mt-1 text-sm text-[#8ba69b]">
                      {detail.data.customer.country ?? "Country not recorded"} ·
                      last activity{" "}
                      {formatDate(detail.data.customer.lastActivityAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    aria-label="Close detail"
                    className="rounded-lg p-2 text-[#8ba69b] hover:bg-[#132822]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[#203e34] bg-[#0d1b18] p-4">
                    <p className="text-[11px] text-[#6e8d81]">
                      Churn probability
                    </p>
                    <p className="mt-2 font-display text-2xl font-semibold text-[#ffaaa0]">
                      {Math.round(
                        detail.data.predictionAndValue
                          .calibratedChurnProbability * 100
                      )}
                      %
                    </p>
                    <p className="mt-1 text-[10px] text-[#6e8d81]">
                      {detail.data.predictionAndValue.predictionVersion}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#203e34] bg-[#0d1b18] p-4">
                    <p className="text-[11px] text-[#6e8d81]">
                      Revenue at risk
                    </p>
                    <p className="mt-2 font-display text-2xl font-semibold text-[#f7c978]">
                      {formatCurrency(
                        detail.data.predictionAndValue.revenueAtRisk,
                        true
                      )}
                    </p>
                    <p className="mt-1 text-[10px] text-[#6e8d81]">
                      Behavioral CLV{" "}
                      {formatCurrency(
                        detail.data.predictionAndValue.behavioralClv,
                        true
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-5 rounded-xl border border-[#2c614d] bg-[#10251e] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[#d9eee4]">
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
                  <p className="mt-3 text-sm leading-6 text-[#b4cec2]">
                    {detail.data.recommendation.rationale}
                  </p>
                  <p className="mt-3 text-[11px] text-[#6e8d81]">
                    {detail.data.recommendation.benefitEvidence}
                  </p>
                </div>
                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-semibold">
                      SHAP explanations
                    </h3>
                    <span className="text-[10px] text-[#6e8d81]">
                      Actual persisted contributions
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {detail.data.explanations.map(explanation => (
                      <div
                        key={`${explanation.featureName}-${explanation.rank}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#203e34] bg-[#0d1b18] px-3 py-2.5 text-xs"
                      >
                        <span className="truncate text-[#d9eee4]">
                          {explanation.featureName}
                        </span>
                        <span
                          className={
                            explanation.shapValue >= 0
                              ? "text-[#ffaaa0]"
                              : "text-[#8ee6be]"
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
                    <span className="text-[#6e8d81]">Orders</span>
                    <p className="mt-1 font-semibold">
                      {formatNumber(detail.data.features.totalOrders)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#6e8d81]">Inactive days</span>
                    <p className="mt-1 font-semibold">
                      {formatNumber(detail.data.features.inactiveDays)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#6e8d81]">Net value</span>
                    <p className="mt-1 font-semibold">
                      {formatCurrency(detail.data.features.totalNetValue)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#6e8d81]">Return rate</span>
                    <p className="mt-1 font-semibold">
                      {(detail.data.features.returnRate * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="mt-6 border-t border-[#19352d] pt-4 text-[10px] leading-5 text-[#648a7b]">
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
    </div>
  );
}
