import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, riskFilterToApiInput } from "./homeData";

describe("Phase 10 dashboard data contracts", () => {
  it("formats the real dataset currency as GBP without fabricated USD labels", () => {
    expect(formatCurrency(8300065.81, true)).toBe("£8.30M");
    expect(formatCurrency(218.4)).toBe("£218");
  });

  it("renders persisted dates and an explicit empty state", () => {
    expect(formatDate("2011-11-09T23:59:59.000Z")).toContain("2011");
    expect(formatDate(null)).toBe("—");
  });

  it("maps UI risk filters to bounded API inputs", () => {
    expect(riskFilterToApiInput("all")).toEqual({ minRisk: undefined });
    expect(riskFilterToApiInput("high")).toEqual({ minRisk: 0.65 });
    expect(riskFilterToApiInput("urgent")).toEqual({ minRisk: 0.8 });
  });
});
