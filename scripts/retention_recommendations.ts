export const RECOMMENDATION_METHODOLOGY_VERSION = "retention-rules-v1";
export const RATIONALE_VERSION = "retention-rationale-v1";

export type ShapSignal = {
  featureName: string;
  featureValue: number;
  shapValue: number;
  contributionDirection: string;
  rank: number;
  isMissing: boolean;
};

export type RecommendationInput = {
  customerId: number;
  calibratedChurnProbability: number;
  behavioralClv: number;
  revenueAtRisk: number;
  expectedFutureValue: number;
  historicalNetRevenue: number;
  orderCount: number;
  purchaseFrequency: number;
  inactiveDays: number;
  returnRate: number;
  cancellationRate: number;
  topShapSignal?: ShapSignal;
  valueRank: number;
  riskRank: number;
  revenueRiskRank: number;
};

export type Recommendation = {
  priorityScore: number;
  priorityBand: "Urgent" | "High" | "Monitor";
  recommendedAction: string;
  rationale: string;
  supportingSignals: Record<string, unknown>;
  interventionCost: null;
  expectedBenefit: null;
  benefitEvidence: string;
};

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
  return value;
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function signalClass(
  featureName: string
): "engagement" | "service" | "value" | "other" {
  const name = featureName.toLowerCase();
  if (
    /(inactive|dayssincelastpurchase|purchaseslast|orderslast|purchasefrequency|recentvsprevious|customerage)/.test(
      name
    )
  )
    return "engagement";
  if (/(return|cancel|variance)/.test(name)) return "service";
  if (
    /(revenue|value|averageordervalue|productdiversity|uniqueproducts)/.test(
      name
    )
  )
    return "value";
  return "other";
}

export function buildRecommendation(
  input: RecommendationInput
): Recommendation {
  const risk = finite(
    input.calibratedChurnProbability,
    "calibratedChurnProbability"
  );
  const behavioralClv = finite(input.behavioralClv, "behavioralClv");
  const revenueAtRisk = finite(input.revenueAtRisk, "revenueAtRisk");
  const expectedFutureValue = finite(
    input.expectedFutureValue,
    "expectedFutureValue"
  );
  const riskRank = finite(input.riskRank, "riskRank");
  const revenueRiskRank = finite(input.revenueRiskRank, "revenueRiskRank");
  const valueRank = finite(input.valueRank, "valueRank");
  if (risk < 0 || risk > 1)
    throw new Error("calibratedChurnProbability must be in [0, 1]");
  if (revenueAtRisk < 0 || expectedFutureValue < 0)
    throw new Error("forward value signals cannot be negative");
  for (const [name, rank] of [
    ["riskRank", riskRank],
    ["revenueRiskRank", revenueRiskRank],
    ["valueRank", valueRank],
  ] as const) {
    if (rank < 0 || rank > 1) throw new Error(`${name} must be in [0, 1]`);
  }

  // Risk is important, but value and exposed future revenue make up 55% of the score.
  const priorityScore = round(
    100 * (0.45 * risk + 0.35 * revenueRiskRank + 0.2 * valueRank)
  );
  const priorityBand =
    priorityScore >= 75 ? "Urgent" : priorityScore >= 50 ? "High" : "Monitor";
  const signal = input.topShapSignal;
  const kind = signal ? signalClass(signal.featureName) : "other";
  const recommendedAction =
    priorityBand === "Monitor"
      ? "Monitor account"
      : kind === "engagement"
        ? "Personalized re-engagement"
        : kind === "service"
          ? "Service follow-up"
          : kind === "value"
            ? "Relevant offer review"
            : "Customer health review";

  const signalText = signal
    ? `${signal.featureName} (${signal.isMissing ? "missing/imputed" : `value ${round(signal.featureValue, 2)}`}, SHAP ${round(signal.shapValue, 4)})`
    : "no persisted positive SHAP driver available";
  const rationale = `${priorityBand} priority from calibrated churn risk ${(risk * 100).toFixed(1)}%, revenue at risk ${revenueAtRisk.toFixed(2)}, and behavioral CLV ${behavioralClv.toFixed(2)}. Leading model signal: ${signalText}. This is a risk-based next action, not evidence that an intervention will cause retention.`;
  const supportingSignals = {
    customerId: input.customerId,
    calibratedChurnProbability: round(risk, 8),
    behavioralClv: round(behavioralClv, 2),
    revenueAtRisk: round(revenueAtRisk, 2),
    expectedFutureValue: round(expectedFutureValue, 2),
    historicalNetRevenue: round(input.historicalNetRevenue, 2),
    orderCount: input.orderCount,
    purchaseFrequency: round(input.purchaseFrequency, 6),
    inactiveDays: input.inactiveDays,
    returnRate: round(input.returnRate, 6),
    cancellationRate: round(input.cancellationRate, 6),
    riskRank: round(riskRank),
    revenueRiskRank: round(revenueRiskRank),
    valueRank: round(valueRank),
    topShapSignal: signal ?? null,
    scoreWeights: { churnRisk: 0.45, revenueAtRiskRank: 0.35, valueRank: 0.2 },
  };
  return {
    priorityScore,
    priorityBand,
    recommendedAction,
    rationale,
    supportingSignals,
    interventionCost: null,
    expectedBenefit: null,
    benefitEvidence:
      "No experimental uplift, treatment effect, offer cost, or guaranteed savings available; benefit not estimated.",
  };
}

export function percentileRanks(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map(value => {
    let index = 0;
    while (index < sorted.length && sorted[index] <= value) index += 1;
    return sorted.length === 1 ? 1 : round((index - 1) / (sorted.length - 1));
  });
}
