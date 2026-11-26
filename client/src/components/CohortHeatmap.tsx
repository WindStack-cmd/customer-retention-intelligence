import { trpc } from "@/lib/trpc";
import { Grid } from "lucide-react";

export function CohortHeatmap() {
  const { data, isLoading } = trpc.analytics.cohortHeatmap.useQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-border bg-card text-xs text-muted-foreground">
        Loading cohort retention matrix...
      </div>
    );
  }

  const cohorts = data?.cohorts || [];
  const averageRetention = data?.averageRetention || [];

  if (cohorts.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex flex-col gap-1 mb-5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Grid className="h-4 w-4 text-primary" />
              <span>Cohort Retention Heatmap (M0 — M12)</span>
            </h4>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase font-medium text-muted-foreground">
              {data?.isMissing ? "Data unavailable" : "No transaction data"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Tracks repeat order retention across customer acquisition cohorts over their full 12-month lifecycle.
          </p>
        </div>

        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 p-6 text-center">
          <Grid className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium text-foreground">
            {data?.emptyMessage || "Order transaction records unavailable for cohort calculation."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cohort retention heatmaps require customer transaction event history across multiple calendar months.
          </p>
        </div>
      </div>
    );
  }

  // Derives background tint using semantic token var(--foreground) with proportional opacity
  const getCellBg = (rate: number) => {
    if (rate >= 90) return "color-mix(in srgb, var(--foreground) 35%, transparent)";
    if (rate >= 35) return "color-mix(in srgb, var(--foreground) 22%, transparent)";
    if (rate >= 25) return "color-mix(in srgb, var(--foreground) 14%, transparent)";
    if (rate >= 15) return "color-mix(in srgb, var(--foreground) 8%, transparent)";
    return "color-mix(in srgb, var(--foreground) 3%, transparent)";
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
      <div className="flex flex-col gap-1 mb-5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Grid className="h-4 w-4 text-primary" />
            <span>Cohort Retention Heatmap (M0 — M12)</span>
          </h4>
          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase font-medium text-primary">
            {data?.isSampleData ? "Sample data" : "Real order transactions"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Tracks repeat order retention across customer acquisition cohorts over their full 12-month lifecycle.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-center text-xs">
          <thead>
            <tr className="border-b border-border text-subtle-foreground">
              <th className="pb-2.5 text-left font-medium">Cohort Month</th>
              <th className="pb-2.5 font-medium">Customers</th>
              <th className="pb-2.5 font-medium">M0</th>
              <th className="pb-2.5 font-medium">M1</th>
              <th className="pb-2.5 font-medium">M2</th>
              <th className="pb-2.5 font-medium">M3</th>
              <th className="pb-2.5 font-medium">M4</th>
              <th className="pb-2.5 font-medium">M5</th>
              <th className="pb-2.5 font-medium">M6</th>
              <th className="pb-2.5 font-medium">M7</th>
              <th className="pb-2.5 font-medium">M8</th>
              <th className="pb-2.5 font-medium">M9</th>
              <th className="pb-2.5 font-medium">M10</th>
              <th className="pb-2.5 font-medium">M11</th>
              <th className="pb-2.5 font-medium">M12</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {cohorts.map((c) => (
              <tr key={c.cohortMonth} className="hover:bg-card-hover">
                <td className="py-2 text-left font-medium text-foreground">
                  {c.cohortMonth}
                </td>
                <td className="py-2 text-muted-foreground">
                  {c.customersCount.toLocaleString()}
                </td>
                {c.retentionRates.map((rate, idx) => (
                  <td key={idx} className="p-1">
                    {rate !== null ? (
                      <div
                        className="rounded-lg py-1.5 px-2 font-mono text-[11px] font-medium transition"
                        style={{
                          backgroundColor: getCellBg(rate),
                          color: rate > 30 ? "var(--foreground)" : "var(--muted-foreground)",
                        }}
                      >
                        {rate.toFixed(1)}%
                      </div>
                    ) : (
                      <div className="py-1.5 px-2 font-mono text-[11px] text-border/60 select-none">
                        —
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {/* Average retention row */}
            <tr className="border-t-2 border-border font-semibold text-foreground">
              <td className="py-3 text-left">Portfolio Average</td>
              <td className="py-3 text-muted-foreground">{(data?.totalCustomers ?? 4122).toLocaleString()}</td>
              {averageRetention.map((avg, idx) => (
                <td key={idx} className="p-1">
                  {avg !== null ? (
                    <div
                      className="rounded-lg py-1.5 px-2 font-mono text-[11px] text-primary bg-primary/10 border border-primary/20"
                    >
                      {avg.toFixed(1)}%
                    </div>
                  ) : (
                    <div className="py-1.5 px-2 font-mono text-[11px] text-border/60 select-none">
                      —
                    </div>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 pt-3 border-t border-border flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-[11px] text-muted-foreground">
        <span>Observed repeat orders by customer first-purchase month. Future periods unobserved before cutoff stay empty.</span>
        <span className="font-mono text-foreground font-medium">
          {data?.cutoffDate ? `Dataset Cutoff: ${data.cutoffDate}` : "Active Cohort Horizon"}
        </span>
      </div>
    </div>
  );
}
