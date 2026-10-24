export function formatCurrency(value: number, compact = false) {
  if (compact && Math.abs(value) >= 1_000_000)
    return `£${(value / 1_000_000).toFixed(2)}M`;
  if (compact && Math.abs(value) >= 1_000)
    return `£${Math.round(value / 1_000)}k`;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
    new Date(value)
  );
}

export function riskFilterToApiInput(filter: "all" | "urgent" | "high") {
  return {
    minRisk: filter === "urgent" ? 0.8 : filter === "high" ? 0.65 : undefined,
  };
}
