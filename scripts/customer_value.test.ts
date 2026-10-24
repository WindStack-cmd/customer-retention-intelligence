import { describe, expect, it } from "vitest";
import { calculateCustomerValue } from "./customer_value";

describe("customer value methodology", () => {
  const base = {
    historicalGrossRevenue: 1000,
    historicalNetRevenue: 900,
    returnValue: -100,
    orderCount: 10,
    averageOrderValue: 90,
    purchaseFrequency: 2,
    lifetimeActivityDays: 120,
    calibratedChurnProbability: 0.25,
  };

  it("calculates purchase-based expected value and revenue at risk", () => {
    const value = calculateCustomerValue(base);
    expect(value.expectedFutureValue).toBe(540);
    expect(value.revenueAtRisk).toBe(135);
    expect(value.behavioralClv).toBe(1305);
  });

  it("uses the configured horizon proportionally", () => {
    const value = calculateCustomerValue({ ...base, horizonDays: 30 });
    expect(value.expectedFutureValue).toBe(180);
    expect(value.revenueAtRisk).toBe(45);
  });

  it("keeps returns in signed historical net revenue and excludes them from gross", () => {
    const value = calculateCustomerValue(base);
    expect(value.historicalGrossRevenue).toBeGreaterThanOrEqual(0);
    expect(value.historicalNetRevenue).toBe(
      value.historicalGrossRevenue + value.returnValue
    );
    expect(value.returnValue).toBeLessThanOrEqual(0);
  });

  it("has zero revenue at risk when calibrated churn is zero", () => {
    const value = calculateCustomerValue({
      ...base,
      calibratedChurnProbability: 0,
    });
    expect(value.revenueAtRisk).toBe(0);
    expect(value.behavioralClv).toBe(1440);
  });

  it("rejects invalid probabilities and impossible revenue semantics", () => {
    expect(() =>
      calculateCustomerValue({ ...base, calibratedChurnProbability: 1.1 })
    ).toThrow(/Probability|probability/);
    expect(() => calculateCustomerValue({ ...base, returnValue: 1 })).toThrow(
      /returnValue/
    );
  });

  it("is deterministic on repeated evaluation", () => {
    expect(calculateCustomerValue(base)).toEqual(calculateCustomerValue(base));
  });
});
