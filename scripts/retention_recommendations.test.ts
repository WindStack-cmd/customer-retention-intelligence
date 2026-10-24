import { describe, expect, it } from "vitest";
import {
  buildRecommendation,
  percentileRanks,
} from "./retention_recommendations";

const base = {
  customerId: 7,
  calibratedChurnProbability: 0.8,
  behavioralClv: 1000,
  revenueAtRisk: 400,
  expectedFutureValue: 500,
  historicalNetRevenue: 900,
  orderCount: 10,
  purchaseFrequency: 2,
  inactiveDays: 45,
  returnRate: 0.1,
  cancellationRate: 0.05,
  valueRank: 0.8,
  riskRank: 0.9,
  revenueRiskRank: 0.95,
};

describe("retention recommendation engine", () => {
  it("prioritizes revenue exposure and value in addition to risk", () => {
    const highValue = buildRecommendation(base);
    const lowValue = buildRecommendation({
      ...base,
      behavioralClv: 100,
      revenueAtRisk: 20,
      valueRank: 0.1,
      revenueRiskRank: 0.1,
    });
    expect(highValue.priorityScore).toBeGreaterThan(lowValue.priorityScore);
    expect(highValue.priorityBand).toBe("Urgent");
  });

  it("uses a persisted SHAP engagement signal for the action and rationale", () => {
    const result = buildRecommendation({
      ...base,
      topShapSignal: {
        featureName: "daysSinceLastPurchase",
        featureValue: 62,
        shapValue: 1.2,
        contributionDirection: "increases_risk",
        rank: 1,
        isMissing: false,
      },
    });
    expect(result.recommendedAction).toBe("Personalized re-engagement");
    expect(result.rationale).toContain("daysSinceLastPurchase");
  });

  it("handles missing SHAP data without inventing a driver", () => {
    const result = buildRecommendation({ ...base, topShapSignal: undefined });
    expect(result.recommendedAction).toBe("Customer health review");
    expect(result.supportingSignals.topShapSignal).toBeNull();
    expect(result.rationale).toContain("no persisted positive SHAP driver");
  });

  it("does not claim intervention benefit or invent costs", () => {
    const result = buildRecommendation(base);
    expect(result.interventionCost).toBeNull();
    expect(result.expectedBenefit).toBeNull();
    expect(result.benefitEvidence).toContain("No experimental uplift");
  });

  it("rejects invalid risk and value inputs", () => {
    expect(() =>
      buildRecommendation({ ...base, calibratedChurnProbability: 1.2 })
    ).toThrow();
    expect(() => buildRecommendation({ ...base, revenueAtRisk: -1 })).toThrow();
  });

  it("preserves signed negative CLV for return-heavy customers", () => {
    const result = buildRecommendation({
      ...base,
      behavioralClv: -120,
      historicalNetRevenue: -300,
    });
    expect(result.supportingSignals.behavioralClv).toBe(-120);
  });

  it("produces deterministic percentile ranks", () => {
    expect(percentileRanks([10, 20, 20, 40])).toEqual([
      0, 0.666667, 0.666667, 1,
    ]);
    expect(percentileRanks([5])).toEqual([1]);
  });
});
